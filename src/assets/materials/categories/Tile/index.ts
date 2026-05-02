/**
 * Tile Materials Module Index
 * 
 * Procedural tile materials including ceramic tiles,
 * stone tiles, mosaics, and patterned surfaces.
 * 
 * @module materials/categories/tile
 */

export { CeramicTileMaterial } from './CeramicTileMaterial';
export type { CeramicTileMaterialConfig as CeramicTileParams, CeramicTileMaterialConfig as CeramicTilePreset } from './CeramicTileMaterial';

export { TileGenerator } from './TileGenerator';
export type { TileParams } from './TileGenerator';

// Tile Pattern Library — 9 procedural tile patterns
export {
  generateBasketWeave,
  generateBrick,
  generateChevron,
  generateDiamond,
  generateHerringbone,
  generateHexagon,
  generateShell,
  generateSpanishBound,
  generateStar,
  generateTriangle,
  createTileMaterial,
  createTileMaterialFromPreset,
  BASKETWEAVE_PRESETS,
  BRICK_PRESETS,
  CHEVRON_PRESETS,
  DIAMOND_PRESETS,
  HERRINGBONE_PRESETS,
  HEXAGON_PRESETS,
  SHELL_PRESETS,
  SPANISHBOUND_PRESETS,
  STAR_PRESETS,
  TRIANGLE_PRESETS,
  ALL_TILE_PRESETS,
} from './TilePatternLibrary';

export type {
  TilePatternOptions,
  TilePatternPreset,
  TilePatternType,
} from './TilePatternLibrary';
