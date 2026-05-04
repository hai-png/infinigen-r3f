/**
 * Terrain Element Generators — Real Implementations for Terrain Features
 *
 * Replaces empty-array-returning element generators (RockElementGenerator,
 * VegetationPatchGenerator) with full implementations that produce terrain
 * elements for rocks, cliffs, erosion features, volcanic terrain, and
 * desert landscapes.
 *
 * All generators use deterministic random (SeededRandom) for reproducibility.
 *
 * @module terrain/sdf
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { SDFPrimitiveResult, TERRAIN_MATERIALS } from './SDFPrimitives';
import { smoothUnion } from './SDFCombinators';
import { TerrainElement } from '../elements';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Re-export TerrainElement from the canonical source for convenience.
 */
export type { TerrainElement } from '../elements';

/** Rock type classification */
export type RockType = 'boulder' | 'flat' | 'angular' | 'rounded';

/** Stone material classification */
export type StoneMaterial = 'stone' | 'sandstone' | 'basalt' | 'granite';

/** Configuration for rock element generation */
export interface RockElementConfig {
  /** Random seed */
  seed: number;
  /** Generation bounds */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Base terrain height at a point (for placement) */
  heightProvider?: (x: number, z: number) => number;
  /** Density: elements per square unit (default 0.05) */
  density: number;
  /** Power law exponent for size distribution (default 2.0, more small than large) */
  sizePowerExp: number;
  /** Minimum rock size */
  minSize: number;
  /** Maximum rock size */
  maxSize: number;
  /** Slope threshold: more rocks on slopes above this value (0-1) */
  slopeThreshold: number;
  /** Slope density multiplier */
  slopeDensityMult: number;
}

/** Configuration for cliff element generation */
export interface CliffElementConfig {
  seed: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  cliffCenter: THREE.Vector3;
  cliffHeight: number;
  cliffWidth: number;
  crackDensity: number;
  ledgeCount: number;
  vegetationLedgeProbability: number;
}

/** Configuration for erosion element generation */
export interface ErosionElementConfig {
  seed: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  gullyCount: number;
  screeAmount: number;
  depositCount: number;
  heightProvider?: (x: number, z: number) => number;
}

/** Configuration for volcanic element generation */
export interface VolcanicElementConfig {
  seed: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  craterCenter: THREE.Vector3;
  lavaTubeCount: number;
  bombCount: number;
  ashDepositCount: number;
  fumaroleCount: number;
}

/** Configuration for desert element generation */
export interface DesertElementConfig {
  seed: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  duneRippleDensity: number;
  pavementPatchCount: number;
  washChannelCount: number;
}

// ---------------------------------------------------------------------------
// Helper: Default Height Provider
// ---------------------------------------------------------------------------

/** Flat height provider as a fallback */
function flatHeight(_x: number, _z: number): number {
  return 0;
}

// ---------------------------------------------------------------------------
// generateRockElements
// ---------------------------------------------------------------------------

/**
 * Generate scattered rock elements for terrain.
 *
 * Features:
 * - Multiple rock types: boulder, flat, angular, rounded
 * - Placement rules: more rocks on slopes, fewer in flat areas
 * - Size distribution: power law with more small rocks than large
 * - Material assignment: stone, sandstone, basalt, granite
 *
 * @param config - Rock element configuration
 * @returns Array of terrain elements representing rocks
 */
export function generateRockElements(
  config: Partial<RockElementConfig> = {},
): TerrainElement[] {
  const cfg: RockElementConfig = {
    seed: 42,
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    density: 0.05,
    sizePowerExp: 2.0,
    minSize: 0.2,
    maxSize: 3.0,
    slopeThreshold: 0.3,
    slopeDensityMult: 3.0,
    ...config,
  };

  const rng = new SeededRandom(cfg.seed);
  const getHeight = cfg.heightProvider ?? flatHeight;
  const elements: TerrainElement[] = [];

  const areaWidth = cfg.bounds.maxX - cfg.bounds.minX;
  const areaDepth = cfg.bounds.maxZ - cfg.bounds.minZ;
  const area = areaWidth * areaDepth;

  // Base rock count from density
  const baseRockCount = Math.floor(area * cfg.density);

  // Generate rocks with power-law size distribution
  const rockTypes: RockType[] = ['boulder', 'flat', 'angular', 'rounded'];
  const stoneMaterials: StoneMaterial[] = ['stone', 'sandstone', 'basalt', 'granite'];
  const materialWeights = [0.4, 0.25, 0.2, 0.15]; // stone is most common

  for (let i = 0; i < baseRockCount; i++) {
    const x = rng.nextFloat(cfg.bounds.minX, cfg.bounds.maxX);
    const z = rng.nextFloat(cfg.bounds.minZ, cfg.bounds.maxZ);
    const baseHeight = getHeight(x, z);

    // Compute approximate slope at this point
    const dx = 1.0;
    const heightLeft = getHeight(x - dx, z);
    const heightRight = getHeight(x + dx, z);
    const heightUp = getHeight(x, z - dx);
    const heightDown = getHeight(x, z + dx);
    const slopeX = (heightRight - heightLeft) / (2 * dx);
    const slopeZ = (heightDown - heightUp) / (2 * dx);
    const slope = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);

    // Slope-based density modulation: more rocks on slopes
    const slopeFactor = slope > cfg.slopeThreshold ? cfg.slopeDensityMult : 1.0;
    if (rng.next() > slopeFactor / cfg.slopeDensityMult) continue;

    // Power-law size distribution: P(size > s) ~ s^(-alpha)
    // Inverse CDF: size = minSize * (maxSize/minSize)^(1-u^(1/alpha))
    const u = rng.next();
    const size = cfg.minSize * Math.pow(
      cfg.maxSize / cfg.minSize,
      Math.pow(u, 1.0 / cfg.sizePowerExp),
    );

    // Select rock type based on size
    let rockType: RockType;
    if (size > cfg.maxSize * 0.7) {
      rockType = 'boulder';
    } else if (size < cfg.minSize * 2) {
      rockType = rng.boolean(0.6) ? 'rounded' : 'flat';
    } else {
      rockType = rng.choice(rockTypes);
    }

    // Select stone material via weighted sampling
    const material = weightedChoice(stoneMaterials, materialWeights, rng);

    // Rotation: rocks on slopes should be slightly tilted
    const rotX = slope > cfg.slopeThreshold ? slopeX * 0.3 : 0;
    const rotZ = slope > cfg.slopeThreshold ? slopeZ * 0.3 : 0;
    const rotY = rng.next() * Math.PI * 2;

    // Scale variation based on rock type
    let scaleX: number, scaleY: number, scaleZ: number;
    switch (rockType) {
      case 'flat':
        scaleX = size * rng.nextFloat(1.2, 1.8);
        scaleY = size * rng.nextFloat(0.3, 0.6);
        scaleZ = size * rng.nextFloat(1.2, 1.8);
        break;
      case 'angular':
        scaleX = size * rng.nextFloat(0.7, 1.3);
        scaleY = size * rng.nextFloat(0.8, 1.4);
        scaleZ = size * rng.nextFloat(0.7, 1.3);
        break;
      case 'rounded':
        scaleX = scaleY = scaleZ = size * rng.nextFloat(0.9, 1.1);
        break;
      case 'boulder':
      default:
        scaleX = size * rng.nextFloat(0.8, 1.2);
        scaleY = size * rng.nextFloat(0.7, 1.1);
        scaleZ = size * rng.nextFloat(0.8, 1.2);
        break;
    }

    // Embed rock slightly into ground (10-30% of height below surface)
    const embedRatio = rng.nextFloat(0.1, 0.3);
    const yPos = baseHeight - scaleY * embedRatio;

    elements.push({
      type: `rock_${rockType}`,
      position: [x, yPos, z],
      rotation: [rotX, rotY, rotZ],
      scale: [scaleX, scaleY, scaleZ],
      properties: {
        rockType,
        material,
        size,
        slope,
        embedded: embedRatio,
      },
    });
  }

  return elements;
}

// ---------------------------------------------------------------------------
// generateCliffElements
// ---------------------------------------------------------------------------

/**
 * Generate cliff face detail elements.
 *
 * Features:
 * - Crack patterns on cliff faces
 * - Ledge/overhang geometry
 * - Vegetation ledges (flat areas where plants grow)
 *
 * @param config - Cliff element configuration
 * @returns Array of terrain elements representing cliff features
 */
export function generateCliffElements(
  config: Partial<CliffElementConfig> = {},
): TerrainElement[] {
  const cfg: CliffElementConfig = {
    seed: 42,
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    cliffCenter: new THREE.Vector3(0, 10, 0),
    cliffHeight: 20,
    cliffWidth: 30,
    crackDensity: 0.1,
    ledgeCount: 5,
    vegetationLedgeProbability: 0.4,
    ...config,
  };

  const rng = new SeededRandom(cfg.seed);
  const elements: TerrainElement[] = [];

  // --- Crack Patterns ---
  // Cracks follow the cliff face with varying angles and depths
  const crackCount = Math.floor(cfg.cliffHeight * cfg.cliffWidth * cfg.crackDensity);

  for (let i = 0; i < crackCount; i++) {
    const x = cfg.cliffCenter.x + rng.nextFloat(-cfg.cliffWidth / 2, cfg.cliffWidth / 2);
    const y = cfg.cliffCenter.y + rng.nextFloat(-cfg.cliffHeight / 2, cfg.cliffHeight / 2);
    const z = cfg.cliffCenter.z + rng.nextFloat(-0.5, 0.5);

    // Crack properties
    const crackLength = rng.nextFloat(0.5, 3.0);
    const crackDepth = rng.nextFloat(0.05, 0.2);
    const crackAngle = rng.nextFloat(-Math.PI / 6, Math.PI / 6); // Mostly vertical-ish
    const crackBranches = rng.nextInt(0, 2);

    elements.push({
      type: 'cliff_crack',
      position: [x, y, z],
      rotation: [0, 0, crackAngle],
      scale: [crackDepth, crackLength, crackDepth],
      properties: {
        depth: crackDepth,
        length: crackLength,
        branches: crackBranches,
        angle: crackAngle,
      },
    });
  }

  // --- Ledges and Overhangs ---
  // Horizontal features that protrude from the cliff face
  for (let i = 0; i < cfg.ledgeCount; i++) {
    const ledgeY = cfg.cliffCenter.y + rng.nextFloat(-cfg.cliffHeight / 2, cfg.cliffHeight / 2);
    const ledgeX = cfg.cliffCenter.x + rng.nextFloat(-cfg.cliffWidth / 3, cfg.cliffWidth / 3);
    const ledgeZ = cfg.cliffCenter.z;

    const ledgeWidth = rng.nextFloat(2, 8);
    const ledgeDepth = rng.nextFloat(0.3, 1.5);
    const ledgeThickness = rng.nextFloat(0.2, 0.6);
    const isOverhang = rng.boolean(0.3);

    // Vegetation can grow on ledges
    const hasVegetation = rng.next() < cfg.vegetationLedgeProbability;
    const vegType = hasVegetation ? rng.choice(['moss', 'grass', 'shrub', 'fern'] as const) : null;

    elements.push({
      type: isOverhang ? 'cliff_overhang' : 'cliff_ledge',
      position: [ledgeX, ledgeY, ledgeZ],
      rotation: [0, rng.next() * Math.PI, 0],
      scale: [ledgeWidth, ledgeThickness, ledgeDepth],
      properties: {
        width: ledgeWidth,
        depth: ledgeDepth,
        thickness: ledgeThickness,
        isOverhang,
        hasVegetation,
        vegetationType: vegType,
      },
    });
  }

  return elements;
}

// ---------------------------------------------------------------------------
// generateErosionElements
// ---------------------------------------------------------------------------

/**
 * Generate erosion-related detail elements.
 *
 * Features:
 * - Gully carved channels
 * - Scree/talus at cliff bases
 * - Sediment deposits
 *
 * @param config - Erosion element configuration
 * @returns Array of terrain elements representing erosion features
 */
export function generateErosionElements(
  config: Partial<ErosionElementConfig> = {},
): TerrainElement[] {
  const cfg: ErosionElementConfig = {
    seed: 42,
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    gullyCount: 4,
    screeAmount: 20,
    depositCount: 5,
    heightProvider: flatHeight,
    ...config,
  };

  const rng = new SeededRandom(cfg.seed);
  const getHeight = cfg.heightProvider ?? flatHeight;
  const elements: TerrainElement[] = [];

  // --- Gully Channels ---
  // Erosion gullies are carved channels that follow downhill paths
  for (let i = 0; i < cfg.gullyCount; i++) {
    // Start point: random position at the top of the terrain
    const startX = rng.nextFloat(cfg.bounds.minX, cfg.bounds.maxX);
    const startZ = rng.nextFloat(cfg.bounds.minZ, cfg.bounds.maxZ);
    const startY = getHeight(startX, startZ);

    // Gully path: follows downhill via gradient descent (simplified)
    const gullyWidth = rng.nextFloat(0.3, 2.0);
    const gullyDepth = rng.nextFloat(0.2, 1.5);
    const gullyLength = rng.nextFloat(10, 40);

    // Generate gully path as a series of points
    const segments = Math.floor(gullyLength / 2);
    let px = startX;
    let pz = startZ;
    let angle = rng.next() * Math.PI * 2;

    for (let s = 0; s < segments; s++) {
      const py = getHeight(px, pz);

      // Wind the gully slightly
      angle += rng.nextFloat(-0.3, 0.3);

      elements.push({
        type: 'erosion_gully',
        position: [px, py, pz],
        rotation: [0, angle, 0],
        scale: [gullyWidth * (1 + s * 0.05), gullyDepth * (1 + s * 0.03), 2.0],
        properties: {
          segmentIndex: s,
          totalSegments: segments,
          width: gullyWidth * (1 + s * 0.05),
          depth: gullyDepth * (1 + s * 0.03),
          startWidth: gullyWidth,
          startDepth: gullyDepth,
        },
      });

      // Move to next segment
      px += Math.cos(angle) * 2;
      pz += Math.sin(angle) * 2;
    }
  }

  // --- Scree/Talus at Cliff Bases ---
  // Loose rocks accumulated at the base of cliffs
  for (let i = 0; i < cfg.screeAmount; i++) {
    const x = rng.nextFloat(cfg.bounds.minX, cfg.bounds.maxX);
    const z = rng.nextFloat(cfg.bounds.minZ, cfg.bounds.maxZ);
    const y = getHeight(x, z);

    // Scree rocks are small and sub-angular
    const size = rng.nextFloat(0.05, 0.4);
    const angularity = rng.nextFloat(0.3, 0.8); // Not perfectly rounded

    elements.push({
      type: 'erosion_scree',
      position: [x, y + size * 0.3, z],
      rotation: [rng.nextFloat(-0.3, 0.3), rng.next() * Math.PI * 2, rng.nextFloat(-0.3, 0.3)],
      scale: [size * rng.nextFloat(0.8, 1.2), size * rng.nextFloat(0.5, 0.9), size * rng.nextFloat(0.8, 1.2)],
      properties: {
        size,
        angularity,
        material: rng.choice(['stone', 'sandstone'] as const),
      },
    });
  }

  // --- Sediment Deposits ---
  // Flat areas of accumulated sediment (alluvial deposits)
  for (let i = 0; i < cfg.depositCount; i++) {
    const x = rng.nextFloat(cfg.bounds.minX, cfg.bounds.maxX);
    const z = rng.nextFloat(cfg.bounds.minZ, cfg.bounds.maxZ);
    const y = getHeight(x, z);

    const depositRadius = rng.nextFloat(2, 8);
    const depositThickness = rng.nextFloat(0.1, 0.5);
    const sedimentType = rng.choice(['silt', 'clay', 'sand', 'gravel'] as const);

    elements.push({
      type: 'erosion_deposit',
      position: [x, y, z],
      rotation: [0, rng.next() * Math.PI * 2, 0],
      scale: [depositRadius, depositThickness, depositRadius * rng.nextFloat(0.7, 1.3)],
      properties: {
        radius: depositRadius,
        thickness: depositThickness,
        sedimentType,
        material: TERRAIN_MATERIALS.SOIL,
      },
    });
  }

  return elements;
}

// ---------------------------------------------------------------------------
// generateVolcanicElements
// ---------------------------------------------------------------------------

/**
 * Generate volcanic terrain elements.
 *
 * Features:
 * - Lava tubes: cylindrical tunnels through volcanic rock
 * - Volcanic bombs: rounded ejected rocks
 * - Ash deposits: flat layers of volcanic ash
 * - Fumaroles: vent structures emitting steam
 *
 * @param config - Volcanic element configuration
 * @returns Array of terrain elements representing volcanic features
 */
export function generateVolcanicElements(
  config: Partial<VolcanicElementConfig> = {},
): TerrainElement[] {
  const cfg: VolcanicElementConfig = {
    seed: 42,
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    craterCenter: new THREE.Vector3(0, 5, 0),
    lavaTubeCount: 3,
    bombCount: 15,
    ashDepositCount: 8,
    fumaroleCount: 4,
    ...config,
  };

  const rng = new SeededRandom(cfg.seed);
  const elements: TerrainElement[] = [];

  // --- Lava Tubes ---
  // Cylindrical tunnels carved through volcanic rock by flowing lava
  for (let i = 0; i < cfg.lavaTubeCount; i++) {
    const startX = cfg.craterCenter.x + rng.nextFloat(-10, 10);
    const startY = cfg.craterCenter.y - rng.nextFloat(2, 8);
    const startZ = cfg.craterCenter.z + rng.nextFloat(-10, 10);

    // Lava tubes radiate outward and slightly downward from crater
    const angle = rng.next() * Math.PI * 2;
    const tubeLength = rng.nextFloat(10, 30);
    const endX = startX + Math.cos(angle) * tubeLength;
    const endZ = startZ + Math.sin(angle) * tubeLength;
    const endY = startY - rng.nextFloat(1, 5);

    const tubeRadius = rng.nextFloat(0.5, 2.5);
    const hasSkylight = rng.boolean(0.3);

    elements.push({
      type: 'volcanic_lava_tube',
      position: [startX, startY, startZ],
      rotation: [0, angle, rng.nextFloat(-0.2, 0.2)],
      scale: [tubeRadius, tubeRadius, tubeLength],
      properties: {
        radius: tubeRadius,
        length: tubeLength,
        start: [startX, startY, startZ] as [number, number, number],
        end: [endX, endY, endZ] as [number, number, number],
        hasSkylight,
        skylightPosition: hasSkylight
          ? [startX + (endX - startX) * rng.next(), startY + (endY - startY) * rng.next(), startZ + (endZ - startZ) * rng.next()] as [number, number, number]
          : null,
        material: TERRAIN_MATERIALS.LAVA,
      },
    });
  }

  // --- Volcanic Bombs ---
  // Rounded rocks ejected during eruptions, scattered around the crater
  for (let i = 0; i < cfg.bombCount; i++) {
    // Bombs land at random distances from crater
    const dist = rng.nextFloat(3, 30);
    const angle = rng.next() * Math.PI * 2;
    const x = cfg.craterCenter.x + Math.cos(angle) * dist;
    const z = cfg.craterCenter.z + Math.sin(angle) * dist;
    const y = cfg.craterCenter.y + rng.nextFloat(-2, 1);

    // Bombs are typically ellipsoidal (spindle or ribbon shaped)
    const size = rng.nextFloat(0.2, 1.5);
    const elongation = rng.nextFloat(1.0, 2.5); // How elongated the bomb is
    const bombAngle = rng.next() * Math.PI * 2;

    // Orientation often aligns with trajectory
    const trajectoryAngle = Math.atan2(z - cfg.craterCenter.z, x - cfg.craterCenter.x);

    elements.push({
      type: 'volcanic_bomb',
      position: [x, y, z],
      rotation: [rng.nextFloat(-0.3, 0.3), trajectoryAngle, bombAngle],
      scale: [size * elongation, size, size],
      properties: {
        size,
        elongation,
        material: 'basalt',
        distance: dist,
        impactCrater: size > 0.8 ? rng.nextFloat(0.1, 0.3) : 0,
      },
    });
  }

  // --- Ash Deposits ---
  // Flat layers of volcanic ash spread by wind
  for (let i = 0; i < cfg.ashDepositCount; i++) {
    const x = rng.nextFloat(cfg.bounds.minX, cfg.bounds.maxX);
    const z = rng.nextFloat(cfg.bounds.minZ, cfg.bounds.maxZ);
    const y = cfg.craterCenter.y + rng.nextFloat(-3, 0);

    // Ash deposits are wider downwind
    const windAngle = rng.next() * Math.PI * 2;
    const depositWidth = rng.nextFloat(3, 12);
    const depositLength = depositWidth * rng.nextFloat(1.5, 3.0);
    const depositThickness = rng.nextFloat(0.05, 0.3);

    elements.push({
      type: 'volcanic_ash_deposit',
      position: [x, y, z],
      rotation: [0, windAngle, 0],
      scale: [depositWidth, depositThickness, depositLength],
      properties: {
        width: depositWidth,
        length: depositLength,
        thickness: depositThickness,
        material: TERRAIN_MATERIALS.SAND,
        ashType: rng.choice(['fine', 'coarse', 'pumice'] as const),
      },
    });
  }

  // --- Fumaroles ---
  // Vent structures that emit steam and volcanic gases
  for (let i = 0; i < cfg.fumaroleCount; i++) {
    // Fumaroles cluster near the crater
    const dist = rng.nextFloat(2, 10);
    const angle = rng.next() * Math.PI * 2;
    const x = cfg.craterCenter.x + Math.cos(angle) * dist;
    const z = cfg.craterCenter.z + Math.sin(angle) * dist;
    const y = cfg.craterCenter.y + rng.nextFloat(-1, 1);

    const ventRadius = rng.nextFloat(0.1, 0.5);
    const ventHeight = rng.nextFloat(0.3, 1.5);
    const temperature = rng.nextFloat(80, 400); // Celsius

    elements.push({
      type: 'volcanic_fumarole',
      position: [x, y, z],
      rotation: [0, rng.next() * Math.PI * 2, 0],
      scale: [ventRadius, ventHeight, ventRadius],
      properties: {
        ventRadius,
        ventHeight,
        temperature,
        gasType: rng.choice(['steam', 'sulfur_dioxide', 'hydrogen_sulfide'] as const),
        active: rng.boolean(0.8),
      },
    });
  }

  return elements;
}

// ---------------------------------------------------------------------------
// generateDesertElements
// ---------------------------------------------------------------------------

/**
 * Generate desert-specific terrain elements.
 *
 * Features:
 * - Sand dune ripples: wave-like surface patterns on dunes
 * - Desert pavement: flat rock mosaic on the surface
 * - Dry wash channels: eroded channels from flash floods
 *
 * @param config - Desert element configuration
 * @returns Array of terrain elements representing desert features
 */
export function generateDesertElements(
  config: Partial<DesertElementConfig> = {},
): TerrainElement[] {
  const cfg: DesertElementConfig = {
    seed: 42,
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    duneRippleDensity: 0.15,
    pavementPatchCount: 6,
    washChannelCount: 3,
    ...config,
  };

  const rng = new SeededRandom(cfg.seed);
  const elements: TerrainElement[] = [];

  // --- Sand Dune Ripples ---
  // Wave-like patterns on dune surfaces created by wind
  const areaWidth = cfg.bounds.maxX - cfg.bounds.minX;
  const areaDepth = cfg.bounds.maxZ - cfg.bounds.minZ;
  const rippleCount = Math.floor(areaWidth * areaDepth * cfg.duneRippleDensity);

  for (let i = 0; i < rippleCount; i++) {
    const x = rng.nextFloat(cfg.bounds.minX, cfg.bounds.maxX);
    const z = rng.nextFloat(cfg.bounds.minZ, cfg.bounds.maxZ);

    // Ripple orientation follows prevailing wind direction
    const windAngle = rng.nextFloat(-0.2, 0.2) + Math.PI * 0.25; // Prevailing wind direction

    // Ripple parameters
    const rippleWavelength = rng.nextFloat(0.1, 0.3); // Distance between crests
    const rippleAmplitude = rng.nextFloat(0.01, 0.05); // Height of ripples
    const rippleLength = rng.nextFloat(1, 5); // How long the ripple patch is

    elements.push({
      type: 'desert_dune_ripple',
      position: [x, 0, z],
      rotation: [0, windAngle, 0],
      scale: [rippleLength, rippleAmplitude, rippleWavelength * 10],
      properties: {
        wavelength: rippleWavelength,
        amplitude: rippleAmplitude,
        length: rippleLength,
        windAngle,
        material: TERRAIN_MATERIALS.SAND_DUNE,
      },
    });
  }

  // --- Desert Pavement ---
  // Flat mosaic of tightly packed small rocks on the desert surface
  for (let i = 0; i < cfg.pavementPatchCount; i++) {
    const x = rng.nextFloat(cfg.bounds.minX, cfg.bounds.maxX);
    const z = rng.nextFloat(cfg.bounds.minZ, cfg.bounds.maxZ);

    const patchRadius = rng.nextFloat(2, 8);
    const stoneCount = Math.floor(patchRadius * patchRadius * 0.5); // Stones per patch
    const stoneSize = rng.nextFloat(0.05, 0.2);

    // Generate individual stones in the pavement mosaic
    const stones: TerrainElement[] = [];
    for (let s = 0; s < stoneCount; s++) {
      const stoneAngle = rng.next() * Math.PI * 2;
      const stoneDist = rng.next() * patchRadius;
      const sx = x + Math.cos(stoneAngle) * stoneDist;
      const sz = z + Math.sin(stoneAngle) * stoneDist;

      stones.push({
        type: 'desert_pavement_stone',
        position: [sx, 0, sz],
        rotation: [0, rng.next() * Math.PI * 2, 0],
        scale: [
          stoneSize * rng.nextFloat(0.8, 1.2),
          stoneSize * rng.nextFloat(0.2, 0.5),
          stoneSize * rng.nextFloat(0.8, 1.2),
        ],
        properties: {
          size: stoneSize,
          material: rng.choice(['stone', 'basalt', 'granite'] as const),
          weathering: rng.nextFloat(0.5, 1.0), // Desert varnish
        },
      });
    }

    // Add the patch container
    elements.push({
      type: 'desert_pavement',
      position: [x, 0, z],
      rotation: [0, 0, 0],
      scale: [patchRadius, 0.05, patchRadius],
      properties: {
        radius: patchRadius,
        stoneCount,
        stoneSize,
        material: TERRAIN_MATERIALS.COBBLESTONE,
        stones: stones.map(s => ({
          position: s.position,
          scale: s.scale,
          properties: s.properties,
        })),
      },
    });

    // Also add individual stones to the output
    elements.push(...stones);
  }

  // --- Dry Wash Channels ---
  // Eroded channels created by occasional flash floods
  for (let i = 0; i < cfg.washChannelCount; i++) {
    // Wash channels start from higher ground and wind down
    const startX = rng.nextFloat(cfg.bounds.minX, cfg.bounds.maxX * 0.5);
    const startZ = rng.nextFloat(cfg.bounds.minZ, cfg.bounds.maxZ);

    const channelLength = rng.nextFloat(20, 60);
    const channelWidth = rng.nextFloat(1, 5);
    const channelDepth = rng.nextFloat(0.3, 1.5);

    // Channel path: winding downhill
    let angle = rng.next() * Math.PI * 0.5; // General downhill direction
    let px = startX;
    let pz = startZ;

    const segments = Math.floor(channelLength / 3);
    for (let s = 0; s < segments; s++) {
      // Wind the channel
      angle += rng.nextFloat(-0.4, 0.4);

      // Width increases downstream
      const segWidth = channelWidth * (1 + s * 0.03);

      elements.push({
        type: 'desert_wash_channel',
        position: [px, 0, pz],
        rotation: [0, angle, 0],
        scale: [segWidth, channelDepth * (1 - s / segments * 0.3), 3.0],
        properties: {
          segmentIndex: s,
          totalSegments: segments,
          width: segWidth,
          depth: channelDepth,
          material: TERRAIN_MATERIALS.SAND,
          hasWater: false, // Dry wash
        },
      });

      px += Math.cos(angle) * 3;
      pz += Math.sin(angle) * 3;
    }
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Utility: Weighted Random Choice
// ---------------------------------------------------------------------------

/**
 * Pick an item from an array using weighted probabilities.
 * Deterministic when using SeededRandom.
 */
function weightedChoice<T>(
  items: readonly T[],
  weights: readonly number[],
  rng: SeededRandom,
): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng.next() * total;

  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }

  return items[items.length - 1];
}

// ---------------------------------------------------------------------------
// SDF Evaluators for Element Types
// ---------------------------------------------------------------------------

/**
 * Create an SDF evaluator for a rock terrain element.
 * Maps the TerrainElement descriptor to an SDF function.
 */
export function createRockElementSDF(
  element: TerrainElement,
  noiseFn: (x: number, y: number, z: number, octaves: number) => number,
): (point: THREE.Vector3) => SDFPrimitiveResult {
  const center = new THREE.Vector3(...element.position);
  const scale = new THREE.Vector3(...element.scale);
  const halfSize = scale.clone().multiplyScalar(0.5);
  const rockType = (element.properties.rockType as string) ?? 'rounded';
  const material = (element.properties.material as string) ?? 'stone';

  // Map stone material to TERRAIN_MATERIALS ID
  const materialId = material === 'basalt' ? TERRAIN_MATERIALS.STONE
    : material === 'sandstone' ? TERRAIN_MATERIALS.SAND
    : material === 'granite' ? TERRAIN_MATERIALS.COBBLESTONE
    : TERRAIN_MATERIALS.STONE;

  return (point: THREE.Vector3): SDFPrimitiveResult => {
    const localPoint = point.clone().sub(center);

    let dist: number;
    switch (rockType) {
      case 'flat':
      case 'angular': {
        // Box-like SDF with noise displacement
        const boxDist = Math.max(
          Math.abs(localPoint.x) - halfSize.x,
          Math.abs(localPoint.y) - halfSize.y,
          Math.abs(localPoint.z) - halfSize.z,
        );
        // Add some noise for angular irregularity
        const noiseDisp = noiseFn(localPoint.x * 0.5, localPoint.y * 0.5, localPoint.z * 0.5, 2) * scale.x * 0.1;
        dist = boxDist + noiseDisp;
        break;
      }
      case 'boulder': {
        // Large sphere with noise warping
        const sphereDist = localPoint.length() - scale.x * 0.5;
        const warpDisp = noiseFn(localPoint.x * 0.3, localPoint.y * 0.3, localPoint.z * 0.3, 3) * scale.x * 0.15;
        dist = sphereDist + warpDisp;
        break;
      }
      case 'rounded':
      default: {
        // Smooth ellipsoid
        const normPoint = new THREE.Vector3(
          localPoint.x / (halfSize.x + 0.001),
          localPoint.y / (halfSize.y + 0.001),
          localPoint.z / (halfSize.z + 0.001),
        );
        dist = normPoint.length() - 1.0;
        break;
      }
    }

    return { distance: dist, materialId };
  };
}

/**
 * Create an SDF evaluator for a cliff crack element.
 */
export function createCliffCrackSDF(
  element: TerrainElement,
): (point: THREE.Vector3) => SDFPrimitiveResult {
  const center = new THREE.Vector3(...element.position);
  const scale = new THREE.Vector3(...element.scale);
  const depth = (element.properties.depth as number) ?? 0.1;
  const length = (element.properties.length as number) ?? 1.0;

  return (point: THREE.Vector3): SDFPrimitiveResult => {
    const localPoint = point.clone().sub(center);

    // Crack is a thin slab: wide in Y, narrow in X and Z
    const crackDist = Math.max(
      Math.abs(localPoint.x) - depth * 0.5,
      Math.abs(localPoint.y) - length * 0.5,
      Math.abs(localPoint.z) - depth * 0.5,
    );

    return { distance: crackDist, materialId: TERRAIN_MATERIALS.STONE };
  };
}

/**
 * Create an SDF evaluator for a volcanic bomb element.
 * Volcanic bombs are ellipsoidal (spindle-shaped).
 */
export function createVolcanicBombSDF(
  element: TerrainElement,
): (point: THREE.Vector3) => SDFPrimitiveResult {
  const center = new THREE.Vector3(...element.position);
  const scale = new THREE.Vector3(...element.scale);

  return (point: THREE.Vector3): SDFPrimitiveResult => {
    const localPoint = point.clone().sub(center);

    // Ellipsoid SDF
    const normPoint = new THREE.Vector3(
      localPoint.x / (scale.x * 0.5 + 0.001),
      localPoint.y / (scale.y * 0.5 + 0.001),
      localPoint.z / (scale.z * 0.5 + 0.001),
    );
    const dist = normPoint.length() - 1.0;

    return { distance: dist, materialId: TERRAIN_MATERIALS.LAVA };
  };
}
