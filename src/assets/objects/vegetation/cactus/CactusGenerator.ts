/**
 * CactusGenerator.ts
 *
 * Procedural cactus generator ported from infinigen's cactus asset system.
 * Supports 7 visually distinct variants using Three.js procedural geometry.
 *
 * Original Python source:
 *   infinigen/assets/objects/cactus/{base,columnar,globular,kalidium,pricky_pear,spike,generate}.py
 *
 * Variants:
 *   - Columnar   – tall branching columns with star cross-section
 *   - Globular   – rounded globe with star cross-section and subtle twist
 *   - Kalidium   – coral-like branching lattice of thin twigs
 *   - PricklyPear– flat pad cactus, stacked recursively
 *   - Spike      – tall, thin spiky cactus
 *   - Barrel     – short, wide barrel shape with prominent ribs
 *   - Saguaro    – classic tall column with upward-curving arms
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/math/index';

// ============================================================================
// Types & Configuration
// ============================================================================

/** The seven supported cactus variant identifiers */
export type CactusVariant =
  | 'Columnar'
  | 'Globular'
  | 'Kalidium'
  | 'PricklyPear'
  | 'Spike'
  | 'Barrel'
  | 'Saguaro';

/** All variant names for iteration / selection */
export const CACTUS_VARIANTS: readonly CactusVariant[] = [
  'Columnar',
  'Globular',
  'Kalidium',
  'PricklyPear',
  'Spike',
  'Barrel',
  'Saguaro',
] as const;

/** Per-variant configuration parameters */
export interface CactusVariantConfig {
  /** Display name */
  name: string;
  /** Approximate height range in world units */
  height: { min: number; max: number };
  /** Approximate radius range in world units */
  radius: { min: number; max: number };
  /** Number of star ribs / cross-section points (0 = no ribs) */
  ribCount: { min: number; max: number };
  /** Spine density multiplier (0 = no spines) */
  spineDensity: number;
  /** Probability of spawning a flower on top [0-1] */
  flowerChance: number;
  /** Body color hue range (green band in HSV) */
  hueRange: { min: number; max: number };
  /** Body color saturation range */
  saturationRange: { min: number; max: number };
}

/** Preset configurations for each variant */
export const CACTUS_VARIANT_CONFIGS: Record<CactusVariant, CactusVariantConfig> = {
  Columnar: {
    name: 'Columnar Cactus',
    height: { min: 1.8, max: 3.5 },
    radius: { min: 0.2, max: 0.35 },
    ribCount: { min: 5, max: 8 },
    spineDensity: 0.8,
    flowerChance: 0.3,
    hueRange: { min: 0.25, max: 0.38 },
    saturationRange: { min: 0.6, max: 0.85 },
  },
  Globular: {
    name: 'Globular Cactus',
    height: { min: 0.6, max: 1.2 },
    radius: { min: 0.4, max: 0.7 },
    ribCount: { min: 6, max: 12 },
    spineDensity: 0.9,
    flowerChance: 0.5,
    hueRange: { min: 0.25, max: 0.4 },
    saturationRange: { min: 0.5, max: 0.8 },
  },
  Kalidium: {
    name: 'Kalidium Cactus',
    height: { min: 0.8, max: 1.6 },
    radius: { min: 0.3, max: 0.6 },
    ribCount: { min: 0, max: 0 },
    spineDensity: 0.0,
    flowerChance: 0.0,
    hueRange: { min: 0.2, max: 0.35 },
    saturationRange: { min: 0.4, max: 0.6 },
  },
  PricklyPear: {
    name: 'Prickly Pear Cactus',
    height: { min: 0.5, max: 1.2 },
    radius: { min: 0.3, max: 0.5 },
    ribCount: { min: 0, max: 0 },
    spineDensity: 0.7,
    flowerChance: 0.4,
    hueRange: { min: 0.22, max: 0.36 },
    saturationRange: { min: 0.5, max: 0.75 },
  },
  Spike: {
    name: 'Spike Cactus',
    height: { min: 1.5, max: 2.8 },
    radius: { min: 0.1, max: 0.2 },
    ribCount: { min: 8, max: 14 },
    spineDensity: 1.0,
    flowerChance: 0.2,
    hueRange: { min: 0.28, max: 0.42 },
    saturationRange: { min: 0.5, max: 0.7 },
  },
  Barrel: {
    name: 'Barrel Cactus',
    height: { min: 0.5, max: 1.0 },
    radius: { min: 0.35, max: 0.55 },
    ribCount: { min: 12, max: 20 },
    spineDensity: 1.0,
    flowerChance: 0.6,
    hueRange: { min: 0.2, max: 0.35 },
    saturationRange: { min: 0.55, max: 0.8 },
  },
  Saguaro: {
    name: 'Saguaro Cactus',
    height: { min: 3.0, max: 5.0 },
    radius: { min: 0.2, max: 0.35 },
    ribCount: { min: 10, max: 16 },
    spineDensity: 0.6,
    flowerChance: 0.3,
    hueRange: { min: 0.25, max: 0.38 },
    saturationRange: { min: 0.6, max: 0.85 },
  },
};

/** Options for cactus generation */
export interface CactusGeneratorOptions {
  /** Which variant to generate (random if not specified) */
  variant?: CactusVariant;
  /** Level of detail (0 = highest) */
  lod?: number;
  /** Whether to include spine generation (default: true) */
  includeSpines?: boolean;
  /** Whether to include optional flowers/fruit (default: true) */
  includeFlowers?: boolean;
  /** Scale multiplier for the entire cactus (default: 1) */
  scale?: number;
}

// ============================================================================
// Material helpers
// ============================================================================

/** Cached cactus body material keyed by color hex */
const materialCache = new Map<number, THREE.MeshStandardMaterial>();
/** Cached spine material */
let spineMaterialCache: THREE.MeshStandardMaterial | null = null;
/** Cached flower material */
let flowerMaterialCache: THREE.MeshStandardMaterial | null = null;

/**
 * Create or retrieve a cactus body material with procedural green color.
 * Uses HSV-based hue/saturation ranges from the variant config.
 */
function getCactusBodyMaterial(
  rng: SeededRandom,
  config: CactusVariantConfig,
): THREE.MeshStandardMaterial {
  const hue = rng.uniform(config.hueRange.min, config.hueRange.max);
  const sat = rng.uniform(config.saturationRange.min, config.saturationRange.max);
  const val = rng.uniform(0.15, 0.25);
  const color = new THREE.Color().setHSL(hue, sat, val);
  const hex = color.getHex();

  if (!materialCache.has(hex)) {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      metalness: 0.0,
    });
    materialCache.set(hex, mat);
  }
  return materialCache.get(hex)!;
}

/**
 * Create or retrieve the spine material (pale tan/cream).
 */
function getSpineMaterial(): THREE.MeshStandardMaterial {
  if (!spineMaterialCache) {
    spineMaterialCache = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xd4c5a0),
      roughness: 0.8,
      metalness: 0.05,
    });
  }
  return spineMaterialCache;
}

/**
 * Create or retrieve the flower material (warm pink/magenta).
 */
function getFlowerMaterial(): THREE.MeshStandardMaterial {
  if (!flowerMaterialCache) {
    flowerMaterialCache = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xe91e90),
      roughness: 0.5,
      metalness: 0.0,
    });
  }
  return flowerMaterialCache;
}

// ============================================================================
// Geometry helpers
// ============================================================================

/**
 * Create a lathe profile for a columnar cactus body.
 * Returns an array of Vector2 points describing the cross-section radius
 * from bottom (y=0) to top (y=height).
 *
 * Ported from ColumnarBaseCactusFactory.radius_fn.
 */
function columnarProfilePoints(
  rng: SeededRandom,
  baseRadius: number,
  height: number,
  segments: number,
): THREE.Vector2[] {
  const radiusDecay = rng.uniform(0.5, 0.8);
  const radiusDecayRoot = rng.uniform(0.7, 0.9);
  const leafAlpha = rng.uniform(2, 3);

  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let r = baseRadius * radiusDecay;

    // Root flaring: wider at the base
    if (t < 1 / segments * 2) {
      const rootT = t / (2 / segments);
      r *= Math.pow(radiusDecayRoot, 1 - rootT);
    }

    // Tip tapering: narrow at the top
    if (t > 1 - 2 / segments) {
      const tipT = (t - (1 - 2 / segments)) / (2 / segments);
      r *= Math.pow(1 - Math.pow(tipT, leafAlpha), 1 / leafAlpha);
    }

    points.push(new THREE.Vector2(Math.max(0.001, r), t * height));
  }
  return points;
}

/**
 * Create a lathe profile for a globular cactus body.
 * Returns an array of Vector2 points describing the cross-section.
 *
 * Ported from GlobularBaseCactusFactory.geo_globular anchors.
 */
function globularProfilePoints(
  rng: SeededRandom,
  baseRadius: number,
  height: number,
): THREE.Vector2[] {
  const scale = rng.logUniform(0.5, 1.0);

  // Anchors from original: [(0, 0.2-0.4), (0.4-0.6, log_uniform 0.5-0.8), (0.8-0.85, 0.4-0.6), (1.0, 0.05)]
  const anchors = [
    { t: 0, r: rng.uniform(0.2, 0.4) * scale },
    { t: rng.uniform(0.4, 0.6), r: rng.logUniform(0.5, 0.8) * scale },
    { t: rng.uniform(0.8, 0.85), r: rng.uniform(0.4, 0.6) * scale },
    { t: 1.0, r: 0.05 * scale },
  ];

  // Interpolate anchor points into a smooth profile
  const segments = 32;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Piecewise linear interpolation between anchors
    let r = anchors[anchors.length - 1].r;
    for (let a = 0; a < anchors.length - 1; a++) {
      if (t >= anchors[a].t && t <= anchors[a + 1].t) {
        const localT = (t - anchors[a].t) / (anchors[a + 1].t - anchors[a].t);
        // Smoothstep for nicer curve
        const st = localT * localT * (3 - 2 * localT);
        r = anchors[a].r + (anchors[a + 1].r - anchors[a].r) * st;
        break;
      }
    }
    points.push(new THREE.Vector2(Math.max(0.001, r * baseRadius), t * height));
  }
  return points;
}

/**
 * Apply star-shaped rib displacement to a geometry.
 * Ported from ColumnarBaseCactusFactory.geo_star and GlobularBaseCactusFactory.geo_globular.
 *
 * Alternately pushes every other vertex outward at the same Y level,
 * creating visible ribs on the cactus surface.
 */
function applyRibDisplacement(
  geometry: THREE.BufferGeometry,
  ribCount: number,
  strength: number,
  rng: SeededRandom,
): void {
  const posAttr = geometry.attributes.position;
  const normalAttr = geometry.attributes.normal;
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    normal.fromBufferAttribute(normalAttr ?? posAttr, i);

    // Calculate angle around Y axis to determine rib membership
    const angle = Math.atan2(vertex.x, vertex.z);
    const ribIndex = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * ribCount);
    const isOuter = ribIndex % 2 === 0;

    if (isOuter) {
      // Push outward along normal
      const displacement = strength * rng.uniform(0.8, 1.2);
      vertex.addScaledVector(normal, displacement);
    } else {
      // Slightly inward
      const displacement = -strength * 0.3 * rng.uniform(0.5, 1.0);
      vertex.addScaledVector(normal, displacement);
    }

    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
}

/**
 * Apply subtle noise displacement for organic surface variation.
 * Ported from geo_extension usage in original code.
 */
function applyNoiseDisplacement(
  geometry: THREE.BufferGeometry,
  seed: number,
  amplitude: number,
): void {
  const posAttr = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    // Simple deterministic noise using position hashing
    const nx = Math.sin(vertex.x * 7.3 + seed * 0.1) * 0.5 +
               Math.sin(vertex.y * 13.7 + seed * 0.3) * 0.3;
    const ny = Math.sin(vertex.y * 11.1 + seed * 0.2) * 0.5 +
               Math.sin(vertex.z * 9.3 + seed * 0.4) * 0.3;
    const nz = Math.sin(vertex.z * 8.7 + seed * 0.15) * 0.5 +
               Math.sin(vertex.x * 12.3 + seed * 0.35) * 0.3;

    vertex.x += nx * amplitude;
    vertex.y += ny * amplitude;
    vertex.z += nz * amplitude;

    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
}

// ============================================================================
// Spine generation
// ============================================================================

/**
 * Generate spines (thin cones) distributed on the surface of a cactus mesh.
 * Ported from spike.py build_spikes / geo_spikes.
 *
 * @param mesh - The cactus body mesh to add spines to
 * @param rng - Seeded random for deterministic placement
 * @param density - Spine density multiplier (0-1+)
 * @param spineRadius - Base radius of each spine
 * @param spineLength - Length of each spine
 * @param capPercentage - Fraction of top surface treated as "cap" with clustered spines
 */
function generateSpines(
  mesh: THREE.Mesh,
  rng: SeededRandom,
  density: number,
  spineRadius: number = 0.003,
  spineLength: number = 0.04,
  capPercentage: number = 0.1,
): THREE.Group {
  const spineGroup = new THREE.Group();
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geometry.attributes.position;
  const normalAttr = geometry.attributes.normal;

  if (!posAttr || !normalAttr) return spineGroup;

  // Number of spines proportional to surface area approximation and density
  const surfaceSampleCount = Math.floor(posAttr.count * density * 0.3);
  const actualCount = Math.min(surfaceSampleCount, 200);
  const mat = getSpineMaterial();

  // Find Y range for cap detection
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const yRange = maxY - minY;

  // Sample surface positions for spine placement
  const spineGeo = new THREE.ConeGeometry(spineRadius, spineLength, 4);
  spineGeo.translate(0, spineLength / 2, 0);

  for (let i = 0; i < actualCount; i++) {
    const vertIdx = rng.nextInt(0, posAttr.count - 1);
    const vx = posAttr.getX(vertIdx);
    const vy = posAttr.getY(vertIdx);
    const vz = posAttr.getZ(vertIdx);
    const nx = normalAttr.getX(vertIdx);
    const ny = normalAttr.getY(vertIdx);
    const nz = normalAttr.getZ(vertIdx);

    // Determine if this is in the cap region (top of cactus)
    const normalizedHeight = (vy - minY) / (yRange || 1);
    const isCap = normalizedHeight > (1 - capPercentage);

    // Skip some non-cap spines based on density
    if (!isCap && rng.next() > density) continue;

    const spineMesh = new THREE.Mesh(spineGeo, mat);

    // Position at surface point
    spineMesh.position.set(vx, vy, vz);

    // Orient spine along surface normal
    const normalVec = new THREE.Vector3(nx, ny, nz).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normalVec);

    // Add some random tilt
    const tiltAngle = rng.uniform(0.15, 0.45);
    const tiltAxis = new THREE.Vector3(
      rng.uniform(-1, 1),
      rng.uniform(-1, 1),
      rng.uniform(-1, 1),
    ).normalize();
    const tiltQuat = new THREE.Quaternion().setFromAxisAngle(tiltAxis, tiltAngle);

    spineMesh.quaternion.copy(quaternion);
    spineMesh.quaternion.premultiply(tiltQuat);

    // Random rotation around the normal
    spineMesh.rotateZ(rng.uniform(0, Math.PI * 2));

    // Scale variation
    const s = rng.uniform(0.5, 1.0);
    spineMesh.scale.set(s, s, s);

    spineGroup.add(spineMesh);
  }

  return spineGroup;
}

// ============================================================================
// Flower generation
// ============================================================================

/**
 * Generate a simple flower on top of a cactus.
 * Uses a small sphere center + petal-like flat discs around it.
 */
function generateFlower(rng: SeededRandom, size: number = 0.06): THREE.Group {
  const flowerGroup = new THREE.Group();
  const flowerMat = getFlowerMaterial();

  // Center bud
  const budGeo = new THREE.SphereGeometry(size * 0.4, 6, 6);
  const bud = new THREE.Mesh(budGeo, flowerMat);
  flowerGroup.add(bud);

  // Petals as small flat discs around the center
  const petalCount = rng.nextInt(4, 7);
  const petalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(rng.uniform(0.9, 0.95), 0.8, 0.6),
    roughness: 0.5,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const petalGeo = new THREE.CircleGeometry(size * 0.5, 6);

  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2 + rng.uniform(-0.1, 0.1);
    const petal = new THREE.Mesh(petalGeo, petalMat);
    petal.position.set(
      Math.cos(angle) * size * 0.35,
      0,
      Math.sin(angle) * size * 0.35,
    );
    petal.rotation.x = -Math.PI / 2 + rng.uniform(-0.3, 0.3);
    petal.rotation.z = angle;
    flowerGroup.add(petal);
  }

  return flowerGroup;
}

// ============================================================================
// Variant generators
// ============================================================================

/**
 * Generate a Columnar cactus: tall branching columns with star cross-section.
 * Ported from ColumnarBaseCactusFactory.
 *
 * The original builds a radius-tree with major (trunk) + minor (arm) branches
 * and applies a star-shaped profile via geo_star.
 */
function generateColumnar(
  rng: SeededRandom,
  config: CactusVariantConfig,
  lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const height = rng.uniform(config.height.min, config.height.max);
  const baseRadius = rng.uniform(config.radius.min, config.radius.max);
  const ribCount = rng.nextInt(config.ribCount.min, config.ribCount.max);
  const radialSegments = Math.max(8, 16 - lod * 2);

  // Main trunk using LatheGeometry with columnar profile
  const profilePoints = columnarProfilePoints(rng, baseRadius, height, 24);
  const trunkGeo = new THREE.LatheGeometry(profilePoints, radialSegments);
  applyRibDisplacement(trunkGeo, ribCount, baseRadius * 0.15, rng);
  applyNoiseDisplacement(trunkGeo, rng.nextInt(0, 10000), 0.01);

  const bodyMat = getCactusBodyMaterial(rng, config);
  const trunk = new THREE.Mesh(trunkGeo, bodyMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Branches (arms) — like the original's minor_config
  const armCount = rng.nextInt(0, 3);
  for (let i = 0; i < armCount; i++) {
    const armAngle = rng.uniform(0, Math.PI * 2);
    const armHeight = rng.uniform(height * 0.3, height * 0.7);
    const armLength = rng.uniform(0.4, 0.8);
    const armRadius = baseRadius * rng.uniform(0.4, 0.65);

    // Arm as a curved cylinder
    const armProfilePoints = columnarProfilePoints(
      new SeededRandom(rng.nextInt(0, 99999)),
      armRadius,
      armLength,
      12,
    );
    const armGeo = new THREE.LatheGeometry(armProfilePoints, radialSegments);
    applyRibDisplacement(armGeo, ribCount, armRadius * 0.12, rng);

    const arm = new THREE.Mesh(armGeo, bodyMat);
    arm.castShadow = true;
    arm.receiveShadow = true;

    // Position at branch point on the trunk surface
    const branchR = baseRadius * 0.9;
    arm.position.set(
      Math.cos(armAngle) * branchR,
      armHeight,
      Math.sin(armAngle) * branchR,
    );

    // Rotate arm to grow outward and upward (like the original's ang_min/ang_max)
    const outAngle = rng.uniform(Math.PI / 2.5, Math.PI / 2);
    arm.rotation.z = Math.cos(armAngle) * (Math.PI / 2 - outAngle);
    arm.rotation.x = -Math.sin(armAngle) * (Math.PI / 2 - outAngle);
    arm.rotation.y = armAngle;

    group.add(arm);
  }

  return group;
}

/**
 * Generate a Globular cactus: rounded globe shape with star cross-section and subtle twist.
 * Ported from GlobularBaseCactusFactory.
 *
 * The original uses a resampled curve line with radius anchors and optional tilt/twist,
 * then sweeps a star-shaped profile along it.
 */
function generateGlobular(
  rng: SeededRandom,
  config: CactusVariantConfig,
  lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const height = rng.uniform(config.height.min, config.height.max);
  const baseRadius = rng.uniform(config.radius.min, config.radius.max);
  const ribCount = rng.nextInt(config.ribCount.min, config.ribCount.max);
  const radialSegments = Math.max(8, 16 - lod * 2);

  // Build the globular profile
  const profilePoints = globularProfilePoints(rng, baseRadius, height);
  const bodyGeo = new THREE.LatheGeometry(profilePoints, radialSegments);
  applyRibDisplacement(bodyGeo, ribCount, baseRadius * 0.12, rng);
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.008);

  const bodyMat = getCactusBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;

  // Apply random scale and rotation (matching original's uniform scale + rotation)
  const sx = rng.uniform(0.8, 1.2);
  const sy = rng.uniform(0.8, 1.2);
  const sz = rng.uniform(0.8, 1.2);
  body.scale.set(sx, sy, sz);
  body.rotation.y = rng.uniform(0, Math.PI * 2);

  group.add(body);
  return group;
}

/**
 * Generate a Kalidium cactus: coral-like branching lattice.
 * Ported from KalidiumBaseCactusFactory.
 *
 * The original builds a volumetric grid inside a sphere, removes random vertices,
 * and adds small twigs distributed on the surface. We approximate this with
 * branching thin cylinders.
 */
function generateKalidium(
  rng: SeededRandom,
  config: CactusVariantConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const height = rng.uniform(config.height.min, config.height.max);
  const baseRadius = rng.uniform(config.radius.min, config.radius.max);

  const bodyMat = getCactusBodyMaterial(rng, config);
  const twigRadius = 0.006;

  // Build a branching structure starting from base
  function buildBranch(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    depth: number,
    branchRng: SeededRandom,
  ): void {
    if (depth <= 0 || length < 0.02) return;

    const segments = 5;
    const twigGeo = new THREE.CylinderGeometry(
      twigRadius * 0.5,
      twigRadius,
      length,
      4,
    );
    const twig = new THREE.Mesh(twigGeo, bodyMat);
    twig.castShadow = true;

    // Position and orient along direction
    twig.position.copy(origin).addScaledVector(direction, length / 2);
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
    twig.quaternion.copy(quat);

    group.add(twig);

    // Recurse: create 1-3 child branches from the tip
    const childCount = branchRng.nextInt(1, 3);
    const tip = origin.clone().addScaledVector(direction, length);

    for (let c = 0; c < childCount; c++) {
      const childDir = direction.clone();
      // Perturb direction
      childDir.x += branchRng.uniform(-0.5, 0.5);
      childDir.y += branchRng.uniform(0.0, 0.4); // Slight upward bias
      childDir.z += branchRng.uniform(-0.5, 0.5);
      childDir.normalize();

      const childLength = length * branchRng.uniform(0.5, 0.85);
      buildBranch(tip, childDir, childLength, depth - 1, branchRng);
    }
  }

  // Initial upward trunk
  const trunkDir = new THREE.Vector3(0, 1, 0);
  buildBranch(new THREE.Vector3(0, 0, 0), trunkDir, height * 0.4, 4, rng);

  // Add a few more branches from the base for fullness
  const baseBranchCount = rng.nextInt(2, 4);
  for (let i = 0; i < baseBranchCount; i++) {
    const angle = (i / baseBranchCount) * Math.PI * 2 + rng.uniform(-0.3, 0.3);
    const tilt = rng.uniform(0.3, 0.8);
    const dir = new THREE.Vector3(
      Math.cos(angle) * tilt,
      1 - tilt * 0.5,
      Math.sin(angle) * tilt,
    ).normalize();
    buildBranch(new THREE.Vector3(0, 0, 0), dir, height * 0.3, 3, rng);
  }

  // Random overall scale
  const sx = rng.uniform(0.8, 1.2);
  const sy = rng.uniform(0.8, 1.2);
  const sz = rng.uniform(0.8, 1.2);
  group.scale.set(sx, sy, sz);

  return group;
}

/**
 * Generate a Prickly Pear cactus: flat rounded pads stacked recursively.
 * Ported from PrickyPearBaseCactusFactory.
 *
 * The original builds leaf/pad shapes recursively up to depth 2,
 * attaching smaller pads at angles on top of the base pad.
 */
function generatePricklyPear(
  rng: SeededRandom,
  config: CactusVariantConfig,
  _lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = getCactusBodyMaterial(rng, config);

  /**
   * Create a single pad: an oblate ellipsoid (scaled sphere).
   * The original uses a curve-line sweep with circular profile.
   */
  function createPad(
    padRng: SeededRandom,
    parentScale: number = 1,
  ): THREE.Mesh {
    const padHeight = padRng.uniform(0.15, 0.25) * parentScale;
    const padWidth = padRng.uniform(0.2, 0.3) * parentScale;
    const padDepth = padRng.uniform(0.04, 0.06) * parentScale;

    // Pad as a scaled sphere
    const padGeo = new THREE.SphereGeometry(1, 10, 8);
    applyNoiseDisplacement(padGeo, padRng.nextInt(0, 99999), 0.02);

    const pad = new THREE.Mesh(padGeo, bodyMat);
    pad.scale.set(padWidth, padDepth, padHeight);
    pad.castShadow = true;
    pad.receiveShadow = true;
    return pad;
  }

  /**
   * Recursively build pad clusters.
   * Ported from build_leaves with level parameter.
   */
  function buildPadCluster(
    level: number,
    clusterRng: SeededRandom,
    parentScale: number = 1,
  ): THREE.Group {
    const clusterGroup = new THREE.Group();
    const base = createPad(clusterRng, parentScale);
    clusterGroup.add(base);

    if (level > 0) {
      const n = clusterRng.nextInt(1, 3);
      const angles: number[] = [];
      for (let i = 0; i < n; i++) {
        // Original picks from [-pi/3..-pi/2, -pi/16..pi/16, pi/3..pi/2]
        const angleChoices = [
          -clusterRng.uniform(Math.PI / 3, Math.PI / 2),
          clusterRng.uniform(-Math.PI / 16, Math.PI / 16),
          clusterRng.uniform(Math.PI / 3, Math.PI / 2),
        ];
        angles.push(clusterRng.choice(angleChoices));
      }

      for (let i = 0; i < n; i++) {
        const childCluster = buildPadCluster(
          level - 1,
          new SeededRandom(clusterRng.nextInt(0, 99999)),
          parentScale * clusterRng.uniform(0.5, 0.75),
        );

        // Position on top edge of the base pad
        childCluster.position.set(
          0,
          0.04 * parentScale,
          0.1 * parentScale * (i === 0 ? 1 : -1),
        );
        childCluster.rotation.set(
          angles[i],
          clusterRng.uniform(-Math.PI / 3, Math.PI / 3),
          0,
        );
        clusterGroup.add(childCluster);
      }
    }

    return clusterGroup;
  }

  // Build with recursion depth 2 (matching original)
  const padCluster = buildPadCluster(2, rng, 1.0);
  group.add(padCluster);

  return group;
}

/**
 * Generate a Spike cactus: tall, thin, many-ribbed column.
 * Inspired by Cereus / Stetsonia species with very prominent spines.
 */
function generateSpike(
  rng: SeededRandom,
  config: CactusVariantConfig,
  lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const height = rng.uniform(config.height.min, config.height.max);
  const baseRadius = rng.uniform(config.radius.min, config.radius.max);
  const ribCount = rng.nextInt(config.ribCount.min, config.ribCount.max);
  const radialSegments = Math.max(10, 20 - lod * 2);

  // Tall thin column with strong ribs
  const profilePoints = columnarProfilePoints(rng, baseRadius, height, 20);
  const bodyGeo = new THREE.LatheGeometry(profilePoints, radialSegments);
  applyRibDisplacement(bodyGeo, ribCount, baseRadius * 0.2, rng);
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.005);

  const bodyMat = getCactusBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  return group;
}

/**
 * Generate a Barrel cactus: short, wide, prominently ribbed.
 * Similar to the globular but wider and with more distinct ribs.
 */
function generateBarrel(
  rng: SeededRandom,
  config: CactusVariantConfig,
  lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const height = rng.uniform(config.height.min, config.height.max);
  const baseRadius = rng.uniform(config.radius.min, config.radius.max);
  const ribCount = rng.nextInt(config.ribCount.min, config.ribCount.max);
  const radialSegments = Math.max(12, 20 - lod * 2);

  // Barrel profile: wider in the middle, flatter top and bottom
  const segments = 24;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Barrel shape: bulge in the middle
    const bulge = Math.sin(t * Math.PI);
    const taper = 1 - Math.pow(Math.abs(t - 0.45) * 1.8, 3);
    const r = baseRadius * (0.7 + 0.3 * bulge) * Math.max(0.1, taper);
    points.push(new THREE.Vector2(Math.max(0.001, r), t * height));
  }

  const bodyGeo = new THREE.LatheGeometry(points, radialSegments);
  applyRibDisplacement(bodyGeo, ribCount, baseRadius * 0.18, rng);
  applyNoiseDisplacement(bodyGeo, rng.nextInt(0, 10000), 0.006);

  const bodyMat = getCactusBodyMaterial(rng, config);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  return group;
}

/**
 * Generate a Saguaro cactus: classic tall column with upward-curving arms.
 * The iconic Sonoran Desert cactus.
 */
function generateSaguaro(
  rng: SeededRandom,
  config: CactusVariantConfig,
  lod: number,
): THREE.Group {
  const group = new THREE.Group();
  const height = rng.uniform(config.height.min, config.height.max);
  const baseRadius = rng.uniform(config.radius.min, config.radius.max);
  const ribCount = rng.nextInt(config.ribCount.min, config.ribCount.max);
  const radialSegments = Math.max(8, 16 - lod * 2);

  // Main trunk
  const trunkProfilePoints = columnarProfilePoints(rng, baseRadius, height, 24);
  const trunkGeo = new THREE.LatheGeometry(trunkProfilePoints, radialSegments);
  applyRibDisplacement(trunkGeo, ribCount, baseRadius * 0.12, rng);
  applyNoiseDisplacement(trunkGeo, rng.nextInt(0, 10000), 0.008);

  const bodyMat = getCactusBodyMaterial(rng, config);
  const trunk = new THREE.Mesh(trunkGeo, bodyMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Saguaro arms: curve upward in a U-shape
  const armCount = rng.nextInt(1, 4);
  const armAngles = rng.shuffle(
    Array.from({ length: armCount }, (_, i) =>
      (i / armCount) * Math.PI * 2 + rng.uniform(-0.5, 0.5),
    ),
  );

  for (let i = 0; i < armCount; i++) {
    const armAngle = armAngles[i];
    const armBaseHeight = rng.uniform(height * 0.3, height * 0.7);
    const armRadius = baseRadius * rng.uniform(0.35, 0.55);

    // Build the arm as a curved path using multiple cylinder segments
    const armGroup = new THREE.Group();
    const armRng = new SeededRandom(rng.nextInt(0, 99999));

    // Horizontal segment going outward
    const horizLength = armRng.uniform(0.3, 0.7);
    const horizGeo = new THREE.CylinderGeometry(
      armRadius * 0.8,
      armRadius,
      horizLength,
      radialSegments,
    );
    const horiz = new THREE.Mesh(horizGeo, bodyMat);
    horiz.castShadow = true;
    horiz.rotation.z = Math.PI / 2; // Point outward horizontally
    horiz.position.set(horizLength / 2, 0, 0);
    armGroup.add(horiz);

    // Vertical segment going upward
    const vertLength = armRng.uniform(0.5, 1.2);
    const vertGeo = new THREE.CylinderGeometry(
      armRadius * 0.6,
      armRadius * 0.8,
      vertLength,
      radialSegments,
    );
    applyRibDisplacement(vertGeo, ribCount, armRadius * 0.1, armRng);
    const vert = new THREE.Mesh(vertGeo, bodyMat);
    vert.castShadow = true;
    vert.position.set(horizLength, vertLength / 2, 0);
    armGroup.add(vert);

    // Position the arm group on the trunk surface
    const branchR = baseRadius * 0.85;
    armGroup.position.set(
      Math.cos(armAngle) * branchR,
      armBaseHeight,
      Math.sin(armAngle) * branchR,
    );
    armGroup.rotation.y = armAngle - Math.PI / 2;

    group.add(armGroup);
  }

  return group;
}

// ============================================================================
// Main generator class
// ============================================================================

/**
 * Procedural cactus generator supporting 7 distinct variants.
 *
 * Uses seeded randomness throughout for deterministic generation.
 * Produces Three.js Group objects containing Mesh children with
 * MeshStandardMaterial for PBR rendering.
 *
 * @example
 * ```ts
 * const generator = new CactusGenerator(42);
 * const cactus = generator.generate('Saguaro');
 * scene.add(cactus);
 * ```
 */
export class CactusGenerator {
  private rng: SeededRandom;

  /**
   * @param seed - Master seed for deterministic generation
   */
  constructor(seed: number = 12345) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a cactus of the specified variant (or a random one).
   *
   * @param options - Generation options; variant is randomly chosen if omitted
   * @returns A Three.js Group containing the cactus meshes
   */
  generate(options: CactusGeneratorOptions = {}): THREE.Group {
    const variant = options.variant ?? this.rng.choice([...CACTUS_VARIANTS]);
    const lod = options.lod ?? 0;
    const includeSpines = options.includeSpines ?? true;
    const includeFlowers = options.includeFlowers ?? true;
    const scale = options.scale ?? 1;

    const config = CACTUS_VARIANT_CONFIGS[variant];
    const variantRng = new SeededRandom(this.rng.nextInt(0, 999999));

    // Generate the body based on variant
    let cactusGroup: THREE.Group;
    switch (variant) {
      case 'Columnar':
        cactusGroup = generateColumnar(variantRng, config, lod);
        break;
      case 'Globular':
        cactusGroup = generateGlobular(variantRng, config, lod);
        break;
      case 'Kalidium':
        cactusGroup = generateKalidium(variantRng, config, lod);
        break;
      case 'PricklyPear':
        cactusGroup = generatePricklyPear(variantRng, config, lod);
        break;
      case 'Spike':
        cactusGroup = generateSpike(variantRng, config, lod);
        break;
      case 'Barrel':
        cactusGroup = generateBarrel(variantRng, config, lod);
        break;
      case 'Saguaro':
        cactusGroup = generateSaguaro(variantRng, config, lod);
        break;
      default:
        cactusGroup = generateGlobular(variantRng, config, lod);
    }

    // Add spines to the first body mesh
    if (includeSpines && config.spineDensity > 0) {
      const bodyMesh = cactusGroup.children.find(
        (child): child is THREE.Mesh => child instanceof THREE.Mesh,
      );
      if (bodyMesh) {
        const spineGroup = generateSpines(
          bodyMesh,
          new SeededRandom(variantRng.nextInt(0, 999999)),
          config.spineDensity,
        );
        cactusGroup.add(spineGroup);
      }
    }

    // Add optional flower on top
    if (includeFlowers && config.flowerChance > 0) {
      if (variantRng.next() < config.flowerChance) {
        const flower = generateFlower(
          new SeededRandom(variantRng.nextInt(0, 999999)),
        );
        // Position flower at the top of the cactus
        const topY = this.estimateTopY(cactusGroup);
        flower.position.y = topY;
        cactusGroup.add(flower);
      }
    }

    // Apply overall scale
    if (scale !== 1) {
      cactusGroup.scale.setScalar(scale);
    }

    return cactusGroup;
  }

  /**
   * Generate a cactus field with multiple cacti distributed over an area.
   *
   * @param count - Number of cacti to generate
   * @param areaSize - Size of the area (square side length)
   * @param seed - Seed for deterministic placement
   * @param options - Options applied to each cactus
   * @returns Group containing all cactus instances
   */
  generateField(
    count: number,
    areaSize: number,
    seed: number = 0,
    options: CactusGeneratorOptions = {},
  ): THREE.Group {
    const fieldGroup = new THREE.Group();
    const fieldRng = new SeededRandom(seed);

    for (let i = 0; i < count; i++) {
      const cactusSeed = fieldRng.nextInt(0, 999999);
      const generator = new CactusGenerator(cactusSeed);
      const variant = options.variant ?? fieldRng.choice([...CACTUS_VARIANTS]);
      const cactus = generator.generate({ ...options, variant });

      const x = (fieldRng.uniform(0, 1) - 0.5) * areaSize;
      const z = (fieldRng.uniform(0, 1) - 0.5) * areaSize;
      cactus.position.set(x, 0, z);
      cactus.rotation.y = fieldRng.uniform(0, Math.PI * 2);

      const scaleVar = fieldRng.uniform(0.8, 1.2);
      cactus.scale.multiplyScalar(scaleVar);

      fieldGroup.add(cactus);
    }

    return fieldGroup;
  }

  /**
   * Estimate the highest Y position in a cactus group
   * for placing flowers/fruits on top.
   */
  private estimateTopY(group: THREE.Group): number {
    let maxY = 0;
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geo = child.geometry as THREE.BufferGeometry;
        const posAttr = geo.attributes.position;
        if (posAttr) {
          for (let i = 0; i < posAttr.count; i++) {
            const y = posAttr.getY(i);
            // Account for mesh world transform
            const worldY = child.position.y + y * child.scale.y;
            if (worldY > maxY) maxY = worldY;
          }
        }
      }
    });
    return maxY;
  }
}

// ============================================================================
// Factory function
// ============================================================================

/**
 * Factory function to create a cactus mesh group.
 *
 * This is the primary public API for creating cacti.
 * Matches the pattern used by other generators in the R3F project.
 *
 * @param seed - Random seed for deterministic generation
 * @param variant - Optional specific variant; random if omitted
 * @param options - Additional generation options
 * @returns A Three.js Group containing the generated cactus
 *
 * @example
 * ```ts
 * const cactus = createCactus(42, 'Saguaro');
 * scene.add(cactus);
 * ```
 */
export function createCactus(
  seed: number,
  variant?: CactusVariant,
  options: Omit<CactusGeneratorOptions, 'variant'> = {},
): THREE.Group {
  const generator = new CactusGenerator(seed);
  return generator.generate({ ...options, variant });
}
