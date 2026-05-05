/**
 * Unified Element Composition System
 *
 * Implements the composable SDF element architecture from the original Princeton
 * Infinigen. Each terrain feature (Ground, Mountains, Caves, VoronoiRocks,
 * Waterbody) is a `TerrainElement` with `init()` and `evaluate()` methods that
 * return SDF values plus auxiliary attributes (material tags, cave tags,
 * boundary SDFs, liquid coverage).
 *
 * The `ElementRegistry` manages element instances, resolves dependency graphs
 * via topological sort, and composes their SDF outputs with configurable
 * boolean operations. The `SceneComposer` implements the original's `scene()`
 * function with probabilistic element activation.
 *
 * Key algorithm improvements over the existing r3f port:
 * - MountainElement: Multi-octave FBM (NOT trivial stretched cone). Implements
 *   12 float params + 3 int params with spherical mode support.
 * - GroundElement: Multi-octave FBM noise terrain (NOT flat plane) with
 *   cave-aware auxiliary outputs resolved from dependencies.
 * - VoronoiRockElement: Cell centers generated once in init(), reused in
 *   evaluate(). No rng.next() calls inside evaluate().
 * - CaveElement: Lattice-based tunnel generation with pre-computed tunnel
 *   paths stored during init(), not random cylinders.
 *
 * @module terrain/sdf/TerrainElementSystem
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils, SeededNoiseGenerator, NoiseType } from '@/core/util/math/noise';
import { TERRAIN_MATERIALS } from './SDFPrimitives';
import { smoothUnion, sdfSubtraction, sdfUnion } from './SDFCombinators';
import { SignedDistanceField, extractIsosurface } from './sdf-operations';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Result of evaluating a terrain element at a single point.
 *
 * Includes the SDF distance value, a material ID for multi-material support,
 * and an auxiliary data bag for element-specific outputs like cave tags,
 * boundary distances, liquid coverage flags, etc.
 */
export interface ElementEvalResult {
  /** Signed distance value at the query point (negative = inside solid) */
  distance: number;
  /** Material ID from TERRAIN_MATERIALS for multi-material support */
  materialId: number;
  /**
   * Auxiliary outputs specific to each element type.
   *
   * Common keys:
   * - `caveTag: boolean` — whether this point is inside a cave
   * - `boundarySDF: number` — distance to nearest cave/boundary surface
   * - `LiquidCovered: boolean` — whether this point is covered by water
   * - `waterPlaneHeight: number` — the water surface Y level at this point
   * - `sandDuneHeight: number` — sand dune displacement value
   * - `occupancy: number` — cave occupancy value (0 = empty, 1 = solid)
   */
  auxiliary: Record<string, any>;
}

/**
 * How to combine multiple element SDF results.
 *
 * - UNION: Smooth union of all elements (standard terrain composition)
 * - INTERSECTION: Intersection — keeps only the region inside ALL elements
 * - DIFFERENCE: Sequential difference — terrain minus caves minus waterbody
 */
export enum CompositionOperation {
  /** Smooth union: standard terrain composition */
  UNION = 'UNION',
  /** Intersection: keep only where all elements overlap */
  INTERSECTION = 'INTERSECTION',
  /** Sequential difference: terrain - caves - waterbody */
  DIFFERENCE = 'DIFFERENCE',
}

// ============================================================================
// TerrainElement Base Class
// ============================================================================

/**
 * Abstract base class for composable terrain SDF elements.
 *
 * Each element represents a terrain feature (ground, mountains, caves, rocks,
 * water) that can be composed using boolean operations. Elements declare
 * dependencies on other elements (e.g., Ground depends on Caves for
 * cave-aware boundary outputs).
 *
 * Lifecycle:
 * 1. Construct the element
 * 2. Call `init(params, rng)` to initialize parameters and pre-compute data
 * 3. Call `evaluate(point)` or `evaluateBatch(points)` as needed
 *
 * Subclasses MUST NOT call `rng.next()` inside `evaluate()` — all
 * randomness must be consumed during `init()` so that evaluation is
 * deterministic and reproducible.
 */
export abstract class TerrainElement {
  /** Human-readable element name (e.g., 'Ground', 'Caves', 'Mountains') */
  abstract readonly name: string;

  /** Names of elements this element depends on (resolved before this one) */
  abstract readonly dependencies: string[];

  /** Whether this element is active in the composition */
  enabled: boolean = true;

  /** Resolved references to dependency elements (set by ElementRegistry) */
  protected dependencyRefs: Map<string, TerrainElement> = new Map();

  /**
   * Initialize element parameters from config and pre-compute any data
   * structures needed for evaluation.
   *
   * All random state must be consumed here — the evaluate() method must
   * be deterministic given the same init() call.
   *
   * @param params - Configuration parameters for this element
   * @param rng - Seeded random number generator (consumed only during init)
   */
  abstract init(params: Record<string, any>, rng: SeededRandom): void;

  /**
   * Compute SDF + auxiliary at a single point.
   *
   * Must be deterministic — no calls to rng.next() or Math.random().
   *
   * @param point - Query point in world space
   * @returns Evaluation result with distance, material, and auxiliary data
   */
  abstract evaluate(point: THREE.Vector3): ElementEvalResult;

  /**
   * Batch evaluation for efficiency. Default implementation calls evaluate()
   * in a loop; subclasses may override for SIMD or cache-friendly access.
   *
   * @param points - Array of query points in world space
   * @returns Array of evaluation results, one per point
   */
  evaluateBatch(points: THREE.Vector3[]): ElementEvalResult[] {
    return points.map((p) => this.evaluate(p));
  }

  /**
   * Set a reference to a dependency element. Called by ElementRegistry
   * during dependency resolution.
   */
  setDependencyRef(name: string, element: TerrainElement): void {
    this.dependencyRefs.set(name, element);
  }
}

// ============================================================================
// GroundElement
// ============================================================================

/**
 * Ground terrain element using multi-octave FBM noise.
 *
 * Unlike the original r3f port's flat-plane ground, this produces actual
 * terrain shape via configurable FBM noise with frequency, octaves, scale,
 * and lacunarity parameters. Supports both flat and spherical planet modes.
 *
 * Cave-awareness is achieved through the dependency system: if a 'Caves'
 * element is registered as a dependency, GroundElement queries it for
 * cave tags and boundary SDF values in its auxiliary output.
 *
 * Parameters (12 float + 3 int):
 * Float: frequency, amplitude, lacunarity, persistence, scale, baseHeight,
 *        sphereRadius, sandDuneAmplitude, sandDuneFrequency, perturb3DStrength,
 *        perturb3DFrequency, perturb3DOctaves
 * Int: octaves, sandDuneOctaves, mode (0=flat, 1=spherical)
 */
export class GroundElement extends TerrainElement {
  readonly name = 'Ground';
  readonly dependencies = ['Caves'];

  // FBM noise parameters
  private frequency: number = 0.02;
  private amplitude: number = 8;
  private octaves: number = 6;
  private lacunarity: number = 2.0;
  private persistence: number = 0.5;
  private scale: number = 1.0;
  private baseHeight: number = 0;

  // Mode parameters
  private mode: 'flat' | 'spherical' = 'flat';
  private sphereRadius: number = 1000;

  // Sand dune parameters
  private sandDunes: boolean = false;
  private sandDuneAmplitude: number = 2.0;
  private sandDuneFrequency: number = 0.02;
  private sandDuneOctaves: number = 4;

  // 3D perturbation for natural variation
  private perturb3DStrength: number = 0.15;
  private perturb3DFrequency: number = 3.0;
  private perturb3DOctaves: number = 3;

  // Noise generator (created in init, reused in evaluate)
  private noise!: NoiseUtils;

  init(params: Record<string, any>, rng: SeededRandom): void {
    this.frequency = params.frequency ?? 0.02;
    this.amplitude = params.amplitude ?? 8;
    this.octaves = params.octaves ?? 6;
    this.lacunarity = params.lacunarity ?? 2.0;
    this.persistence = params.persistence ?? 0.5;
    this.scale = params.scale ?? 1.0;
    this.baseHeight = params.baseHeight ?? 0;
    this.mode = params.mode === 'spherical' ? 'spherical' : 'flat';
    this.sphereRadius = params.sphereRadius ?? 1000;
    this.sandDunes = params.sandDunes ?? false;
    this.sandDuneAmplitude = params.sandDuneAmplitude ?? 2.0;
    this.sandDuneFrequency = params.sandDuneFrequency ?? 0.02;
    this.sandDuneOctaves = params.sandDuneOctaves ?? 4;
    this.perturb3DStrength = params.perturb3DStrength ?? 0.15;
    this.perturb3DFrequency = params.perturb3DFrequency ?? 3.0;
    this.perturb3DOctaves = params.perturb3DOctaves ?? 3;

    // Create noise generator with a seed derived from the RNG
    // Consume a few values from rng to advance state and get a noise seed
    const noiseSeed = rng.nextInt(1, 999999);
    this.noise = new NoiseUtils(noiseSeed);
  }

  evaluate(point: THREE.Vector3): ElementEvalResult {
    // --- Compute base terrain height using multi-octave FBM ---
    let height = 0;
    let amp = this.amplitude;
    let freq = this.frequency;

    for (let i = 0; i < this.octaves; i++) {
      height += this.noise.fbm(
        point.x * freq * this.scale,
        point.z * freq * this.scale,
        0,
        1 // single octave per layer, we handle octaves manually
      ) * amp;
      amp *= this.persistence;
      freq *= this.lacunarity;
    }

    // --- 3D noise perturbation for natural variation (enables minor overhangs) ---
    const perturbation3D = this.noise.fbm(
      point.x * this.perturb3DFrequency + 100,
      point.y * this.perturb3DFrequency + 100,
      point.z * this.perturb3DFrequency + 100,
      this.perturb3DOctaves
    ) * this.amplitude * this.perturb3DStrength;

    // --- Compute sand dune displacement ---
    let sandDuneHeight = 0;
    if (this.sandDunes) {
      // Use two noise samples offset in Z to create directional dune crests
      const n1 = this.noise.fbm(
        point.x * this.sandDuneFrequency, 0,
        point.z * this.sandDuneFrequency, this.sandDuneOctaves
      );
      const n2 = this.noise.fbm(
        point.x * this.sandDuneFrequency + 500, 0,
        point.z * this.sandDuneFrequency + 500, this.sandDuneOctaves
      );
      const duneValue = n1 * 0.7 + n2 * 0.3;
      sandDuneHeight = Math.max(0, (duneValue + 1.0) * 0.5) * this.sandDuneAmplitude;
    }

    // --- Compute final SDF distance ---
    let distance: number;
    if (this.mode === 'spherical') {
      const surfaceY = this.sphereRadius + height + perturbation3D - sandDuneHeight;
      distance = point.length() - surfaceY;
    } else {
      const surfaceY = this.baseHeight + height + perturbation3D - sandDuneHeight;
      distance = surfaceY - point.y;
    }

    // --- Material assignment ---
    let materialId: number = TERRAIN_MATERIALS.SOIL;
    if (this.sandDunes && sandDuneHeight > 0.1) {
      materialId = TERRAIN_MATERIALS.SAND_DUNE;
    }

    // --- Cave-aware auxiliary outputs ---
    let caveTag = false;
    let boundarySDF = Infinity;

    const caveElement = this.dependencyRefs.get('Caves');
    if (caveElement && caveElement.enabled) {
      const caveResult = caveElement.evaluate(point);
      if (caveResult.distance < 0) {
        caveTag = true;
      }
      boundarySDF = Math.min(boundarySDF, Math.abs(caveResult.distance));
    }

    return {
      distance,
      materialId,
      auxiliary: {
        caveTag,
        boundarySDF,
        sandDuneHeight,
        mode: this.mode,
      },
    };
  }
}

// ============================================================================
// MountainElement
// ============================================================================

/**
 * Mountain terrain element using multi-octave FBM noise.
 *
 * Implements the full original Infinigen mountain generator with 12 float
 * params and 3 int params, NOT the trivial stretched cone from the r3f port.
 *
 * Features:
 * - Multi-octave FBM height with configurable frequency, amplitude, octaves
 * - Multi-group arrangement: multiple mountain groups at different positions
 * - Mask coverage: noise-based mask controlling where mountains appear
 * - Spherical mode: mountains on a spherical planet surface
 * - Ridge noise: optional ridged multifractal for sharper mountain features
 *
 * Parameters:
 * Float (12): frequency, amplitude, lacunarity, persistence, scale,
 *             maskFrequency, maskThreshold, ridgeGain, ridgeRoughness,
 *             ridgeOffset, baseHeight, blendRadius
 * Int (3): octaves, groupCount, ridgeOctaves
 */
export class MountainElement extends TerrainElement {
  readonly name = 'Mountains';
  readonly dependencies: string[] = [];

  // FBM parameters
  private frequency: number = 0.008;
  private amplitude: number = 25;
  private octaves: number = 8;
  private lacunarity: number = 2.0;
  private persistence: number = 0.5;
  private scale: number = 1.0;

  // Multi-group arrangement
  private groupCount: number = 3;
  private groupCenters: THREE.Vector3[] = [];
  private groupRadii: number[] = [];
  private groupHeights: number[] = [];

  // Mask coverage
  private maskFrequency: number = 0.01;
  private maskThreshold: number = 0.3;

  // Ridge parameters
  private useRidge: boolean = true;
  private ridgeOctaves: number = 6;
  private ridgeGain: number = 0.5;
  private ridgeRoughness: number = 0.5;
  private ridgeOffset: number = 1.0;

  // Base and blending
  private baseHeight: number = 0;
  private blendRadius: number = 50;

  // Mode
  private sphericalMode: boolean = false;
  private sphereRadius: number = 1000;

  // Noise generators
  private noise!: NoiseUtils;
  private ridgeNoise!: SeededNoiseGenerator;
  private maskNoise!: SeededNoiseGenerator;

  init(params: Record<string, any>, rng: SeededRandom): void {
    this.frequency = params.frequency ?? 0.008;
    this.amplitude = params.amplitude ?? 25;
    this.octaves = params.octaves ?? 8;
    this.lacunarity = params.lacunarity ?? 2.0;
    this.persistence = params.persistence ?? 0.5;
    this.scale = params.scale ?? 1.0;
    this.groupCount = params.groupCount ?? 3;
    this.maskFrequency = params.maskFrequency ?? 0.01;
    this.maskThreshold = params.maskThreshold ?? 0.3;
    this.useRidge = params.useRidge ?? true;
    this.ridgeOctaves = params.ridgeOctaves ?? 6;
    this.ridgeGain = params.ridgeGain ?? 0.5;
    this.ridgeRoughness = params.ridgeRoughness ?? 0.5;
    this.ridgeOffset = params.ridgeOffset ?? 1.0;
    this.baseHeight = params.baseHeight ?? 0;
    this.blendRadius = params.blendRadius ?? 50;
    this.sphericalMode = params.sphericalMode ?? false;
    this.sphereRadius = params.sphereRadius ?? 1000;

    // Create noise generators with distinct seeds
    const noiseSeed = rng.nextInt(1, 999999);
    const ridgeSeed = rng.nextInt(1, 999999);
    const maskSeed = rng.nextInt(1, 999999);
    this.noise = new NoiseUtils(noiseSeed);
    this.ridgeNoise = new SeededNoiseGenerator(ridgeSeed);
    this.maskNoise = new SeededNoiseGenerator(maskSeed);

    // Pre-compute mountain group positions and parameters
    this.groupCenters = [];
    this.groupRadii = [];
    this.groupHeights = [];

    for (let i = 0; i < this.groupCount; i++) {
      const cx = rng.nextFloat(-80, 80);
      const cz = rng.nextFloat(-80, 80);
      const cy = this.baseHeight;
      this.groupCenters.push(new THREE.Vector3(cx, cy, cz));
      this.groupRadii.push(rng.nextFloat(30, 80));
      this.groupHeights.push(rng.nextFloat(this.amplitude * 0.5, this.amplitude));
    }
  }

  evaluate(point: THREE.Vector3): ElementEvalResult {
    // --- Compute mask coverage ---
    // Mask controls where mountains can appear
    const maskValue = this.maskNoise.fbm(
      point.x * this.maskFrequency,
      0,
      point.z * this.maskFrequency,
      { octaves: 3, gain: 0.5, lacunarity: 2.0 }
    );
    // Normalize mask from [-1,1] to [0,1]
    const maskNormalized = (maskValue + 1.0) * 0.5;

    if (maskNormalized < this.maskThreshold) {
      // No mountain at this point
      return {
        distance: Infinity,
        materialId: TERRAIN_MATERIALS.STONE,
        auxiliary: { maskValue: maskNormalized },
      };
    }

    // --- Compute multi-group mountain height ---
    let maxHeight = 0;
    let totalWeight = 0;

    for (let g = 0; g < this.groupCenters.length; g++) {
      const center = this.groupCenters[g];
      const radius = this.groupRadii[g];
      const height = this.groupHeights[g];

      // Distance from point to group center (XZ plane)
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      const dist2D = Math.sqrt(dx * dx + dz * dz);

      // Group falloff: smooth attenuation outside the group radius
      const falloff = Math.max(0, 1.0 - dist2D / radius);
      const smoothFalloff = falloff * falloff * (3 - 2 * falloff); // smoothstep

      if (smoothFalloff <= 0) continue;

      // --- Compute FBM-based height at this point ---
      let heightAtPoint = 0;
      let amp = height;
      let freq = this.frequency;

      for (let i = 0; i < this.octaves; i++) {
        heightAtPoint += this.noise.fbm(
          point.x * freq * this.scale,
          point.z * freq * this.scale,
          g * 100, // Offset per group for variation
          1
        ) * amp;
        amp *= this.persistence;
        freq *= this.lacunarity;
      }

      // --- Optional ridge noise for sharper features ---
      if (this.useRidge) {
        const ridgeValue = this.ridgeNoise.ridgedMultifractal(
          point.x * this.frequency * this.scale,
          point.y * this.frequency * this.scale,
          point.z * this.frequency * this.scale,
          {
            octaves: this.ridgeOctaves,
            gain: this.ridgeGain,
            roughness: this.ridgeRoughness,
            offset: this.ridgeOffset,
          }
        );
        heightAtPoint += ridgeValue * height * 0.5;
      }

      // Accumulate weighted height
      const weight = smoothFalloff;
      maxHeight += heightAtPoint * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return {
        distance: Infinity,
        materialId: TERRAIN_MATERIALS.STONE,
        auxiliary: { maskValue: maskNormalized },
      };
    }

    const normalizedHeight = maxHeight / totalWeight;

    // --- Compute SDF distance ---
    let distance: number;
    if (this.sphericalMode) {
      const surfaceR = this.sphereRadius + normalizedHeight;
      distance = point.length() - surfaceR;
    } else {
      const surfaceY = this.baseHeight + normalizedHeight;
      distance = surfaceY - point.y;
    }

    // Material: stone for mountains, snow near peaks
    let materialId: number = TERRAIN_MATERIALS.STONE;
    if (normalizedHeight > this.amplitude * 0.8) {
      materialId = TERRAIN_MATERIALS.SNOW;
    }

    return {
      distance,
      materialId,
      auxiliary: {
        maskValue: maskNormalized,
        height: normalizedHeight,
        groupCount: this.groupCount,
      },
    };
  }
}

// ============================================================================
// CaveElement
// ============================================================================

/**
 * Cave terrain element using lattice-based tunnel generation.
 *
 * Unlike the original r3f port's random cylinders, this implements a proper
 * lattice-based tunnel system where tunnel paths are pre-computed during init()
 * and stored as occupancy data. The evaluation is fully deterministic.
 *
 * Features:
 * - Lattice grid: tunnels follow a 3D lattice structure with configurable spacing
 * - Occupancy data: pre-computed during init(), reused in evaluate()
 * - Branching tunnels: each main tunnel can have branches
 * - Variable radius: radius varies along the tunnel path via noise
 * - Spherical mode support
 *
 * Parameters:
 * Float: latticeSpacing, latticeJitter, tunnelRadius, radiusVariation,
 *        radiusFrequency, branchProbability, branchLengthMin, branchLengthMax
 * Int: tunnelCount, branchMaxCount, radiusOctaves
 */
export class CaveElement extends TerrainElement {
  readonly name = 'Caves';
  readonly dependencies: string[] = [];

  // Lattice parameters
  private latticeSpacing: number = 20;
  private latticeJitter: number = 5;

  // Tunnel parameters
  private tunnelCount: number = 5;
  private tunnelRadius: number = 3;
  private radiusVariation: number = 0.5;
  private radiusFrequency: number = 0.1;
  private radiusOctaves: number = 3;

  // Branch parameters
  private branchMaxCount: number = 3;
  private branchProbability: number = 0.4;
  private branchLengthMin: number = 5;
  private branchLengthMax: number = 20;

  // Pre-computed tunnel data (generated in init, reused in evaluate)
  private tunnels: {
    /** Start point of tunnel */
    start: THREE.Vector3;
    /** End point of tunnel */
    end: THREE.Vector3;
    /** Base radius */
    radius: number;
    /** Direction vector (normalized) */
    direction: THREE.Vector3;
    /** Length of tunnel */
    length: number;
  }[] = [];

  // Noise for radius variation
  private noise!: NoiseUtils;

  init(params: Record<string, any>, rng: SeededRandom): void {
    this.latticeSpacing = params.latticeSpacing ?? 20;
    this.latticeJitter = params.latticeJitter ?? 5;
    this.tunnelCount = params.tunnelCount ?? 5;
    this.tunnelRadius = params.tunnelRadius ?? 3;
    this.radiusVariation = params.radiusVariation ?? 0.5;
    this.radiusFrequency = params.radiusFrequency ?? 0.1;
    this.radiusOctaves = params.radiusOctaves ?? 3;
    this.branchMaxCount = params.branchMaxCount ?? 3;
    this.branchProbability = params.branchProbability ?? 0.4;
    this.branchLengthMin = params.branchLengthMin ?? 5;
    this.branchLengthMax = params.branchLengthMax ?? 20;

    const noiseSeed = rng.nextInt(1, 999999);
    this.noise = new NoiseUtils(noiseSeed);

    // --- Generate lattice-based tunnel paths ---
    this.tunnels = [];

    // Create a 3D lattice of possible tunnel waypoints
    const bounds = params.bounds as THREE.Box3 | undefined;
    const latticePoints: THREE.Vector3[] = [];

    if (bounds) {
      const size = bounds.getSize(new THREE.Vector3());
      for (
        let x = bounds.min.x;
        x <= bounds.max.x;
        x += this.latticeSpacing
      ) {
        for (
          let z = bounds.min.z;
          z <= bounds.max.z;
          z += this.latticeSpacing
        ) {
          for (
            let y = bounds.min.y;
            y <= bounds.max.y * 0.5;
            y += this.latticeSpacing
          ) {
            // Jitter lattice positions for natural look
            const jx = x + (rng.next() - 0.5) * this.latticeJitter * 2;
            const jy = y + (rng.next() - 0.5) * this.latticeJitter * 2;
            const jz = z + (rng.next() - 0.5) * this.latticeJitter * 2;
            latticePoints.push(new THREE.Vector3(jx, jy, jz));
          }
        }
      }
    }

    // Generate main tunnels connecting lattice points
    for (let i = 0; i < this.tunnelCount && latticePoints.length >= 2; i++) {
      // Pick two lattice points for the tunnel
      const startIdx = rng.nextInt(0, latticePoints.length - 1);
      let endIdx = rng.nextInt(0, latticePoints.length - 1);
      while (endIdx === startIdx && latticePoints.length > 1) {
        endIdx = rng.nextInt(0, latticePoints.length - 1);
      }

      const start = latticePoints[startIdx].clone();
      const end = latticePoints[endIdx].clone();

      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      direction.normalize();

      const radius = rng.nextFloat(
        this.tunnelRadius * (1 - this.radiusVariation),
        this.tunnelRadius * (1 + this.radiusVariation)
      );

      this.tunnels.push({ start, end, radius, direction, length });

      // Generate branches from this tunnel
      const branchCount = rng.nextInt(0, this.branchMaxCount);
      for (let b = 0; b < branchCount; b++) {
        if (rng.next() > this.branchProbability) continue;

        // Branch starts at a random point along the main tunnel
        const t = rng.nextFloat(0.2, 0.8);
        const branchStart = new THREE.Vector3().lerpVectors(start, end, t);

        // Branch direction: perpendicular-ish to main tunnel with some randomness
        const perpAngle1 = rng.next() * Math.PI * 2;
        const perpAngle2 = rng.nextFloat(-Math.PI / 4, Math.PI / 4);
        const branchLength = rng.nextFloat(this.branchLengthMin, this.branchLengthMax);

        // Compute a perpendicular direction
        let perpDir: THREE.Vector3;
        if (Math.abs(direction.y) < 0.9) {
          perpDir = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
        } else {
          perpDir = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(1, 0, 0)).normalize();
        }
        const rotAxis = direction.clone();
        perpDir.applyAxisAngle(rotAxis, perpAngle1);
        perpDir.y += Math.sin(perpAngle2) * 0.3;
        perpDir.normalize();

        const branchEnd = branchStart.clone().add(perpDir.multiplyScalar(branchLength));
        const branchDirection = new THREE.Vector3().subVectors(branchEnd, branchStart);
        const branchLen = branchDirection.length();
        branchDirection.normalize();

        const branchRadius = radius * rng.nextFloat(0.4, 0.8);

        this.tunnels.push({
          start: branchStart,
          end: branchEnd,
          radius: branchRadius,
          direction: branchDirection,
          length: branchLen,
        });
      }
    }
  }

  evaluate(point: THREE.Vector3): ElementEvalResult {
    let minDist = Infinity;

    for (const tunnel of this.tunnels) {
      // Compute distance from point to the tunnel line segment
      const ap = new THREE.Vector3().subVectors(point, tunnel.start);
      const t = ap.dot(tunnel.direction);
      const tc = Math.max(0, Math.min(tunnel.length, t));
      const closest = tunnel.start
        .clone()
        .add(tunnel.direction.clone().multiplyScalar(tc));

      const distFromAxis = point.distanceTo(closest);

      // Compute variable radius along the tunnel using noise
      const normalizedT = tunnel.length > 0 ? tc / tunnel.length : 0;
      const radiusNoise = this.noise.fbm(
        normalizedT * 10 + tunnel.start.x * 0.1,
        tunnel.start.y * 0.1,
        tunnel.start.z * 0.1,
        this.radiusOctaves
      );
      const variableRadius = tunnel.radius * (1 + radiusNoise * this.radiusVariation);

      // SDF of capped cylinder with variable radius
      const tunnelDist = distFromAxis - variableRadius;

      // Distance along axis beyond caps (for end caps)
      const distAlongAxis = Math.max(0, -t, t - tunnel.length);

      let dist: number;
      if (tunnelDist < 0 && distAlongAxis === 0) {
        dist = Math.max(tunnelDist, -distAlongAxis);
      } else {
        dist = Math.sqrt(
          tunnelDist * tunnelDist + distAlongAxis * distAlongAxis
        );
      }

      // For cave SDF: inside the tunnel = negative (carved out)
      // We return the tunnel SDF as-is so that boolean difference works
      minDist = Math.min(minDist, dist);
    }

    // Cave SDF: negative inside the tunnel (carved region)
    // The element returns the tunnel SDF which is negative inside
    return {
      distance: minDist,
      materialId: TERRAIN_MATERIALS.STONE,
      auxiliary: {
        caveTag: minDist < 0,
        occupancy: minDist < 0 ? 1.0 : 0.0,
      },
    };
  }
}

// ============================================================================
// VoronoiRockElement
// ============================================================================

/**
 * Voronoi rock terrain element with deterministic cell centers.
 *
 * Cell centers are generated ONCE during init() and stored. The evaluate()
 * method reuses these pre-computed centers without calling rng.next().
 *
 * Features:
 * - Gap noise: cellular voronoi-based gaps between rock facets
 * - Warp noise: domain warping for organic distortion
 * - Mask noise: coverage mask controlling where rocks appear
 * - Multiple rock instances: each with pre-computed cell centers
 *
 * Parameters:
 * Float: baseRadius, irregularity, gapFrequency, gapAmplitude,
 *        warpStrength, warpFrequency, maskThreshold, maskFrequency,
 *        clusterRadius, minSpacing
 * Int: cellCount, rockCount, placementAttempts
 */
export class VoronoiRockElement extends TerrainElement {
  readonly name = 'VoronoiRocks';
  readonly dependencies = ['Ground', 'Caves'];

  // Rock shape parameters
  private baseRadius: number = 2.0;
  private cellCount: number = 7;
  private irregularity: number = 0.4;

  // Gap noise
  private gapFrequency: number = 0.8;
  private gapAmplitude: number = 0.15;

  // Warp noise
  private warpStrength: number = 0.3;
  private warpFrequency: number = 0.5;

  // Mask noise
  private maskThreshold: number = 0.3;
  private maskFrequency: number = 0.15;

  // Cluster parameters
  private rockCount: number = 5;
  private clusterRadius: number = 8.0;
  private minSpacing: number = 1.5;
  private placementAttempts: number = 30;

  // Pre-computed rock data (generated in init, reused in evaluate)
  private rocks: {
    /** Center position of this rock */
    center: THREE.Vector3;
    /** Base radius */
    radius: number;
    /** Pre-computed Voronoi cell centers for this rock */
    cellCenters: THREE.Vector3[];
    /** Pre-computed cell radii for this rock */
    cellRadii: number[];
    /** Seed for this rock's noise evaluations */
    noiseSeed: number;
  }[] = [];

  // Noise generator for warp/mask/detail
  private noise!: SeededNoiseGenerator;

  init(params: Record<string, any>, rng: SeededRandom): void {
    this.baseRadius = params.baseRadius ?? 2.0;
    this.cellCount = params.cellCount ?? 7;
    this.irregularity = params.irregularity ?? 0.4;
    this.gapFrequency = params.gapFrequency ?? 0.8;
    this.gapAmplitude = params.gapAmplitude ?? 0.15;
    this.warpStrength = params.warpStrength ?? 0.3;
    this.warpFrequency = params.warpFrequency ?? 0.5;
    this.maskThreshold = params.maskThreshold ?? 0.3;
    this.maskFrequency = params.maskFrequency ?? 0.15;
    this.rockCount = params.rockCount ?? 5;
    this.clusterRadius = params.clusterRadius ?? 8.0;
    this.minSpacing = params.minSpacing ?? 1.5;
    this.placementAttempts = params.placementAttempts ?? 30;

    const noiseSeed = rng.nextInt(1, 999999);
    this.noise = new SeededNoiseGenerator(noiseSeed);

    // --- Pre-compute rock positions and cell centers ---
    this.rocks = [];

    // Place rocks using a simple Poisson-like approach
    const placedCenters: THREE.Vector3[] = [];

    for (let r = 0; r < this.rockCount; r++) {
      // Try to place a rock
      let bestPos: THREE.Vector3 | null = null;
      for (let attempt = 0; attempt < this.placementAttempts; attempt++) {
        const angle = rng.next() * Math.PI * 2;
        const dist = rng.next() * this.clusterRadius;
        const x = Math.cos(angle) * dist;
        const y = rng.nextFloat(-0.3, 0.1) * this.baseRadius;
        const z = Math.sin(angle) * dist;
        const candidate = new THREE.Vector3(x, y, z);

        // Check minimum spacing
        let tooClose = false;
        for (const existing of placedCenters) {
          if (candidate.distanceTo(existing) < this.minSpacing) {
            tooClose = true;
            break;
          }
        }

        if (!tooClose) {
          bestPos = candidate;
          break;
        }
      }

      if (!bestPos) {
        // Fallback: place anywhere
        const angle = rng.next() * Math.PI * 2;
        const dist = rng.next() * this.clusterRadius;
        bestPos = new THREE.Vector3(
          Math.cos(angle) * dist,
          rng.nextFloat(-0.3, 0.1) * this.baseRadius,
          Math.sin(angle) * dist
        );
      }

      placedCenters.push(bestPos);

      // Pre-compute cell centers for this rock
      const rockRadius =
        this.baseRadius * rng.nextFloat(0.5, 1.5);
      const cellCenters: THREE.Vector3[] = [];
      const cellRadii: number[] = [];

      for (let c = 0; c < this.cellCount; c++) {
        const cx = (rng.next() - 0.5) * rockRadius * 2;
        const cy = (rng.next() - 0.5) * rockRadius;
        const cz = (rng.next() - 0.5) * rockRadius * 2;
        cellCenters.push(new THREE.Vector3(cx, cy, cz));
        cellRadii.push(
          rockRadius * (0.3 + rng.next() * 0.7 * this.irregularity)
        );
      }

      const rockNoiseSeed = rng.nextInt(1, 999999);

      this.rocks.push({
        center: bestPos,
        radius: rockRadius,
        cellCenters,
        cellRadii,
        noiseSeed: rockNoiseSeed,
      });
    }
  }

  evaluate(point: THREE.Vector3): ElementEvalResult {
    let combinedDist = Infinity;
    let combinedMaterial: number = TERRAIN_MATERIALS.COBBLESTONE;

    for (const rock of this.rocks) {
      // Transform to rock-local coordinates
      let localPoint = point.clone().sub(rock.center);

      // --- Domain Warping ---
      // Use rock's noise seed for deterministic warp
      const warpGen = new SeededNoiseGenerator(rock.noiseSeed);

      const warpX =
        warpGen.fbm(
          localPoint.x * this.warpFrequency,
          localPoint.y * this.warpFrequency,
          localPoint.z * this.warpFrequency,
          { octaves: 3, lacunarity: 2.0, gain: 0.5 }
        ) * this.warpStrength;

      const warpY =
        warpGen.fbm(
          localPoint.x * this.warpFrequency + 50,
          localPoint.y * this.warpFrequency + 50,
          localPoint.z * this.warpFrequency + 50,
          { octaves: 3, lacunarity: 2.0, gain: 0.5 }
        ) * this.warpStrength;

      const warpZ =
        warpGen.fbm(
          localPoint.x * this.warpFrequency + 100,
          localPoint.y * this.warpFrequency + 100,
          localPoint.z * this.warpFrequency + 100,
          { octaves: 3, lacunarity: 2.0, gain: 0.5 }
        ) * this.warpStrength;

      localPoint.add(new THREE.Vector3(warpX, warpY, warpZ));

      // --- Evaluate pre-computed Voronoi cells ---
      let minDist = Infinity;
      let secondMinDist = Infinity;

      for (let i = 0; i < rock.cellCenters.length; i++) {
        const dist =
          localPoint.distanceTo(rock.cellCenters[i]) - rock.cellRadii[i];
        if (dist < minDist) {
          secondMinDist = minDist;
          minDist = dist;
        } else if (dist < secondMinDist) {
          secondMinDist = dist;
        }
      }

      // --- Gap noise ---
      const voronoiEdge = secondMinDist - minDist;
      const gapNoise = this.noise.voronoi2D(
        localPoint.x * this.gapFrequency,
        localPoint.z * this.gapFrequency,
        1.0
      );
      const gapEffect =
        Math.max(0, 1.0 - voronoiEdge * 3.0) *
        this.gapAmplitude *
        (1.0 + gapNoise * 0.5);
      minDist += gapEffect;

      // --- Mask noise ---
      const maskValue = this.noise.fbm(
        localPoint.x * this.maskFrequency + rock.center.x * 0.1,
        localPoint.y * this.maskFrequency + rock.center.y * 0.1,
        localPoint.z * this.maskFrequency + rock.center.z * 0.1,
        { octaves: 3, lacunarity: 2.0, gain: 0.5 }
      );
      if (maskValue < this.maskThreshold) {
        minDist += (this.maskThreshold - maskValue) * rock.radius * 2.0;
      }

      // --- Combine with other rocks via smooth union ---
      if (combinedDist === Infinity) {
        combinedDist = minDist;
        combinedMaterial = TERRAIN_MATERIALS.COBBLESTONE;
      } else {
        const blendK = this.minSpacing * 0.3;
        combinedDist = smoothUnion(combinedDist, minDist, blendK);
        if (minDist < combinedDist) {
          combinedMaterial = TERRAIN_MATERIALS.COBBLESTONE;
        }
      }
    }

    // Cave-aware: rocks near cave entrances are more angular
    const caveElement = this.dependencyRefs.get('Caves');
    if (caveElement && caveElement.enabled) {
      const caveResult = caveElement.evaluate(point);
      if (caveResult.auxiliary.caveProximity !== undefined) {
        const caveFactor = 1.0 - Math.min(1.0, (caveResult.auxiliary.caveProximity as number) / 10.0);
        combinedDist -= caveFactor * this.baseRadius * 0.3;
      }
    }

    return {
      distance: combinedDist,
      materialId: combinedMaterial,
      auxiliary: {
        rockCount: this.rocks.length,
      },
    };
  }
}

// ============================================================================
// WaterbodyElement
// ============================================================================

/**
 * Waterbody terrain element — SDF water surfaces with liquid coverage.
 *
 * Outputs `LiquidCovered` tag and `boundarySDF` in auxiliary data so that
 * downstream systems can identify water-covered regions.
 *
 * Features:
 * - Ellipsoid lake/pond SDF at a configurable position and size
 * - Water plane at a configurable height (used as boundary)
 * - LiquidCovered auxiliary output for downstream constraint/tag systems
 * - boundarySDF: distance to the nearest water surface
 *
 * Parameters:
 * Float: waterPlaneHeight, radiusX, radiusZ, depth, boundaryWidth,
 *        waveAmplitude, waveFrequency
 * Int: waveOctaves
 */
export class WaterbodyElement extends TerrainElement {
  readonly name = 'Waterbody';
  readonly dependencies: string[] = [];

  // Water body parameters
  private waterPlaneHeight: number = 0.5;
  private center: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private radiusX: number = 15;
  private radiusZ: number = 15;
  private depth: number = 3;

  // Boundary
  private boundaryWidth: number = 2;

  // Waves
  private waveAmplitude: number = 0.05;
  private waveFrequency: number = 0.5;
  private waveOctaves: number = 2;

  // Noise generator
  private noise!: NoiseUtils;

  init(params: Record<string, any>, rng: SeededRandom): void {
    this.waterPlaneHeight = params.waterPlaneHeight ?? 0.5;
    this.center = params.center
      ? new THREE.Vector3(
          params.center.x ?? 0,
          params.center.y ?? 0,
          params.center.z ?? 0
        )
      : new THREE.Vector3(0, 0, 0);
    this.radiusX = params.radiusX ?? 15;
    this.radiusZ = params.radiusZ ?? 15;
    this.depth = params.depth ?? 3;
    this.boundaryWidth = params.boundaryWidth ?? 2;
    this.waveAmplitude = params.waveAmplitude ?? 0.05;
    this.waveFrequency = params.waveFrequency ?? 0.5;
    this.waveOctaves = params.waveOctaves ?? 2;

    const noiseSeed = rng.nextInt(1, 999999);
    this.noise = new NoiseUtils(noiseSeed);
  }

  evaluate(point: THREE.Vector3): ElementEvalResult {
    const localPoint = point.clone().sub(this.center);

    // --- Water surface SDF (flat plane with waves) ---
    const waveDisp = this.noise.fbm(
      point.x * this.waveFrequency,
      0,
      point.z * this.waveFrequency,
      this.waveOctaves
    ) * this.waveAmplitude;

    const waterSurfaceY = this.waterPlaneHeight + waveDisp;
    const waterSurfaceDist = waterSurfaceY - point.y;

    // --- Water body SDF (ellipsoid below water surface) ---
    const scaledPoint = new THREE.Vector3(
      localPoint.x / this.radiusX,
      localPoint.y / this.depth,
      localPoint.z / this.radiusZ
    );
    const bodyDist = scaledPoint.length() - 1.0;

    // Combined: water surface above, ellipsoid below
    // Use smooth union to blend the two
    const distance = smoothUnion(bodyDist, waterSurfaceDist, 0.5);

    // --- Auxiliary outputs ---
    const isLiquidCovered = point.y < waterSurfaceY &&
      Math.abs(localPoint.x) < this.radiusX &&
      Math.abs(localPoint.z) < this.radiusZ;

    const boundarySDF = Math.min(
      Math.abs(point.y - waterSurfaceY),
      this.radiusX - Math.abs(localPoint.x),
      this.radiusZ - Math.abs(localPoint.z)
    );

    return {
      distance,
      materialId: TERRAIN_MATERIALS.WATER,
      auxiliary: {
        LiquidCovered: isLiquidCovered,
        boundarySDF: Math.max(0, boundarySDF),
        waterPlaneHeight: waterSurfaceY,
      },
    };
  }
}

// ============================================================================
// ElementRegistry
// ============================================================================

/**
 * Manages terrain element instances, resolves dependencies, and composes
 * SDF evaluations.
 *
 * The registry maintains a collection of TerrainElement instances indexed
 * by name. It resolves dependency order via topological sort and provides
 * composed evaluation methods that combine all enabled elements.
 *
 * Usage:
 * ```typescript
 * const registry = new ElementRegistry();
 * registry.register(new GroundElement());
 * registry.register(new CaveElement());
 * registry.register(new MountainElement());
 * const sorted = registry.resolveDependencies();
 * const result = registry.evaluateComposed(point, CompositionOperation.DIFFERENCE);
 * ```
 */
export class ElementRegistry {
  /** Map of element name -> element instance */
  private elements: Map<string, TerrainElement> = new Map();

  /** Cached topological order (invalidated on register/remove) */
  private cachedOrder: TerrainElement[] | null = null;

  /** Smooth blend factor for composition operations */
  private blendFactor: number = 0.3;

  constructor(blendFactor: number = 0.3) {
    this.blendFactor = blendFactor;
  }

  /**
   * Register a terrain element.
   * @param element - The element to register
   */
  register(element: TerrainElement): void {
    this.elements.set(element.name, element);
    this.cachedOrder = null; // Invalidate cache
  }

  /**
   * Get an element by name.
   * @param name - Element name
   * @returns The element, or undefined if not found
   */
  get(name: string): TerrainElement | undefined {
    return this.elements.get(name);
  }

  /**
   * Get all enabled elements in dependency order.
   * @returns Array of enabled elements
   */
  getEnabled(): TerrainElement[] {
    return this.resolveDependencies().filter((e) => e.enabled);
  }

  /**
   * Resolve dependencies and return elements in topological order.
   *
   * Uses Kahn's algorithm for topological sort. Throws if a circular
   * dependency is detected.
   *
   * @returns Array of all elements in dependency order
   */
  resolveDependencies(): TerrainElement[] {
    if (this.cachedOrder) return this.cachedOrder;

    // Build adjacency list and in-degree map
    const inDegree: Map<string, number> = new Map();
    const dependents: Map<string, string[]> = new Map();

    for (const [name, element] of this.elements) {
      if (!inDegree.has(name)) inDegree.set(name, 0);
      if (!dependents.has(name)) dependents.set(name, []);

      for (const dep of element.dependencies) {
        if (!this.elements.has(dep)) {
          // Dependency not registered; skip it (don't block resolution)
          continue;
        }
        inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
        if (!dependents.has(dep)) dependents.set(dep, []);
        dependents.get(dep)!.push(name);
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) queue.push(name);
    }

    const sorted: TerrainElement[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(this.elements.get(current)!);

      for (const dependent of dependents.get(current) ?? []) {
        const newDegree = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    if (sorted.length !== this.elements.size) {
      const missing = [...this.elements.keys()].filter(
        (name) => !sorted.some((e) => e.name === name)
      );
      throw new Error(
        `Circular dependency detected in terrain elements. Unresolved: ${missing.join(', ')}`
      );
    }

    // Wire up dependency references
    for (const element of sorted) {
      for (const depName of element.dependencies) {
        const depElement = this.elements.get(depName);
        if (depElement) {
          element.setDependencyRef(depName, depElement);
        }
      }
    }

    this.cachedOrder = sorted;
    return sorted;
  }

  /**
   * Evaluate all enabled elements at a point and compose results.
   *
   * @param point - Query point in world space
   * @param operation - How to combine element SDFs
   * @returns Composed evaluation result
   */
  evaluateComposed(
    point: THREE.Vector3,
    operation: CompositionOperation
  ): ElementEvalResult {
    const enabled = this.getEnabled();
    if (enabled.length === 0) {
      return {
        distance: Infinity,
        materialId: TERRAIN_MATERIALS.STONE,
        auxiliary: {},
      };
    }

    if (enabled.length === 1) {
      return enabled[0].evaluate(point);
    }

    switch (operation) {
      case CompositionOperation.UNION:
        return this.composeUnion(point, enabled);
      case CompositionOperation.INTERSECTION:
        return this.composeIntersection(point, enabled);
      case CompositionOperation.DIFFERENCE:
        return this.composeDifference(point, enabled);
      default:
        return this.composeUnion(point, enabled);
    }
  }

  /**
   * Batch version of evaluateComposed.
   *
   * @param points - Array of query points
   * @param operation - How to combine element SDFs
   * @returns Array of composed results
   */
  evaluateComposedBatch(
    points: THREE.Vector3[],
    operation: CompositionOperation
  ): ElementEvalResult[] {
    return points.map((p) => this.evaluateComposed(p, operation));
  }

  // --- Private composition methods ---

  private composeUnion(
    point: THREE.Vector3,
    elements: TerrainElement[]
  ): ElementEvalResult {
    let combinedDist = Infinity;
    let combinedMaterial: number = TERRAIN_MATERIALS.STONE;
    const combinedAux: Record<string, any> = {};

    for (const element of elements) {
      const result = element.evaluate(point);

      // Merge auxiliary data (later elements override)
      Object.assign(combinedAux, result.auxiliary);

      if (combinedDist === Infinity) {
        combinedDist = result.distance;
        combinedMaterial = result.materialId;
      } else {
        combinedDist = smoothUnion(
          combinedDist,
          result.distance,
          this.blendFactor
        );
        // Material from the closer surface
        if (result.distance < combinedDist) {
          combinedMaterial = result.materialId;
        }
      }
    }

    return {
      distance: combinedDist,
      materialId: combinedMaterial,
      auxiliary: combinedAux,
    };
  }

  private composeIntersection(
    point: THREE.Vector3,
    elements: TerrainElement[]
  ): ElementEvalResult {
    let combinedDist = -Infinity;
    let combinedMaterial: number = TERRAIN_MATERIALS.STONE;
    const combinedAux: Record<string, any> = {};

    for (const element of elements) {
      const result = element.evaluate(point);
      Object.assign(combinedAux, result.auxiliary);

      if (combinedDist === -Infinity) {
        combinedDist = result.distance;
        combinedMaterial = result.materialId;
      } else {
        combinedDist = Math.max(combinedDist, result.distance);
        // Material from the dominant surface (furthest outside)
        if (result.distance > combinedDist) {
          combinedMaterial = result.materialId;
        }
      }
    }

    return {
      distance: combinedDist,
      materialId: combinedMaterial,
      auxiliary: combinedAux,
    };
  }

  private composeDifference(
    point: THREE.Vector3,
    elements: TerrainElement[]
  ): ElementEvalResult {
    // Separate into additive (Ground, Mountains, Rocks) and subtractive (Caves, Waterbody) elements
    const additiveNames = new Set(['Ground', 'Mountains', 'VoronoiRocks']);
    const subtractiveNames = new Set(['Caves', 'Waterbody']);

    const additive: TerrainElement[] = [];
    const subtractive: TerrainElement[] = [];

    for (const element of elements) {
      if (subtractiveNames.has(element.name)) {
        subtractive.push(element);
      } else {
        additive.push(element);
      }
    }

    // Compute additive union
    let result: ElementEvalResult;
    if (additive.length > 0) {
      result = this.composeUnion(point, additive);
    } else {
      result = {
        distance: Infinity,
        materialId: TERRAIN_MATERIALS.STONE,
        auxiliary: {},
      };
    }

    // Subtract each subtractive element
    for (const element of subtractive) {
      const subResult = element.evaluate(point);

      // Boolean difference: max(terrain, -subtractive)
      const subDist = sdfSubtraction(result.distance, subResult.distance);
      // Material: if we're in the subtracted region, use subtractive's material
      const materialId =
        -subResult.distance > result.distance
          ? subResult.materialId
          : result.materialId;

      result = {
        distance: subDist,
        materialId,
        auxiliary: { ...result.auxiliary, ...subResult.auxiliary },
      };
    }

    return result;
  }
}

// ============================================================================
// SceneCompositionConfig
// ============================================================================

/**
 * Configuration for scene composition via SceneComposer.
 *
 * Controls which elements are included (with probability) and their
 * per-element parameter overrides.
 */
export interface SceneCompositionConfig {
  /** Random seed for reproducibility */
  seed: number;
  /** World-space bounds of the terrain volume */
  bounds: THREE.Box3;
  /** Voxel resolution (size of each voxel in world units) */
  resolution: number;
  /**
   * Probability each element is included (0.0 = never, 1.0 = always).
   * Keys are element names: 'Ground', 'Mountains', 'Caves',
   * 'VoronoiRocks', 'Waterbody'
   */
  elementChances: Record<string, number>;
  /** Per-element parameter overrides */
  elementParams: Record<string, Record<string, any>>;
}

/** Default scene composition configuration */
export const DEFAULT_SCENE_COMPOSITION_CONFIG: SceneCompositionConfig = {
  seed: 42,
  bounds: new THREE.Box3(
    new THREE.Vector3(-50, -10, -50),
    new THREE.Vector3(50, 30, 50)
  ),
  resolution: 0.5,
  elementChances: {
    Ground: 1.0,
    Mountains: 0.8,
    Caves: 0.7,
    VoronoiRocks: 0.6,
    Waterbody: 0.5,
  },
  elementParams: {},
};

// ============================================================================
// SceneComposer
// ============================================================================

/**
 * Implements the original Infinigen's `scene()` function.
 *
 * Composes a complete terrain scene by:
 * 1. Creating element instances based on probabilistic activation
 * 2. Resolving element dependencies (Ground depends on Caves; VoronoiRocks
 *    depends on Ground and Caves)
 * 3. Initializing elements with config parameters
 * 4. Returning a configured ElementRegistry ready for evaluation
 *
 * Also transfers scene-level info (water plane height from Waterbody
 * to downstream systems via the registry's auxiliary data).
 *
 * Usage:
 * ```typescript
 * const composer = new SceneComposer();
 * const registry = composer.compose(42, config);
 * const result = registry.evaluateComposed(point, CompositionOperation.DIFFERENCE);
 * ```
 */
export class SceneComposer {
  /** Scene-level info extracted from element composition */
  private sceneInfo: Record<string, any> = {};

  /**
   * Compose a terrain scene from configuration.
   *
   * @param seed - Random seed for reproducibility
   * @param config - Scene composition configuration
   * @returns Configured ElementRegistry with all activated elements
   */
  compose(
    seed: number,
    config: Partial<SceneCompositionConfig> = {}
  ): ElementRegistry {
    const fullConfig: SceneCompositionConfig = {
      ...DEFAULT_SCENE_COMPOSITION_CONFIG,
      ...config,
      elementChances: {
        ...DEFAULT_SCENE_COMPOSITION_CONFIG.elementChances,
        ...(config.elementChances ?? {}),
      },
      elementParams: {
        ...DEFAULT_SCENE_COMPOSITION_CONFIG.elementParams,
        ...(config.elementParams ?? {}),
      },
    };

    const rng = new SeededRandom(seed);
    const registry = new ElementRegistry(0.3);

    // --- Create element instances ---
    const elementFactories: Record<
      string,
      () => TerrainElement
    > = {
      Ground: () => new GroundElement(),
      Mountains: () => new MountainElement(),
      Caves: () => new CaveElement(),
      VoronoiRocks: () => new VoronoiRockElement(),
      Waterbody: () => new WaterbodyElement(),
    };

    // --- Probabilistic element activation ---
    const activatedElements: TerrainElement[] = [];

    for (const [name, factory] of Object.entries(elementFactories)) {
      const chance = fullConfig.elementChances[name] ?? 0;
      if (rng.next() < chance) {
        const element = factory();
        element.enabled = true;
        activatedElements.push(element);
      }
    }

    // Ground is always activated (it's the base terrain)
    const hasGround = activatedElements.some((e) => e.name === 'Ground');
    if (!hasGround) {
      const ground = new GroundElement();
      ground.enabled = true;
      activatedElements.push(ground);
    }

    // --- Dependency validation ---
    // Ground depends on Caves; if Caves is not activated, Ground still works
    // (it just won't have cave-aware outputs)
    // VoronoiRocks depends on Ground and Caves; both optional

    // --- Register elements ---
    for (const element of activatedElements) {
      registry.register(element);
    }

    // --- Resolve dependencies (triggers topological sort + ref wiring) ---
    const sortedElements = registry.resolveDependencies();

    // --- Initialize elements ---
    for (const element of sortedElements) {
      const params = fullConfig.elementParams[element.name] ?? {};
      // Pass bounds to all elements that might need them
      params.bounds = fullConfig.bounds;
      element.init(params, new SeededRandom(seed + hashString(element.name)));
    }

    // --- Extract scene-level info ---
    this.sceneInfo = {};
    const waterbody = registry.get('Waterbody');
    if (waterbody && waterbody.enabled) {
      // Sample water plane height at the center of bounds
      const center = fullConfig.bounds.getCenter(new THREE.Vector3());
      const waterResult = waterbody.evaluate(center);
      this.sceneInfo.waterPlaneHeight =
        waterResult.auxiliary.waterPlaneHeight ?? 0.5;
    }

    return registry;
  }

  /**
   * Get scene-level info extracted during composition.
   * Contains properties like waterPlaneHeight.
   */
  getSceneInfo(): Record<string, any> {
    return { ...this.sceneInfo };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Simple string hash for generating deterministic seeds from element names.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

// ============================================================================
// Integration: buildSDFFromElements
// ============================================================================

/**
 * Build a SignedDistanceField from an ElementRegistry by evaluating all
 * enabled elements at each voxel point.
 *
 * This is the bridge between the element composition system and the
 * existing Marching Cubes extraction pipeline.
 *
 * @param registry - Configured ElementRegistry with initialized elements
 * @param bounds - World-space bounds for the SDF volume
 * @param resolution - Voxel resolution
 * @param operation - Composition operation for combining elements
 * @returns SignedDistanceField ready for isosurface extraction
 */
export function buildSDFFromElements(
  registry: ElementRegistry,
  bounds: THREE.Box3,
  resolution: number,
  operation: CompositionOperation = CompositionOperation.DIFFERENCE
): SignedDistanceField {
  const sdf = new SignedDistanceField({
    resolution,
    bounds,
    maxDistance: 1e6,
  });

  const size = bounds.getSize(new THREE.Vector3());

  for (let gz = 0; gz < sdf.gridSize[2]; gz++) {
    for (let gy = 0; gy < sdf.gridSize[1]; gy++) {
      for (let gx = 0; gx < sdf.gridSize[0]; gx++) {
        const pos = sdf.getPosition(gx, gy, gz);
        const result = registry.evaluateComposed(pos, operation);
        sdf.setValueAtGrid(gx, gy, gz, result.distance);
      }
    }
  }

  return sdf;
}
