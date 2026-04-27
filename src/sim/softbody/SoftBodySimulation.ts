import * as THREE from 'three';

/**
 * Position-Based Dynamics Soft Body Simulation
 * Implements real-time soft body deformation using PBD with volume constraints
 */

export interface SoftBodyConfig {
  mass: number;
  stiffness: number;
  damping: number;
  pressure: number;
  volumeStiffness: number;
  enablePressure: boolean;
}

export interface SoftBodyParticle {
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  originalPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  force: THREE.Vector3;
  mass: number;
  inverseMass: number;
  pinned: boolean;
}

export interface SoftBodyConstraint {
  particleA: number;
  particleB: number;
  restLength: number;
  stiffness: number;
  active: boolean;
}

export interface SoftBodyTetrahedron {
  indices: [number, number, number, number];
  restVolume: number;
}

export class SoftBodySimulation {
  private particles: SoftBodyParticle[] = [];
  private constraints: SoftBodyConstraint[] = [];
  private tetrahedra: SoftBodyTetrahedron[] = [];
  private geometry: THREE.BufferGeometry | null = null;
  private mesh: THREE.Mesh | null = null;
  private config: SoftBodyConfig;
  private gravity: THREE.Vector3;
  private enabled: boolean = true;

  constructor(config: Partial<SoftBodyConfig> = {}) {
    this.config = {
      mass: 0.1,
      stiffness: 0.8,
      damping: 0.95,
      pressure: 0.0,
      volumeStiffness: 0.5,
      enablePressure: false,
      ...config,
    };

    this.gravity = new THREE.Vector3(0, -9.81, 0);
  }

  public initializeFromSphere(
    radius: number,
    segments: number,
    pinTop: boolean = false
  ): void {
    const particles: SoftBodyParticle[] = [];
    const sphereGeometry = new THREE.SphereGeometry(radius, segments, segments);
    const positions = sphereGeometry.getAttribute('position');

    // Create particles from sphere vertices
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Pin top vertices if requested
      const pinned = pinTop && y > radius * 0.8;

      particles.push({
        position: new THREE.Vector3(x, y, z),
        previousPosition: new THREE.Vector3(x, y, z),
        originalPosition: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(0, 0, 0),
        force: new THREE.Vector3(0, 0, 0),
        mass: this.config.mass,
        inverseMass: pinned ? 0 : 1 / this.config.mass,
        pinned,
      });
    }

    this.particles = particles;

    // Create edge constraints from sphere geometry
    this.createEdgeConstraints(sphereGeometry);

    // Create tetrahedral structure for volume preservation
    this.createTetrahedra(radius);

    // Create mesh
    this.createMesh(sphereGeometry);

    sphereGeometry.dispose();
  }

  private createEdgeConstraints(geometry: THREE.BufferGeometry): void {
    const indices = geometry.getIndex();
    const positions = geometry.getAttribute('position');

    if (!indices) return;

    const edgeMap = new Map<string, boolean>();

    // Add constraints along triangle edges
    for (let i = 0; i < indices.count; i += 3) {
      const a = indices.getX(i);
      const b = indices.getX(i + 1);
      const c = indices.getX(i + 2);

      // Edge AB
      const edgeAB = [Math.min(a, b), Math.max(a, b)].join('-');
      if (!edgeMap.has(edgeAB)) {
        edgeMap.set(edgeAB, true);
        const posA = new THREE.Vector3(positions.getX(a), positions.getY(a), positions.getZ(a));
        const posB = new THREE.Vector3(positions.getX(b), positions.getY(b), positions.getZ(b));
        this.constraints.push({
          particleA: a,
          particleB: b,
          restLength: posA.distanceTo(posB),
          stiffness: this.config.stiffness,
          active: true,
        });
      }

      // Edge BC
      const edgeBC = [Math.min(b, c), Math.max(b, c)].join('-');
      if (!edgeMap.has(edgeBC)) {
        edgeMap.set(edgeBC, true);
        const posB = new THREE.Vector3(positions.getX(b), positions.getY(b), positions.getZ(b));
        const posC = new THREE.Vector3(positions.getX(c), positions.getY(c), positions.getZ(c));
        this.constraints.push({
          particleA: b,
          particleB: c,
          restLength: posB.distanceTo(posC),
          stiffness: this.config.stiffness,
          active: true,
        });
      }

      // Edge CA
      const edgeCA = [Math.min(c, a), Math.max(c, a)].join('-');
      if (!edgeMap.has(edgeCA)) {
        edgeMap.set(edgeCA, true);
        const posC = new THREE.Vector3(positions.getX(c), positions.getY(c), positions.getZ(c));
        const posA = new THREE.Vector3(positions.getX(a), positions.getY(a), positions.getZ(a));
        this.constraints.push({
          particleA: c,
          particleB: a,
          restLength: posC.distanceTo(posA),
          stiffness: this.config.stiffness,
          active: true,
        });
      }
    }

    // Add some internal constraints for stability
    this.addInternalConstraints();
  }

  private addInternalConstraints(): void {
    const count = this.particles.length;
    
    // Add long-range constraints for better shape preservation
    for (let i = 0; i < count; i++) {
      const p1 = this.particles[i].position;
      
      // Connect to a few distant particles
      let connections = 0;
      for (let j = i + 5; j < count && connections < 3; j += 7) {
        const p2 = this.particles[j].position;
        const dist = p1.distanceTo(p2);
        
        this.constraints.push({
          particleA: i,
          particleB: j,
          restLength: dist,
          stiffness: this.config.stiffness * 0.3,
          active: true,
        });
        connections++;
      }
    }
  }

  private createTetrahedra(radius: number): void {
    // Simple tetrahedral decomposition using center point
    const centerIdx = this.particles.length;
    
    // Add center particle
    this.particles.push({
      position: new THREE.Vector3(0, 0, 0),
      previousPosition: new THREE.Vector3(0, 0, 0),
      originalPosition: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      force: new THREE.Vector3(0, 0, 0),
      mass: this.config.mass,
      inverseMass: 1 / this.config.mass,
      pinned: false,
    });

    // Create tetrahedra from surface triangles to center
    // This is simplified - in production would use proper tetrahedralization
    const surfaceIndices: number[] = [];
    for (let i = 0; i < this.particles.length - 1; i++) {
      surfaceIndices.push(i);
    }

    // Sample tetrahedra (simplified approach)
    const sampleRate = Math.max(1, Math.floor(surfaceIndices.length / 50));
    for (let i = 0; i < surfaceIndices.length - 2; i += sampleRate) {
      const a = surfaceIndices[i];
      const b = surfaceIndices[(i + 1) % surfaceIndices.length];
      const c = surfaceIndices[(i + 2) % surfaceIndices.length];
      
      // Calculate rest volume
      const posA = this.particles[a].originalPosition;
      const posB = this.particles[b].originalPosition;
      const posC = this.particles[c].originalPosition;
      const center = this.particles[centerIdx].originalPosition;
      
      const volume = this.calculateTetrahedronVolume(posA, posB, posC, center);
      
      this.tetrahedra.push({
        indices: [a, b, c, centerIdx],
        restVolume: Math.abs(volume),
      });
    }
  }

  private calculateTetrahedronVolume(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3
  ): number {
    const ab = b.clone().sub(a);
    const ac = c.clone().sub(a);
    const ad = d.clone().sub(a);
    
    const cross = ab.clone().cross(ac);
    return cross.dot(ad) / 6.0;
  }

  private createMesh(baseGeometry: THREE.BufferGeometry): void {
    const geometry = baseGeometry.clone();
    
    const material = new THREE.MeshStandardMaterial({
      color: 0xff6b6b,
      roughness: 0.4,
      metalness: 0.1,
      flatShading: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    
    this.geometry = geometry;
  }

  public update(dt: number): void {
    if (!this.enabled || this.particles.length === 0) return;

    dt = Math.min(dt, 0.05);
    const substeps = 5;
    const subDt = dt / substeps;

    for (let step = 0; step < substeps; step++) {
      this.integrateForces(subDt);
      this.integrateVerlet(subDt);
      this.satisfyConstraints(4);
      this.satisfyVolumeConstraints(2);
    }

    this.updateGeometry();
  }

  private integrateForces(dt: number): void {
    for (const particle of this.particles) {
      if (particle.pinned) continue;

      // Apply gravity
      particle.force.copy(this.gravity).multiplyScalar(particle.mass);

      // Apply damping
      particle.velocity.multiplyScalar(this.config.damping);
    }

    // Apply pressure forces if enabled
    if (this.config.enablePressure && this.config.pressure > 0) {
      this.applyPressure();
    }
  }

  private applyPressure(): void {
    for (const tet of this.tetrahedra) {
      const [a, b, c, d] = tet.indices.map(i => this.particles[i]);
      const currentVolume = this.calculateTetrahedronVolume(
        a.position, b.position, c.position, d.position
      );
      
      const volumeDiff = currentVolume - tet.restVolume;
      const pressureForce = volumeDiff * this.config.pressure;
      
      // Apply pressure force to each vertex (simplified)
      for (const idx of tet.indices) {
        const particle = this.particles[idx];
        if (!particle.pinned) {
          particle.force.y += pressureForce * 0.1;
        }
      }
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

  private satisfyVolumeConstraints(iterations: number): void {
    if (this.tetrahedra.length === 0) return;

    for (let iter = 0; iter < iterations; iter++) {
      for (const tet of this.tetrahedra) {
        const [ia, ib, ic, id] = tet.indices;
        const a = this.particles[ia];
        const b = this.particles[ib];
        const c = this.particles[ic];
        const d = this.particles[id];

        const currentVolume = this.calculateTetrahedronVolume(
          a.position, b.position, c.position, d.position
        );
        
        const volumeDiff = currentVolume - tet.restVolume;
        
        if (Math.abs(volumeDiff) < 0.001) continue;

        // Apply volume correction (simplified)
        const correctionFactor = volumeDiff * this.config.volumeStiffness * 0.1;
        
        for (const idx of tet.indices) {
          const particle = this.particles[idx];
          if (!particle.pinned) {
            const dir = particle.position.clone().normalize();
            particle.position.add(dir.multiplyScalar(correctionFactor));
          }
        }
      }
    }
  }

  private updateGeometry(): void {
    if (!this.geometry) return;

    const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute;

    // Update vertex positions (skip center particle)
    for (let i = 0; i < positions.count && i < this.particles.length - 1; i++) {
      const p = this.particles[i];
      positions.setXYZ(i, p.position.x, p.position.y, p.position.z);
    }

    positions.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  public getMesh(): THREE.Mesh | null {
    return this.mesh;
  }

  public setGravity(gravity: THREE.Vector3): void {
    this.gravity.copy(gravity);
  }

  public setPressure(pressure: number): void {
    this.config.pressure = pressure;
  }

  public pinParticle(index: number, pinned: boolean): void {
    if (index >= 0 && index < this.particles.length) {
      this.particles[index].pinned = pinned;
      this.particles[index].inverseMass = pinned ? 0 : 1 / this.config.mass;
    }
  }

  public applyForce(index: number, force: THREE.Vector3): void {
    if (index >= 0 && index < this.particles.length && !this.particles[index].pinned) {
      this.particles[index].force.add(force);
    }
  }

  public reset(): void {
    for (const particle of this.particles) {
      particle.position.copy(particle.originalPosition);
      particle.previousPosition.copy(particle.originalPosition);
      particle.velocity.set(0, 0, 0);
      particle.force.set(0, 0, 0);
    }

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

export default SoftBodySimulation;
