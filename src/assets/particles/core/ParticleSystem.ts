/**
 * InfiniGen R3F Port - Particle System Core
 * 
 * Core particle system engine with emitter management,
 * physics simulation, and rendering integration.
 * 
 * @module particles/core
 */

import * as THREE from 'three';
import { Vector3 } from 'three';

// ============================================================================
// Type Definitions
// ============================================================================

export type ParticleLifeCycle = 'birth' | 'alive' | 'dying' | 'dead';

export interface ParticleData {
  id: number;
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  force: Vector3;
  mass: number;
  size: number;
  color: THREE.Color;
  alpha: number;
  age: number;
  lifetime: number;
  lifeCycle: ParticleLifeCycle;
  rotation: number;
  rotationSpeed: number;
  scale: Vector3;
  textureIndex: number;
  userData: Record<string, any>;
}

export type EmitterShape = 
  | 'point'
  | 'sphere'
  | 'box'
  | 'cone'
  | 'cylinder'
  | 'plane'
  | 'mesh'
  | 'ring'
  | 'hemisphere';

export type EmissionMode = 
  | 'continuous'
  | 'burst'
  | 'single'
  | 'wave';

export interface EmitterConfig {
  // Basic properties
  name: string;
  enabled: boolean;
  
  // Emission settings
  shape: EmitterShape;
  emissionMode: EmissionMode;
  emissionRate: number; // particles per second
  burstCount: number;
  burstInterval: number;
  waveFrequency: number;
  waveAmplitude: number;
  
  // Shape parameters
  radius: number;
  radiusInner: number;
  width: number;
  height: number;
  depth: number;
  angle: number;
  arc: number;
  thickness: number;
  
  // Initial velocity
  initialVelocity: Vector3;
  velocityMin: number;
  velocityMax: number;
  velocitySpread: number;
  speedCurve: number[];
  
  // Particle properties
  particleLifetime: number;
  lifetimeVariation: number;
  particleSize: number;
  sizeVariation: number;
  sizeOverLife: number[];
  particleColor: THREE.Color;
  colorVariation: THREE.Color;
  colorOverLife: THREE.Color[];
  alphaOverLife: number[];
  particleMass: number;
  particleDrag: number;
  
  // Forces
  gravity: Vector3;
  wind: Vector3;
  turbulence: number;
  turbulenceFrequency: number;
  
  // Collision
  enableCollision: boolean;
  collisionRadius: number;
  bounceFactor: number;
  frictionFactor: number;
  
  // Rendering
  maxParticles: number;
  sortMode: 'none' | 'distance' | 'age' | 'size';
  blending: THREE.Blending;
  depthWrite: boolean;
  depthTest: boolean;
  transparent: boolean;
  
  // Textures
  textures: THREE.Texture[];
  textureSheetColumns: number;
  textureSheetRows: number;
  startFrame: number;
  endFrame: number;
  frameOverLife: number[];
  randomizeFrame: boolean;
  
  // Sub-emitters
  subEmitters: SubEmitterConfig[];
}

export interface SubEmitterConfig {
  event: 'birth' | 'collision' | 'death' | 'custom';
  emitter: EmitterConfig;
  probability: number;
  count: number;
}

export interface ParticleForceField {
  id: string;
  type: 'constant' | 'radial' | 'vortex' | 'noise' | 'attractor' | 'repulsor';
  position: Vector3;
  direction: Vector3;
  magnitude: number;
  range: number;
  falloff: 'none' | 'linear' | 'quadratic' | 'inverse';
  noiseScale: number;
  noiseFrequency: number;
  enabled: boolean;
}

export interface ParticleCollider {
  id: string;
  type: 'plane' | 'sphere' | 'box' | 'mesh';
  position: Vector3;
  rotation: THREE.Quaternion;
  scale: Vector3;
  bounceFactor: number;
  frictionFactor: number;
  killOnCollision: boolean;
  enabled: boolean;
}

// ============================================================================
// Particle Class
// ============================================================================

export class Particle {
  data: ParticleData;
  private _pool: ParticlePool | null = null;

  constructor(id: number) {
    this.data = {
      id,
      position: new Vector3(0, 0, 0),
      velocity: new Vector3(0, 0, 0),
      acceleration: new Vector3(0, 0, 0),
      force: new Vector3(0, 0, 0),
      mass: 1.0,
      size: 1.0,
      color: new THREE.Color(1, 1, 1),
      alpha: 1.0,
      age: 0,
      lifetime: 1.0,
      lifeCycle: 'dead',
      rotation: 0,
      rotationSpeed: 0,
      scale: new Vector3(1, 1, 1),
      textureIndex: 0,
      userData: {}
    };
  }

  get isAlive(): boolean {
    return this.data.lifeCycle === 'alive' || this.data.lifeCycle === 'dying';
  }

  get normalizedAge(): number {
    return this.data.lifetime > 0 ? this.data.age / this.data.lifetime : 0;
  }

  reset(): void {
    this.data.position.set(0, 0, 0);
    this.data.velocity.set(0, 0, 0);
    this.data.acceleration.set(0, 0, 0);
    this.data.force.set(0, 0, 0);
    this.data.mass = 1.0;
    this.data.size = 1.0;
    this.data.color.set(1, 1, 1);
    this.data.alpha = 1.0;
    this.data.age = 0;
    this.data.lifetime = 1.0;
    this.data.lifeCycle = 'dead';
    this.data.rotation = 0;
    this.data.rotationSpeed = 0;
    this.data.scale.set(1, 1, 1);
    this.data.textureIndex = 0;
    this.data.userData = {};
  }

  initialize(config: Partial<ParticleData>): void {
    if (config.position) this.data.position.copy(config.position);
    if (config.velocity) this.data.velocity.copy(config.velocity);
    if (config.acceleration) this.data.acceleration.copy(config.acceleration);
    if (config.mass !== undefined) this.data.mass = config.mass;
    if (config.size !== undefined) this.data.size = config.size;
    if (config.color) this.data.color.copy(config.color);
    if (config.alpha !== undefined) this.data.alpha = config.alpha;
    if (config.lifetime !== undefined) this.data.lifetime = config.lifetime;
    if (config.rotation !== undefined) this.data.rotation = config.rotation;
    if (config.rotationSpeed !== undefined) this.data.rotationSpeed = config.rotationSpeed;
    if (config.scale) this.data.scale.copy(config.scale);
    if (config.textureIndex !== undefined) this.data.textureIndex = config.textureIndex;
    if (config.userData) this.data.userData = { ...config.userData };
    
    this.data.age = 0;
    this.data.force.set(0, 0, 0);
    this.data.lifeCycle = 'birth';
  }

  update(deltaTime: number): void {
    if (this.data.lifeCycle === 'dead') return;

    // Update age
    this.data.age += deltaTime;
    
    // Check lifecycle transitions
    if (this.data.age >= this.data.lifetime) {
      this.data.lifeCycle = 'dying';
    }
    
    if (this.data.age >= this.data.lifetime * 1.1) {
      this.data.lifeCycle = 'dead';
      if (this._pool) {
        this._pool.release(this);
      }
      return;
    }

    // Apply forces
    this.data.acceleration.copy(this.data.force);
    this.data.acceleration.divideScalar(this.data.mass);

    // Integrate velocity
    this.data.velocity.add(
      this.data.acceleration.clone().multiplyScalar(deltaTime)
    );

    // Apply drag
    const drag = Math.exp(-this.data.userData.dragCoefficient || 0.1 * deltaTime);
    this.data.velocity.multiplyScalar(drag);

    // Integrate position
    this.data.position.add(
      this.data.velocity.clone().multiplyScalar(deltaTime)
    );

    // Update rotation
    this.data.rotation += this.data.rotationSpeed * deltaTime;

    // Reset force for next frame
    this.data.force.set(0, 0, 0);
  }

  addForce(force: Vector3): void {
    this.data.force.add(force);
  }

  addImpulse(impulse: Vector3): void {
    this.data.velocity.add(
      impulse.clone().divideScalar(this.data.mass)
    );
  }
}

// ============================================================================
// Particle Pool
// ============================================================================

export class ParticlePool {
  private particles: Particle[];
  private activeParticles: Set<number>;
  private freeList: number[];
  private nextId: number;

  constructor(maxSize: number = 10000) {
    this.particles = [];
    this.activeParticles = new Set();
    this.freeList = [];
    this.nextId = 0;

    // Pre-allocate particles
    for (let i = 0; i < maxSize; i++) {
      const particle = new Particle(i);
      particle._pool = this;
      this.particles.push(particle);
      this.freeList.push(i);
    }
  }

  acquire(): Particle | null {
    if (this.freeList.length === 0) {
      return null; // Pool exhausted
    }

    const index = this.freeList.pop()!;
    const particle = this.particles[index];
    this.activeParticles.add(index);
    
    return particle;
  }

  release(particle: Particle): void {
    const index = particle.data.id;
    if (this.activeParticles.has(index)) {
      this.activeParticles.delete(index);
      this.freeList.push(index);
      particle.reset();
    }
  }

  getActiveParticles(): Particle[] {
    return Array.from(this.activeParticles).map(i => this.particles[i]);
  }

  getActiveCount(): number {
    return this.activeParticles.size;
  }

  getFreeCount(): number {
    return this.freeList.length;
  }

  getTotalCount(): number {
    return this.particles.length;
  }

  clear(): void {
    for (const index of this.activeParticles) {
      this.particles[index].reset();
    }
    this.activeParticles.clear();
    this.freeList = Array.from({ length: this.particles.length }, (_, i) => i);
  }
}

// ============================================================================
// Particle Emitter
// ============================================================================

export class ParticleEmitter {
  config: EmitterConfig;
  private pool: ParticlePool;
  private emissionAccumulator: number;
  private burstTimer: number;
  private wavePhase: number;
  private lastEmitTime: number;

  constructor(config: EmitterConfig, maxParticles?: number) {
    this.config = { ...config };
    this.pool = new ParticlePool(maxParticles || config.maxParticles || 10000);
    this.emissionAccumulator = 0;
    this.burstTimer = 0;
    this.wavePhase = 0;
    this.lastEmitTime = 0;
  }

  emit(count: number = 1): Particle[] {
    const emitted: Particle[] = [];
    
    for (let i = 0; i < count; i++) {
      const particle = this.pool.acquire();
      if (!particle) break;

      this.initializeParticle(particle);
      emitted.push(particle);
    }

    return emitted;
  }

  private initializeParticle(particle: Particle): void {
    const config = this.config;

    // Position based on emitter shape
    const position = this.generatePosition();
    particle.data.position.copy(position);

    // Velocity
    const velocity = this.generateVelocity();
    particle.data.velocity.copy(velocity);

    // Lifetime
    const lifetime = config.particleLifetime * (1 + (Math.random() - 0.5) * config.lifetimeVariation);
    particle.data.lifetime = Math.max(0.001, lifetime);

    // Size
    const size = config.particleSize * (1 + (Math.random() - 0.5) * config.sizeVariation);
    particle.data.size = size;

    // Color
    particle.data.color.copy(config.particleColor);
    if (config.colorVariation) {
      particle.data.color.r += (Math.random() - 0.5) * config.colorVariation.r;
      particle.data.color.g += (Math.random() - 0.5) * config.colorVariation.g;
      particle.data.color.b += (Math.random() - 0.5) * config.colorVariation.b;
    }
    particle.data.color.clamp();

    // Alpha
    particle.data.alpha = 1.0;

    // Mass
    particle.data.mass = config.particleMass;

    // Rotation
    particle.data.rotation = Math.random() * Math.PI * 2;
    particle.data.rotationSpeed = (Math.random() - 0.5) * 2;

    // Scale
    particle.data.scale.set(1, 1, 1);

    // Texture
    if (config.textures.length > 0) {
      if (config.randomizeFrame) {
        const totalFrames = config.textureSheetColumns * config.textureSheetRows;
        particle.data.textureIndex = Math.floor(Math.random() * totalFrames);
      } else {
        particle.data.textureIndex = config.startFrame || 0;
      }
    }

    // User data
    particle.data.userData.dragCoefficient = config.particleDrag;
  }

  private generatePosition(): Vector3 {
    const config = this.config;
    const pos = new Vector3(0, 0, 0);

    switch (config.shape) {
      case 'point':
        pos.set(0, 0, 0);
        break;

      case 'sphere':
        {
          const u = Math.random();
          const v = Math.random();
          const theta = 2 * Math.PI * u;
          const phi = Math.acos(2 * v - 1);
          const r = config.radius * Math.cbrt(Math.random());
          pos.set(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi)
          );
        }
        break;

      case 'box':
        pos.set(
          (Math.random() - 0.5) * config.width,
          (Math.random() - 0.5) * config.height,
          (Math.random() - 0.5) * config.depth
        );
        break;

      case 'cone':
        {
          const height = (Math.random() - 0.5) * config.height;
          const radiusAtHeight = (config.radius * (1 - Math.abs(height) / (config.height / 2)));
          const angle = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * radiusAtHeight;
          pos.set(r * Math.cos(angle), height, r * Math.sin(angle));
        }
        break;

      case 'cylinder':
        {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * config.radius;
          const height = (Math.random() - 0.5) * config.height;
          pos.set(r * Math.cos(angle), height, r * Math.sin(angle));
        }
        break;

      case 'plane':
        pos.set(
          (Math.random() - 0.5) * config.width,
          0,
          (Math.random() - 0.5) * config.height
        );
        break;

      case 'ring':
        {
          const angle = Math.random() * Math.PI * 2;
          const innerR = config.radiusInner || 0;
          const r = innerR + Math.random() * (config.radius - innerR);
          pos.set(r * Math.cos(angle), 0, r * Math.sin(angle));
        }
        break;

      case 'hemisphere':
        {
          const u = Math.random();
          const v = Math.random();
          const theta = 2 * Math.PI * u;
          const phi = Math.acos(Math.random()); // Only upper hemisphere
          const r = config.radius * Math.cbrt(Math.random());
          pos.set(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
          );
        }
        break;

      default:
        pos.set(0, 0, 0);
    }

    return pos;
  }

  private generateVelocity(): Vector3 {
    const config = this.config;
    const velocity = config.initialVelocity.clone();

    // Add speed variation
    const speed = config.velocityMin + Math.random() * (config.velocityMax - config.velocityMin);
    const spread = config.velocitySpread;

    // Random direction within spread cone
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * (1 - Math.cos(spread)));

    const dirX = Math.sin(phi) * Math.cos(theta);
    const dirY = Math.cos(phi);
    const dirZ = Math.sin(phi) * Math.sin(theta);

    velocity.x += dirX * speed;
    velocity.y += dirY * speed;
    velocity.z += dirZ * speed;

    return velocity;
  }

  update(deltaTime: number, time: number): void {
    if (!this.config.enabled) return;

    const config = this.config;
    let emitCount = 0;

    // Handle different emission modes
    switch (config.emissionMode) {
      case 'continuous':
        this.emissionAccumulator += config.emissionRate * deltaTime;
        emitCount = Math.floor(this.emissionAccumulator);
        this.emissionAccumulator -= emitCount;
        break;

      case 'burst':
        this.burstTimer += deltaTime;
        if (this.burstTimer >= config.burstInterval) {
          this.burstTimer = 0;
          emitCount = config.burstCount;
        }
        break;

      case 'single':
        if (time - this.lastEmitTime >= config.burstInterval) {
          emitCount = config.burstCount;
          this.lastEmitTime = time;
        }
        break;

      case 'wave':
        this.wavePhase += config.waveFrequency * deltaTime;
        const waveValue = 0.5 + 0.5 * Math.sin(this.wavePhase);
        const instantaneousRate = config.emissionRate * (config.waveAmplitude * waveValue + (1 - config.waveAmplitude));
        this.emissionAccumulator += instantaneousRate * deltaTime;
        emitCount = Math.floor(this.emissionAccumulator);
        this.emissionAccumulator -= emitCount;
        break;
    }

    if (emitCount > 0) {
      this.emit(emitCount);
    }

    // Update all active particles
    const particles = this.pool.getActiveParticles();
    for (const particle of particles) {
      particle.update(deltaTime);
    }
  }

  getActiveParticles(): Particle[] {
    return this.pool.getActiveParticles();
  }

  getActiveCount(): number {
    return this.pool.getActiveCount();
  }

  clear(): void {
    this.pool.clear();
  }
}

// ============================================================================
// Particle System Manager
// ============================================================================

export class ParticleSystem {
  private emitters: Map<string, ParticleEmitter>;
  private forceFields: Map<string, ParticleForceField>;
  private colliders: Map<string, ParticleCollider>;
  private time: number;

  constructor() {
    this.emitters = new Map();
    this.forceFields = new Map();
    this.colliders = new Map();
    this.time = 0;
  }

  addEmitter(name: string, config: EmitterConfig): ParticleEmitter {
    const emitter = new ParticleEmitter(config);
    this.emitters.set(name, emitter);
    return emitter;
  }

  removeEmitter(name: string): void {
    const emitter = this.emitters.get(name);
    if (emitter) {
      emitter.clear();
      this.emitters.delete(name);
    }
  }

  getEmitter(name: string): ParticleEmitter | undefined {
    return this.emitters.get(name);
  }

  addForceField(field: ParticleForceField): void {
    this.forceFields.set(field.id, field);
  }

  removeForceField(id: string): void {
    this.forceFields.delete(id);
  }

  addCollider(collider: ParticleCollider): void {
    this.colliders.set(collider.id, collider);
  }

  removeCollider(id: string): void {
    this.colliders.delete(id);
  }

  update(deltaTime: number): void {
    this.time += deltaTime;

    // Update all emitters
    for (const emitter of this.emitters.values()) {
      emitter.update(deltaTime, this.time);
    }

    // Apply force fields to all particles
    this.applyForceFields(deltaTime);

    // Handle collisions
    this.handleCollisions(deltaTime);
  }

  private applyForceFields(deltaTime: number): void {
    const allParticles: Particle[] = [];
    for (const emitter of this.emitters.values()) {
      allParticles.push(...emitter.getActiveParticles());
    }

    for (const particle of allParticles) {
      if (!particle.isAlive) continue;

      for (const field of this.forceFields.values()) {
        if (!field.enabled) continue;

        const force = this.calculateForce(field, particle);
        particle.addForce(force);
      }
    }
  }

  private calculateForce(field: ParticleForceField, particle: Particle): Vector3 {
    const pos = particle.data.position;
    const toParticle = pos.clone().sub(field.position);
    const distance = toParticle.length();

    if (distance > field.range && field.falloff !== 'none') {
      return new Vector3(0, 0, 0);
    }

    let magnitude = field.magnitude;

    // Apply falloff
    switch (field.falloff) {
      case 'linear':
        magnitude *= 1 - distance / field.range;
        break;
      case 'quadratic':
        magnitude *= Math.pow(1 - distance / field.range, 2);
        break;
      case 'inverse':
        magnitude *= distance > 0.001 ? 1 / distance : 1000;
        break;
    }

    const force = new Vector3(0, 0, 0);

    switch (field.type) {
      case 'constant':
        force.copy(field.direction).multiplyScalar(magnitude);
        break;

      case 'radial':
        if (distance > 0.001) {
          toParticle.normalize().multiplyScalar(magnitude);
          force.copy(toParticle);
        }
        break;

      case 'vortex':
        if (distance > 0.001) {
          const up = new Vector3(0, 1, 0);
          const tangent = up.cross(toParticle).normalize();
          tangent.multiplyScalar(magnitude);
          force.copy(tangent);
        }
        break;

      case 'noise':
        const noiseX = Math.sin(pos.x * field.noiseScale + this.time * field.noiseFrequency);
        const noiseY = Math.sin(pos.y * field.noiseScale + this.time * field.noiseFrequency);
        const noiseZ = Math.sin(pos.z * field.noiseScale + this.time * field.noiseFrequency);
        force.set(noiseX, noiseY, noiseZ).multiplyScalar(magnitude);
        break;

      case 'attractor':
        if (distance > 0.001) {
          toParticle.normalize().multiplyScalar(magnitude);
          force.copy(toParticle);
        }
        break;

      case 'repulsor':
        if (distance > 0.001) {
          toParticle.normalize().multiplyScalar(-magnitude);
          force.copy(toParticle);
        }
        break;
    }

    return force;
  }

  private handleCollisions(deltaTime: number): void {
    const allParticles: Particle[] = [];
    for (const emitter of this.emitters.values()) {
      allParticles.push(...emitter.getActiveParticles());
    }

    for (const particle of allParticles) {
      if (!particle.isAlive) continue;

      for (const collider of this.colliders.values()) {
        if (!collider.enabled) continue;

        this.resolveCollision(particle, collider, deltaTime);
      }
    }
  }

  private resolveCollision(particle: Particle, collider: ParticleCollider, deltaTime: number): void {
    // Simplified collision detection for plane
    if (collider.type === 'plane') {
      const normal = new Vector3(0, 1, 0).applyQuaternion(collider.rotation);
      const toParticle = particle.data.position.clone().sub(collider.position);
      const distance = toParticle.dot(normal);

      if (Math.abs(distance) < collider.collisionRadius) {
        // Reflect velocity
        const velocity = particle.data.velocity;
        const dot = velocity.dot(normal);
        
        if (dot < 0) {
          const reflection = normal.clone().multiplyScalar(-2 * dot);
          velocity.add(reflection).multiplyScalar(collider.bounceFactor);
          
          // Apply friction
          const tangent = velocity.clone().sub(normal.clone().multiplyScalar(dot));
          tangent.multiplyScalar(collider.frictionFactor);
          velocity.copy(tangent.add(reflection));
        }

        // Reposition outside collider
        particle.data.position.add(normal.clone().multiplyScalar(collider.collisionRadius - distance));

        if (collider.killOnCollision && velocity.length() < 0.1) {
          particle.data.lifeCycle = 'dead';
        }
      }
    }

    // Sphere collision
    if (collider.type === 'sphere') {
      const toCenter = particle.data.position.clone().sub(collider.position);
      const distance = toCenter.length();
      const radius = collider.scale.x * collider.collisionRadius;

      if (distance < radius) {
        const normal = toCenter.normalize();
        const velocity = particle.data.velocity;
        const dot = velocity.dot(normal);

        if (dot < 0) {
          const reflection = normal.clone().multiplyScalar(-2 * dot);
          velocity.add(reflection).multiplyScalar(collider.bounceFactor);
        }

        // Reposition outside sphere
        particle.data.position.copy(collider.position).add(normal.multiplyScalar(radius));

        if (collider.killOnCollision && velocity.length() < 0.1) {
          particle.data.lifeCycle = 'dead';
        }
      }
    }
  }

  getTotalParticleCount(): number {
    let count = 0;
    for (const emitter of this.emitters.values()) {
      count += emitter.getActiveCount();
    }
    return count;
  }

  clear(): void {
    for (const emitter of this.emitters.values()) {
      emitter.clear();
    }
  }
}

// ============================================================================
// Preset Emitters
// ============================================================================

export function createFireEmitter(): EmitterConfig {
  return {
    name: 'fire',
    enabled: true,
    shape: 'cone',
    emissionMode: 'continuous',
    emissionRate: 200,
    burstCount: 50,
    burstInterval: 0.1,
    waveFrequency: 2,
    waveAmplitude: 0.5,
    radius: 0.2,
    radiusInner: 0.05,
    width: 1,
    height: 1,
    depth: 1,
    angle: Math.PI / 6,
    arc: Math.PI * 2,
    thickness: 0.1,
    initialVelocity: new Vector3(0, 2, 0),
    velocityMin: 1,
    velocityMax: 4,
    velocitySpread: 0.3,
    speedCurve: [],
    particleLifetime: 1.0,
    lifetimeVariation: 0.3,
    particleSize: 0.15,
    sizeVariation: 0.5,
    sizeOverLife: [1, 1.2, 0.8, 0],
    particleColor: new THREE.Color(1, 0.6, 0.2),
    colorVariation: new THREE.Color(0.2, 0.2, 0.1),
    colorOverLife: [],
    alphaOverLife: [0, 0.8, 0.6, 0],
    particleMass: 0.1,
    particleDrag: 0.5,
    gravity: new Vector3(0, 0.5, 0),
    wind: new Vector3(0, 0, 0),
    turbulence: 0.5,
    turbulenceFrequency: 2,
    enableCollision: false,
    collisionRadius: 0.05,
    bounceFactor: 0.3,
    frictionFactor: 0.8,
    maxParticles: 2000,
    sortMode: 'distance',
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    textures: [],
    textureSheetColumns: 4,
    textureSheetRows: 4,
    startFrame: 0,
    endFrame: 15,
    frameOverLife: [],
    randomizeFrame: true,
    subEmitters: []
  };
}

export function createSmokeEmitter(): EmitterConfig {
  return {
    name: 'smoke',
    enabled: true,
    shape: 'circle' as any,
    emissionMode: 'continuous',
    emissionRate: 50,
    burstCount: 20,
    burstInterval: 0.5,
    waveFrequency: 0.5,
    waveAmplitude: 0.3,
    radius: 0.3,
    radiusInner: 0.1,
    width: 1,
    height: 1,
    depth: 1,
    angle: Math.PI / 4,
    arc: Math.PI * 2,
    thickness: 0.1,
    initialVelocity: new Vector3(0, 1, 0),
    velocityMin: 0.5,
    velocityMax: 1.5,
    velocitySpread: 0.2,
    speedCurve: [],
    particleLifetime: 3.0,
    lifetimeVariation: 0.5,
    particleSize: 0.3,
    sizeVariation: 0.5,
    sizeOverLife: [0, 0.5, 1, 1.5, 2],
    particleColor: new THREE.Color(0.3, 0.3, 0.3),
    colorVariation: new THREE.Color(0.1, 0.1, 0.1),
    colorOverLife: [],
    alphaOverLife: [0, 0.4, 0.3, 0],
    particleMass: 0.05,
    particleDrag: 1.0,
    gravity: new Vector3(0, -0.2, 0),
    wind: new Vector3(0.5, 0, 0),
    turbulence: 1.0,
    turbulenceFrequency: 1,
    enableCollision: false,
    collisionRadius: 0.1,
    bounceFactor: 0.1,
    frictionFactor: 0.9,
    maxParticles: 1000,
    sortMode: 'distance',
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    textures: [],
    textureSheetColumns: 4,
    textureSheetRows: 4,
    startFrame: 0,
    endFrame: 15,
    frameOverLife: [],
    randomizeFrame: true,
    subEmitters: []
  };
}

export function createRainEmitter(): EmitterConfig {
  return {
    name: 'rain',
    enabled: true,
    shape: 'box',
    emissionMode: 'continuous',
    emissionRate: 500,
    burstCount: 100,
    burstInterval: 1,
    waveFrequency: 0,
    waveAmplitude: 0,
    radius: 1,
    radiusInner: 0,
    width: 20,
    height: 0.5,
    depth: 20,
    angle: 0,
    arc: Math.PI * 2,
    thickness: 0.1,
    initialVelocity: new Vector3(0, -10, 0),
    velocityMin: 8,
    velocityMax: 12,
    velocitySpread: 0.1,
    speedCurve: [],
    particleLifetime: 5.0,
    lifetimeVariation: 0.2,
    particleSize: 0.05,
    sizeVariation: 0.3,
    sizeOverLife: [1, 1, 1],
    particleColor: new THREE.Color(0.7, 0.8, 1),
    colorVariation: new THREE.Color(0.1, 0.1, 0.1),
    colorOverLife: [],
    alphaOverLife: [0.5, 0.5, 0.5],
    particleMass: 0.5,
    particleDrag: 0.1,
    gravity: new Vector3(0, -9.8, 0),
    wind: new Vector3(1, 0, 0),
    turbulence: 0.2,
    turbulenceFrequency: 0.5,
    enableCollision: true,
    collisionRadius: 0.05,
    bounceFactor: 0.1,
    frictionFactor: 0.5,
    maxParticles: 5000,
    sortMode: 'none',
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    textures: [],
    textureSheetColumns: 1,
    textureSheetRows: 1,
    startFrame: 0,
    endFrame: 0,
    frameOverLife: [],
    randomizeFrame: false,
    subEmitters: []
  };
}

export function createSparkEmitter(): EmitterConfig {
  return {
    name: 'sparks',
    enabled: true,
    shape: 'point',
    emissionMode: 'burst',
    emissionRate: 0,
    burstCount: 100,
    burstInterval: 0.2,
    waveFrequency: 0,
    waveAmplitude: 0,
    radius: 0.1,
    radiusInner: 0,
    width: 1,
    height: 1,
    depth: 1,
    angle: Math.PI,
    arc: Math.PI * 2,
    thickness: 0.1,
    initialVelocity: new Vector3(0, 5, 0),
    velocityMin: 3,
    velocityMax: 10,
    velocitySpread: Math.PI,
    speedCurve: [],
    particleLifetime: 0.8,
    lifetimeVariation: 0.3,
    particleSize: 0.08,
    sizeVariation: 0.5,
    sizeOverLife: [1, 1, 0],
    particleColor: new THREE.Color(1, 0.9, 0.5),
    colorVariation: new THREE.Color(0.2, 0.1, 0),
    colorOverLife: [],
    alphaOverLife: [1, 1, 0],
    particleMass: 0.2,
    particleDrag: 0.3,
    gravity: new Vector3(0, -9.8, 0),
    wind: new Vector3(0, 0, 0),
    turbulence: 0.1,
    turbulenceFrequency: 5,
    enableCollision: true,
    collisionRadius: 0.05,
    bounceFactor: 0.5,
    frictionFactor: 0.8,
    maxParticles: 1000,
    sortMode: 'distance',
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    textures: [],
    textureSheetColumns: 1,
    textureSheetRows: 1,
    startFrame: 0,
    endFrame: 0,
    frameOverLife: [],
    randomizeFrame: false,
    subEmitters: []
  };
}
