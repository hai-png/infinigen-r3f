/**
 * SpeciesRegistry — Single source of truth for tree/plant species presets
 *
 * Consolidates species presets from 5+ locations:
 *   - TreeGenome.ts → TREE_SPECIES_PRESETS
 *   - TreeGenerator.ts → TreeSpeciesPresets
 *   - LSystemTreeGenerator.ts → LSystemTreePresets
 *   - LSystemEngine.ts → LSystemPresets
 *   - TreeSpeciesPresets.ts → attractor presets
 *
 * Generators query this registry instead of maintaining their own preset lists.
 * New species can be registered at runtime via `registerSpecies()`.
 *
 * @module assets/objects/vegetation/SpeciesRegistry
 */

import type { Season, VegetationCategory } from './types';

// ============================================================================
// Species Entry
// ============================================================================

/**
 * A complete species entry containing all generation variant configs.
 */
export interface SpeciesEntry {
  /** Canonical species name (e.g. 'oak', 'pine') */
  name: string;
  /** Display name */
  displayName: string;
  /** Vegetation category */
  category: VegetationCategory;
  /** Default season for this species */
  defaultSeason: Season;
  /** Genome parameters for SpaceColonization-based generation */
  genome?: Record<string, unknown>;
  /** Mesh generation parameters for direct mesh generation */
  mesh?: Record<string, unknown>;
  /** L-system grammar parameters for L-system generation */
  lsystem?: Record<string, unknown>;
  /** Attractor parameters for space-colonization attractors */
  attractor?: Record<string, unknown>;
  /** Seasonal appearance overrides */
  seasonalColors?: Partial<Record<Season, { leaf: [number, number, number]; bark: [number, number, number] }>>;
}

// ============================================================================
// SpeciesRegistry
// ============================================================================

/**
 * Registry for tree and plant species.
 *
 * Provides O(1) lookup by species name, runtime extensibility,
 * and category-based filtering.
 */
export class SpeciesRegistry {
  private species: Map<string, SpeciesEntry> = new Map();

  /** Register a species entry */
  register(entry: SpeciesEntry): void {
    this.species.set(entry.name, entry);
  }

  /** Get a species entry by name */
  get(name: string): SpeciesEntry | undefined {
    return this.species.get(name);
  }

  /** Check if a species is registered */
  has(name: string): boolean {
    return this.species.has(name);
  }

  /** Get all registered species names */
  getNames(): string[] {
    return Array.from(this.species.keys()).sort();
  }

  /** Get all species of a given category */
  getByCategory(category: VegetationCategory): SpeciesEntry[] {
    return Array.from(this.species.values()).filter(s => s.category === category);
  }

  /** Get all species entries */
  getAll(): SpeciesEntry[] {
    return Array.from(this.species.values());
  }
}

// ============================================================================
// Global singleton
// ============================================================================

/** Global species registry instance */
let globalRegistry: SpeciesRegistry | null = null;

/**
 * Get the global species registry, populating it on first call.
 */
export function getSpeciesRegistry(): SpeciesRegistry {
  if (globalRegistry) return globalRegistry;

  globalRegistry = new SpeciesRegistry();

  // Populate with well-known tree species
  const BUILTIN_SPECIES: SpeciesEntry[] = [
    {
      name: 'oak',
      displayName: 'Oak',
      category: 'tree',
      defaultSeason: 'summer',
      mesh: { trunkRadius: 0.4, trunkHeight: 6, crownRadius: 5, crownDensity: 0.8 },
      lsystem: { axiom: 'F', rules: { F: 'FF+[+F-F-F]-[-F+F+F]' }, angle: 25, iterations: 4 },
      seasonalColors: {
        spring: { leaf: [0.4, 0.7, 0.2], bark: [0.4, 0.25, 0.15] },
        summer: { leaf: [0.2, 0.5, 0.1], bark: [0.4, 0.25, 0.15] },
        autumn: { leaf: [0.8, 0.4, 0.1], bark: [0.4, 0.25, 0.15] },
        winter: { leaf: [0.5, 0.4, 0.3], bark: [0.4, 0.25, 0.15] },
      },
    },
    {
      name: 'pine',
      displayName: 'Pine',
      category: 'tree',
      defaultSeason: 'summer',
      mesh: { trunkRadius: 0.25, trunkHeight: 10, crownRadius: 3, crownDensity: 0.95 },
      lsystem: { axiom: 'FF', rules: { F: 'FF-[-F+F+F]+[+F-F-F]' }, angle: 22, iterations: 3 },
      seasonalColors: {
        spring: { leaf: [0.15, 0.45, 0.15], bark: [0.45, 0.35, 0.2] },
        summer: { leaf: [0.1, 0.35, 0.1], bark: [0.45, 0.35, 0.2] },
        autumn: { leaf: [0.15, 0.35, 0.12], bark: [0.45, 0.35, 0.2] },
        winter: { leaf: [0.1, 0.3, 0.1], bark: [0.45, 0.35, 0.2] },
      },
    },
    {
      name: 'birch',
      displayName: 'Birch',
      category: 'tree',
      defaultSeason: 'summer',
      mesh: { trunkRadius: 0.2, trunkHeight: 8, crownRadius: 3, crownDensity: 0.6 },
      lsystem: { axiom: 'F', rules: { F: 'F[+F]F[-F]F' }, angle: 25.7, iterations: 4 },
      seasonalColors: {
        spring: { leaf: [0.5, 0.8, 0.3], bark: [0.9, 0.88, 0.82] },
        summer: { leaf: [0.3, 0.65, 0.2], bark: [0.9, 0.88, 0.82] },
        autumn: { leaf: [0.9, 0.7, 0.2], bark: [0.9, 0.88, 0.82] },
        winter: { leaf: [0.7, 0.6, 0.5], bark: [0.9, 0.88, 0.82] },
      },
    },
    {
      name: 'palm',
      displayName: 'Palm',
      category: 'tree',
      defaultSeason: 'summer',
      mesh: { trunkRadius: 0.2, trunkHeight: 8, crownRadius: 4, crownDensity: 0.5 },
      lsystem: { axiom: 'F', rules: { F: 'FF+[+F-F-F]-[-F+F+F]' }, angle: 30, iterations: 3 },
      seasonalColors: {
        spring: { leaf: [0.3, 0.6, 0.2], bark: [0.55, 0.4, 0.25] },
        summer: { leaf: [0.2, 0.5, 0.1], bark: [0.55, 0.4, 0.25] },
        autumn: { leaf: [0.25, 0.5, 0.15], bark: [0.55, 0.4, 0.25] },
        winter: { leaf: [0.2, 0.45, 0.1], bark: [0.55, 0.4, 0.25] },
      },
    },
    {
      name: 'willow',
      displayName: 'Willow',
      category: 'tree',
      defaultSeason: 'summer',
      mesh: { trunkRadius: 0.35, trunkHeight: 5, crownRadius: 6, crownDensity: 0.7 },
      lsystem: { axiom: 'F', rules: { F: 'FF-[-F+F]+[+F-F]' }, angle: 22, iterations: 5 },
      seasonalColors: {
        spring: { leaf: [0.5, 0.75, 0.3], bark: [0.35, 0.25, 0.15] },
        summer: { leaf: [0.25, 0.55, 0.15], bark: [0.35, 0.25, 0.15] },
        autumn: { leaf: [0.7, 0.55, 0.15], bark: [0.35, 0.25, 0.15] },
        winter: { leaf: [0.4, 0.35, 0.25], bark: [0.35, 0.25, 0.15] },
      },
    },
    {
      name: 'maple',
      displayName: 'Maple',
      category: 'tree',
      defaultSeason: 'autumn',
      mesh: { trunkRadius: 0.35, trunkHeight: 7, crownRadius: 5, crownDensity: 0.75 },
      seasonalColors: {
        spring: { leaf: [0.4, 0.7, 0.25], bark: [0.4, 0.3, 0.18] },
        summer: { leaf: [0.2, 0.5, 0.12], bark: [0.4, 0.3, 0.18] },
        autumn: { leaf: [0.9, 0.35, 0.1], bark: [0.4, 0.3, 0.18] },
        winter: { leaf: [0.5, 0.4, 0.3], bark: [0.4, 0.3, 0.18] },
      },
    },
    {
      name: 'spruce',
      displayName: 'Spruce',
      category: 'tree',
      defaultSeason: 'summer',
      mesh: { trunkRadius: 0.2, trunkHeight: 12, crownRadius: 3.5, crownDensity: 0.9 },
      lsystem: { axiom: 'FF', rules: { F: 'FF-[-F+F]+[+F-F]' }, angle: 20, iterations: 3 },
      seasonalColors: {
        spring: { leaf: [0.15, 0.42, 0.12], bark: [0.4, 0.3, 0.2] },
        summer: { leaf: [0.1, 0.32, 0.08], bark: [0.4, 0.3, 0.2] },
        autumn: { leaf: [0.12, 0.32, 0.1], bark: [0.4, 0.3, 0.2] },
        winter: { leaf: [0.08, 0.28, 0.08], bark: [0.4, 0.3, 0.2] },
      },
    },
    {
      name: 'cedar',
      displayName: 'Cedar',
      category: 'tree',
      defaultSeason: 'summer',
      mesh: { trunkRadius: 0.3, trunkHeight: 9, crownRadius: 4, crownDensity: 0.85 },
      seasonalColors: {
        spring: { leaf: [0.2, 0.5, 0.15], bark: [0.45, 0.35, 0.22] },
        summer: { leaf: [0.15, 0.4, 0.1], bark: [0.45, 0.35, 0.22] },
        autumn: { leaf: [0.18, 0.4, 0.12], bark: [0.45, 0.35, 0.22] },
        winter: { leaf: [0.12, 0.35, 0.08], bark: [0.45, 0.35, 0.22] },
      },
    },
  ];

  for (const entry of BUILTIN_SPECIES) {
    globalRegistry.register(entry);
  }

  return globalRegistry;
}

/**
 * Reset the global registry (for testing).
 */
export function resetSpeciesRegistry(): void {
  globalRegistry = null;
}
