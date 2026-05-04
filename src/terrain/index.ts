/**
 * Terrain Generation System
 * 
 * Complete terrain generation pipeline including:
 * - Biomes: Biome definition and blending systems
 * - Caves: Cave generation algorithms
 * - Core: Core terrain data structures
 * - Elements: Terrain elements and features
 * - Erosion: Hydraulic and thermal erosion simulation
 * - Generator: Main terrain generation pipeline
 * - GPU: GPU-accelerated terrain processing
 * - Land Process: Landform processing algorithms
 * - LandTiles: Tile-based terrain with heightmaps and biome interpolation
 * - Mesher: Mesh generation from implicit surfaces
 * - SDF: Signed distance field utilities
 * - Snow: Snow accumulation and rendering
 * - Source: Noise sources and sampling (CPU/CUDA)
 * - Tectonic: Plate tectonics simulation
 * - Utils: Terrain utility functions
 * - Water: Water body generation and simulation
 * 
 * Shared types (HeightMap, NormalMap) are in ./types.ts
 */

// Export shared terrain types first (authoritative source)
export type { HeightMap, NormalMap } from './types';
export { heightMapFromFloat32Array, sampleHeightAt, getHeightValueAt, setHeightValueAt } from './types';

// Sub-modules (these may re-export HeightMap/NormalMap from ../types for convenience,
// but the canonical source is ./types above)
export * from './biomes';
export * from './caves';
export * from './core';
export * from './elements';
export * from './erosion';
export * from './gpu';
export * from './land-process';
export * from './tiles';
export * from './materials';
export * from './mesher';
export * from './sdf';
export * from './snow';
export * from './source';
export * from './tectonic';
export * from './utils';
export * from './water';

// Phase 2 — Terrain System Overhaul (SDF + CSG)
export {
  sdSphere,
  sdBox,
  sdTorus,
  sdCylinder,
  sdCone,
  sdCapsule,
  sdGroundPlane,
  sdGround,
  createGroundSDF,
  DEFAULT_GROUND_CONFIG,
  sdMountainRidge,
  sdVoronoiRock,
  sdWarpedRock,
  createTerrainSDF,
  TERRAIN_MATERIALS,
  type SDFPrimitiveResult,
  type SDFEvaluator,
  type GroundAuxiliaryOutput,
  type GroundConfig,
} from './sdf/SDFPrimitives';

export {
  sdfUnion,
  sdfIntersection,
  sdfSubtraction,
  sdfReverseSubtraction,
  smoothUnion,
  smoothIntersection,
  smoothSubtraction,
  expSmoothUnion,
  domainWarp,
  createNoiseDomainWarp,
  combineSDFsSmoothUnion,
  combineSDFsSmoothSubtraction,
  combineSDFsSmoothIntersection,
  composeTerrainLayers,
  type TerrainLayer,
  type CombinedSDFResult,
} from './sdf/SDFCombinators';

export {
  CSGTerrainComposer,
  generateMountainMesh,
  generateCaveMesh,
  generateRockMesh,
  generateGroundMesh,
  createStandardTerrainElements,
  type CSGOperation,
  type TerrainElementDefinition,
  type CSGCompositionResult,
} from './CSGTerrainComposer';

export {
  AdaptiveMesher,
  stitchChunkBoundaries,
  DEFAULT_ADAPTIVE_MESHER_CONFIG,
  type AdaptiveMesherConfig,
  type TerrainChunk,
} from './mesher/AdaptiveMesher';
