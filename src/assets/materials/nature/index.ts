/**
 * Nature Materials Module
 * 
 * Procedural material generators for natural elements including:
 * - Flowers (petals, centers, dewdrops)
 * - Lava (animated flow, glow, crust)
 * - Slime (translucent, iridescent, viscous)
 * - Stone Tiles (weathered, cracked, mossy)
 * - Mosaics (decorative patterns)
 * - Grass Blade (multi-palette grass blade material with 25+ color stops)
 */

export { FlowerMaterial, type FlowerMaterialConfig } from './FlowerMaterial';
export { LavaMaterial, type LavaMaterialConfig } from './LavaMaterial';
export { SlimeMaterial, type SlimeMaterialConfig } from './SlimeMaterial';
export { StoneTileMaterial, type StoneTileMaterialConfig } from './StoneTileMaterial';
export { MosaicMaterial, type MosaicMaterialConfig } from './MosaicMaterial';
export {
  GrassBladeMaterial,
  createGrassBladeMaterial,
  getGrassPalette,
  getAvailableGrassPalettes,
  seasonToPalette,
  blendPalettes,
  SPRING_GREEN_PALETTE,
  SUMMER_GREEN_PALETTE,
  AUTUMN_GOLDEN_PALETTE,
  DRY_BROWN_PALETTE,
  TROPICAL_PALETTE,
  ALPINE_PALETTE,
  COASTAL_PALETTE,
  MARSH_PALETTE,
  GRASS_PALETTES,
  type GrassPalette,
  type ColorStop,
  type GrassBladeMaterialConfig,
} from './GrassBladeMaterial';
