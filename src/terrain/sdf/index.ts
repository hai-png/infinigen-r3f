/**
 * SDF Operations Module
 *
 * Provides SDF-based terrain generation with Marching Cubes extraction.
 * - sdf-operations: Core SDF class, boolean ops, and extractIsosurface()
 * - MeshToSDF: BVH-accelerated mesh-to-SDF conversion, OccupancyVolume, SDFGrid
 * - SDFTerrainGenerator: Full 3D terrain with caves, overhangs, and arches
 * - VoronoiRockElements: Enhanced Voronoi rock SDF with gap/warp/mask noise
 * - UpsidedownMountains: Floating mountain SDF and mesh generation
 * - TerrainElementGenerators: Rock, cliff, erosion, volcanic, desert element generators
 * - TerrainElementSystem: Unified element composition system (Foundation 2)
 */

export * from './sdf-operations';
export * from './MeshToSDF';
export * from './SDFTerrainGenerator';
export * from './VoronoiRockElements';
export * from './UpsidedownMountains';
export * from './TerrainElementGenerators';
// Re-export from TerrainElementSystem — rename TerrainElement class to avoid
// collision with the TerrainElement interface re-exported by TerrainElementGenerators
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
  LandTilesElement,
  WarpedRocksElement,
  UpsideDownMountainNewElement,
  AtmosphereElement,
  LSystemCaveGenerator,
  DEFAULT_CAVE_GRAMMAR,
} from './TerrainElementSystem';
export type {
  ElementEvalResult,
  SceneCompositionConfig,
} from './TerrainElementSystem';
export type {
  CaveGrammarConfig,
  CaveTunnelData,
} from './LSystemCave';
