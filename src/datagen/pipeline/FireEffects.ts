/**
 * FireEffects.ts — Fire Particle Simulation, Rendering, and Cached Factories
 *
 * Provides comprehensive fire visual effects for the infinigen-r3f project:
 *
 * 1. FireParticleEmitter — Volume-based fire particle emission with upward bias + turbulence
 * 2. FireSimulation — Physics update: advection, buoyancy, turbulence (FBM), cooling
 * 3. FireRenderer — Billboard quad rendering with temperature-based color gradients
 * 4. CachedFireFactory — Pre-computed fire keyframes for animation caching
 * 5. CachedBoulderFactory — Boulder with ember particles
 * 6. CachedTreeFactory — Burning tree with fire at branch tips + charring
 *
 * All geometries use THREE.Mesh/Points with MeshStandardMaterial/PointsMaterial.
 * Uses SeededRandom for deterministic results.
 *
 * @module datagen/pipeline/fire
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * A single fire particle with position, velocity, temperature, and lifetime.
 */
export interface FireParticle {
  /** World-space position */
  position: THREE.Vector3;
  /** World-space velocity */
  velocity: THREE.Vector3;
  /** Temperature (1.0 = hottest, 0.0 = cooled smoke) */
  temperature: number;
  /** Normalized age (0 = just born, 1 = about to die) */
  age: number;
  /** Maximum lifetime in seconds */
  lifetime: number;
  /** Particle size multiplier */
  size: number;
  /** Whether this particle is smoke (vs fire) */
  isSmoke: boolean;
  /** Unique ID */
  id: number;
}

/**
 * Configuration for fire particle emission.
 */
export interface FireEmitterConfig {
  /** Emission rate (particles per second) */
  emissionRate: number;
  /** Maximum number of active particles */
  maxParticles: number;
  /** Initial velocity magnitude */
  initialSpeed: number;
  /** Upward velocity bias (0-1) */
  upwardBias: number;
  /** Turbulence strength at emission */
  turbulenceStrength: number;
  /** Base lifetime range [min, max] in seconds */
  lifetimeRange: [number, number];
  /** Base particle size range [min, max] */
  sizeRange: [number, number];
  /** Fraction of particles that become smoke (0-1) */
  smokeFraction: number;
  /** Emission volume radius */
  emissionRadius: number;
  /** Initial temperature */
  initialTemperature: number;
}

/**
 * Default fire emitter configuration.
 */
export const DEFAULT_FIRE_EMITTER_CONFIG: FireEmitterConfig = {
  emissionRate: 100,
  maxParticles: 2000,
  initialSpeed: 1.5,
  upwardBias: 0.8,
  turbulenceStrength: 0.5,
  lifetimeRange: [1.0, 3.0],
  sizeRange: [0.1, 0.3],
  smokeFraction: 0.3,
  emissionRadius: 0.5,
  initialTemperature: 1.0,
};

/**
 * Configuration for fire simulation update.
 */
export interface FireSimulationConfig {
  /** Buoyancy strength (upward force proportional to temperature) */
  buoyancyStrength: number;
  /** Turbulence noise scale for FBM */
  turbulenceScale: number;
  /** Turbulence noise strength */
  turbulenceStrength: number;
  /** Number of FBM octaves for turbulence */
  turbulenceOctaves: number;
  /** Cooling rate per second (temperature decrease) */
  coolingRate: number;
  /** Drag coefficient */
  drag: number;
  /** Wind force */
  wind: THREE.Vector3;
}

/**
 * Default fire simulation configuration.
 */
export const DEFAULT_FIRE_SIMULATION_CONFIG: FireSimulationConfig = {
  buoyancyStrength: 3.0,
  turbulenceScale: 2.0,
  turbulenceStrength: 1.0,
  turbulenceOctaves: 4,
  coolingRate: 0.4,
  drag: 0.98,
  wind: new THREE.Vector3(0, 0, 0),
};

/**
 * Configuration for fire rendering.
 */
export interface FireRenderConfig {
  /** Base billboard size */
  baseSize: number;
  /** Size growth factor (particles grow then shrink) */
  sizeGrowthFactor: number;
  /** Smoke size multiplier */
  smokeSizeMultiplier: number;
  /** Opacity for fire particles */
  fireOpacity: number;
  /** Opacity for smoke particles */
  smokeOpacity: number;
  /** Whether to use additive blending */
  additiveBlending: boolean;
}

/**
 * Default fire render configuration.
 */
export const DEFAULT_FIRE_RENDER_CONFIG: FireRenderConfig = {
  baseSize: 0.2,
  sizeGrowthFactor: 1.5,
  smokeSizeMultiplier: 2.0,
  fireOpacity: 0.7,
  smokeOpacity: 0.3,
  additiveBlending: true,
};

/**
 * Temperature color stop for the fire gradient.
 */
export interface TemperatureColorStop {
  /** Temperature value (0-1) */
  temperature: number;
  /** Color at this temperature */
  color: THREE.Color;
}

/**
 * Default fire color gradient: white → yellow → orange → red → dark smoke.
 */
export const DEFAULT_FIRE_GRADIENT: TemperatureColorStop[] = [
  { temperature: 1.0, color: new THREE.Color(1.0, 1.0, 0.95) },   // White-hot
  { temperature: 0.8, color: new THREE.Color(1.0, 0.9, 0.3) },    // Yellow
  { temperature: 0.6, color: new THREE.Color(1.0, 0.5, 0.1) },    // Orange
  { temperature: 0.4, color: new THREE.Color(0.8, 0.15, 0.02) },  // Red
  { temperature: 0.2, color: new THREE.Color(0.2, 0.05, 0.01) },  // Dark red
  { temperature: 0.0, color: new THREE.Color(0.1, 0.1, 0.1) },    // Dark smoke
];

/**
 * Configuration for boulder with embers.
 */
export interface BoulderEmberConfig {
  /** Boulder radius range [min, max] */
  radiusRange: [number, number];
  /** Number of ember particles */
  emberCount: number;
  /** Ember size range */
  emberSizeRange: [number, number];
  /** Boulder material color */
  boulderColor: number;
  /** Ember color */
  emberColor: number;
}

/**
 * Configuration for burning tree.
 */
export interface BurningTreeConfig {
  /** Tree height */
  height: number;
  /** Trunk radius */
  trunkRadius: number;
  /** Number of branch levels */
  branchLevels: number;
  /** Fire particles per branch tip */
  firePerBranch: number;
  /** Char darkening factor (0 = no char, 1 = fully black) */
  charFactor: number;
  /** Tree species color */
  barkColor: number;
}

// ============================================================================
// FireParticleEmitter
// ============================================================================

/**
 * Emits fire particles from a source position with volume-based distribution.
 *
 * Particles are emitted within a sphere around the source position,
 * with initial velocities biased upward and perturbed by turbulence.
 * A configurable fraction of particles are marked as smoke (cooler,
 * longer-lived, larger).
 *
 * Usage:
 * ```ts
 * const emitter = new FireParticleEmitter();
 * const particles = emitter.emit(position, config, rng);
 * ```
 */
export class FireParticleEmitter {
  private nextId: number = 0;

  /**
   * Emit a batch of fire particles from a source position.
   *
   * @param position Emission center
   * @param config   Emitter configuration
   * @param rng      Seeded random number generator
   * @param count    Number of particles to emit (overrides emissionRate)
   * @returns Array of new FireParticle instances
   */
  emit(
    position: THREE.Vector3,
    config: Partial<FireEmitterConfig> = {},
    rng: SeededRandom,
    count?: number,
  ): FireParticle[] {
    const cfg = { ...DEFAULT_FIRE_EMITTER_CONFIG, ...config };
    const particleCount = count ?? Math.round(cfg.emissionRate / 60); // Assume 60fps
    const particles: FireParticle[] = [];

    for (let i = 0; i < particleCount; i++) {
      // Random position within emission volume (sphere)
      const theta = rng.next() * Math.PI * 2;
      const phi = Math.acos(2 * rng.next() - 1);
      const r = cfg.emissionRadius * Math.pow(rng.next(), 1 / 3); // Uniform volume

      const offset = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );

      const particlePos = position.clone().add(offset);

      // Initial velocity: upward bias + random spread + turbulence
      const upward = new THREE.Vector3(0, cfg.upwardBias, 0);
      const spread = new THREE.Vector3(
        (rng.next() - 0.5) * 0.5,
        (rng.next() - 0.5) * 0.2,
        (rng.next() - 0.5) * 0.5,
      );
      const turbulence = this.computeTurbulence(
        particlePos,
        cfg.turbulenceStrength,
        rng,
      );

      const velocity = upward
        .add(spread)
        .add(turbulence)
        .multiplyScalar(cfg.initialSpeed);

      // Lifetime variation
      const lifetime = rng.uniform(cfg.lifetimeRange[0], cfg.lifetimeRange[1]);

      // Size variation
      const size = rng.uniform(cfg.sizeRange[0], cfg.sizeRange[1]);

      // Determine if smoke
      const isSmoke = rng.next() < cfg.smokeFraction;

      particles.push({
        position: particlePos,
        velocity,
        temperature: isSmoke ? 0.3 : cfg.initialTemperature,
        age: 0,
        lifetime: isSmoke ? lifetime * 1.5 : lifetime,
        size: isSmoke ? size * 1.5 : size,
        isSmoke,
        id: this.nextId++,
      });
    }

    return particles;
  }

  /**
   * Compute a turbulence vector using simple FBM-like noise.
   *
   * Uses deterministic noise based on position hashing for
   * pseudo-random turbulence that varies spatially.
   */
  private computeTurbulence(
    position: THREE.Vector3,
    strength: number,
    rng: SeededRandom,
  ): THREE.Vector3 {
    // Simple hash-based noise for turbulence
    const hash = (x: number, y: number, z: number): number => {
      const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
      return n - Math.floor(n);
    };

    const scale = 2.0;
    const sx = position.x * scale;
    const sy = position.y * scale;
    const sz = position.z * scale;

    return new THREE.Vector3(
      (hash(sx, sy, sz) - 0.5) * 2 * strength,
      (hash(sy, sz, sx) - 0.5) * 2 * strength * 0.3,
      (hash(sz, sx, sy) - 0.5) * 2 * strength,
    );
  }
}

// ============================================================================
// FireSimulation
// ============================================================================

/**
 * Simulates fire particle physics: advection, buoyancy, turbulence, cooling.
 *
 * Updates particle positions and properties each timestep:
 * - Advection: particles move along their velocity
 * - Buoyancy: upward force proportional to temperature
 * - Turbulence: FBM noise perturbation for realistic flame motion
 * - Cooling: temperature decreases over lifetime
 * - Color transition: implicit via temperature (handled by renderer)
 *
 * Usage:
 * ```ts
 * const sim = new FireSimulation();
 * sim.update(particles, dt);
 * ```
 */
export class FireSimulation {
  /**
   * Update all fire particles for one timestep.
   *
   * @param particles Array of particles to update (modified in place)
   * @param dt        Timestep in seconds
   * @param config    Simulation configuration
   */
  update(
    particles: FireParticle[],
    dt: number,
    config: Partial<FireSimulationConfig> = {},
  ): void {
    const cfg = { ...DEFAULT_FIRE_SIMULATION_CONFIG, ...config };

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // Update age
      p.age += dt / p.lifetime;

      // Remove dead particles
      if (p.age >= 1.0) {
        particles.splice(i, 1);
        continue;
      }

      // --- Buoyancy: upward force proportional to temperature ---
      const buoyancy = new THREE.Vector3(0, cfg.buoyancyStrength * p.temperature * dt, 0);
      p.velocity.add(buoyancy);

      // --- Turbulence: FBM noise perturbation ---
      const turbulence = this.computeFBMTurbulence(
        p.position,
        p.age,
        cfg.turbulenceScale,
        cfg.turbulenceOctaves,
      );
      p.velocity.add(turbulence.multiplyScalar(cfg.turbulenceStrength * dt));

      // --- Wind ---
      p.velocity.add(cfg.wind.clone().multiplyScalar(dt));

      // --- Drag ---
      p.velocity.multiplyScalar(cfg.drag);

      // --- Advection: move particles along velocity ---
      p.position.add(p.velocity.clone().multiplyScalar(dt));

      // --- Cooling: temperature decreases over lifetime ---
      p.temperature -= cfg.coolingRate * dt;
      p.temperature = Math.max(0, p.temperature);

      // Smoke particles cool slower
      if (p.isSmoke) {
        p.temperature = Math.max(p.temperature, 0.05);
      }
    }
  }

  /**
   * Compute FBM turbulence at a given position and time.
   *
   * Uses a simple hash-based noise function with multiple octaves
   * for realistic flame-like perturbation.
   *
   * @param position  Current particle position
   * @param age       Normalized particle age
   * @param scale     Noise scale
   * @param octaves   Number of FBM octaves
   * @returns Turbulence vector
   */
  private computeFBMTurbulence(
    position: THREE.Vector3,
    age: number,
    scale: number,
    octaves: number,
  ): THREE.Vector3 {
    const hash = (x: number, y: number, z: number): number => {
      const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
      return (n - Math.floor(n)) * 2 - 1;
    };

    let result = new THREE.Vector3();
    let amplitude = 1.0;
    let frequency = scale;

    for (let o = 0; o < octaves; o++) {
      const sx = position.x * frequency + age * 0.5;
      const sy = position.y * frequency + age * 0.3;
      const sz = position.z * frequency + age * 0.4;

      result.x += hash(sx, sy + o * 13.0, sz) * amplitude;
      result.y += hash(sy, sz + o * 17.0, sx) * amplitude * 0.3;
      result.z += hash(sz, sx + o * 23.0, sy) * amplitude;

      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return result;
  }
}

// ============================================================================
// FireRenderer
// ============================================================================

/**
 * Renders fire particles as billboard quads with temperature-based coloring.
 *
 * Creates a THREE.Group containing:
 * - Billboard quads per particle with additive blending
 * - Color from temperature gradient (white → yellow → orange → red → smoke)
 * - Size from lifetime (grow then shrink)
 * - Separate handling for smoke particles (darker, larger, longer-lived)
 *
 * Usage:
 * ```ts
 * const renderer = new FireRenderer();
 * const mesh = renderer.createFireMesh(particles, config);
 * scene.add(mesh);
 * ```
 */
export class FireRenderer {
  /**
   * Create a THREE.Group containing fire particle billboards.
   *
   * Uses InstancedMesh for efficient rendering of many particles.
   *
   * @param particles Array of fire particles
   * @param config    Render configuration
   * @returns THREE.Group with fire meshes
   */
  createFireMesh(
    particles: FireParticle[],
    config: Partial<FireRenderConfig> = {},
  ): THREE.Group {
    const cfg = { ...DEFAULT_FIRE_RENDER_CONFIG, ...config };
    const group = new THREE.Group();
    group.name = 'FireEffect';

    const fireParticles = particles.filter(p => !p.isSmoke);
    const smokeParticles = particles.filter(p => p.isSmoke);

    // Render fire particles
    if (fireParticles.length > 0) {
      const fireGroup = this.createParticleGroup(
        fireParticles,
        cfg,
        false,
      );
      group.add(fireGroup);
    }

    // Render smoke particles
    if (smokeParticles.length > 0) {
      const smokeGroup = this.createParticleGroup(
        smokeParticles,
        cfg,
        true,
      );
      group.add(smokeGroup);
    }

    // Add point light at the fire center
    const center = this.computeParticleCenter(particles);
    const light = new THREE.PointLight(0xff6600, 2, 10);
    light.position.copy(center);
    light.name = 'FireLight';
    group.add(light);

    group.userData.tags = ['fire', 'particle', 'effect'];
    return group;
  }

  /**
   * Update an existing fire mesh group with new particle data.
   *
   * @param group     The fire group to update
   * @param particles Updated particle array
   * @param config    Render configuration
   */
  updateFireMesh(
    group: THREE.Group,
    particles: FireParticle[],
    config: Partial<FireRenderConfig> = {},
  ): void {
    const cfg = { ...DEFAULT_FIRE_RENDER_CONFIG, ...config };

    // Update point light position
    const light = group.getObjectByName('FireLight') as THREE.PointLight;
    if (light) {
      const center = this.computeParticleCenter(particles);
      light.position.copy(center);
      light.intensity = Math.max(0.5, particles.length * 0.01);
    }

    // Remove old particle groups and recreate
    const toRemove: THREE.Object3D[] = [];
    group.children.forEach(child => {
      if (child.name === 'FireParticles' || child.name === 'SmokeParticles') {
        toRemove.push(child);
      }
    });
    toRemove.forEach(child => {
      group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });

    const fireParticles = particles.filter(p => !p.isSmoke);
    const smokeParticles = particles.filter(p => p.isSmoke);

    if (fireParticles.length > 0) {
      group.add(this.createParticleGroup(fireParticles, cfg, false));
    }
    if (smokeParticles.length > 0) {
      group.add(this.createParticleGroup(smokeParticles, cfg, true));
    }
  }

  /**
   * Create a particle group (Points) for fire or smoke particles.
   */
  private createParticleGroup(
    particles: FireParticle[],
    config: FireRenderConfig,
    isSmoke: boolean,
  ): THREE.Points {
    const count = particles.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const i3 = i * 3;

      positions[i3] = p.position.x;
      positions[i3 + 1] = p.position.y;
      positions[i3 + 2] = p.position.z;

      // Color from temperature gradient
      const color = this.getColorForTemperature(p.temperature, p.isSmoke);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      // Size: grow then shrink based on age
      const ageFactor = p.age < 0.3
        ? p.age / 0.3  // Grow phase
        : 1.0 - (p.age - 0.3) / 0.7; // Shrink phase
      const baseSize = isSmoke ? config.baseSize * config.smokeSizeMultiplier : config.baseSize;
      sizes[i] = Math.max(0.01, baseSize * (1 + config.sizeGrowthFactor * ageFactor) * p.size);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: config.baseSize,
      vertexColors: true,
      transparent: true,
      opacity: isSmoke ? config.smokeOpacity : config.fireOpacity,
      sizeAttenuation: true,
      depthWrite: false,
      blending: config.additiveBlending && !isSmoke
        ? THREE.AdditiveBlending
        : THREE.NormalBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.name = isSmoke ? 'SmokeParticles' : 'FireParticles';
    return points;
  }

  /**
   * Get color for a given temperature using the fire gradient.
   *
   * @param temperature Temperature (0-1)
   * @param isSmoke     Whether this is a smoke particle
   * @returns THREE.Color interpolated from the gradient
   */
  getColorForTemperature(temperature: number, isSmoke: boolean = false): THREE.Color {
    if (isSmoke) {
      // Smoke: dark gray, slightly warm near fire
      const smokeIntensity = 0.15 + temperature * 0.1;
      return new THREE.Color(smokeIntensity, smokeIntensity, smokeIntensity * 0.95);
    }

    // Fire: interpolate along temperature gradient
    const gradient = DEFAULT_FIRE_GRADIENT;
    const t = Math.max(0, Math.min(1, temperature));

    // Find surrounding stops
    let lower = gradient[0];
    let upper = gradient[gradient.length - 1];

    for (let i = 0; i < gradient.length - 1; i++) {
      if (t >= gradient[i].temperature && t <= gradient[i + 1].temperature) {
        lower = gradient[i];
        upper = gradient[i + 1];
        break;
      }
    }

    // Interpolate
    const range = upper.temperature - lower.temperature;
    const factor = range > 0 ? (t - lower.temperature) / range : 0;

    return new THREE.Color().lerpColors(lower.color, upper.color, factor);
  }

  /**
   * Compute the center position of all particles.
   */
  private computeParticleCenter(particles: FireParticle[]): THREE.Vector3 {
    if (particles.length === 0) return new THREE.Vector3();

    const center = new THREE.Vector3();
    for (const p of particles) {
      center.add(p.position);
    }
    center.divideScalar(particles.length);
    return center;
  }
}

// ============================================================================
// CachedFireFactory
// ============================================================================

/**
 * Pre-computes fire keyframes for caching as THREE.AnimationClip.
 *
 * Simulates fire particles over time and stores the results as
 * animation keyframes that can be played back without re-simulation.
 *
 * Usage:
 * ```ts
 * const factory = new CachedFireFactory();
 * const clip = factory.createCachedFire(keyframes, config);
 * ```
 */
export class CachedFireFactory {
  /**
   * Create a cached fire animation clip.
   *
   * @param keyframes      Number of keyframes to pre-compute
   * @param config         Fire emitter and simulation config
   * @param seed           Random seed for deterministic results
   * @param position       Fire source position
   * @param duration       Animation duration in seconds
   * @returns THREE.AnimationClip with pre-computed fire data
   */
  createCachedFire(
    keyframes: number,
    config: Partial<FireEmitterConfig> & Partial<FireSimulationConfig> = {},
    seed: number = 42,
    position: THREE.Vector3 = new THREE.Vector3(),
    duration: number = 5.0,
  ): THREE.AnimationClip {
    const rng = new SeededRandom(seed);
    const emitter = new FireParticleEmitter();
    const simulation = new FireSimulation();

    const particles: FireParticle[] = [];
    const dt = duration / keyframes;

    // Pre-compute all keyframes
    const positionsData: THREE.Vector3[][] = [];
    const scalesData: number[][] = [];

    const emitterConfig: Partial<FireEmitterConfig> = {
      emissionRate: config.emissionRate,
      maxParticles: config.maxParticles,
      initialSpeed: config.initialSpeed,
      upwardBias: config.upwardBias,
      turbulenceStrength: config.turbulenceStrength,
      lifetimeRange: config.lifetimeRange,
      sizeRange: config.sizeRange,
      smokeFraction: config.smokeFraction,
      emissionRadius: config.emissionRadius,
      initialTemperature: config.initialTemperature,
    };

    const simConfig: Partial<FireSimulationConfig> = {
      buoyancyStrength: config.buoyancyStrength,
      turbulenceScale: config.turbulenceScale,
      turbulenceStrength: config.turbulenceStrength,
      coolingRate: config.coolingRate,
      drag: config.drag,
      wind: config.wind,
    };

    for (let k = 0; k < keyframes; k++) {
      // Emit new particles
      const newParticles = emitter.emit(position, emitterConfig, rng);
      particles.push(...newParticles);

      // Trim to max
      while (particles.length > (config.maxParticles ?? DEFAULT_FIRE_EMITTER_CONFIG.maxParticles)) {
        particles.shift();
      }

      // Simulate
      simulation.update(particles, dt, simConfig);

      // Store keyframe data
      const framePositions: THREE.Vector3[] = [];
      const frameScales: number[] = [];

      for (const p of particles) {
        framePositions.push(p.position.clone());
        const ageFactor = p.age < 0.3 ? p.age / 0.3 : 1.0 - (p.age - 0.3) / 0.7;
        frameScales.push(Math.max(0.01, p.size * (1 + ageFactor)));
      }

      positionsData.push(framePositions);
      scalesData.push(frameScales);
    }

    // Create animation clip with position track for the fire center
    const times = new Float32Array(keyframes);
    const centerValues = new Float32Array(keyframes * 3);

    for (let k = 0; k < keyframes; k++) {
      times[k] = k * dt;
      const center = new THREE.Vector3();
      for (const pos of positionsData[k]) {
        center.add(pos);
      }
      if (positionsData[k].length > 0) {
        center.divideScalar(positionsData[k].length);
      }
      centerValues[k * 3] = center.x;
      centerValues[k * 3 + 1] = center.y;
      centerValues[k * 3 + 2] = center.z;
    }

    const positionTrack = new THREE.VectorKeyframeTrack(
      '.position',
      times,
      centerValues,
    );

    const clip = new THREE.AnimationClip('FireAnimation', duration, [positionTrack]);

    // Store particle data as userData for custom playback
    clip.userData = {
      positionsData,
      scalesData,
      keyframes,
      duration,
      particleCounts: positionsData.map(p => p.length),
    };

    return clip;
  }

  /**
   * Play a cached fire animation on a mesh.
   *
   * @param mesh  The mesh to animate
   * @param clip  The cached animation clip
   * @returns THREE.AnimationMixer for controlling playback
   */
  playCachedFire(mesh: THREE.Object3D, clip: THREE.AnimationClip): THREE.AnimationMixer {
    const mixer = new THREE.AnimationMixer(mesh);
    const action = mixer.clipAction(clip);
    action.play();
    return mixer;
  }
}

// ============================================================================
// CachedBoulderFactory
// ============================================================================

/**
 * Generates boulders with ember particles for fire-on-rock effects.
 *
 * Creates a boulder mesh with glowing ember particles emanating
 * from cracks and surfaces. Uses IcosahedronGeometry for the boulder
 * and THREE.Points for embers.
 *
 * Usage:
 * ```ts
 * const factory = new CachedBoulderFactory();
 * const boulder = factory.generateBoulderWithEmbers(42, config);
 * scene.add(boulder);
 * ```
 */
export class CachedBoulderFactory {
  /**
   * Generate a boulder with ember particles.
   *
   * @param seed   Random seed for deterministic generation
   * @param config Ember configuration
   * @returns THREE.Group containing boulder mesh and ember particles
   */
  generateBoulderWithEmbers(
    seed: number,
    config: Partial<BoulderEmberConfig> = {},
  ): THREE.Group {
    const cfg: BoulderEmberConfig = {
      radiusRange: [0.3, 1.0],
      emberCount: 50,
      emberSizeRange: [0.01, 0.03],
      boulderColor: 0x555555,
      emberColor: 0xff4400,
      ...config,
    };

    const rng = new SeededRandom(seed);
    const group = new THREE.Group();
    group.name = 'BoulderWithEmbers';

    // Generate boulder geometry with noise displacement
    const radius = rng.uniform(cfg.radiusRange[0], cfg.radiusRange[1]);
    const detail = 3;
    const geometry = new THREE.IcosahedronGeometry(radius, detail);

    // Displace vertices for natural boulder shape
    const posAttr = geometry.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      const noise = this.simpleNoise3D(x * 3 + seed, y * 3, z * 3);
      const displacement = 1 + noise * 0.15;

      posAttr.setXYZ(i, x * displacement, y * displacement, z * displacement);
    }
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: cfg.boulderColor,
      roughness: 0.9,
      metalness: 0.1,
    });

    const boulder = new THREE.Mesh(geometry, material);
    boulder.castShadow = true;
    boulder.receiveShadow = true;
    boulder.name = 'Boulder';
    group.add(boulder);

    // Generate ember particles
    const emberPositions = new Float32Array(cfg.emberCount * 3);
    const emberColors = new Float32Array(cfg.emberCount * 3);
    const emberSizes = new Float32Array(cfg.emberCount);

    for (let i = 0; i < cfg.emberCount; i++) {
      // Random point on/near boulder surface
      const theta = rng.next() * Math.PI * 2;
      const phi = Math.acos(2 * rng.next() - 1);
      const r = radius * (0.9 + rng.next() * 0.3);

      const i3 = i * 3;
      emberPositions[i3] = r * Math.sin(phi) * Math.cos(theta);
      emberPositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      emberPositions[i3 + 2] = r * Math.cos(phi);

      // Ember colors: orange to red
      const temp = rng.uniform(0.3, 1.0);
      const color = new THREE.Color().lerpColors(
        new THREE.Color(0.8, 0.2, 0.0),
        new THREE.Color(1.0, 0.6, 0.1),
        temp,
      );
      emberColors[i3] = color.r;
      emberColors[i3 + 1] = color.g;
      emberColors[i3 + 2] = color.b;

      emberSizes[i] = rng.uniform(cfg.emberSizeRange[0], cfg.emberSizeRange[1]);
    }

    const emberGeometry = new THREE.BufferGeometry();
    emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
    emberGeometry.setAttribute('color', new THREE.BufferAttribute(emberColors, 3));
    emberGeometry.setAttribute('size', new THREE.BufferAttribute(emberSizes, 1));

    const emberMaterial = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const embers = new THREE.Points(emberGeometry, emberMaterial);
    embers.name = 'Embers';
    group.add(embers);

    // Add warm point light
    const light = new THREE.PointLight(0xff6600, 1.5, 5);
    light.position.set(0, radius * 0.5, 0);
    light.name = 'EmberLight';
    group.add(light);

    group.userData.tags = ['boulder', 'ember', 'fire', 'scatter'];
    return group;
  }

  /**
   * Simple 3D noise function for boulder displacement.
   */
  private simpleNoise3D(x: number, y: number, z: number): number {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.543) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  }
}

// ============================================================================
// CachedTreeFactory
// ============================================================================

/**
 * Generates burning trees with fire particles at branch tips and charring.
 *
 * Creates a tree mesh with:
 * - Darkened (charred) bark material
 * - Fire particles at branch tip positions
 * - Glow from fire illuminating the trunk
 * - Optional ember particles rising from the trunk
 *
 * Usage:
 * ```ts
 * const factory = new CachedTreeFactory();
 * const tree = factory.generateBurningTree(42, config);
 * scene.add(tree);
 * ```
 */
export class CachedTreeFactory {
  /**
   * Generate a burning tree with fire particles at branch tips.
   *
   * @param seed   Random seed for deterministic generation
   * @param config Burning tree configuration
   * @returns THREE.Group containing tree mesh and fire particles
   */
  generateBurningTree(
    seed: number,
    config: Partial<BurningTreeConfig> = {},
  ): THREE.Group {
    const cfg: BurningTreeConfig = {
      height: 3.0,
      trunkRadius: 0.15,
      branchLevels: 3,
      firePerBranch: 8,
      charFactor: 0.7,
      barkColor: 0x4a3520,
      ...config,
    };

    const rng = new SeededRandom(seed);
    const group = new THREE.Group();
    group.name = 'BurningTree';

    // Generate trunk
    const trunkGeometry = new THREE.CylinderGeometry(
      cfg.trunkRadius * 0.6,
      cfg.trunkRadius,
      cfg.height,
      8,
    );

    // Charred bark color: darken based on charFactor
    const barkColor = new THREE.Color(cfg.barkColor);
    const charColor = new THREE.Color(0.05, 0.03, 0.01);
    const finalBarkColor = barkColor.clone().lerp(charColor, cfg.charFactor);

    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: finalBarkColor,
      roughness: 0.95,
      metalness: 0.0,
    });

    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = cfg.height / 2;
    trunk.castShadow = true;
    trunk.name = 'Trunk';
    group.add(trunk);

    // Generate branches and collect tip positions
    const branchTips: THREE.Vector3[] = [];
    this.generateBranches(group, cfg, rng, branchTips);

    // Create fire particles at branch tips
    const emitter = new FireParticleEmitter();
    const simulation = new FireSimulation();
    const renderer = new FireRenderer();

    // Emit fire particles at each branch tip
    const allParticles: FireParticle[] = [];
    for (const tip of branchTips) {
      const particles = emitter.emit(
        tip,
        {
          emissionRate: cfg.firePerBranch * 10,
          maxParticles: cfg.firePerBranch,
          emissionRadius: 0.1,
          initialSpeed: 0.8,
          upwardBias: 0.9,
          turbulenceStrength: 0.3,
          smokeFraction: 0.2,
          sizeRange: [0.05, 0.15],
          lifetimeRange: [0.5, 1.5],
        },
        rng,
        cfg.firePerBranch,
      );
      allParticles.push(...particles);
    }

    // Simulate a few steps to settle
    for (let i = 0; i < 5; i++) {
      simulation.update(allParticles, 0.033, {
        buoyancyStrength: 2.0,
        turbulenceStrength: 0.5,
        coolingRate: 0.3,
      });
    }

    // Render fire
    if (allParticles.length > 0) {
      const fireMesh = renderer.createFireMesh(allParticles);
      fireMesh.name = 'TreeFire';
      group.add(fireMesh);
    }

    // Add warm light near the top
    const light = new THREE.PointLight(0xff4400, 3, 8);
    light.position.set(0, cfg.height * 0.7, 0);
    light.name = 'FireLight';
    group.add(light);

    // Add ember particles rising from trunk
    this.addRisingEmbers(group, cfg, rng);

    group.userData.tags = ['tree', 'fire', 'burning', 'scatter'];
    return group;
  }

  /**
   * Generate branches recursively and collect tip positions.
   */
  private generateBranches(
    parent: THREE.Group | THREE.Mesh,
    config: BurningTreeConfig,
    rng: SeededRandom,
    branchTips: THREE.Vector3[],
    level: number = 0,
    basePosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
    baseDirection: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
  ): void {
    if (level >= config.branchLevels) {
      branchTips.push(basePosition.clone());
      return;
    }

    const branchesAtLevel = level === 0 ? 4 : 3;
    const branchLength = config.height * 0.3 / (level + 1);
    const branchRadius = config.trunkRadius * 0.5 / (level + 1);

    for (let b = 0; b < branchesAtLevel; b++) {
      const angle = (b / branchesAtLevel) * Math.PI * 2 + rng.next() * 0.5;
      const spreadAngle = rng.uniform(0.3, 0.8);

      const direction = baseDirection.clone();
      const axis = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      direction.applyAxisAngle(axis, spreadAngle);
      direction.normalize();

      const branchEnd = basePosition.clone().add(direction.clone().multiplyScalar(branchLength));

      // Create branch mesh
      const branchGeometry = new THREE.CylinderGeometry(
        branchRadius * 0.5,
        branchRadius,
        branchLength,
        6,
      );

      const charFactor = config.charFactor;
      const charColor = new THREE.Color(0.05, 0.03, 0.01);
      const barkColor = new THREE.Color(config.barkColor);
      const finalColor = barkColor.clone().lerp(charColor, charFactor * (1 - level * 0.2));

      const branchMaterial = new THREE.MeshStandardMaterial({
        color: finalColor,
        roughness: 0.9,
        metalness: 0.0,
      });

      const branch = new THREE.Mesh(branchGeometry, branchMaterial);
      branch.position.copy(
        basePosition.clone().add(branchEnd).multiplyScalar(0.5),
      );

      // Orient branch along direction
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, direction);
      branch.quaternion.copy(quat);

      branch.castShadow = true;
      branch.name = `Branch_L${level}_B${b}`;
      parent.add(branch);

      // Recurse
      this.generateBranches(
        parent,
        config,
        rng,
        branchTips,
        level + 1,
        branchEnd,
        direction,
      );
    }
  }

  /**
   * Add small ember particles rising from the trunk.
   */
  private addRisingEmbers(
    group: THREE.Group,
    config: BurningTreeConfig,
    rng: SeededRandom,
  ): void {
    const count = 30;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const angle = rng.next() * Math.PI * 2;
      const r = config.trunkRadius * (1 + rng.next() * 0.5);
      const height = rng.next() * config.height;

      positions[i3] = Math.cos(angle) * r;
      positions[i3 + 1] = height;
      positions[i3 + 2] = Math.sin(angle) * r;

      const temp = rng.uniform(0.4, 1.0);
      const color = new THREE.Color().lerpColors(
        new THREE.Color(0.6, 0.1, 0.0),
        new THREE.Color(1.0, 0.5, 0.05),
        temp,
      );
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      sizes[i] = rng.uniform(0.005, 0.02);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const embers = new THREE.Points(geometry, material);
    embers.name = 'RisingEmbers';
    group.add(embers);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick-create a fire effect at a given position.
 *
 * @param position Fire source position
 * @param seed     Random seed
 * @param scale    Fire scale multiplier
 * @returns THREE.Group with fire particles and light
 */
export function createFireEffect(
  position: THREE.Vector3 = new THREE.Vector3(),
  seed: number = 42,
  scale: number = 1.0,
): THREE.Group {
  const rng = new SeededRandom(seed);
  const emitter = new FireParticleEmitter();
  const simulation = new FireSimulation();
  const renderer = new FireRenderer();

  // Emit initial particles
  const particles = emitter.emit(
    position,
    {
      emissionRate: 200,
      maxParticles: 1000,
      emissionRadius: 0.3 * scale,
      initialSpeed: 1.2 * scale,
      upwardBias: 0.85,
      turbulenceStrength: 0.4,
      sizeRange: [0.08 * scale, 0.2 * scale],
    },
    rng,
    500,
  );

  // Simulate a few steps
  for (let i = 0; i < 10; i++) {
    simulation.update(particles, 0.033);
  }

  return renderer.createFireMesh(particles);
}

/**
 * Quick-create a boulder with embers.
 *
 * @param seed   Random seed
 * @param scale  Boulder scale
 * @returns THREE.Group with boulder and embers
 */
export function createEmberBoulder(
  seed: number = 42,
  scale: number = 1.0,
): THREE.Group {
  const factory = new CachedBoulderFactory();
  return factory.generateBoulderWithEmbers(seed, {
    radiusRange: [0.3 * scale, 1.0 * scale],
    emberCount: Math.round(50 * scale),
  });
}

/**
 * Quick-create a burning tree.
 *
 * @param seed   Random seed
 * @param scale  Tree scale
 * @returns THREE.Group with burning tree
 */
export function createBurningTree(
  seed: number = 42,
  scale: number = 1.0,
): THREE.Group {
  const factory = new CachedTreeFactory();
  return factory.generateBurningTree(seed, {
    height: 3.0 * scale,
    trunkRadius: 0.15 * scale,
    branchLevels: 3,
    firePerBranch: 8,
    charFactor: 0.7,
  });
}

export default FireParticleEmitter;
