/**
 * FruitGenerator.ts
 *
 * Procedural fruit geometry generator ported from infinigen's fruit asset system.
 * Generates standalone fruit meshes as Three.js Group objects using seeded randomness
 * for deterministic, reproducible results.
 *
 * Original Python source:
 *   infinigen/assets/objects/fruits/{apple,strawberry,starfruit,coconutgreen,durian,general_fruit,fruit_utils}.py
 *
 * Each fruit type produces visually recognizable geometry with proper materials,
 * stems, leaves, and surface details approximating the original Blender node-based
 * generation pipeline.
 *
 * Supported fruit types:
 *   Apple, Strawberry, Starfruit, Coconut, Durian, Pineapple, Blackberry,
 *   Banana, Orange, Lemon, Peach, Pear, Cherry, Grape, Mango
 */

import * as THREE from 'three';
import { SeededRandom, hsvToRgb } from '@/core/util/MathUtils';

// ============================================================================
// Types & Configuration
// ============================================================================

/** All supported fruit type identifiers */
export type FruitType =
  | 'Apple'
  | 'Strawberry'
  | 'Starfruit'
  | 'Coconut'
  | 'Durian'
  | 'Pineapple'
  | 'Blackberry'
  | 'Banana'
  | 'Orange'
  | 'Lemon'
  | 'Peach'
  | 'Pear'
  | 'Cherry'
  | 'Grape'
  | 'Mango';

/** All fruit type names for iteration / selection */
export const FRUIT_TYPES: readonly FruitType[] = [
  'Apple',
  'Strawberry',
  'Starfruit',
  'Coconut',
  'Durian',
  'Pineapple',
  'Blackberry',
  'Banana',
  'Orange',
  'Lemon',
  'Peach',
  'Pear',
  'Cherry',
  'Grape',
  'Mango',
] as const;

/** Per-fruit configuration parameters — mirrors the original Python sample_*_params */
export interface FruitConfig {
  /** Display name */
  name: string;
  /** Scale multiplier for the overall fruit size */
  scaleMultiplier: number;
  /** HSV base color for the fruit body [h, s, v] */
  baseColorHsv: [number, number, number];
  /** Optional secondary color for variation */
  altColorHsv?: [number, number, number];
  /** Stem color HSV */
  stemColorHsv: [number, number, number];
  /** Roughness of the fruit surface */
  roughness: number;
  /** Whether fruit has a stem */
  hasStem: boolean;
  /** Whether fruit has a leaf on the stem */
  hasLeaf: boolean;
}

/** Preset configurations for each fruit type — derived from original Python params */
export const FRUIT_CONFIGS: Record<FruitType, FruitConfig> = {
  Apple: {
    name: 'Apple',
    scaleMultiplier: 1.0,
    baseColorHsv: [0.0, 0.95, 0.8],
    altColorHsv: [0.05, 0.9, 0.75],
    stemColorHsv: [0.1, 0.6, 0.2],
    roughness: 0.5,
    hasStem: true,
    hasLeaf: true,
  },
  Strawberry: {
    name: 'Strawberry',
    scaleMultiplier: 0.5,
    baseColorHsv: [0.0, 0.95, 0.85],
    altColorHsv: [0.05, 0.8, 0.7],
    stemColorHsv: [0.28, 0.7, 0.4],
    roughness: 0.7,
    hasStem: true,
    hasLeaf: false,
  },
  Starfruit: {
    name: 'Starfruit',
    scaleMultiplier: 1.0,
    baseColorHsv: [0.12, 0.95, 0.8],
    altColorHsv: [0.16, 0.85, 0.6],
    stemColorHsv: [0.1, 0.6, 0.2],
    roughness: 0.6,
    hasStem: true,
    hasLeaf: false,
  },
  Coconut: {
    name: 'Coconut',
    scaleMultiplier: 1.5,
    baseColorHsv: [0.235, 0.6, 0.4],
    altColorHsv: [0.28, 0.5, 0.27],
    stemColorHsv: [0.28, 0.7, 0.27],
    roughness: 0.95,
    hasStem: true,
    hasLeaf: false,
  },
  Durian: {
    name: 'Durian',
    scaleMultiplier: 2.0,
    baseColorHsv: [0.15, 0.7, 0.32],
    altColorHsv: [0.09, 0.8, 0.24],
    stemColorHsv: [0.1, 0.6, 0.2],
    roughness: 0.85,
    hasStem: true,
    hasLeaf: false,
  },
  Pineapple: {
    name: 'Pineapple',
    scaleMultiplier: 1.0,
    baseColorHsv: [0.12, 0.8, 0.7],
    altColorHsv: [0.1, 0.7, 0.5],
    stemColorHsv: [0.25, 0.7, 0.3],
    roughness: 0.75,
    hasStem: true,
    hasLeaf: false,
  },
  Blackberry: {
    name: 'Blackberry',
    scaleMultiplier: 0.3,
    baseColorHsv: [0.8, 0.7, 0.25],
    altColorHsv: [0.75, 0.6, 0.2],
    stemColorHsv: [0.28, 0.5, 0.25],
    roughness: 0.8,
    hasStem: true,
    hasLeaf: false,
  },
  Banana: {
    name: 'Banana',
    scaleMultiplier: 0.8,
    baseColorHsv: [0.14, 0.8, 0.85],
    altColorHsv: [0.11, 0.7, 0.7],
    stemColorHsv: [0.15, 0.5, 0.4],
    roughness: 0.55,
    hasStem: true,
    hasLeaf: false,
  },
  Orange: {
    name: 'Orange',
    scaleMultiplier: 1.0,
    baseColorHsv: [0.07, 0.9, 0.9],
    altColorHsv: [0.05, 0.8, 0.8],
    stemColorHsv: [0.25, 0.6, 0.3],
    roughness: 0.8,
    hasStem: true,
    hasLeaf: true,
  },
  Lemon: {
    name: 'Lemon',
    scaleMultiplier: 0.8,
    baseColorHsv: [0.15, 0.7, 0.9],
    altColorHsv: [0.13, 0.6, 0.8],
    stemColorHsv: [0.2, 0.5, 0.35],
    roughness: 0.6,
    hasStem: true,
    hasLeaf: false,
  },
  Peach: {
    name: 'Peach',
    scaleMultiplier: 0.9,
    baseColorHsv: [0.05, 0.7, 0.9],
    altColorHsv: [0.08, 0.5, 0.85],
    stemColorHsv: [0.1, 0.5, 0.25],
    roughness: 0.85,
    hasStem: true,
    hasLeaf: true,
  },
  Pear: {
    name: 'Pear',
    scaleMultiplier: 1.0,
    baseColorHsv: [0.18, 0.6, 0.7],
    altColorHsv: [0.15, 0.5, 0.6],
    stemColorHsv: [0.1, 0.6, 0.2],
    roughness: 0.6,
    hasStem: true,
    hasLeaf: true,
  },
  Cherry: {
    name: 'Cherry',
    scaleMultiplier: 0.35,
    baseColorHsv: [0.0, 0.9, 0.7],
    altColorHsv: [0.98, 0.8, 0.6],
    stemColorHsv: [0.25, 0.5, 0.3],
    roughness: 0.5,
    hasStem: true,
    hasLeaf: false,
  },
  Grape: {
    name: 'Grape',
    scaleMultiplier: 0.25,
    baseColorHsv: [0.75, 0.7, 0.55],
    altColorHsv: [0.8, 0.6, 0.45],
    stemColorHsv: [0.25, 0.5, 0.3],
    roughness: 0.6,
    hasStem: true,
    hasLeaf: false,
  },
  Mango: {
    name: 'Mango',
    scaleMultiplier: 1.0,
    baseColorHsv: [0.1, 0.85, 0.9],
    altColorHsv: [0.15, 0.7, 0.75],
    stemColorHsv: [0.2, 0.5, 0.3],
    roughness: 0.65,
    hasStem: true,
    hasLeaf: false,
  },
};

/** Options for fruit generation */
export interface FruitGeneratorOptions {
  /** Which fruit type to generate (random if not specified) */
  fruitType?: FruitType;
  /** Level of detail (0 = highest) */
  lod?: number;
  /** Scale multiplier for the entire fruit (default: 1) */
  scale?: number;
  /** Whether to include the stem (default: true) */
  includeStem?: boolean;
  /** Whether to include surface detail displacement (default: true) */
  includeSurfaceDetail?: boolean;
}

// ============================================================================
// Material helpers
// ============================================================================

/** Cached fruit body materials keyed by color hex */
const fruitMaterialCache = new Map<number, THREE.MeshStandardMaterial>();

/**
 * Create or retrieve a fruit body material from HSV parameters.
 * Perturbs the HSV slightly using the RNG for natural variation,
 * matching the original's normal() noise on HSV components.
 */
function getFruitBodyMaterial(
  rng: SeededRandom,
  config: FruitConfig,
): THREE.MeshStandardMaterial {
  const h = config.baseColorHsv[0] + rng.gaussian(0, 0.02);
  const s = Math.max(0, Math.min(1, config.baseColorHsv[1] + rng.gaussian(0, 0.05)));
  const v = Math.max(0, Math.min(1, config.baseColorHsv[2] + rng.gaussian(0, 0.05)));
  const rgb = hsvToRgb(((h % 1) + 1) % 1, s, v);
  const color = new THREE.Color(rgb.r, rgb.g, rgb.b);
  const hex = color.getHex();

  if (!fruitMaterialCache.has(hex)) {
    fruitMaterialCache.set(hex, new THREE.MeshStandardMaterial({
      color,
      roughness: config.roughness,
      metalness: 0.0,
    }));
  }
  return fruitMaterialCache.get(hex)!;
}

/**
 * Create a stem material from the config's stem HSV.
 */
function getStemMaterial(rng: SeededRandom, config: FruitConfig): THREE.MeshStandardMaterial {
  const h = config.stemColorHsv[0] + rng.gaussian(0, 0.02);
  const s = Math.max(0, Math.min(1, config.stemColorHsv[1] + rng.gaussian(0, 0.05)));
  const v = Math.max(0, Math.min(1, config.stemColorHsv[2] + rng.gaussian(0, 0.05)));
  const rgb = hsvToRgb(((h % 1) + 1) % 1, s, v);
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(rgb.r, rgb.g, rgb.b),
    roughness: 0.7,
    metalness: 0.0,
  });
}

/** Leaf material (green) */
function getLeafMaterial(rng: SeededRandom): THREE.MeshStandardMaterial {
  const h = rng.uniform(0.25, 0.35);
  const s = rng.uniform(0.6, 0.8);
  const v = rng.uniform(0.3, 0.5);
  const rgb = hsvToRgb(h, s, v);
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(rgb.r, rgb.g, rgb.b),
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

// ============================================================================
// Geometry utility helpers
// ============================================================================

/**
 * Apply noise displacement to vertices along their normals.
 * Approximates the original's surface_bump / noise displacement nodes.
 */
function applyNoiseDisplacement(
  geometry: THREE.BufferGeometry,
  seed: number,
  amplitude: number,
  frequency: number = 5.0,
): void {
  const posAttr = geometry.attributes.position;
  const normalAttr = geometry.attributes.normal;
  if (!posAttr || !normalAttr) return;

  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    normal.fromBufferAttribute(normalAttr, i);

    // Simple deterministic noise using sine-based hash
    const nx = Math.sin(vertex.x * frequency + seed * 0.1) * 0.5 +
               Math.sin(vertex.y * frequency * 1.3 + seed * 0.3) * 0.3 +
               Math.sin(vertex.z * frequency * 0.7 + seed * 0.2) * 0.2;
    const displacement = nx * amplitude;

    vertex.addScaledVector(normal, displacement);
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
}

/**
 * Apply spherical dimple/bump displacement.
 * Approximates the original's crater / bump node for oranges, coconuts, etc.
 */
function applyDimpleDisplacement(
  geometry: THREE.BufferGeometry,
  rng: SeededRandom,
  count: number,
  radius: number,
  depth: number,
): void {
  const posAttr = geometry.attributes.position;
  const normalAttr = geometry.attributes.normal;
  if (!posAttr || !normalAttr) return;

  // Generate random dimple centers on unit sphere
  const dimpleCenters: THREE.Vector3[] = [];
  for (let d = 0; d < count; d++) {
    const theta = rng.uniform(0, Math.PI * 2);
    const phi = Math.acos(rng.uniform(-1, 1));
    dimpleCenters.push(new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
    ));
  }

  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    normal.fromBufferAttribute(normalAttr, i);

    const vertNorm = vertex.clone().normalize();
    let totalDisp = 0;

    for (const center of dimpleCenters) {
      const dist = vertNorm.distanceTo(center);
      if (dist < radius) {
        const t = 1 - dist / radius;
        totalDisp -= depth * t * t;
      }
    }

    vertex.addScaledVector(normal, totalDisp);
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
}

/**
 * Create a basic stem (cylinder with slight curve).
 * Ported from the original's basic_stem node group.
 */
function createBasicStem(
  rng: SeededRandom,
  config: FruitConfig,
  height: number,
  radius: number,
): THREE.Group {
  const group = new THREE.Group();
  const stemMat = getStemMaterial(rng, config);

  const stemHeight = height * rng.uniform(0.15, 0.25);
  const stemRadius = radius * rng.uniform(0.03, 0.05);
  const midOffsetX = rng.uniform(-0.05, 0.05);
  const midOffsetZ = rng.uniform(-0.05, 0.05);

  // Build stem as a curved path
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(midOffsetX, stemHeight * 0.5, midOffsetZ),
    new THREE.Vector3(rng.uniform(-0.1, 0.1), stemHeight, rng.uniform(-0.1, 0.1)),
  );
  const tubeGeo = new THREE.TubeGeometry(curve, 8, stemRadius, 6, false);
  const stem = new THREE.Mesh(tubeGeo, stemMat);
  stem.castShadow = true;
  group.add(stem);

  return group;
}

/**
 * Create a leaf geometry (flat elliptical shape with a midrib).
 */
function createLeaf(rng: SeededRandom, size: number = 0.12): THREE.Mesh {
  const leafMat = getLeafMaterial(rng);

  // Create leaf shape using Shape
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(size * 0.4, size * 0.3, size, 0);
  shape.quadraticCurveTo(size * 0.4, -size * 0.3, 0, 0);

  const leafGeo = new THREE.ShapeGeometry(shape, 4);
  const leaf = new THREE.Mesh(leafGeo, leafMat);

  // Rotate to be roughly horizontal with slight tilt
  leaf.rotation.x = -Math.PI / 2 + rng.uniform(-0.3, 0.1);
  leaf.rotation.z = rng.uniform(0, Math.PI * 2);
  leaf.position.y = rng.uniform(0.02, 0.05);

  return leaf;
}

/**
 * Create a calyx stem (star-shaped green cap).
 * Ported from the original's calyx_stem node group, used for strawberry.
 */
function createCalyxStem(
  rng: SeededRandom,
  config: FruitConfig,
  radius: number,
): THREE.Group {
  const group = new THREE.Group();
  const stemMat = getStemMaterial(rng, config);

  // Calyx: small elongated leaves arranged in a circle
  const forkNumber = rng.nextInt(8, 12);
  const outerRadius = radius * rng.uniform(0.7, 0.9);

  for (let i = 0; i < forkNumber; i++) {
    const angle = (i / forkNumber) * Math.PI * 2;
    const leafLength = outerRadius * rng.uniform(0.4, 0.7);
    const leafWidth = leafLength * 0.25;

    // Create a thin pointed sepal
    const sepalShape = new THREE.Shape();
    sepalShape.moveTo(0, 0);
    sepalShape.quadraticCurveTo(leafWidth, leafLength * 0.4, 0, leafLength);
    sepalShape.quadraticCurveTo(-leafWidth, leafLength * 0.4, 0, 0);

    const sepalGeo = new THREE.ShapeGeometry(sepalShape, 3);
    const sepal = new THREE.Mesh(sepalGeo, stemMat);
    sepal.castShadow = true;

    // Position at the top, angled outward
    sepal.position.set(
      Math.cos(angle) * outerRadius * 0.15,
      0,
      Math.sin(angle) * outerRadius * 0.15,
    );
    sepal.rotation.set(
      -Math.PI / 3 + rng.uniform(-0.2, 0.2),
      angle,
      0,
    );

    group.add(sepal);
  }

  // Small stem above the calyx
  const stemHeight = rng.uniform(0.08, 0.15);
  const stemRadius2 = rng.uniform(0.015, 0.025);
  const stemGeo = new THREE.CylinderGeometry(stemRadius2 * 0.7, stemRadius2, stemHeight, 6);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.y = stemHeight / 2;
  stem.castShadow = true;
  group.add(stem);

  return group;
}

// ============================================================================
// Individual fruit generators
// ============================================================================

/**
 * Generate an Apple: sphere with top/bottom indentations, stem, optional leaf.
 *
 * Ported from FruitFactoryApple which uses:
 *   - circle_cross_section with radius ~1.5
 *   - shape_quadratic with 5 control points producing the classic apple silhouette
 *   - apple_surface with two HSV colors for color variation
 *   - basic_stem at z=0.6 with cross_radius ~0.03
 */
function generateApple(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.15, 0.005);

  // Build apple profile using LatheGeometry
  // Control points from original: (0,0), (0.12,0.43), (0.47,0.66), (0.89,0.42), (1.0,0.0)
  const segments = 24;
  const points: THREE.Vector2[] = [];
  const controlPoints = [
    [0.0, 0.0],
    [0.12, 0.43],
    [0.47, 0.66],
    [0.89, 0.42],
    [1.0, 0.0],
  ];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Interpolate through control points using smoothstep
    let r = 0;
    for (let c = 0; c < controlPoints.length - 1; c++) {
      const [t0, r0] = controlPoints[c];
      const [t1, r1] = controlPoints[c + 1];
      if (t >= t0 && t <= t1) {
        const localT = (t - t0) / (t1 - t0);
        const st = localT * localT * (3 - 2 * localT);
        r = r0 + (r1 - r0) * st;
        break;
      }
    }
    points.push(new THREE.Vector2(Math.max(0.001, r * baseRadius), t * baseRadius * 2));
  }

  const bodyGeo = new THREE.LatheGeometry(points, 16);

  // Apply top and bottom indentations (classic apple shape)
  const posAttr = bodyGeo.attributes.position;
  const normalAttr = bodyGeo.attributes.normal;
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    normal.fromBufferAttribute(normalAttr!, i);

    // Top indentation (t near 1)
    const t = vertex.y / (baseRadius * 2);
    if (t > 0.85) {
      const indentStrength = (t - 0.85) / 0.15;
      vertex.addScaledVector(normal, -indentStrength * baseRadius * 0.2);
    }
    // Bottom indentation (t near 0)
    if (t < 0.1) {
      const indentStrength = (0.1 - t) / 0.1;
      vertex.addScaledVector(normal, -indentStrength * baseRadius * 0.15);
    }

    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  bodyGeo.computeVertexNormals();

  // Subtle noise for organic feel
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.003, 8.0);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Stem
  const stem = createBasicStem(rng, config, baseRadius * 2, baseRadius);
  stem.position.y = baseRadius * 2 * 0.85;
  group.add(stem);

  // Optional leaf
  if (config.hasLeaf && rng.boolean(0.8)) {
    const leaf = createLeaf(rng, baseRadius * 0.6);
    leaf.position.y = baseRadius * 2 * 0.9;
    group.add(leaf);
  }

  return group;
}

/**
 * Generate a Strawberry: cone-like shape with seed bumps and green calyx cap.
 *
 * Ported from FruitFactoryStrawberry which uses:
 *   - circle_cross_section with radius ~1.0
 *   - shape_quadratic with 6 control points producing wide bottom tapering to tip
 *   - strawberry_surface with crater-like seed indentations
 *   - calyx_stem with 8-12 fork sepals
 */
function generateStrawberry(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.08, 0.002);
  const height = baseRadius * 3;

  // Build strawberry profile: wide middle tapering to point
  const segments = 24;
  const points: THREE.Vector2[] = [];
  const controlPoints: [number, number][] = [
    [0.0, 0.0],
    [0.02, 0.13],
    [0.22, 0.44],
    [rng.uniform(0.55, 0.7), rng.uniform(0.7, 0.78)],
    [0.93, 0.47],
    [1.0, 0.0],
  ];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let r = 0;
    for (let c = 0; c < controlPoints.length - 1; c++) {
      const [t0, r0] = controlPoints[c];
      const [t1, r1] = controlPoints[c + 1];
      if (t >= t0 && t <= t1) {
        const localT = (t - t0) / (t1 - t0);
        const st = localT * localT * (3 - 2 * localT);
        r = r0 + (r1 - r0) * st;
        break;
      }
    }
    points.push(new THREE.Vector2(Math.max(0.001, r * baseRadius), t * height));
  }

  const bodyGeo = new THREE.LatheGeometry(points, 16);

  // Apply seed bump craters (strawberry surface)
  applyDimpleDisplacement(bodyGeo, new SeededRandom(rng.nextInt(0, 9999)), 40, 0.2, baseRadius * 0.04);

  // Subtle position noise (matching original's noise amount pos)
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.005, 10.0);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Calyx (green cap) at the top
  const calyx = createCalyxStem(rng, config, baseRadius);
  calyx.position.y = height * 0.97;
  group.add(calyx);

  return group;
}

/**
 * Generate a Starfruit: star cross-section extruded along a tapered shape.
 *
 * Ported from FruitFactoryStarfruit which uses:
 *   - star_cross_section with radius ~1.3
 *   - shape_quadratic with 5 control points
 *   - starfruit_surface with dent and ridge colors
 *   - basic_stem at z=0.8
 */
function generateStarfruit(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.12, 0.005);
  const length = baseRadius * 3;

  // Create star cross-section shape
  const starPoints = 5;
  const outerRadius = baseRadius;
  const innerRadius = baseRadius * 0.45;
  const starShape = new THREE.Shape();

  for (let i = 0; i < starPoints * 2; i++) {
    const angle = (i / (starPoints * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) {
      starShape.moveTo(x, y);
    } else {
      starShape.lineTo(x, y);
    }
  }
  starShape.closePath();

  // Extrude with a slight taper — matching the original's shape_quadratic
  const extrudeDepth = length;
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: baseRadius * 0.05,
    bevelSize: baseRadius * 0.03,
    bevelSegments: 2,
    steps: 8,
  };

  const bodyGeo = new THREE.ExtrudeGeometry(starShape, extrudeSettings);

  // Apply dent displacement along the ridges
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.005, 6.0);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;

  // Rotate to stand upright with stem at top
  body.rotation.x = -Math.PI / 2;
  body.position.y = 0;

  // Taper the ends: scale vertices at the extremes inward
  const posAttr = bodyGeo.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    // Z is the extrusion direction; taper toward both ends
    const zNorm = vertex.z / extrudeDepth;
    const taperFactor = 1.0 - 0.4 * Math.pow(Math.abs(zNorm - 0.5) * 2, 2);
    vertex.x *= taperFactor;
    vertex.y *= taperFactor;
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  bodyGeo.computeVertexNormals();

  group.add(body);

  // Stem at the top
  const stem = createBasicStem(rng, config, length * 0.8, baseRadius * 0.5);
  stem.position.y = length * 0.5;
  group.add(stem);

  return group;
}

/**
 * Generate a Coconut: large sphere with coarse fibrous texture.
 *
 * Ported from FruitFactoryCoconutgreen which uses:
 *   - coconut_cross_section with noise for fiber texture
 *   - shape_quadratic with 6 control points producing the oval coconut shape
 *   - coconutgreen_surface with basic and bottom colors
 *   - coconut_stem with calyx-like cap
 */
function generateCoconut(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.18, 0.01);
  const height = baseRadius * 1.4;

  // Build coconut profile — wide oval
  const segments = 20;
  const points: THREE.Vector2[] = [];
  const controlPoints: [number, number][] = [
    [0.0, 0.0],
    [0.06, 0.32],
    [rng.uniform(0.2, 0.3), 0.61],
    [rng.uniform(0.6, 0.7), 0.68],
    [0.96, 0.36],
    [1.0, 0.0],
  ];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let r = 0;
    for (let c = 0; c < controlPoints.length - 1; c++) {
      const [t0, r0] = controlPoints[c];
      const [t1, r1] = controlPoints[c + 1];
      if (t >= t0 && t <= t1) {
        const localT = (t - t0) / (t1 - t0);
        const st = localT * localT * (3 - 2 * localT);
        r = r0 + (r1 - r0) * st;
        break;
      }
    }
    points.push(new THREE.Vector2(Math.max(0.001, r * baseRadius), t * height));
  }

  const bodyGeo = new THREE.LatheGeometry(points, 20);

  // Coarse fiber texture: strong noise displacement
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.008, 20.0);

  // Add slight dimples for the fibrous look
  applyDimpleDisplacement(bodyGeo, new SeededRandom(rng.nextInt(0, 9999)), 25, 0.3, baseRadius * 0.02);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Coconut stem cap (3-5 small triangular husk pieces at top)
  const stemMat = getStemMaterial(rng, config);
  const capCount = rng.nextInt(3, 5);
  for (let i = 0; i < capCount; i++) {
    const angle = (i / capCount) * Math.PI * 2;
    const capGeo = new THREE.ConeGeometry(baseRadius * 0.12, baseRadius * 0.15, 4);
    const cap = new THREE.Mesh(capGeo, stemMat);
    cap.position.set(
      Math.cos(angle) * baseRadius * 0.1,
      height * 0.96,
      Math.sin(angle) * baseRadius * 0.1,
    );
    cap.rotation.z = Math.cos(angle) * 0.3;
    cap.rotation.x = Math.sin(angle) * 0.3;
    cap.castShadow = true;
    group.add(cap);
  }

  // Small stem at very top
  const stemGeo = new THREE.CylinderGeometry(0.01, 0.015, 0.06, 6);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.y = height + 0.02;
  stem.castShadow = true;
  group.add(stem);

  return group;
}

/**
 * Generate a Durian: large sphere with spike protrusions.
 *
 * Ported from FruitFactoryDurian which uses:
 *   - circle_cross_section with radius ~1.2
 *   - shape_quadratic with strong tilt noise
 *   - durian_surface with thorn displacement (~0.25-0.35)
 *   - basic_stem with thick cross_radius
 */
function generateDurian(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.2, 0.006);
  const height = baseRadius * 1.6;

  // Build durian profile
  const segments = 20;
  const points: THREE.Vector2[] = [];
  const controlPoints: [number, number][] = [
    [0.0, 0.003],
    [0.08, 0.35],
    [rng.uniform(0.4, 0.6), 0.8],
    [0.89, 0.61],
    [1.0, 0.0],
  ];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let r = 0;
    for (let c = 0; c < controlPoints.length - 1; c++) {
      const [t0, r0] = controlPoints[c];
      const [t1, r1] = controlPoints[c + 1];
      if (t >= t0 && t <= t1) {
        const localT = (t - t0) / (t1 - t0);
        const st = localT * localT * (3 - 2 * localT);
        r = r0 + (r1 - r0) * st;
        break;
      }
    }
    points.push(new THREE.Vector2(Math.max(0.001, r * baseRadius), t * height));
  }

  const bodyGeo = new THREE.LatheGeometry(points, 16);

  // Subtle tilt noise
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.004, 5.0);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Durian spikes: cones distributed on the surface
  const spikeMat = getFruitBodyMaterial(new SeededRandom(rng.nextInt(0, 9999)), {
    ...config,
    baseColorHsv: config.altColorHsv ?? config.baseColorHsv,
  });
  const spikeCount = rng.nextInt(40, 70);
  const spikeGeo = new THREE.ConeGeometry(baseRadius * 0.04, baseRadius * rng.uniform(0.2, 0.35), 5);
  spikeGeo.translate(0, baseRadius * 0.15, 0);

  for (let i = 0; i < spikeCount; i++) {
    const theta = rng.uniform(0, Math.PI * 2);
    const phi = Math.acos(rng.uniform(-1, 1));
    const sx = Math.sin(phi) * Math.cos(theta) * baseRadius * 0.85;
    const sy = Math.sin(phi) * Math.sin(theta) * baseRadius * 0.85 + height * 0.5;
    const sz = Math.cos(phi) * baseRadius * 0.85;

    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    spike.position.set(sx, sy, sz);

    // Orient spike outward from center
    const dir = new THREE.Vector3(sx, sy - height * 0.5, sz).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    spike.quaternion.setFromUnitVectors(up, dir);

    // Random scale variation
    const s = rng.uniform(0.6, 1.0);
    spike.scale.set(s, s, s);
    spike.castShadow = true;
    group.add(spike);
  }

  // Thick stem
  const stemMat = getStemMaterial(rng, config);
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.1, 6);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.y = height * 0.95;
  stem.castShadow = true;
  group.add(stem);

  return group;
}

/**
 * Generate a Pineapple: cylinder with diamond pattern and crown of leaves.
 *
 * Ported from the original pineapple surface with diamond eye pattern
 * and pineapple_stem (crown of leaves).
 */
function generatePineapple(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.1, 0.005);
  const height = baseRadius * 3.5;

  // Build pineapple body as a slightly tapered cylinder
  const segments = 24;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let r = baseRadius;
    // Slight bulge in middle, narrower at top and bottom
    r *= 1.0 - 0.15 * Math.pow(t - 0.45, 2) * 4;
    if (t < 0.08) r *= t / 0.08;
    if (t > 0.95) r *= (1 - t) / 0.05;
    points.push(new THREE.Vector2(Math.max(0.001, r), t * height));
  }

  const bodyGeo = new THREE.LatheGeometry(points, 16);

  // Diamond pattern: apply faceted bumps
  const posAttr = bodyGeo.attributes.position;
  const normalAttr = bodyGeo.attributes.normal;
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    normal.fromBufferAttribute(normalAttr!, i);

    // Diamond pattern using angle and height
    const angle = Math.atan2(vertex.z, vertex.x);
    const yNorm = vertex.y / height;
    const diamondFreq = 12;

    // Create diamond/hex pattern
    const diamondX = Math.sin(angle * diamondFreq) * 0.5 + 0.5;
    const diamondY = Math.sin(yNorm * diamondFreq * Math.PI * 2) * 0.5 + 0.5;
    const diamond = Math.abs(diamondX - 0.5) + Math.abs(diamondY - 0.5);

    // Indent between diamonds, slight bump on diamond
    const bump = (diamond > 0.3 ? 1 : -1) * baseRadius * 0.02;
    vertex.addScaledVector(normal, bump);
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  bodyGeo.computeVertexNormals();

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Crown of leaves at the top
  const crownGroup = new THREE.Group();
  const leafMat = getLeafMaterial(rng);
  const crownLeafCount = rng.nextInt(8, 14);

  for (let i = 0; i < crownLeafCount; i++) {
    const angle = (i / crownLeafCount) * Math.PI * 2 + rng.uniform(-0.15, 0.15);
    const leafLength = rng.uniform(0.12, 0.2);
    const leafWidth = leafLength * 0.15;

    // Create leaf shape
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.quadraticCurveTo(leafWidth, leafLength * 0.3, 0, leafLength);
    leafShape.quadraticCurveTo(-leafWidth, leafLength * 0.3, 0, 0);

    const leafGeo = new THREE.ShapeGeometry(leafShape, 3);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.castShadow = true;

    // Position around the top, angling outward and upward
    leaf.position.set(
      Math.cos(angle) * baseRadius * 0.2,
      0,
      Math.sin(angle) * baseRadius * 0.2,
    );
    leaf.rotation.set(
      -Math.PI / 4 + rng.uniform(-0.2, 0.2),
      angle,
      rng.uniform(-0.1, 0.1),
    );

    crownGroup.add(leaf);
  }

  crownGroup.position.y = height;
  group.add(crownGroup);

  return group;
}

/**
 * Generate a Blackberry: cluster of small drupelet spheres.
 *
 * Approximated as a rough sphere made up of many small spheres,
 * matching the original's blackberry_surface with aggregated drupelets.
 */
function generateBlackberry(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.06, 0.003);
  const bodyMat = getFruitBodyMaterial(rng, config);

  // Central sphere
  const centerGeo = new THREE.SphereGeometry(baseRadius * 0.7, 10, 8);
  const center = new THREE.Mesh(centerGeo, bodyMat);
  center.castShadow = true;
  center.receiveShadow = true;
  group.add(center);

  // Surrounding drupelet spheres
  const drupeletCount = rng.nextInt(15, 25);
  const drupeletGeo = new THREE.SphereGeometry(baseRadius * 0.3, 6, 5);

  for (let i = 0; i < drupeletCount; i++) {
    const theta = rng.uniform(0, Math.PI * 2);
    const phi = Math.acos(rng.uniform(-0.8, 1.0)); // More on top hemisphere
    const r = baseRadius * rng.uniform(0.5, 0.85);

    const drupelet = new THREE.Mesh(drupeletGeo, bodyMat);
    drupelet.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta) + baseRadius * 0.2,
      r * Math.cos(phi),
    );
    const s = rng.uniform(0.7, 1.2);
    drupelet.scale.set(s, s, s);
    drupelet.castShadow = true;
    group.add(drupelet);
  }

  // Small stem
  const stem = createBasicStem(rng, config, baseRadius * 2, baseRadius);
  stem.position.y = baseRadius * 0.9;
  group.add(stem);

  return group;
}

/**
 * Generate a Banana: curved cylinder with tapered ends.
 *
 * The banana is built as a curved tube geometry.
 */
function generateBanana(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const length = rng.uniform(0.18, 0.25);
  const radius = length * 0.15;

  // Build banana curve — a gentle arc
  const curvePoints: THREE.Vector3[] = [];
  const curveSegments = 12;
  const curvature = rng.uniform(0.3, 0.6);

  for (let i = 0; i <= curveSegments; i++) {
    const t = i / curveSegments;
    const x = t * length;
    const y = Math.sin(t * Math.PI) * curvature * length * 0.3;
    const z = 0;
    curvePoints.push(new THREE.Vector3(x - length / 2, y, z));
  }

  const curve = new THREE.CatmullRomCurve3(curvePoints);

  // Tapered tube: use custom radius function via multiple short segments
  // Three.js TubeGeometry doesn't support variable radius, so we approximate
  // with a LatheGeometry-like approach: build segments manually

  const tubularSegments = 16;
  const radialSegments = 8;
  const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);

  // Apply tapering at both ends
  const posAttr = tubeGeo.attributes.position;
  const vertex = new THREE.Vector3();
  const bbox = new THREE.Box3().setFromBufferAttribute(posAttr as THREE.BufferAttribute);
  const xRange = bbox.max.x - bbox.min.x;

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    const xNorm = (vertex.x - bbox.min.x) / xRange;
    // Taper at both ends
    let taper = 1.0;
    if (xNorm < 0.15) taper = xNorm / 0.15;
    if (xNorm > 0.85) taper = (1 - xNorm) / 0.15;
    taper = Math.max(0.3, taper);

    // Scale XZ around the curve center
    const centerX = vertex.x;
    vertex.y = (vertex.y - curve.getPointAt(Math.max(0, Math.min(1, xNorm))).y) * taper
              + curve.getPointAt(Math.max(0, Math.min(1, xNorm))).y;
    vertex.z *= taper;

    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  tubeGeo.computeVertexNormals();

  // Subtle ridges along the banana length
  applyNoiseDisplacement(tubeGeo, rng.nextInt(0, 10000), 0.002, 3.0);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(tubeGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Stem at the top (curved end)
  const stemMat = getStemMaterial(rng, config);
  const stemGeo = new THREE.CylinderGeometry(radius * 0.2, radius * 0.4, length * 0.08, 5);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.set(length / 2 * 0.95, curvature * length * 0.3 * Math.sin(0.95 * Math.PI), 0);
  stem.rotation.z = -0.3;
  stem.castShadow = true;
  group.add(stem);

  // Rotate to stand upright with stem at top
  group.rotation.z = -Math.PI / 6;

  return group;
}

/**
 * Generate an Orange: sphere with dimpled/pebbly surface.
 *
 * Uses dimple displacement to simulate the orange peel texture,
 * approximating the original's bump noise node.
 */
function generateOrange(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.1, 0.005);

  const bodyGeo = new THREE.SphereGeometry(baseRadius, 20, 16);

  // Dimpled orange peel surface
  applyDimpleDisplacement(bodyGeo, new SeededRandom(rng.nextInt(0, 9999)), 50, 0.15, baseRadius * 0.015);
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.003, 15.0);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Navel (small bump at bottom)
  const navelGeo = new THREE.SphereGeometry(baseRadius * 0.08, 6, 4);
  const navel = new THREE.Mesh(navelGeo, bodyMat);
  navel.position.y = -baseRadius * 0.95;
  navel.scale.y = 0.5;
  navel.castShadow = true;
  group.add(navel);

  // Stem
  const stem = createBasicStem(rng, config, baseRadius * 2, baseRadius);
  stem.position.y = baseRadius * 0.9;
  group.add(stem);

  // Optional leaf
  if (config.hasLeaf && rng.boolean(0.7)) {
    const leaf = createLeaf(rng, baseRadius * 0.5);
    leaf.position.y = baseRadius * 0.95;
    group.add(leaf);
  }

  return group;
}

/**
 * Generate a Lemon: elongated ellipsoid with pointy ends.
 */
function generateLemon(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.07, 0.003);
  const length = baseRadius * 2.5;

  // Build lemon profile
  const segments = 20;
  const points: THREE.Vector2[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Lemon: elongated with pointed ends
    let r = Math.sin(t * Math.PI) * baseRadius;
    // Sharpen the tips
    const tipSharpness = 1.5;
    if (t < 0.15) r *= Math.pow(t / 0.15, tipSharpness);
    if (t > 0.85) r *= Math.pow((1 - t) / 0.15, tipSharpness);
    points.push(new THREE.Vector2(Math.max(0.001, r), t * length));
  }

  const bodyGeo = new THREE.LatheGeometry(points, 16);
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.002, 8.0);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Small stem at top
  const stemMat = getStemMaterial(rng, config);
  const stemGeo = new THREE.CylinderGeometry(0.005, 0.008, 0.03, 5);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.y = length * 0.98;
  stem.castShadow = true;
  group.add(stem);

  return group;
}

/**
 * Generate a Peach: sphere with a vertical crease and fuzzy surface.
 */
function generatePeach(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.1, 0.005);

  const bodyGeo = new THREE.SphereGeometry(baseRadius, 20, 16);

  // Peach crease: indent along one vertical line
  const posAttr = bodyGeo.attributes.position;
  const normalAttr = bodyGeo.attributes.normal;
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    normal.fromBufferAttribute(normalAttr!, i);

    const angle = Math.atan2(vertex.z, vertex.x);
    // Crease along one meridian
    const creaseDist = Math.abs(Math.sin(angle));
    if (creaseDist < 0.15) {
      const indent = (1 - creaseDist / 0.15) * baseRadius * 0.15;
      vertex.addScaledVector(normal, -indent);
    }

    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  bodyGeo.computeVertexNormals();

  // Fuzzy surface: very fine noise
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.003, 25.0);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Stem
  const stem = createBasicStem(rng, config, baseRadius * 2, baseRadius);
  stem.position.y = baseRadius * 0.9;
  group.add(stem);

  // Leaf
  if (config.hasLeaf && rng.boolean(0.7)) {
    const leaf = createLeaf(rng, baseRadius * 0.5);
    leaf.position.y = baseRadius * 0.95;
    group.add(leaf);
  }

  return group;
}

/**
 * Generate a Pear: wide bottom narrowing to the top (classic pear silhouette).
 */
function generatePear(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.1, 0.004);
  const height = baseRadius * 3;

  // Build pear profile: wide at bottom, narrow at top
  const segments = 24;
  const points: THREE.Vector2[] = [];
  const controlPoints: [number, number][] = [
    [0.0, 0.0],
    [0.08, 0.3],
    [0.3, 0.7],
    [0.5, 0.65],
    [0.7, 0.4],
    [0.9, 0.35],
    [1.0, 0.0],
  ];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let r = 0;
    for (let c = 0; c < controlPoints.length - 1; c++) {
      const [t0, r0] = controlPoints[c];
      const [t1, r1] = controlPoints[c + 1];
      if (t >= t0 && t <= t1) {
        const localT = (t - t0) / (t1 - t0);
        const st = localT * localT * (3 - 2 * localT);
        r = r0 + (r1 - r0) * st;
        break;
      }
    }
    points.push(new THREE.Vector2(Math.max(0.001, r * baseRadius), t * height));
  }

  const bodyGeo = new THREE.LatheGeometry(points, 16);
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.002, 6.0);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Stem
  const stem = createBasicStem(rng, config, height, baseRadius);
  stem.position.y = height * 0.9;
  group.add(stem);

  // Optional leaf
  if (config.hasLeaf && rng.boolean(0.8)) {
    const leaf = createLeaf(rng, baseRadius * 0.5);
    leaf.position.y = height * 0.92;
    group.add(leaf);
  }

  return group;
}

/**
 * Generate a Cherry: small sphere with curved stem.
 */
function generateCherry(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.035, 0.003);

  const bodyGeo = new THREE.SphereGeometry(baseRadius, 14, 10);
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.001, 10.0);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Curved stem
  const stemMat = getStemMaterial(rng, config);
  const stemCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, baseRadius * 0.8, 0),
    new THREE.Vector3(rng.uniform(-0.03, 0.03), baseRadius * 3, rng.uniform(-0.02, 0.02)),
    new THREE.Vector3(rng.uniform(-0.04, 0.04), baseRadius * 4.5, 0),
  );
  const stemGeo = new THREE.TubeGeometry(stemCurve, 8, 0.004, 4, false);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.castShadow = true;
  group.add(stem);

  return group;
}

/**
 * Generate a Grape: cluster of small spheres on a stem.
 */
function generateGrape(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const berryRadius = rng.gaussian(0.015, 0.002);
  const bodyMat = getFruitBodyMaterial(rng, config);

  // Build grape cluster: triangular arrangement of berries
  const rows = rng.nextInt(4, 6);
  const berryGeo = new THREE.SphereGeometry(berryRadius, 8, 6);

  for (let row = 0; row < rows; row++) {
    const rowT = row / (rows - 1);
    const berriesInRow = Math.max(1, Math.round((1 - rowT * 0.6) * 5));
    const rowRadius = (1 - rowT * 0.5) * berryRadius * 4;

    for (let b = 0; b < berriesInRow; b++) {
      const angle = (b / berriesInRow) * Math.PI * 2 + row * 0.3;
      const berry = new THREE.Mesh(berryGeo, bodyMat);
      berry.position.set(
        Math.cos(angle) * rowRadius * 0.5,
        -row * berryRadius * 1.6,
        Math.sin(angle) * rowRadius * 0.5,
      );
      const s = rng.uniform(0.85, 1.1);
      berry.scale.set(s, s, s);
      berry.castShadow = true;
      group.add(berry);
    }
  }

  // Central stem
  const stemMat = getStemMaterial(rng, config);
  const stemHeight = berryRadius * rows * 1.5;
  const stemGeo = new THREE.CylinderGeometry(0.003, 0.005, stemHeight, 5);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.y = stemHeight / 2 - berryRadius;
  stem.castShadow = true;
  group.add(stem);

  return group;
}

/**
 * Generate a Mango: asymmetric oval shape with pointed end.
 */
function generateMango(
  rng: SeededRandom,
  config: FruitConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = rng.gaussian(0.09, 0.004);
  const length = baseRadius * 2.2;

  // Build mango profile: asymmetric oval
  const segments = 20;
  const points: THREE.Vector2[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Mango: wider at one end, narrowing to the other
    const offset = 0.35;
    const asymT = t - offset;
    let r = Math.exp(-asymT * asymT * 6) * baseRadius;
    // Sharpen the tip
    if (t > 0.8) r *= Math.pow((1 - t) / 0.2, 0.5);
    if (t < 0.1) r *= t / 0.1;
    points.push(new THREE.Vector2(Math.max(0.001, r), t * length));
  }

  const bodyGeo = new THREE.LatheGeometry(points, 14);

  // Slight asymmetry: displace vertices along one axis
  const posAttr = bodyGeo.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    // Make one side slightly flatter
    if (vertex.x > 0) {
      vertex.x *= 0.92;
    } else {
      vertex.x *= 1.05;
    }
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  bodyGeo.computeVertexNormals();

  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.002, 8.0);

  const bodyMat = getFruitBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Stem at the narrow end
  const stemMat = getStemMaterial(rng, config);
  const stemGeo = new THREE.CylinderGeometry(0.006, 0.01, 0.03, 5);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.y = length * 0.98;
  stem.castShadow = true;
  group.add(stem);

  return group;
}

// ============================================================================
// Main generator class
// ============================================================================

/**
 * Procedural fruit generator supporting 15 distinct fruit types.
 *
 * Uses seeded randomness throughout for deterministic generation.
 * Produces Three.js Group objects containing Mesh children with
 * MeshStandardMaterial for PBR rendering.
 *
 * Each fruit type is generated with geometry that closely mirrors the
 * original infinigen Blender node-based pipeline, adapted to use
 * Three.js procedural geometry primitives and vertex displacement.
 *
 * @example
 * ```ts
 * const generator = new FruitGenerator(42);
 * const apple = generator.generate('Apple');
 * scene.add(apple);
 * ```
 */
export class FruitGenerator {
  private rng: SeededRandom;

  /**
   * @param seed - Master seed for deterministic generation
   */
  constructor(seed: number = 12345) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a fruit of the specified type (or a random one).
   *
   * @param options - Generation options; fruit type is randomly chosen if omitted
   * @returns A Three.js Group containing the fruit meshes
   */
  generate(options: FruitGeneratorOptions = {}): THREE.Group {
    const fruitType = options.fruitType ?? this.rng.choice([...FRUIT_TYPES]);
    const lod = options.lod ?? 0;
    const scale = options.scale ?? 1;
    const includeStem = options.includeStem ?? true;
    const includeSurfaceDetail = options.includeSurfaceDetail ?? true;

    const config = FRUIT_CONFIGS[fruitType];
    const variantRng = new SeededRandom(this.rng.nextInt(0, 999999));

    // Generate the fruit body based on type
    let fruitGroup: THREE.Group;
    switch (fruitType) {
      case 'Apple':
        fruitGroup = generateApple(variantRng, config, lod);
        break;
      case 'Strawberry':
        fruitGroup = generateStrawberry(variantRng, config, lod);
        break;
      case 'Starfruit':
        fruitGroup = generateStarfruit(variantRng, config, lod);
        break;
      case 'Coconut':
        fruitGroup = generateCoconut(variantRng, config, lod);
        break;
      case 'Durian':
        fruitGroup = generateDurian(variantRng, config, lod);
        break;
      case 'Pineapple':
        fruitGroup = generatePineapple(variantRng, config, lod);
        break;
      case 'Blackberry':
        fruitGroup = generateBlackberry(variantRng, config, lod);
        break;
      case 'Banana':
        fruitGroup = generateBanana(variantRng, config, lod);
        break;
      case 'Orange':
        fruitGroup = generateOrange(variantRng, config, lod);
        break;
      case 'Lemon':
        fruitGroup = generateLemon(variantRng, config, lod);
        break;
      case 'Peach':
        fruitGroup = generatePeach(variantRng, config, lod);
        break;
      case 'Pear':
        fruitGroup = generatePear(variantRng, config, lod);
        break;
      case 'Cherry':
        fruitGroup = generateCherry(variantRng, config, lod);
        break;
      case 'Grape':
        fruitGroup = generateGrape(variantRng, config, lod);
        break;
      case 'Mango':
        fruitGroup = generateMango(variantRng, config, lod);
        break;
      default:
        fruitGroup = generateApple(variantRng, config, lod);
    }

    // Remove stem if not included
    if (!includeStem) {
      const toRemove: THREE.Object3D[] = [];
      fruitGroup.children.forEach((child, idx) => {
        if (idx > 0) { // First child is always the body
          toRemove.push(child);
        }
      });
      toRemove.forEach(child => fruitGroup.remove(child));
    }

    // Apply config scale multiplier and user scale
    const totalScale = scale * config.scaleMultiplier;
    if (totalScale !== 1) {
      fruitGroup.scale.setScalar(totalScale);
    }

    // Add slight random rotation for natural placement
    fruitGroup.rotation.y = variantRng.uniform(0, Math.PI * 2);

    // Tag the fruit for identification
    fruitGroup.userData.fruitType = fruitType;
    fruitGroup.userData.generator = 'FruitGenerator';
    fruitGroup.userData.seed = this.rng.seed;

    return fruitGroup;
  }

  /**
   * Generate a collection of random fruits.
   *
   * @param count - Number of fruits to generate
   * @param seed - Seed for deterministic placement
   * @param options - Options applied to each fruit
   * @returns Group containing all fruit instances
   */
  generateCollection(
    count: number,
    seed: number = 0,
    options: FruitGeneratorOptions = {},
  ): THREE.Group {
    const collectionGroup = new THREE.Group();
    const collectionRng = new SeededRandom(seed);

    for (let i = 0; i < count; i++) {
      const fruitSeed = collectionRng.nextInt(0, 999999);
      const generator = new FruitGenerator(fruitSeed);
      const fruitType = options.fruitType ?? collectionRng.choice([...FRUIT_TYPES]);
      const fruit = generator.generate({ ...options, fruitType });

      fruit.position.set(
        collectionRng.uniform(-0.3, 0.3),
        0,
        collectionRng.uniform(-0.3, 0.3),
      );
      fruit.rotation.y = collectionRng.uniform(0, Math.PI * 2);

      collectionGroup.add(fruit);
    }

    return collectionGroup;
  }

  /**
   * Get all available fruit type names.
   */
  static getAvailableTypes(): readonly FruitType[] {
    return FRUIT_TYPES;
  }

  /**
   * Get the configuration for a specific fruit type.
   */
  static getConfig(fruitType: FruitType): FruitConfig {
    return FRUIT_CONFIGS[fruitType];
  }
}

// ============================================================================
// FruitBowlGenerator
// ============================================================================

/** Options for fruit bowl generation */
export interface FruitBowlOptions {
  /** Types of fruits to include (random selection if omitted) */
  fruitTypes?: FruitType[];
  /** Number of fruits in the bowl (default: 5-8) */
  fruitCount?: number;
  /** Scale of the bowl (default: 1) */
  bowlScale?: number;
  /** Material color for the bowl (default: ceramic white) */
  bowlColor?: number;
}

/**
 * Generate a fruit bowl: a decorative bowl with assorted fruits inside.
 *
 * @example
 * ```ts
 * const bowl = createFruitBowl(42, { fruitCount: 6 });
 * scene.add(bowl);
 * ```
 */
function generateFruitBowl(
  rng: SeededRandom,
  options: FruitBowlOptions = {},
): THREE.Group {
  const group = new THREE.Group();
  const bowlScale = options.bowlScale ?? 1;
  const fruitCount = options.fruitCount ?? rng.nextInt(5, 8);
  const fruitTypes = options.fruitTypes ?? [...FRUIT_TYPES];
  const bowlColor = options.bowlColor ?? 0xf5f0e8;

  // Create the bowl using LatheGeometry
  const bowlRadius = 0.25 * bowlScale;
  const bowlHeight = 0.12 * bowlScale;
  const bowlSegments = 20;
  const bowlPoints: THREE.Vector2[] = [];

  for (let i = 0; i <= bowlSegments; i++) {
    const t = i / bowlSegments;
    // Bowl profile: flat bottom, curving up and outward
    const r = bowlRadius * (0.3 + 0.7 * Math.pow(t, 0.6));
    const y = t * bowlHeight;
    bowlPoints.push(new THREE.Vector2(Math.max(0.001, r), y));
  }

  const bowlGeo = new THREE.LatheGeometry(bowlPoints, 24);
  const bowlMat = new THREE.MeshStandardMaterial({
    color: bowlColor,
    roughness: 0.4,
    metalness: 0.1,
  });
  const bowl = new THREE.Mesh(bowlGeo, bowlMat);
  bowl.castShadow = true;
  bowl.receiveShadow = true;
  group.add(bowl);

  // Bowl rim (torus at top)
  const rimGeo = new THREE.TorusGeometry(bowlRadius * 1.0, bowlRadius * 0.03, 8, 24);
  const rim = new THREE.Mesh(rimGeo, bowlMat);
  rim.position.y = bowlHeight;
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = true;
  group.add(rim);

  // Generate fruits inside the bowl
  const fruitGenerator = new FruitGenerator(rng.nextInt(0, 999999));

  for (let i = 0; i < fruitCount; i++) {
    const fruitType = rng.choice(fruitTypes);
    const fruit = fruitGenerator.generate({
      fruitType,
      scale: 0.6 * bowlScale,
      includeStem: true,
      includeSurfaceDetail: true,
    });

    // Position fruits inside the bowl
    const angle = (i / fruitCount) * Math.PI * 2 + rng.uniform(-0.3, 0.3);
    const dist = rng.uniform(0.02, bowlRadius * 0.6);
    const y = bowlHeight * rng.uniform(0.3, 0.7);

    fruit.position.set(
      Math.cos(angle) * dist,
      y,
      Math.sin(angle) * dist,
    );
    fruit.rotation.set(
      rng.uniform(-0.2, 0.2),
      rng.uniform(0, Math.PI * 2),
      rng.uniform(-0.2, 0.2),
    );

    group.add(fruit);
  }

  group.userData.generator = 'FruitBowlGenerator';
  group.userData.seed = rng.seed;

  return group;
}

/**
 * FruitBowlGenerator class — generates a bowl containing assorted fruits.
 *
 * @example
 * ```ts
 * const generator = new FruitBowlGenerator(42);
 * const bowl = generator.generate({ fruitCount: 7 });
 * scene.add(bowl);
 * ```
 */
export class FruitBowlGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 54321) {
    this.rng = new SeededRandom(seed);
  }

  generate(options: FruitBowlOptions = {}): THREE.Group {
    return generateFruitBowl(this.rng, options);
  }
}

// ============================================================================
// Factory function
// ============================================================================

/**
 * Factory function to create a fruit mesh group.
 *
 * This is the primary public API for creating individual fruits.
 * Matches the pattern used by other generators in the R3F project.
 *
 * @param seed - Random seed for deterministic generation
 * @param fruitType - Optional specific fruit type; random if omitted
 * @param options - Additional generation options
 * @returns A Three.js Group containing the generated fruit
 *
 * @example
 * ```ts
 * const apple = createFruit(42, 'Apple');
 * scene.add(apple);
 *
 * const randomFruit = createFruit(99);
 * scene.add(randomFruit);
 * ```
 */
export function createFruit(
  seed: number,
  fruitType?: FruitType,
  options: Omit<FruitGeneratorOptions, 'fruitType'> = {},
): THREE.Group {
  const generator = new FruitGenerator(seed);
  return generator.generate({ ...options, fruitType });
}

/**
 * Factory function to create a fruit bowl.
 *
 * @param seed - Random seed for deterministic generation
 * @param options - Bowl generation options
 * @returns A Three.js Group containing the bowl with fruits
 *
 * @example
 * ```ts
 * const bowl = createFruitBowl(42, { fruitCount: 6 });
 * scene.add(bowl);
 * ```
 */
export function createFruitBowl(
  seed: number,
  options: FruitBowlOptions = {},
): THREE.Group {
  const generator = new FruitBowlGenerator(seed);
  return generator.generate(options);
}
