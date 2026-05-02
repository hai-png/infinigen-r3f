/**
 * DeformedTreeGenerator.ts
 *
 * Procedural deformed tree generator — a TypeScript / Three.js port of
 * Princeton's Infinigen deformed tree factories (fallen, hollow, rotten,
 * truncated) plus an additional "broken" variant.
 *
 * Each variant builds a base trunk with CylinderGeometry, applies vertex
 * displacement for bark texture, and adds characteristic deformation
 * geometry. All randomness is driven by `SeededRandom` for fully
 * deterministic output.
 *
 * Original Python sources:
 *   infinigen/assets/objects/deformed_trees/base.py
 *   infinigen/assets/objects/deformed_trees/fallen.py
 *   infinigen/assets/objects/deformed_trees/hollow.py
 *   infinigen/assets/objects/deformed_trees/rotten.py
 *   infinigen/assets/objects/deformed_trees/truncated.py
 *   infinigen/assets/objects/deformed_trees/generate.py
 */

import * as THREE from 'three';
import { SeededRandom, seededNoise3D, hsvToRgb } from '@/core/util/MathUtils';

// ============================================================================
// Public Types
// ============================================================================

/** Supported deformed-tree variants */
export type DeformedTreeVariant = 'fallen' | 'hollow' | 'rotten' | 'truncated' | 'broken';

/** All available variant names for enumeration */
export const DEFORMED_TREE_VARIANTS: readonly DeformedTreeVariant[] = [
  'fallen',
  'hollow',
  'rotten',
  'truncated',
  'broken',
] as const;

/** Configuration for generating a deformed tree */
export interface DeformedTreeConfig {
  /** Which visual variant to generate */
  variant: DeformedTreeVariant;
  /** Base trunk height (world units) */
  trunkHeight: number;
  /** Base trunk radius at the bottom (world units) */
  trunkRadius: number;
  /** Master seed for deterministic RNG */
  seed: number;
  /** Level-of-detail (0 = highest). Reduces segment counts. */
  lod?: number;
}

/** Parameters that characterise a bark ring texture (ported from base.py shader_rings) */
export interface BarkRingParams {
  /** Hue in [0,1] — the original uses 0.02–0.08 */
  baseHue: number;
  /** Wave texture scale for ring pattern (≈10–20) */
  ringScale: number;
  /** Wave texture distortion (≈4–10) */
  ringDistortion: number;
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Default bark colour palette — dark browns & greys */
const BARK_COLORS = {
  darkBrown:  new THREE.Color(0x3e2723),
  midBrown:   new THREE.Color(0x5d4037),
  lightBrown: new THREE.Color(0x795548),
  grey:       new THREE.Color(0x616161),
  darkGrey:   new THREE.Color(0x424242),
  paleGrey:   new THREE.Color(0x9e9e9e),
  /** Inner ring / cross-section wood colour */
  ringBright: new THREE.Color(0x8d6e63),
  ringDark:   new THREE.Color(0x3e2723),
  /** Fungal growth colours (rotten variant) */
  fungusGreen: new THREE.Color(0x558b2f),
  fungusWhite: new THREE.Color(0xd7ccc8),
} as const;

/**
 * Create a bark-ring colour from HSV parameters, matching the Python
 * `shader_rings` logic that mixes a bright and dark ring colour.
 */
function makeRingBarkColor(rng: SeededRandom): THREE.Color {
  const baseHue = rng.uniform(0.02, 0.08);
  const brightSat = rng.uniform(0.4, 0.8);
  const brightVal = rng.logUniform(0.2, 0.8);
  const darkHue = (baseHue + rng.uniform(-0.02, 0.02) + 1) % 1;
  const darkSat = rng.uniform(0.4, 0.8);
  const darkVal = rng.logUniform(0.02, 0.05);

  const bright = hsvToRgb(baseHue, brightSat, brightVal);
  const dark = hsvToRgb(darkHue, darkSat, darkVal);

  // Mix 50/50 for a mid-tone base colour
  return new THREE.Color(
    (bright.r + dark.r) * 0.5,
    (bright.g + dark.g) * 0.5,
    (bright.b + dark.b) * 0.5,
  );
}

/**
 * Apply noise-based vertex displacement to a geometry, producing an
 * organic bark-like surface. This replaces the Blender geometry-node
 * displacement used in the original Python code.
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

    // Default: displace radially outward from Y-axis (bark bulge)
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
 * Apply noise-based Z-offset displacement (ported from FallenTreeFactory.geo_cutter).
 * Vertices within a cylinder are displaced along Z by clamped noise.
 */
function applyCylindricalNoiseDisplacement(
  geometry: THREE.BufferGeometry,
  seed: number,
  strength: number,
  scale: number,
  radius: number,
  direction: 'up' | 'down',
): void {
  const posAttr = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  const rng = new SeededRandom(seed + 7777);

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);

    const r2 = vertex.x * vertex.x + vertex.z * vertex.z;
    if (r2 > radius * radius) continue; // outside cylinder

    let noiseVal = seededNoise3D(
      vertex.x * scale + rng.next(),
      vertex.y * scale,
      vertex.z * scale + rng.next(),
      1.0,
      seed & 0xffff,
    );

    // Clamp to [0.3, 0.7] as in the original
    noiseVal = Math.max(0.3, Math.min(0.7, noiseVal));
    let offset = noiseVal * strength;

    // Falloff: linear from centre to edge of cylinder
    const rNorm = Math.sqrt(r2) / radius;
    offset *= 1.0 - rNorm;

    // Direction
    if (direction === 'down') offset = -offset;

    posAttr.setY(i, vertex.y + offset);
  }

  geometry.computeVertexNormals();
}

/**
 * Merge multiple BufferGeometries into one (simplified — no index handling
 * for the typical deformed-tree geometry sizes).
 */
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVertices = 0;
  for (const geo of geometries) {
    totalVertices += geo.attributes.position.count;
  }

  const mergedPositions = new Float32Array(totalVertices * 3);
  const mergedNormals = new Float32Array(totalVertices * 3);
  let offset = 0;

  for (const geo of geometries) {
    const posAttr = geo.attributes.position;
    const normAttr = geo.attributes.normal;

    for (let i = 0; i < posAttr.count; i++) {
      mergedPositions[(offset + i) * 3]     = posAttr.getX(i);
      mergedPositions[(offset + i) * 3 + 1] = posAttr.getY(i);
      mergedPositions[(offset + i) * 3 + 2] = posAttr.getZ(i);

      if (normAttr) {
        mergedNormals[(offset + i) * 3]     = normAttr.getX(i);
        mergedNormals[(offset + i) * 3 + 1] = normAttr.getY(i);
        mergedNormals[(offset + i) * 3 + 2] = normAttr.getZ(i);
      }
    }

    offset += posAttr.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
  merged.computeVertexNormals();
  return merged;
}

// ============================================================================
// Geometry builders
// ============================================================================

/**
 * Build a base trunk cylinder with bark-texture vertex displacement.
 * Shared across all variants — corresponds to `build_tree()` in base.py.
 */
function buildBaseTrunk(
  height: number,
  radius: number,
  seed: number,
  lod: number,
  barkColor: THREE.Color,
): THREE.Mesh {
  const rng = new SeededRandom(seed);
  const segments = Math.max(8, 16 - lod * 2);
  const heightSegments = Math.max(4, 12 - lod * 2);

  const geometry = new THREE.CylinderGeometry(
    radius * 0.85, // top radius (slight taper)
    radius,         // bottom radius
    height,
    segments,
    heightSegments,
    false,
  );

  // Bark noise displacement
  applyNoiseDisplacement(geometry, seed, 0.4, 0.08);

  const material = new THREE.MeshStandardMaterial({
    color: barkColor,
    roughness: 0.92,
    metalness: 0.0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

/**
 * Build exposed root geometry — visible at the base of fallen / broken trees.
 * Creates 3–6 root fingers radiating outward and downward.
 */
function buildExposedRoots(
  baseRadius: number,
  seed: number,
  barkColor: THREE.Color,
): THREE.Group {
  const group = new THREE.Group();
  const rng = new SeededRandom(seed + 300);
  const rootCount = rng.nextInt(3, 6);

  for (let i = 0; i < rootCount; i++) {
    const angle = (i / rootCount) * Math.PI * 2 + rng.uniform(-0.3, 0.3);
    const rootLength = rng.uniform(0.8, 1.8) * baseRadius;
    const rootRadius = rng.uniform(0.08, 0.18) * baseRadius;

    const rootGeo = new THREE.CylinderGeometry(
      rootRadius * 0.4,
      rootRadius,
      rootLength,
      6,
      3,
      false,
    );

    // Bend the root slightly downward using noise
    applyNoiseDisplacement(rootGeo, seed + i * 13, 0.5, 0.06);

    const rootMat = new THREE.MeshStandardMaterial({
      color: barkColor.clone().offsetHSL(0, 0, rng.uniform(-0.05, 0.02)),
      roughness: 0.95,
      metalness: 0.0,
    });

    const rootMesh = new THREE.Mesh(rootGeo, rootMat);
    rootMesh.castShadow = true;

    // Position: at ground level, radiating outward
    rootMesh.position.set(
      Math.cos(angle) * baseRadius * 0.6,
      -rootLength * 0.3,
      Math.sin(angle) * baseRadius * 0.6,
    );

    // Rotate to point outward and down
    rootMesh.rotation.z = -Math.cos(angle) * 0.6;
    rootMesh.rotation.x = Math.sin(angle) * 0.6;

    group.add(rootMesh);
  }

  return group;
}

/**
 * Build branch stubs — short truncated branches protruding from the trunk.
 */
function buildBranchStubs(
  trunkHeight: number,
  trunkRadius: number,
  count: number,
  seed: number,
  barkColor: THREE.Color,
): THREE.Group {
  const group = new THREE.Group();
  const rng = new SeededRandom(seed + 500);

  for (let i = 0; i < count; i++) {
    const stubLength = rng.uniform(0.3, 0.9);
    const stubRadius = rng.uniform(0.04, 0.12) * trunkRadius;

    const stubGeo = new THREE.CylinderGeometry(
      stubRadius * 0.5,
      stubRadius,
      stubLength,
      5,
      2,
      false,
    );

    applyNoiseDisplacement(stubGeo, seed + i * 17, 0.6, 0.05);

    const stubMat = new THREE.MeshStandardMaterial({
      color: barkColor,
      roughness: 0.9,
      metalness: 0.0,
    });

    const stubMesh = new THREE.Mesh(stubGeo, stubMat);
    stubMesh.castShadow = true;

    // Place along trunk
    const heightPos = rng.uniform(trunkHeight * 0.15, trunkHeight * 0.85);
    const angle = rng.uniform(0, Math.PI * 2);

    stubMesh.position.set(
      Math.cos(angle) * (trunkRadius * 0.9 + stubLength * 0.3),
      heightPos,
      Math.sin(angle) * (trunkRadius * 0.9 + stubLength * 0.3),
    );

    // Rotate to point outward
    stubMesh.rotation.z = -Math.cos(angle) * (Math.PI / 3);
    stubMesh.rotation.x = Math.sin(angle) * (Math.PI / 3);

    group.add(stubMesh);
  }

  return group;
}

// ============================================================================
// Variant generators
// ============================================================================

/**
 * **Fallen Tree** — tree lying on its side with exposed roots and a broken top.
 *
 * Ported from `FallenTreeFactory` which:
 * 1. Builds a tree, cuts it in half at a random height.
 * 2. Rotates the upper half to lie on the ground.
 * 3. Joins the halves and applies noise displacement at the cut.
 *
 * In our R3F port we directly construct the fallen geometry: a horizontal
 * trunk with a jagged break point, exposed root flare, and a detached top
 * section lying nearby.
 */
function generateFallenTree(config: DeformedTreeConfig): THREE.Group {
  const { trunkHeight, trunkRadius, seed, lod = 0 } = config;
  const rng = new SeededRandom(seed);
  const group = new THREE.Group();

  const barkColor = makeRingBarkColor(rng);
  const ringColor = BARK_COLORS.ringBright.clone();

  // Cut height — where the trunk snaps (0.6–1.2 normalised in original)
  const cutHeightNorm = rng.uniform(0.4, 0.7);
  const cutHeight = trunkHeight * cutHeightNorm;

  // ---- Lower trunk (on ground, lying sideways) ----
  const lowerLength = cutHeight;
  const lowerGeo = new THREE.CylinderGeometry(
    trunkRadius * 0.8,
    trunkRadius,
    lowerLength,
    Math.max(8, 14 - lod * 2),
    Math.max(4, 8 - lod * 2),
    false,
  );
  applyNoiseDisplacement(lowerGeo, seed, 0.35, 0.07);

  const barkMat = new THREE.MeshStandardMaterial({
    color: barkColor,
    roughness: 0.92,
    metalness: 0.0,
  });

  const lowerMesh = new THREE.Mesh(lowerGeo, barkMat);
  // Lay the trunk on its side along the X axis
  lowerMesh.rotation.z = Math.PI / 2;
  lowerMesh.position.x = lowerLength / 2;
  lowerMesh.castShadow = true;
  lowerMesh.receiveShadow = true;
  group.add(lowerMesh);

  // ---- Exposed root flare ----
  const roots = buildExposedRoots(trunkRadius, seed + 100, barkColor);
  roots.rotation.z = Math.PI / 2;
  roots.position.x = 0;
  group.add(roots);

  // ---- Jagged break face at the cut ----
  const breakRadius = trunkRadius * 0.85;
  const breakGeo = new THREE.CylinderGeometry(breakRadius, breakRadius, 0.15, 12, 1, false);
  // Apply noise to make the break jagged
  applyNoiseDisplacement(breakGeo, seed + 200, 2.0, 0.15);

  const ringMat = new THREE.MeshStandardMaterial({
    color: ringColor,
    roughness: 0.85,
    metalness: 0.0,
  });

  const breakMesh = new THREE.Mesh(breakGeo, ringMat);
  breakMesh.rotation.z = Math.PI / 2;
  breakMesh.position.x = lowerLength;
  breakMesh.castShadow = true;
  group.add(breakMesh);

  // ---- Upper trunk section (detached, lying nearby) ----
  const upperLength = trunkHeight - cutHeight;
  const upperGeo = new THREE.CylinderGeometry(
    trunkRadius * 0.5,
    trunkRadius * 0.75,
    upperLength,
    Math.max(8, 12 - lod * 2),
    Math.max(4, 6 - lod * 2),
    false,
  );
  applyNoiseDisplacement(upperGeo, seed + 300, 0.35, 0.06);

  const upperMesh = new THREE.Mesh(upperGeo, barkMat.clone());
  upperMesh.rotation.z = Math.PI / 2 + rng.uniform(-0.15, 0.15);
  // Place near the break, slightly offset
  upperMesh.position.x = lowerLength + upperLength / 2 + rng.uniform(0.3, 0.8);
  upperMesh.position.y = rng.uniform(0.1, 0.4);
  upperMesh.position.z = rng.uniform(-0.3, 0.3);
  upperMesh.castShadow = true;
  group.add(upperMesh);

  // ---- Branch stubs on lower trunk ----
  const stubs = buildBranchStubs(lowerLength, trunkRadius, rng.nextInt(3, 6), seed + 400, barkColor);
  stubs.rotation.z = Math.PI / 2;
  group.add(stubs);

  // Rotate the whole group slightly for naturalism
  group.rotation.y = rng.uniform(0, Math.PI * 2);

  return group;
}

/**
 * **Hollow Tree** — standing tree with a visible cavity/hole in the trunk.
 *
 * Ported from `HollowTreeFactory` which:
 * 1. Builds a tree and selects vertices to remove (noise-based).
 * 2. Clones the mesh for the inner surface.
 * 3. Bridges the gap between outer and inner to form a hollow.
 *
 * In R3F we construct the hollow directly: an outer trunk with a carved-out
 * opening and an inner cylinder visible through the hole.
 */
function generateHollowTree(config: DeformedTreeConfig): THREE.Group {
  const { trunkHeight, trunkRadius, seed, lod = 0 } = config;
  const rng = new SeededRandom(seed);
  const group = new THREE.Group();

  const barkColor = makeRingBarkColor(rng);
  const innerColor = BARK_COLORS.ringDark.clone();

  // ---- Outer trunk ----
  const outerTrunk = buildBaseTrunk(trunkHeight, trunkRadius, seed, lod, barkColor);
  group.add(outerTrunk);

  // ---- Hollow opening ----
  // Carve an opening on one side using a noise-based selection (ported threshold logic)
  const noiseScale = rng.uniform(0.8, 1.0);
  const noiseThreshold = rng.uniform(0.36, 0.40);
  const hollowAngle = rng.uniform(0, Math.PI * 2);
  const hollowHeightMin = rng.uniform(0.1, 0.4) * trunkHeight;
  const hollowHeightMax = rng.uniform(0.6, 0.9) * trunkHeight;
  const hollowDepth = trunkRadius * rng.uniform(0.6, 0.9);

  // Build the inner cavity as a smaller, darker cylinder
  const innerGeo = new THREE.CylinderGeometry(
    trunkRadius * 0.65,
    trunkRadius * 0.65,
    hollowHeightMax - hollowHeightMin,
    Math.max(8, 12 - lod * 2),
    Math.max(4, 8 - lod * 2),
    true, // open-ended
  );

  const innerMat = new THREE.MeshStandardMaterial({
    color: innerColor,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.BackSide,
  });

  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  innerMesh.position.y = (hollowHeightMin + hollowHeightMax) / 2;
  innerMesh.castShadow = true;
  group.add(innerMesh);

  // ---- Hollow opening edge (the visible hole) ----
  // Create an elliptical hole shape using a torus-like ring
  const openingWidth = trunkRadius * rng.uniform(0.5, 0.9);
  const openingHeight = (hollowHeightMax - hollowHeightMin) * rng.uniform(0.5, 0.8);

  const openingShape = new THREE.Shape();
  const segs = 24;
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const x = Math.cos(t) * openingWidth;
    const y = Math.sin(t) * openingHeight;
    if (i === 0) openingShape.moveTo(x, y);
    else openingShape.lineTo(x, y);
  }

  const openingGeo = new THREE.ShapeGeometry(openingShape, 8);
  // Apply noise to roughen the edges
  applyNoiseDisplacement(openingGeo, seed + 600, 1.5, 0.04);

  const ringMat = new THREE.MeshStandardMaterial({
    color: BARK_COLORS.ringBright,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const openingMesh = new THREE.Mesh(openingGeo, ringMat);
  openingMesh.position.set(
    Math.cos(hollowAngle) * trunkRadius * 0.95,
    (hollowHeightMin + hollowHeightMax) / 2,
    Math.sin(hollowAngle) * trunkRadius * 0.95,
  );
  openingMesh.rotation.y = hollowAngle;
  openingMesh.castShadow = true;
  group.add(openingMesh);

  // ---- Top break (hollow trees often have broken tops) ----
  const topBreakGeo = new THREE.CylinderGeometry(
    trunkRadius * 0.6,
    trunkRadius * 0.7,
    0.2,
    10,
    1,
    true,
  );
  applyNoiseDisplacement(topBreakGeo, seed + 700, 2.0, 0.12);

  const topBreakMesh = new THREE.Mesh(topBreakGeo, ringMat.clone());
  topBreakMesh.position.y = trunkHeight;
  topBreakMesh.castShadow = true;
  group.add(topBreakMesh);

  // ---- Branch stubs ----
  const stubCount = rng.nextInt(2, 5);
  const stubs = buildBranchStubs(trunkHeight, trunkRadius, stubCount, seed + 800, barkColor);
  group.add(stubs);

  group.rotation.y = rng.uniform(0, Math.PI * 2);
  return group;
}

/**
 * **Rotten Tree** — tree with decayed sections, missing bark, and fungal growths.
 *
 * Ported from `RottenTreeFactory` which:
 * 1. Builds a tree, applies a boolean difference with an icosphere cutter.
 * 2. Creates an inner surface and bridges the gap.
 * 3. Applies noise displacement for the rotten edge texture.
 *
 * In R3F we model this as a trunk with a carved-out cavity, exposed interior
 * wood, and mushroom/fungal growth meshes.
 */
function generateRottenTree(config: DeformedTreeConfig): THREE.Group {
  const { trunkHeight, trunkRadius, seed, lod = 0 } = config;
  const rng = new SeededRandom(seed);
  const group = new THREE.Group();

  const barkColor = makeRingBarkColor(rng);

  // ---- Outer trunk with a missing section ----
  const outerTrunk = buildBaseTrunk(trunkHeight, trunkRadius, seed, lod, barkColor);
  group.add(outerTrunk);

  // ---- Rot cavity (sphere-based, matching the icosphere cutter logic) ----
  const cavityAngle = rng.uniform(-Math.PI, Math.PI);
  const cavityDepth = trunkRadius * rng.uniform(0.4, 0.9);
  const cavityScaleX = trunkRadius * rng.uniform(0.8, 1.2);
  const cavityScaleY = trunkRadius * rng.uniform(0.8, 1.2);
  const cavityScaleZ = rng.logUniform(1.0, 1.2);
  const cavityHeight = rng.uniform(0.2, 0.6) * trunkHeight;

  const cavityGeo = new THREE.SphereGeometry(1, 12, 8);
  cavityGeo.scale(cavityScaleX, cavityScaleY, cavityScaleZ);

  // Apply musgrave-like noise displacement for the rotten interior
  applyNoiseDisplacement(cavityGeo, seed + 500, 0.8, 0.1);

  const cavityMat = new THREE.MeshStandardMaterial({
    color: BARK_COLORS.ringDark,
    roughness: 0.98,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const cavityMesh = new THREE.Mesh(cavityGeo, cavityMat);
  cavityMesh.position.set(
    cavityDepth * Math.cos(cavityAngle),
    cavityHeight,
    cavityDepth * Math.sin(cavityAngle),
  );
  cavityMesh.castShadow = true;
  group.add(cavityMesh);

  // ---- Rotten edge ring at the cavity opening ----
  const edgeGeo = new THREE.TorusGeometry(
    trunkRadius * rng.uniform(0.3, 0.6),
    0.05,
    8,
    16,
  );
  applyNoiseDisplacement(edgeGeo, seed + 550, 1.0, 0.08);

  const edgeMat = new THREE.MeshStandardMaterial({
    color: BARK_COLORS.ringBright.clone().offsetHSL(0, -0.1, -0.05),
    roughness: 0.88,
    metalness: 0.0,
  });

  const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
  edgeMesh.position.copy(cavityMesh.position);
  edgeMesh.lookAt(new THREE.Vector3(0, cavityHeight, 0));
  edgeMesh.castShadow = true;
  group.add(edgeMesh);

  // ---- Fungal growths (mushrooms / brackets) ----
  const fungusCount = rng.nextInt(2, 5);
  for (let i = 0; i < fungusCount; i++) {
    const fungusRng = new SeededRandom(seed + 600 + i * 31);
    const fAngle = cavityAngle + fungusRng.uniform(-0.8, 0.8);
    const fHeight = cavityHeight + fungusRng.uniform(-0.3, 0.3) * trunkRadius;
    const fSize = fungusRng.uniform(0.06, 0.18) * trunkRadius;

    // Bracket fungus — a half-sphere
    const fungusGeo = new THREE.SphereGeometry(fSize, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);

    const isGreen = fungusRng.boolean(0.4);
    const fungusMat = new THREE.MeshStandardMaterial({
      color: isGreen ? BARK_COLORS.fungusGreen : BARK_COLORS.fungusWhite,
      roughness: 0.7,
      metalness: 0.0,
    });

    const fungusMesh = new THREE.Mesh(fungusGeo, fungusMat);
    fungusMesh.position.set(
      Math.cos(fAngle) * trunkRadius * 0.95,
      fHeight,
      Math.sin(fAngle) * trunkRadius * 0.95,
    );
    fungusMesh.lookAt(new THREE.Vector3(
      Math.cos(fAngle) * trunkRadius * 2,
      fHeight,
      Math.sin(fAngle) * trunkRadius * 2,
    ));
    fungusMesh.castShadow = true;
    group.add(fungusMesh);
  }

  // ---- Missing bark patches (darker, rougher material patches) ----
  const patchCount = rng.nextInt(2, 4);
  for (let i = 0; i < patchCount; i++) {
    const patchRng = new SeededRandom(seed + 900 + i * 23);
    const pAngle = patchRng.uniform(0, Math.PI * 2);
    const pHeight = patchRng.uniform(0.1, 0.8) * trunkHeight;
    const pSize = patchRng.uniform(0.1, 0.25) * trunkRadius;

    const patchGeo = new THREE.PlaneGeometry(pSize * 2, pSize * 3, 4, 4);
    applyNoiseDisplacement(patchGeo, seed + 950 + i, 1.2, 0.03);

    const patchMat = new THREE.MeshStandardMaterial({
      color: BARK_COLORS.darkGrey,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const patchMesh = new THREE.Mesh(patchGeo, patchMat);
    patchMesh.position.set(
      Math.cos(pAngle) * trunkRadius * 0.98,
      pHeight,
      Math.sin(pAngle) * trunkRadius * 0.98,
    );
    patchMesh.lookAt(new THREE.Vector3(0, pHeight, 0));
    patchMesh.castShadow = true;
    group.add(patchMesh);
  }

  // ---- Branch stubs (rotten trees have more dead branches) ----
  const stubs = buildBranchStubs(
    trunkHeight,
    trunkRadius,
    rng.nextInt(4, 8),
    seed + 1000,
    barkColor,
  );
  group.add(stubs);

  // ---- Top break with rot ----
  const topGeo = new THREE.CylinderGeometry(
    trunkRadius * 0.5,
    trunkRadius * 0.7,
    0.15,
    10,
    1,
    true,
  );
  applyCylindricalNoiseDisplacement(topGeo, seed + 1100, 0.3, 10, trunkRadius * 0.5, 'down');

  const topMat = new THREE.MeshStandardMaterial({
    color: BARK_COLORS.ringDark,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.position.y = trunkHeight;
  topMesh.castShadow = true;
  group.add(topMesh);

  group.rotation.y = rng.uniform(0, Math.PI * 2);
  return group;
}

/**
 * **Truncated Tree** — tree cut short with a flat or jagged top.
 *
 * Ported from `TruncatedTreeFactory` which:
 * 1. Builds a tree, applies bark material.
 * 2. Cuts at a random height (0.8–1.5 in original scale) with a tilted plane.
 * 3. Applies noise displacement to the cut face.
 *
 * In R3F we build a short trunk ending in a jagged top cap.
 */
function generateTruncatedTree(config: DeformedTreeConfig): THREE.Group {
  const { trunkHeight, trunkRadius, seed, lod = 0 } = config;
  const rng = new SeededRandom(seed);
  const group = new THREE.Group();

  const barkColor = makeRingBarkColor(rng);

  // Truncated trees are shorter — cut at 0.4–0.7 of full height
  const truncationRatio = rng.uniform(0.4, 0.7);
  const actualHeight = trunkHeight * truncationRatio;

  // ---- Main trunk (short) ----
  const trunkGeo = new THREE.CylinderGeometry(
    trunkRadius * 0.9,
    trunkRadius,
    actualHeight,
    Math.max(8, 14 - lod * 2),
    Math.max(4, 10 - lod * 2),
    false,
  );
  applyNoiseDisplacement(trunkGeo, seed, 0.35, 0.07);

  const barkMat = new THREE.MeshStandardMaterial({
    color: barkColor,
    roughness: 0.92,
    metalness: 0.0,
  });

  const trunkMesh = new THREE.Mesh(trunkGeo, barkMat);
  trunkMesh.position.y = actualHeight / 2;
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  group.add(trunkMesh);

  // ---- Jagged top cap ----
  const tiltAngle = rng.uniform(-0.4, 0.4);
  const topCapGeo = new THREE.CylinderGeometry(
    trunkRadius * 0.85,
    trunkRadius * 0.9,
    0.15,
    12,
    1,
    false,
  );

  // Apply strong noise for a jagged, uneven cut
  const noiseStrength = rng.uniform(0.6, 1.0);
  applyCylindricalNoiseDisplacement(
    topCapGeo,
    seed + 200,
    noiseStrength,
    rng.uniform(10, 15),
    trunkRadius * 0.9,
    'up',
  );

  const ringMat = new THREE.MeshStandardMaterial({
    color: BARK_COLORS.ringBright,
    roughness: 0.85,
    metalness: 0.0,
  });

  const topCapMesh = new THREE.Mesh(topCapGeo, ringMat);
  topCapMesh.position.y = actualHeight;
  topCapMesh.rotation.z = tiltAngle;
  topCapMesh.castShadow = true;
  group.add(topCapMesh);

  // ---- Side ring detail at the cut ----
  const sideRingGeo = new THREE.TorusGeometry(trunkRadius * 0.88, 0.04, 6, 16);
  applyNoiseDisplacement(sideRingGeo, seed + 250, 1.5, 0.03);

  const sideRingMesh = new THREE.Mesh(sideRingGeo, ringMat.clone());
  sideRingMesh.position.y = actualHeight;
  sideRingMesh.rotation.x = Math.PI / 2;
  sideRingMesh.rotation.z = tiltAngle;
  sideRingMesh.castShadow = true;
  group.add(sideRingMesh);

  // ---- Branch stubs (fewer — truncated trees have them cut off) ----
  const stubs = buildBranchStubs(
    actualHeight,
    trunkRadius,
    rng.nextInt(2, 5),
    seed + 300,
    barkColor,
  );
  group.add(stubs);

  // ---- Exposed roots at base ----
  const roots = buildExposedRoots(trunkRadius, seed + 400, barkColor);
  group.add(roots);

  group.rotation.y = rng.uniform(0, Math.PI * 2);
  return group;
}

/**
 * **Broken Tree** — tree with a snapped trunk and partial canopy.
 *
 * This variant is unique to the R3F port (not in the original Python).
 * It represents a tree whose trunk has snapped partway up, with the upper
 * portion hanging or fallen nearby and a partial remnant canopy.
 */
function generateBrokenTree(config: DeformedTreeConfig): THREE.Group {
  const { trunkHeight, trunkRadius, seed, lod = 0 } = config;
  const rng = new SeededRandom(seed);
  const group = new THREE.Group();

  const barkColor = makeRingBarkColor(rng);

  // Break point
  const breakRatio = rng.uniform(0.5, 0.75);
  const breakHeight = trunkHeight * breakRatio;

  // ---- Standing lower trunk ----
  const lowerGeo = new THREE.CylinderGeometry(
    trunkRadius * 0.85,
    trunkRadius,
    breakHeight,
    Math.max(8, 14 - lod * 2),
    Math.max(4, 10 - lod * 2),
    false,
  );
  applyNoiseDisplacement(lowerGeo, seed, 0.35, 0.07);

  const barkMat = new THREE.MeshStandardMaterial({
    color: barkColor,
    roughness: 0.92,
    metalness: 0.0,
  });

  const lowerMesh = new THREE.Mesh(lowerGeo, barkMat);
  lowerMesh.position.y = breakHeight / 2;
  lowerMesh.castShadow = true;
  lowerMesh.receiveShadow = true;
  group.add(lowerMesh);

  // ---- Jagged break top ----
  const breakGeo = new THREE.CylinderGeometry(
    trunkRadius * 0.7,
    trunkRadius * 0.85,
    0.2,
    10,
    1,
    true,
  );
  applyCylindricalNoiseDisplacement(breakGeo, seed + 200, 0.5, 12, trunkRadius * 0.7, 'up');

  const breakMat = new THREE.MeshStandardMaterial({
    color: BARK_COLORS.ringBright,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const breakMesh = new THREE.Mesh(breakGeo, breakMat);
  breakMesh.position.y = breakHeight;
  breakMesh.castShadow = true;
  group.add(breakMesh);

  // ---- Splinter shards at the break ----
  const shardCount = rng.nextInt(3, 7);
  for (let i = 0; i < shardCount; i++) {
    const shardRng = new SeededRandom(seed + 300 + i * 19);
    const shardHeight = shardRng.uniform(0.2, 0.7);
    const shardRadius = shardRng.uniform(0.02, 0.06) * trunkRadius;
    const shardAngle = shardRng.uniform(0, Math.PI * 2);

    const shardGeo = new THREE.CylinderGeometry(
      shardRadius * 0.3,
      shardRadius,
      shardHeight,
      4,
      1,
      false,
    );

    const shardMesh = new THREE.Mesh(shardGeo, barkMat.clone());
    shardMesh.position.set(
      Math.cos(shardAngle) * trunkRadius * 0.6,
      breakHeight + shardHeight * 0.3,
      Math.sin(shardAngle) * trunkRadius * 0.6,
    );
    // Lean outward
    shardMesh.rotation.z = -Math.cos(shardAngle) * shardRng.uniform(0.3, 0.8);
    shardMesh.rotation.x = Math.sin(shardAngle) * shardRng.uniform(0.3, 0.8);
    shardMesh.castShadow = true;
    group.add(shardMesh);
  }

  // ---- Fallen upper section ----
  const upperLength = trunkHeight * (1 - breakRatio);
  const upperGeo = new THREE.CylinderGeometry(
    trunkRadius * 0.5,
    trunkRadius * 0.7,
    upperLength,
    Math.max(6, 10 - lod * 2),
    Math.max(3, 6 - lod * 2),
    false,
  );
  applyNoiseDisplacement(upperGeo, seed + 400, 0.35, 0.06);

  const upperMesh = new THREE.Mesh(upperGeo, barkMat.clone());
  // Fall direction
  const fallAngle = rng.uniform(0, Math.PI * 2);
  upperMesh.rotation.z = Math.PI / 2;
  upperMesh.rotation.y = fallAngle;
  upperMesh.position.set(
    Math.cos(fallAngle) * (upperLength / 2 + trunkRadius * 0.5),
    rng.uniform(0.1, 0.3),
    Math.sin(fallAngle) * (upperLength / 2 + trunkRadius * 0.5),
  );
  upperMesh.castShadow = true;
  group.add(upperMesh);

  // ---- Partial canopy remnant on the fallen section ----
  const canopyRadius = rng.uniform(1.0, 2.0);
  const canopyGeo = new THREE.SphereGeometry(canopyRadius, Math.max(6, 10 - lod * 2), Math.max(4, 8 - lod * 2));
  applyNoiseDisplacement(canopyGeo, seed + 500, 0.5, 0.2);

  const canopyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x2d5a1d).offsetHSL(rng.uniform(-0.02, 0.02), rng.uniform(-0.1, 0.1), rng.uniform(-0.05, 0.05)),
    roughness: 0.7,
    metalness: 0.0,
  });

  const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
  canopyMesh.position.set(
    Math.cos(fallAngle) * (upperLength + trunkRadius * 0.3),
    canopyRadius * 0.5,
    Math.sin(fallAngle) * (upperLength + trunkRadius * 0.3),
  );
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  group.add(canopyMesh);

  // ---- Branch stubs on standing trunk ----
  const stubs = buildBranchStubs(
    breakHeight,
    trunkRadius,
    rng.nextInt(3, 6),
    seed + 600,
    barkColor,
  );
  group.add(stubs);

  // ---- Exposed roots ----
  const roots = buildExposedRoots(trunkRadius, seed + 700, barkColor);
  group.add(roots);

  group.rotation.y = rng.uniform(0, Math.PI * 2);
  return group;
}

// ============================================================================
// Main generator class
// ============================================================================

/**
 * Procedural deformed tree generator with five visual variants.
 *
 * Ported from Princeton Infinigen's `DeformedTreeFactory` which randomly
 * selects between Fallen, Hollow, Rotten, and Truncated variants. This R3F
 * version adds a "Broken" variant and exposes each variant individually.
 *
 * @example
 * ```ts
 * const generator = new DeformedTreeGenerator(42);
 * const tree = generator.generate({ variant: 'hollow', trunkHeight: 5, trunkRadius: 0.5, seed: 42 });
 * scene.add(tree);
 * ```
 */
export class DeformedTreeGenerator {
  private materialCache: Map<string, THREE.MeshStandardMaterial>;

  constructor(seed: number = 12345) {
    this.materialCache = new Map();
    // Seed is used per-generate call; the constructor seed is a fallback
    void seed; // acknowledged
  }

  /**
   * Generate a deformed tree mesh group for the given configuration.
   *
   * @param config — Variant, dimensions, seed, and optional LOD.
   * @returns A `THREE.Group` containing all meshes for the deformed tree.
   */
  generate(config: DeformedTreeConfig): THREE.Group {
    switch (config.variant) {
      case 'fallen':
        return generateFallenTree(config);
      case 'hollow':
        return generateHollowTree(config);
      case 'rotten':
        return generateRottenTree(config);
      case 'truncated':
        return generateTruncatedTree(config);
      case 'broken':
        return generateBrokenTree(config);
      default:
        return generateFallenTree(config);
    }
  }

  /**
   * Generate a random deformed tree variant (matching the original
   * `DeformedTreeFactory` which randomly picks among variants with
   * equal weight).
   *
   * @param trunkHeight — Base trunk height
   * @param trunkRadius — Base trunk radius
   * @param seed — Master seed (determines both variant choice and geometry)
   * @param lod — Level of detail
   */
  generateRandom(
    trunkHeight: number,
    trunkRadius: number,
    seed: number,
    lod: number = 0,
  ): THREE.Group {
    const rng = new SeededRandom(seed);
    const variant = rng.choice([...DEFORMED_TREE_VARIANTS]);
    return this.generate({ variant, trunkHeight, trunkRadius, seed, lod });
  }

  /**
   * Get a cached bark material (avoids creating duplicate materials).
   */
  getBarkMaterial(color: THREE.Color, key: string): THREE.MeshStandardMaterial {
    if (!this.materialCache.has(key)) {
      this.materialCache.set(key, new THREE.MeshStandardMaterial({
        color,
        roughness: 0.92,
        metalness: 0.0,
      }));
    }
    return this.materialCache.get(key)!;
  }
}

// ============================================================================
// Factory function
// ============================================================================

/**
 * Convenience factory — create a deformed tree in a single call.
 *
 * @param variant — Which deformed-tree variant to generate
 * @param seed — Master seed for deterministic output
 * @param options — Optional overrides for trunk dimensions and LOD
 * @returns A `THREE.Group` ready to add to a scene
 */
export function createDeformedTree(
  variant: DeformedTreeVariant,
  seed: number,
  options: {
    trunkHeight?: number;
    trunkRadius?: number;
    lod?: number;
  } = {},
): THREE.Group {
  const generator = new DeformedTreeGenerator(seed);
  return generator.generate({
    variant,
    trunkHeight: options.trunkHeight ?? 4.0,
    trunkRadius: options.trunkRadius ?? 0.4,
    seed,
    lod: options.lod ?? 0,
  });
}
