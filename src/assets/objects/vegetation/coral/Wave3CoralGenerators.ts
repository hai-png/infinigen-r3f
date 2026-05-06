/**
 * Wave 3 Coral Generators — BranchingCoral, FanCoral, BrainCoral
 *
 * Three specialized coral generators that complement the existing
 * CoralGenerator and ReactionDiffusionCoral/DifferentialGrowthCoral.
 *
 * 1. BranchingCoralGenerator: Recursive CylinderGeometry branching
 *    (staghorn/elkhorn coral)
 * 2. FanCoralGenerator: Flat fan-shaped mesh with radial veins (sea fan)
 * 3. BrainCoralGenerator: SphereGeometry with reaction-diffusion
 *    displacement (brain coral)
 *
 * @module vegetation/coral
 */

import * as THREE from 'three';
import { SeededRandom, seededFbm } from '@/core/util/MathUtils';

// ============================================================================
// BranchingCoralGenerator
// ============================================================================

export interface BranchingCoralConfig {
  /** Base radius of the trunk */
  baseRadius: number;
  /** Maximum recursion depth for branching */
  maxDepth: number;
  /** Branch length at each level */
  branchLength: number;
  /** Branch length reduction per level (0.5-0.9) */
  lengthReduction: number;
  /** Branch radius reduction per level */
  radiusReduction: number;
  /** Number of child branches at each node */
  branchCount: number;
  /** Spread angle for branches (radians) */
  spreadAngle: number;
  /** Upward tendency (0 = random, 1 = straight up) */
  upwardBias: number;
  /** Color of the coral */
  color: string;
  /** Tip color (lighter) */
  tipColor: string;
  /** Random seed */
  seed: number;
  /** Radial segments for cylinder geometry */
  radialSegments: number;
}

const DEFAULT_BRANCHING_CONFIG: BranchingCoralConfig = {
  baseRadius: 0.08,
  maxDepth: 5,
  branchLength: 0.3,
  lengthReduction: 0.72,
  radiusReduction: 0.65,
  branchCount: 3,
  spreadAngle: 0.8,
  upwardBias: 0.4,
  color: '#FF8C42',
  tipColor: '#FFD700',
  seed: 42,
  radialSegments: 8,
};

/**
 * Generate a branching coral (staghorn/elkhorn) using recursive
 * CylinderGeometry branching.
 *
 * Each branch is a tapered cylinder. At each recursion level,
 * the branch splits into N child branches with randomized
 * directions biased upward.
 */
export function generateBranchingCoral(
  config: Partial<BranchingCoralConfig> = {},
): THREE.Group {
  const cfg = { ...DEFAULT_BRANCHING_CONFIG, ...config };
  const rng = new SeededRandom(cfg.seed);
  const group = new THREE.Group();
  group.name = 'BranchingCoral';

  // Material with color gradient from base to tip
  const baseMat = new THREE.MeshStandardMaterial({
    color: cfg.color,
    roughness: 0.7,
    metalness: 0.05,
  });

  const tipMat = new THREE.MeshStandardMaterial({
    color: cfg.tipColor,
    roughness: 0.5,
    metalness: 0.1,
  });

  // Start recursive branching from the base
  generateBranch(group, cfg, rng, 0, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), baseMat, tipMat);

  // Compute bounding sphere by traversing children
  const box = new THREE.Box3();
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.computeBoundingBox();
      box.expandByObject(child);
    }
  });
  return group;
}

function generateBranch(
  parent: THREE.Group,
  config: BranchingCoralConfig,
  rng: SeededRandom,
  depth: number,
  position: THREE.Vector3,
  direction: THREE.Vector3,
  baseMat: THREE.MeshStandardMaterial,
  tipMat: THREE.MeshStandardMaterial,
): void {
  if (depth >= config.maxDepth) return;

  const length = config.branchLength * Math.pow(config.lengthReduction, depth);
  const radius = config.baseRadius * Math.pow(config.radiusReduction, depth);

  if (radius < 0.002 || length < 0.01) return;

  // Create branch cylinder
  const topRadius = radius * config.radiusReduction;
  const branchGeo = new THREE.CylinderGeometry(topRadius, radius, length, config.radialSegments);
  const mat = depth < config.maxDepth - 1 ? baseMat : tipMat;
  const branch = new THREE.Mesh(branchGeo, mat);

  // Position and orient the branch
  branch.position.copy(position);

  // Align cylinder Y-axis with the direction vector
  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
  branch.quaternion.copy(quaternion);

  // Move to the end of the parent branch
  const endOffset = direction.clone().normalize().multiplyScalar(length * 0.5);
  branch.position.add(endOffset);

  parent.add(branch);

  // Compute end position for child branches
  const endPosition = position.clone().add(direction.clone().normalize().multiplyScalar(length));

  // Generate child branches
  if (depth < config.maxDepth - 1) {
    for (let i = 0; i < config.branchCount; i++) {
      // Random direction biased upward and spreading
      const angle = (i / config.branchCount) * Math.PI * 2 + rng.next() * 0.5;
      const spread = config.spreadAngle * (0.5 + rng.next() * 0.5);

      // Create spread direction
      const spreadDir = new THREE.Vector3(
        Math.cos(angle) * Math.sin(spread),
        Math.cos(spread) * config.upwardBias + (1 - config.upwardBias) * rng.next() * 0.5,
        Math.sin(angle) * Math.sin(spread),
      ).normalize();

      // Blend with parent direction
      const childDir = direction.clone().normalize().multiplyScalar(0.5).add(spreadDir).normalize();

      generateBranch(parent, config, rng, depth + 1, endPosition, childDir, baseMat, tipMat);
    }
  }
}

// ============================================================================
// FanCoralGenerator
// ============================================================================

export interface FanCoralConfig {
  /** Fan width */
  width: number;
  /** Fan height */
  height: number;
  /** Thickness of the fan */
  thickness: number;
  /** Number of radial veins */
  veinCount: number;
  /** Vein thickness */
  veinThickness: number;
  /** Number of horizontal crossbars */
  crossBarCount: number;
  /** Mesh resolution (subdivisions) */
  resolution: number;
  /** Color of the coral */
  color: string;
  /** Vein color (darker) */
  veinColor: string;
  /** Random seed */
  seed: number;
  /** Curvature of the fan (0 = flat, 1 = highly curved) */
  curvature: number;
}

const DEFAULT_FAN_CONFIG: FanCoralConfig = {
  width: 1.0,
  height: 0.8,
  thickness: 0.02,
  veinCount: 12,
  veinThickness: 0.01,
  crossBarCount: 8,
  resolution: 32,
  color: '#FF69B4',
  veinColor: '#C71585',
  seed: 42,
  curvature: 0.3,
};

/**
 * Generate a fan coral (sea fan / gorgonian) with a flat fan-shaped
 * mesh and radial veins.
 *
 * The fan is a curved planar mesh with a central stalk and
 * radiating veins that form a lattice structure.
 */
export function generateFanCoral(
  config: Partial<FanCoralConfig> = {},
): THREE.Group {
  const cfg = { ...DEFAULT_FAN_CONFIG, ...config };
  const rng = new SeededRandom(cfg.seed);
  const group = new THREE.Group();
  group.name = 'FanCoral';

  // --- Stalk (base) ---
  const stalkMat = new THREE.MeshStandardMaterial({
    color: cfg.veinColor,
    roughness: 0.7,
  });
  const stalkGeo = new THREE.CylinderGeometry(
    cfg.thickness * 2, cfg.thickness * 3, cfg.height * 0.3, 8,
  );
  const stalk = new THREE.Mesh(stalkGeo, stalkMat);
  stalk.position.y = cfg.height * 0.15;
  stalk.name = 'stalk';
  group.add(stalk);

  // --- Fan surface ---
  const fanMat = new THREE.MeshStandardMaterial({
    color: cfg.color,
    roughness: 0.6,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });

  // Create fan as a curved plane with semicircular shape
  const fanGeo = createFanGeometry(cfg, rng);
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.position.y = cfg.height * 0.3;
  fan.name = 'fan';
  group.add(fan);

  // --- Radial veins ---
  const veinMat = new THREE.MeshStandardMaterial({
    color: cfg.veinColor,
    roughness: 0.5,
    metalness: 0.05,
  });

  for (let v = 0; v < cfg.veinCount; v++) {
    const angle = -Math.PI * 0.4 + (v / (cfg.veinCount - 1)) * Math.PI * 0.8;
    const veinLength = cfg.height * (0.7 + rng.next() * 0.3);

    const veinGeo = new THREE.CylinderGeometry(
      cfg.veinThickness * 0.5, cfg.veinThickness, veinLength, 4,
    );
    const vein = new THREE.Mesh(veinGeo, veinMat);

    // Position vein at center base of fan, radiating outward
    vein.position.set(
      Math.sin(angle) * veinLength * 0.4,
      cfg.height * 0.3 + Math.cos(angle) * veinLength * 0.4,
      0,
    );
    vein.rotation.z = angle;
    vein.name = `vein_${v}`;
    group.add(vein);
  }

  // --- Horizontal crossbars ---
  for (let c = 0; c < cfg.crossBarCount; c++) {
    const t = (c + 1) / (cfg.crossBarCount + 1);
    const barY = cfg.height * 0.3 + t * cfg.height * 0.7;
    const barWidth = cfg.width * t * Math.sin(t * Math.PI) * 0.8;

    if (barWidth < 0.05) continue;

    const barGeo = new THREE.CylinderGeometry(
      cfg.veinThickness * 0.3, cfg.veinThickness * 0.3, barWidth, 4,
    );
    const bar = new THREE.Mesh(barGeo, veinMat);
    bar.position.y = barY;
    bar.rotation.z = Math.PI * 0.5;
    bar.name = `crossBar_${c}`;
    group.add(bar);
  }

  const box = new THREE.Box3();
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.computeBoundingBox();
      box.expandByObject(child);
    }
  });
  return group;
}

/**
 * Create the fan-shaped geometry with curvature.
 */
function createFanGeometry(config: FanCoralConfig, rng: SeededRandom): THREE.BufferGeometry {
  const res = config.resolution;
  const halfWidth = config.width * 0.5;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= res; row++) {
    const v = row / res; // 0 at base, 1 at top
    const heightFrac = v;

    for (let col = 0; col <= res; col++) {
      const u = col / res; // 0 at left, 1 at right

      // Semicircular profile: width narrows toward top and bottom
      const widthAtHeight = Math.sin(heightFrac * Math.PI) * halfWidth;
      const x = (u - 0.5) * 2 * widthAtHeight;
      const y = v * config.height;

      // Apply curvature (bend the fan forward)
      const curvatureOffset = Math.sin(v * Math.PI) * config.curvature * config.thickness * 5;
      const z = curvatureOffset * (1 - Math.abs(u - 0.5) * 2);

      // Add slight noise for organic feel
      const noise = seededFbm(
        x * 5 + config.seed, y * 5, z * 5 + config.seed,
        2, 2.0, 0.5, config.seed + 100,
      ) * 0.005;

      positions.push(x, y, z + noise);
      normals.push(0, 0, 1);
      uvs.push(u, v);
    }
  }

  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const a = row * (res + 1) + col;
      const b = a + 1;
      const c = a + (res + 1);
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}

// ============================================================================
// BrainCoralGenerator
// ============================================================================

export interface BrainCoralConfig {
  /** Base radius */
  radius: number;
  /** Sphere resolution */
  resolution: number;
  /** Reaction-diffusion groove depth */
  grooveDepth: number;
  /** Reaction-diffusion pattern scale */
  patternScale: number;
  /** Number of R-D iterations (0 = just noise) */
  iterations: number;
  /** Color of the coral */
  color: string;
  /** Groove color (darker) */
  grooveColor: string;
  /** Random seed */
  seed: number;
  /** Flatten factor (0 = sphere, 1 = hemisphere) */
  flattenFactor: number;
}

const DEFAULT_BRAIN_CONFIG: BrainCoralConfig = {
  radius: 0.5,
  resolution: 48,
  grooveDepth: 0.03,
  patternScale: 6.0,
  iterations: 0, // Uses noise approximation instead of full R-D
  color: '#8B7355',
  grooveColor: '#5C4033',
  seed: 42,
  flattenFactor: 0.3,
};

/**
 * Generate a brain coral using SphereGeometry with reaction-diffusion
 * displacement.
 *
 * The brain coral's distinctive pattern of ridges and valleys is
 * simulated using multi-octave noise with ridged multifractal to
 * approximate reaction-diffusion patterns. The sphere vertices are
 * displaced inward along their normals where the pattern is "low"
 * (valleys), creating the grooved surface.
 */
export function generateBrainCoral(
  config: Partial<BrainCoralConfig> = {},
): THREE.Group {
  const cfg = { ...DEFAULT_BRAIN_CONFIG, ...config };
  const group = new THREE.Group();
  group.name = 'BrainCoral';

  // Create base sphere
  const sphereGeo = new THREE.SphereGeometry(cfg.radius, cfg.resolution, cfg.resolution);

  // Flatten into dome shape
  const positions = sphereGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    let y = positions.getY(i);
    // Flatten bottom half
    if (y < 0) {
      y = y * (1 - cfg.flattenFactor);
      positions.setY(i, y);
    }
  }

  // Apply reaction-diffusion-like displacement
  applyBrainCoralDisplacement(sphereGeo, cfg);

  // Create vertex colors from displacement pattern
  const colors = new Float32Array(positions.count * 3);
  const baseColor = new THREE.Color(cfg.color);
  const grooveColor = new THREE.Color(cfg.grooveColor);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    // Compute pattern value at this vertex (same as displacement)
    const pattern = computeBrainCoralPattern(x, y, z, cfg);

    // Blend between base and groove colors based on pattern
    const t = Math.max(0, Math.min(1, (pattern + 1) * 0.5));
    const color = baseColor.clone().lerp(grooveColor, 1 - t);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  sphereGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.0,
  });

  const mesh = new THREE.Mesh(sphereGeo, material);
  mesh.name = 'brainCoral';
  group.add(mesh);

  // Base attachment
  const baseMat = new THREE.MeshStandardMaterial({
    color: cfg.grooveColor,
    roughness: 0.9,
  });
  const baseGeo = new THREE.CylinderGeometry(
    cfg.radius * 0.3, cfg.radius * 0.4, cfg.radius * 0.15, 16,
  );
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = -cfg.radius * (1 - cfg.flattenFactor) - cfg.radius * 0.075;
  base.name = 'base';
  group.add(base);

  const box = new THREE.Box3();
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.computeBoundingBox();
      box.expandByObject(child);
    }
  });
  return group;
}

/**
 * Apply reaction-diffusion-like displacement to sphere geometry.
 * Uses ridged multifractal noise to simulate the meandering
 * groove pattern characteristic of brain coral.
 */
function applyBrainCoralDisplacement(
  geometry: THREE.BufferGeometry,
  config: BrainCoralConfig,
): void {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    // Skip bottom vertices (flat base)
    if (y < -config.radius * (1 - config.flattenFactor) * 0.5) continue;

    const pattern = computeBrainCoralPattern(x, y, z, config);

    // Displace: valleys go inward (negative pattern = groove)
    const displacement = pattern * config.grooveDepth;

    // Move vertex along its normal
    const nx = normals.getX(i);
    const ny = normals.getY(i);
    const nz = normals.getZ(i);

    positions.setX(i, x + nx * displacement);
    positions.setY(i, y + ny * displacement);
    positions.setZ(i, z + nz * displacement);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}

/**
 * Compute brain coral pattern at a point.
 * Uses ridged multifractal noise to approximate reaction-diffusion
 * patterns — the valleys and ridges that give brain coral its
 * distinctive wrinkled appearance.
 */
function computeBrainCoralPattern(
  x: number,
  y: number,
  z: number,
  config: BrainCoralConfig,
): number {
  const scale = config.patternScale;

  // Primary ridged pattern: creates the meandering grooves
  const ridge1 = seededRidgedMultifractal(
    x * scale, y * scale, z * scale,
    4, 2.0, 0.5, 0.7, config.seed,
  );

  // Secondary pattern at different scale for finer detail
  const ridge2 = seededRidgedMultifractal(
    x * scale * 1.7 + 100, y * scale * 1.7, z * scale * 1.7 + 100,
    3, 2.0, 0.5, 0.6, config.seed + 50,
  );

  // Combine: the valleys are where both ridged patterns are low
  const combined = ridge1 * 0.7 + ridge2 * 0.3;

  // Threshold: create sharper grooves
  return combined > 0 ? combined * 0.3 : combined;
}

// Re-export seeded noise functions used by the generators
function seededRidgedMultifractal(
  x: number, y: number, z: number,
  octaves: number, lacunarity: number, persistence: number,
  offset: number, seed: number,
): number {
  let value = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxAmplitude = 0;

  for (let i = 0; i < octaves; i++) {
    const noise = seededFbm(
      x * frequency + seed * 0.1 + i * 31.7,
      y * frequency + i * 47.3,
      z * frequency + seed * 0.1 + i * 73.1,
      1, lacunarity, persistence, seed + i * 53,
    );
    const ridged = offset - Math.abs(noise);
    value += ridged * ridged * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxAmplitude - 0.5;
}
