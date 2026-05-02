/**
 * Deformed Tree Module — Public API
 *
 * Re-exports everything from DeformedTreeGenerator for convenient imports.
 * This file should be merged into the main trees/index.ts at a later date.
 */

export {
  // Main class & factory
  DeformedTreeGenerator,
  createDeformedTree,

  // Types
  type DeformedTreeVariant,
  type DeformedTreeConfig,
  type BarkRingParams,

  // Constants
  DEFORMED_TREE_VARIANTS,
} from './DeformedTreeGenerator';
