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
export type EmitterShape = 'point' | 'sphere' | 'box' | 'cone' | 'cylinder' | 'plane' | 'mesh' | 'ring' | 'hemisphere';
export type EmissionMode = 'continuous' | 'burst' | 'single' | 'wave';
export interface EmitterConfig {
    name: string;
    enabled: boolean;
    shape: EmitterShape;
    emissionMode: EmissionMode;
    emissionRate: number;
    burstCount: number;
    burstInterval: number;
    waveFrequency: number;
    waveAmplitude: number;
    radius: number;
    radiusInner: number;
    width: number;
    height: number;
    depth: number;
    angle: number;
    arc: number;
    thickness: number;
    initialVelocity: Vector3;
    velocityMin: number;
    velocityMax: number;
    velocitySpread: number;
    speedCurve: number[];
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
    gravity: Vector3;
    wind: Vector3;
    turbulence: number;
    turbulenceFrequency: number;
    enableCollision: boolean;
    collisionRadius: number;
    bounceFactor: number;
    frictionFactor: number;
    maxParticles: number;
    sortMode: 'none' | 'distance' | 'age' | 'size';
    blending: THREE.Blending;
    depthWrite: boolean;
    depthTest: boolean;
    transparent: boolean;
    textures: THREE.Texture[];
    textureSheetColumns: number;
    textureSheetRows: number;
    startFrame: number;
    endFrame: number;
    frameOverLife: number[];
    randomizeFrame: boolean;
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
export declare class Particle {
    data: ParticleData;
    private _pool;
    constructor(id: number);
    get isAlive(): boolean;
    get normalizedAge(): number;
    reset(): void;
    initialize(config: Partial<ParticleData>): void;
    update(deltaTime: number): void;
    addForce(force: Vector3): void;
    addImpulse(impulse: Vector3): void;
}
export declare class ParticlePool {
    private particles;
    private activeParticles;
    private freeList;
    private nextId;
    constructor(maxSize?: number);
    acquire(): Particle | null;
    release(particle: Particle): void;
    getActiveParticles(): Particle[];
    getActiveCount(): number;
    getFreeCount(): number;
    getTotalCount(): number;
    clear(): void;
}
export declare class ParticleEmitter {
    config: EmitterConfig;
    private pool;
    private emissionAccumulator;
    private burstTimer;
    private wavePhase;
    private lastEmitTime;
    constructor(config: EmitterConfig, maxParticles?: number);
    emit(count?: number): Particle[];
    private initializeParticle;
    private generatePosition;
    private generateVelocity;
    update(deltaTime: number, time: number): void;
    getActiveParticles(): Particle[];
    getActiveCount(): number;
    clear(): void;
}
export declare class ParticleSystem {
    private emitters;
    private forceFields;
    private colliders;
    private time;
    constructor();
    addEmitter(name: string, config: EmitterConfig): ParticleEmitter;
    removeEmitter(name: string): void;
    getEmitter(name: string): ParticleEmitter | undefined;
    addForceField(field: ParticleForceField): void;
    removeForceField(id: string): void;
    addCollider(collider: ParticleCollider): void;
    removeCollider(id: string): void;
    update(deltaTime: number): void;
    private applyForceFields;
    private calculateForce;
    private handleCollisions;
    private resolveCollision;
    getTotalParticleCount(): number;
    clear(): void;
}
export declare function createFireEmitter(): EmitterConfig;
export declare function createSmokeEmitter(): EmitterConfig;
export declare function createRainEmitter(): EmitterConfig;
export declare function createSparkEmitter(): EmitterConfig;
//# sourceMappingURL=ParticleSystem.d.ts.map