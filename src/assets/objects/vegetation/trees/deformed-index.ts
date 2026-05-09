/**
 * Deformed Tree Module — Public API
 *
 * Re-exports everything from DeformedTreeGenerator for convenient imports.
 * Also exports the individual deformed tree type generators:
 * - HollowTreeGenerator — Hollow tree with inner/outer cylinder and knot holes
 * - RottenTreeGenerator — Partially decomposed tree with missing bark and fungal growths
 * - TruncatedTreeGenerator — Tree cut at a random height with ring-pattern cut surface
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

// ── Individual Deformed Tree Type Generators ────────────────────────────────
export {
  HollowTreeGenerator,
  createHollowTree,
  DEFAULT_HOLLOW_TREE_CONFIG,
  type HollowTreeConfig,
} from './HollowTreeGenerator';

export {
  RottenTreeGenerator,
  createRottenTree,
  DEFAULT_ROTTEN_TREE_CONFIG,
  type RottenTreeConfig,
} from './RottenTreeGenerator';

export {
  TruncatedTreeGenerator,
  createTruncatedTree,
  DEFAULT_TRUNCATED_TREE_CONFIG,
  type TruncatedTreeConfig,
} from './TruncatedTreeGenerator';
