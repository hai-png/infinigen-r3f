/**
 * NURBSBodyProfile - Parametric body profiles for creature generation
 *
 * Generates NURBS control point grids for anatomically distinct body shapes
 * without requiring the original Infinigen .npy control point arrays.
 *
 * Each profile function creates a 2D grid of Vector4 control points where:
 *   - u axis: body sections (head to tail)
 *   - v axis: circumference (dorsal -> ventral -> dorsal)
 *   - w component: weight for rational NURBS (allows conic sections)
 *
 * The profiles produce visually distinct body shapes for different species:
 *   - Mammal: Elliptical cross-section, smooth taper
 *   - Reptile: Elongated with gradual tail taper
 *   - Bird: Compact body, pronounced neck curve
 *   - Fish: Streamlined with fin ridges
 *   - Amphibian: Smooth body, short limbs
 */

import { Vector3, Vector4 } from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ── Configuration ────────────────────────────────────────────────────

/**
 * Configuration for body profile generation.
 */
export interface BodyProfileConfig {
  /** Total body length */
  bodyLength: number;
  /** Maximum body width (lateral, left-to-right) */
  bodyWidth: number;
  /** Maximum body height (dorsal-to-ventral) */
  bodyHeight: number;
  /** Head size as fraction of body length */
  headSize: number;
  /** Tail length as fraction of body length */
  tailLength: number;
  /** Neck length as fraction of body length */
  neckLength: number;
  /** Vertical spine curvature amount */
  spineCurvature: number;
  /** Whether to enforce bilateral symmetry (mirror left/right) */
  bilateralSymmetry: boolean;
  /** Number of control points along body axis (u) */
  uResolution: number;
  /** Number of control points around circumference (v) */
  vResolution: number;
  /** Degree of NURBS in u direction */
  degreeU: number;
  /** Degree of NURBS in v direction */
  degreeV: number;
}

/**
 * Default body profile configuration.
 */
export const DEFAULT_BODY_PROFILE_CONFIG: BodyProfileConfig = {
  bodyLength: 2.0,
  bodyWidth: 0.4,
  bodyHeight: 0.35,
  headSize: 0.25,
  tailLength: 0.3,
  neckLength: 0.1,
  spineCurvature: 0.0,
  bilateralSymmetry: true,
  uResolution: 8,
  vResolution: 16,
  degreeU: 3,
  degreeV: 3,
};

// ── Helper Functions ─────────────────────────────────────────────────

/**
 * Smooth interpolation function (Hermite basis).
 * Returns a value that smoothly transitions from 0 to 1.
 */
function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Compute the cross-section ellipse radii at a given position along the body.
 *
 * @param t - Position along body axis [0=head, 1=tail]
 * @param params - Body profile configuration
 * @param profile - Cross-section shape function
 * @returns Horizontal and vertical radii of the cross-section
 */
function computeCrossSectionRadii(
  t: number,
  params: BodyProfileConfig,
  profile: (t: number) => { widthScale: number; heightScale: number },
): { rx: number; ry: number } {
  const { widthScale, heightScale } = profile(t);
  return {
    rx: params.bodyWidth * 0.5 * widthScale,
    ry: params.bodyHeight * 0.5 * heightScale,
  };
}

/**
 * Generate a ring of control points for a single cross-section.
 *
 * @param center - Center position of the cross-section
 * @param rx - Horizontal radius
 * @param ry - Vertical radius
 * @param numPoints - Number of points around the circumference
 * @param weight - NURBS weight for this ring
 * @param topWeight - Weight multiplier for dorsal ridge (e.g., for fish fin ridges)
 * @returns Array of Vector4 control points
 */
function generateCrossSectionRing(
  center: Vector3,
  rx: number,
  ry: number,
  numPoints: number,
  weight: number = 1.0,
  topWeight: number = 1.0,
): Vector4[] {
  const points: Vector4[] = [];

  for (let i = 0; i < numPoints; i++) {
    // v goes from 0 to 2*PI
    const angle = (2 * Math.PI * i) / numPoints;

    // Parametric ellipse: x = rx*cos(angle), y = ry*sin(angle)
    const x = rx * Math.cos(angle);
    const y = ry * Math.sin(angle);

    // Apply dorsal weight enhancement for certain species
    let w = weight;
    if (y > 0) {
      // Top (dorsal) side
      w *= topWeight;
    }

    points.push(new Vector4(
      center.x + x,
      center.y + y,
      center.z,
      w,
    ));
  }

  return points;
}

/**
 * Compute the spine centerline position at parameter t.
 *
 * @param t - Position along body axis [0=head, 1=tail]
 * @param params - Body profile configuration
 * @returns The centerline position
 */
function computeSpinePosition(t: number, params: BodyProfileConfig): Vector3 {
  // Body spans from z = +bodyLength/2 (head) to z = -bodyLength/2 (tail)
  const headZ = params.bodyLength * 0.5;
  const tailZ = -params.bodyLength * 0.5;
  const z = headZ + t * (tailZ - headZ);

  // Vertical curvature (slight arch for quadrupeds, more for reptiles)
  const archAmount = params.spineCurvature * Math.sin(Math.PI * t);

  return new Vector3(0, archAmount, z);
}

// ── Species-Specific Profile Functions ───────────────────────────────

/**
 * Mammal body profile - Elliptical cross-section that tapers toward head and tail.
 *
 * Characteristics:
 * - Broadest at mid-torso
 * - Smooth taper to head region
 * - Gradual taper to tail
 * - Slight dorsoventral flattening
 */
export function createMammalProfile(
  params: Partial<BodyProfileConfig> = {},
  rng?: SeededRandom,
): Vector4[][] {
  const config = { ...DEFAULT_BODY_PROFILE_CONFIG, ...params };
  const r = rng ?? new SeededRandom(42);

  const controlPoints: Vector4[][] = [];

  for (let i = 0; i < config.uResolution; i++) {
    const t = i / (config.uResolution - 1);

    // Mammal cross-section shape
    const widthScale = mammalCrossSection(t, config);
    const heightScale = mammalHeightProfile(t, config);

    const center = computeSpinePosition(t, config);
    const rx = config.bodyWidth * 0.5 * widthScale;
    const ry = config.bodyHeight * 0.5 * heightScale;

    // Add slight random variation for organic feel
    const variation = 1.0 + r.nextFloat(-0.03, 0.03);

    const ring = generateCrossSectionRing(
      center,
      rx * variation,
      ry * variation,
      config.vResolution,
      1.0,
      1.0,
    );

    controlPoints.push(ring);
  }

  return controlPoints;
}

/**
 * Mammal width profile (elliptical taper).
 */
function mammalCrossSection(t: number, config: BodyProfileConfig): number {
  const headEnd = config.headSize;
  const tailStart = 1.0 - config.tailLength;

  if (t < headEnd) {
    // Head region: grows from 0.3 to 1.0
    return 0.3 + 0.7 * smoothstep(t / headEnd);
  } else if (t > tailStart) {
    // Tail region: tapers from 1.0 to 0.05
    const tailT = (t - tailStart) / config.tailLength;
    return 1.0 - 0.95 * smoothstep(tailT);
  } else {
    // Torso region: slight bulge at 40% from head
    const torsoT = (t - headEnd) / (tailStart - headEnd);
    return 0.95 + 0.05 * Math.sin(Math.PI * torsoT);
  }
}

/**
 * Mammal height profile (slightly taller at shoulders).
 */
function mammalHeightProfile(t: number, config: BodyProfileConfig): number {
  const headEnd = config.headSize;
  const tailStart = 1.0 - config.tailLength;

  if (t < headEnd) {
    return 0.35 + 0.65 * smoothstep(t / headEnd);
  } else if (t > tailStart) {
    const tailT = (t - tailStart) / config.tailLength;
    return 1.0 - 0.9 * smoothstep(tailT);
  } else {
    // Slight shoulder hump
    const torsoT = (t - headEnd) / (tailStart - headEnd);
    return 0.9 + 0.1 * Math.sin(Math.PI * torsoT * 0.8);
  }
}

/**
 * Reptile body profile - Elongated with gradual tail taper.
 *
 * Characteristics:
 * - Very long body relative to width
 * - Gradual, smooth taper from mid-body to thin tail
 * - Relatively uniform cross-section
 * - More pronounced dorsal ridge
 */
export function createReptileProfile(
  params: Partial<BodyProfileConfig> = {},
  rng?: SeededRandom,
): Vector4[][] {
  const config = {
    ...DEFAULT_BODY_PROFILE_CONFIG,
    bodyLength: 3.0,
    bodyWidth: 0.15,
    bodyHeight: 0.12,
    headSize: 0.08,
    tailLength: 0.45,
    spineCurvature: 0.02,
    ...params,
  };
  const r = rng ?? new SeededRandom(42);

  const controlPoints: Vector4[][] = [];

  for (let i = 0; i < config.uResolution; i++) {
    const t = i / (config.uResolution - 1);

    // Reptile cross-section
    const widthScale = reptileWidthProfile(t, config);
    const heightScale = reptileHeightProfile(t, config);

    const center = computeSpinePosition(t, config);
    const rx = config.bodyWidth * 0.5 * widthScale;
    const ry = config.bodyHeight * 0.5 * heightScale;

    const variation = 1.0 + r.nextFloat(-0.02, 0.02);

    // Reptile has a slight dorsal ridge (topWeight > 1)
    const topWeight = t < 0.7 ? 1.1 : 1.0;

    const ring = generateCrossSectionRing(
      center,
      rx * variation,
      ry * variation,
      config.vResolution,
      1.0,
      topWeight,
    );

    controlPoints.push(ring);
  }

  return controlPoints;
}

function reptileWidthProfile(t: number, config: BodyProfileConfig): number {
  const headEnd = config.headSize;
  const tailStart = 1.0 - config.tailLength;

  if (t < headEnd) {
    return 0.5 + 0.5 * smoothstep(t / headEnd);
  } else if (t > tailStart) {
    const tailT = (t - tailStart) / config.tailLength;
    return 1.0 - 0.97 * smoothstep(tailT);
  } else {
    // Fairly uniform middle
    const torsoT = (t - headEnd) / (tailStart - headEnd);
    return 0.95 + 0.05 * Math.cos(torsoT * Math.PI * 0.5);
  }
}

function reptileHeightProfile(t: number, config: BodyProfileConfig): number {
  // Reptiles are more dorsoventrally flattened
  return reptileWidthProfile(t, config) * 0.8;
}

/**
 * Bird body profile - Compact body with pronounced neck curve.
 *
 * Characteristics:
 * - Compact, rounded torso
 * - Distinct neck region that curves upward
 * - Short, tapered tail region
 * - Keel (breastbone) prominence ventrally
 */
export function createBirdProfile(
  params: Partial<BodyProfileConfig> = {},
  rng?: SeededRandom,
): Vector4[][] {
  const config = {
    ...DEFAULT_BODY_PROFILE_CONFIG,
    bodyLength: 0.5,
    bodyWidth: 0.25,
    bodyHeight: 0.25,
    headSize: 0.2,
    tailLength: 0.2,
    neckLength: 0.15,
    spineCurvature: 0.08,
    ...params,
  };
  const r = rng ?? new SeededRandom(42);

  const controlPoints: Vector4[][] = [];

  for (let i = 0; i < config.uResolution; i++) {
    const t = i / (config.uResolution - 1);

    const widthScale = birdWidthProfile(t, config);
    const heightScale = birdHeightProfile(t, config);

    // Bird neck curves upward
    const center = computeSpinePosition(t, config);
    if (t < config.headSize + config.neckLength && t > config.headSize * 0.5) {
      // Neck region lifts up
      const neckT = (t - config.headSize * 0.5) / (config.headSize + config.neckLength - config.headSize * 0.5);
      center.y += config.bodyHeight * 0.3 * Math.sin(Math.PI * neckT);
    }

    const rx = config.bodyWidth * 0.5 * widthScale;
    const ry = config.bodyHeight * 0.5 * heightScale;

    const variation = 1.0 + r.nextFloat(-0.02, 0.02);

    // Keel prominence: ventral side (bottom) has extra weight
    const ring = generateBirdCrossSection(
      center,
      rx * variation,
      ry * variation,
      config.vResolution,
      1.0,
    );

    controlPoints.push(ring);
  }

  return controlPoints;
}

function birdWidthProfile(t: number, config: BodyProfileConfig): number {
  const headEnd = config.headSize;
  const tailStart = 1.0 - config.tailLength;

  if (t < headEnd) {
    return 0.4 + 0.6 * smoothstep(t / headEnd);
  } else if (t > tailStart) {
    const tailT = (t - tailStart) / config.tailLength;
    return 1.0 - 0.7 * smoothstep(tailT);
  } else {
    const torsoT = (t - headEnd) / (tailStart - headEnd);
    return 0.9 + 0.1 * Math.sin(Math.PI * torsoT * 0.7);
  }
}

function birdHeightProfile(t: number, config: BodyProfileConfig): number {
  const headEnd = config.headSize;
  const tailStart = 1.0 - config.tailLength;

  if (t < headEnd) {
    return 0.4 + 0.6 * smoothstep(t / headEnd);
  } else if (t > tailStart) {
    const tailT = (t - tailStart) / config.tailLength;
    return 1.0 - 0.6 * smoothstep(tailT);
  } else {
    // Birds are rounder in cross-section
    const torsoT = (t - headEnd) / (tailStart - headEnd);
    return 0.85 + 0.15 * Math.sin(Math.PI * torsoT * 0.6);
  }
}

/**
 * Bird-specific cross section with keel (ventral prominence).
 */
function generateBirdCrossSection(
  center: Vector3,
  rx: number,
  ry: number,
  numPoints: number,
  weight: number = 1.0,
): Vector4[] {
  const points: Vector4[] = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;

    let x = rx * Math.cos(angle);
    let y = ry * Math.sin(angle);

    // Keel: slight downward protrusion at ventral midline
    if (y < 0) {
      const ventralFactor = Math.pow(Math.abs(Math.sin(angle)), 2);
      y -= ry * 0.15 * ventralFactor;
    }

    points.push(new Vector4(
      center.x + x,
      center.y + y,
      center.z,
      weight,
    ));
  }

  return points;
}

/**
 * Fish body profile - Streamlined with fin ridges.
 *
 * Characteristics:
 * - Very streamlined, torpedo-like shape
 * - Pronounced dorsal fin ridge
 * - Caudal peduncle (thin section before tail fin)
 * - Laterally compressed in tail region
 */
export function createFishProfile(
  params: Partial<BodyProfileConfig> = {},
  rng?: SeededRandom,
): Vector4[][] {
  const config = {
    ...DEFAULT_BODY_PROFILE_CONFIG,
    bodyLength: 1.5,
    bodyWidth: 0.2,
    bodyHeight: 0.18,
    headSize: 0.15,
    tailLength: 0.25,
    spineCurvature: -0.01,
    ...params,
  };
  const r = rng ?? new SeededRandom(42);

  const controlPoints: Vector4[][] = [];

  for (let i = 0; i < config.uResolution; i++) {
    const t = i / (config.uResolution - 1);

    const widthScale = fishWidthProfile(t, config);
    const heightScale = fishHeightProfile(t, config);

    const center = computeSpinePosition(t, config);
    const rx = config.bodyWidth * 0.5 * widthScale;
    const ry = config.bodyHeight * 0.5 * heightScale;

    const variation = 1.0 + r.nextFloat(-0.015, 0.015);

    // Dorsal fin ridge weight: more pronounced in mid-body
    const dorsalWeight = (t > 0.2 && t < 0.7) ? 1.3 : 1.0;

    const ring = generateFishCrossSection(
      center,
      rx * variation,
      ry * variation,
      config.vResolution,
      1.0,
      dorsalWeight,
    );

    controlPoints.push(ring);
  }

  return controlPoints;
}

function fishWidthProfile(t: number, config: BodyProfileConfig): number {
  const headEnd = config.headSize;
  const tailStart = 1.0 - config.tailLength;
  const caudalStart = 1.0 - config.tailLength * 0.4; // Caudal peduncle

  if (t < headEnd) {
    // Fish head tapers forward
    return 0.6 + 0.4 * smoothstep(t / headEnd);
  } else if (t > caudalStart) {
    // Caudal peduncle: thin before tail fin
    const ct = (t - caudalStart) / (1.0 - caudalStart);
    return 0.8 * (1.0 - 0.7 * smoothstep(ct));
  } else if (t > tailStart) {
    const tailT = (t - tailStart) / (caudalStart - tailStart);
    return 1.0 - 0.2 * smoothstep(tailT);
  } else {
    // Main body: widest at ~30% from head
    const torsoT = (t - headEnd) / (tailStart - headEnd);
    return 0.9 + 0.1 * Math.sin(Math.PI * torsoT * 0.6);
  }
}

function fishHeightProfile(t: number, config: BodyProfileConfig): number {
  const headEnd = config.headSize;
  const tailStart = 1.0 - config.tailLength;
  const caudalStart = 1.0 - config.tailLength * 0.4;

  if (t < headEnd) {
    return 0.5 + 0.5 * smoothstep(t / headEnd);
  } else if (t > caudalStart) {
    const ct = (t - caudalStart) / (1.0 - caudalStart);
    return 0.8 * (1.0 - 0.6 * smoothstep(ct));
  } else if (t > tailStart) {
    const tailT = (t - tailStart) / (caudalStart - tailStart);
    return 1.0 - 0.2 * smoothstep(tailT);
  } else {
    const torsoT = (t - headEnd) / (tailStart - headEnd);
    return 0.85 + 0.15 * Math.sin(Math.PI * torsoT * 0.5);
  }
}

/**
 * Fish-specific cross section with dorsal ridge.
 */
function generateFishCrossSection(
  center: Vector3,
  rx: number,
  ry: number,
  numPoints: number,
  weight: number = 1.0,
  dorsalWeight: number = 1.0,
): Vector4[] {
  const points: Vector4[] = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;

    let x = rx * Math.cos(angle);
    let y = ry * Math.sin(angle);

    // Dorsal ridge: slight protrusion at dorsal midline
    let w = weight;
    if (y > ry * 0.5) {
      const dorsalFactor = Math.pow(Math.abs(Math.cos(angle)), 4);
      y += ry * 0.1 * dorsalFactor;
      w = dorsalWeight;
    }

    points.push(new Vector4(
      center.x + x,
      center.y + y,
      center.z,
      w,
    ));
  }

  return points;
}

/**
 * Amphibian body profile - Smooth body, short limbs region.
 *
 * Characteristics:
 * - Smooth, moist-appearing body
 * - Relatively uniform cross-section
 * - Slight widening at limb attachment regions
 * - Short, tapered tail
 */
export function createAmphibianProfile(
  params: Partial<BodyProfileConfig> = {},
  rng?: SeededRandom,
): Vector4[][] {
  const config = {
    ...DEFAULT_BODY_PROFILE_CONFIG,
    bodyLength: 1.0,
    bodyWidth: 0.3,
    bodyHeight: 0.2,
    headSize: 0.2,
    tailLength: 0.2,
    neckLength: 0.02,
    spineCurvature: 0.01,
    ...params,
  };
  const r = rng ?? new SeededRandom(42);

  const controlPoints: Vector4[][] = [];

  for (let i = 0; i < config.uResolution; i++) {
    const t = i / (config.uResolution - 1);

    const widthScale = amphibianWidthProfile(t, config);
    const heightScale = amphibianHeightProfile(t, config);

    const center = computeSpinePosition(t, config);
    const rx = config.bodyWidth * 0.5 * widthScale;
    const ry = config.bodyHeight * 0.5 * heightScale;

    const variation = 1.0 + r.nextFloat(-0.025, 0.025);

    const ring = generateCrossSectionRing(
      center,
      rx * variation,
      ry * variation,
      config.vResolution,
      1.0,
      1.0,
    );

    controlPoints.push(ring);
  }

  return controlPoints;
}

function amphibianWidthProfile(t: number, config: BodyProfileConfig): number {
  const headEnd = config.headSize;
  const tailStart = 1.0 - config.tailLength;

  if (t < headEnd) {
    // Amphibian head is relatively wide
    return 0.6 + 0.4 * smoothstep(t / headEnd);
  } else if (t > tailStart) {
    const tailT = (t - tailStart) / config.tailLength;
    return 1.0 - 0.85 * smoothstep(tailT);
  } else {
    const torsoT = (t - headEnd) / (tailStart - headEnd);
    // Slight widening at limb attachment regions (~30% and ~70%)
    const limbBulge1 = 0.05 * Math.exp(-Math.pow((torsoT - 0.3) * 6, 2));
    const limbBulge2 = 0.05 * Math.exp(-Math.pow((torsoT - 0.7) * 6, 2));
    return 0.95 + limbBulge1 + limbBulge2;
  }
}

function amphibianHeightProfile(t: number, config: BodyProfileConfig): number {
  const headEnd = config.headSize;
  const tailStart = 1.0 - config.tailLength;

  if (t < headEnd) {
    return 0.5 + 0.5 * smoothstep(t / headEnd);
  } else if (t > tailStart) {
    const tailT = (t - tailStart) / config.tailLength;
    return 1.0 - 0.8 * smoothstep(tailT);
  } else {
    // Amphibians are somewhat dorsoventrally flattened
    const torsoT = (t - headEnd) / (tailStart - headEnd);
    return 0.85 + 0.15 * Math.sin(Math.PI * torsoT);
  }
}

/**
 * Insect body profile - Segmented body with distinct thorax and abdomen.
 *
 * Characteristics:
 * - Three distinct body regions: head, thorax, abdomen
 * - Thorax is broader for wing/leg attachment
 * - Abdomen tapers gradually
 * - More dorsoventrally flattened than mammals
 */
export function createInsectProfile(
  params: Partial<BodyProfileConfig> = {},
  rng?: SeededRandom,
): Vector4[][] {
  const config = {
    ...DEFAULT_BODY_PROFILE_CONFIG,
    bodyLength: 0.8,
    bodyWidth: 0.2,
    bodyHeight: 0.15,
    headSize: 0.15,
    tailLength: 0.35,
    neckLength: 0.02,
    spineCurvature: 0.005,
    ...params,
  };
  const r = rng ?? new SeededRandom(42);

  const controlPoints: Vector4[][] = [];

  for (let i = 0; i < config.uResolution; i++) {
    const t = i / (config.uResolution - 1);

    const widthScale = insectWidthProfile(t, config);
    const heightScale = insectHeightProfile(t, config);

    const center = computeSpinePosition(t, config);
    const rx = config.bodyWidth * 0.5 * widthScale;
    const ry = config.bodyHeight * 0.5 * heightScale;

    const variation = 1.0 + r.nextFloat(-0.02, 0.02);

    const ring = generateCrossSectionRing(
      center,
      rx * variation,
      ry * variation,
      config.vResolution,
      1.0,
      1.05, // slight dorsal weight for insect carapace
    );

    controlPoints.push(ring);
  }

  return controlPoints;
}

function insectWidthProfile(t: number, config: BodyProfileConfig): number {
  const headEnd = config.headSize;
  const thoraxEnd = config.headSize + 0.25; // Thorax is ~25% of body
  const tailStart = 1.0 - config.tailLength;

  if (t < headEnd) {
    // Insect head is relatively wide
    return 0.5 + 0.5 * smoothstep(t / headEnd);
  } else if (t < thoraxEnd) {
    // Thorax: widens for leg/wing attachments
    const thoraxT = (t - headEnd) / (thoraxEnd - headEnd);
    return 0.8 + 0.2 * Math.sin(Math.PI * thoraxT);
  } else if (t > tailStart) {
    const tailT = (t - tailStart) / config.tailLength;
    return 0.7 * (1.0 - 0.85 * smoothstep(tailT));
  } else {
    // Abdomen: starts wide then tapers
    const abdT = (t - thoraxEnd) / (tailStart - thoraxEnd);
    return 0.85 + 0.05 * Math.sin(Math.PI * abdT * 0.8);
  }
}

function insectHeightProfile(t: number, config: BodyProfileConfig): number {
  // Insects are more dorsoventrally flattened
  return insectWidthProfile(t, config) * 0.75;
}

// ── Profile Factory ──────────────────────────────────────────────────

/**
 * Profile type identifiers matching creature types.
 */
export type BodyProfileType = 'mammal' | 'reptile' | 'bird' | 'fish' | 'amphibian' | 'insect';

/**
 * Create a body profile by type name.
 *
 * @param type - The profile type
 * @param params - Optional overrides for the body profile config
 * @param rng - Optional seeded random generator
 * @returns Grid of Vector4 control points
 */
export function createBodyProfile(
  type: BodyProfileType,
  params: Partial<BodyProfileConfig> = {},
  rng?: SeededRandom,
): Vector4[][] {
  switch (type) {
    case 'mammal':
      return createMammalProfile(params, rng);
    case 'reptile':
      return createReptileProfile(params, rng);
    case 'bird':
      return createBirdProfile(params, rng);
    case 'fish':
      return createFishProfile(params, rng);
    case 'amphibian':
      return createAmphibianProfile(params, rng);
    case 'insect':
      return createInsectProfile(params, rng);
    default:
      return createMammalProfile(params, rng);
  }
}

/**
 * Get default body profile configuration for a given creature type.
 * These defaults match the original Infinigen proportions.
 */
export function getDefaultConfigForType(type: BodyProfileType): Partial<BodyProfileConfig> {
  switch (type) {
    case 'mammal':
      return {
        bodyLength: 2.0,
        bodyWidth: 0.4,
        bodyHeight: 0.35,
        headSize: 0.25,
        tailLength: 0.3,
        neckLength: 0.1,
        spineCurvature: 0.03,
      };
    case 'reptile':
      return {
        bodyLength: 3.0,
        bodyWidth: 0.15,
        bodyHeight: 0.12,
        headSize: 0.08,
        tailLength: 0.45,
        neckLength: 0.02,
        spineCurvature: 0.02,
      };
    case 'bird':
      return {
        bodyLength: 0.5,
        bodyWidth: 0.25,
        bodyHeight: 0.25,
        headSize: 0.2,
        tailLength: 0.2,
        neckLength: 0.15,
        spineCurvature: 0.08,
      };
    case 'fish':
      return {
        bodyLength: 1.5,
        bodyWidth: 0.2,
        bodyHeight: 0.18,
        headSize: 0.15,
        tailLength: 0.25,
        neckLength: 0.0,
        spineCurvature: -0.01,
      };
    case 'amphibian':
      return {
        bodyLength: 1.0,
        bodyWidth: 0.3,
        bodyHeight: 0.2,
        headSize: 0.2,
        tailLength: 0.2,
        neckLength: 0.02,
        spineCurvature: 0.01,
      };
    case 'insect':
      return {
        bodyLength: 0.8,
        bodyWidth: 0.2,
        bodyHeight: 0.15,
        headSize: 0.15,
        tailLength: 0.35,
        neckLength: 0.02,
        spineCurvature: 0.005,
      };
  }
}
