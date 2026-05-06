/**
 * LandTiles Module — Tile-based terrain system with biome interpolation
 *
 * Provides tile-based terrain variety inspired by the original Infinigen
 * LandLab integration. Each tile carries its own heightmap, biome weights,
 * and process history, enabling deterministic, composable terrain generation.
 *
 * Main entry point: {@link LandTileSystem}
 */

export {
  LandTileSystem,
  LandTileGenerator,
  LandTileComposer,
  LandProcessManager,
} from './LandTileSystem';

export type {
  LandTile,
  BiomeHeightConfig,
  LandTileGeneratorConfig,
  LandTileComposerConfig,
  TileErosionParams,
  TileSnowfallParams,
  TileEruptionParams,
  LandTileSystemConfig,
} from './LandTileSystem';

// Special tile generators (FloatingIce, Volcano)
export {
  generateFloatingIceTile,
  generateVolcanoTile,
  sdFloatingIce,
  sdVolcano,
  ICE_TILE_MATERIALS,
  VOLCANO_TILE_MATERIALS,
} from './SpecialTiles';

export type {
  FloatingIceConfig,
  VolcanoConfig,
} from './SpecialTiles';

// Dedicated tile modules
export {
  generateFloatingIceTileMesh,
  generateFloatingIceLandTile,
} from './FloatingIceTile';

export type {
  FloatingIceTileConfig,
} from './FloatingIceTile';

export {
  generateVolcanoTileMesh,
  generateVolcanoLandTile,
} from './VolcanoTile';

export type {
  VolcanoTileConfig,
} from './VolcanoTile';
