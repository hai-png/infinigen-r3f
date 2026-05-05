/**
 * FruitFlowerSystem.ts
 *
 * Comprehensive fruit, flower, and twig generation system for tree vegetation.
 * Provides distinctive procedural geometry for 12 fruit types, 8 flower types,
 * twig sub-tree generation, tree child placement on branch endpoints, and
 * seasonal appearance management.
 *
 * Ported from Infinigen's add_tree_children() pipeline which places fruits,
 * flowers, and twig sub-trees as children on tree skeletons.
 *
 * Architecture:
 *   FruitFactory  -> generates distinctive fruit geometry per FruitType
 *   FlowerFactory -> generates distinctive flower geometry per FlowerType
 *   TwigGenerator -> generates miniature tree-like twigs at branch terminals
 *   TreeChildPlacer -> places fruits/flowers/twigs on branch endpoints
 *   SeasonalAppearance -> modulates fruit/flower/leaf appearance by season
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Enums
// ============================================================================

/** Supported fruit types — matches original Infinigen's 8+ fruit types */
export enum FruitType {
  APPLE = 'apple',
  BLACKBERRY = 'blackberry',
  COCONUT = 'coconut',
  DURIAN = 'durian',
  STARFRUIT = 'starfruit',
  STRAWBERRY = 'strawberry',
  CHERRY = 'cherry',
  LEMON = 'lemon',
  ORANGE = 'orange',
  PLUM = 'plum',
  POMEGRANATE = 'pomegranate',
  COMPOSITIONAL = 'compositional',
}

/** Supported flower types for tree flowers */
export enum FlowerType {
  ROSE = 'rose',
  CHERRY_BLOSSOM = 'cherry_blossom',
  DAISY = 'daisy',
  TULIP = 'tulip',
  SUNFLOWER = 'sunflower',
  MAGNOLIA = 'magnolia',
  ORCHID = 'orchid',
  HIBISCUS = 'hibiscus',
}

// ============================================================================
// Interfaces
// ============================================================================

/** Parameters controlling fruit geometry generation */
export interface FruitParams {
  type: FruitType;
  /** Base radius of the fruit */
  size: number;
  /** Main body color */
  color: THREE.Color;
  /** Length of the fruit stem */
  stemLength: number;
  /** Thickness of the fruit stem */
  stemThickness: number;
  /** Surface roughness (0=shiny, 1=matte) */
  roughness: number;
  /** Geometry subdivision level (higher = more detail, more triangles) */
  detail: number;
  /** Whether to attach a small leaf near the stem */
  hasLeaves: boolean;
  /** Size of the leaf relative to fruit size */
  leafSize: number;
}

/** Parameters controlling flower geometry generation */
export interface FlowerParams {
  type: FlowerType;
  /** Number of petals */
  petalCount: number;
  /** Size (length) of each petal */
  petalSize: number;
  /** Color of petals */
  petalColor: THREE.Color;
  /** Size of the central disc/stamen */
  centerSize: number;
  /** Color of the center */
  centerColor: THREE.Color;
  /** Length of the flower stem */
  stemLength: number;
  /** Whether to include small leaves on the stem */
  hasLeaves: boolean;
}

/** Parameters for twig sub-tree generation */
export interface TwigParams {
  /** Number of main twig branches */
  branchCount: number;
  /** Length of each branch */
  branchLength: number;
  /** Thickness at the base of each branch */
  branchThickness: number;
  /** Recursion depth for sub-branching (0 = no sub-branches) */
  recursionDepth: number;
  /** Angle spread between branches (radians) */
  spreadAngle: number;
  /** Number of leaves per twig */
  leafCount: number;
  /** Size of each leaf */
  leafSize: number;
  /** Color of twig bark */
  barkColor: THREE.Color;
  /** Color of leaves */
  leafColor: THREE.Color;
  /** Scale relative to parent tree */
  sizeScale: number;
}

/** Configuration for placing children (fruits, flowers, twigs) on tree branches */
export interface TreeChildrenConfig {
  /** Whether to place fruit on branches */
  fruitEnabled: boolean;
  /** Type of fruit to place */
  fruitType: FruitType;
  /** Fraction of branch endpoints that get fruit (0-1) */
  fruitDensity: number;
  /** Size range for fruits [min, max] */
  fruitSizeRange: [number, number];

  /** Whether to place flowers on branches */
  flowerEnabled: boolean;
  /** Type of flower to place */
  flowerType: FlowerType;
  /** Fraction of branch endpoints that get flowers (0-1) */
  flowerDensity: number;
  /** Size range for flowers [min, max] */
  flowerSizeRange: [number, number];

  /** Whether to place twig sub-trees at branch terminals */
  twigEnabled: boolean;
  /** Recursion depth for twig sub-trees */
  twigDetail: number;
  /** Scale of twigs relative to parent branch */
  twigSizeScale: number;
}

/** Season configuration for appearance modulation */
export interface SeasonConfig {
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Fruit maturity 0=green/unripe, 1=fully ripe */
  fruitMaturity: number;
  /** Flower bloom state 0=bud, 1=full bloom */
  flowerBloom: number;
  /** Leaf color for the season */
  leafColor: THREE.Color;
  /** Fraction of leaves remaining (0=bare, 1=full) */
  leafDensity: number;
}

/** Default tree children configuration */
export const DEFAULT_TREE_CHILDREN_CONFIG: TreeChildrenConfig = {
  fruitEnabled: true,
  fruitType: FruitType.APPLE,
  fruitDensity: 0.3,
  fruitSizeRange: [0.03, 0.06],
  flowerEnabled: false,
  flowerType: FlowerType.CHERRY_BLOSSOM,
  flowerDensity: 0.2,
  flowerSizeRange: [0.02, 0.04],
  twigEnabled: true,
  twigDetail: 2,
  twigSizeScale: 0.15,
};

/** Default season configurations for each season */
export const DEFAULT_SEASON_CONFIGS: Record<string, SeasonConfig> = {
  spring: {
    season: 'spring',
    fruitMaturity: 0.1,
    flowerBloom: 1.0,
    leafColor: new THREE.Color(0x7cb342),
    leafDensity: 0.7,
  },
  summer: {
    season: 'summer',
    fruitMaturity: 0.7,
    flowerBloom: 0.3,
    leafColor: new THREE.Color(0x2d5a1d),
    leafDensity: 1.0,
  },
  autumn: {
    season: 'autumn',
    fruitMaturity: 1.0,
    flowerBloom: 0.0,
    leafColor: new THREE.Color(0xd84315),
    leafDensity: 0.5,
  },
  winter: {
    season: 'winter',
    fruitMaturity: 0.0,
    flowerBloom: 0.0,
    leafColor: new THREE.Color(0x5d4037),
    leafDensity: 0.05,
  },
};

// ============================================================================
// Internal Helpers
// ============================================================================

/** Apply sine-based noise displacement along vertex normals */
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

    const nx =
      Math.sin(vertex.x * frequency + seed * 0.1) * 0.5 +
      Math.sin(vertex.y * frequency * 1.3 + seed * 0.3) * 0.3 +
      Math.sin(vertex.z * frequency * 0.7 + seed * 0.2) * 0.2;

    vertex.addScaledVector(normal, nx * amplitude);
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
}

/** Apply dimple/bump displacement for textured surfaces (oranges, etc.) */
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

  const dimpleCenters: THREE.Vector3[] = [];
  for (let d = 0; d < count; d++) {
    const theta = rng.uniform(0, Math.PI * 2);
    const phi = Math.acos(rng.uniform(-1, 1));
    dimpleCenters.push(
      new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
      ),
    );
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

/** Create a curved stem tube */
function createStemTube(
  height: number,
  radius: number,
  rng: SeededRandom,
  color: THREE.Color,
  roughness: number = 0.7,
): THREE.Mesh {
  const midOffsetX = rng.uniform(-0.05, 0.05);
  const midOffsetZ = rng.uniform(-0.05, 0.05);

  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(midOffsetX, height * 0.5, midOffsetZ),
    new THREE.Vector3(rng.uniform(-0.1, 0.1), height, rng.uniform(-0.1, 0.1)),
  );

  const tubeGeo = new THREE.TubeGeometry(curve, 6, radius, 5, false);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(tubeGeo, mat);
  mesh.castShadow = true;
  return mesh;
}

/** Create a small leaf shape mesh */
function createLeafMesh(
  size: number,
  rng: SeededRandom,
  color: THREE.Color,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(size * 0.4, size * 0.3, size, 0);
  shape.quadraticCurveTo(size * 0.4, -size * 0.3, 0, 0);

  const geo = new THREE.ShapeGeometry(shape, 3);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const leaf = new THREE.Mesh(geo, mat);
  leaf.rotation.x = -Math.PI / 2 + rng.uniform(-0.3, 0.1);
  leaf.rotation.z = rng.uniform(0, Math.PI * 2);
  leaf.castShadow = true;
  return leaf;
}

// ============================================================================
// FruitFactory
// ============================================================================

/**
 * Generates distinctive fruit geometry for each FruitType.
 * Each fruit type has unique, recognizable geometry — not just colored spheres.
 * Targets 100-500 triangles per fruit for real-time performance.
 */
export class FruitFactory {
  /**
   * Generate a fruit mesh from the given parameters.
   */
  static generate(params: FruitParams, rng: SeededRandom): THREE.Group {
    switch (params.type) {
      case FruitType.APPLE:
        return FruitFactory.generateApple(params, rng);
      case FruitType.BLACKBERRY:
        return FruitFactory.generateBlackberry(params, rng);
      case FruitType.COCONUT:
        return FruitFactory.generateCoconut(params, rng);
      case FruitType.DURIAN:
        return FruitFactory.generateDurian(params, rng);
      case FruitType.STARFRUIT:
        return FruitFactory.generateStarfruit(params, rng);
      case FruitType.STRAWBERRY:
        return FruitFactory.generateStrawberry(params, rng);
      case FruitType.CHERRY:
        return FruitFactory.generateCherry(params, rng);
      case FruitType.LEMON:
        return FruitFactory.generateLemon(params, rng);
      case FruitType.ORANGE:
        return FruitFactory.generateOrange(params, rng);
      case FruitType.PLUM:
        return FruitFactory.generatePlum(params, rng);
      case FruitType.POMEGRANATE:
        return FruitFactory.generatePomegranate(params, rng);
      case FruitType.COMPOSITIONAL:
        return FruitFactory.generateCompositional(params, rng);
      default:
        return FruitFactory.generateApple(params, rng);
    }
  }

  /**
   * Get default parameters for a given fruit type.
   */
  static getDefaultParams(type: FruitType): FruitParams {
    const defaults: Record<FruitType, Omit<FruitParams, 'type'>> = {
      [FruitType.APPLE]: {
        size: 0.04, color: new THREE.Color(0xcc2222), stemLength: 0.02,
        stemThickness: 0.003, roughness: 0.5, detail: 12, hasLeaves: true, leafSize: 0.015,
      },
      [FruitType.BLACKBERRY]: {
        size: 0.02, color: new THREE.Color(0x2a1040), stemLength: 0.01,
        stemThickness: 0.002, roughness: 0.8, detail: 8, hasLeaves: false, leafSize: 0.008,
      },
      [FruitType.COCONUT]: {
        size: 0.07, color: new THREE.Color(0x5c3a1e), stemLength: 0.03,
        stemThickness: 0.005, roughness: 0.95, detail: 10, hasLeaves: false, leafSize: 0.02,
      },
      [FruitType.DURIAN]: {
        size: 0.08, color: new THREE.Color(0x6b7a2a), stemLength: 0.03,
        stemThickness: 0.005, roughness: 0.85, detail: 10, hasLeaves: false, leafSize: 0.02,
      },
      [FruitType.STARFRUIT]: {
        size: 0.05, color: new THREE.Color(0xd4aa00), stemLength: 0.02,
        stemThickness: 0.003, roughness: 0.6, detail: 10, hasLeaves: false, leafSize: 0.012,
      },
      [FruitType.STRAWBERRY]: {
        size: 0.03, color: new THREE.Color(0xdd1133), stemLength: 0.015,
        stemThickness: 0.002, roughness: 0.7, detail: 10, hasLeaves: false, leafSize: 0.01,
      },
      [FruitType.CHERRY]: {
        size: 0.015, color: new THREE.Color(0x8b0000), stemLength: 0.03,
        stemThickness: 0.001, roughness: 0.4, detail: 10, hasLeaves: false, leafSize: 0.006,
      },
      [FruitType.LEMON]: {
        size: 0.035, color: new THREE.Color(0xf5e050), stemLength: 0.01,
        stemThickness: 0.003, roughness: 0.6, detail: 10, hasLeaves: true, leafSize: 0.012,
      },
      [FruitType.ORANGE]: {
        size: 0.04, color: new THREE.Color(0xff8c00), stemLength: 0.01,
        stemThickness: 0.003, roughness: 0.8, detail: 12, hasLeaves: true, leafSize: 0.015,
      },
      [FruitType.PLUM]: {
        size: 0.03, color: new THREE.Color(0x4a0080), stemLength: 0.015,
        stemThickness: 0.002, roughness: 0.5, detail: 10, hasLeaves: false, leafSize: 0.01,
      },
      [FruitType.POMEGRANATE]: {
        size: 0.05, color: new THREE.Color(0xc41e3a), stemLength: 0.02,
        stemThickness: 0.004, roughness: 0.7, detail: 10, hasLeaves: false, leafSize: 0.015,
      },
      [FruitType.COMPOSITIONAL]: {
        size: 0.04, color: new THREE.Color(0x8844aa), stemLength: 0.02,
        stemThickness: 0.003, roughness: 0.6, detail: 10, hasLeaves: true, leafSize: 0.012,
      },
    };
    return { type, ...defaults[type] };
  }

  /**
   * Randomize parameters within a fruit type's natural variation range.
   */
  static randomize(type: FruitType, rng: SeededRandom): FruitParams {
    const base = FruitFactory.getDefaultParams(type);
    const sizeVariation = rng.uniform(0.8, 1.2);
    base.size *= sizeVariation;
    base.stemLength *= sizeVariation;
    base.leafSize *= sizeVariation;

    // Color variation via HSV offset
    const colorVar = base.color.clone();
    colorVar.offsetHSL(rng.uniform(-0.03, 0.03), rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1));
    base.color = colorVar;

    return base;
  }

  // --------------------------------------------------------------------------
  // Individual fruit generators
  // --------------------------------------------------------------------------

  /** Apple: sphere with top/bottom indentations, short curved stem, leaf */
  private static generateApple(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;

    // LatheGeometry with apple profile — wider middle, indented top/bottom
    const segments = params.detail;
    const points: THREE.Vector2[] = [];
    const controlR = [
      [0.0, 0.0], [0.12, 0.43], [0.47, 0.66], [0.89, 0.42], [1.0, 0.0],
    ];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let pr = 0;
      for (let c = 0; c < controlR.length - 1; c++) {
        const [t0, r0] = controlR[c];
        const [t1, r1] = controlR[c + 1];
        if (t >= t0 && t <= t1) {
          const lt = (t - t0) / (t1 - t0);
          const st = lt * lt * (3 - 2 * lt);
          pr = r0 + (r1 - r0) * st;
          break;
        }
      }
      points.push(new THREE.Vector2(Math.max(0.001, pr * r), t * r * 2));
    }

    const bodyGeo = new THREE.LatheGeometry(points, 14);

    // Top/bottom indentations
    const posAttr = bodyGeo.attributes.position;
    const normalAttr = bodyGeo.attributes.normal;
    const vertex = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i);
      normal.fromBufferAttribute(normalAttr!, i);
      const t = vertex.y / (r * 2);

      if (t > 0.85) {
        vertex.addScaledVector(normal, -((t - 0.85) / 0.15) * r * 0.2);
      }
      if (t < 0.1) {
        vertex.addScaledVector(normal, -((0.1 - t) / 0.1) * r * 0.15);
      }
      posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    bodyGeo.computeVertexNormals();

    applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.002, 8.0);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness, metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Stem
    const stemColor = new THREE.Color(0x3d2b1f);
    const stem = createStemTube(params.stemLength, params.stemThickness, rng, stemColor);
    stem.position.y = r * 2 * 0.85;
    group.add(stem);

    // Leaf
    if (params.hasLeaves && rng.boolean(0.8)) {
      const leaf = createLeafMesh(params.leafSize, rng, new THREE.Color(0x3a7a2a));
      leaf.position.y = r * 2 * 0.9;
      group.add(leaf);
    }

    return group;
  }

  /** Blackberry: clustered small spheres forming aggregate fruit */
  private static generateBlackberry(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness, metalness: 0.0,
    });

    // Central sphere
    const centerGeo = new THREE.SphereGeometry(r * 0.7, 8, 6);
    const center = new THREE.Mesh(centerGeo, bodyMat);
    center.castShadow = true;
    group.add(center);

    // Surrounding drupelet spheres
    const drupeletCount = rng.nextInt(12, 20);
    const drupeletGeo = new THREE.SphereGeometry(r * 0.3, 5, 4);

    for (let i = 0; i < drupeletCount; i++) {
      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(rng.uniform(-0.8, 1.0));
      const dr = r * rng.uniform(0.5, 0.85);

      const drupelet = new THREE.Mesh(drupeletGeo, bodyMat);
      drupelet.position.set(
        dr * Math.sin(phi) * Math.cos(theta),
        dr * Math.sin(phi) * Math.sin(theta) + r * 0.2,
        dr * Math.cos(phi),
      );
      const s = rng.uniform(0.7, 1.2);
      drupelet.scale.set(s, s, s);
      drupelet.castShadow = true;
      group.add(drupelet);
    }

    // Short stem
    const stem = createStemTube(params.stemLength, params.stemThickness, rng, new THREE.Color(0x2d5a1e));
    stem.position.y = r * 0.9;
    group.add(stem);

    return group;
  }

  /** Coconut: large brown sphere with three "eyes" */
  private static generateCoconut(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;
    const height = r * 1.4;

    // LatheGeometry for oval coconut
    const segments = params.detail;
    const points: THREE.Vector2[] = [];
    const controlR: [number, number][] = [
      [0.0, 0.0], [0.06, 0.32], [0.25, 0.61], [0.65, 0.68], [0.96, 0.36], [1.0, 0.0],
    ];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let pr = 0;
      for (let c = 0; c < controlR.length - 1; c++) {
        const [t0, r0] = controlR[c];
        const [t1, r1] = controlR[c + 1];
        if (t >= t0 && t <= t1) {
          const lt = (t - t0) / (t1 - t0);
          pr = r0 + (r1 - r0) * lt * lt * (3 - 2 * lt);
          break;
        }
      }
      points.push(new THREE.Vector2(Math.max(0.001, pr * r), t * height));
    }

    const bodyGeo = new THREE.LatheGeometry(points, 14);
    applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.006, 20.0);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness, metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Three "eyes" at the top — small dark indentations
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x1a0e05, roughness: 0.9, metalness: 0.0,
    });
    const eyeGeo = new THREE.SphereGeometry(r * 0.06, 5, 4);
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + rng.uniform(-0.2, 0.2);
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(
        Math.cos(angle) * r * 0.2,
        height * 0.95,
        Math.sin(angle) * r * 0.2,
      );
      eye.scale.y = 0.5;
      group.add(eye);
    }

    // Stem cap
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x3d5a1e, roughness: 0.8, metalness: 0.0,
    });
    const stemGeo = new THREE.CylinderGeometry(r * 0.08, r * 0.12, r * 0.1, 6);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = height;
    stem.castShadow = true;
    group.add(stem);

    return group;
  }

  /** Durian: sphere with thorny spike projections */
  private static generateDurian(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;
    const height = r * 1.6;

    // LatheGeometry for oval durian body
    const segments = params.detail;
    const points: THREE.Vector2[] = [];
    const controlR: [number, number][] = [
      [0.0, 0.003], [0.08, 0.35], [0.5, 0.8], [0.89, 0.61], [1.0, 0.0],
    ];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let pr = 0;
      for (let c = 0; c < controlR.length - 1; c++) {
        const [t0, r0] = controlR[c];
        const [t1, r1] = controlR[c + 1];
        if (t >= t0 && t <= t1) {
          const lt = (t - t0) / (t1 - t0);
          pr = r0 + (r1 - r0) * lt * lt * (3 - 2 * lt);
          break;
        }
      }
      points.push(new THREE.Vector2(Math.max(0.001, pr * r), t * height));
    }

    const bodyGeo = new THREE.LatheGeometry(points, 12);
    applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.003, 5.0);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness, metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Durian spikes: small cones distributed on the surface
    const spikeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x7a8a30), roughness: 0.7, metalness: 0.0,
    });
    const spikeCount = rng.nextInt(30, 50);
    const spikeGeo = new THREE.ConeGeometry(r * 0.04, r * rng.uniform(0.15, 0.25), 4);
    spikeGeo.translate(0, r * 0.1, 0);

    for (let i = 0; i < spikeCount; i++) {
      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(rng.uniform(-1, 1));
      const sx = Math.sin(phi) * Math.cos(theta) * r * 0.85;
      const sy = Math.sin(phi) * Math.sin(theta) * r * 0.85 + height * 0.5;
      const sz = Math.cos(phi) * r * 0.85;

      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(sx, sy, sz);

      const dir = new THREE.Vector3(sx, sy - height * 0.5, sz).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      spike.quaternion.setFromUnitVectors(up, dir);

      const s = rng.uniform(0.6, 1.0);
      spike.scale.set(s, s, s);
      spike.castShadow = true;
      group.add(spike);
    }

    // Stem
    const stem = createStemTube(params.stemLength, params.stemThickness * 1.5, rng, new THREE.Color(0x3d2b1f));
    stem.position.y = height * 0.95;
    group.add(stem);

    return group;
  }

  /** Starfruit: extruded 5-pointed star cross-section, tapered at ends */
  private static generateStarfruit(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;
    const length = r * 3;

    // Create 5-pointed star cross-section shape
    const starPoints = 5;
    const outerRadius = r;
    const innerRadius = r * 0.45;
    const starShape = new THREE.Shape();

    for (let i = 0; i < starPoints * 2; i++) {
      const angle = (i / (starPoints * 2)) * Math.PI * 2 - Math.PI / 2;
      const pr = i % 2 === 0 ? outerRadius : innerRadius;
      const x = Math.cos(angle) * pr;
      const y = Math.sin(angle) * pr;
      if (i === 0) {
        starShape.moveTo(x, y);
      } else {
        starShape.lineTo(x, y);
      }
    }
    starShape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: length,
      bevelEnabled: true,
      bevelThickness: r * 0.05,
      bevelSize: r * 0.03,
      bevelSegments: 2,
      steps: 6,
    };

    const bodyGeo = new THREE.ExtrudeGeometry(starShape, extrudeSettings);

    // Taper the ends
    const posAttr = bodyGeo.attributes.position;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i);
      const zNorm = vertex.z / length;
      const taperFactor = 1.0 - 0.4 * Math.pow(Math.abs(zNorm - 0.5) * 2, 2);
      vertex.x *= taperFactor;
      vertex.y *= taperFactor;
      posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    bodyGeo.computeVertexNormals();

    applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.003, 6.0);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness, metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = -Math.PI / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Stem at top
    const stem = createStemTube(params.stemLength, params.stemThickness, rng, new THREE.Color(0x3d2b1f));
    stem.position.y = length * 0.5;
    group.add(stem);

    return group;
  }

  /** Strawberry: cone/teardrop with bumpy surface and seed dots */
  private static generateStrawberry(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;
    const height = r * 3;

    // LatheGeometry for teardrop profile — wide middle, pointed tip
    const segments = params.detail;
    const points: THREE.Vector2[] = [];
    const controlR: [number, number][] = [
      [0.0, 0.0], [0.02, 0.13], [0.22, 0.44],
      [rng.uniform(0.55, 0.7), rng.uniform(0.7, 0.78)],
      [0.93, 0.47], [1.0, 0.0],
    ];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let pr = 0;
      for (let c = 0; c < controlR.length - 1; c++) {
        const [t0, r0] = controlR[c];
        const [t1, r1] = controlR[c + 1];
        if (t >= t0 && t <= t1) {
          const lt = (t - t0) / (t1 - t0);
          pr = r0 + (r1 - r0) * lt * lt * (3 - 2 * lt);
          break;
        }
      }
      points.push(new THREE.Vector2(Math.max(0.001, pr * r), t * height));
    }

    const bodyGeo = new THREE.LatheGeometry(points, 14);

    // Seed bump craters
    applyDimpleDisplacement(bodyGeo, new SeededRandom(rng.nextInt(0, 9999)), 35, 0.2, r * 0.04);
    applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.003, 10.0);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness, metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Seed dots — small yellow bumps on the surface
    const seedMat = new THREE.MeshStandardMaterial({
      color: 0xeecc44, roughness: 0.5, metalness: 0.0,
    });
    const seedGeo = new THREE.SphereGeometry(r * 0.03, 4, 3);
    const seedCount = rng.nextInt(15, 25);

    for (let i = 0; i < seedCount; i++) {
      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(rng.uniform(0.1, 1.0));
      const sr = r * rng.uniform(0.8, 1.0);
      const seed = new THREE.Mesh(seedGeo, seedMat);
      seed.position.set(
        sr * Math.sin(phi) * Math.cos(theta),
        sr * Math.sin(phi) * Math.sin(theta) * 0.9 + height * 0.5,
        sr * Math.cos(phi),
      );
      seed.castShadow = true;
      group.add(seed);
    }

    // Calyx (green leafy cap) at the top
    const calyxMat = new THREE.MeshStandardMaterial({
      color: 0x2d7a1e, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
    });
    const sepalCount = rng.nextInt(8, 12);
    for (let i = 0; i < sepalCount; i++) {
      const angle = (i / sepalCount) * Math.PI * 2;
      const sepalLen = r * rng.uniform(0.5, 0.8);
      const sepalShape = new THREE.Shape();
      sepalShape.moveTo(0, 0);
      sepalShape.quadraticCurveTo(sepalLen * 0.25, sepalLen * 0.4, 0, sepalLen);
      sepalShape.quadraticCurveTo(-sepalLen * 0.25, sepalLen * 0.4, 0, 0);

      const sepalGeo = new THREE.ShapeGeometry(sepalShape, 3);
      const sepal = new THREE.Mesh(sepalGeo, calyxMat);
      sepal.position.set(
        Math.cos(angle) * r * 0.15,
        height * 0.97,
        Math.sin(angle) * r * 0.15,
      );
      sepal.rotation.set(
        -Math.PI / 3 + rng.uniform(-0.2, 0.2),
        angle,
        0,
      );
      group.add(sepal);
    }

    return group;
  }

  /** Cherry: small sphere pair on a Y-shaped stem */
  private static generateCherry(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness, metalness: 0.0,
    });

    // Two cherries
    const cherryGeo = new THREE.SphereGeometry(r, 10, 8);
    applyNoiseDisplacement(cherryGeo, rng.nextInt(0, 10000), 0.001, 5.0);

    // Cherry 1
    const cherry1 = new THREE.Mesh(cherryGeo, bodyMat);
    cherry1.position.set(-r * 0.8, r, 0);
    cherry1.castShadow = true;
    group.add(cherry1);

    // Cherry 2
    const cherry2 = new THREE.Mesh(cherryGeo.clone(), bodyMat);
    cherry2.position.set(r * 0.8, r * 0.7, 0);
    cherry2.castShadow = true;
    group.add(cherry2);

    // Y-stem
    const stemColor = new THREE.Color(0x3d5a1e);
    const stemHeight = params.stemLength;

    // Main stem
    const mainStemGeo = new THREE.CylinderGeometry(params.stemThickness, params.stemThickness * 1.2, stemHeight * 0.6, 5);
    const mainStemMat = new THREE.MeshStandardMaterial({ color: stemColor, roughness: 0.7 });
    const mainStem = new THREE.Mesh(mainStemGeo, mainStemMat);
    mainStem.position.y = stemHeight * 0.6;
    mainStem.castShadow = true;
    group.add(mainStem);

    // Left branch
    const leftCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, stemHeight * 0.6, 0),
      new THREE.Vector3(-r * 0.4, stemHeight * 0.8, 0),
      new THREE.Vector3(-r * 0.8, r, 0),
    );
    const leftTubeGeo = new THREE.TubeGeometry(leftCurve, 6, params.stemThickness, 5, false);
    const leftStem = new THREE.Mesh(leftTubeGeo, mainStemMat);
    leftStem.castShadow = true;
    group.add(leftStem);

    // Right branch
    const rightCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, stemHeight * 0.6, 0),
      new THREE.Vector3(r * 0.4, stemHeight * 0.75, 0),
      new THREE.Vector3(r * 0.8, r * 0.7, 0),
    );
    const rightTubeGeo = new THREE.TubeGeometry(rightCurve, 6, params.stemThickness, 5, false);
    const rightStem = new THREE.Mesh(rightTubeGeo, mainStemMat);
    rightStem.castShadow = true;
    group.add(rightStem);

    return group;
  }

  /** Lemon: elongated ellipsoid with pointy ends */
  private static generateLemon(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;
    const length = r * 2.5;

    // LatheGeometry with elongated profile and pointed tips
    const segments = params.detail;
    const points: THREE.Vector2[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let pr = Math.sin(t * Math.PI) * r;
      // Sharpen the tips
      const tipSharpness = 1.5;
      if (t < 0.15) pr *= Math.pow(t / 0.15, tipSharpness);
      if (t > 0.85) pr *= Math.pow((1 - t) / 0.15, tipSharpness);
      points.push(new THREE.Vector2(Math.max(0.001, pr), t * length));
    }

    const bodyGeo = new THREE.LatheGeometry(points, 14);
    applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.002, 8.0);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness, metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Small stem at top
    const stem = createStemTube(params.stemLength, params.stemThickness, rng, new THREE.Color(0x3d5a1e));
    stem.position.y = length;
    group.add(stem);

    // Optional leaf
    if (params.hasLeaves && rng.boolean(0.7)) {
      const leaf = createLeafMesh(params.leafSize, rng, new THREE.Color(0x3a7a2a));
      leaf.position.y = length * 0.98;
      group.add(leaf);
    }

    return group;
  }

  /** Orange: sphere with dimpled texture */
  private static generateOrange(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;

    const bodyGeo = new THREE.SphereGeometry(r, 14, 10);

    // Dimpled orange peel surface
    applyDimpleDisplacement(bodyGeo, new SeededRandom(rng.nextInt(0, 9999)), 40, 0.15, r * 0.01);
    applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.002, 12.0);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness, metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Navel bump at bottom
    const navelGeo = new THREE.SphereGeometry(r * 0.08, 5, 4);
    const navel = new THREE.Mesh(navelGeo, bodyMat);
    navel.position.y = -r * 0.95;
    navel.scale.y = 0.5;
    group.add(navel);

    // Stem
    const stem = createStemTube(params.stemLength, params.stemThickness, rng, new THREE.Color(0x3d5a1e));
    stem.position.y = r * 0.9;
    group.add(stem);

    // Optional leaf
    if (params.hasLeaves && rng.boolean(0.7)) {
      const leaf = createLeafMesh(params.leafSize, rng, new THREE.Color(0x3a7a2a));
      leaf.position.y = r * 0.95;
      group.add(leaf);
    }

    return group;
  }

  /** Plum: slightly oblate sphere with subtle bloom/sheen */
  private static generatePlum(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;

    // Oblate sphere (wider than tall)
    const bodyGeo = new THREE.SphereGeometry(r, 12, 10);
    bodyGeo.scale(1.0, 0.9, 1.0);
    applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.002, 6.0);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness * 0.5, // Smoother = bloom effect
      metalness: 0.05, // Subtle sheen
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Bloom highlight — subtle lighter patch on one side
    const bloomGeo = new THREE.SphereGeometry(r * 0.7, 8, 6);
    const bloomMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(params.color).offsetHSL(0, -0.3, 0.15),
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.15,
    });
    const bloom = new THREE.Mesh(bloomGeo, bloomMat);
    bloom.position.set(r * 0.3, r * 0.1, r * 0.3);
    group.add(bloom);

    // Stem
    const stem = createStemTube(params.stemLength, params.stemThickness, rng, new THREE.Color(0x3d2b1f));
    stem.position.y = r * 0.9;
    group.add(stem);

    return group;
  }

  /** Pomegranate: sphere with crown-like calyx at top */
  private static generatePomegranate(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;

    const bodyGeo = new THREE.SphereGeometry(r, 12, 10);
    bodyGeo.scale(1.0, 0.95, 1.0); // Slightly oblate
    applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.003, 8.0);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness, metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Crown-like calyx at the top — star-shaped protrusion
    const crownMat = new THREE.MeshStandardMaterial({
      color: 0x7a3a1e, roughness: 0.7, metalness: 0.0,
    });
    const crownPoints = rng.nextInt(5, 8);
    for (let i = 0; i < crownPoints; i++) {
      const angle = (i / crownPoints) * Math.PI * 2;
      const prongLen = r * rng.uniform(0.2, 0.35);
      const prongGeo = new THREE.ConeGeometry(r * 0.04, prongLen, 4);
      const prong = new THREE.Mesh(prongGeo, crownMat);

      prong.position.set(
        Math.cos(angle) * r * 0.12,
        r * 0.9,
        Math.sin(angle) * r * 0.12,
      );

      // Tilt outward
      prong.rotation.z = Math.cos(angle) * 0.6;
      prong.rotation.x = Math.sin(angle) * 0.6;
      prong.castShadow = true;
      group.add(prong);
    }

    // Central stem
    const stemGeo = new THREE.CylinderGeometry(r * 0.03, r * 0.04, params.stemLength, 5);
    const stem = new THREE.Mesh(stemGeo, crownMat);
    stem.position.y = r + params.stemLength * 0.5;
    stem.castShadow = true;
    group.add(stem);

    return group;
  }

  /** Compositional: blended shapes using multiple primitives (like original compositional_fruit) */
  private static generateCompositional(params: FruitParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = params.size;

    // Blend of sphere + cone + bumpy displacement — creates unique hybrid shapes
    // Choose from a few compositional modes randomly
    const mode = rng.nextInt(0, 3);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: params.color, roughness: params.roughness, metalness: 0.0,
    });

    switch (mode) {
      case 0: {
        // Sphere with cone cap (like a bizarre hybrid)
        const sphereGeo = new THREE.SphereGeometry(r * 0.7, 10, 8);
        applyNoiseDisplacement(sphereGeo, rng.nextInt(0, 10000), 0.005, 4.0);
        const sphere = new THREE.Mesh(sphereGeo, bodyMat);
        sphere.castShadow = true;
        group.add(sphere);

        const coneGeo = new THREE.ConeGeometry(r * 0.5, r * 0.8, 8);
        const cone = new THREE.Mesh(coneGeo, bodyMat);
        cone.position.y = r * 0.5;
        cone.castShadow = true;
        group.add(cone);
        break;
      }
      case 1: {
        // Torus + sphere (like a grafted fruit)
        const torusGeo = new THREE.TorusGeometry(r * 0.6, r * 0.25, 8, 12);
        const torus = new THREE.Mesh(torusGeo, bodyMat);
        torus.rotation.x = Math.PI / 2;
        torus.castShadow = true;
        group.add(torus);

        const innerGeo = new THREE.SphereGeometry(r * 0.45, 8, 6);
        const inner = new THREE.Mesh(innerGeo, bodyMat);
        inner.castShadow = true;
        group.add(inner);
        break;
      }
      case 2: {
        // Multiple overlapping spheres of different sizes (blob-like)
        const count = rng.nextInt(3, 5);
        for (let i = 0; i < count; i++) {
          const subR = r * rng.uniform(0.3, 0.6);
          const subGeo = new THREE.SphereGeometry(subR, 8, 6);
          applyNoiseDisplacement(subGeo, rng.nextInt(0, 10000), 0.004, 5.0);
          const sub = new THREE.Mesh(subGeo, bodyMat);
          sub.position.set(
            rng.uniform(-r * 0.3, r * 0.3),
            rng.uniform(-r * 0.3, r * 0.3),
            rng.uniform(-r * 0.3, r * 0.3),
          );
          sub.castShadow = true;
          group.add(sub);
        }
        break;
      }
      default: {
        // Icosahedron-based geometric fruit
        const icoGeo = new THREE.IcosahedronGeometry(r * 0.8, 1);
        applyNoiseDisplacement(icoGeo, rng.nextInt(0, 10000), 0.006, 3.0);
        const ico = new THREE.Mesh(icoGeo, bodyMat);
        ico.castShadow = true;
        group.add(ico);
        break;
      }
    }

    // Stem
    const stem = createStemTube(params.stemLength, params.stemThickness, rng, new THREE.Color(0x3d2b1f));
    stem.position.y = r;
    group.add(stem);

    if (params.hasLeaves && rng.boolean(0.6)) {
      const leaf = createLeafMesh(params.leafSize, rng, new THREE.Color(0x3a7a2a));
      leaf.position.y = r * 1.1;
      group.add(leaf);
    }

    return group;
  }
}

// ============================================================================
// FlowerFactory
// ============================================================================

/**
 * Generates distinctive flower geometry for each FlowerType.
 * Each flower type has unique petal arrangement and shape.
 * Targets 100-500 triangles per flower for real-time performance.
 */
export class FlowerFactory {
  /**
   * Generate a flower mesh from the given parameters.
   */
  static generate(params: FlowerParams, rng: SeededRandom): THREE.Group {
    switch (params.type) {
      case FlowerType.ROSE:
        return FlowerFactory.generateRose(params, rng);
      case FlowerType.CHERRY_BLOSSOM:
        return FlowerFactory.generateCherryBlossom(params, rng);
      case FlowerType.DAISY:
        return FlowerFactory.generateDaisy(params, rng);
      case FlowerType.TULIP:
        return FlowerFactory.generateTulip(params, rng);
      case FlowerType.SUNFLOWER:
        return FlowerFactory.generateSunflower(params, rng);
      case FlowerType.MAGNOLIA:
        return FlowerFactory.generateMagnolia(params, rng);
      case FlowerType.ORCHID:
        return FlowerFactory.generateOrchid(params, rng);
      case FlowerType.HIBISCUS:
        return FlowerFactory.generateHibiscus(params, rng);
      default:
        return FlowerFactory.generateDaisy(params, rng);
    }
  }

  /**
   * Get default parameters for a given flower type.
   */
  static getDefaultParams(type: FlowerType): FlowerParams {
    const defaults: Record<FlowerType, Omit<FlowerParams, 'type'>> = {
      [FlowerType.ROSE]: {
        petalCount: 20, petalSize: 0.03, petalColor: new THREE.Color(0xcc2244),
        centerSize: 0.008, centerColor: new THREE.Color(0xffdd44),
        stemLength: 0.05, hasLeaves: true,
      },
      [FlowerType.CHERRY_BLOSSOM]: {
        petalCount: 5, petalSize: 0.025, petalColor: new THREE.Color(0xffb7c5),
        centerSize: 0.006, centerColor: new THREE.Color(0xff6688),
        stemLength: 0.03, hasLeaves: false,
      },
      [FlowerType.DAISY]: {
        petalCount: 14, petalSize: 0.035, petalColor: new THREE.Color(0xffffff),
        centerSize: 0.01, centerColor: new THREE.Color(0xffcc00),
        stemLength: 0.04, hasLeaves: true,
      },
      [FlowerType.TULIP]: {
        petalCount: 6, petalSize: 0.03, petalColor: new THREE.Color(0xff4488),
        centerSize: 0.005, centerColor: new THREE.Color(0xffee88),
        stemLength: 0.04, hasLeaves: true,
      },
      [FlowerType.SUNFLOWER]: {
        petalCount: 20, petalSize: 0.04, petalColor: new THREE.Color(0xffcc00),
        centerSize: 0.02, centerColor: new THREE.Color(0x5a3a1a),
        stemLength: 0.06, hasLeaves: true,
      },
      [FlowerType.MAGNOLIA]: {
        petalCount: 9, petalSize: 0.05, petalColor: new THREE.Color(0xfff0f5),
        centerSize: 0.01, centerColor: new THREE.Color(0xdd8844),
        stemLength: 0.04, hasLeaves: false,
      },
      [FlowerType.ORCHID]: {
        petalCount: 5, petalSize: 0.03, petalColor: new THREE.Color(0xcc66ff),
        centerSize: 0.008, centerColor: new THREE.Color(0xffaa44),
        stemLength: 0.04, hasLeaves: true,
      },
      [FlowerType.HIBISCUS]: {
        petalCount: 5, petalSize: 0.04, petalColor: new THREE.Color(0xff3333),
        centerSize: 0.012, centerColor: new THREE.Color(0xffff44),
        stemLength: 0.04, hasLeaves: false,
      },
    };
    return { type, ...defaults[type] };
  }

  /**
   * Randomize parameters within a flower type's natural variation range.
   */
  static randomize(type: FlowerType, rng: SeededRandom): FlowerParams {
    const base = FlowerFactory.getDefaultParams(type);
    base.petalSize *= rng.uniform(0.85, 1.15);
    base.petalCount = Math.max(3, Math.round(base.petalCount * rng.uniform(0.9, 1.1)));
    base.centerSize *= rng.uniform(0.9, 1.1);

    const colorVar = base.petalColor.clone();
    colorVar.offsetHSL(rng.uniform(-0.03, 0.03), rng.uniform(-0.1, 0.1), rng.uniform(-0.08, 0.08));
    base.petalColor = colorVar;

    return base;
  }

  // --------------------------------------------------------------------------
  // Individual flower generators
  // --------------------------------------------------------------------------

  /** Create a petal shape geometry with curvature */
  private static createPetalGeometry(
    length: number,
    width: number,
    curvature: number,
    rng: SeededRandom,
    shapeType: 'round' | 'pointed' | 'notched' | 'broad' | 'cup' = 'round',
  ): THREE.BufferGeometry {
    const shape = new THREE.Shape();

    switch (shapeType) {
      case 'round':
        shape.moveTo(0, 0);
        shape.bezierCurveTo(width * 0.8, length * 0.2, width * 0.6, length * 0.6, 0, length);
        shape.bezierCurveTo(-width * 0.6, length * 0.6, -width * 0.8, length * 0.2, 0, 0);
        break;
      case 'pointed':
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(width * 0.6, length * 0.4, width * 0.2, length * 0.8);
        shape.lineTo(0, length);
        shape.lineTo(-width * 0.2, length * 0.8);
        shape.quadraticCurveTo(-width * 0.6, length * 0.4, 0, 0);
        break;
      case 'notched': {
        // Cherry blossom: heart-shaped with notch at tip
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(width * 0.7, length * 0.3, width * 0.5, length * 0.7);
        shape.quadraticCurveTo(width * 0.3, length * 0.9, width * 0.15, length * 0.95);
        shape.lineTo(0, length * 0.85); // Notch
        shape.lineTo(-width * 0.15, length * 0.95);
        shape.quadraticCurveTo(-width * 0.3, length * 0.9, -width * 0.5, length * 0.7);
        shape.quadraticCurveTo(-width * 0.7, length * 0.3, 0, 0);
        break;
      }
      case 'broad':
        shape.moveTo(0, 0);
        shape.bezierCurveTo(width, length * 0.2, width * 0.8, length * 0.7, 0, length);
        shape.bezierCurveTo(-width * 0.8, length * 0.7, -width, length * 0.2, 0, 0);
        break;
      case 'cup':
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(width * 0.5, length * 0.3, width * 0.3, length * 0.7);
        shape.quadraticCurveTo(width * 0.1, length, 0, length * 1.05);
        shape.quadraticCurveTo(-width * 0.1, length, -width * 0.3, length * 0.7);
        shape.quadraticCurveTo(-width * 0.5, length * 0.3, 0, 0);
        break;
    }

    const geo = new THREE.ShapeGeometry(shape, 4);

    // Apply curvature — bend petals
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      const t = y / length;
      // Cup-like curvature
      positions.setZ(i, Math.sin(t * Math.PI) * curvature * rng.uniform(0.5, 1.5));
    }
    geo.computeVertexNormals();

    return geo;
  }

  /** Rose: spiral petals, tight center */
  private static generateRose(params: FlowerParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const petalMat = new THREE.MeshStandardMaterial({
      color: params.petalColor, roughness: 0.4, metalness: 0.0, side: THREE.DoubleSide,
    });

    // Multiple layers of petals with decreasing size and increasing curl
    const layers = 4;
    for (let layer = 0; layer < layers; layer++) {
      const layerScale = 1.0 - layer * 0.2;
      const petalsInLayer = Math.max(3, Math.round(params.petalCount / layers));
      const curvature = 0.015 * (1 + layer * 0.5);

      for (let i = 0; i < petalsInLayer; i++) {
        const angle = (i / petalsInLayer) * Math.PI * 2 + layer * 0.3;
        const petalGeo = FlowerFactory.createPetalGeometry(
          params.petalSize * layerScale,
          params.petalSize * 0.5 * layerScale,
          curvature,
          rng,
          'round',
        );

        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.rotation.y = angle;
        petal.rotation.x = Math.PI / 4 + layer * 0.2;
        petal.position.y = layer * 0.003;
        group.add(petal);
      }
    }

    // Center
    const centerGeo = new THREE.SphereGeometry(params.centerSize, 6, 5);
    const centerMat = new THREE.MeshStandardMaterial({
      color: params.centerColor, roughness: 0.8, metalness: 0.0,
    });
    const center = new THREE.Mesh(centerGeo, centerMat);
    group.add(center);

    // Stem
    const stem = createStemTube(params.stemLength, 0.002, rng, new THREE.Color(0x2d5a1e));
    stem.position.y = -params.stemLength;
    group.add(stem);

    return group;
  }

  /** Cherry blossom: 5 petals with slight notch */
  private static generateCherryBlossom(params: FlowerParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const petalMat = new THREE.MeshStandardMaterial({
      color: params.petalColor, roughness: 0.35, metalness: 0.0, side: THREE.DoubleSide,
    });

    // 5 notched petals
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const petalGeo = FlowerFactory.createPetalGeometry(
        params.petalSize,
        params.petalSize * 0.5,
        0.008,
        rng,
        'notched',
      );

      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.rotation.y = angle;
      petal.rotation.x = Math.PI / 3 + rng.uniform(-0.1, 0.1);
      group.add(petal);
    }

    // Center with stamens
    const centerGeo = new THREE.SphereGeometry(params.centerSize, 6, 5);
    const centerMat = new THREE.MeshStandardMaterial({
      color: params.centerColor, roughness: 0.7, metalness: 0.0,
    });
    group.add(new THREE.Mesh(centerGeo, centerMat));

    // Small stamens around center
    const stamenMat = new THREE.MeshStandardMaterial({ color: 0xffdd88, roughness: 0.5 });
    const stamenGeo = new THREE.CylinderGeometry(0.0008, 0.0008, params.petalSize * 0.5, 3);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const stamen = new THREE.Mesh(stamenGeo, stamenMat);
      stamen.position.set(
        Math.cos(angle) * params.centerSize * 1.5,
        params.petalSize * 0.2,
        Math.sin(angle) * params.centerSize * 1.5,
      );
      stamen.rotation.x = -0.3;
      group.add(stamen);
    }

    // Stem
    const stem = createStemTube(params.stemLength, 0.001, rng, new THREE.Color(0x5a3a2a));
    stem.position.y = -params.stemLength;
    group.add(stem);

    return group;
  }

  /** Daisy: many thin petals around yellow center */
  private static generateDaisy(params: FlowerParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const petalMat = new THREE.MeshStandardMaterial({
      color: params.petalColor, roughness: 0.35, metalness: 0.0, side: THREE.DoubleSide,
    });

    // Many thin petals
    for (let i = 0; i < params.petalCount; i++) {
      const angle = (i / params.petalCount) * Math.PI * 2;
      const petalGeo = FlowerFactory.createPetalGeometry(
        params.petalSize,
        params.petalSize * 0.2,
        0.005,
        rng,
        'pointed',
      );

      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.rotation.y = angle;
      petal.rotation.x = Math.PI / 2.5;
      group.add(petal);
    }

    // Flat disc center
    const discGeo = new THREE.CylinderGeometry(params.centerSize, params.centerSize, 0.003, 10);
    const discMat = new THREE.MeshStandardMaterial({
      color: params.centerColor, roughness: 0.7, metalness: 0.0,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = 0.002;
    group.add(disc);

    // Stem
    const stem = createStemTube(params.stemLength, 0.0015, rng, new THREE.Color(0x2d5a1e));
    stem.position.y = -params.stemLength;
    group.add(stem);

    if (params.hasLeaves) {
      const leaf = createLeafMesh(0.015, rng, new THREE.Color(0x3a7a2a));
      leaf.position.y = -params.stemLength * 0.4;
      group.add(leaf);
    }

    return group;
  }

  /** Tulip: cup-shaped petals */
  private static generateTulip(params: FlowerParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const petalMat = new THREE.MeshStandardMaterial({
      color: params.petalColor, roughness: 0.4, metalness: 0.0, side: THREE.DoubleSide,
    });

    // 6 cup-shaped petals
    for (let i = 0; i < params.petalCount; i++) {
      const angle = (i / params.petalCount) * Math.PI * 2;
      const petalGeo = FlowerFactory.createPetalGeometry(
        params.petalSize,
        params.petalSize * 0.4,
        0.02,
        rng,
        'cup',
      );

      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.rotation.y = angle;
      // Cup shape — petals angle inward
      petal.rotation.x = Math.PI / 5 + rng.uniform(-0.1, 0.1);
      group.add(petal);
    }

    // Center
    const centerGeo = new THREE.SphereGeometry(params.centerSize, 6, 5);
    const centerMat = new THREE.MeshStandardMaterial({
      color: params.centerColor, roughness: 0.8, metalness: 0.0,
    });
    group.add(new THREE.Mesh(centerGeo, centerMat));

    // Stem
    const stem = createStemTube(params.stemLength, 0.002, rng, new THREE.Color(0x2d5a1e));
    stem.position.y = -params.stemLength;
    group.add(stem);

    if (params.hasLeaves) {
      const leaf = createLeafMesh(0.02, rng, new THREE.Color(0x3a7a2a));
      leaf.position.y = -params.stemLength * 0.3;
      group.add(leaf);
    }

    return group;
  }

  /** Sunflower: large disc with many small petals */
  private static generateSunflower(params: FlowerParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const petalMat = new THREE.MeshStandardMaterial({
      color: params.petalColor, roughness: 0.4, metalness: 0.0, side: THREE.DoubleSide,
    });

    // Many thin petals around the disc
    for (let i = 0; i < params.petalCount; i++) {
      const angle = (i / params.petalCount) * Math.PI * 2;
      const petalGeo = FlowerFactory.createPetalGeometry(
        params.petalSize * 0.8,
        params.petalSize * 0.2,
        0.005,
        rng,
        'pointed',
      );

      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.rotation.y = angle;
      petal.rotation.x = Math.PI / 2.2;
      group.add(petal);
    }

    // Large disc center
    const discGeo = new THREE.CylinderGeometry(params.centerSize, params.centerSize, 0.005, 12);
    const discMat = new THREE.MeshStandardMaterial({
      color: params.centerColor, roughness: 0.8, metalness: 0.0,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = 0.003;
    group.add(disc);

    // Seed pattern on disc — small bumps
    const seedMat = new THREE.MeshStandardMaterial({ color: 0x3a2a0a, roughness: 0.9 });
    const seedGeo = new THREE.SphereGeometry(0.002, 4, 3);
    const seedCount = 15;
    for (let i = 0; i < seedCount; i++) {
      const angle = rng.uniform(0, Math.PI * 2);
      const r = rng.uniform(0, params.centerSize * 0.7);
      const seed = new THREE.Mesh(seedGeo, seedMat);
      seed.position.set(Math.cos(angle) * r, 0.006, Math.sin(angle) * r);
      group.add(seed);
    }

    // Thick stem
    const stem = createStemTube(params.stemLength, 0.003, rng, new THREE.Color(0x2d5a1e));
    stem.position.y = -params.stemLength;
    group.add(stem);

    return group;
  }

  /** Magnolia: large broad petals */
  private static generateMagnolia(params: FlowerParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const petalMat = new THREE.MeshStandardMaterial({
      color: params.petalColor, roughness: 0.35, metalness: 0.0, side: THREE.DoubleSide,
    });

    // 9 broad petals in 3 layers of 3
    const layers = 3;
    for (let layer = 0; layer < layers; layer++) {
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + layer * 0.5;
        const scale = 1.0 - layer * 0.15;
        const petalGeo = FlowerFactory.createPetalGeometry(
          params.petalSize * scale,
          params.petalSize * 0.5 * scale,
          0.012,
          rng,
          'broad',
        );

        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.rotation.y = angle;
        petal.rotation.x = Math.PI / 3 + layer * 0.2;
        petal.position.y = layer * 0.004;
        group.add(petal);
      }
    }

    // Center
    const centerGeo = new THREE.SphereGeometry(params.centerSize, 6, 5);
    const centerMat = new THREE.MeshStandardMaterial({
      color: params.centerColor, roughness: 0.8, metalness: 0.0,
    });
    group.add(new THREE.Mesh(centerGeo, centerMat));

    // Stem
    const stem = createStemTube(params.stemLength, 0.002, rng, new THREE.Color(0x3d5a2e));
    stem.position.y = -params.stemLength;
    group.add(stem);

    return group;
  }

  /** Orchid: distinctive lip petal */
  private static generateOrchid(params: FlowerParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const petalMat = new THREE.MeshStandardMaterial({
      color: params.petalColor, roughness: 0.4, metalness: 0.0, side: THREE.DoubleSide,
    });

    // 3 upper petals
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI - Math.PI / 2;
      const petalGeo = FlowerFactory.createPetalGeometry(
        params.petalSize,
        params.petalSize * 0.4,
        0.01,
        rng,
        'broad',
      );

      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.rotation.y = angle;
      petal.rotation.x = Math.PI / 3;
      group.add(petal);
    }

    // 2 side sepals
    for (let i = 0; i < 2; i++) {
      const angle = (i / 2) * Math.PI + Math.PI / 4;
      const petalGeo = FlowerFactory.createPetalGeometry(
        params.petalSize * 0.8,
        params.petalSize * 0.3,
        0.008,
        rng,
        'pointed',
      );

      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.rotation.y = angle;
      petal.rotation.x = Math.PI / 4;
      group.add(petal);
    }

    // Lip petal (distinctive orchid feature)
    const lipMat = new THREE.MeshStandardMaterial({
      color: params.centerColor, roughness: 0.4, metalness: 0.0, side: THREE.DoubleSide,
    });
    const lipGeo = FlowerFactory.createPetalGeometry(
      params.petalSize * 1.2,
      params.petalSize * 0.7,
      0.02,
      rng,
      'broad',
    );
    const lip = new THREE.Mesh(lipGeo, lipMat);
    lip.rotation.y = Math.PI;
    lip.rotation.x = Math.PI / 6;
    group.add(lip);

    // Center column
    const colGeo = new THREE.CylinderGeometry(params.centerSize * 0.3, params.centerSize * 0.5, params.petalSize * 0.3, 5);
    const colMat = new THREE.MeshStandardMaterial({ color: params.centerColor, roughness: 0.6 });
    group.add(new THREE.Mesh(colGeo, colMat));

    // Stem
    const stem = createStemTube(params.stemLength, 0.002, rng, new THREE.Color(0x3d5a2e));
    stem.position.y = -params.stemLength;
    group.add(stem);

    return group;
  }

  /** Hibiscus: 5 large petals with prominent stamen */
  private static generateHibiscus(params: FlowerParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const petalMat = new THREE.MeshStandardMaterial({
      color: params.petalColor, roughness: 0.35, metalness: 0.0, side: THREE.DoubleSide,
    });

    // 5 large, slightly overlapping petals
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const petalGeo = FlowerFactory.createPetalGeometry(
        params.petalSize,
        params.petalSize * 0.5,
        0.01,
        rng,
        'broad',
      );

      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.rotation.y = angle;
      petal.rotation.x = Math.PI / 2.8;
      group.add(petal);
    }

    // Prominent stamen column
    const stamenGeo = new THREE.CylinderGeometry(
      params.centerSize * 0.15,
      params.centerSize * 0.3,
      params.petalSize * 0.6,
      6,
    );
    const stamenMat = new THREE.MeshStandardMaterial({
      color: 0xffff44, roughness: 0.5, metalness: 0.0,
    });
    const stamen = new THREE.Mesh(stamenGeo, stamenMat);
    stamen.position.y = params.petalSize * 0.3;
    group.add(stamen);

    // Stamen tip (anther)
    const antherGeo = new THREE.SphereGeometry(params.centerSize * 0.2, 5, 4);
    const anther = new THREE.Mesh(antherGeo, new THREE.MeshStandardMaterial({
      color: 0xffaa00, roughness: 0.6,
    }));
    anther.position.y = params.petalSize * 0.6;
    group.add(anther);

    // Center
    const centerGeo = new THREE.SphereGeometry(params.centerSize, 6, 5);
    const centerMat = new THREE.MeshStandardMaterial({
      color: params.centerColor, roughness: 0.7, metalness: 0.0,
    });
    group.add(new THREE.Mesh(centerGeo, centerMat));

    // Stem
    const stem = createStemTube(params.stemLength, 0.002, rng, new THREE.Color(0x2d5a1e));
    stem.position.y = -params.stemLength;
    group.add(stem);

    return group;
  }
}

// ============================================================================
// TwigGenerator
// ============================================================================

/**
 * Generates twig sub-trees (miniature tree-like structures) for placement
 * at branch terminal points. Matches original Infinigen's make_twig_collection.
 * Creates fine detail that makes trees look realistic.
 */
export class TwigGenerator {
  /**
   * Generate a twig sub-tree from the given parameters.
   */
  static generate(params: TwigParams, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();

    TwigGenerator.generateBranchRecursive(
      group,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0), // Initial direction: up
      params.branchLength,
      params.branchThickness,
      params.recursionDepth,
      params,
      rng,
    );

    return group;
  }

  /**
   * Get default twig parameters.
   */
  static getDefaultParams(): TwigParams {
    return {
      branchCount: 3,
      branchLength: 0.1,
      branchThickness: 0.005,
      recursionDepth: 2,
      spreadAngle: Math.PI / 4,
      leafCount: 5,
      leafSize: 0.02,
      barkColor: new THREE.Color(0x4a3728),
      leafColor: new THREE.Color(0x2d5a1d),
      sizeScale: 0.15,
    };
  }

  /**
   * Create twig params sized relative to a parent branch.
   */
  static createScaledParams(parentBranchLength: number, scale: number): TwigParams {
    const base = TwigGenerator.getDefaultParams();
    base.branchLength = parentBranchLength * scale * 0.3;
    base.branchThickness = base.branchLength * 0.05;
    base.leafSize = base.branchLength * 0.2;
    base.sizeScale = scale;
    return base;
  }

  /** Recursive branch generation */
  private static generateBranchRecursive(
    parent: THREE.Group,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    thickness: number,
    depth: number,
    params: TwigParams,
    rng: SeededRandom,
  ): void {
    if (depth < 0 || length < 0.005 || thickness < 0.001) return;

    // Create branch segment
    const branchGeo = new THREE.CylinderGeometry(
      thickness * 0.7,
      thickness,
      length,
      Math.max(4, 6 - depth),
    );
    const branchMat = new THREE.MeshStandardMaterial({
      color: params.barkColor,
      roughness: 0.8,
      metalness: 0.0,
    });
    const branch = new THREE.Mesh(branchGeo, branchMat);
    branch.castShadow = true;

    // Position and orient along direction
    branch.position.copy(origin).addScaledVector(direction, length * 0.5);

    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
    branch.quaternion.copy(quat);

    parent.add(branch);

    // End point
    const endPoint = origin.clone().addScaledVector(direction, length);

    // Add leaves at terminal or near-terminal branches
    if (depth <= 1) {
      TwigGenerator.addLeaves(parent, endPoint, direction, params, rng);
    }

    // Recurse with sub-branches
    if (depth > 0) {
      const subBranchCount = rng.nextInt(2, params.branchCount + 1);
      for (let i = 0; i < subBranchCount; i++) {
        // Branch direction: spread around parent direction with random perturbation
        const spreadX = rng.uniform(-params.spreadAngle, params.spreadAngle);
        const spreadZ = rng.uniform(-params.spreadAngle, params.spreadAngle);

        const subDir = direction.clone().normalize();
        // Rotate around a random perpendicular axis
        const perpAxis = new THREE.Vector3(1, 0, 0);
        if (Math.abs(subDir.dot(perpAxis)) > 0.9) {
          perpAxis.set(0, 0, 1);
        }
        const rotQuat1 = new THREE.Quaternion().setFromAxisAngle(perpAxis, spreadX);
        const rotQuat2 = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0).applyQuaternion(rotQuat1).normalize(),
          spreadZ,
        );
        subDir.applyQuaternion(rotQuat1).applyQuaternion(rotQuat2).normalize();

        const subLength = length * rng.uniform(0.5, 0.8);
        const subThickness = thickness * rng.uniform(0.4, 0.7);

        TwigGenerator.generateBranchRecursive(
          parent,
          endPoint,
          subDir,
          subLength,
          subThickness,
          depth - 1,
          params,
          rng,
        );
      }
    }
  }

  /** Add leaves at a branch endpoint */
  private static addLeaves(
    parent: THREE.Group,
    position: THREE.Vector3,
    branchDirection: THREE.Vector3,
    params: TwigParams,
    rng: SeededRandom,
  ): void {
    for (let i = 0; i < params.leafCount; i++) {
      const leaf = createLeafMesh(params.leafSize, rng, params.leafColor);
      leaf.position.copy(position);

      // Slight offset
      leaf.position.x += rng.uniform(-params.leafSize, params.leafSize);
      leaf.position.z += rng.uniform(-params.leafSize, params.leafSize);

      // Orient roughly along branch direction with variation
      leaf.rotation.x += rng.uniform(-0.5, 0.5);
      leaf.rotation.y = rng.uniform(0, Math.PI * 2);
      leaf.rotation.z += rng.uniform(-0.3, 0.3);

      parent.add(leaf);
    }
  }
}

// ============================================================================
// TreeChildPlacer
// ============================================================================

/**
 * Places fruits, flowers, and twig sub-trees on branch terminal points.
 * Matches the original Infinigen's add_tree_children() pattern.
 *
 * The placer takes a tree group and its branch endpoint positions/normals,
 * then distributes child objects (fruits, flowers, twigs) at those positions
 * according to the provided configuration.
 */
export class TreeChildPlacer {
  /**
   * Place fruit, flowers, and twig sub-trees on branch terminal points.
   *
   * @param treeGroup The parent tree group to add children to
   * @param branchEndpoints Array of branch tip positions in world space
   * @param branchNormals Array of outward-facing normals at each endpoint
   * @param config Configuration for what to place
   * @param rng Seeded random for deterministic placement
   * @returns A group containing all placed children
   */
  static placeChildren(
    treeGroup: THREE.Group,
    branchEndpoints: THREE.Vector3[],
    branchNormals: THREE.Vector3[],
    config: TreeChildrenConfig,
    rng: SeededRandom,
  ): THREE.Group {
    const childrenGroup = new THREE.Group();
    childrenGroup.name = 'tree_children';

    if (branchEndpoints.length === 0) return childrenGroup;

    // Shuffle endpoints for random selection
    const indices = Array.from({ length: branchEndpoints.length }, (_, i) => i);
    rng.shuffle(indices);

    let fruitPlaced = 0;
    let flowerPlaced = 0;
    let twigPlaced = 0;

    // Calculate how many of each to place
    const totalEndpoints = branchEndpoints.length;
    const targetFruit = config.fruitEnabled ? Math.floor(totalEndpoints * config.fruitDensity) : 0;
    const targetFlowers = config.flowerEnabled ? Math.floor(totalEndpoints * config.flowerDensity) : 0;
    const targetTwigs = config.twigEnabled ? Math.floor(totalEndpoints * 0.3) : 0;

    for (const idx of indices) {
      const position = branchEndpoints[idx];
      const normal = branchNormals[idx] || new THREE.Vector3(0, 1, 0);

      // Try placing fruit
      if (fruitPlaced < targetFruit && config.fruitEnabled) {
        const fruitParams = FruitFactory.randomize(config.fruitType, new SeededRandom(rng.nextInt(0, 99999)));
        const sizeRange = config.fruitSizeRange;
        fruitParams.size = rng.uniform(sizeRange[0], sizeRange[1]);

        const fruit = FruitFactory.generate(fruitParams, new SeededRandom(rng.nextInt(0, 99999)));
        fruit.position.copy(position);
        fruit.position.addScaledVector(normal, fruitParams.size * 0.5); // Offset outward

        // Orient fruit along normal (stem points inward)
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, normal.clone().negate());
        fruit.quaternion.copy(quat);

        fruit.userData.type = 'fruit';
        fruit.userData.fruitType = config.fruitType;
        childrenGroup.add(fruit);
        fruitPlaced++;
        continue;
      }

      // Try placing flower
      if (flowerPlaced < targetFlowers && config.flowerEnabled) {
        const flowerParams = FlowerFactory.randomize(config.flowerType, new SeededRandom(rng.nextInt(0, 99999)));
        const sizeRange = config.flowerSizeRange;
        flowerParams.petalSize = rng.uniform(sizeRange[0], sizeRange[1]);

        const flower = FlowerFactory.generate(flowerParams, new SeededRandom(rng.nextInt(0, 99999)));
        flower.position.copy(position);
        flower.position.addScaledVector(normal, 0.01); // Slight offset outward

        // Orient flower facing outward
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
        flower.quaternion.copy(quat);

        flower.userData.type = 'flower';
        flower.userData.flowerType = config.flowerType;
        childrenGroup.add(flower);
        flowerPlaced++;
        continue;
      }

      // Try placing twig
      if (twigPlaced < targetTwigs && config.twigEnabled) {
        const twigParams = TwigGenerator.createScaledParams(1.0, config.twigSizeScale);
        twigParams.recursionDepth = config.twigDetail;
        twigParams.barkColor = new THREE.Color(0x4a3728);
        // Use the normal direction to influence twig orientation
        const leafColorOffset = rng.uniform(-0.05, 0.05);
        twigParams.leafColor = new THREE.Color(0x2d5a1d).offsetHSL(0, 0, leafColorOffset);

        const twig = TwigGenerator.generate(twigParams, new SeededRandom(rng.nextInt(0, 99999)));
        twig.position.copy(position);

        // Orient twig along normal direction
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
        twig.quaternion.copy(quat);

        twig.userData.type = 'twig';
        childrenGroup.add(twig);
        twigPlaced++;
        continue;
      }

      // If all targets met, stop
      if (fruitPlaced >= targetFruit && flowerPlaced >= targetFlowers && twigPlaced >= targetTwigs) {
        break;
      }
    }

    treeGroup.add(childrenGroup);
    return childrenGroup;
  }

  /**
   * Convenience method: extract branch endpoints from a tree skeleton's
   * terminal vertices and place children.
   */
  static placeChildrenFromSkeleton(
    treeGroup: THREE.Group,
    vertices: Array<{ position: THREE.Vector3; generation: number }>,
    terminalIndices: number[],
    config: TreeChildrenConfig,
    rng: SeededRandom,
  ): THREE.Group {
    const endpoints: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];

    for (const idx of terminalIndices) {
      const v = vertices[idx];
      endpoints.push(v.position.clone());

      // Approximate normal: direction from parent vertex toward this terminal
      // Use up vector as fallback
      const normal = v.position.clone().normalize();
      if (normal.lengthSq() < 0.001) {
        normal.set(0, 1, 0);
      }
      normals.push(normal);
    }

    return TreeChildPlacer.placeChildren(treeGroup, endpoints, normals, config, rng);
  }
}

// ============================================================================
// SeasonalAppearance
// ============================================================================

/**
 * Manages seasonal appearance changes for tree children (fruits, flowers, twigs).
 * Modulates colors, visibility, and maturity based on season configuration.
 */
export class SeasonalAppearance {
  private config: SeasonConfig;

  constructor(config?: SeasonConfig) {
    this.config = config ?? DEFAULT_SEASON_CONFIGS.summer;
  }

  /**
   * Get the current season configuration.
   */
  getConfig(): SeasonConfig {
    return { ...this.config };
  }

  /**
   * Set the season configuration.
   */
  setConfig(config: SeasonConfig): void {
    this.config = config;
  }

  /**
   * Set the season using default configurations.
   */
  setSeason(season: 'spring' | 'summer' | 'autumn' | 'winter'): void {
    this.config = { ...DEFAULT_SEASON_CONFIGS[season] };
  }

  /**
   * Apply seasonal modifications to a tree children group.
   * Adjusts visibility and appearance of fruits, flowers, and twigs.
   *
   * @param childrenGroup The group returned by TreeChildPlacer.placeChildren()
   */
  applyToGroup(childrenGroup: THREE.Group): void {
    childrenGroup.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return;

      const mat = child.material as THREE.MeshStandardMaterial;
      const type = child.userData.type;

      switch (type) {
        case 'fruit': {
          // Modulate fruit color based on maturity
          // Unripe (0) = greenish, ripe (1) = full color
          const maturity = this.config.fruitMaturity;
          if (maturity < 0.5) {
            // Blend toward green
            const greenColor = new THREE.Color(0x4a7a2a);
            mat.color.lerp(greenColor, 1 - maturity * 2);
          }
          // Hide fruit if out of season (winter)
          if (this.config.season === 'winter') {
            child.visible = false;
          }
          break;
        }

        case 'flower': {
          // Modulate flower visibility based on bloom state
          const bloom = this.config.flowerBloom;
          child.visible = bloom > 0.1;

          // Scale flowers based on bloom (bud to full)
          const scale = 0.3 + bloom * 0.7;
          child.scale.setScalar(scale);
          break;
        }

        case 'twig': {
          // Modulate leaf density (reduce in autumn, minimal in winter)
          if (this.config.leafDensity < 0.1) {
            // Bare twigs in winter — hide leaf meshes but keep branches
            if (mat.color && this.isLeafColor(mat.color)) {
              child.visible = false;
            }
          } else {
            child.visible = true;
            // Adjust leaf color for season
            mat.color.copy(this.config.leafColor);
          }
          break;
        }
      }
    });
  }

  /**
   * Get fruit parameters adjusted for the current season.
   */
  getSeasonalFruitParams(baseType: FruitType, rng: SeededRandom): FruitParams {
    const params = FruitFactory.randomize(baseType, rng);

    // Adjust size and color for season
    params.size *= 0.5 + this.config.fruitMaturity * 0.5;

    if (this.config.fruitMaturity < 0.3) {
      // Green/unripe
      params.color = new THREE.Color(0x4a7a2a);
    } else if (this.config.fruitMaturity < 0.7) {
      // Transitional — blend green with ripe color
      const green = new THREE.Color(0x4a7a2a);
      params.color.lerp(green, 1 - (this.config.fruitMaturity - 0.3) / 0.4);
    }

    return params;
  }

  /**
   * Get flower parameters adjusted for the current season.
   */
  getSeasonalFlowerParams(baseType: FlowerType, rng: SeededRandom): FlowerParams {
    const params = FlowerFactory.randomize(baseType, rng);

    // Scale petals based on bloom state
    params.petalSize *= this.config.flowerBloom;

    return params;
  }

  /**
   * Get twig parameters adjusted for the current season.
   */
  getSeasonalTwigParams(rng: SeededRandom): TwigParams {
    const params = TwigGenerator.getDefaultParams();

    // Reduce leaf count in autumn, minimal in winter
    params.leafCount = Math.round(params.leafCount * this.config.leafDensity);
    params.leafColor = this.config.leafColor.clone();

    return params;
  }

  /**
   * Get a complete TreeChildrenConfig adjusted for the current season.
   */
  getSeasonalChildrenConfig(
    baseConfig: TreeChildrenConfig,
  ): TreeChildrenConfig {
    return {
      ...baseConfig,
      fruitEnabled: baseConfig.fruitEnabled && this.config.fruitMaturity > 0.1,
      fruitDensity: baseConfig.fruitDensity * this.config.fruitMaturity,
      flowerEnabled: baseConfig.flowerEnabled && this.config.flowerBloom > 0.1,
      flowerDensity: baseConfig.flowerDensity * this.config.flowerBloom,
      twigEnabled: baseConfig.twigEnabled,
    };
  }

  /** Check if a color looks like a leaf color (heuristic) */
  private isLeafColor(color: THREE.Color): boolean {
    const { r, g, b } = color;
    // Leaf colors tend to have high green component relative to red/blue
    return g > r && g > b * 1.5;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Generate a fruit tree with fruits/flowers/twigs already placed.
 * Convenience function combining TreeChildPlacer with fruit/flower generation.
 *
 * @param treeGroup Pre-generated tree group
 * @param branchEndpoints Terminal branch positions
 * @param branchNormals Outward normals at endpoints
 * @param config Children placement configuration
 * @param season Season for appearance modulation
 * @param seed Random seed
 */
export function generateFruitTree(
  treeGroup: THREE.Group,
  branchEndpoints: THREE.Vector3[],
  branchNormals: THREE.Vector3[],
  config: Partial<TreeChildrenConfig> = {},
  season: 'spring' | 'summer' | 'autumn' | 'winter' = 'summer',
  seed: number = 42,
): THREE.Group {
  const rng = new SeededRandom(seed);
  const fullConfig: TreeChildrenConfig = {
    ...DEFAULT_TREE_CHILDREN_CONFIG,
    ...config,
  };

  // Apply seasonal adjustments
  const seasonal = new SeasonalAppearance(DEFAULT_SEASON_CONFIGS[season]);
  const seasonalConfig = seasonal.getSeasonalChildrenConfig(fullConfig);

  // Place children
  const childrenGroup = TreeChildPlacer.placeChildren(
    treeGroup,
    branchEndpoints,
    branchNormals,
    seasonalConfig,
    rng,
  );

  // Apply seasonal appearance
  seasonal.applyToGroup(childrenGroup);

  return treeGroup;
}

/**
 * Quick generation of a single fruit for standalone use.
 */
export function generateFruit(
  type: FruitType,
  seed: number = 42,
  size?: number,
): THREE.Group {
  const rng = new SeededRandom(seed);
  const params = FruitFactory.randomize(type, rng);
  if (size !== undefined) params.size = size;
  return FruitFactory.generate(params, new SeededRandom(seed + 1));
}

/**
 * Quick generation of a single flower for standalone use.
 */
export function generateFlower(
  type: FlowerType,
  seed: number = 42,
  petalSize?: number,
): THREE.Group {
  const rng = new SeededRandom(seed);
  const params = FlowerFactory.randomize(type, rng);
  if (petalSize !== undefined) params.petalSize = petalSize;
  return FlowerFactory.generate(params, new SeededRandom(seed + 1));
}

/**
 * Quick generation of a twig sub-tree for standalone use.
 */
export function generateTwig(
  seed: number = 42,
  scale: number = 0.15,
): THREE.Group {
  const rng = new SeededRandom(seed);
  const params = TwigGenerator.getDefaultParams();
  params.sizeScale = scale;
  params.branchLength *= scale;
  params.branchThickness *= scale;
  params.leafSize *= scale;
  return TwigGenerator.generate(params, rng);
}
