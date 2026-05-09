/**
 * TruncatedTreeGenerator.ts
 *
 * Procedural truncated tree generator — creates a tree cut at a random height
 * with a visible flat or slightly tilted cut surface showing ring patterns
 * (concentric circles via UV coordinates). No branches above the cut point.
 * The stump may have a slight lean.
 *
 * Ported from the original Infinigen `TruncatedTreeFactory` which applies
 * a tilted plane boolean cut at a random height. In this R3F port we build
 * the stump geometry directly with the cut surface and ring UV pattern.
 *
 * Uses `GeometryPipeline.mergeGeometries()` for all geometry merging.
 *
 * @module assets/objects/vegetation/trees
 */

import * as THREE from 'three';
import { SeededRandom, seededNoise3D, hsvToRgb } from '@/core/util/MathUtils';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Public Types
// ============================================================================

/** Configuration for generating a truncated tree */
export interface TruncatedTreeConfig {
  /** Original full trunk height (the cut happens at a fraction of this) */
  trunkHeight: number;
  /** Base trunk radius (world units) */
  trunkRadius: number;
  /** Master seed for deterministic RNG */
  seed: number;
  /** Level-of-detail (0 = highest) */
  lod?: number;
  /** Cut height as a fraction of trunkHeight (0.3–0.7). Random if not specified. */
  cutRatio?: number;
  /** Maximum lean angle in radians (0–0.15). The stump tilts slightly. */
  maxLean?: number;
  /** Whether the cut surface is flat (false = jagged/irregular) */
  flatCut?: boolean;
}

/** Default truncated tree configuration */
export const DEFAULT_TRUNCATED_TREE_CONFIG: TruncatedTreeConfig = {
  trunkHeight: 6.0,
  trunkRadius: 0.5,
  seed: 42,
  lod: 0,
  maxLean: 0.1,
  flatCut: false,
};

// ============================================================================
// Internal helpers
// ============================================================================

/** Bark colour palette */
const BARK_PALETTE = {
  darkBrown: new THREE.Color(0x3e2723),
  midBrown: new THREE.Color(0x5d4037),
  lightBrown: new THREE.Color(0x795548),
  ringBright: new THREE.Color(0x8d6e63),
  ringDark: new THREE.Color(0x4e342e),
  sapwood: new THREE.Color(0xa1887f),
  heartwood: new THREE.Color(0x6d4c41),
} as const;

/**
 * Create a bark colour from HSV parameters.
 */
function makeBarkColor(rng: SeededRandom): THREE.Color {
  const baseHue = rng.uniform(0.02, 0.08);
  const sat = rng.uniform(0.4, 0.8);
  const val = rng.uniform(0.15, 0.4);
  const rgb = hsvToRgb(baseHue, sat, val);
  return new THREE.Color(rgb.r, rgb.g, rgb.b);
}

/**
 * Apply noise-based vertex displacement for organic bark texture.
 */
function applyNoiseDisplacement(
  geometry: THREE.BufferGeometry,
  seed: number,
  frequency: number,
  amplitude: number,
): void {
  const posAttr = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);

    const noiseVal = seededNoise3D(
      vertex.x * frequency + seed,
      vertex.y * frequency,
      vertex.z * frequency,
      1.0,
      seed & 0xffff,
    );

    const displacement = 1 + noiseVal * amplitude;
    vertex.multiplyScalar(displacement);
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
}

// ============================================================================
// Geometry builders
// ============================================================================

/**
 * Build the main stump cylinder.
 * The stump is shorter than the full trunk height and has no taper at top.
 */
function buildStump(
  height: number,
  radius: number,
  seed: number,
  lod: number,
  barkColor: THREE.Color,
): THREE.BufferGeometry {
  const segments = Math.max(12, 20 - lod * 2);
  const heightSegments = Math.max(6, 14 - lod * 2);

  // Stump tapers slightly toward top but not as much as a live tree
  const geometry = new THREE.CylinderGeometry(
    radius * 0.92,
    radius,
    height,
    segments,
    heightSegments,
    false,
  );

  applyNoiseDisplacement(geometry, seed, 0.4, 0.07);
  return geometry;
}

/**
 * Build the cut surface (top disc) with ring UV pattern.
 *
 * The UV coordinates are set up so that u = radial distance from centre
 * and v = angle, creating a concentric ring pattern when the texture
 * or material uses the UV to generate rings.
 *
 * The cut may be slightly tilted (not perfectly horizontal) to simulate
 * a chainsaw or hand-cut.
 */
function buildCutSurface(
  cutRadius: number,
  height: number,
  tiltAngle: number,
  tiltDirection: number,
  seed: number,
  lod: number,
  flatCut: boolean,
): THREE.BufferGeometry {
  const segments = Math.max(16, 24 - lod * 2);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, cutRadius, 0, Math.PI * 2, false);

  const geometry = new THREE.ShapeGeometry(shape, segments);
  // Rotate to lie flat (XZ plane)
  geometry.rotateX(-Math.PI / 2);

  // Set up ring-pattern UVs: u = radial distance (0–1), v = angle (0–1)
  const posAttr = geometry.attributes.position;
  const uvAttr = geometry.attributes.uv;
  const maxR = cutRadius;

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const r = Math.sqrt(x * x + z * z);
    const angle = Math.atan2(z, x);

    // u = normalised radial distance (0 at centre, 1 at edge)
    const u = r / maxR;
    // v = normalised angle (0–1)
    const v = (angle + Math.PI) / (2 * Math.PI);

    uvAttr.setXY(i, u, v);
  }
  uvAttr.needsUpdate = true;

  // Apply tilt
  if (tiltAngle > 0.001) {
    const tiltMatrix = new THREE.Matrix4()
      .makeRotationAxis(
        new THREE.Vector3(Math.cos(tiltDirection), 0, Math.sin(tiltDirection)),
        tiltAngle,
      );
    geometry.applyMatrix4(tiltMatrix);
  }

  // Apply jagged noise if not a flat cut
  if (!flatCut) {
    const posAttr2 = geometry.attributes.position;
    for (let i = 0; i < posAttr2.count; i++) {
      const x = posAttr2.getX(i);
      const y = posAttr2.getY(i);
      const z = posAttr2.getZ(i);

      const noiseVal = seededNoise3D(
        x * 3.0 + seed,
        z * 3.0,
        seed * 0.1,
        1.0,
        (seed + 300) & 0xffff,
      );
      posAttr2.setY(i, y + noiseVal * 0.08);
    }
    posAttr2.needsUpdate = true;
  }

  // Move to top of stump
  const posAttr3 = geometry.attributes.position;
  for (let i = 0; i < posAttr3.count; i++) {
    posAttr3.setY(i, posAttr3.getY(i) + height);
  }
  posAttr3.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Build a side ring / rim detail at the cut edge.
 * This adds visual interest where the bark meets the cut surface.
 */
function buildCutRim(
  cutRadius: number,
  height: number,
  tiltAngle: number,
  tiltDirection: number,
  seed: number,
): THREE.BufferGeometry {
  const rimGeo = new THREE.TorusGeometry(cutRadius, 0.04, 6, 20);
  applyNoiseDisplacement(rimGeo, seed + 350, 1.5, 0.03);

  // Position and tilt
  const rimMesh = new THREE.Mesh(rimGeo);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.y = height;

  if (tiltAngle > 0.001) {
    const tiltMatrix = new THREE.Matrix4()
      .makeRotationAxis(
        new THREE.Vector3(Math.cos(tiltDirection), 0, Math.sin(tiltDirection)),
        tiltAngle,
      );
    rimMesh.applyMatrix4(tiltMatrix);
  }

  rimMesh.updateMatrixWorld(true);
  rimGeo.applyMatrix4(rimMesh.matrixWorld);

  return rimGeo;
}

/**
 * Build exposed root flare at the base.
 */
function buildExposedRoots(
  baseRadius: number,
  seed: number,
): THREE.BufferGeometry[] {
  const rng = new SeededRandom(seed + 400);
  const geometries: THREE.BufferGeometry[] = [];
  const rootCount = rng.nextInt(3, 6);

  for (let i = 0; i < rootCount; i++) {
    const angle = (i / rootCount) * Math.PI * 2 + rng.uniform(-0.3, 0.3);
    const rootLength = rng.uniform(0.8, 1.8) * baseRadius;
    const rootRadius = rng.uniform(0.06, 0.16) * baseRadius;

    const rootGeo = new THREE.CylinderGeometry(
      rootRadius * 0.4,
      rootRadius,
      rootLength,
      6,
      3,
      false,
    );

    applyNoiseDisplacement(rootGeo, seed + 450 + i * 13, 0.5, 0.06);

    const rootMesh = new THREE.Mesh(rootGeo);
    rootMesh.position.set(
      Math.cos(angle) * baseRadius * 0.6,
      -rootLength * 0.3,
      Math.sin(angle) * baseRadius * 0.6,
    );
    rootMesh.rotation.z = -Math.cos(angle) * 0.6;
    rootMesh.rotation.x = Math.sin(angle) * 0.6;
    rootMesh.updateMatrixWorld(true);
    rootGeo.applyMatrix4(rootMesh.matrixWorld);

    geometries.push(rootGeo);
  }

  return geometries;
}

/**
 * Build low branch stubs (below the cut line only).
 */
function buildLowStubs(
  cutHeight: number,
  trunkRadius: number,
  count: number,
  seed: number,
): THREE.BufferGeometry[] {
  const rng = new SeededRandom(seed + 700);
  const geometries: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const stubLength = rng.uniform(0.15, 0.5);
    const stubRadius = rng.uniform(0.03, 0.08) * trunkRadius;

    const stubGeo = new THREE.CylinderGeometry(
      stubRadius * 0.4,
      stubRadius,
      stubLength,
      5,
      2,
      false,
    );

    applyNoiseDisplacement(stubGeo, seed + 750 + i * 17, 0.6, 0.05);

    // Only place stubs below the cut
    const heightPos = rng.uniform(cutHeight * 0.1, cutHeight * 0.7);
    const angle = rng.uniform(0, Math.PI * 2);

    const stubMesh = new THREE.Mesh(stubGeo);
    stubMesh.position.set(
      Math.cos(angle) * (trunkRadius * 0.9 + stubLength * 0.3),
      heightPos,
      Math.sin(angle) * (trunkRadius * 0.9 + stubLength * 0.3),
    );
    stubMesh.rotation.z = -Math.cos(angle) * (Math.PI / 3);
    stubMesh.rotation.x = Math.sin(angle) * (Math.PI / 3);
    stubMesh.updateMatrixWorld(true);
    stubGeo.applyMatrix4(stubMesh.matrixWorld);

    geometries.push(stubGeo);
  }

  return geometries;
}

// ============================================================================
// Main generator class
// ============================================================================

/**
 * Procedural truncated tree generator.
 *
 * Generates a tree stump cut at a random height with:
 * 1. Main stump cylinder with bark texture
 * 2. Cut surface with ring-pattern UVs (concentric circles)
 * 3. Optional tilt/lean of the cut surface
 * 4. Side rim detail at the cut edge
 * 5. Exposed root flare at the base
 * 6. Low branch stubs (below the cut only — no branches above)
 *
 * The cut surface UVs are set up so that u = radial distance (0–1 from centre
 * to edge) and v = angular position, enabling materials/shaders to render
 * concentric tree rings.
 *
 * All geometries are merged via `GeometryPipeline.mergeGeometries()`.
 *
 * @example
 * ```ts
 * const generator = new TruncatedTreeGenerator();
 * const geometry = generator.generate({ trunkHeight: 6, trunkRadius: 0.5, seed: 42 });
 * const mesh = new THREE.Mesh(geometry, material);
 * scene.add(mesh);
 * ```
 */
export class TruncatedTreeGenerator {
  /**
   * Generate a truncated tree stump as a single merged BufferGeometry.
   *
   * @param config — Configuration for the truncated tree
   * @returns A single merged BufferGeometry containing all parts
   */
  generate(config: Partial<TruncatedTreeConfig> = {}): THREE.BufferGeometry {
    const cfg: TruncatedTreeConfig = { ...DEFAULT_TRUNCATED_TREE_CONFIG, ...config };
    const {
      trunkHeight,
      trunkRadius,
      seed,
      lod = 0,
      cutRatio,
      maxLean = 0.1,
      flatCut = false,
    } = cfg;

    const rng = new SeededRandom(seed);
    const barkColor = makeBarkColor(rng);

    // Determine cut height
    const actualCutRatio = cutRatio ?? rng.uniform(0.3, 0.7);
    const cutHeight = trunkHeight * actualCutRatio;

    // Determine lean
    const leanAngle = rng.uniform(0, maxLean);
    const leanDirection = rng.uniform(0, Math.PI * 2);

    const geometries: THREE.BufferGeometry[] = [];

    // 1. Main stump — apply lean via matrix transform
    const stumpGeo = buildStump(cutHeight, trunkRadius, seed, lod, barkColor);
    if (leanAngle > 0.001) {
      const leanMatrix = new THREE.Matrix4()
        .makeRotationAxis(
          new THREE.Vector3(Math.cos(leanDirection), 0, Math.sin(leanDirection)),
          leanAngle,
        );
      // Apply lean around the base (y=0)
      stumpGeo.applyMatrix4(leanMatrix);
    }
    geometries.push(stumpGeo);

    // 2. Cut surface with ring UVs
    const cutSurface = buildCutSurface(
      trunkRadius * 0.9,
      cutHeight,
      leanAngle,
      leanDirection,
      seed,
      lod,
      flatCut,
    );
    geometries.push(cutSurface);

    // 3. Side rim at the cut
    const rim = buildCutRim(trunkRadius * 0.9, cutHeight, leanAngle, leanDirection, seed);
    geometries.push(rim);

    // 4. Exposed roots
    geometries.push(...buildExposedRoots(trunkRadius, seed));

    // 5. Low branch stubs (only below cut)
    const stubCount = rng.nextInt(2, 5);
    geometries.push(...buildLowStubs(cutHeight, trunkRadius, stubCount, seed));

    // Merge all geometries
    return GeometryPipeline.mergeGeometries(geometries);
  }
}

// ============================================================================
// Convenience factory
// ============================================================================

/**
 * Create a truncated tree geometry in a single call.
 *
 * @param seed — Master seed for deterministic output
 * @param options — Optional overrides for dimensions and LOD
 * @returns A merged BufferGeometry ready for mesh creation
 */
export function createTruncatedTree(
  seed: number,
  options: Partial<TruncatedTreeConfig> = {},
): THREE.BufferGeometry {
  const generator = new TruncatedTreeGenerator();
  return generator.generate({ seed, ...options });
}
