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
