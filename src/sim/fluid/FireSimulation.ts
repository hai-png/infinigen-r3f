/**
 * Fire Simulation System
 *
 * Particle-based fire simulation with temperature/velocity fields,
 * a caching system for frame-to-frame reuse, and a visual renderer.
 *
 * Physics:
 *   - Buoyancy proportional to temperature difference (hot air rises)
 *   - Stefan-Boltzmann cooling approximation (radiative heat loss)
 *   - Fuel consumption with temperature decay
 *   - Noise-based turbulence for flickering
 *   - Wind force support
 *
 * The FireCachingSystem allows storing and reusing fire states,
 * interpolating between cached snapshots for animation efficiency.
 *
 * @module FireSimulation
 */

import * as THREE from 'three';
import { createNoise3D, NoiseFunction3D } from 'simplex-noise';
import { SeededRandom } from '../../core/util/math/index';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface FireParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  temperature: number;   // 0-1 (1 = hottest)
  fuel: number;          // Remaining fuel (0 = burned out)
  age: number;           // Time since emission
  lifetime: number;      // Total lifetime
}

export interface FireConfig {
  /** Maximum number of live particles (default 2000) */
  maxParticles: number;
  /** Ambient temperature [0-1] (default 0.0) */
  ambientTemperature: number;
  /** Buoyancy coefficient — strength of upward force from heat (default 3.0) */
  buoyancyCoefficient: number;
  /** Wind force vector (default (0,0,0)) */
  wind: THREE.Vector3;
  /** Stefan-Boltzmann radiative cooling rate (default 0.8) */
  coolingRate: number;
  /** Fuel burn rate per second (default 0.6) */
  fuelBurnRate: number;
  /** Turbulence strength (default 1.5) */
  turbulenceStrength: number;
  /** Turbulence frequency scale (default 2.0) */
  turbulenceFrequency: number;
  /** Base emission speed (default 1.5) */
  emissionSpeed: number;
  /** Emission cone half-angle in radians (default 0.3) */
  emissionConeAngle: number;
  /** Base particle lifetime in seconds (default 2.0) */
  baseLifetime: number;
  /** Lifetime variance [0-1] (default 0.3) */
  lifetimeVariance: number;
  /** Particle size for rendering (default 0.08) */
  particleSize: number;
  /** Random seed for determinism (default 42) */
  seed: number;
}

const DEFAULT_FIRE_CONFIG: FireConfig = {
  maxParticles: 2000,
  ambientTemperature: 0.0,
  buoyancyCoefficient: 3.0,
  wind: new THREE.Vector3(0, 0, 0),
  coolingRate: 0.8,
  fuelBurnRate: 0.6,
  turbulenceStrength: 1.5,
  turbulenceFrequency: 2.0,
  emissionSpeed: 1.5,
  emissionConeAngle: 0.3,
  baseLifetime: 2.0,
  lifetimeVariance: 0.3,
  particleSize: 0.08,
  seed: 42,
};

// ─── FireSimulation ──────────────────────────────────────────────────────────

export class FireSimulation {
  private particles: FireParticle[] = [];
  private config: FireConfig;
  private rng: SeededRandom;
  private noise: NoiseFunction3D;
  private time: number = 0;

  constructor(config: Partial<FireConfig> = {}) {
    this.config = { ...DEFAULT_FIRE_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
    this.noise = createNoise3D(() => this.rng.next());
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Emit fire particles from a source position.
   * @param sourcePosition World position of the fire source
   * @param count Number of particles to emit
   * @param rng Optional SeededRandom for deterministic emission; uses internal RNG if omitted
   */
  emit(sourcePosition: THREE.Vector3, count: number, rng?: SeededRandom): void {
    const random = rng ?? this.rng;
    const maxP = this.config.maxParticles;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= maxP) break;

      // Emission direction: primarily upward with cone spread
      const theta = random.next() * Math.PI * 2;
      const phi = random.next() * this.config.emissionConeAngle;
      const speed = this.config.emissionSpeed * (0.7 + random.next() * 0.6);

      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      ).normalize();

      const lifetime = this.config.baseLifetime * (1 - this.config.lifetimeVariance + random.next() * this.config.lifetimeVariance * 2);

      // Slight positional spread around source
      const spread = 0.05;
      const pos = sourcePosition.clone().add(
        new THREE.Vector3(
          (random.next() - 0.5) * spread,
          random.next() * 0.02,
          (random.next() - 0.5) * spread,
        ),
      );

      this.particles.push({
        position: pos,
        velocity: dir.multiplyScalar(speed),
        temperature: 0.8 + random.next() * 0.2, // Start near-hottest
        fuel: 0.8 + random.next() * 0.2,
        age: 0,
        lifetime: Math.max(0.2, lifetime),
      });
    }
  }

  /**
   * Advance the simulation by dt seconds.
   * @param dt Time step in seconds (clamped to max 0.05)
   */
  step(dt: number): void {
    dt = Math.min(dt, 0.05);
    this.time += dt;

    const buoyancy = this.config.buoyancyCoefficient;
    const coolingRate = this.config.coolingRate;
    const fuelBurnRate = this.config.fuelBurnRate;
    const turbStrength = this.config.turbulenceStrength;
    const turbFreq = this.config.turbulenceFrequency;
    const wind = this.config.wind;
    const ambient = this.config.ambientTemperature;

    // Stefan-Boltzmann constant (scaled for our 0-1 temperature range)
    // Cooling power ~ T^4 gives radiative-like behavior
    const sigma = 5.67e-8; // Real Stefan-Boltzmann constant
    // We scale it for our normalized temperature domain
    const sbFactor = coolingRate * 0.001;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Age the particle
      p.age += dt;

      // Kill expired particles
      if (p.age >= p.lifetime || p.fuel <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      // a. Buoyancy: hot air rises — force proportional to temperature difference
      const tempDiff = p.temperature - ambient;
      const buoyancyForce = new THREE.Vector3(0, buoyancy * tempDiff, 0);
      p.velocity.add(buoyancyForce.clone().multiplyScalar(dt));

      // b. Wind force
      p.velocity.add(wind.clone().multiplyScalar(dt));

      // c. Fuel consumption & temperature decay (Stefan-Boltzmann approximation)
      // Radiative cooling: dT/dt ~ -sigma * T^4  (normalized)
      const T4 = p.temperature * p.temperature * p.temperature * p.temperature;
      const radiativeCooling = sbFactor * sigma * 1e8 * T4; // scaled to our range
      const convectiveCooling = coolingRate * (1 - p.fuel) * dt; // lose heat as fuel depletes

      p.temperature -= (radiativeCooling + convectiveCooling) * dt;
      p.temperature = Math.max(ambient, p.temperature);

      // Fuel consumption
      p.fuel -= fuelBurnRate * dt;
      p.fuel = Math.max(0, p.fuel);

      // d. Turbulence (noise-based flickering)
      const nx = this.noise(
        p.position.x * turbFreq + this.time * 0.5,
        p.position.y * turbFreq,
        p.position.z * turbFreq,
      );
      const ny = this.noise(
        p.position.x * turbFreq,
        p.position.y * turbFreq + this.time * 0.5 + 100,
        p.position.z * turbFreq,
      );
      const nz = this.noise(
        p.position.x * turbFreq,
        p.position.y * turbFreq,
        p.position.z * turbFreq + this.time * 0.5 + 200,
      );

      const turbulence = new THREE.Vector3(nx, ny, nz).multiplyScalar(turbStrength);
      p.velocity.add(turbulence.multiplyScalar(dt));

      // Drag to prevent runaway velocities
      p.velocity.multiplyScalar(1 - 0.5 * dt);

      // Update position
      p.position.add(p.velocity.clone().multiplyScalar(dt));
    }
  }

  /**
   * Get all current fire particles.
   */
  getParticles(): FireParticle[] {
    return this.particles;
  }

  /**
   * Get a grid-based temperature field for rendering.
   * Returns a flat Float32Array indexed [z * res² + y * res + x].
   * @param bounds Bounding box of the field
   * @param resolution Grid resolution per axis
   */
  getTemperatureField(bounds: THREE.Box3, resolution: number): Float32Array {
    const field = new Float32Array(resolution * resolution * resolution);

    const dx = (bounds.max.x - bounds.min.x) / resolution;
    const dy = (bounds.max.y - bounds.min.y) / resolution;
    const dz = (bounds.max.z - bounds.min.z) / resolution;
    const radius = 0.15; // Influence radius for temperature splatting

    for (const p of this.particles) {
      // Only splat hot particles
      if (p.temperature < 0.01) continue;

      const gxMin = Math.max(0, Math.floor((p.position.x - radius - bounds.min.x) / dx));
      const gyMin = Math.max(0, Math.floor((p.position.y - radius - bounds.min.y) / dy));
      const gzMin = Math.max(0, Math.floor((p.position.z - radius - bounds.min.z) / dz));
      const gxMax = Math.min(resolution - 1, Math.ceil((p.position.x + radius - bounds.min.x) / dx));
      const gyMax = Math.min(resolution - 1, Math.ceil((p.position.y + radius - bounds.min.y) / dy));
      const gzMax = Math.min(resolution - 1, Math.ceil((p.position.z + radius - bounds.min.z) / dz));

      for (let gz = gzMin; gz <= gzMax; gz++) {
        for (let gy = gyMin; gy <= gyMax; gy++) {
          for (let gx = gxMin; gx <= gxMax; gx++) {
            const worldX = bounds.min.x + (gx + 0.5) * dx;
            const worldY = bounds.min.y + (gy + 0.5) * dy;
            const worldZ = bounds.min.z + (gz + 0.5) * dz;

            const dist = Math.sqrt(
              (p.position.x - worldX) ** 2 +
              (p.position.y - worldY) ** 2 +
              (p.position.z - worldZ) ** 2,
            );

            if (dist < radius) {
              const influence = 1 - dist / radius;
              const idx = gz * resolution * resolution + gy * resolution + gx;
              field[idx] += p.temperature * influence * influence;
            }
          }
        }
      }
    }

    // Clamp field values
    for (let i = 0; i < field.length; i++) {
      field[i] = Math.min(1, field[i]);
    }

    return field;
  }

  /**
   * Get the current simulation time.
   */
  getTime(): number {
    return this.time;
  }

  /**
   * Set the wind force vector.
   */
  setWind(wind: THREE.Vector3): void {
    this.config.wind.copy(wind);
  }

  /**
   * Reset the simulation, clearing all particles.
   */
  reset(): void {
    this.particles = [];
    this.time = 0;
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Get the current particle count.
   */
  getParticleCount(): number {
    return this.particles.length;
  }
}

// ─── FireCachingSystem ───────────────────────────────────────────────────────

interface CachedFireState {
  particles: SerializedFireParticle[];
  timestamp: number;
}

interface SerializedFireParticle {
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  temperature: number;
  fuel: number;
  age: number;
  lifetime: number;
}

export class FireCachingSystem {
  private cache: Map<string, CachedFireState> = new Map();
  private maxCacheSize: number;

  constructor(maxCacheSize: number = 100) {
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Store a fire particle state under a key.
   */
  cacheState(key: string, state: FireParticle[]): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      let oldestKey = '';
      let oldestTime = Infinity;
      for (const [k, v] of this.cache) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      particles: state.map(serializeParticle),
      timestamp: performance.now(),
    });
  }

  /**
   * Retrieve a cached fire state by key.
   * Returns null if the key is not found.
   */
  getCachedState(key: string): FireParticle[] | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    return cached.particles.map(deserializeParticle);
  }

  /**
   * Interpolate between two cached fire states at parameter t ∈ [0, 1].
   * Handles particle count differences by pairing particles by index
   * and padding the shorter state with copies of its last particle.
   *
   * @param stateA First fire state
   * @param stateB Second fire state
   * @param t Interpolation parameter (0 = stateA, 1 = stateB)
   */
  interpolateBetweenStates(stateA: FireParticle[], stateB: FireParticle[], t: number): FireParticle[] {
    const maxLen = Math.max(stateA.length, stateB.length);
    const result: FireParticle[] = [];

    for (let i = 0; i < maxLen; i++) {
      const a = i < stateA.length ? stateA[i] : stateA[stateA.length - 1];
      const b = i < stateB.length ? stateB[i] : stateB[stateB.length - 1];

      result.push({
        position: new THREE.Vector3(
          a.position.x + t * (b.position.x - a.position.x),
          a.position.y + t * (b.position.y - a.position.y),
          a.position.z + t * (b.position.z - a.position.z),
        ),
        velocity: new THREE.Vector3(
          a.velocity.x + t * (b.velocity.x - a.velocity.x),
          a.velocity.y + t * (b.velocity.y - a.velocity.y),
          a.velocity.z + t * (b.velocity.z - a.velocity.z),
        ),
        temperature: a.temperature + t * (b.temperature - a.temperature),
        fuel: a.fuel + t * (b.fuel - a.fuel),
        age: a.age + t * (b.age - a.age),
        lifetime: a.lifetime + t * (b.lifetime - a.lifetime),
      });
    }

    return result;
  }

  /**
   * Check if a key exists in the cache.
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current cache size.
   */
  size(): number {
    return this.cache.size;
  }
}

// ─── Serialization helpers ───────────────────────────────────────────────────

function serializeParticle(p: FireParticle): SerializedFireParticle {
  return {
    px: p.position.x, py: p.position.y, pz: p.position.z,
    vx: p.velocity.x, vy: p.velocity.y, vz: p.velocity.z,
    temperature: p.temperature,
    fuel: p.fuel,
    age: p.age,
    lifetime: p.lifetime,
  };
}

function deserializeParticle(s: SerializedFireParticle): FireParticle {
  return {
    position: new THREE.Vector3(s.px, s.py, s.pz),
    velocity: new THREE.Vector3(s.vx, s.vy, s.vz),
    temperature: s.temperature,
    fuel: s.fuel,
    age: s.age,
    lifetime: s.lifetime,
  };
}

// ─── FireRenderer ────────────────────────────────────────────────────────────

/**
 * Visual renderer for fire particles.
 *
 * Color gradient based on temperature:
 *   White (1.0) → Yellow (0.7) → Orange (0.4) → Red (0.2) → Dark smoke (0.0)
 *
 * Supports both THREE.Points rendering and custom sprite-based rendering.
 * Smoke trail is rendered for burned-out / low-fuel particles.
 */
export class FireRenderer {
  private points: THREE.Points | null = null;
  private smokePoints: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry;
  private smokeGeometry: THREE.BufferGeometry;
  private maxParticles: number;
  private particleSize: number;
  private group: THREE.Group;

  constructor(maxParticles: number = 2000, particleSize: number = 0.08) {
    this.maxParticles = maxParticles;
    this.particleSize = particleSize;

    this.geometry = new THREE.BufferGeometry();
    this.smokeGeometry = new THREE.BufferGeometry();

    // Pre-allocate buffers for fire particles
    const positions = new Float32Array(maxParticles * 3);
    const colors = new Float32Array(maxParticles * 4); // RGBA
    const sizes = new Float32Array(maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setDrawRange(0, 0);

    // Pre-allocate for smoke particles
    const smokePositions = new Float32Array(maxParticles * 3);
    const smokeColors = new Float32Array(maxParticles * 4);
    const smokeSizes = new Float32Array(maxParticles);

    this.smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
    this.smokeGeometry.setAttribute('color', new THREE.BufferAttribute(smokeColors, 4));
    this.smokeGeometry.setAttribute('size', new THREE.BufferAttribute(smokeSizes, 1));
    this.smokeGeometry.setDrawRange(0, 0);

    // Fire material — emissive, additive blending for glow
    const fireMaterial = new THREE.PointsMaterial({
      size: particleSize,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, fireMaterial);

    // Smoke material — standard alpha blending
    const smokeMaterial = new THREE.PointsMaterial({
      size: particleSize * 2.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.smokePoints = new THREE.Points(this.smokeGeometry, smokeMaterial);

    this.group = new THREE.Group();
    this.group.add(this.points);
    this.group.add(this.smokePoints);
  }

  /**
   * Get the THREE.Group containing fire and smoke points.
   * Add this to your scene.
   */
  getObject(): THREE.Group {
    return this.group;
  }

  /**
   * Update the visual representation from fire particles.
   */
  update(particles: FireParticle[]): void {
    let fireCount = 0;
    let smokeCount = 0;

    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.geometry.getAttribute('color') as THREE.BufferAttribute;
    const sizeAttr = this.geometry.getAttribute('size') as THREE.BufferAttribute;

    const smokePosAttr = this.smokeGeometry.getAttribute('position') as THREE.BufferAttribute;
    const smokeColAttr = this.smokeGeometry.getAttribute('color') as THREE.BufferAttribute;
    const smokeSizeAttr = this.smokeGeometry.getAttribute('size') as THREE.BufferAttribute;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const isSmoke = p.temperature < 0.15 || p.fuel < 0.1;

      if (isSmoke) {
        if (smokeCount >= this.maxParticles) continue;

        smokePosAttr.setXYZ(smokeCount, p.position.x, p.position.y, p.position.z);

        // Dark gray smoke with alpha based on remaining lifetime
        const lifeRatio = 1 - p.age / p.lifetime;
        const alpha = Math.min(1, lifeRatio * 0.5 * (1 - p.fuel));
        const gray = 0.15 + p.temperature * 0.15;
        smokeColAttr.setXYZW(smokeCount, gray, gray, gray, alpha);

        const size = this.particleSize * (2 + (1 - lifeRatio) * 4);
        smokeSizeAttr.setX(smokeCount, size);

        smokeCount++;
      } else {
        if (fireCount >= this.maxParticles) continue;

        posAttr.setXYZ(fireCount, p.position.x, p.position.y, p.position.z);

        // Temperature-based color: white → yellow → orange → red
        const color = this.temperatureToColor(p.temperature, p.fuel);
        colAttr.setXYZW(fireCount, color.r, color.g, color.b, color.a);

        // Size varies: hotter = slightly larger core
        const lifeRatio = 1 - p.age / p.lifetime;
        const size = this.particleSize * (0.5 + p.temperature * 1.0) * lifeRatio;
        sizeAttr.setX(fireCount, size);

        fireCount++;
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, fireCount);

    smokePosAttr.needsUpdate = true;
    smokeColAttr.needsUpdate = true;
    smokeSizeAttr.needsUpdate = true;
    this.smokeGeometry.setDrawRange(0, smokeCount);
  }

  /**
   * Map temperature + fuel to a fire color.
   *
   * Gradient: White (1.0) → Yellow (0.7) → Orange (0.4) → Red (0.2) → Dark (0.0)
   */
  private temperatureToColor(temperature: number, fuel: number): { r: number; g: number; b: number; a: number } {
    let r: number, g: number, b: number;

    if (temperature > 0.8) {
      // White to bright yellow
      const t = (temperature - 0.8) / 0.2;
      r = 1.0;
      g = 0.9 + t * 0.1;
      b = t * 0.8;
    } else if (temperature > 0.5) {
      // Yellow to orange
      const t = (temperature - 0.5) / 0.3;
      r = 1.0;
      g = 0.4 + t * 0.5;
      b = 0.0;
    } else if (temperature > 0.2) {
      // Orange to red
      const t = (temperature - 0.2) / 0.3;
      r = 0.8 + t * 0.2;
      g = t * 0.4;
      b = 0.0;
    } else {
      // Red to dark ember
      const t = temperature / 0.2;
      r = t * 0.8;
      g = 0.0;
      b = 0.0;
    }

    // Alpha: fade as fuel depletes and particle ages
    const alpha = Math.min(1, fuel * 2) * Math.min(1, temperature * 3);

    return { r, g, b, a: Math.max(0, Math.min(1, alpha)) };
  }

  /**
   * Clean up GPU resources.
   */
  dispose(): void {
    this.geometry.dispose();
    this.smokeGeometry.dispose();
    if (this.points) {
      (this.points.material as THREE.Material).dispose();
    }
    if (this.smokePoints) {
      (this.smokePoints.material as THREE.Material).dispose();
    }
  }
}

export default FireSimulation;
