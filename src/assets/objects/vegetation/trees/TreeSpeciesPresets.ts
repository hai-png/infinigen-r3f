/**
 * TreeSpeciesPresets.ts — Species-Specific Attractor Functions for Space Colonization
 *
 * Defines tree species with custom attractor generation functions that produce
 * characteristic crown shapes when used with the SpaceColonization algorithm.
 *
 * @deprecated These presets are maintained for backward compatibility.
 * New code should use SpeciesRegistry (from ../SpeciesRegistry) as the
 * single source of truth for species data. Use speciesAttractorPresetFromRegistry()
 * to convert a SpeciesEntry into a SpeciesAttractorPreset.
 *
 * Ported from: infinigen/terrain/objects/tree/space_colonization.py (species configs)
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import type { SpaceColonizationConfig } from '../SpaceColonization';
import { getSpeciesRegistry } from '../SpeciesRegistry';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Type signature for a custom attractor generator function */
export type AttractorGeneratorFn = (
  center: THREE.Vector3,
  radius: number,
  height: number,
  count: number,
  rng: SeededRandom
) => THREE.Vector3[];

/** Species-specific parameters for space colonization */
export interface SpeciesAttractorPreset {
  /** Human-readable species name */
  name: string;
  /** Description of the species' characteristics */
  description: string;
  /** Category of tree */
  category: 'broadleaf' | 'conifer' | 'palm' | 'tropical' | 'shrub' | 'exotic';
  /** Custom attractor generation function (overrides default volume shape) */
  attractorFn: AttractorGeneratorFn;
  /** SpaceColonizationConfig overrides */
  configOverrides: Partial<SpaceColonizationConfig>;
  /** Branch thickness at base (default 0.5) */
  branchThickness: number;
  /** Thickness decay per generation (default 0.65) */
  thicknessDecay: number;
  /** Leaf size multiplier (default 1.0) */
  leafSize: number;
  /** Leaf density 0–1 (default 0.7) */
  leafDensity: number;
  /** Trunk height ratio (0–1, default 0.4) */
  trunkHeightRatio: number;
  /** Bark color as HSL hue (default 0.07 = brown) */
  barkHue: number;
  /** Leaf color as HSL hue (default 0.3 = green) */
  leafHue: number;
  /** Maximum branch generation depth (default 5) */
  maxGeneration: number;
  /** Growth step size (default 0.3) */
  growthStep: number;
  /** Whether branches droop (negative Y bias) */
  drooping: boolean;
}

// ============================================================================
// Weeping Willow
// ============================================================================

const weepingWillowPreset: SpeciesAttractorPreset = {
  name: 'Weeping Willow',
  description: 'Graceful tree with long drooping branches that sweep toward the ground. Wide, dome-shaped crown with slender cascading branches.',
  category: 'broadleaf',
  attractorFn: generateWeepingWillowAttractors,
  configOverrides: {
    attractorCount: 600,
    killRadius: 0.4,
    influenceRadius: 3.5,
    growthStep: 0.35,
    branchingAngle: Math.PI / 5,
    maxIterations: 120,
    branchThreshold: 3,
    branchProbability: 0.6,
    volumeShape: 'hemisphere',
    volumeRadius: 5.0,
    volumeHeight: 4.0,
    addNoiseToGrowth: true,
    growthNoiseAmplitude: 0.15,
    baseThickness: 0.4,
    thicknessDecay: 0.55,
  },
  branchThickness: 0.4,
  thicknessDecay: 0.55,
  leafSize: 0.04,
  leafDensity: 0.6,
  trunkHeightRatio: 0.45,
  barkHue: 0.08,
  leafHue: 0.28,
  maxGeneration: 6,
  growthStep: 0.35,
  drooping: true,
};

/**
 * Weeping Willow attractor: points in an umbrella dome with
 * strong downward bias (branches droop toward ground).
 */
function generateWeepingWillowAttractors(
  center: THREE.Vector3,
  radius: number,
  height: number,
  count: number,
  rng: SeededRandom
): THREE.Vector3[] {
  const attractors: THREE.Vector3[] = [];

  for (let i = 0; i < count; i++) {
    // Generate in a wide hemisphere
    const u = rng.next();
    const v = rng.next();
    const w = rng.next();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(v); // Upper hemisphere
    const r = radius * Math.cbrt(w);

    let x = center.x + r * Math.sin(phi) * Math.cos(theta);
    let y = center.y + r * Math.cos(phi) * 0.6; // Compressed height
    let z = center.z + r * Math.sin(phi) * Math.sin(theta);

    // Drooping bias: push attractors downward, especially at the edges
    const distFromCenter = Math.sqrt((x - center.x) ** 2 + (z - center.z) ** 2);
    const edgeFactor = distFromCenter / radius;
    y -= edgeFactor * edgeFactor * height * 0.5; // Droop at edges

    attractors.push(new THREE.Vector3(x, y, z));
  }

  return attractors;
}

// ============================================================================
// Baobab
// ============================================================================

const baobabPreset: SpeciesAttractorPreset = {
  name: 'African Baobab',
  description: 'Massive swollen trunk with sparse, thick branches and small canopy. Iconic bottle-shaped silhouette.',
  category: 'exotic',
  attractorFn: generateBaobabAttractors,
  configOverrides: {
    attractorCount: 300,
    killRadius: 0.8,
    influenceRadius: 4.0,
    growthStep: 0.5,
    branchingAngle: Math.PI / 4,
    maxIterations: 80,
    branchThreshold: 4,
    branchProbability: 0.3,
    volumeShape: 'hemisphere',
    volumeRadius: 4.0,
    volumeHeight: 3.0,
    addNoiseToGrowth: true,
    growthNoiseAmplitude: 0.08,
    baseThickness: 0.8,
    thicknessDecay: 0.7,
  },
  branchThickness: 0.8,
  thicknessDecay: 0.7,
  leafSize: 0.05,
  leafDensity: 0.4,
  trunkHeightRatio: 0.6,
  barkHue: 0.06,
  leafHue: 0.3,
  maxGeneration: 4,
  growthStep: 0.5,
  drooping: false,
};

/**
 * Baobab attractor: sparse crown at the top, with thick branches.
 * The attractors are concentrated in a small, sparse hemisphere
 * representing the sparse canopy.
 */
function generateBaobabAttractors(
  center: THREE.Vector3,
  radius: number,
  _height: number,
  count: number,
  rng: SeededRandom
): THREE.Vector3[] {
  const attractors: THREE.Vector3[] = [];

  for (let i = 0; i < count; i++) {
    // Sparse hemisphere — fewer, more spread out points
    const u = rng.next();
    const v = rng.next();
    const w = Math.pow(rng.next(), 0.7); // Bias toward outer surface
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(v);
    const r = radius * (0.5 + w * 0.5); // More points near the surface

    const x = center.x + r * Math.sin(phi) * Math.cos(theta);
    const y = center.y + r * Math.cos(phi) * 0.5;
    const z = center.z + r * Math.sin(phi) * Math.sin(theta);

    attractors.push(new THREE.Vector3(x, y, z));
  }

  return attractors;
}

// ============================================================================
// Sequoia
// ============================================================================

const sequoiaPreset: SpeciesAttractorPreset = {
  name: 'Coast Redwood / Sequoia',
  description: 'Tall, straight trunk with conical crown. Massive height with relatively narrow spread.',
  category: 'conifer',
  attractorFn: generateSequoiaAttractors,
  configOverrides: {
    attractorCount: 700,
    killRadius: 0.3,
    influenceRadius: 3.0,
    growthStep: 0.4,
    branchingAngle: Math.PI / 6,
    maxIterations: 150,
    branchThreshold: 3,
    branchProbability: 0.4,
    volumeShape: 'cone',
    volumeRadius: 3.0,
    volumeHeight: 10.0,
    addNoiseToGrowth: true,
    growthNoiseAmplitude: 0.05,
    baseThickness: 0.6,
    thicknessDecay: 0.75,
  },
  branchThickness: 0.6,
  thicknessDecay: 0.75,
  leafSize: 0.02,
  leafDensity: 0.85,
  trunkHeightRatio: 0.3,
  barkHue: 0.05,
  leafHue: 0.33,
  maxGeneration: 5,
  growthStep: 0.4,
  drooping: false,
};

/**
 * Sequoia attractor: tall conical crown with dense foliage.
 * The attractors form a narrow cone pointing upward.
 */
function generateSequoiaAttractors(
  center: THREE.Vector3,
  radius: number,
  height: number,
  count: number,
  rng: SeededRandom
): THREE.Vector3[] {
  const attractors: THREE.Vector3[] = [];

  for (let i = 0; i < count; i++) {
    // Uniform point in cone
    const t = rng.next(); // 0 = base, 1 = apex
    const y = center.y - height / 2 + t * height;
    const maxR = radius * (1 - t * 0.8); // Narrow cone
    const angle = rng.uniform(0, Math.PI * 2);
    const r = maxR * Math.sqrt(rng.next());

    const x = center.x + r * Math.cos(angle);
    const z = center.z + r * Math.sin(angle);

    attractors.push(new THREE.Vector3(x, y, z));
  }

  return attractors;
}

// ============================================================================
// Acacia
// ============================================================================

const acaciaPreset: SpeciesAttractorPreset = {
  name: 'Umbrella Thorn Acacia',
  description: 'Flat-topped canopy with spreading branches. Distinctive umbrella silhouette with thorny branches.',
  category: 'tropical',
  attractorFn: generateAcaciaAttractors,
  configOverrides: {
    attractorCount: 500,
    killRadius: 0.4,
    influenceRadius: 3.5,
    growthStep: 0.35,
    branchingAngle: Math.PI / 3,
    maxIterations: 100,
    branchThreshold: 3,
    branchProbability: 0.5,
    volumeShape: 'cylinder',
    volumeRadius: 4.0,
    volumeHeight: 2.0,
    addNoiseToGrowth: true,
    growthNoiseAmplitude: 0.12,
    baseThickness: 0.45,
    thicknessDecay: 0.6,
  },
  branchThickness: 0.45,
  thicknessDecay: 0.6,
  leafSize: 0.03,
  leafDensity: 0.55,
  trunkHeightRatio: 0.65,
  barkHue: 0.07,
  leafHue: 0.29,
  maxGeneration: 5,
  growthStep: 0.35,
  drooping: false,
};

/**
 * Acacia attractor: flat-topped canopy (disc shape).
 * Attractors are concentrated in a thin, wide disc at the top.
 */
function generateAcaciaAttractors(
  center: THREE.Vector3,
  radius: number,
  height: number,
  count: number,
  rng: SeededRandom
): THREE.Vector3[] {
  const attractors: THREE.Vector3[] = [];

  for (let i = 0; i < count; i++) {
    // Flat disc with slight thickness variation
    const angle = rng.uniform(0, Math.PI * 2);
    const r = radius * Math.sqrt(rng.next()) * 0.95;
    const y = center.y + (rng.next() - 0.5) * height * 0.3; // Thin layer

    const x = center.x + r * Math.cos(angle);
    const z = center.z + r * Math.sin(angle);

    attractors.push(new THREE.Vector3(x, y, z));
  }

  return attractors;
}

// ============================================================================
// Additional Species
// ============================================================================

/** Japanese Cherry Blossom */
const cherryBlossomPreset: SpeciesAttractorPreset = {
  name: 'Japanese Cherry Blossom',
  description: 'Elegant spreading crown with profuse pink-white blossoms. Delicate branches forming a wide vase shape.',
  category: 'broadleaf',
  attractorFn: generateCherryBlossomAttractors,
  configOverrides: {
    attractorCount: 500,
    killRadius: 0.35,
    influenceRadius: 3.0,
    growthStep: 0.3,
    branchingAngle: Math.PI / 4,
    maxIterations: 100,
    branchThreshold: 3,
    branchProbability: 0.55,
    volumeShape: 'sphere',
    volumeRadius: 3.5,
    volumeHeight: 3.0,
    addNoiseToGrowth: true,
    growthNoiseAmplitude: 0.12,
    baseThickness: 0.35,
    thicknessDecay: 0.6,
  },
  branchThickness: 0.35,
  thicknessDecay: 0.6,
  leafSize: 0.04,
  leafDensity: 0.65,
  trunkHeightRatio: 0.4,
  barkHue: 0.07,
  leafHue: 0.95, // Pink
  maxGeneration: 5,
  growthStep: 0.3,
  drooping: false,
};

/**
 * Cherry Blossom attractor: vase-shaped crown — wider at top, narrower at bottom.
 */
function generateCherryBlossomAttractors(
  center: THREE.Vector3,
  radius: number,
  height: number,
  count: number,
  rng: SeededRandom
): THREE.Vector3[] {
  const attractors: THREE.Vector3[] = [];

  for (let i = 0; i < count; i++) {
    const t = rng.next(); // 0=bottom, 1=top
    const y = center.y - height / 2 + t * height;

    // Vase shape: narrow at bottom, wide at top
    const widthFactor = 0.4 + t * 0.6;
    const maxR = radius * widthFactor;
    const angle = rng.uniform(0, Math.PI * 2);
    const r = maxR * Math.sqrt(rng.next());

    const x = center.x + r * Math.cos(angle);
    const z = center.z + r * Math.sin(angle);

    attractors.push(new THREE.Vector3(x, y, z));
  }

  return attractors;
}

// ============================================================================
// Species Registry
// ============================================================================

/**
 * Registry of all tree species presets with custom attractor functions.
 * These can be used with SpaceColonizationTreeGenerator by passing
 * the configOverrides and using the attractorFn for custom attractor generation.
 *
 * @deprecated Use SpeciesRegistry instead. This object is kept for backward compat.
 */
export const TREE_SPECIES_ATTRACTOR_PRESETS: Record<string, SpeciesAttractorPreset> = {
  weeping_willow: weepingWillowPreset,
  baobab: baobabPreset,
  sequoia: sequoiaPreset,
  acacia: acaciaPreset,
  cherry_blossom: cherryBlossomPreset,
};

/**
 * Bridge function: convert a SpeciesRegistry entry to a SpeciesAttractorPreset.
 * This allows generators to query SpeciesRegistry and produce the format
 * SpaceColonizationTreeGenerator expects, without duplicating preset data.
 *
 * If the species has an `attractor` field in the registry, it is used as
 * the configOverrides for the attractor preset. Otherwise, returns null.
 *
 * @param speciesName - Name of the species in the registry
 * @returns A SpeciesAttractorPreset, or null if the species is not in the registry
 */
export function speciesAttractorPresetFromRegistry(
  speciesName: string
): SpeciesAttractorPreset | null {
  const registry = getSpeciesRegistry();
  const entry = registry.get(speciesName);
  if (!entry) return null;

  // Use attractor data from registry if available
  const attractor = entry.attractor;
  const configOverrides: Partial<SpaceColonizationConfig> = attractor
    ? (attractor as Partial<SpaceColonizationConfig>)
    : {};

  // Build a generic attractor preset from registry data
  const preset: SpeciesAttractorPreset = {
    name: entry.displayName,
    description: `Attractor preset for ${entry.displayName}`,
    category: entry.category === 'tree' ? 'broadleaf' : (entry.category as SpeciesAttractorPreset['category']),
    attractorFn: (center, radius, height, count, rng) => {
      // Default spherical attractor generation
      const attractors: THREE.Vector3[] = [];
      for (let i = 0; i < count; i++) {
        const u = rng.next();
        const v = rng.next();
        const w = rng.next();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = radius * Math.cbrt(w);
        attractors.push(new THREE.Vector3(
          center.x + r * Math.sin(phi) * Math.cos(theta),
          center.y + r * Math.sin(phi) * Math.sin(theta),
          center.z + r * Math.cos(phi)
        ));
      }
      return attractors;
    },
    configOverrides,
    branchThickness: ((entry.genome as Record<string, unknown>)?.branchThickness as number) ?? 0.5,
    thicknessDecay: ((entry.genome as Record<string, unknown>)?.thicknessDecay as number) ?? 0.65,
    leafSize: ((entry.genome as Record<string, unknown>)?.leafSize as number) ?? 1.0,
    leafDensity: ((entry.genome as Record<string, unknown>)?.leafDensity as number) ?? 0.7,
    trunkHeightRatio: ((entry.genome as Record<string, unknown>)?.trunkHeightRatio as number) ?? 0.4,
    barkHue: 0.07,
    leafHue: 0.3,
    maxGeneration: ((entry.genome as Record<string, unknown>)?.maxGeneration as number) ?? 5,
    growthStep: ((entry.genome as Record<string, unknown>)?.growthStep as number) ?? 0.3,
    drooping: false,
  };

  return preset;
}

/**
 * Get a species preset by name, or return null if not found.
 */
export function getSpeciesPreset(name: string): SpeciesAttractorPreset | null {
  // First try the local deprecated presets
  const localPreset = TREE_SPECIES_ATTRACTOR_PRESETS[name];
  if (localPreset) return localPreset;

  // Then try the SpeciesRegistry via bridge
  return speciesAttractorPresetFromRegistry(name);
}

/**
 * Get all available species names.
 * Combines local deprecated presets with SpeciesRegistry names.
 */
export function getAvailableSpecies(): string[] {
  const localNames = Object.keys(TREE_SPECIES_ATTRACTOR_PRESETS);
  const registryNames = getSpeciesRegistry().getNames();
  return [...new Set([...localNames, ...registryNames])].sort();
}

/**
 * Generate attractors for a species using its custom attractor function.
 *
 * @param speciesName Name from TREE_SPECIES_ATTRACTOR_PRESETS
 * @param center Center of the crown volume
 * @param radius Radius of the crown volume
 * @param height Height of the crown volume
 * @param count Number of attractors to generate
 * @param seed Random seed
 * @returns Array of attractor positions
 */
export function generateSpeciesAttractors(
  speciesName: string,
  center: THREE.Vector3,
  radius: number,
  height: number,
  count: number,
  seed: number = 42
): THREE.Vector3[] {
  const preset = TREE_SPECIES_ATTRACTOR_PRESETS[speciesName];
  if (!preset) {
    // Fallback: generate in a sphere
    const rng = new SeededRandom(seed);
    const attractors: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const u = rng.next();
      const v = rng.next();
      const w = rng.next();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = radius * Math.cbrt(w);
      attractors.push(new THREE.Vector3(
        center.x + r * Math.sin(phi) * Math.cos(theta),
        center.y + r * Math.sin(phi) * Math.sin(theta),
        center.z + r * Math.cos(phi)
      ));
    }
    return attractors;
  }

  const rng = new SeededRandom(seed);
  return preset.attractorFn(center, radius, height, count, rng);
}
