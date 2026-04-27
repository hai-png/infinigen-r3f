import * as THREE from 'three';

/**
 * Position-Based Dynamics Cloth Simulation
 * Implements real-time cloth simulation using PBD constraints
 */

export interface ClothConfig {
  width: number;
  height: number;
  segmentsX: number;
  segmentsY: number;
  mass: number;
  stiffness: number;
  damping: number;
  tearThreshold: number;
  enableTearing: boolean;
}

export interface ClothParticle {
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  originalPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  force: THREE.Vector3;
  mass: number;
  inverseMass: number;
  pinned: boolean;
}

export interface ClothConstraint {
  particleA: number;
  particleB: number;
  restLength: number;
  stiffness: number;
  active: boolean;
}

export class ClothSimulation {
  private particles: ClothParticle[] = [];
  private constraints: ClothConstraint[] = [];
  private geometry: THREE.BufferGeometry | null = null;
  private mesh: THREE.Mesh | null = null;
  private config: ClothConfig;
  private gravity: THREE.Vector3;
  private wind: THREE.Vector3;
  private enabled: boolean = true;

  constructor(config: Partial<ClothConfig> = {}) {
    this.config = {
      width: 2,
      height: 2,
      segmentsX: 20,
      segmentsY: 20,
      mass: 0.1,
      stiffness: 0.9,
      damping: 0.98,
      tearThreshold: 2.5,
      enableTearing: false,
      ...config,
    };

    this.gravity = new THREE.Vector3(0, -9.81, 0);
    this.wind = new THREE.Vector3(0, 0, 0);
    
    this.initializeCloth();
  }

  private initializeCloth(): void {
    const { width, height, segmentsX, segmentsY, mass } = this.config;
    const particles: ClothParticle[] = [];

    // Create particles
    for (let y = 0; y <= segmentsY; y++) {
      for (let x = 0; x <= segmentsX; x++) {
        const px = (x / segmentsX - 0.5) * width;
        const py = (y / segmentsY - 0.5) * height;
        const pz = 0;

        // Pin top edge
        const pinned = y === 0;

        particles.push({
          position: new THREE.Vector3(px, py, pz),
          previousPosition: new THREE.Vector3(px, py, pz),
          originalPosition: new THREE.Vector3(px, py, pz),
          velocity: new THREE.Vector3(0, 0, 0),
          force: new THREE.Vector3(0, 0, 0),
          mass: mass,
          inverseMass: pinned ? 0 : 1 / mass,
          pinned,
        });
      }
    }

    this.particles = particles;

    // Create structural constraints (horizontal and vertical)
    for (let y = 0; y <= segmentsY; y++) {
      for (let x = 0; x <= segmentsX; x++) {
        const idx = y * (segmentsX + 1) + x;

        // Horizontal constraint
        if (x < segmentsX) {
          const idxRight = y * (segmentsX + 1) + (x + 1);
          const dist = particles[idx].position.distanceTo(particles[idxRight].position);
          this.constraints.push({
            particleA: idx,
            particleB: idxRight,
            restLength: dist,
            stiffness: this.config.stiffness,
            active: true,
          });
        }

        // Vertical constraint
        if (y < segmentsY) {
          const idxBelow = (y + 1) * (segmentsX + 1) + x;
          const dist = particles[idx].position.distanceTo(particles[idxBelow].position);
          this.constraints.push({
            particleA: idx,
            particleB: idxBelow,
            restLength: dist,
            stiffness: this.config.stiffness,
            active: true,
          });
        }
      }
    }

    // Add shear constraints (diagonal)
    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        const idx = y * (segmentsX + 1) + x;
        const idxDiag1 = (y + 1) * (segmentsX + 1) + (x + 1);
        const idxDiag2 = (y + 1) * (segmentsX + 1) + x;
        const idxDiag3 = y * (segmentsX + 1) + (x + 1);

        const dist1 = particles[idx].position.distanceTo(particles[idxDiag1].position);
        const dist2 = particles[idxDiag2].position.distanceTo(particles[idxDiag3].position);

        this.constraints.push({
          particleA: idx,
          particleB: idxDiag1,
          restLength: dist1,
          stiffness: this.config.stiffness * 0.5,
          active: true,
        });

        this.constraints.push({
          particleA: idxDiag2,
          particleB: idxDiag3,
          restLength: dist2,
          stiffness: this.config.stiffness * 0.5,
          active: true,
        });
      }
    }

    // Create mesh geometry
    this.createMesh();
  }

  private createMesh(): void {
    const { segmentsX, segmentsY } = this.config;
    const geometry = new THREE.BufferGeometry();

    const vertices: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Initial vertex data
    for (const particle of this.particles) {
      vertices.push(particle.position.x, particle.position.y, particle.position.z);
      normals.push(0, 0, 1);
    }

    // UV coordinates
    for (let y = 0; y <= segmentsY; y++) {
      for (let x = 0; x <= segmentsX; x++) {
        uvs.push(x / segmentsX, y / segmentsY);
      }
    }

    // Index buffer for triangles
    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        const a = y * (segmentsX + 1) + x;
        const b = y * (segmentsX + 1) + (x + 1);
        const c = (y + 1) * (segmentsX + 1) + x;
        const d = (y + 1) * (segmentsX + 1) + (x + 1);

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    this.geometry = geometry;

    // Create cloth material with double-sided rendering
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      roughness: 0.7,
      metalness: 0.1,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  public update(dt: number): void {
    if (!this.enabled) return;

    dt = Math.min(dt, 0.05); // Clamp delta time
    const substeps = 5;
    const subDt = dt / substeps;

    for (let step = 0; step < substeps; step++) {
      this.integrateForces(subDt);
      this.integrateVerlet(subDt);
      this.satisfyConstraints(5);
      this.updateWind();
    }

    this.updateGeometry();
  }

  private integrateForces(dt: number): void {
    for (const particle of this.particles) {
      if (particle.pinned) continue;

      // Apply gravity
      particle.force.copy(this.gravity).multiplyScalar(particle.mass);

      // Apply wind
      particle.force.add(this.wind.clone().multiplyScalar(particle.mass * 0.5));

      // Apply damping
      particle.velocity.multiplyScalar(this.config.damping);
    }
  }

  private integrateVerlet(dt: number): void {
    for (const particle of this.particles) {
      if (particle.pinned) continue;

      const acceleration = particle.force.clone().multiplyScalar(particle.inverseMass);
      
      // Verlet integration
      const newPosition = particle.position
        .clone()
        .add(particle.position.clone().sub(particle.previousPosition).multiplyScalar(this.config.damping))
        .add(acceleration.multiplyScalar(dt * dt));

      particle.previousPosition.copy(particle.position);
      particle.position.copy(newPosition);

      // Update velocity
      particle.velocity.copy(particle.position.clone().sub(particle.previousPosition)).divideScalar(dt);
    }
  }

  private satisfyConstraints(iterations: number): void {
    for (let iter = 0; iter < iterations; iter++) {
      for (const constraint of this.constraints) {
        if (!constraint.active) continue;

        const pA = this.particles[constraint.particleA];
        const pB = this.particles[constraint.particleB];

        if (pA.pinned && pB.pinned) continue;

        const delta = pB.position.clone().sub(pA.position);
        const distance = delta.length();

        if (distance === 0) continue;

        // Check for tearing
        if (this.config.enableTearing && distance > constraint.restLength * this.config.tearThreshold) {
          constraint.active = false;
          continue;
        }

        const diff = (distance - constraint.restLength) / distance;
        const correction = delta.multiplyScalar(diff * 0.5 * constraint.stiffness);

        if (!pA.pinned) {
          pA.position.add(correction);
        }
        if (!pB.pinned) {
          pB.position.sub(correction);
        }
      }
    }
  }

  private updateWind(): void {
    // Simple time-varying wind
    const time = Date.now() * 0.001;
    this.wind.set(
      Math.sin(time) * 2,
      Math.cos(time * 0.5) * 1,
      Math.sin(time * 0.7) * 2
    );
  }

  private updateGeometry(): void {
    if (!this.geometry) return;

    const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const normals = this.geometry.getAttribute('normal') as THREE.BufferAttribute;

    // Update vertex positions
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      positions.setXYZ(i, p.position.x, p.position.y, p.position.z);
    }

    // Recalculate normals
    this.geometry.computeVertexNormals();

    positions.needsUpdate = true;
    normals.needsUpdate = true;
  }

  public getMesh(): THREE.Mesh | null {
    return this.mesh;
  }

  public setGravity(gravity: THREE.Vector3): void {
    this.gravity.copy(gravity);
  }

  public setWind(wind: THREE.Vector3): void {
    this.wind.copy(wind);
  }

  public pinPoint(index: number, pinned: boolean): void {
    if (index >= 0 && index < this.particles.length) {
      this.particles[index].pinned = pinned;
      this.particles[index].inverseMass = pinned ? 0 : 1 / this.config.mass;
    }
  }

  public reset(): void {
    for (const particle of this.particles) {
      particle.position.copy(particle.originalPosition);
      particle.previousPosition.copy(particle.originalPosition);
      particle.velocity.set(0, 0, 0);
      particle.force.set(0, 0, 0);
    }

    // Reactivate all constraints
    for (const constraint of this.constraints) {
      constraint.active = true;
    }

    this.updateGeometry();
  }

  public dispose(): void {
    if (this.geometry) {
      this.geometry.dispose();
    }
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
  }
}

export default ClothSimulation;
