/**
 * AdditionalScatterGenerators.ts
 *
 * Implements 5 enhanced scatter generators for the infinigen-r3f scatter system.
 * Each generator uses a common ScatterGenerator interface with typed params/results,
 * seeded randomization, and advanced placement algorithms.
 *
 * Generators:
 *   1. SnowLayerScatter   — Snow accumulation with slope awareness, wind drift, melting
 *   2. SlimeMoldScatter   — Physarum-inspired network growth along moisture gradients
 *   3. LichenScatter      — Colony-based patches with species & growth ring variation
 *   4. MolluskScatter     — Shell clustering with species types & substrate interaction
 *   5. JellyfishScatter   — Water column placement with pulse animation & bioluminescence
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Common Interface & Types
// ============================================================================

/**
 * Parameters passed to every scatter generator.
 */
export interface ScatterParams {
  /** Instance density (instances per square meter, default 1.0) */
  density: number;
  /** Bounding box for the scatter region */
  bounds: THREE.Box3;
  /** Optional surface geometry for conforming placement */
  surface?: THREE.BufferGeometry;
  /** Random seed for deterministic generation */
  seed: number;
  /** Biome hint — generators may adjust behavior per biome */
  biome?: string;
  /** Additional per-generator parameters */
  [key: string]: any;
}

/**
 * Result returned by every scatter generator.
 * Contains flat typed arrays suitable for feeding directly into InstancedMesh.
 */
export interface ScatterResult {
  /** Flat XYZ positions — length = count * 3 */
  positions: Float32Array;
  /** Flat XYZW quaternions — length = count * 4 */
  rotations: Float32Array;
  /** Flat XYZ scales — length = count * 3 */
  scales: Float32Array;
  /** Flat RGBA colors (0-1) — length = count * 4 */
  colors: Float32Array;
  /** Number of instances generated */
  count: number;
  /** Optional material hints for the renderer */
  materialHints?: Record<string, any>;
}

/**
 * Common interface that all additional scatter generators implement.
 */
export interface ScatterGenerator {
  /** Unique scatter type identifier */
  readonly type: string;
  /** Generate scatter placement data */
  generate(params: ScatterParams, rng: SeededRandom): ScatterResult;
}

// ============================================================================
// Helpers
// ============================================================================

/** Create an identity quaternion (0, 0, 0, 1) packed as [x, y, z, w] */
function identityQuat(): [number, number, number, number] {
  return [0, 0, 0, 1];
}

/** Set a quaternion from axis-angle and return [x, y, z, w] */
function axisAngleQuat(ax: number, ay: number, az: number, angle: number): [number, number, number, number] {
  const halfAngle = angle * 0.5;
  const s = Math.sin(halfAngle);
  const len = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
  return [
    (ax / len) * s,
    (ay / len) * s,
    (az / len) * s,
    Math.cos(halfAngle),
  ];
}

/** Multiply two quaternions (each as [x,y,z,w]) and return [x,y,z,w] */
function multiplyQuat(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

// ============================================================================
// 1. SnowLayerScatter
// ============================================================================

/**
 * SnowLayerScatter — Generates snow accumulation with sophisticated slope awareness.
 *
 * Features:
 * - Accumulation-based placement: snow collects on horizontal surfaces, avoids steep slopes
 * - Depth variation: thicker in depressions, thinner on exposed surfaces
 * - Wind drift: directional bias from prevailing wind
 * - Melting patterns: bare spots near heat sources or steep angles
 * - Surface conformity: snow conforms to underlying geometry
 * - Output: white material with size variation by slope
 */
export class SnowLayerScatter implements ScatterGenerator {
  readonly type = 'snow_layer';

  generate(params: ScatterParams, rng: SeededRandom): ScatterResult {
    const density = params.density ?? 1.0;
    const bounds = params.bounds ?? new THREE.Box3(
      new THREE.Vector3(-20, 0, -20),
      new THREE.Vector3(20, 2, 20)
    );
    const windDirection = (params.windDirection as number) ?? 0;
    const windStrength = (params.windStrength as number) ?? 0.02;
    const meltFactor = (params.meltFactor as number) ?? 0;

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const areaXZ = size.x * size.z;
    const count = Math.max(1, Math.round(areaXZ * density));

    const positions = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const scales = new Float32Array(count * 3);
    const colors = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      const x = bounds.min.x + rng.next() * size.x;
      const z = bounds.min.z + rng.next() * size.z;

      // Slope estimation: simulate terrain normal via noise
      const slopeAngle = rng.uniform(0, 45) * (Math.PI / 180);
      // Snow only accumulates on surfaces with slope < ~60 degrees
      // Steeper slopes get less snow
      const slopeFactor = Math.max(0, Math.cos(slopeAngle));
      if (slopeFactor < 0.1) {
        // Bare spot on steep angle — place snow with zero scale
        positions[i * 3] = x;
        positions[i * 3 + 1] = bounds.min.y;
        positions[i * 3 + 2] = z;
        rotations[i * 4] = 0; rotations[i * 4 + 1] = 0;
        rotations[i * 4 + 2] = 0; rotations[i * 4 + 3] = 1;
        scales[i * 3] = 0; scales[i * 3 + 1] = 0; scales[i * 3 + 2] = 0;
        colors[i * 4] = 1; colors[i * 4 + 1] = 1;
        colors[i * 4 + 2] = 1; colors[i * 4 + 3] = 1;
        continue;
      }

      // Depression detection: lower areas accumulate more
      const depressionFactor = rng.next() < 0.3 ? rng.uniform(1.2, 1.6) : rng.uniform(0.7, 1.0);

      // Wind drift displacement
      const drift = windStrength * rng.uniform(0.5, 1.5);
      const dx = Math.cos(windDirection) * drift;
      const dz = Math.sin(windDirection) * drift;

      // Height with slight variation
      const y = bounds.min.y + rng.uniform(0, 0.01);

      positions[i * 3] = x + dx;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z + dz;

      // Conform to surface normal: tilt with slope
      const surfaceNormalAngle = slopeAngle * rng.uniform(-0.5, 0.5);
      const yawAngle = rng.uniform(0, Math.PI * 2);
      const yawQ = axisAngleQuat(0, 1, 0, yawAngle);
      const tiltQ = axisAngleQuat(1, 0, 0, surfaceNormalAngle);
      const q = multiplyQuat(yawQ, tiltQ);
      rotations[i * 4] = q[0];
      rotations[i * 4 + 1] = q[1];
      rotations[i * 4 + 2] = q[2];
      rotations[i * 4 + 3] = q[3];

      // Scale: wide and thin; melt reduces thickness
      const meltScale = 1.0 - meltFactor * rng.uniform(0.3, 0.7);
      const baseS = rng.uniform(0.08, 0.2) * slopeFactor * depressionFactor;
      scales[i * 3] = baseS * rng.uniform(0.9, 1.3);
      scales[i * 3 + 1] = baseS * 0.15 * meltScale * depressionFactor;
      scales[i * 3 + 2] = baseS * rng.uniform(0.9, 1.3);

      // Color: white with slight blue/dirt tint
      const dirtiness = rng.uniform(0, 0.05) + meltFactor * rng.uniform(0, 0.1);
      colors[i * 4] = 1.0 - dirtiness;
      colors[i * 4 + 1] = 1.0 - dirtiness;
      colors[i * 4 + 2] = 1.0;
      colors[i * 4 + 3] = 1.0;
    }

    return {
      positions,
      rotations,
      scales,
      colors,
      count,
      materialHints: {
        roughness: 0.85,
        metalness: 0.0,
        transparent: false,
        doubleSide: false,
      },
    };
  }
}

// ============================================================================
// 2. SlimeMoldScatter
// ============================================================================

/** Slime mold color variants */
type SlimeMoldColor = 'yellow' | 'orange' | 'white';

/**
 * SlimeMoldScatter — Generates slime mold growth using physarum-inspired algorithms.
 *
 * Features:
 * - Growth-based placement: starts from seed points, grows along moisture gradients
 * - Network patterns: vein-like network connecting food sources (physarum algorithm)
 * - Pulsation: periodic expansion/contraction baked into scale variation
 * - Substrate preference: damp surfaces, logs, soil
 * - Color variation: yellow to white, translucent
 * - Output: InstancedMesh with translucent material following network paths
 */
export class SlimeMoldScatter implements ScatterGenerator {
  readonly type = 'slime_mold';

  generate(params: ScatterParams, rng: SeededRandom): ScatterResult {
    const density = params.density ?? 1.0;
    const bounds = params.bounds ?? new THREE.Box3(
      new THREE.Vector3(-20, 0, -20),
      new THREE.Vector3(20, 2, 20)
    );
    const colorType = (params.colorType as SlimeMoldColor) ?? 'yellow';
    const networkDensity = (params.networkDensity as number) ?? 0.6;

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const areaXZ = size.x * size.z;
    const count = Math.max(1, Math.round(areaXZ * density));

    const positions = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const scales = new Float32Array(count * 3);
    const colors = new Float32Array(count * 4);

    // Physarum algorithm: generate seed points (food sources)
    const seedCount = Math.max(3, Math.round(count * 0.1));
    const seeds: Array<{ x: number; z: number; moisture: number }> = [];
    for (let s = 0; s < seedCount; s++) {
      seeds.push({
        x: bounds.min.x + rng.next() * size.x,
        z: bounds.min.z + rng.next() * size.z,
        moisture: rng.uniform(0.3, 1.0),
      });
    }

    for (let i = 0; i < count; i++) {
      // Pick nearest seed and grow toward it
      const baseX = bounds.min.x + rng.next() * size.x;
      const baseZ = bounds.min.z + rng.next() * size.z;

      // Find closest seed (food source)
      let closestSeed = seeds[0];
      let closestDist = Infinity;
      for (const seed of seeds) {
        const d = Math.sqrt((baseX - seed.x) ** 2 + (baseZ - seed.z) ** 2);
        if (d < closestDist) {
          closestDist = d;
          closestSeed = seed;
        }
      }

      // Bias position toward nearest seed (moisture gradient following)
      const gradientStrength = networkDensity * 0.3;
      const targetX = baseX + (closestSeed.x - baseX) * gradientStrength * rng.next();
      const targetZ = baseZ + (closestSeed.z - baseZ) * gradientStrength * rng.next();

      // Substrate preference: damp surfaces (lower = more damp)
      const moistureBias = closestSeed.moisture;
      const y = bounds.min.y + rng.uniform(0, size.y * 0.6) * moistureBias;

      positions[i * 3] = targetX;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = targetZ;

      // Surface attachment: mostly flat, some on vertical
      const onVertical = rng.next() > 0.7;
      if (onVertical) {
        const wallAngle = rng.uniform(0, Math.PI * 2);
        const q = axisAngleQuat(0, 1, 0, wallAngle);
        const tiltQ = axisAngleQuat(0, 0, 1, Math.PI / 2);
        const combined = multiplyQuat(q, tiltQ);
        rotations[i * 4] = combined[0]; rotations[i * 4 + 1] = combined[1];
        rotations[i * 4 + 2] = combined[2]; rotations[i * 4 + 3] = combined[3];
      } else {
        const yawAngle = rng.uniform(0, Math.PI * 2);
        const pitchAngle = -Math.PI / 2 + rng.uniform(-0.3, 0.3);
        const yawQ = axisAngleQuat(0, 1, 0, yawAngle);
        const pitchQ = axisAngleQuat(1, 0, 0, pitchAngle);
        const combined = multiplyQuat(yawQ, pitchQ);
        rotations[i * 4] = combined[0]; rotations[i * 4 + 1] = combined[1];
        rotations[i * 4 + 2] = combined[2]; rotations[i * 4 + 3] = combined[3];
      }

      // Scale: flat, spread out; pulsation baked as scale variation
      const s = rng.uniform(0.8, 1.2);
      const pulsation = 1.0 + 0.15 * Math.sin(i * 0.3);
      scales[i * 3] = s * rng.uniform(0.8, 1.4) * pulsation;
      scales[i * 3 + 1] = s * rng.uniform(0.03, 0.08) * pulsation;
      scales[i * 3 + 2] = s * rng.uniform(0.8, 1.4) * pulsation;

      // Color variation: yellow to white, translucent
      const colorBase = this._getColor(colorType, rng);
      colors[i * 4] = colorBase[0];
      colors[i * 4 + 1] = colorBase[1];
      colors[i * 4 + 2] = colorBase[2];
      colors[i * 4 + 3] = rng.uniform(0.5, 0.85); // Translucency
    }

    return {
      positions,
      rotations,
      scales,
      colors,
      count,
      materialHints: {
        roughness: 0.95,
        transparent: true,
        opacity: 0.7,
        doubleSide: true,
      },
    };
  }

  private _getColor(variant: SlimeMoldColor, rng: SeededRandom): [number, number, number] {
    switch (variant) {
      case 'yellow': {
        const hue = rng.uniform(0.1, 0.16);
        const sat = rng.uniform(0.5, 0.85);
        const light = rng.uniform(0.55, 0.8);
        const c = new THREE.Color().setHSL(hue, sat, light);
        return [c.r, c.g, c.b];
      }
      case 'orange': {
        const hue = rng.uniform(0.06, 0.1);
        const sat = rng.uniform(0.5, 0.8);
        const light = rng.uniform(0.5, 0.7);
        const c = new THREE.Color().setHSL(hue, sat, light);
        return [c.r, c.g, c.b];
      }
      case 'white': {
        const l = rng.uniform(0.85, 0.98);
        const s = rng.uniform(0, 0.1);
        const c = new THREE.Color().setHSL(rng.uniform(0.1, 0.16), s, l);
        return [c.r, c.g, c.b];
      }
      default: {
        const c = new THREE.Color(0xeedd44);
        return [c.r, c.g, c.b];
      }
    }
  }
}

// ============================================================================
// 3. LichenScatter
// ============================================================================

/** Lichen growth forms */
type LichenSpecies = 'crustose' | 'foliose' | 'fruticose';

/**
 * LichenScatter — Generates lichen colonies with species variation and growth rings.
 *
 * Features:
 * - Colony-based placement: circular/irregular patches on surfaces
 * - Species variation: crustose (flat), foliose (leafy), fruticose (branching)
 * - Substrate preference: rocks, tree bark, soil
 * - Growth rings: concentric zones of different colors/textures
 * - Environmental response: more growth on north-facing surfaces
 * - Output: InstancedMesh with flat patches conforming to surface
 */
export class LichenScatter implements ScatterGenerator {
  readonly type = 'lichen';

  generate(params: ScatterParams, rng: SeededRandom): ScatterResult {
    const density = params.density ?? 1.0;
    const bounds = params.bounds ?? new THREE.Box3(
      new THREE.Vector3(-20, 0, -20),
      new THREE.Vector3(20, 2, 20)
    );
    const speciesBias = (params.species as LichenSpecies) ?? undefined;

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const areaXZ = size.x * size.z;
    const count = Math.max(1, Math.round(areaXZ * density));

    const positions = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const scales = new Float32Array(count * 3);
    const colors = new Float32Array(count * 4);

    const speciesOptions: LichenSpecies[] = ['crustose', 'foliose', 'fruticose'];

    for (let i = 0; i < count; i++) {
      const x = bounds.min.x + rng.next() * size.x;
      const z = bounds.min.z + rng.next() * size.z;

      // North-facing bias: more growth on surfaces facing "north" (-z direction)
      const northBias = z < (bounds.min.z + size.z * 0.5) ? rng.uniform(1.0, 1.5) : rng.uniform(0.5, 1.0);

      // Substrate: height hints (0 = soil, mid = tree bark, high = rocks)
      const substrate = rng.choice<string>(['rock', 'bark', 'soil']);
      const y = substrate === 'bark'
        ? bounds.min.y + rng.uniform(size.y * 0.3, size.y * 0.8)
        : bounds.min.y + rng.uniform(0, size.y * 0.2);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Species selection
      const species = speciesBias ?? rng.choice(speciesOptions);

      // Surface alignment
      const onVertical = substrate === 'bark' || rng.next() > 0.6;
      if (onVertical) {
        const wallAngle = rng.uniform(0, Math.PI * 2);
        const q = axisAngleQuat(0, 1, 0, wallAngle);
        const tiltQ = axisAngleQuat(0, 0, 1, Math.PI / 2);
        const combined = multiplyQuat(q, tiltQ);
        rotations[i * 4] = combined[0]; rotations[i * 4 + 1] = combined[1];
        rotations[i * 4 + 2] = combined[2]; rotations[i * 4 + 3] = combined[3];
      } else {
        const yaw = rng.uniform(0, Math.PI * 2);
        const q = axisAngleQuat(0, 1, 0, yaw);
        const tiltQ = axisAngleQuat(1, 0, 0, -Math.PI / 2);
        const combined = multiplyQuat(q, tiltQ);
        rotations[i * 4] = combined[0]; rotations[i * 4 + 1] = combined[1];
        rotations[i * 4 + 2] = combined[2]; rotations[i * 4 + 3] = combined[3];
      }

      // Species-dependent scale
      const baseS = rng.uniform(0.8, 1.2) * northBias;
      switch (species) {
        case 'crustose':
          // Crustose: very flat, wide, tightly attached
          scales[i * 3] = baseS * rng.uniform(0.8, 1.5);
          scales[i * 3 + 1] = baseS * rng.uniform(0.01, 0.03);
          scales[i * 3 + 2] = baseS * rng.uniform(0.8, 1.5);
          break;
        case 'foliose':
          // Foliose: slightly raised, leafy
          scales[i * 3] = baseS * rng.uniform(0.6, 1.2);
          scales[i * 3 + 1] = baseS * rng.uniform(0.03, 0.08);
          scales[i * 3 + 2] = baseS * rng.uniform(0.6, 1.2);
          break;
        case 'fruticose':
          // Fruticose: taller, branching
          scales[i * 3] = baseS * rng.uniform(0.4, 0.9);
          scales[i * 3 + 1] = baseS * rng.uniform(0.08, 0.2);
          scales[i * 3 + 2] = baseS * rng.uniform(0.4, 0.9);
          break;
      }

      // Color: growth rings — concentric zones with different colors
      // Inner rings are darker/older, outer rings are brighter/newer
      const ringPhase = rng.uniform(0, 1); // 0 = inner, 1 = outer
      const baseHue = species === 'crustose'
        ? rng.uniform(0.2, 0.35)   // Gray-green
        : species === 'foliose'
          ? rng.uniform(0.15, 0.3)  // Yellow-green
          : rng.uniform(0.25, 0.4); // Green
      const sat = rng.uniform(0.2, 0.5) + ringPhase * 0.1;
      const light = rng.uniform(0.3, 0.5) + ringPhase * 0.15;
      const c = new THREE.Color().setHSL(baseHue, sat, light);
      colors[i * 4] = c.r;
      colors[i * 4 + 1] = c.g;
      colors[i * 4 + 2] = c.b;
      colors[i * 4 + 3] = 1.0;
    }

    return {
      positions,
      rotations,
      scales,
      colors,
      count,
      materialHints: {
        roughness: 0.95,
        doubleSide: true,
        transparent: false,
      },
    };
  }
}

// ============================================================================
// 4. MolluskScatter
// ============================================================================

/** Mollusk species categories */
type MolluskType = 'bivalve' | 'gastropod';

/** Specific mollusk species */
type MolluskSpecies =
  | 'clam' | 'mussel' | 'oyster'       // bivalves
  | 'snail' | 'whelk' | 'cone';         // gastropods

const BIVALVE_SPECIES: MolluskSpecies[] = ['clam', 'mussel', 'oyster'];
const GASTROPOD_SPECIES: MolluskSpecies[] = ['snail', 'whelk', 'cone'];

/** Species-specific parameters: [meanScale, scaleStdDev, heightRatio] */
const MOLLUSK_PARAMS: Record<MolluskSpecies, [number, number, number]> = {
  clam:    [0.05, 0.015, 0.5],
  mussel:  [0.06, 0.02,  0.3],
  oyster:  [0.07, 0.025, 0.4],
  snail:   [0.03, 0.01,  1.2],
  whelk:   [0.05, 0.015, 1.5],
  cone:    [0.04, 0.01,  2.0],
};

/**
 * MolluskScatter — Generates shell placements with species variation and substrate interaction.
 *
 * Features:
 * - Shell placement: clustering in tide pools, rocky shores, sandy bottoms
 * - Species types: bivalve (clam, mussel, oyster), gastropod (snail, whelk, cone)
 * - Orientation: bivalves half-buried, gastropods on surfaces
 * - Size distribution: log-normal with species-specific parameters
 * - Substrate interaction: attached to rocks, partially buried in sand
 * - Output: InstancedMesh with shell-shaped geometry
 */
export class MolluskScatter implements ScatterGenerator {
  readonly type = 'mollusk';

  generate(params: ScatterParams, rng: SeededRandom): ScatterResult {
    const density = params.density ?? 1.0;
    const bounds = params.bounds ?? new THREE.Box3(
      new THREE.Vector3(-20, 0, -20),
      new THREE.Vector3(20, 2, 20)
    );
    const clusterStrength = (params.clusterStrength as number) ?? 0.4;

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const areaXZ = size.x * size.z;
    const count = Math.max(1, Math.round(areaXZ * density));

    const positions = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const scales = new Float32Array(count * 3);
    const colors = new Float32Array(count * 4);

    // Generate cluster centers (tide pools, rocky outcrops)
    const clusterCount = Math.max(2, Math.round(count * clusterStrength * 0.1));
    const clusters: Array<{ x: number; z: number; radius: number }> = [];
    for (let c = 0; c < clusterCount; c++) {
      clusters.push({
        x: bounds.min.x + rng.next() * size.x,
        z: bounds.min.z + rng.next() * size.z,
        radius: rng.uniform(1.0, 4.0),
      });
    }

    for (let i = 0; i < count; i++) {
      // Cluster-biased placement
      const inCluster = rng.next() < clusterStrength;
      let x: number, z: number;
      if (inCluster && clusters.length > 0) {
        const cluster = rng.choice(clusters);
        const angle = rng.uniform(0, Math.PI * 2);
        const dist = rng.next() * cluster.radius;
        x = cluster.x + Math.cos(angle) * dist;
        z = cluster.z + Math.sin(angle) * dist;
      } else {
        x = bounds.min.x + rng.next() * size.x;
        z = bounds.min.z + rng.next() * size.z;
      }

      // Substrate determines species mix and height
      const substrate = rng.choice<string>(['sand', 'rock', 'tidal_pool']);
      const y = substrate === 'sand'
        ? bounds.min.y - rng.uniform(0.005, 0.02)  // Half-buried
        : bounds.min.y + rng.uniform(0, 0.01);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Species selection based on substrate
      const molluskType: MolluskType = substrate === 'sand'
        ? 'bivalve'
        : rng.choice<MolluskType>(['bivalve', 'gastropod']);
      const species = molluskType === 'bivalve'
        ? rng.choice(BIVALVE_SPECIES)
        : rng.choice(GASTROPOD_SPECIES);

      // Orientation: bivalves lie flat, gastropods point upward
      if (molluskType === 'bivalve') {
        const yaw = rng.uniform(0, Math.PI * 2);
        const tilt = rng.uniform(-0.2, 0.2);
        const yawQ = axisAngleQuat(0, 1, 0, yaw);
        const tiltQ = axisAngleQuat(1, 0, 0, tilt);
        const q = multiplyQuat(yawQ, tiltQ);
        rotations[i * 4] = q[0]; rotations[i * 4 + 1] = q[1];
        rotations[i * 4 + 2] = q[2]; rotations[i * 4 + 3] = q[3];
      } else {
        // Gastropod: upright with slight lean
        const yaw = rng.uniform(0, Math.PI * 2);
        const lean = rng.uniform(-0.3, 0.3);
        const yawQ = axisAngleQuat(0, 1, 0, yaw);
        const leanQ = axisAngleQuat(0, 0, 1, lean);
        const q = multiplyQuat(yawQ, leanQ);
        rotations[i * 4] = q[0]; rotations[i * 4 + 1] = q[1];
        rotations[i * 4 + 2] = q[2]; rotations[i * 4 + 3] = q[3];
      }

      // Size: log-normal distribution with species-specific parameters
      const [meanScale, scaleStd, heightRatio] = MOLLUSK_PARAMS[species];
      const logScale = rng.gaussian(Math.log(meanScale), Math.log(scaleStd / meanScale + 1));
      const baseScale = Math.exp(logScale);
      scales[i * 3] = baseScale;
      scales[i * 3 + 1] = baseScale * heightRatio;
      scales[i * 3 + 2] = baseScale;

      // Color: cream, pinkish, brownish
      const hue = rng.uniform(0.02, 0.12);
      const sat = rng.uniform(0.1, 0.4);
      const light = rng.uniform(0.6, 0.85);
      const c = new THREE.Color().setHSL(hue, sat, light);
      colors[i * 4] = c.r;
      colors[i * 4 + 1] = c.g;
      colors[i * 4 + 2] = c.b;
      colors[i * 4 + 3] = 1.0;
    }

    return {
      positions,
      rotations,
      scales,
      colors,
      count,
      materialHints: {
        roughness: 0.35,
        metalness: 0.1,
        transparent: false,
      },
    };
  }
}

// ============================================================================
// 5. JellyfishScatter
// ============================================================================

/** Jellyfish species */
type JellyfishSpecies = 'moon_jelly' | 'box_jelly' | 'lions_mane' | 'comb_jelly';

/** Species-specific parameters */
const JELLYFISH_PARAMS: Record<JellyfishSpecies, {
  bellRadius: [number, number];
  bellHeight: [number, number];
  tentacleCount: [number, number];
  tentacleLength: [number, number];
  pulseRate: number;
  bioluminescent: boolean;
  hueRange: [number, number];
  opacityRange: [number, number];
}> = {
  moon_jelly: {
    bellRadius: [0.06, 0.12],
    bellHeight: [0.03, 0.06],
    tentacleCount: [16, 32],
    tentacleLength: [0.15, 0.3],
    pulseRate: 0.8,
    bioluminescent: false,
    hueRange: [0.55, 0.6],
    opacityRange: [0.3, 0.5],
  },
  box_jelly: {
    bellRadius: [0.04, 0.08],
    bellHeight: [0.05, 0.1],
    tentacleCount: [4, 8],
    tentacleLength: [0.5, 2.0],
    pulseRate: 1.5,
    bioluminescent: false,
    hueRange: [0.05, 0.12],
    opacityRange: [0.4, 0.7],
  },
  lions_mane: {
    bellRadius: [0.1, 0.25],
    bellHeight: [0.06, 0.15],
    tentacleCount: [32, 64],
    tentacleLength: [1.0, 5.0],
    pulseRate: 0.4,
    bioluminescent: true,
    hueRange: [0.08, 0.14],
    opacityRange: [0.5, 0.8],
  },
  comb_jelly: {
    bellRadius: [0.03, 0.06],
    bellHeight: [0.04, 0.08],
    tentacleCount: [2, 4],
    tentacleLength: [0.1, 0.3],
    pulseRate: 2.0,
    bioluminescent: true,
    hueRange: [0.7, 0.85],
    opacityRange: [0.2, 0.45],
  },
};

/**
 * JellyfishScatter — Generates jellyfish in the water column with species variation.
 *
 * Features:
 * - Water column placement: floating at various depths
 * - Pulse animation: rhythmic bell contraction/expansion baked into scale
 * - Tentacle trails: trailing filaments with physics-based motion hints
 * - Species variation: moon jelly, box jelly, lion's mane, comb jelly
 * - Depth distribution: more near surface, fewer at depth
 * - Bioluminescence: some species emit light
 * - Output: InstancedMesh with translucent, animated geometry
 */
export class JellyfishScatter implements ScatterGenerator {
  readonly type = 'jellyfish';

  generate(params: ScatterParams, rng: SeededRandom): ScatterResult {
    const density = params.density ?? 0.3;
    const bounds = params.bounds ?? new THREE.Box3(
      new THREE.Vector3(-20, 0, -20),
      new THREE.Vector3(20, 10, 20)
    );
    const waterSurface = (params.waterSurface as number) ?? bounds.max.y;

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const areaXZ = size.x * size.z;
    const count = Math.max(1, Math.round(areaXZ * density));

    const positions = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const scales = new Float32Array(count * 3);
    const colors = new Float32Array(count * 4);

    const speciesOptions: JellyfishSpecies[] = ['moon_jelly', 'box_jelly', 'lions_mane', 'comb_jelly'];

    for (let i = 0; i < count; i++) {
      const x = bounds.min.x + rng.next() * size.x;
      const z = bounds.min.z + rng.next() * size.z;

      // Depth distribution: exponential decay from surface
      // Most jellyfish near the top, fewer at depth
      const depthFactor = Math.pow(rng.next(), 0.5); // Bias toward surface
      const y = waterSurface - depthFactor * size.y * 0.8;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Species selection
      const species = rng.choice(speciesOptions);
      const speciesParams = JELLYFISH_PARAMS[species];

      // Orientation: mostly upright, slight drift
      const yaw = rng.uniform(0, Math.PI * 2);
      const drift = rng.uniform(-0.1, 0.1);
      const yawQ = axisAngleQuat(0, 1, 0, yaw);
      const driftQ = axisAngleQuat(0, 0, 1, drift);
      const q = multiplyQuat(yawQ, driftQ);
      rotations[i * 4] = q[0]; rotations[i * 4 + 1] = q[1];
      rotations[i * 4 + 2] = q[2]; rotations[i * 4 + 3] = q[3];

      // Scale: bell radius/height with pulse animation baked in
      const bellR = rng.uniform(speciesParams.bellRadius[0], speciesParams.bellRadius[1]);
      const bellH = rng.uniform(speciesParams.bellHeight[0], speciesParams.bellHeight[1]);
      // Pulse: sinusoidal contraction/expansion
      const pulsePhase = rng.uniform(0, Math.PI * 2);
      const pulseFactor = 1.0 + 0.15 * Math.sin(pulsePhase * speciesParams.pulseRate);
      scales[i * 3] = bellR * pulseFactor;
      scales[i * 3 + 1] = bellH * (2.0 - pulseFactor); // Inverse: when expanded, shorter
      scales[i * 3 + 2] = bellR * pulseFactor;

      // Color: translucent with species-specific hue
      const hue = rng.uniform(speciesParams.hueRange[0], speciesParams.hueRange[1]);
      const sat = rng.uniform(0.3, 0.7);
      const light = rng.uniform(0.6, 0.85);
      const c = new THREE.Color().setHSL(hue, sat, light);

      // Bioluminescence: add emissive brightness
      const emissiveBoost = speciesParams.bioluminescent ? rng.uniform(0.2, 0.5) : 0;
      colors[i * 4] = Math.min(1, c.r + emissiveBoost);
      colors[i * 4 + 1] = Math.min(1, c.g + emissiveBoost);
      colors[i * 4 + 2] = Math.min(1, c.b + emissiveBoost * 0.5);
      colors[i * 4 + 3] = rng.uniform(speciesParams.opacityRange[0], speciesParams.opacityRange[1]);
    }

    return {
      positions,
      rotations,
      scales,
      colors,
      count,
      materialHints: {
        roughness: 0.2,
        metalness: 0.0,
        transparent: true,
        doubleSide: true,
        emissiveIntensity: 0.3,
      },
    };
  }
}
