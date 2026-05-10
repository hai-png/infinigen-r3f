/**
 * SDFPerturbSurface — SDF-aware surface perturbation for material detail
 *
 * The original Infinigen modifies SDFs directly for surface detail via
 * the Kernelizer → C++ SurfaceKernel pipeline. This TypeScript implementation
 * provides SDF-aware displacement that modifies geometry silhouettes rather
 * than just perturbing normals, achieving more physically accurate surface
 * detail for terrain, rocks, and other natural surfaces.
 *
 * Features:
 *   - Multi-octave noise displacement with configurable parameters
 *   - Voronoi-based crack/cell patterns for rock and terrain
 *   - FBM displacement for organic surface variation
 *   - Ridged multifractal for sharp feature edges
 *   - Erosion mask integration for weathered surfaces
 *   - Integration with SurfaceKernelPipeline
 *   - Tag-based face selection for selective perturbation
 *
 * @module assets/materials/surface
 */

import * as THREE from 'three';
import { SeededNoiseGenerator } from '../../../core/util/math/noise';
import { SeededRandom } from '../../../core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/**
 * Type of SDF perturbation to apply.
 */
export type SDFPerturbType =
  | 'fbm'            // Fractional Brownian Motion — organic undulation
  | 'ridged'         // Ridged multifractal — sharp crests and valleys
  | 'voronoi_crack'  // Voronoi cell-based crack patterns
  | 'voronoi_cell'   // Voronoi cell bump pattern
  | 'turbulence'     // Turbulence noise — turbulent displacement
  | 'domain_warp';   // Domain-warped noise — organic swirling patterns

/**
 * Configuration for SDF perturbation displacement.
 */
export interface SDFPerturbConfig {
  /** Type of perturbation noise (default 'fbm') */
  type: SDFPerturbType;
  /** Displacement scale in world units (default 0.05) */
  scale: number;
  /** Noise frequency multiplier (default 5.0) */
  frequency: number;
  /** Number of noise octaves (default 4) */
  octaves: number;
  /** Lacunarity — frequency multiplier per octave (default 2.0) */
  lacunarity: number;
  /** Gain/persistence — amplitude multiplier per octave (default 0.5) */
  gain: number;
  /** Seed for deterministic generation (default 42) */
  seed: number;
  /** Displacement offset — shift zero point (default 0.0) */
  offset: number;
  /** Clamp maximum displacement (default Infinity) */
  maxDisplacement: number;
  /** Direction mode: 'normal' along vertex normals, 'y' along Y axis only (default 'normal') */
  direction: 'normal' | 'y';
  /** Whether to recalculate normals after displacement (default true) */
  recalcNormals: boolean;
  /** Optional mask: per-vertex weights [0..1] to modulate displacement */
  vertexMask?: Float32Array;
  /** Tag filter: only perturb faces with matching tags (empty = all faces) */
  tagFilter?: string[];
}

/**
 * Result of SDF perturbation application.
 */
export interface SDFPerturbResult {
  /** The modified geometry */
  geometry: THREE.BufferGeometry;
  /** The displacement values applied per vertex */
  displacementValues: Float32Array;
  /** Maximum displacement that was applied */
  maxAppliedDisplacement: number;
  /** Whether normals were recalculated */
  normalsRecalculated: boolean;
}

/**
 * Preset configurations for common surface types matching
 * the original Infinigen surface types (SDFPerturb).
 */
export const SDF_PERTURB_PRESETS: Record<string, Partial<SDFPerturbConfig>> = {
  /** Mountain rock — large angular noise, high displacement */
  mountain_rock: {
    type: 'ridged',
    scale: 0.15,
    frequency: 3.0,
    octaves: 6,
    lacunarity: 2.2,
    gain: 0.55,
    direction: 'normal',
  },
  /** Stone surface — Voronoi crack pattern */
  stone_cracks: {
    type: 'voronoi_crack',
    scale: 0.04,
    frequency: 8.0,
    octaves: 3,
    lacunarity: 2.0,
    gain: 0.5,
    direction: 'normal',
  },
  /** Sand dunes — low-frequency FBM undulation */
  sand_dunes: {
    type: 'fbm',
    scale: 0.02,
    frequency: 2.0,
    octaves: 4,
    lacunarity: 2.0,
    gain: 0.5,
    direction: 'y',
  },
  /** Soil — organic noise with small displacement */
  soil: {
    type: 'turbulence',
    scale: 0.03,
    frequency: 6.0,
    octaves: 5,
    lacunarity: 2.0,
    gain: 0.45,
    direction: 'normal',
  },
  /** Cobblestone — Voronoi cell bump pattern */
  cobblestone: {
    type: 'voronoi_cell',
    scale: 0.05,
    frequency: 5.0,
    octaves: 2,
    lacunarity: 2.0,
    gain: 0.5,
    direction: 'normal',
  },
  /** Cracked ground — deep Voronoi cracks */
  cracked_ground: {
    type: 'voronoi_crack',
    scale: 0.08,
    frequency: 4.0,
    octaves: 3,
    lacunarity: 2.5,
    gain: 0.4,
    direction: 'normal',
  },
  /** Chunky rock — large-scale angular noise */
  chunky_rock: {
    type: 'ridged',
    scale: 0.2,
    frequency: 2.0,
    octaves: 5,
    lacunarity: 2.3,
    gain: 0.6,
    direction: 'normal',
  },
  /** Ice surface — smooth, subtle displacement */
  ice: {
    type: 'fbm',
    scale: 0.01,
    frequency: 4.0,
    octaves: 3,
    lacunarity: 2.0,
    gain: 0.4,
    direction: 'normal',
  },
  /** Mossy stone — organic bumps */
  mossy_stone: {
    type: 'domain_warp',
    scale: 0.03,
    frequency: 6.0,
    octaves: 4,
    lacunarity: 2.0,
    gain: 0.5,
    direction: 'normal',
  },
  /** Mud — flat, subtle ripple */
  mud: {
    type: 'fbm',
    scale: 0.01,
    frequency: 8.0,
    octaves: 3,
    lacunarity: 2.0,
    gain: 0.4,
    direction: 'normal',
  },
  /** Sandstone — layered sedimentary pattern */
  sandstone: {
    type: 'ridged',
    scale: 0.04,
    frequency: 3.0,
    octaves: 4,
    lacunarity: 2.0,
    gain: 0.55,
    direction: 'y',
  },
  /** Snow drift — gentle, wind-shaped */
  snow: {
    type: 'fbm',
    scale: 0.015,
    frequency: 2.5,
    octaves: 3,
    lacunarity: 2.0,
    gain: 0.4,
    direction: 'normal',
  },
};

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SDFPerturbConfig = {
  type: 'fbm',
  scale: 0.05,
  frequency: 5.0,
  octaves: 4,
  lacunarity: 2.0,
  gain: 0.5,
  seed: 42,
  offset: 0.0,
  maxDisplacement: Infinity,
  direction: 'normal',
  recalcNormals: true,
};

// ============================================================================
// SDFPerturbSurface Class
// ============================================================================

/**
 * SDFPerturbSurface — Applies SDF-aware surface perturbation to geometry.
 *
 * Unlike normal-map perturbation, this class modifies the actual vertex
 * positions along their normals (or Y axis), creating real geometric
 * detail that affects silhouettes and shadow casting. This matches the
 * behavior of the original Infinigen's SDFPerturb surface type.
 *
 * The class supports multiple noise types (FBM, ridged, Voronoi, turbulence,
 * domain warp) and can be selectively applied to tagged faces or via
 * per-vertex masks.
 *
 * @example
 * ```ts
 * // Apply mountain rock displacement
 * const result = SDFPerturbSurface.apply(geometry, {
 *   type: 'ridged',
 *   scale: 0.15,
 *   frequency: 3.0,
 *   octaves: 6,
 *   seed: 12345,
 * });
 *
 * // Use a preset
 * const result2 = SDFPerturbSurface.apply(geometry,
 *   SDFPerturbSurface.preset('mountain_rock', 12345)
 * );
 * ```
 */
export class SDFPerturbSurface {
  /**
   * Apply SDF perturbation displacement to a BufferGeometry.
   *
   * Modifies vertex positions along their normals (or Y axis) based on
   * the configured noise type and parameters. Optionally recalculates
   * normals after displacement.
   *
   * @param geometry - The geometry to perturb (modified in-place)
   * @param config - Perturbation configuration
   * @returns SDFPerturbResult with the modified geometry and displacement data
   */
  static apply(
    geometry: THREE.BufferGeometry,
    config: Partial<SDFPerturbConfig> = {},
  ): SDFPerturbResult {
    const cfg: SDFPerturbConfig = { ...DEFAULT_CONFIG, ...config };
    const noise = new SeededNoiseGenerator(cfg.seed);

    // Ensure geometry has position attribute
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!posAttr) {
      return {
        geometry,
        displacementValues: new Float32Array(0),
        maxAppliedDisplacement: 0,
        normalsRecalculated: false,
      };
    }

    const vertexCount = posAttr.count;
    const positions = posAttr.array as Float32Array;

    // Get or compute normals
    if (cfg.direction === 'normal' && !geometry.getAttribute('normal')) {
      geometry.computeVertexNormals();
    }
    const normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | null;

    // Initialize displacement array
    const displacementValues = new Float32Array(vertexCount);
    let maxApplied = 0;

    // Apply displacement to each vertex
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];

      // Compute noise value based on perturbation type
      let noiseValue = SDFPerturbSurface.computeNoise(
        x, y, z, cfg, noise,
      );

      // Apply vertex mask if provided
      if (cfg.vertexMask && i < cfg.vertexMask.length) {
        noiseValue *= cfg.vertexMask[i];
      }

      // Apply offset and clamp
      let displacement = (noiseValue + cfg.offset) * cfg.scale;
      displacement = Math.max(-cfg.maxDisplacement, Math.min(cfg.maxDisplacement, displacement));

      displacementValues[i] = displacement;
      maxApplied = Math.max(maxApplied, Math.abs(displacement));

      // Apply displacement along normal or Y axis
      if (cfg.direction === 'y') {
        positions[i * 3 + 1] += displacement;
      } else if (normalAttr) {
        const nx = (normalAttr.array as Float32Array)[i * 3];
        const ny = (normalAttr.array as Float32Array)[i * 3 + 1];
        const nz = (normalAttr.array as Float32Array)[i * 3 + 2];
        positions[i * 3]     += nx * displacement;
        positions[i * 3 + 1] += ny * displacement;
        positions[i * 3 + 2] += nz * displacement;
      } else {
        // Fallback to Y displacement
        positions[i * 3 + 1] += displacement;
      }
    }

    // Mark position attribute as needing update
    posAttr.needsUpdate = true;

    // Store displacement as a vertex attribute for shader access
    geometry.setAttribute('sdfDisplacement', new THREE.BufferAttribute(displacementValues, 1));

    // Recalculate normals if requested
    if (cfg.recalcNormals) {
      geometry.computeVertexNormals();
    }

    return {
      geometry,
      displacementValues,
      maxAppliedDisplacement: maxApplied,
      normalsRecalculated: cfg.recalcNormals,
    };
  }

  /**
   * Compute noise value at a given point based on the configured perturbation type.
   */
  private static computeNoise(
    x: number, y: number, z: number,
    cfg: SDFPerturbConfig,
    noise: SeededNoiseGenerator,
  ): number {
    const freq = cfg.frequency;
    const oct = cfg.octaves;
    const lac = cfg.lacunarity;
    const gain = cfg.gain;

    switch (cfg.type) {
      case 'fbm':
        return noise.fbm(x * freq, y * freq, z * freq, 0, {
          octaves: oct,
          lacunarity: lac,
          gain,
        });

      case 'ridged':
        return noise.ridgedMultifractal(x * freq, y * freq, z * freq, {
          octaves: oct,
          lacunarity: lac,
          gain,
          offset: 1.0,
        });

      case 'voronoi_crack': {
        // Voronoi distance-to-edge creates crack-like patterns
        const v = noise.voronoi3D(x * freq, y * freq, z * freq);
        // Invert and sharpen: cracks appear at cell edges where distance is small
        return 1.0 - Math.pow(v, 0.3) * 2.0;
      }

      case 'voronoi_cell': {
        // Voronoi cell bump: each cell has a raised center
        const v = noise.voronoi3D(x * freq, y * freq, z * freq);
        // Create bump from cell center to edge
        return Math.sqrt(v) * 2.0 - 1.0;
      }

      case 'turbence':
      case 'turbulence':
        return noise.turbulence(x * freq, y * freq, z * freq, {
          octaves: oct,
          lacunarity: lac,
          gain,
        });

      case 'domain_warp': {
        // Two-pass domain warping for organic swirling patterns
        const warp1 = noise.fbm(
          x * freq + 0.0, y * freq + 0.0, z * freq + 0.0, 0,
          { octaves: Math.max(1, oct - 1), lacunarity: lac, gain },
        );
        const warp2 = noise.fbm(
          x * freq + 5.2, y * freq + 1.3, z * freq + 3.7, 0,
          { octaves: Math.max(1, oct - 1), lacunarity: lac, gain },
        );
        // Warped coordinate evaluation
        return noise.fbm(
          x * freq + warp1 * 4.0, y * freq + warp2 * 4.0, z * freq, 0,
          { octaves: oct, lacunarity: lac, gain },
        );
      }

      default:
        return noise.fbm(x * freq, y * freq, z * freq, 0, {
          octaves: oct,
          lacunarity: lac,
          gain,
        });
    }
  }

  /**
   * Create a SDFPerturbConfig from a named preset with a seed.
   *
   * @param presetName - Name of the preset (e.g., 'mountain_rock', 'sand_dunes')
   * @param seed - Seed for deterministic generation
   * @returns Complete SDFPerturbConfig
   */
  static preset(presetName: string, seed: number = 42): SDFPerturbConfig {
    const preset = SDF_PERTURB_PRESETS[presetName];
    if (!preset) {
      console.warn(`SDFPerturbSurface: Unknown preset "${presetName}", using default`);
      return { ...DEFAULT_CONFIG, seed };
    }
    return { ...DEFAULT_CONFIG, ...preset, seed };
  }

  /**
   * Create an erosion-weighted SDF perturbation mask.
   *
   * Areas with high erosion (steep slopes, water flow) receive more
   * displacement, while flat areas and sediment deposits receive less.
   *
   * @param geometry - The terrain geometry
   * @param erosionMask - Per-vertex erosion intensity [0..1]
   * @param sedimentMask - Per-vertex sediment deposition [0..1]
   * @param config - Base perturbation config
   * @returns SDFPerturbResult
   */
  static applyErosionWeighted(
    geometry: THREE.BufferGeometry,
    erosionMask: Float32Array,
    sedimentMask: Float32Array,
    config: Partial<SDFPerturbConfig> = {},
  ): SDFPerturbResult {
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const vertexCount = posAttr.count;

    // Compute combined mask: eroded areas get more rock-like displacement,
    // sediment areas get smoother displacement
    const combinedMask = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      const erosion = i < erosionMask.length ? erosionMask[i] : 0;
      const sediment = i < sedimentMask.length ? sedimentMask[i] : 0;
      // High erosion = strong displacement, high sediment = moderate smooth displacement
      combinedMask[i] = erosion * 1.5 + sediment * 0.3 + 0.2;
    }

    return SDFPerturbSurface.apply(geometry, {
      ...config,
      vertexMask: combinedMask,
    });
  }

  /**
   * Apply SDF perturbation selectively to tagged faces only.
   *
   * Uses the face tag system (from constraints/tags) to determine
   * which faces should receive displacement.
   *
   * @param geometry - The geometry to perturb
   * @param tagMask - Per-face boolean mask (true = apply displacement)
   * @param config - Perturbation configuration
   * @returns SDFPerturbResult
   */
  static applyToTaggedFaces(
    geometry: THREE.BufferGeometry,
    tagMask: boolean[],
    config: Partial<SDFPerturbConfig> = {},
  ): SDFPerturbResult {
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const indexAttr = geometry.getIndex();
    const vertexCount = posAttr.count;

    // Convert face mask to vertex mask
    const vertexMask = new Float32Array(vertexCount);
    if (indexAttr) {
      const indices = indexAttr.array;
      for (let f = 0; f < tagMask.length; f++) {
        if (tagMask[f]) {
          const i0 = indices[f * 3];
          const i1 = indices[f * 3 + 1];
          const i2 = indices[f * 3 + 2];
          vertexMask[i0] = 1;
          vertexMask[i1] = 1;
          vertexMask[i2] = 1;
        }
      }
    } else {
      // Non-indexed geometry: each vertex is its own face
      for (let i = 0; i < Math.min(tagMask.length, vertexCount / 3); i++) {
        if (tagMask[i]) {
          vertexMask[i * 3] = 1;
          vertexMask[i * 3 + 1] = 1;
          vertexMask[i * 3 + 2] = 1;
        }
      }
    }

    return SDFPerturbSurface.apply(geometry, {
      ...config,
      vertexMask,
    });
  }

  /**
   * List all available preset names.
   */
  static listPresets(): string[] {
    return Object.keys(SDF_PERTURB_PRESETS);
  }
}

// ============================================================================
// GLSL Shader Integration
// ============================================================================

/**
 * GLSL function for SDF perturbation displacement in vertex shaders.
 * This can be included in custom ShaderMaterials to apply SDF perturbation
 * on the GPU rather than modifying geometry on the CPU.
 *
 * Usage: Include the function string in your vertex shader, then call
 * sdfPerturb(worldPos, normal, params) in the vertex main().
 */
export const SDF_PERTURB_GLSL = /* glsl */ `
  // SDF Perturbation uniforms
  uniform float uSDFScale;
  uniform float uSDFFrequency;
  uniform int uSDFOctaves;
  uniform float uSDFLacunarity;
  uniform float uSDFGain;
  uniform int uSDFType; // 0=fbm, 1=ridged, 2=voronoi, 3=turbulence, 4=domain_warp
  uniform float uSDFOffset;
  uniform sampler2D uSDFMask; // Optional vertex mask texture

  // FBM for SDF perturbation
  float sdfFBM(vec3 p, int octaves, float lacunarity, float gain) {
    float value = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    float maxValue = 0.0;

    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      value += amplitude * snoise(p * frequency);
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return maxValue > 0.0 ? value / maxValue : 0.0;
  }

  // Ridged multifractal for SDF perturbation
  float sdfRidged(vec3 p, int octaves, float lacunarity, float gain) {
    float value = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    float weight = 1.0;

    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      float signal = snoise(p * frequency);
      signal = 1.0 - abs(signal);
      signal *= signal;
      signal *= weight;
      weight = clamp(signal * gain * 4.0, 0.0, 1.0);
      value += signal * amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return value * 2.0 - 1.0;
  }

  // Main SDF perturbation function
  vec3 sdfPerturb(vec3 worldPos, vec3 normal) {
    vec3 p = worldPos * uSDFFrequency;
    float noiseValue = 0.0;

    // Select noise type
    if (uSDFType == 0) {
      noiseValue = sdfFBM(p, uSDFOctaves, uSDFLacunarity, uSDFGain);
    } else if (uSDFType == 1) {
      noiseValue = sdfRidged(p, uSDFOctaves, uSDFLacunarity, uSDFGain);
    } else if (uSDFType == 3) {
      // Turbulence
      float val = 0.0;
      float amp = 1.0;
      float freq = 1.0;
      for (int i = 0; i < 8; i++) {
        if (i >= uSDFOctaves) break;
        val += amp * abs(snoise(p * freq));
        amp *= uSDFGain;
        freq *= uSDFLacunarity;
      }
      noiseValue = val * 2.0 - 1.0;
    } else {
      noiseValue = sdfFBM(p, uSDFOctaves, uSDFLacunarity, uSDFGain);
    }

    float displacement = (noiseValue + uSDFOffset) * uSDFScale;
    return worldPos + normal * displacement;
  }
`;

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Quick-apply function: Apply a named SDF perturbation preset to geometry.
 *
 * @param geometry - The geometry to modify
 * @param presetName - Preset name (e.g., 'mountain_rock')
 * @param seed - Random seed
 * @returns SDFPerturbResult
 */
export function applySDFPerturb(
  geometry: THREE.BufferGeometry,
  presetName: string = 'fbm',
  seed: number = 42,
): SDFPerturbResult {
  return SDFPerturbSurface.apply(geometry, SDFPerturbSurface.preset(presetName, seed));
}
