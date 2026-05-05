/**
 * FireParticleSystem.ts — Production-Quality Fire Particle System
 *
 * Provides a complete fire particle simulation and rendering system for
 * the infinigen-r3f project, covering all fire effects from the original
 * Infinigen: volumetric fire rendering, particle-based embers, smoke plumes,
 * heat distortion, and fire-light interaction.
 *
 * Components:
 * 1. FireParticle     — Particle data interface (position, velocity, temperature, etc.)
 * 2. FireConfig       — Configuration for the entire fire system
 * 3. FireEmitter      — Emits fire particles from various emitter shapes
 * 4. FireParticleSystem — Full fire simulation with physics, color, and size updates
 * 5. FireShaderMaterial — Custom GLSL shader for fire rendering with temperature colors
 * 6. SmokeSystem      — Secondary smoke particle system
 * 7. HeatDistortionPass — Post-processing heat shimmer effect
 *
 * @module assets/particles/fire
 */

import * as THREE from 'three';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * A single fire particle with full state for simulation and rendering.
 */
export interface FireParticle {
  /** World-space position */
  position: THREE.Vector3;
  /** World-space velocity */
  velocity: THREE.Vector3;
  /** Normalized life (1 = just born, 0 = dead) */
  life: number;
  /** Maximum lifetime in seconds */
  maxLife: number;
  /** Temperature driving color: 1.0 = white-hot, 0.0 = dark smoke */
  temperature: number;
  /** Current particle size */
  size: number;
  /** Current opacity */
  opacity: number;
  /** Accumulated age in seconds */
  age: number;
  /** Whether particle has been marked as smoke */
  isSmoke: boolean;
  /** Random seed for per-particle variation */
  seed: number;
}

/**
 * Emitter shape types for fire particle emission.
 */
export type EmitterShape = 'POINT' | 'LINE' | 'CIRCLE' | 'MESH_SURFACE';

/**
 * Configuration for the fire particle system.
 */
export interface FireConfig {
  /** Maximum number of simultaneous particles */
  maxParticles: number;
  /** Emission rate in particles per second */
  emissionRate: number;
  /** Particle lifespan range [min, max] in seconds */
  particleLifespan: [number, number];
  /** Initial speed range [min, max] */
  initialSpeed: [number, number];
  /** Initial temperature range [min, max] (0-1) */
  initialTemperature: [number, number];
  /** Particle size range [min, max] */
  particleSize: [number, number];
  /** Buoyancy force strength (upward acceleration from heat) */
  buoyancy: number;
  /** Wind direction */
  windDirection: THREE.Vector3;
  /** Wind strength multiplier */
  windStrength: number;
  /** Emitter shape */
  emitterShape: EmitterShape;
  /** Emitter position in world space */
  emitterPosition: THREE.Vector3;
  /** Emitter radius (for CIRCLE shape) or half-extent */
  emitterRadius: number;
  /** Cooling rate per second (temperature decrease) */
  coolingRate: number;
  /** Turbulence noise scale */
  turbulenceScale: number;
  /** Turbulence strength */
  turbulenceStrength: number;
  /** Drag coefficient (0-1, velocity damping per second) */
  drag: number;
  /** Fraction of particles that transition to smoke (0-1) */
  smokeTransitionFraction: number;
  /** Temperature threshold below which particles become smoke */
  smokeTemperatureThreshold: number;
  /** Fire intensity (0-1), scales emission and visual brightness */
  intensity: number;
}

/**
 * Default fire configuration with sensible values for a campfire-scale effect.
 */
export const DEFAULT_FIRE_CONFIG: FireConfig = {
  maxParticles: 5000,
  emissionRate: 200,
  particleLifespan: [0.8, 2.5],
  initialSpeed: [1.0, 3.0],
  initialTemperature: [0.7, 1.0],
  particleSize: [0.08, 0.25],
  buoyancy: 2.5,
  windDirection: new THREE.Vector3(0, 0, 0),
  windStrength: 0.0,
  emitterShape: 'CIRCLE',
  emitterPosition: new THREE.Vector3(0, 0, 0),
  emitterRadius: 0.3,
  coolingRate: 0.5,
  turbulenceScale: 3.0,
  turbulenceStrength: 1.2,
  drag: 0.97,
  smokeTransitionFraction: 0.35,
  smokeTemperatureThreshold: 0.25,
  intensity: 1.0,
};

// ============================================================================
// GLSL Shader Strings
// ============================================================================

/**
 * Fire vertex shader: billboard particles facing camera with size attenuation.
 */
const FIRE_VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uWind;

attribute float aLife;
attribute float aTemperature;
attribute float aSize;
attribute float aOpacity;
attribute float aSeed;

varying float vLife;
varying float vTemperature;
varying float vOpacity;
varying float vSeed;

void main() {
  vLife = aLife;
  vTemperature = aTemperature;
  vOpacity = aOpacity;
  vSeed = aSeed;

  // Billboard: use only camera rotation (model matrix position offset)
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  // Size attenuation: size decreases with distance
  float dist = -mvPosition.z;
  float attenuation = 300.0 / max(dist, 1.0);

  // Size varies with life and temperature
  // Particles grow slightly then shrink as they die
  float lifeCurve = sin(aLife * 3.14159) * 0.6 + 0.4;
  float tempSize = 0.5 + aTemperature * 1.0;
  float finalSize = aSize * attenuation * lifeCurve * tempSize * uIntensity;

  gl_PointSize = clamp(finalSize, 1.0, 128.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

/**
 * Fire fragment shader: soft circular particles with temperature-based coloring
 * and additive blending for bright fire effect.
 *
 * Temperature -> Color gradient:
 *   1.0 = White-hot (1.0, 1.0, 0.95)
 *   0.8 = Yellow     (1.0, 0.9, 0.3)
 *   0.6 = Orange     (1.0, 0.5, 0.1)
 *   0.4 = Red        (0.8, 0.15, 0.02)
 *   0.2 = Dark red   (0.3, 0.05, 0.01)
 *   0.0 = Dark smoke (0.05, 0.05, 0.05)
 */
const FIRE_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uIntensity;

varying float vLife;
varying float vTemperature;
varying float vOpacity;
varying float vSeed;

// Temperature-based color gradient
vec3 fireColor(float temp) {
  // Color stops: white-hot -> yellow -> orange -> red -> dark
  vec3 c;
  if (temp > 0.85) {
    // White to bright yellow
    float t = (temp - 0.85) / 0.15;
    c = mix(vec3(1.0, 0.9, 0.3), vec3(1.0, 1.0, 0.95), t);
  } else if (temp > 0.6) {
    // Yellow to orange
    float t = (temp - 0.6) / 0.25;
    c = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.9, 0.3), t);
  } else if (temp > 0.35) {
    // Orange to red
    float t = (temp - 0.35) / 0.25;
    c = mix(vec3(0.8, 0.15, 0.02), vec3(1.0, 0.5, 0.1), t);
  } else if (temp > 0.15) {
    // Red to dark red
    float t = (temp - 0.15) / 0.20;
    c = mix(vec3(0.2, 0.04, 0.01), vec3(0.8, 0.15, 0.02), t);
  } else {
    // Dark red to dark smoke
    float t = temp / 0.15;
    c = mix(vec3(0.05, 0.05, 0.05), vec3(0.2, 0.04, 0.01), t);
  }
  return c;
}

// Simple noise for flickering effect
float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float noise1D(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}

void main() {
  // Circular soft particle
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  // Soft edge with gaussian-like falloff
  float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
  alpha *= alpha; // Sharper falloff for fire look

  // Discard fully transparent pixels
  if (alpha < 0.01) discard;

  // Get temperature-based color
  vec3 color = fireColor(vTemperature);

  // Add subtle flickering based on seed and time
  float flicker = 0.9 + 0.1 * noise1D(vSeed * 100.0 + uTime * 8.0);
  color *= flicker;

  // Intensity scaling (HDR-friendly, can exceed 1.0)
  color *= uIntensity * 1.5;

  // Opacity modulation: fade in at birth, fade out at death
  float lifeFade = smoothstep(0.0, 0.1, vLife) * smoothstep(0.0, 0.3, 1.0 - vLife);
  float finalAlpha = alpha * vOpacity * lifeFade;

  // Hot particles are brighter/more opaque
  finalAlpha *= 0.5 + vTemperature * 0.5;

  gl_FragColor = vec4(color, finalAlpha);
}
`;

/**
 * Smoke vertex shader.
 */
const SMOKE_VERTEX_SHADER = /* glsl */ `
uniform float uTime;

attribute float aLife;
attribute float aSize;
attribute float aOpacity;

varying float vLife;
varying float vOpacity;

void main() {
  vLife = aLife;
  vOpacity = aOpacity;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float dist = -mvPosition.z;
  float attenuation = 300.0 / max(dist, 1.0);

  // Smoke grows larger as it ages
  float growFactor = 1.0 + (1.0 - aLife) * 2.0;
  float finalSize = aSize * attenuation * growFactor;

  gl_PointSize = clamp(finalSize, 1.0, 200.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

/**
 * Smoke fragment shader: gray/black particles with noise-based opacity.
 */
const SMOKE_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;

varying float vLife;
varying float vOpacity;

// Simple hash for noise
float hash2D(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2D(i);
  float b = hash2D(i + vec2(1.0, 0.0));
  float c = hash2D(i + vec2(0.0, 1.0));
  float d = hash2D(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  // Soft circular particle with noise-based opacity variation
  float baseAlpha = 1.0 - smoothstep(0.0, 0.5, dist);

  // Noise-based opacity for volumetric look
  vec2 noiseCoord = gl_PointCoord * 3.0 + vec2(uTime * 0.2);
  float noiseAlpha = noise2D(noiseCoord) * 0.6 + 0.4;

  float alpha = baseAlpha * noiseAlpha;

  if (alpha < 0.01) discard;

  // Smoke color: gray with slight warm tint near fire
  vec3 smokeColor = vec3(0.15, 0.14, 0.13);

  // Fade out over lifetime
  float lifeFade = smoothstep(0.0, 0.15, vLife) * smoothstep(0.0, 0.5, 1.0 - vLife);
  float finalAlpha = alpha * vOpacity * lifeFade * 0.4;

  gl_FragColor = vec4(smokeColor, finalAlpha);
}
`;

/**
 * Heat distortion vertex shader for fullscreen quad.
 */
const HEAT_DISTORTION_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Heat distortion fragment shader: applies screen-space distortion
 * based on heat map with noise-based UV offsets.
 */
const HEAT_DISTORTION_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uInputTexture;
uniform sampler2D uHeatTexture;
uniform float uStrength;
uniform float uTime;

varying vec2 vUv;

// Simple hash
float hash2D(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2D(i);
  float b = hash2D(i + vec2(1.0, 0.0));
  float c = hash2D(i + vec2(0.0, 1.0));
  float d = hash2D(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  // Sample heat at this pixel
  float heat = texture2D(uHeatTexture, vUv).r;

  if (heat < 0.01) {
    gl_FragColor = texture2D(uInputTexture, vUv);
    return;
  }

  // Noise-based UV distortion proportional to heat
  float noiseVal = noise2D(vUv * 8.0 + uTime * 0.5);
  float noiseVal2 = noise2D(vUv * 12.0 - uTime * 0.3 + 5.0);

  vec2 distortion = vec2(
    (noiseVal - 0.5) * 2.0,
    (noiseVal2 - 0.5) * 2.0 - 0.3  // Upward bias for rising heat
  );

  // Scale distortion by heat and strength
  vec2 distortedUV = vUv + distortion * heat * uStrength * 0.02;

  gl_FragColor = texture2D(uInputTexture, distortedUV);
}
`;

// ============================================================================
// FireEmitter
// ============================================================================

/**
 * Emits fire particles from a source with configurable shape and intensity.
 *
 * Supports emitter shapes: POINT, LINE, CIRCLE, MESH_SURFACE.
 * Each emitter has a unique ID for management by FireParticleSystem.
 */
export class FireEmitter {
  /** Unique emitter identifier */
  readonly id: string;
  /** Emitter position in world space */
  position: THREE.Vector3;
  /** Emission direction (normalized) */
  direction: THREE.Vector3;
  /** Fire intensity (0-1) controlling emission rate and brightness */
  intensity: number;
  /** Emitter shape */
  shape: EmitterShape;
  /** Emitter radius for CIRCLE shape */
  radius: number;
  /** Line endpoints for LINE shape */
  lineStart: THREE.Vector3;
  lineEnd: THREE.Vector3;
  /** Mesh for MESH_SURFACE shape emission */
  mesh: THREE.Mesh | null;
  /** Accumulated emission time for rate-based emission */
  private emissionAccumulator: number;
  /** Static counter for unique IDs */
  private static nextEmitterId = 0;

  constructor(config: {
    position?: THREE.Vector3;
    direction?: THREE.Vector3;
    intensity?: number;
    shape?: EmitterShape;
    radius?: number;
    lineStart?: THREE.Vector3;
    lineEnd?: THREE.Vector3;
    mesh?: THREE.Mesh;
  }) {
    this.id = `fire_emitter_${FireEmitter.nextEmitterId++}`;
    this.position = config.position?.clone() ?? new THREE.Vector3(0, 0, 0);
    this.direction = config.direction?.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
    this.intensity = config.intensity ?? 1.0;
    this.shape = config.shape ?? 'CIRCLE';
    this.radius = config.radius ?? 0.3;
    this.lineStart = config.lineStart?.clone() ?? new THREE.Vector3(-0.5, 0, 0);
    this.lineEnd = config.lineEnd?.clone() ?? new THREE.Vector3(0.5, 0, 0);
    this.mesh = config.mesh ?? null;
    this.emissionAccumulator = 0;
  }

  /**
   * Emit N fire particles from this emitter.
   *
   * @param count Number of particles to emit
   * @param config Fire system configuration for initial properties
   * @returns Array of newly created FireParticle instances
   */
  emit(count: number, config: FireConfig): FireParticle[] {
    const particles: FireParticle[] = [];

    for (let i = 0; i < count; i++) {
      const spawnPos = this.generateSpawnPosition(config);
      const velocity = this.generateInitialVelocity(config);

      // Random temperature within range
      const tempMin = config.initialTemperature[0];
      const tempMax = config.initialTemperature[1];
      const temperature = tempMin + Math.random() * (tempMax - tempMin);

      // Random size within range
      const sizeMin = config.particleSize[0];
      const sizeMax = config.particleSize[1];
      const size = sizeMin + Math.random() * (sizeMax - sizeMin);

      // Random lifespan within range
      const lifeMin = config.particleLifespan[0];
      const lifeMax = config.particleLifespan[1];
      const maxLife = lifeMin + Math.random() * (lifeMax - lifeMin);

      particles.push({
        position: spawnPos,
        velocity,
        life: 1.0,
        maxLife,
        temperature: temperature * this.intensity,
        size,
        opacity: 1.0,
        age: 0,
        isSmoke: false,
        seed: Math.random() * 1000,
      });
    }

    return particles;
  }

  /**
   * Update emitter state (time-based emission).
   *
   * @param dt Timestep in seconds
   * @param config Fire system configuration
   * @returns Array of newly emitted particles
   */
  update(dt: number, config: FireConfig): FireParticle[] {
    const effectiveRate = config.emissionRate * this.intensity;
    this.emissionAccumulator += effectiveRate * dt;

    const count = Math.floor(this.emissionAccumulator);
    this.emissionAccumulator -= count;

    if (count > 0) {
      return this.emit(count, config);
    }
    return [];
  }

  /**
   * Control fire intensity (0-1).
   *
   * @param intensity New intensity value (clamped to 0-1)
   */
  setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Generate spawn position based on emitter shape.
   */
  private generateSpawnPosition(config: FireConfig): THREE.Vector3 {
    switch (this.shape) {
      case 'POINT':
        return this.position.clone().add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.05,
            (Math.random() - 0.5) * 0.05,
            (Math.random() - 0.5) * 0.05,
          ),
        );

      case 'LINE': {
        const t = Math.random();
        const point = this.lineStart.clone().lerp(this.lineEnd.clone(), t);
        // Small random offset perpendicular to line
        point.add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.05,
            0,
            (Math.random() - 0.5) * 0.05,
          ),
        );
        return point.add(this.position);
      }

      case 'CIRCLE': {
        // Uniform random point within circle
        const angle = Math.random() * Math.PI * 2;
        const r = this.radius * Math.sqrt(Math.random());
        const offset = new THREE.Vector3(
          r * Math.cos(angle),
          0,
          r * Math.sin(angle),
        );
        return this.position.clone().add(offset);
      }

      case 'MESH_SURFACE': {
        if (this.mesh && this.mesh.geometry) {
          const geometry = this.mesh.geometry;
          const posAttr = geometry.getAttribute('position');
          if (posAttr) {
            // Random triangle sampling
            const index = geometry.getIndex();
            let triCount: number;
            if (index) {
              triCount = index.count / 3;
            } else {
              triCount = posAttr.count / 3;
            }
            const triIndex = Math.floor(Math.random() * triCount) * 3;

            let i0: number, i1: number, i2: number;
            if (index) {
              i0 = index.getX(triIndex);
              i1 = index.getX(triIndex + 1);
              i2 = index.getX(triIndex + 2);
            } else {
              i0 = triIndex;
              i1 = triIndex + 1;
              i2 = triIndex + 2;
            }

            // Barycentric interpolation
            const u = Math.random();
            const v = Math.random();
            const w = 1 - u - v;
            const absW = Math.abs(w);

            const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
            const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
            const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

            const point = v0.multiplyScalar(absW).add(v1.multiplyScalar(u)).add(v2.multiplyScalar(v));

            // Apply mesh world transform
            point.applyMatrix4(this.mesh.matrixWorld);
            return point.add(this.position);
          }
        }
        // Fallback to point emission
        return this.position.clone();
      }

      default:
        return this.position.clone();
    }
  }

  /**
   * Generate initial velocity for a fire particle.
   * Direction biased upward with spread and speed variation.
   */
  private generateInitialVelocity(config: FireConfig): THREE.Vector3 {
    const speedMin = config.initialSpeed[0];
    const speedMax = config.initialSpeed[1];
    const speed = speedMin + Math.random() * (speedMax - speedMin);

    // Primary direction + spread
    const spread = 0.3;
    const velocity = this.direction.clone().multiplyScalar(speed);
    velocity.x += (Math.random() - 0.5) * spread * speed;
    velocity.y += Math.random() * 0.2 * speed; // Upward bias
    velocity.z += (Math.random() - 0.5) * spread * speed;

    return velocity;
  }
}

// ============================================================================
// FireShaderMaterial
// ============================================================================

/**
 * Custom shader material for fire rendering with temperature-based coloring.
 *
 * Features:
 * - Vertex shader: billboard particles facing camera with size attenuation
 * - Fragment shader: soft circular particles with temperature->color gradient
 * - Additive blending for bright fire effect
 * - White (hot) -> Yellow -> Orange -> Red -> Dark smoke color ramp
 */
export class FireShaderMaterial {
  private material: THREE.ShaderMaterial;
  private uniforms: {
    uTime: { value: number };
    uIntensity: { value: number };
    uWind: { value: THREE.Vector3 };
  };

  constructor() {
    this.uniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
      uWind: { value: new THREE.Vector3(0, 0, 0) },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: FIRE_VERTEX_SHADER,
      fragmentShader: FIRE_FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
  }

  /**
   * Create and return the THREE.ShaderMaterial.
   */
  createMaterial(): THREE.ShaderMaterial {
    return this.material;
  }

  /**
   * Update shader uniforms each frame.
   *
   * @param time Current elapsed time in seconds
   * @param wind Current wind vector
   */
  updateUniforms(time: number, wind: THREE.Vector3): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uWind.value.copy(wind);
  }

  /**
   * Set fire intensity uniform.
   */
  setIntensity(intensity: number): void {
    this.uniforms.uIntensity.value = Math.max(0, Math.min(2, intensity));
  }

  /**
   * Get the current material instance.
   */
  getMaterial(): THREE.ShaderMaterial {
    return this.material;
  }

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    this.material.dispose();
  }
}

// ============================================================================
// SmokeSystem
// ============================================================================

/**
 * Smoke particle data.
 */
interface SmokeParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  opacity: number;
  age: number;
  seed: number;
}

/**
 * Secondary smoke particle system for fire effects.
 *
 * Smoke particles are emitted above the fire when particle temperature
 * drops below a threshold. They have gray/black coloring with noise-based
 * opacity, drift upward with wind, and fade out over time.
 */
export class SmokeSystem {
  private particles: SmokeParticle[];
  private maxParticles: number;
  private mesh: THREE.Points | null;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.BufferGeometry;
  private windDirection: THREE.Vector3;
  private windStrength: number;

  constructor(maxParticles: number = 2000) {
    this.particles = [];
    this.maxParticles = maxParticles;
    this.mesh = null;
    this.windDirection = new THREE.Vector3(0, 0, 0);
    this.windStrength = 0;

    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: SMOKE_VERTEX_SHADER,
      fragmentShader: SMOKE_FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: true,
    });
  }

  /**
   * Emit smoke particles at a given position.
   *
   * @param position World-space emission position
   * @param count Number of smoke particles to emit
   * @param baseVelocity Inherited velocity from parent fire particle
   */
  emitSmoke(
    position: THREE.Vector3,
    count: number,
    baseVelocity: THREE.Vector3 = new THREE.Vector3(0, 0.5, 0),
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        // Remove oldest particle
        this.particles.shift();
      }

      this.particles.push({
        position: position.clone().add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            Math.random() * 0.1,
            (Math.random() - 0.5) * 0.2,
          ),
        ),
        velocity: baseVelocity.clone().multiplyScalar(0.3).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            0.3 + Math.random() * 0.5,
            (Math.random() - 0.5) * 0.3,
          ),
        ),
        life: 1.0,
        maxLife: 2.0 + Math.random() * 3.0,
        size: 0.2 + Math.random() * 0.3,
        opacity: 0.3 + Math.random() * 0.3,
        age: 0,
        seed: Math.random() * 1000,
      });
    }
  }

  /**
   * Update smoke particles.
   *
   * @param dt Timestep in seconds
   */
  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Age the particle
      p.age += dt;
      p.life = Math.max(0, 1.0 - p.age / p.maxLife);

      // Remove dead particles
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      // Buoyancy: smoke rises slowly
      p.velocity.y += 0.3 * dt;

      // Wind influence
      p.velocity.add(
        this.windDirection.clone().multiplyScalar(this.windStrength * dt),
      );

      // Drag
      p.velocity.multiplyScalar(1 - 0.5 * dt);

      // Turbulence for natural drift
      const turbX = Math.sin(p.age * 2.0 + p.seed) * 0.1;
      const turbZ = Math.cos(p.age * 1.7 + p.seed * 1.3) * 0.1;
      p.velocity.x += turbX * dt;
      p.velocity.z += turbZ * dt;

      // Integrate position
      p.position.add(p.velocity.clone().multiplyScalar(dt));

      // Fade out
      p.opacity = Math.max(0, p.opacity - 0.1 * dt);
    }

    // Update material time
    this.material.uniforms.uTime.value += dt;

    // Rebuild geometry buffers
    this.updateGeometry();
  }

  /**
   * Get the smoke mesh for scene rendering.
   */
  getMesh(): THREE.Points {
    if (!this.mesh) {
      this.updateGeometry();
      this.mesh = new THREE.Points(this.geometry, this.material);
      this.mesh.name = 'SmokeSystem';
      this.mesh.frustumCulled = false;
    }
    return this.mesh;
  }

  /**
   * Set wind parameters affecting smoke drift.
   */
  setWind(direction: THREE.Vector3, strength: number): void {
    this.windDirection.copy(direction).normalize();
    this.windStrength = strength;
  }

  /**
   * Update geometry buffers from current particle state.
   */
  private updateGeometry(): void {
    const count = this.particles.length;

    const positions = new Float32Array(count * 3);
    const lifes = new Float32Array(count);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      const i3 = i * 3;

      positions[i3] = p.position.x;
      positions[i3 + 1] = p.position.y;
      positions[i3 + 2] = p.position.z;

      lifes[i] = p.life;
      sizes[i] = p.size;
      opacities[i] = p.opacity;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(lifes, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aLife.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aOpacity.needsUpdate = true;
  }

  /**
   * Get current smoke particle count.
   */
  getParticleCount(): number {
    return this.particles.length;
  }

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.particles = [];
  }
}

// ============================================================================
// HeatDistortionPass
// ============================================================================

/**
 * Post-processing pass for heat shimmer / heat distortion effect.
 *
 * Applies screen-space distortion based on a fire heat map texture.
 * Uses noise-based UV offsets proportional to temperature at each pixel,
 * creating a realistic shimmering effect above fire sources.
 */
export class HeatDistortionPass {
  private material: THREE.ShaderMaterial;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;
  private strength: number;

  constructor() {
    this.strength = 1.0;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uInputTexture: { value: null },
        uHeatTexture: { value: null },
        uStrength: { value: 1.0 },
        uTime: { value: 0 },
      },
      vertexShader: HEAT_DISTORTION_VERTEX_SHADER,
      fragmentShader: HEAT_DISTORTION_FRAGMENT_SHADER,
      transparent: false,
      depthTest: false,
      depthWrite: false,
    });

    // Setup fullscreen quad for rendering
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const quadGeometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(quadGeometry, this.material);
    this.scene.add(this.quad);
  }

  /**
   * Apply heat distortion and render to output target.
   *
   * @param inputTexture The scene render texture to distort
   * @param heatTexture The heat map texture (R channel = temperature)
   * @param outputTarget The render target to write to (null = screen)
   * @param renderer The THREE.WebGLRenderer
   */
  render(
    inputTexture: THREE.Texture,
    heatTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget | null,
    renderer: THREE.WebGLRenderer,
  ): void {
    this.material.uniforms.uInputTexture.value = inputTexture;
    this.material.uniforms.uHeatTexture.value = heatTexture;
    this.material.uniforms.uStrength.value = this.strength;
    this.material.uniforms.uTime.value = performance.now() * 0.001;

    renderer.setRenderTarget(outputTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  /**
   * Set distortion intensity.
   *
   * @param strength Distortion strength (0 = none, 1 = default, >1 = stronger)
   */
  setStrength(strength: number): void {
    this.strength = Math.max(0, strength);
  }

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}

// ============================================================================
// FireParticleSystem
// ============================================================================

/**
 * Complete fire simulation system managing emitters, particles, physics,
 * and rendering in a unified interface.
 *
 * Usage:
 * ```ts
 * const fireSystem = new FireParticleSystem({
 *   maxParticles: 5000,
 *   emissionRate: 200,
 *   emitterPosition: new THREE.Vector3(0, 0, 0),
 * });
 *
 * const emitter = new FireEmitter({ position: new THREE.Vector3(0, 0, 0) });
 * fireSystem.addEmitter(emitter);
 *
 * // In animation loop:
 * fireSystem.update(dt);
 * scene.add(fireSystem.getMesh());
 * ```
 */
export class FireParticleSystem {
  private config: FireConfig;
  private particles: FireParticle[];
  private emitters: Map<string, FireEmitter>;
  private shaderMaterial: FireShaderMaterial;
  private smokeSystem: SmokeSystem;
  private heatDistortion: HeatDistortionPass;

  // Rendering resources
  private geometry: THREE.BufferGeometry;
  private pointsMesh: THREE.Points | null;
  private elapsedTime: number;
  private windDirection: THREE.Vector3;
  private windStrength: number;

  // Heat map for external queries
  private heatMap: Map<string, number>;

  // Dynamic point light for fire illumination
  private fireLight: THREE.PointLight | null;

  constructor(config: Partial<FireConfig> = {}) {
    this.config = { ...DEFAULT_FIRE_CONFIG, ...config };
    this.particles = [];
    this.emitters = new Map();
    this.shaderMaterial = new FireShaderMaterial();
    this.smokeSystem = new SmokeSystem(
      Math.floor(this.config.maxParticles * 0.4),
    );
    this.heatDistortion = new HeatDistortionPass();
    this.geometry = new THREE.BufferGeometry();
    this.pointsMesh = null;
    this.elapsedTime = 0;
    this.windDirection = this.config.windDirection.clone();
    this.windStrength = this.config.windStrength;
    this.heatMap = new Map();
    this.fireLight = null;
  }

  /**
   * Update all particles: physics, color, size, and emission.
   *
   * @param dt Timestep in seconds
   */
  update(dt: number): void {
    this.elapsedTime += dt;

    // Cap dt to prevent large jumps
    const clampedDt = Math.min(dt, 0.05);

    // 1. Emit new particles from all emitters
    for (const emitter of this.emitters.values()) {
      const newParticles = emitter.update(clampedDt, this.config);
      for (const p of newParticles) {
        if (this.particles.length < this.config.maxParticles) {
          this.particles.push(p);
        }
      }
    }

    // 2. Update existing particles
    this.heatMap.clear();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Age the particle
      p.age += clampedDt;
      p.life = Math.max(0, 1.0 - p.age / p.maxLife);

      // Remove dead particles
      if (p.life <= 0) {
        // Transition to smoke if conditions met
        if (
          !p.isSmoke &&
          Math.random() < this.config.smokeTransitionFraction &&
          p.temperature < this.config.smokeTemperatureThreshold * 2
        ) {
          this.smokeSystem.emitSmoke(p.position, 1, p.velocity);
        }
        this.particles.splice(i, 1);
        continue;
      }

      // --- Physics update ---

      // Buoyancy: upward force proportional to temperature
      const buoyancy = this.config.buoyancy * p.temperature * clampedDt;
      p.velocity.y += buoyancy;

      // Turbulence: position-based noise perturbation
      const turbulence = this.computeTurbulence(
        p.position,
        p.age,
        p.seed,
      );
      p.velocity.add(
        turbulence.multiplyScalar(this.config.turbulenceStrength * clampedDt),
      );

      // Wind
      if (this.windStrength > 0) {
        p.velocity.add(
          this.windDirection
            .clone()
            .multiplyScalar(this.windStrength * clampedDt),
        );
      }

      // Drag (exponential damping)
      const dragFactor = Math.pow(this.config.drag, clampedDt * 60);
      p.velocity.multiplyScalar(dragFactor);

      // Integrate position
      p.position.add(p.velocity.clone().multiplyScalar(clampedDt));

      // --- Temperature / visual update ---

      // Cooling: temperature decreases over lifetime
      p.temperature -= this.config.coolingRate * clampedDt;
      p.temperature = Math.max(0, p.temperature);

      // Opacity fades as particle cools
      p.opacity = Math.max(0, Math.min(1, p.temperature * 1.5));

      // Size: grows slightly then shrinks
      const lifeCurve = Math.sin(p.life * Math.PI);
      p.size *= 1.0 + (lifeCurve - 0.5) * 0.02;

      // Track heat at position for heat distortion queries
      const heatKey = this.quantizePosition(p.position);
      const currentHeat = this.heatMap.get(heatKey) ?? 0;
      this.heatMap.set(heatKey, Math.max(currentHeat, p.temperature));
    }

    // 3. Update smoke system
    this.smokeSystem.update(clampedDt);

    // 4. Update shader uniforms
    this.shaderMaterial.updateUniforms(
      this.elapsedTime,
      this.windDirection.clone().multiplyScalar(this.windStrength),
    );
    this.shaderMaterial.setIntensity(this.config.intensity);

    // 5. Update fire light
    this.updateFireLight();

    // 6. Update geometry buffers for rendering
    this.updateGeometry();
  }

  /**
   * Get the THREE.Points mesh for rendering the fire particles.
   */
  getMesh(): THREE.Points {
    if (!this.pointsMesh) {
      this.updateGeometry();
      this.pointsMesh = new THREE.Points(
        this.geometry,
        this.shaderMaterial.createMaterial(),
      );
      this.pointsMesh.name = 'FireParticleSystem';
      this.pointsMesh.frustumCulled = false;
    }
    return this.pointsMesh;
  }

  /**
   * Add a fire emitter to the system.
   */
  addEmitter(emitter: FireEmitter): void {
    this.emitters.set(emitter.id, emitter);
  }

  /**
   * Remove an emitter by its ID.
   */
  removeEmitter(emitterId: string): void {
    this.emitters.delete(emitterId);
  }

  /**
   * Set wind direction and strength affecting all fire particles.
   */
  setWind(direction: THREE.Vector3, strength: number): void {
    this.windDirection.copy(direction).normalize();
    this.windStrength = strength;
    this.smokeSystem.setWind(direction, strength);
  }

  /**
   * Get temperature (heat) at a given world position.
   *
   * Used by HeatDistortionPass and other systems to query the thermal
   * influence of the fire at a specific point in space.
   *
   * @param position World-space position to query
   * @returns Temperature value (0 = no heat, 1 = max heat)
   */
  getHeatAtPosition(position: THREE.Vector3): number {
    let maxHeat = 0;

    // Check direct particle influence within a radius
    const queryRadius = 2.0;
    for (const p of this.particles) {
      const dist = p.position.distanceTo(position);
      if (dist < queryRadius) {
        // Inverse-distance weighted temperature
        const falloff = 1.0 - dist / queryRadius;
        const heat = p.temperature * falloff * falloff;
        maxHeat = Math.max(maxHeat, heat);
      }
    }

    return maxHeat;
  }

  /**
   * Get the smoke system for separate rendering.
   */
  getSmokeSystem(): SmokeSystem {
    return this.smokeSystem;
  }

  /**
   * Get the heat distortion pass for post-processing integration.
   */
  getHeatDistortionPass(): HeatDistortionPass {
    return this.heatDistortion;
  }

  /**
   * Get the dynamic fire light.
   */
  getFireLight(): THREE.PointLight | null {
    return this.fireLight;
  }

  /**
   * Set fire intensity (0-1), affecting emission rate and visual brightness.
   */
  setIntensity(intensity: number): void {
    this.config.intensity = Math.max(0, Math.min(1, intensity));
    this.shaderMaterial.setIntensity(intensity);
  }

  /**
   * Get current particle count.
   */
  getParticleCount(): number {
    return this.particles.length;
  }

  /**
   * Get current smoke particle count.
   */
  getSmokeParticleCount(): number {
    return this.smokeSystem.getParticleCount();
  }

  /**
   * Generate a heat map texture for use with HeatDistortionPass.
   *
   * Renders the current heat field into a low-resolution render target.
   *
   * @param renderer WebGL renderer
   * @param width Heat map texture width
   * @param height Heat map texture height
   * @returns Render target containing the heat map
   */
  generateHeatMapTexture(
    renderer: THREE.WebGLRenderer,
    width: number = 64,
    height: number = 64,
  ): THREE.WebGLRenderTarget {
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    // Create a simple orthographic scene for the heat map
    const heatScene = new THREE.Scene();
    const heatCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Create heat visualization particles
    const heatPositions = new Float32Array(this.particles.length * 3);
    const heatIntensities = new Float32Array(this.particles.length);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      heatPositions[i * 3] = p.position.x;
      heatPositions[i * 3 + 1] = p.position.y;
      heatPositions[i * 3 + 2] = p.position.z;
      heatIntensities[i] = p.temperature;
    }

    const heatGeometry = new THREE.BufferGeometry();
    heatGeometry.setAttribute('position', new THREE.BufferAttribute(heatPositions, 3));

    const heatMaterial = new THREE.PointsMaterial({
      size: 0.5,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const heatPoints = new THREE.Points(heatGeometry, heatMaterial);
    heatScene.add(heatPoints);

    renderer.setRenderTarget(renderTarget);
    renderer.clear(true, true, true);
    renderer.render(heatScene, heatCamera);
    renderer.setRenderTarget(null);

    heatGeometry.dispose();
    heatMaterial.dispose();

    return renderTarget;
  }

  /**
   * Dispose of all GPU resources.
   */
  dispose(): void {
    this.geometry.dispose();
    this.shaderMaterial.dispose();
    this.smokeSystem.dispose();
    this.heatDistortion.dispose();
    this.particles = [];
    if (this.fireLight) {
      this.fireLight.dispose();
    }
  }

  // ---- Private helper methods ----

  /**
   * Compute turbulence force at a position using FBM-like noise.
   */
  private computeTurbulence(
    position: THREE.Vector3,
    age: number,
    seed: number,
  ): THREE.Vector3 {
    const hash = (x: number, y: number, z: number): number => {
      const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 13.37) * 43758.5453;
      return (n - Math.floor(n)) * 2 - 1;
    };

    const scale = this.config.turbulenceScale;
    const sx = position.x * scale + age * 0.5;
    const sy = position.y * scale + age * 0.3;
    const sz = position.z * scale + age * 0.4;

    // Two octaves of noise
    let x = hash(sx, sy, sz) * 0.7 + hash(sx * 2, sy * 2, sz * 2) * 0.3;
    let y = hash(sy, sz, sx) * 0.7 + hash(sy * 2, sz * 2, sx * 2) * 0.3;
    let z = hash(sz, sx, sy) * 0.7 + hash(sz * 2, sx * 2, sy * 2) * 0.3;

    // Reduce vertical turbulence for more realistic flame shape
    y *= 0.3;

    return new THREE.Vector3(x, y, z);
  }

  /**
   * Update geometry buffers from current particle state.
   */
  private updateGeometry(): void {
    const count = this.particles.length;

    const positions = new Float32Array(count * 3);
    const lifes = new Float32Array(count);
    const temperatures = new Float32Array(count);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      const i3 = i * 3;

      positions[i3] = p.position.x;
      positions[i3 + 1] = p.position.y;
      positions[i3 + 2] = p.position.z;

      lifes[i] = p.life;
      temperatures[i] = p.temperature;
      sizes[i] = p.size;
      opacities[i] = p.opacity;
      seeds[i] = p.seed;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(lifes, 1));
    this.geometry.setAttribute('aTemperature', new THREE.BufferAttribute(temperatures, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aLife.needsUpdate = true;
    this.geometry.attributes.aTemperature.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aOpacity.needsUpdate = true;
    this.geometry.attributes.aSeed.needsUpdate = true;
  }

  /**
   * Update the dynamic point light that simulates fire illumination.
   */
  private updateFireLight(): void {
    if (this.particles.length === 0) return;

    // Compute weighted center of fire
    let totalWeight = 0;
    const center = new THREE.Vector3();

    for (const p of this.particles) {
      if (!p.isSmoke && p.temperature > 0.3) {
        const weight = p.temperature;
        center.add(p.position.clone().multiplyScalar(weight));
        totalWeight += weight;
      }
    }

    if (totalWeight > 0) {
      center.divideScalar(totalWeight);

      if (!this.fireLight) {
        this.fireLight = new THREE.PointLight(0xff6622, 2, 15);
        this.fireLight.name = 'FireDynamicLight';
      }

      this.fireLight.position.copy(center);

      // Intensity varies with total fire mass and flickers
      const flickerAmount = 0.1;
      const flicker = 1.0 + (Math.random() - 0.5) * flickerAmount * 2;
      this.fireLight.intensity = Math.max(0.5, totalWeight * 0.05 * this.config.intensity * flicker);

      // Color shifts with temperature
      const avgTemp = totalWeight / this.particles.length;
      if (avgTemp > 0.7) {
        this.fireLight.color.setHex(0xffaa44); // Hot yellow-orange
      } else if (avgTemp > 0.4) {
        this.fireLight.color.setHex(0xff6622); // Orange
      } else {
        this.fireLight.color.setHex(0xcc3311); // Red-orange
      }
    }
  }

  /**
   * Quantize a world position to a grid key for heat map storage.
   */
  private quantizePosition(position: THREE.Vector3): string {
    const resolution = 0.5;
    const x = Math.floor(position.x / resolution);
    const y = Math.floor(position.y / resolution);
    const z = Math.floor(position.z / resolution);
    return `${x},${y},${z}`;
  }
}

// ============================================================================
// Convenience Factory Functions
// ============================================================================

/**
 * Create a campfire-scale fire system with sensible defaults.
 *
 * @param position Fire center position
 * @param intensity Fire intensity (0-1)
 * @returns Configured FireParticleSystem
 */
export function createCampfire(
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  intensity: number = 1.0,
): FireParticleSystem {
  const system = new FireParticleSystem({
    ...DEFAULT_FIRE_CONFIG,
    emitterPosition: position,
    intensity,
    emissionRate: 150,
    maxParticles: 3000,
    particleSize: [0.06, 0.2],
    particleLifespan: [0.6, 2.0],
    buoyancy: 2.0,
    emitterRadius: 0.2,
  });

  const emitter = new FireEmitter({
    position,
    direction: new THREE.Vector3(0, 1, 0),
    intensity,
    shape: 'CIRCLE',
    radius: 0.2,
  });

  system.addEmitter(emitter);
  return system;
}

/**
 * Create a large bonfire-scale fire system.
 *
 * @param position Fire center position
 * @param intensity Fire intensity (0-1)
 * @returns Configured FireParticleSystem
 */
export function createBonfire(
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  intensity: number = 1.0,
): FireParticleSystem {
  const system = new FireParticleSystem({
    ...DEFAULT_FIRE_CONFIG,
    emitterPosition: position,
    intensity,
    emissionRate: 400,
    maxParticles: 8000,
    particleSize: [0.1, 0.35],
    particleLifespan: [1.0, 3.5],
    buoyancy: 3.0,
    emitterRadius: 0.6,
    initialSpeed: [1.5, 4.0],
    initialTemperature: [0.8, 1.0],
  });

  const emitter = new FireEmitter({
    position,
    direction: new THREE.Vector3(0, 1, 0),
    intensity,
    shape: 'CIRCLE',
    radius: 0.6,
  });

  system.addEmitter(emitter);
  return system;
}

/**
 * Create a line fire (e.g., fire along a log or trench).
 *
 * @param start Line start position
 * @param end Line end position
 * @param intensity Fire intensity (0-1)
 * @returns Configured FireParticleSystem
 */
export function createLineFire(
  start: THREE.Vector3 = new THREE.Vector3(-1, 0, 0),
  end: THREE.Vector3 = new THREE.Vector3(1, 0, 0),
  intensity: number = 1.0,
): FireParticleSystem {
  const midpoint = start.clone().add(end).multiplyScalar(0.5);

  const system = new FireParticleSystem({
    ...DEFAULT_FIRE_CONFIG,
    emitterPosition: midpoint,
    intensity,
    emissionRate: 300,
    maxParticles: 6000,
    emitterRadius: 0.15,
  });

  const emitter = new FireEmitter({
    position: midpoint,
    direction: new THREE.Vector3(0, 1, 0),
    intensity,
    shape: 'LINE',
    lineStart: start.clone().sub(midpoint),
    lineEnd: end.clone().sub(midpoint),
  });

  system.addEmitter(emitter);
  return system;
}

/**
 * Create a candle-scale fire system.
 *
 * @param position Candle position
 * @param intensity Fire intensity (0-1)
 * @returns Configured FireParticleSystem
 */
export function createCandleFlame(
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  intensity: number = 1.0,
): FireParticleSystem {
  const system = new FireParticleSystem({
    ...DEFAULT_FIRE_CONFIG,
    emitterPosition: position,
    intensity,
    emissionRate: 40,
    maxParticles: 500,
    particleSize: [0.02, 0.06],
    particleLifespan: [0.3, 0.8],
    buoyancy: 1.5,
    emitterRadius: 0.03,
    initialSpeed: [0.5, 1.5],
    initialTemperature: [0.8, 1.0],
    smokeTransitionFraction: 0.1,
  });

  const emitter = new FireEmitter({
    position,
    direction: new THREE.Vector3(0, 1, 0),
    intensity,
    shape: 'POINT',
  });

  system.addEmitter(emitter);
  return system;
}
