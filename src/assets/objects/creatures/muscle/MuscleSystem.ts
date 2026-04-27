import * as THREE from 'three';

/**
 * Procedural Muscle Simulation System
 * Implements simplified muscle fiber simulation for creature animation
 */

export interface MuscleConfig {
  stiffness: number;
  damping: number;
  activationSpeed: number;
  relaxationSpeed: number;
  maxContraction: number;
}

export interface MuscleFiber {
  origin: THREE.Vector3;
  insertion: THREE.Vector3;
  restLength: number;
  currentLength: number;
  activation: number; // 0-1
  force: number;
  direction: THREE.Vector3;
}

export interface MuscleGroup {
  name: string;
  fibers: MuscleFiber[];
  boneA: string;
  boneB: string;
}

export class MuscleSystem {
  private muscles: MuscleGroup[] = [];
  private config: MuscleConfig;
  private enabled: boolean = true;

  constructor(config: Partial<MuscleConfig> = {}) {
    this.config = {
      stiffness: 100,
      damping: 5,
      activationSpeed: 10,
      relaxationSpeed: 5,
      maxContraction: 0.3,
      ...config,
    };
  }

  public addMuscleGroup(
    name: string,
    boneA: string,
    boneB: string,
    fiberCount: number = 10
  ): void {
    const fibers: MuscleFiber[] = [];

    // Generate muscle fibers between attachment points
    for (let i = 0; i < fiberCount; i++) {
      const t = i / fiberCount;
      
      // Create slightly varied attachment points for realistic muscle shape
      const spread = 0.1;
      const origin = new THREE.Vector3(
        t * spread - spread / 2,
        0,
        Math.sin(t * Math.PI) * spread
      );
      
      const insertion = new THREE.Vector3(
        t * spread - spread / 2,
        1,
        Math.sin(t * Math.PI) * spread
      );

      const direction = insertion.clone().sub(origin).normalize();
      const restLength = origin.distanceTo(insertion);

      fibers.push({
        origin,
        insertion,
        restLength,
        currentLength: restLength,
        activation: 0,
        force: 0,
        direction,
      });
    }

    this.muscles.push({ name, fibers, boneA, boneB });
  }

  public update(dt: number, activations: Map<string, number>): void {
    if (!this.enabled) return;

    dt = Math.min(dt, 0.05);

    for (const muscle of this.muscles) {
      const targetActivation = activations.get(muscle.name) || 0;

      for (const fiber of muscle.fibers) {
        // Smooth activation/deactivation
        if (targetActivation > fiber.activation) {
          fiber.activation += (targetActivation - fiber.activation) * 
            this.config.activationSpeed * dt;
        } else {
          fiber.activation += (targetActivation - fiber.activation) * 
            this.config.relaxationSpeed * dt;
        }

        // Calculate contraction
        const contraction = fiber.activation * this.config.maxContraction;
        fiber.currentLength = fiber.restLength * (1 - contraction);

        // Calculate force based on activation and length
        const lengthRatio = fiber.currentLength / fiber.restLength;
        const passiveForce = Math.max(0, (lengthRatio - 1) * this.config.stiffness);
        const activeForce = fiber.activation * this.config.stiffness * 0.5;
        
        fiber.force = passiveForce + activeForce;
      }
    }
  }

  public getMuscleForce(muscleName: string): number {
    const muscle = this.muscles.find(m => m.name === muscleName);
    if (!muscle) return 0;

    return muscle.fibers.reduce((sum, fiber) => sum + fiber.force, 0) / muscle.fibers.length;
  }

  public getFiberDirections(muscleName: string): THREE.Vector3[] {
    const muscle = this.muscles.find(m => m.name === muscleName);
    if (!muscle) return [];

    return muscle.fibers.map(f => f.direction.clone());
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public reset(): void {
    for (const muscle of this.muscles) {
      for (const fiber of muscle.fibers) {
        fiber.activation = 0;
        fiber.force = 0;
        fiber.currentLength = fiber.restLength;
      }
    }
  }

  public visualize(scene: THREE.Scene): THREE.Group {
    const group = new THREE.Group();

    for (const muscle of this.muscles) {
      for (const fiber of muscle.fibers) {
        // Create cylinder for fiber visualization
        const length = fiber.currentLength;
        const geometry = new THREE.CylinderGeometry(0.01, 0.01, length, 4);
        
        // Color based on activation
        const r = 1 - fiber.activation * 0.5;
        const g = 0.2 + fiber.activation * 0.3;
        const b = 0.2;
        
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(r, g, b),
          transparent: true,
          opacity: 0.8,
        });

        const mesh = new THREE.Mesh(geometry, material);
        
        // Position at midpoint
        const midPoint = fiber.origin.clone().lerp(fiber.insertion, 0.5);
        mesh.position.copy(midPoint);
        
        // Orient along fiber direction
        mesh.lookAt(fiber.insertion);
        mesh.rotateX(Math.PI / 2);

        group.add(mesh);
      }
    }

    scene.add(group);
    return group;
  }

  public dispose(): void {
    // Cleanup resources if needed
  }
}

export default MuscleSystem;
