/**
 * HollowTreeGenerator.ts
 *
 * Procedural hollow tree generator — creates a standing tree trunk with a
 * visible cavity/hollow created by subtracting a smaller inner cylinder from
 * a larger outer one. Adds knot holes and broken branch stubs.
 *
 * Ported from the original Infinigen `HollowTreeFactory` which uses boolean
 * difference geometry nodes. In this R3F port we construct the hollow
 * directly using concentric cylinders with an opening and inner wall.
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

/** Configuration for generating a hollow tree */
export interface HollowTreeConfig {
  /** Total trunk height (world units) */
  trunkHeight: number;
  /** Outer trunk radius at the bottom (world units) */
  trunkRadius: number;
  /** Inner hollow radius as a fraction of trunkRadius (0.3–0.8) */
  hollowRatio: number;
  /** Master seed for deterministic RNG */
  seed: number;
  /** Level-of-detail (0 = highest). Reduces segment counts. */
  lod?: number;
  /** Number of knot holes to generate */
  knotHoleCount?: number;
  /** Number of broken branch stubs */
  stubCount?: number;
  /** Whether the top is broken (default: true) */
  brokenTop?: boolean;
}

/** Default hollow tree configuration */
export const DEFAULT_HOLLOW_TREE_CONFIG: HollowTreeConfig = {
  trunkHeight: 5.0,
  trunkRadius: 0.5,
  hollowRatio: 0.6,
  seed: 42,
  lod: 0,
  knotHoleCount: 3,
  stubCount: 4,
  brokenTop: true,
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
  innerWood: new THREE.Color(0x6d4c41),
} as const;

/**
 * Create a bark-ring colour from HSV parameters.
 */
function makeBarkColor(rng: SeededRandom): THREE.Color {
  const baseHue = rng.uniform(0.02, 0.08);
  const sat = rng.uniform(0.4, 0.8);
  const val = rng.uniform(0.15, 0.4);
  const rgb = hsvToRgb(baseHue, sat, val);
  return new THREE.Color(rgb.r, rgb.g, rgb.b);
}

/**
 * Apply noise-based vertex displacement to a geometry for organic bark texture.
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
 * Build the outer trunk cylinder with bark displacement.
 */
function buildOuterTrunk(
  height: number,
  radius: number,
  seed: number,
  lod: number,
  barkColor: THREE.Color,
): THREE.BufferGeometry {
  const segments = Math.max(12, 20 - lod * 2);
  const heightSegments = Math.max(6, 14 - lod * 2);

  const geometry = new THREE.CylinderGeometry(
    radius * 0.85, // slight taper
    radius,
    height,
    segments,
    heightSegments,
    true, // open-ended (top and bottom will be capped separately)
  );

  applyNoiseDisplacement(geometry, seed, 0.4, 0.08);
  return geometry;
}

/**
 * Build the inner hollow cylinder (visible through the opening).
 * This represents the inner wall of the trunk.
 */
function buildInnerTrunk(
  height: number,
  outerRadius: number,
  hollowRatio: number,
  seed: number,
  lod: number,
): THREE.BufferGeometry {
  const innerRadius = outerRadius * hollowRatio;
  const segments = Math.max(10, 16 - lod * 2);
  const heightSegments = Math.max(4, 10 - lod * 2);
  const hollowHeight = height * 0.65; // hollow does not extend full height
  const hollowOffset = height * 0.1;  // starts slightly above ground

  const geometry = new THREE.CylinderGeometry(
    innerRadius * 0.9,
    innerRadius,
    hollowHeight,
    segments,
    heightSegments,
    true, // open-ended
  );

  // Apply slight noise for organic interior texture
  applyNoiseDisplacement(geometry, seed + 100, 0.6, 0.04);

  // Translate the inner cylinder up so it sits within the trunk
  const posAttr = geometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    posAttr.setY(i, posAttr.getY(i) + hollowOffset);
  }
  posAttr.needsUpdate = true;

  return geometry;
}

/**
 * Build the bottom cap (ground-level disc of the trunk).
 */
function buildBottomCap(
  outerRadius: number,
  innerRadius: number,
  lod: number,
): THREE.BufferGeometry {
  const segments = Math.max(12, 20 - lod * 2);
  const shape = new THREE.Shape();
  const holePath = new THREE.Path();

  // Outer circle
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  // Inner hole
  holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(holePath);

  const geometry = new THREE.ShapeGeometry(shape, segments);
  // Rotate to lie flat (XZ plane)
  geometry.rotateX(-Math.PI / 2);

  return geometry;
}

/**
 * Build a top cap with a broken/jagged edge.
 * The cap is an annulus with noise displacement for a jagged break.
 */
function buildTopCap(
  outerRadius: number,
  innerRadius: number,
  seed: number,
  lod: number,
  height: number,
): THREE.BufferGeometry {
  const segments = Math.max(12, 18 - lod * 2);
  const shape = new THREE.Shape();
  const holePath = new THREE.Path();

  shape.absarc(0, 0, outerRadius * 0.9, 0, Math.PI * 2, false);
  holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(holePath);

  const geometry = new THREE.ShapeGeometry(shape, segments);
  geometry.rotateX(-Math.PI / 2);

  // Apply noise for jagged break at top
  const posAttr = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    // Displace Y with noise for jagged edge
    const noiseVal = seededNoise3D(
      vertex.x * 3.0 + seed,
      0,
      vertex.z * 3.0,
      1.0,
      (seed + 200) & 0xffff,
    );
    vertex.y += noiseVal * 0.15;
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  posAttr.needsUpdate = true;

  // Move to top of trunk
  for (let i = 0; i < posAttr.count; i++) {
    posAttr.setY(i, posAttr.getY(i) + height);
  }
  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Build knot holes — small tunnel-like openings through the trunk wall.
 */
function buildKnotHoles(
  trunkHeight: number,
  trunkRadius: number,
  count: number,
  seed: number,
  barkColor: THREE.Color,
): THREE.BufferGeometry[] {
  const rng = new SeededRandom(seed + 400);
  const geometries: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const angle = rng.uniform(0, Math.PI * 2);
    const yPos = rng.uniform(trunkHeight * 0.15, trunkHeight * 0.75);
    const knotRadius = rng.uniform(0.04, 0.1) * trunkRadius;
    const knotDepth = trunkRadius * rng.uniform(0.3, 0.6);

    // Create a small cylinder as the knot tunnel
    const knotGeo = new THREE.CylinderGeometry(
      knotRadius * 0.7,
      knotRadius,
      knotDepth,
      8,
      1,
      true,
    );

    // Rotate and position to penetrate the trunk wall
    const knotMesh = new THREE.Mesh(knotGeo);
    knotMesh.position.set(
      Math.cos(angle) * (trunkRadius * 0.5),
      yPos,
      Math.sin(angle) * (trunkRadius * 0.5),
    );
    // Point radially outward
    knotMesh.rotation.z = -Math.cos(angle) * (Math.PI / 2);
    knotMesh.rotation.x = Math.sin(angle) * (Math.PI / 2);
    knotMesh.updateMatrixWorld(true);
    knotGeo.applyMatrix4(knotMesh.matrixWorld);

    applyNoiseDisplacement(knotGeo, seed + 450 + i * 13, 1.5, 0.02);
    geometries.push(knotGeo);
  }

  return geometries;
}

/**
 * Build broken branch stubs protruding from the trunk.
 */
function buildBranchStubs(
  trunkHeight: number,
  trunkRadius: number,
  count: number,
  seed: number,
  barkColor: THREE.Color,
): THREE.BufferGeometry[] {
  const rng = new SeededRandom(seed + 600);
  const geometries: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const stubLength = rng.uniform(0.3, 0.8);
    const stubRadius = rng.uniform(0.04, 0.1) * trunkRadius;

    const stubGeo = new THREE.CylinderGeometry(
      stubRadius * 0.4,
      stubRadius,
      stubLength,
      5,
      2,
      false,
    );

    applyNoiseDisplacement(stubGeo, seed + 650 + i * 17, 0.6, 0.05);

    // Place along trunk
    const heightPos = rng.uniform(trunkHeight * 0.15, trunkHeight * 0.85);
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
 * Procedural hollow tree generator.
 *
 * Generates a hollow tree trunk by creating:
 * 1. An outer cylinder (trunk wall)
 * 2. An inner cylinder (hollow interior wall)
 * 3. Bottom and top annular caps
 * 4. Knot holes through the trunk wall
 * 5. Broken branch stubs
 *
 * The hollow is formed by the visible gap between the outer and inner
 * cylinders, with an opening created by the open-ended geometry.
 *
 * All geometries are merged via `GeometryPipeline.mergeGeometries()`.
 *
 * @example
 * ```ts
 * const generator = new HollowTreeGenerator();
 * const geometry = generator.generate({ trunkHeight: 5, trunkRadius: 0.5, seed: 42 });
 * const mesh = new THREE.Mesh(geometry, material);
 * scene.add(mesh);
 * ```
 */
export class HollowTreeGenerator {
  /**
   * Generate a hollow tree trunk as a single merged BufferGeometry.
   *
   * @param config — Configuration for the hollow tree
   * @returns A single merged BufferGeometry containing all parts
   */
  generate(config: Partial<HollowTreeConfig> = {}): THREE.BufferGeometry {
    const cfg: HollowTreeConfig = { ...DEFAULT_HOLLOW_TREE_CONFIG, ...config };
    const {
      trunkHeight,
      trunkRadius,
      hollowRatio,
      seed,
      lod = 0,
      knotHoleCount = 3,
      stubCount = 4,
      brokenTop = true,
    } = cfg;

    const rng = new SeededRandom(seed);
    const barkColor = makeBarkColor(rng);
    const innerRadius = trunkRadius * hollowRatio;

    // Collect all geometries to merge
    const geometries: THREE.BufferGeometry[] = [];

    // 1. Outer trunk wall
    const outerTrunk = buildOuterTrunk(trunkHeight, trunkRadius, seed, lod, barkColor);
    geometries.push(outerTrunk);

    // 2. Inner hollow wall
    const innerTrunk = buildInnerTrunk(trunkHeight, trunkRadius, hollowRatio, seed, lod);
    geometries.push(innerTrunk);

    // 3. Bottom cap (annular disc)
    const bottomCap = buildBottomCap(trunkRadius, innerRadius, lod);
    geometries.push(bottomCap);

    // 4. Top cap (with jagged break if brokenTop)
    if (brokenTop) {
      const topCap = buildTopCap(trunkRadius * 0.85, innerRadius * 0.9, seed, lod, trunkHeight);
      geometries.push(topCap);
    } else {
      const topCap = buildBottomCap(trunkRadius * 0.85, innerRadius * 0.9, lod);
      const posAttr = topCap.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setY(i, posAttr.getY(i) + trunkHeight);
      }
      posAttr.needsUpdate = true;
      topCap.computeVertexNormals();
      geometries.push(topCap);
    }

    // 5. Knot holes
    const knotHoles = buildKnotHoles(trunkHeight, trunkRadius, knotHoleCount, seed, barkColor);
    geometries.push(...knotHoles);

    // 6. Branch stubs
    const stubs = buildBranchStubs(trunkHeight, trunkRadius, stubCount, seed, barkColor);
    geometries.push(...stubs);

    // Merge all geometries
    return GeometryPipeline.mergeGeometries(geometries);
  }
}

// ============================================================================
// Convenience factory
// ============================================================================

/**
 * Create a hollow tree geometry in a single call.
 *
 * @param seed — Master seed for deterministic output
 * @param options — Optional overrides for dimensions and LOD
 * @returns A merged BufferGeometry ready for mesh creation
 */
export function createHollowTree(
  seed: number,
  options: Partial<HollowTreeConfig> = {},
): THREE.BufferGeometry {
  const generator = new HollowTreeGenerator();
  return generator.generate({ seed, ...options });
}
