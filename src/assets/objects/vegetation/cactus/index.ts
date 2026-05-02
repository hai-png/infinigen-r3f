/**
 * Cactus generator module
 *
 * Re-exports all public types and the factory function for
 * procedural cactus generation.
 */

export {
  CactusGenerator,
  createCactus,
  CACTUS_VARIANTS,
  CACTUS_VARIANT_CONFIGS,
} from './CactusGenerator';

export type {
  CactusVariant,
  CactusVariantConfig,
  CactusGeneratorOptions,
} from './CactusGenerator';
