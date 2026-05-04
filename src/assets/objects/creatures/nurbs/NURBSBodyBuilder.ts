/**
 * NURBSBodyBuilder - Builds complete creature body meshes from NURBS profiles
 *
 * Integrates NURBSSurface evaluation with parametric body profiles to produce
 * anatomically correct creature body geometries with named attachment points
 * for head, limbs, tail, and other appendages.
 *
 * The builder:
 * 1. Generates a control point grid from a parametric body profile
 * 2. Constructs a NURBS surface from the control points
 * 3. Tessellates the surface into a watertight BufferGeometry
 * 4. Computes attachment points at anatomically reasonable locations
 * 5. Returns both geometry and named attachment points for part assembly
 */

import { Vector3, Vector4, BufferGeometry, Matrix4, Quaternion } from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NURBSSurface } from './NURBSSurface';
import {
  BodyProfileType,
  BodyProfileConfig,
  DEFAULT_BODY_PROFILE_CONFIG,
  createBodyProfile,
  getDefaultConfigForType,
} from './NURBSBodyProfile';
import {
  NURBSSpeciesData,
  getSpeciesData,
  hasSpeciesData,
  getSpeciesBodyProfileConfig,
} from './nurbsControlPointData';

// ── Tessellation Configuration ───────────────────────────────────────

/**
 * Tessellation quality settings.
 */
export interface TessellationConfig {
  /** Number of segments along the body axis (u direction) */
  uSegments: number;
  /** Number of segments around the circumference (v direction) */
  vSegments: number;
}

export const TESSELLATION_LOW: TessellationConfig = { uSegments: 16, vSegments: 12 };
export const TESSELLATION_MEDIUM: TessellationConfig = { uSegments: 32, vSegments: 24 };
export const TESSELLATION_HIGH: TessellationConfig = { uSegments: 48, vSegments: 32 };

// ── Attachment Points ────────────────────────────────────────────────

/**
 * Named attachment point on the body surface.
 * Used for positioning head, limbs, tail, wings, etc.
 */
export interface AttachmentPoint {
  /** Name identifier (e.g., 'head', 'frontLeftLeg', 'tailBase') */
  name: string;
  /** 3D position in model space */
  position: Vector3;
  /** Surface normal at the attachment point */
  normal: Vector3;
  /** Parameter (u) along body axis where this attachment is located */
  u: number;
  /** Parameter (v) around circumference where this attachment is located */
  v: number;
}

// ── Build Result ─────────────────────────────────────────────────────

/**
 * Result of building a creature body.
 */
export interface NURBSBodyResult {
  /** The tessellated body geometry */
  geometry: BufferGeometry;
  /** Named attachment points for part assembly */
  attachmentPoints: Map<string, AttachmentPoint>;
  /** The NURBS surface (for further evaluation if needed) */
  surface: NURBSSurface;
  /** The profile configuration used */
  config: BodyProfileConfig;
}

// ── Attachment Point Definitions ─────────────────────────────────────

/**
 * Attachment point specification per creature type.
 * Defines where each part attaches in terms of (u, v) surface parameters.
 */
interface AttachmentSpec {
  name: string;
  /** u parameter along body axis [0=head, 1=tail] */
  u: number;
  /** v parameter around circumference [0=dorsal midline, 0.25=left, 0.5=ventral, 0.75=right] */
  v: number;
}

const MAMMAL_ATTACHMENTS: AttachmentSpec[] = [
  { name: 'head', u: 0.05, v: 0.5 },
  { name: 'frontLeftLeg', u: 0.25, v: 0.3 },
  { name: 'frontRightLeg', u: 0.25, v: 0.7 },
  { name: 'hindLeftLeg', u: 0.6, v: 0.3 },
  { name: 'hindRightLeg', u: 0.6, v: 0.7 },
  { name: 'tailBase', u: 0.95, v: 0.5 },
  { name: 'leftEar', u: 0.02, v: 0.2 },
  { name: 'rightEar', u: 0.02, v: 0.8 },
  { name: 'dorsalMid', u: 0.5, v: 0.0 },
  { name: 'ventralMid', u: 0.5, v: 0.5 },
  { name: 'neck', u: 0.15, v: 0.0 },
];

const REPTILE_ATTACHMENTS: AttachmentSpec[] = [
  { name: 'head', u: 0.03, v: 0.5 },
  { name: 'frontLeftLeg', u: 0.2, v: 0.3 },
  { name: 'frontRightLeg', u: 0.2, v: 0.7 },
  { name: 'hindLeftLeg', u: 0.5, v: 0.3 },
  { name: 'hindRightLeg', u: 0.5, v: 0.7 },
  { name: 'tailBase', u: 0.55, v: 0.5 },
  { name: 'dorsalMid', u: 0.3, v: 0.0 },
  { name: 'neck', u: 0.07, v: 0.0 },
];

const BIRD_ATTACHMENTS: AttachmentSpec[] = [
  { name: 'head', u: 0.05, v: 0.5 },
  { name: 'leftWing', u: 0.3, v: 0.2 },
  { name: 'rightWing', u: 0.3, v: 0.8 },
  { name: 'leftLeg', u: 0.65, v: 0.35 },
  { name: 'rightLeg', u: 0.65, v: 0.65 },
  { name: 'tailBase', u: 0.95, v: 0.5 },
  { name: 'beak', u: 0.0, v: 0.5 },
  { name: 'neck', u: 0.15, v: 0.0 },
  { name: 'breast', u: 0.4, v: 0.5 },
];

const FISH_ATTACHMENTS: AttachmentSpec[] = [
  { name: 'head', u: 0.05, v: 0.5 },
  { name: 'leftPectoralFin', u: 0.3, v: 0.25 },
  { name: 'rightPectoralFin', u: 0.3, v: 0.75 },
  { name: 'dorsalFin', u: 0.4, v: 0.0 },
  { name: 'analFin', u: 0.6, v: 0.5 },
  { name: 'tailBase', u: 0.95, v: 0.5 },
  { name: 'gillLeft', u: 0.15, v: 0.25 },
  { name: 'gillRight', u: 0.15, v: 0.75 },
  { name: 'ventralMid', u: 0.5, v: 0.5 },
];

const AMPHIBIAN_ATTACHMENTS: AttachmentSpec[] = [
  { name: 'head', u: 0.05, v: 0.5 },
  { name: 'frontLeftLeg', u: 0.3, v: 0.3 },
  { name: 'frontRightLeg', u: 0.3, v: 0.7 },
  { name: 'hindLeftLeg', u: 0.6, v: 0.3 },
  { name: 'hindRightLeg', u: 0.6, v: 0.7 },
  { name: 'tailBase', u: 0.85, v: 0.5 },
  { name: 'leftEye', u: 0.05, v: 0.2 },
  { name: 'rightEye', u: 0.05, v: 0.8 },
  { name: 'dorsalMid', u: 0.4, v: 0.0 },
  { name: 'neck', u: 0.18, v: 0.0 },
];

const INSECT_ATTACHMENTS: AttachmentSpec[] = [
  { name: 'head', u: 0.05, v: 0.5 },
  { name: 'frontLeftLeg', u: 0.25, v: 0.25 },
  { name: 'frontRightLeg', u: 0.25, v: 0.75 },
  { name: 'midLeftLeg', u: 0.4, v: 0.25 },
  { name: 'midRightLeg', u: 0.4, v: 0.75 },
  { name: 'hindLeftLeg', u: 0.55, v: 0.25 },
  { name: 'hindRightLeg', u: 0.55, v: 0.75 },
  { name: 'tailBase', u: 0.95, v: 0.5 },
  { name: 'leftAntenna', u: 0.02, v: 0.2 },
  { name: 'rightAntenna', u: 0.02, v: 0.8 },
  { name: 'dorsalMid', u: 0.4, v: 0.0 },
];

// ── NURBS Body Builder ───────────────────────────────────────────────

/**
 * NURBSBodyBuilder creates complete creature body meshes from NURBS surface definitions.
 *
 * Usage:
 * ```ts
 * const builder = new NURBSBodyBuilder(42);
 * const result = builder.buildCreatureBody('mammal', { bodyLength: 2.0, bodyWidth: 0.4 });
 * scene.add(new Mesh(result.geometry, material));
 * const headPos = result.attachmentPoints.get('head')?.position;
 * ```
 */
export class NURBSBodyBuilder {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Build a complete creature body from a profile type and parameters.
   *
   * @param profileType - The type of body profile (mammal, reptile, etc.)
   * @param params - Override parameters for the body profile
   * @param tessellation - Tessellation quality (default: MEDIUM)
   * @returns The body geometry, attachment points, and surface reference
   */
  buildCreatureBody(
    profileType: BodyProfileType,
    params: Partial<BodyProfileConfig> = {},
    tessellation: TessellationConfig = TESSELLATION_MEDIUM,
  ): NURBSBodyResult {
    // Merge default config for this type with user overrides
    const typeDefaults = getDefaultConfigForType(profileType);
    const config: BodyProfileConfig = {
      ...DEFAULT_BODY_PROFILE_CONFIG,
      ...typeDefaults,
      ...params,
    };

    // Generate control points from the profile
    const controlPoints = createBodyProfile(profileType, config, this.rng);

    // Create NURBS surface
    const surface = new NURBSSurface(
      controlPoints,
      config.degreeU,
      config.degreeV,
    );

    // Tessellate the surface
    const geometry = surface.tessellate(tessellation.uSegments, tessellation.vSegments);

    // Compute attachment points
    const attachmentPoints = this.computeAttachmentPoints(profileType, surface, config);

    return {
      geometry,
      attachmentPoints,
      surface,
      config,
    };
  }

  /**
   * Build a creature body from existing control points.
   *
   * @param controlPoints - Pre-computed control point grid
   * @param config - Body profile configuration
   * @param profileType - Profile type for attachment point computation
   * @param tessellation - Tessellation quality
   * @returns The body geometry, attachment points, and surface reference
   */
  buildFromControlPoints(
    controlPoints: Vector4[][],
    config: BodyProfileConfig,
    profileType: BodyProfileType = 'mammal',
    tessellation: TessellationConfig = TESSELLATION_MEDIUM,
  ): NURBSBodyResult {
    const surface = new NURBSSurface(
      controlPoints,
      config.degreeU,
      config.degreeV,
    );

    const geometry = surface.tessellate(tessellation.uSegments, tessellation.vSegments);
    const attachmentPoints = this.computeAttachmentPoints(profileType, surface, config);

    return {
      geometry,
      attachmentPoints,
      surface,
      config,
    };
  }

  /**
   * Compute attachment points for a given profile type.
   *
   * @param profileType - The profile type
   * @param surface - The NURBS surface
   * @param config - The body profile configuration
   * @returns Map of named attachment points
   */
  private computeAttachmentPoints(
    profileType: BodyProfileType,
    surface: NURBSSurface,
    config: BodyProfileConfig,
  ): Map<string, AttachmentPoint> {
    const specs = this.getAttachmentSpecs(profileType);
    const points = new Map<string, AttachmentPoint>();

    // Map the u parameter from body-fraction to surface domain
    const uMin = surface.knotsU[surface.degreeU];
    const uMax = surface.knotsU[surface.knotsU.length - surface.degreeU - 1];

    for (const spec of specs) {
      // Convert body-axis fraction to knot-domain u
      const u = uMin + spec.u * (uMax - uMin);
      const v = spec.v; // v is already [0, 1]

      // Clamp v to valid range
      const vMin = surface.knotsV[surface.degreeV];
      const vMax = surface.knotsV[surface.knotsV.length - surface.degreeV - 1];
      const vParam = vMin + v * (vMax - vMin);

      try {
        const position = surface.evaluate(u, vParam);
        const normal = surface.evaluateNormal(u, vParam);

        // Offset the attachment point slightly above the surface
        const offsetPosition = position.clone().add(normal.clone().multiplyScalar(0.01));

        points.set(spec.name, {
          name: spec.name,
          position: offsetPosition,
          normal,
          u: spec.u,
          v: spec.v,
        });
      } catch (err) {
        // Silently fall back - skip attachment points that fail to evaluate (degenerate surface regions)
        if (process.env.NODE_ENV === 'development') console.debug('[NURBSBodyBuilder] attachment point evaluation fallback:', err);
      }
    }

    return points;
  }

  /**
   * Get the attachment point specifications for a given profile type.
   */
  private getAttachmentSpecs(profileType: BodyProfileType): AttachmentSpec[] {
    switch (profileType) {
      case 'mammal':
        return MAMMAL_ATTACHMENTS;
      case 'reptile':
        return REPTILE_ATTACHMENTS;
      case 'bird':
        return BIRD_ATTACHMENTS;
      case 'fish':
        return FISH_ATTACHMENTS;
      case 'amphibian':
        return AMPHIBIAN_ATTACHMENTS;
      case 'insect':
        return INSECT_ATTACHMENTS;
      default:
        return MAMMAL_ATTACHMENTS;
    }
  }

  /**
   * Get the attachment point names for a given profile type.
   * Useful for validation and UI display.
   */
  getAttachmentPointNames(profileType: BodyProfileType): string[] {
    return this.getAttachmentSpecs(profileType).map(s => s.name);
  }

  /**
   * Evaluate the body surface at a specific point.
   * Useful for queries after building.
   */
  evaluateSurfacePoint(
    surface: NURBSSurface,
    u: number,
    v: number,
  ): { position: Vector3; normal: Vector3 } {
    return {
      position: surface.evaluate(u, v),
      normal: surface.evaluateNormal(u, v),
    };
  }

  // ── Species-Specific Body Building ────────────────────────────────────

  /**
   * Build a creature body from pre-sculpted NURBS control point data.
   *
   * When control point data exists for a species (ported from the original
   * Infinigen .npy files), this method reconstructs the NURBS surface using
   * the species-specific skeleton and cross-section profiles.
   *
   * The reconstruction process:
   * 1. Loads the decomposed species data (skeleton + profiles + radii)
   * 2. Reconstructs the skeleton from stored direction/offset parameters
   * 3. Applies stored cross-section profiles at each skeleton joint
   * 4. Converts to Vector4 control point grid for NURBSSurface
   * 5. Optionally adds random variation for organic feel
   *
   * @param speciesName - Species key like "feline_cheetah", "herbivore_cow", etc.
   * @param variation - Amount of random variation to apply (0 = exact, 1 = full)
   * @param scaleMultiplier - Scale factor for the body (1.0 = original size)
   * @param tessellation - Tessellation quality
   * @returns The body geometry, attachment points, and surface reference, or null if no data
   */
  fromControlPointData(
    speciesName: string,
    variation: number = 0.05,
    scaleMultiplier: number = 1.0,
    tessellation: TessellationConfig = TESSELLATION_MEDIUM,
  ): NURBSBodyResult | null {
    const data = getSpeciesData('body', speciesName);
    if (!data) return null;

    // Reconstruct the control point grid from decomposed data
    const controlPoints = this.reconstructControlPoints(data, variation, scaleMultiplier);

    // Determine profile type from species name for attachment points
    const profileType = this.speciesToProfileType(speciesName);

    // Build a config from the species data
    const speciesConfig = getSpeciesBodyProfileConfig(speciesName);
    const config: BodyProfileConfig = {
      ...DEFAULT_BODY_PROFILE_CONFIG,
      ...speciesConfig,
      uResolution: data.shape[0],
      vResolution: data.shape[1],
      degreeU: 3,
      degreeV: 3,
    };

    // Create NURBS surface from the reconstructed control points
    const surface = new NURBSSurface(
      controlPoints,
      config.degreeU,
      config.degreeV,
    );

    const geometry = surface.tessellate(tessellation.uSegments, tessellation.vSegments);
    const attachmentPoints = this.computeAttachmentPoints(profileType, surface, config);

    return {
      geometry,
      attachmentPoints,
      surface,
      config,
    };
  }

  /**
   * Build a creature body, preferring species-specific data when available,
   * falling back to parametric profiles otherwise.
   *
   * @param speciesName - Species key (e.g., "feline_cheetah")
   * @param profileType - Fallback profile type if no species data exists
   * @param params - Override parameters for the body profile
   * @param variation - Variation amount when using species data
   * @param tessellation - Tessellation quality
   * @returns The body geometry, attachment points, and surface reference
   */
  buildFromSpecies(
    speciesName: string,
    profileType: BodyProfileType = 'mammal',
    params: Partial<BodyProfileConfig> = {},
    variation: number = 0.05,
    tessellation: TessellationConfig = TESSELLATION_MEDIUM,
  ): NURBSBodyResult {
    // Try species-specific data first
    if (hasSpeciesData('body', speciesName)) {
      const result = this.fromControlPointData(
        speciesName, variation, 1.0, tessellation,
      );
      if (result) return result;
    }

    // Fall back to parametric profile
    return this.buildCreatureBody(profileType, params, tessellation);
  }

  /**
   * Build a head from species-specific NURBS control point data.
   *
   * @param speciesName - Species key (e.g., "carnivore_tiger", "herbivore_cow")
   * @param variation - Amount of random variation to apply
   * @param scaleMultiplier - Scale factor
   * @param tessellation - Tessellation quality
   * @returns The head geometry, attachment points, and surface reference, or null
   */
  buildHeadFromControlPointData(
    speciesName: string,
    variation: number = 0.05,
    scaleMultiplier: number = 1.0,
    tessellation: TessellationConfig = TESSELLATION_MEDIUM,
  ): NURBSBodyResult | null {
    const data = getSpeciesData('head', speciesName);
    if (!data) return null;

    const controlPoints = this.reconstructControlPoints(data, variation, scaleMultiplier);

    const config: BodyProfileConfig = {
      ...DEFAULT_BODY_PROFILE_CONFIG,
      uResolution: data.shape[0],
      vResolution: data.shape[1],
      degreeU: 3,
      degreeV: 3,
      bodyLength: data.totalLength,
      bodyWidth: data.maxWidth * 2,
      bodyHeight: data.maxHeight * 2,
    };

    const surface = new NURBSSurface(
      controlPoints,
      config.degreeU,
      config.degreeV,
    );

    const geometry = surface.tessellate(tessellation.uSegments, tessellation.vSegments);
    const profileType = this.speciesToProfileType(speciesName);
    const attachmentPoints = this.computeAttachmentPoints(profileType, surface, config);

    return {
      geometry,
      attachmentPoints,
      surface,
      config,
    };
  }

  /**
   * Reconstruct a NURBS control point grid from decomposed species data.
   *
   * This implements the inverse of factorize_nurbs_handles:
   * 1. The skeleton points define the spine centerline
   * 2. The profiles define cross-section offsets in local frame
   * 3. We rotate each profile from local (x-forward) frame to world space
   * 4. Apply optional random variation for organic feel
   *
   * @param data - Decomposed species data
   * @param variation - Random variation amount (0-1)
   * @param scaleMultiplier - Scale factor
   * @returns Grid of Vector4 control points
   */
  private reconstructControlPoints(
    data: NURBSSpeciesData,
    variation: number = 0.05,
    scaleMultiplier: number = 1.0,
  ): Vector4[][] {
    const skeleton = data.skeleton;
    const profiles = data.profiles;
    const n = skeleton.length; // number of u sections

    // Compute tangents from skeleton
    const tangents: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const tangent = new Vector3();
      if (i === n - 1) {
        tangent.set(
          skeleton[i][0] - skeleton[i - 1][0],
          skeleton[i][1] - skeleton[i - 1][1],
          skeleton[i][2] - skeleton[i - 1][2],
        );
      } else if (i === 0) {
        tangent.set(
          skeleton[1][0] - skeleton[0][0],
          skeleton[1][1] - skeleton[0][1],
          skeleton[1][2] - skeleton[0][2],
        );
      } else {
        // Average of neighboring directions
        const d1 = new Vector3(
          skeleton[i][0] - skeleton[i - 1][0],
          skeleton[i][1] - skeleton[i - 1][1],
          skeleton[i][2] - skeleton[i - 1][2],
        );
        const d2 = new Vector3(
          skeleton[i + 1][0] - skeleton[i][0],
          skeleton[i + 1][1] - skeleton[i][1],
          skeleton[i + 1][2] - skeleton[i][2],
        );
        tangent.copy(d1.add(d2));
      }
      tangent.normalize();
      tangents.push(tangent);
    }

    const controlPoints: Vector4[][] = [];

    for (let i = 0; i < n; i++) {
      const center = new Vector3(
        skeleton[i][0] * scaleMultiplier,
        skeleton[i][1] * scaleMultiplier,
        skeleton[i][2] * scaleMultiplier,
      );

      // Compute rotation from local frame (x-forward) to world tangent direction
      const forward = new Vector3(1, 0, 0);
      const tangent = tangents[i];
      const rotQuat = new Quaternion().setFromUnitVectors(forward, tangent);
      const rotMat = new Matrix4().makeRotationFromQuaternion(rotQuat);

      const profileRow: Vector4[] = [];
      const m = profiles[i].length;

      for (let j = 0; j < m; j++) {
        // Profile point in local frame
        let px = profiles[i][j][0] * scaleMultiplier;
        let py = profiles[i][j][1] * scaleMultiplier;
        let pz = profiles[i][j][2] * scaleMultiplier;

        // Apply random variation
        if (variation > 0) {
          px *= 1 + this.rng.nextFloat(-variation, variation);
          py *= 1 + this.rng.nextFloat(-variation, variation);
          pz *= 1 + this.rng.nextFloat(-variation, variation);
        }

        // Rotate from local frame to world frame
        const localPt = new Vector3(px, py, pz);
        localPt.applyMatrix4(rotMat);

        // Translate to skeleton position
        localPt.add(center);

        profileRow.push(new Vector4(localPt.x, localPt.y, localPt.z, 1.0));
      }

      controlPoints.push(profileRow);
    }

    return controlPoints;
  }

  /**
   * Map a species name to a profile type for attachment point computation.
   */
  private speciesToProfileType(speciesName: string): BodyProfileType {
    if (speciesName.startsWith('feline') || speciesName.startsWith('carnivore')) {
      return 'mammal';
    }
    if (speciesName.startsWith('herbivore')) {
      return 'mammal';
    }
    if (speciesName.startsWith('bird')) {
      return 'bird';
    }
    if (speciesName.startsWith('fish')) {
      return 'fish';
    }
    if (speciesName.startsWith('insect')) {
      return 'insect';
    }
    if (speciesName.startsWith('reptile')) {
      return 'reptile';
    }
    if (speciesName.startsWith('amphibian')) {
      return 'amphibian';
    }
    return 'mammal';
  }
}

// ── Singleton Factory ────────────────────────────────────────────────

/**
 * Convenience function to build a creature body without instantiating NURBSBodyBuilder.
 *
 * @param profileType - The body profile type
 * @param seed - Random seed for deterministic generation
 * @param params - Optional body profile parameter overrides
 * @param tessellation - Tessellation quality
 * @returns NURBS body result
 */
export function buildCreatureBody(
  profileType: BodyProfileType,
  seed: number = 42,
  params: Partial<BodyProfileConfig> = {},
  tessellation: TessellationConfig = TESSELLATION_MEDIUM,
): NURBSBodyResult {
  const builder = new NURBSBodyBuilder(seed);
  return builder.buildCreatureBody(profileType, params, tessellation);
}
