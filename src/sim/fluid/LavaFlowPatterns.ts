/**
 * Lava Flow Pattern System
 *
 * Extends the FLIP fluid simulation with lava-specific behavior including:
 * - Pahoehoe: Smooth, ropy lava with sinusoidal surface deformation
 * - Aa: Rough, blocky lava with jagged surface
 * - Columnar: Basalt column pattern (hexagonal crack network)
 *
 * Physical model:
 * - Temperature field per particle (Stefan-Boltzmann cooling)
 * - Temperature-dependent viscosity (semi-solid behavior at low temps)
 * - Surface crust formation below solidification temperature
 * - Integration with existing LavaShader.ts for rendering
 *
 * Phase 2, Item 8: Fluid Scale and Materials
 *
 * @module sim/fluid
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import type { FLIPParticle, FLIPFluidSolver } from './FLIPFluidSolver';

// ─── Lava Flow Types ────────────────────────────────────────────────────────────

/** Lava flow pattern types */
export type LavaFlowType = 'pahoehoe' | 'aa' | 'columnar';

/** Configuration for lava flow simulation */
export interface LavaFlowConfig {
  /** Type of lava flow pattern */
  flowType: LavaFlowType;
  /** Eruption temperature in Kelvin (default 1500) */
  eruptionTemperature: number;
  /** Temperature at which lava solidifies (default 950) */
  solidificationTemperature: number;
  /** Temperature at which crust starts forming (default 1100) */
  crustFormationTemperature: number;
  /** Viscosity at eruption temperature in Pa·s (default 100) */
  baseViscosity: number;
  /** Viscosity multiplier at solidification (default 1000) */
  viscosityMultiplier: number;
  /** Viscosity curve exponent (default 3.0) - higher = more abrupt solidification */
  viscosityCurve: number;
  /** Crust thickness in meters when fully solidified (default 0.1) */
  crustThickness: number;
  /** Stefan-Boltzmann emissivity (default 0.9) */
  emissivity: number;
  /** Lava density in kg/m³ (default 2700) */
  density: number;
  /** Specific heat capacity in J/(kg·K) (default 1150) */
  specificHeat: number;
  /** Thermal conductivity in W/(m·K) (default 1.7) */
  thermalConductivity: number;
  /** Time scale factor for cooling (default 1.0) */
  coolingTimeScale: number;
  /** Pahoehoe: Amplitude of sinusoidal surface deformation */
  pahoehoeAmplitude: number;
  /** Pahoehoe: Frequency of ropy pattern */
  pahoehoeFrequency: number;
  /** Aa: Roughness scale for blocky surface */
  aaRoughness: number;
  /** Aa: Block size for surface fragmentation */
  aaBlockSize: number;
  /** Columnar: Scale of hexagonal crack pattern */
  columnarScale: number;
  /** Columnar: Number of sides for column pattern (default 6 = hexagonal) */
  columnarSides: number;
  /** Random seed for deterministic generation */
  seed: number;
}

/** Per-particle lava state */
export interface LavaParticleState {
  /** Particle index in the FLIP solver */
  particleIndex: number;
  /** Current temperature in Kelvin */
  temperature: number;
  /** Current viscosity in Pa·s */
  viscosity: number;
  /** Whether this particle has formed a solid crust */
  hasCrust: boolean;
  /** Crust thickness (0 = no crust, 1 = fully crusted) */
  crustFraction: number;
  /** Normalized temperature (0 = solidified, 1 = eruption temp) */
  normalizedTemp: number;
}

/** Result from lava simulation step */
export interface LavaSimulationResult {
  /** Updated lava particle states */
  particleStates: LavaParticleState[];
  /** Average temperature across all particles */
  averageTemperature: number;
  /** Fraction of particles that have crusted over */
  crustFraction: number;
  /** Maximum viscosity */
  maxViscosity: number;
  /** Temperature field as a 2D grid (for shader integration) */
  temperatureField: Float32Array;
  /** Field resolution */
  fieldResolution: number;
}

// ─── Defaults ────────────────────────────────────────────────────────────────────

const DEFAULT_LAVA_CONFIG: LavaFlowConfig = {
  flowType: 'pahoehoe',
  eruptionTemperature: 1500,
  solidificationTemperature: 950,
  crustFormationTemperature: 1100,
  baseViscosity: 100,
  viscosityMultiplier: 1000,
  viscosityCurve: 3.0,
  crustThickness: 0.1,
  emissivity: 0.9,
  density: 2700,
  specificHeat: 1150,
  thermalConductivity: 1.7,
  coolingTimeScale: 1.0,
  pahoehoeAmplitude: 0.05,
  pahoehoeFrequency: 2.0,
  aaRoughness: 0.3,
  aaBlockSize: 0.15,
  columnarScale: 3.0,
  columnarSides: 6,
  seed: 42,
};

const LAVA_PRESETS: Record<LavaFlowType, Partial<LavaFlowConfig>> = {
  pahoehoe: {
    eruptionTemperature: 1400,
    solidificationTemperature: 1000,
    crustFormationTemperature: 1150,
    baseViscosity: 50,
    viscosityMultiplier: 500,
    viscosityCurve: 2.5,
    pahoehoeAmplitude: 0.06,
    pahoehoeFrequency: 2.5,
    specificHeat: 1200,
    coolingTimeScale: 0.8,
  },
  aa: {
    eruptionTemperature: 1200,
    solidificationTemperature: 900,
    crustFormationTemperature: 1050,
    baseViscosity: 500,
    viscosityMultiplier: 2000,
    viscosityCurve: 4.0,
    aaRoughness: 0.4,
    aaBlockSize: 0.2,
    specificHeat: 1100,
    coolingTimeScale: 1.2,
  },
  columnar: {
    eruptionTemperature: 1500,
    solidificationTemperature: 950,
    crustFormationTemperature: 1100,
    baseViscosity: 200,
    viscosityMultiplier: 800,
    viscosityCurve: 3.0,
    columnarScale: 4.0,
    columnarSides: 6,
    specificHeat: 1150,
    coolingTimeScale: 1.0,
  },
};

// ─── LavaFlowSimulation ────────────────────────────────────────────────────────

/**
 * Lava flow simulation extending FLIP with temperature-dependent behavior.
 *
 * Physical model:
 * - Each particle carries a temperature field
 * - Viscosity follows an Arrhenius-type relationship with temperature
 * - Stefan-Boltzmann radiative cooling for surface particles
 * - Conduction cooling for interior particles
 * - Crust forms when temperature drops below solidification point
 */
export class LavaFlowSimulation {
  private config: LavaFlowConfig;
  private rng: SeededRandom;
  private particleStates: Map<number, LavaParticleState> = new Map();
  private time: number = 0;

  // Temperature field for shader integration
  private temperatureField: Float32Array;
  private fieldResolution: number = 32;

  constructor(config: Partial<LavaFlowConfig> = {}) {
    const preset = LAVA_PRESETS[config.flowType ?? 'pahoehoe'] ?? {};
    this.config = { ...DEFAULT_LAVA_CONFIG, ...preset, ...config };
    this.rng = new SeededRandom(this.config.seed);
    this.temperatureField = new Float32Array(this.fieldResolution * this.fieldResolution);
  }

  // ── Initialization ──────────────────────────────────────────────────────

  /**
   * Initialize lava particle states from a FLIP solver.
   * All particles start at eruption temperature.
   */
  initializeFromFLIP(flipSolver: FLIPFluidSolver): void {
    const particles = flipSolver.getParticles();
    this.particleStates.clear();

    for (let i = 0; i < particles.length; i++) {
      this.particleStates.set(i, {
        particleIndex: i,
        temperature: this.config.eruptionTemperature,
        viscosity: this.config.baseViscosity,
        hasCrust: false,
        crustFraction: 0,
        normalizedTemp: 1.0,
      });
    }

    this.time = 0;
  }

  /**
   * Initialize lava with a temperature gradient (cooler at the front).
   * Useful for simulating an advancing lava flow.
   */
  initializeWithGradient(
    flipSolver: FLIPFluidSolver,
    flowDirection: THREE.Vector3,
    gradientLength: number,
  ): void {
    const particles = flipSolver.getParticles();
    this.particleStates.clear();

    const normalizedDir = flowDirection.clone().normalize();

    for (let i = 0; i < particles.length; i++) {
      const pos = particles[i].position;
      // Project position onto flow direction
      const projection = pos.dot(normalizedDir);
      const t = Math.max(0, Math.min(1, projection / gradientLength));

      // Front of flow is cooler
      const temperature = this.config.eruptionTemperature -
        (this.config.eruptionTemperature - this.config.solidificationTemperature) * t * 0.5;

      const state = this.computeStateFromTemperature(i, temperature);
      this.particleStates.set(i, state);
    }

    this.time = 0;
  }

  // ── Simulation Step ──────────────────────────────────────────────────────

  /**
   * Advance the lava simulation by dt seconds.
   * Updates temperature, viscosity, and crust state for all particles.
   *
   * @param flipSolver The FLIP solver providing particle positions and velocities
   * @param dt Time step in seconds
   * @returns LavaSimulationResult with updated states
   */
  step(flipSolver: FLIPFluidSolver, dt: number): LavaSimulationResult {
    const particles = flipSolver.getParticles();
    this.time += dt;

    const sigma = 5.670374419e-8; // Stefan-Boltzmann constant
    const T_ambient = 300; // Ambient temperature (K)

    let totalTemp = 0;
    let crustedCount = 0;
    let maxViscosity = 0;

    for (let i = 0; i < particles.length; i++) {
      const state = this.particleStates.get(i);
      if (!state) continue;

      let temperature = state.temperature;

      // ── Radiative cooling (Stefan-Boltzmann law) ──
      // P = ε * σ * A * (T⁴ - T_amb⁴)
      // dT/dt = -P / (m * c_p)
      // For a simplified model, we use:
      // dT = -ε * σ * (T⁴ - T_amb⁴) * dt / (ρ * c_p * thickness)
      const T4 = Math.pow(temperature, 4);
      const Tamb4 = Math.pow(T_ambient, 4);
      const radiativeCooling = this.config.emissivity * sigma * (T4 - Tamb4) *
        dt * this.config.coolingTimeScale /
        (this.config.density * this.config.specificHeat * this.config.crustThickness);

      // ── Conductive cooling (interior particles) ──
      // Simplified: particles with more neighbors cool slower
      const velocity = particles[i].velocity.length();
      const conductionFactor = velocity < 0.1 ? 0.3 : 0.1; // Slow/still particles are interior
      const conductiveCooling = this.config.thermalConductivity *
        (temperature - T_ambient) * conductionFactor * dt /
        (this.config.density * this.config.specificHeat * this.config.crustThickness * this.config.crustThickness);

      // Apply cooling
      temperature -= radiativeCooling + conductiveCooling;
      temperature = Math.max(T_ambient, temperature);

      // Update state
      const newState = this.computeStateFromTemperature(i, temperature);
      this.particleStates.set(i, newState);

      totalTemp += temperature;
      if (newState.hasCrust) crustedCount++;
      if (newState.viscosity > maxViscosity) maxViscosity = newState.viscosity;
    }

    // Build temperature field for shader
    this.updateTemperatureField(particles);

    const count = particles.length || 1;
    return {
      particleStates: Array.from(this.particleStates.values()),
      averageTemperature: totalTemp / count,
      crustFraction: crustedCount / count,
      maxViscosity,
      temperatureField: this.temperatureField,
      fieldResolution: this.fieldResolution,
    };
  }

  // ── Flow Pattern Generation ──────────────────────────────────────────────

  /**
   * Generate surface displacement based on lava flow type.
   * Used by the LavaShader for surface deformation.
   */
  getSurfaceDisplacement(uv: [number, number], temperature: number): THREE.Vector3 {
    const normalizedTemp = this.normalizeTemperature(temperature);

    switch (this.config.flowType) {
      case 'pahoehoe':
        return this.pahoehoeDisplacement(uv, normalizedTemp);
      case 'aa':
        return this.aaDisplacement(uv, normalizedTemp);
      case 'columnar':
        return this.columnarDisplacement(uv, normalizedTemp);
      default:
        return new THREE.Vector3(0, 0, 0);
    }
  }

  /**
   * Pahoehoe: Smooth, ropy surface with sinusoidal deformation.
   * The ropy texture comes from the folding of the cooled crust.
   */
  private pahoehoeDisplacement(uv: [number, number], normalizedTemp: number): THREE.Vector3 {
    const amp = this.config.pahoehoeAmplitude * (1 - normalizedTemp * 0.5);
    const freq = this.config.pahoehoeFrequency;

    // Multiple octaves of sinusoidal displacement for ropy texture
    const [u, v] = uv;
    const t = this.time * 0.1;

    // Primary ropy pattern (along flow direction)
    const rope1 = Math.sin(u * freq * Math.PI * 2 + t) * amp;
    const rope2 = Math.sin(v * freq * 0.7 * Math.PI * 2 + t * 0.8) * amp * 0.5;

    // Secondary cross-ropy pattern
    const cross = Math.sin((u + v) * freq * 1.5 * Math.PI + t * 0.5) * amp * 0.3;

    // Smooth blending based on temperature
    const smoothFactor = Math.pow(normalizedTemp, 0.5);
    const y = (rope1 + rope2 + cross) * smoothFactor;

    return new THREE.Vector3(0, y, 0);
  }

  /**
   * Aa: Rough, blocky surface with jagged fragmentation.
   * As lava cools, the surface breaks into angular blocks.
   */
  private aaDisplacement(uv: [number, number], normalizedTemp: number): THREE.Vector3 {
    const roughness = this.config.aaRoughness;
    const blockSize = this.config.aaBlockSize;

    const [u, v] = uv;
    const t = this.time * 0.05;

    // Block-like noise pattern
    const blockU = Math.floor(u / blockSize);
    const blockV = Math.floor(v / blockSize);

    // Deterministic noise per block using seed
    const hashU = Math.sin(blockU * 127.1 + blockV * 311.7 + this.config.seed) * 43758.5453;
    const hashV = Math.sin(blockU * 269.5 + blockV * 183.3 + this.config.seed + 7.3) * 43758.5453;
    const height = (hashU - Math.floor(hashU)) * roughness;

    // Jagged edges between blocks
    const fracU = (u / blockSize) - blockU;
    const fracV = (v / blockSize) - blockV;
    const edgeDist = Math.min(fracU, 1 - fracU, fracV, 1 - fracV);

    // Blocks tilt based on hash
    const tiltX = (hashV - Math.floor(hashV) - 0.5) * roughness * 0.5;
    const tiltZ = (hashU - Math.floor(hashU + 0.5)) * roughness * 0.3;

    // Surface becomes more fragmented as it cools
    const fragmentationFactor = Math.pow(1 - normalizedTemp, 2);
    const edgeGap = edgeDist < 0.1 ? -roughness * 0.3 * fragmentationFactor : 0;

    const y = (height + tiltX * fracU + tiltZ * fracV + edgeGap) * fragmentationFactor;

    return new THREE.Vector3(0, y, 0);
  }

  /**
   * Columnar: Basalt column pattern with hexagonal crack network.
   * Columnar joints form perpendicular to cooling surfaces.
   */
  private columnarDisplacement(uv: [number, number], normalizedTemp: number): THREE.Vector3 {
    const scale = this.config.columnarScale;
    const sides = this.config.columnarSides;

    const [u, v] = uv;

    // Hexagonal grid
    const hexU = u * scale;
    const hexV = v * scale;

    // Distance to nearest hexagonal edge (Voronoi-based)
    const cellX = Math.floor(hexU);
    const cellY = Math.floor(hexV);

    let minDist = Infinity;

    // Check surrounding cells
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = cellX + dx;
        const cy = cellY + dy;

        // Hash-based cell center offset
        const h1 = Math.sin(cx * 127.1 + cy * 311.7 + this.config.seed) * 43758.5453;
        const h2 = Math.sin(cx * 269.5 + cy * 183.3 + this.config.seed + 7.3) * 43758.5453;

        const centerX = cx + (h1 - Math.floor(h1)) * 0.8 + 0.1;
        const centerY = cy + (h2 - Math.floor(h2)) * 0.8 + 0.1;

        const dist = Math.sqrt(
          Math.pow(hexU - centerX, 2) + Math.pow(hexV - centerY, 2)
        );

        minDist = Math.min(minDist, dist);
      }
    }

    // Crack depth based on distance to cell boundary
    const crackDepth = Math.max(0, 1 - minDist * 2) * 0.05 * (1 - normalizedTemp);

    // Column height variation
    const colHash = Math.sin(cellX * 43.1 + cellY * 91.7 + this.config.seed) * 43758.5453;
    const colHeight = (colHash - Math.floor(colHash)) * 0.02 * (1 - normalizedTemp);

    const y = -crackDepth + colHeight;

    return new THREE.Vector3(0, y, 0);
  }

  // ── Viscosity Computation ────────────────────────────────────────────────

  /**
   * Apply lava-specific viscosity to FLIP solver.
   * Overrides the default fluid viscosity with temperature-dependent values.
   */
  applyViscosityToFLIP(flipSolver: FLIPFluidSolver): void {
    const particles = flipSolver.getParticles();
    const grid = flipSolver.getGrid();

    for (let i = 0; i < particles.length; i++) {
      const state = this.particleStates.get(i);
      if (!state) continue;

      // Dampen velocity based on viscosity (simplified Stokes drag)
      const viscosityFactor = Math.min(1, this.config.baseViscosity / state.viscosity);
      const damping = Math.pow(viscosityFactor, 0.1); // Per-frame damping

      particles[i].velocity.multiplyScalar(damping);

      // Particles with full crust become stationary
      if (state.crustFraction > 0.95) {
        particles[i].velocity.multiplyScalar(0.01);
      }
    }
  }

  // ── Temperature Field ────────────────────────────────────────────────────

  /**
   * Get temperature data formatted for the LavaShader.
   * Returns a data texture that can be uploaded to the GPU.
   */
  getTemperatureDataTexture(): THREE.DataTexture {
    const width = this.fieldResolution;
    const height = this.fieldResolution;
    const data = new Float32Array(width * height * 4);

    for (let i = 0; i < width * height; i++) {
      const temp = this.temperatureField[i] ?? this.config.eruptionTemperature;
      const normalizedTemp = this.normalizeTemperature(temp);

      // Pack as RGBA float (temperature, crust fraction, viscosity, padding)
      const state = this.findStateAtFieldIndex(i);
      data[i * 4] = normalizedTemp;
      data[i * 4 + 1] = state?.crustFraction ?? 0;
      data[i * 4 + 2] = Math.min(1, (state?.viscosity ?? this.config.baseViscosity) / (this.config.baseViscosity * this.config.viscosityMultiplier));
      data[i * 4 + 3] = 1.0;
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    return texture;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Get the current configuration */
  getConfig(): LavaFlowConfig {
    return { ...this.config };
  }

  /** Get particle state for a specific index */
  getParticleState(index: number): LavaParticleState | undefined {
    return this.particleStates.get(index);
  }

  /** Get all particle states */
  getAllStates(): LavaParticleState[] {
    return Array.from(this.particleStates.values());
  }

  /** Get the current simulation time */
  getTime(): number {
    return this.time;
  }

  /** Get preset configuration for a lava flow type */
  static getPreset(flowType: LavaFlowType): Partial<LavaFlowConfig> {
    return LAVA_PRESETS[flowType] ?? {};
  }

  /** List available lava flow type presets */
  static listPresets(): LavaFlowType[] {
    return Object.keys(LAVA_PRESETS) as LavaFlowType[];
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  private computeStateFromTemperature(index: number, temperature: number): LavaParticleState {
    const normalizedTemp = this.normalizeTemperature(temperature);

    // Viscosity: Arrhenius-type relationship
    // μ = μ_base * exp(curve * (1 - T/T_eruption))
    const viscosityExponent = this.config.viscosityCurve * (1 - normalizedTemp);
    const viscosity = this.config.baseViscosity * Math.exp(viscosityExponent);
    const clampedViscosity = Math.min(viscosity, this.config.baseViscosity * this.config.viscosityMultiplier);

    // Crust formation
    const hasCrust = temperature < this.config.crustFormationTemperature;
    let crustFraction = 0;
    if (hasCrust) {
      const crustRange = this.config.crustFormationTemperature - this.config.solidificationTemperature;
      if (crustRange > 0) {
        crustFraction = Math.min(1,
          (this.config.crustFormationTemperature - temperature) / crustRange
        );
      }
    }

    return {
      particleIndex: index,
      temperature,
      viscosity: clampedViscosity,
      hasCrust,
      crustFraction,
      normalizedTemp,
    };
  }

  private normalizeTemperature(temperature: number): number {
    const range = this.config.eruptionTemperature - this.config.solidificationTemperature;
    if (range <= 0) return temperature > this.config.solidificationTemperature ? 1 : 0;
    return Math.max(0, Math.min(1,
      (temperature - this.config.solidificationTemperature) / range
    ));
  }

  private updateTemperatureField(particles: FLIPParticle[]): void {
    const res = this.fieldResolution;
    this.temperatureField.fill(this.config.solidificationTemperature);

    // Rasterize particle temperatures onto a 2D grid (top-down view)
    const domainMin = new THREE.Vector3(Infinity, 0, Infinity);
    const domainMax = new THREE.Vector3(-Infinity, 0, -Infinity);

    for (const p of particles) {
      domainMin.x = Math.min(domainMin.x, p.position.x);
      domainMin.z = Math.min(domainMin.z, p.position.z);
      domainMax.x = Math.max(domainMax.x, p.position.x);
      domainMax.z = Math.max(domainMax.z, p.position.z);
    }

    // Add padding
    const padX = (domainMax.x - domainMin.x) * 0.1 + 0.1;
    const padZ = (domainMax.z - domainMin.z) * 0.1 + 0.1;
    domainMin.x -= padX;
    domainMin.z -= padZ;
    domainMax.x += padX;
    domainMax.z += padZ;

    const dx = (domainMax.x - domainMin.x) / res;
    const dz = (domainMax.z - domainMin.z) / res;

    // Count and sum temperatures per cell
    const tempSum = new Float32Array(res * res);
    const count = new Float32Array(res * res);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const state = this.particleStates.get(i);
      if (!state) continue;

      const gx = Math.floor((p.position.x - domainMin.x) / dx);
      const gz = Math.floor((p.position.z - domainMin.z) / dz);

      if (gx >= 0 && gx < res && gz >= 0 && gz < res) {
        const idx = gz * res + gx;
        tempSum[idx] += state.temperature;
        count[idx]++;
      }
    }

    // Average temperature per cell
    for (let i = 0; i < res * res; i++) {
      if (count[i] > 0) {
        this.temperatureField[i] = tempSum[i] / count[i];
      }
    }
  }

  private findStateAtFieldIndex(fieldIdx: number): LavaParticleState | undefined {
    // Simplified: find any particle state near this field index
    for (const state of this.particleStates.values()) {
      if (state.particleIndex % (this.fieldResolution * this.fieldResolution) === fieldIdx) {
        return state;
      }
    }
    return undefined;
  }

  dispose(): void {
    this.particleStates.clear();
    this.temperatureField = new Float32Array(0);
  }
}

/**
 * Filename-matching alias for backward compat.
 * `import LavaFlowPatterns from './LavaFlowPatterns'` and
 * `import { LavaFlowPatterns } from './LavaFlowPatterns'` both work.
 */
export { LavaFlowSimulation as LavaFlowPatterns };
export default LavaFlowSimulation;
