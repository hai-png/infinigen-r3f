/**
 * RottenTreeGenerator.ts
 *
 * Procedural rotten tree generator — creates a partially decomposed tree with
 * missing bark sections, irregular holes, color variation in the bark, and
 * branches broken at random points. Includes fungal growths (bracket mushrooms)
 * and exposed interior wood.
 *
 * Ported from the original Infinigen `RottenTreeFactory` which uses boolean
 * difference with icosphere cutters to carve out cavities. In this R3F port
 * we construct the rotten appearance directly by building geometry with missing
 * sections and adding decay detail meshes.
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

/** Configuration for generating a rotten tree */
export interface RottenTreeConfig {
  /** Total trunk height (world units) */
  trunkHeight: number;
  /** Base trunk radius (world units) */
  trunkRadius: number;
  /** Master seed for deterministic RNG */
  seed: number;
  /** Level-of-detail (0 = highest) */
  lod?: number;
  /** Number of missing bark patches (0–8) */
  barkPatchCount?: number;
  /** Number of fungal growths (0–6) */
  fungusCount?: number;
  /** Number of broken branch stubs (2–8) */
  stubCount?: number;
  /** Number of rot cavities (1–4) */
  cavityCount?: number;
}

/** Default rotten tree configuration */
export const DEFAULT_ROTTEN_TREE_CONFIG: RottenTreeConfig = {
  trunkHeight: 4.5,
  trunkRadius: 0.45,
  seed: 42,
  lod: 0,
  barkPatchCount: 4,
  fungusCount: 3,
  stubCount: 5,
  cavityCount: 2,
};

// ============================================================================
// Internal helpers
// ============================================================================

/** Bark / decay colour palette */
const DECAY_PALETTE = {
  darkBrown: new THREE.Color(0x3e2723),
  midBrown: new THREE.Color(0x5d4037),
  lightBrown: new THREE.Color(0x795548),
  darkGrey: new THREE.Color(0x424242),
  paleGrey: new THREE.Color(0x9e9e9e),
  ringDark: new THREE.Color(0x3e2723),
  ringBright: new THREE.Color(0x8d6e63),
  innerWood: new THREE.Color(0x6d4c41),
  fungusGreen: new THREE.Color(0x558b2f),
  fungusWhite: new THREE.Color(0xd7ccc8),
  rotBlack: new THREE.Color(0x1a1210),
} as const;

/**
 * Create a bark colour with more variation than healthy trees.
 * Rotten bark tends toward grey and dark tones.
 */
function makeRottenBarkColor(rng: SeededRandom): THREE.Color {
  const baseHue = rng.uniform(0.02, 0.08);
  const sat = rng.uniform(0.2, 0.6);
  const val = rng.uniform(0.08, 0.3);
  const rgb = hsvToRgb(baseHue, sat, val);
  return new THREE.Color(rgb.r, rgb.g, rgb.b);
}

/**
 * Create a secondary bark colour for missing bark patches (darker, less saturated).
 */
function makeExposedWoodColor(rng: SeededRandom): THREE.Color {
  const hue = rng.uniform(0.04, 0.1);
  const sat = rng.uniform(0.3, 0.6);
  const val = rng.uniform(0.1, 0.25);
  const rgb = hsvToRgb(hue, sat, val);
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
  selectionFn?: (x: number, y: number, z: number) => number,
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

    const weight = selectionFn
      ? selectionFn(vertex.x, vertex.y, vertex.z)
      : 1.0;

    const displacement = 1 + noiseVal * amplitude * weight;
    vertex.multiplyScalar(displacement);
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
}

/**
 * Apply noise displacement that selectively affects vertices within a
 * cylindrical region (used for rot cavities).
 */
function applyCavityDisplacement(
  geometry: THREE.BufferGeometry,
  seed: number,
  strength: number,
  scale: number,
  radius: number,
  direction: 'inward' | 'down',
): void {
  const posAttr = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);

    const r2 = vertex.x * vertex.x + vertex.z * vertex.z;
    if (r2 > radius * radius) continue;

    let noiseVal = seededNoise3D(
      vertex.x * scale,
      vertex.y * scale,
      vertex.z * scale,
      1.0,
      seed & 0xffff,
    );

    noiseVal = Math.max(0.2, Math.min(0.8, noiseVal));
    let offset = noiseVal * strength;

    // Falloff from centre to edge
    const rNorm = Math.sqrt(r2) / radius;
    offset *= 1.0 - rNorm;

    if (direction === 'inward') {
      // Push vertices inward toward the Y axis
      const pushFactor = 1 - offset * 0.3;
      vertex.x *= pushFactor;
      vertex.z *= pushFactor;
    } else {
      vertex.y -= offset;
    }

    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
}

// ============================================================================
// Geometry builders
// ============================================================================

/**
 * Build the main trunk cylinder with bark texture displacement.
 * The trunk has extra height segments for finer decay detail.
 */
function buildTrunk(
  height: number,
  radius: number,
  seed: number,
  lod: number,
  barkColor: THREE.Color,
): THREE.BufferGeometry {
  const segments = Math.max(12, 20 - lod * 2);
  const heightSegments = Math.max(6, 16 - lod * 2);

  const geometry = new THREE.CylinderGeometry(
    radius * 0.8, // more taper for a rotting look
    radius,
    height,
    segments,
    heightSegments,
    false,
  );

  // Stronger, rougher bark displacement for decayed wood
  applyNoiseDisplacement(geometry, seed, 0.5, 0.1);

  // Apply cavity displacement to create rot indentations
  applyCavityDisplacement(
    geometry,
    seed + 50,
    0.2,
    8,
    radius * 0.7,
    'inward',
  );

  return geometry;
}

/**
 * Build missing bark patches — darker, rougher areas on the trunk surface.
 * Each patch is a curved plane that sits on the trunk surface.
 */
function buildBarkPatches(
  trunkHeight: number,
  trunkRadius: number,
  count: number,
  seed: number,
): THREE.BufferGeometry[] {
  const rng = new SeededRandom(seed + 200);
  const geometries: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const angle = rng.uniform(0, Math.PI * 2);
    const yPos = rng.uniform(trunkHeight * 0.1, trunkHeight * 0.8);
    const patchWidth = rng.uniform(0.1, 0.3) * trunkRadius;
    const patchHeight = rng.uniform(0.2, 0.5) * trunkRadius;

    // Curved patch (slightly bowed to match trunk curvature)
    const patchGeo = new THREE.PlaneGeometry(
      patchWidth * 2,
      patchHeight * 3,
      6,
      6,
    );

    // Bend the patch to follow trunk curvature
    const posAttr = patchGeo.attributes.position;
    for (let j = 0; j < posAttr.count; j++) {
      const x = posAttr.getX(j);
      const y = posAttr.getY(j);
      // Curve the patch around the trunk
      const curveX = Math.sin(x / trunkRadius) * trunkRadius;
      posAttr.setX(j, curveX - x);
    }
    posAttr.needsUpdate = true;

    applyNoiseDisplacement(patchGeo, seed + 250 + i, 1.5, 0.04);

    // Position on trunk surface
    const patchMesh = new THREE.Mesh(patchGeo);
    patchMesh.position.set(
      Math.cos(angle) * trunkRadius * 0.97,
      yPos,
      Math.sin(angle) * trunkRadius * 0.97,
    );
    patchMesh.lookAt(new THREE.Vector3(0, yPos, 0));
    patchMesh.updateMatrixWorld(true);
    patchGeo.applyMatrix4(patchMesh.matrixWorld);

    geometries.push(patchGeo);
  }

  return geometries;
}

/**
 * Build rot cavities — spherical holes in the trunk with exposed interior wood.
 * Modeled after the icosphere cutter in the original Python code.
 */
function buildRotCavities(
  trunkHeight: number,
  trunkRadius: number,
  count: number,
  seed: number,
): THREE.BufferGeometry[] {
  const rng = new SeededRandom(seed + 500);
  const geometries: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const angle = rng.uniform(-Math.PI, Math.PI);
    const yPos = rng.uniform(0.2, 0.6) * trunkHeight;
    const cavityScaleX = trunkRadius * rng.uniform(0.6, 1.0);
    const cavityScaleY = trunkRadius * rng.uniform(0.6, 1.0);
    const cavityScaleZ = rng.uniform(0.8, 1.2);
    const depth = trunkRadius * rng.uniform(0.3, 0.7);

    const cavityGeo = new THREE.SphereGeometry(1, 12, 8);
    cavityGeo.scale(cavityScaleX, cavityScaleY, cavityScaleZ);

    // Apply musgrave-like noise for the rotten interior texture
    applyNoiseDisplacement(cavityGeo, seed + 550 + i * 13, 0.8, 0.12);

    // Position cavity on trunk surface
    const cavityMesh = new THREE.Mesh(cavityGeo);
    cavityMesh.position.set(
      depth * Math.cos(angle),
      yPos,
      depth * Math.sin(angle),
    );
    cavityMesh.updateMatrixWorld(true);
    cavityGeo.applyMatrix4(cavityMesh.matrixWorld);

    geometries.push(cavityGeo);
  }

  return geometries;
}

/**
 * Build fungal growths — bracket mushrooms attached to the trunk.
 */
function buildFungalGrowths(
  trunkHeight: number,
  trunkRadius: number,
  count: number,
  seed: number,
): THREE.BufferGeometry[] {
  const rng = new SeededRandom(seed + 800);
  const geometries: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const angle = rng.uniform(0, Math.PI * 2);
    const yPos = rng.uniform(trunkHeight * 0.15, trunkHeight * 0.7);
    const fSize = rng.uniform(0.06, 0.18) * trunkRadius;

    // Bracket fungus — a half-sphere protruding from the trunk
    const fungusGeo = new THREE.SphereGeometry(
      fSize,
      8,
      4,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );

    const fungusMesh = new THREE.Mesh(fungusGeo);
    fungusMesh.position.set(
      Math.cos(angle) * trunkRadius * 0.95,
      yPos,
      Math.sin(angle) * trunkRadius * 0.95,
    );
    fungusMesh.lookAt(new THREE.Vector3(
      Math.cos(angle) * trunkRadius * 2,
      yPos,
      Math.sin(angle) * trunkRadius * 2,
    ));
    fungusMesh.updateMatrixWorld(true);
    fungusGeo.applyMatrix4(fungusMesh.matrixWorld);

    geometries.push(fungusGeo);
  }

  return geometries;
}

/**
 * Build broken branch stubs with snapped ends.
 */
function buildBrokenStubs(
  trunkHeight: number,
  trunkRadius: number,
  count: number,
  seed: number,
): THREE.BufferGeometry[] {
  const rng = new SeededRandom(seed + 1000);
  const geometries: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const stubLength = rng.uniform(0.2, 0.7);
    const stubRadius = rng.uniform(0.03, 0.1) * trunkRadius;
    const breakPoint = rng.uniform(0.3, 0.8); // where the branch snaps

    // Lower part of the branch still attached
    const attachedLength = stubLength * breakPoint;
    const attachedGeo = new THREE.CylinderGeometry(
      stubRadius * 0.5,
      stubRadius,
      attachedLength,
      5,
      2,
      false,
    );

    applyNoiseDisplacement(attachedGeo, seed + 1050 + i * 19, 0.7, 0.06);

    // Position along trunk
    const heightPos = rng.uniform(trunkHeight * 0.15, trunkHeight * 0.85);
    const angle = rng.uniform(0, Math.PI * 2);

    const stubMesh = new THREE.Mesh(attachedGeo);
    stubMesh.position.set(
      Math.cos(angle) * (trunkRadius * 0.9 + attachedLength * 0.3),
      heightPos,
      Math.sin(angle) * (trunkRadius * 0.9 + attachedLength * 0.3),
    );
    stubMesh.rotation.z = -Math.cos(angle) * (Math.PI / 3);
    stubMesh.rotation.x = Math.sin(angle) * (Math.PI / 3);
    stubMesh.updateMatrixWorld(true);
    attachedGeo.applyMatrix4(stubMesh.matrixWorld);
    geometries.push(attachedGeo);

    // Broken tip (if break is not too close to the trunk)
    if (breakPoint > 0.4) {
      const tipLength = stubLength * (1 - breakPoint);
      const tipGeo = new THREE.CylinderGeometry(
        stubRadius * 0.2,
        stubRadius * 0.4,
        tipLength,
        4,
        1,
        false,
      );

      // The broken tip hangs at an angle
      const tipMesh = new THREE.Mesh(tipGeo);
      tipMesh.position.set(
        Math.cos(angle) * (trunkRadius * 0.9 + stubLength * 0.6),
        heightPos - tipLength * 0.3,
        Math.sin(angle) * (trunkRadius * 0.9 + stubLength * 0.6),
      );
      tipMesh.rotation.z = -Math.cos(angle) * (Math.PI / 3 + rng.uniform(0, 0.3));
      tipMesh.rotation.x = Math.sin(angle) * (Math.PI / 3 + rng.uniform(0, 0.3));
      tipMesh.updateMatrixWorld(true);
      tipGeo.applyMatrix4(tipMesh.matrixWorld);
      geometries.push(tipGeo);
    }
  }

  return geometries;
}

/**
 * Build the top cap for the broken/rotted top of the trunk.
 */
function buildRottenTopCap(
  trunkHeight: number,
  trunkRadius: number,
  seed: number,
  lod: number,
): THREE.BufferGeometry {
  const segments = Math.max(10, 16 - lod * 2);
  const geometry = new THREE.CylinderGeometry(
    trunkRadius * 0.5,
    trunkRadius * 0.7,
    0.2,
    segments,
    1,
    true,
  );

  // Apply rot-style displacement
  applyCavityDisplacement(geometry, seed + 1200, 0.3, 10, trunkRadius * 0.5, 'down');

  // Position at top
  const posAttr = geometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    posAttr.setY(i, posAttr.getY(i) + trunkHeight);
  }
  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

// ============================================================================
// Main generator class
// ============================================================================

/**
 * Procedural rotten tree generator.
 *
 * Generates a partially decomposed tree with:
 * 1. Main trunk with irregular bark and rot indentations
 * 2. Missing bark patches (darker, rougher areas)
 * 3. Rot cavities (spherical holes with exposed interior)
 * 4. Fungal growths (bracket mushrooms)
 * 5. Broken branch stubs with snapped ends
 * 6. Rotted top cap
 *
 * All geometries are merged via `GeometryPipeline.mergeGeometries()`.
 *
 * @example
 * ```ts
 * const generator = new RottenTreeGenerator();
 * const geometry = generator.generate({ trunkHeight: 4.5, trunkRadius: 0.45, seed: 42 });
 * const mesh = new THREE.Mesh(geometry, material);
 * scene.add(mesh);
 * ```
 */
export class RottenTreeGenerator {
  /**
   * Generate a rotten tree as a single merged BufferGeometry.
   *
   * @param config — Configuration for the rotten tree
   * @returns A single merged BufferGeometry containing all parts
   */
  generate(config: Partial<RottenTreeConfig> = {}): THREE.BufferGeometry {
    const cfg: RottenTreeConfig = { ...DEFAULT_ROTTEN_TREE_CONFIG, ...config };
    const {
      trunkHeight,
      trunkRadius,
      seed,
      lod = 0,
      barkPatchCount = 4,
      fungusCount = 3,
      stubCount = 5,
      cavityCount = 2,
    } = cfg;

    const rng = new SeededRandom(seed);
    const barkColor = makeRottenBarkColor(rng);

    const geometries: THREE.BufferGeometry[] = [];

    // 1. Main trunk
    geometries.push(buildTrunk(trunkHeight, trunkRadius, seed, lod, barkColor));

    // 2. Missing bark patches
    geometries.push(...buildBarkPatches(trunkHeight, trunkRadius, barkPatchCount, seed));

    // 3. Rot cavities
    geometries.push(...buildRotCavities(trunkHeight, trunkRadius, cavityCount, seed));

    // 4. Fungal growths
    geometries.push(...buildFungalGrowths(trunkHeight, trunkRadius, fungusCount, seed));

    // 5. Broken branch stubs
    geometries.push(...buildBrokenStubs(trunkHeight, trunkRadius, stubCount, seed));

    // 6. Rotted top cap
    geometries.push(buildRottenTopCap(trunkHeight, trunkRadius, seed, lod));

    // Merge all geometries
    return GeometryPipeline.mergeGeometries(geometries);
  }
}

// ============================================================================
// Convenience factory
// ============================================================================

/**
 * Create a rotten tree geometry in a single call.
 *
 * @param seed — Master seed for deterministic output
 * @param options — Optional overrides for dimensions and LOD
 * @returns A merged BufferGeometry ready for mesh creation
 */
export function createRottenTree(
  seed: number,
  options: Partial<RottenTreeConfig> = {},
): THREE.BufferGeometry {
  const generator = new RottenTreeGenerator();
  return generator.generate({ seed, ...options });
}
