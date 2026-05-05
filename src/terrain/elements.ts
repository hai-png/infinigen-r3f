/**
 * Terrain Elements - Terrain feature and element generation
 * 
 * Provides generators for terrain elements like rocks, boulders,
 * cliffs, vegetation patches, and other surface features.
 * 
 * Also re-exports the Unified Element Composition System from
 * the SDF module for composable terrain generation.
 */

export interface TerrainElement {
  type: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  properties: Record<string, any>;
}

export interface ElementGenerator {
  generate(seed: number, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): TerrainElement[];
}

class RockElementGenerator implements ElementGenerator {
  generate(seed: number, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): TerrainElement[] {
    return [];
  }
}

class VegetationPatchGenerator implements ElementGenerator {
  generate(seed: number, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): TerrainElement[] {
    return [];
  }
}

export { RockElementGenerator, VegetationPatchGenerator };

// Re-export from the Unified Element Composition System
export type {
  ElementEvalResult,
  SceneCompositionConfig,
} from './sdf/TerrainElementSystem';
export {
  TerrainElement as SDFTerrainElement,
  CompositionOperation,
  ElementRegistry,
  GroundElement,
  MountainElement,
  CaveElement,
  VoronoiRockElement,
  WaterbodyElement,
  SceneComposer,
  DEFAULT_SCENE_COMPOSITION_CONFIG,
  buildSDFFromElements,
} from './sdf/TerrainElementSystem';
