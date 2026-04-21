/**
 * Infinigen R3F Port - Terrain Features Index
 * Exports all advanced terrain feature generators
 */

export { CaveGenerator } from './CaveGenerator';
export { ErosionSystem } from './ErosionSystem';
export { OceanSystem } from './OceanSystem';
export { TiledTerrainGenerator, LandTileType, type TiledTerrainConfig, type TerrainChunk } from './LandTilesGenerator';
export { InvertedTerrainGenerator, UpsidedownMountains, type InvertedTerrainConfig } from './InvertedTerrainGenerator';
export { VoronoiRocksGenerator, type VoronoiRocksParams } from './VoronoiRocksGenerator';
export { WarpedRocksGenerator, type WarpedRocksParams } from './WarpedRocksGenerator';
export { UpsidedownMountainsGenerator, type UpsidedownMountainsParams, type MountainAsset } from './UpsidedownMountainsGenerator';

// Future exports (to be implemented):
// export { MountainEnhancement } from './MountainEnhancement';

export default {
  CaveGenerator,
  ErosionSystem,
  OceanSystem,
  TiledTerrainGenerator,
  InvertedTerrainGenerator,
  VoronoiRocksGenerator,
  WarpedRocksGenerator,
  UpsidedownMountainsGenerator,
};
