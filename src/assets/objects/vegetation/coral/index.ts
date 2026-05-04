/**
 * Coral Growth Algorithms Module
 *
 * Advanced procedural coral generation using differential growth,
 * reaction-diffusion, and Laplacian growth algorithms.
 *
 * @module objects/vegetation/coral
 */

// Core algorithm classes (original)
export {
  DifferentialGrowth,
  GrayScottReactionDiffusion,
  LaplacianGrowth,
  CoralGrowthGenerator,
} from './CoralGrowthAlgorithms';

// Convenience functions (original)
export {
  generateCoral,
  generateCoralPattern,
} from './CoralGrowthAlgorithms';

// Presets and constants (original)
export {
  GRAY_SCOTT_PRESETS,
} from './CoralGrowthAlgorithms';

// Types (original)
export type {
  DifferentialGrowthParams,
  LaplacianGrowthParams,
  CoralType,
  CoralGrowthGeneratorParams,
  ReactionDiffusionPreset,
  GrayScottParams,
} from './CoralGrowthAlgorithms';

// Reaction-Diffusion Coral (vertex-based, Gray-Scott on mesh surface)
export {
  ReactionDiffusionCoralGenerator,
  generateReactionDiffusionCoral,
  REACTION_DIFFUSION_CORAL_PRESETS,
  feed2kill,
} from './ReactionDiffusionCoral';

export type {
  ReactionDiffusionCoralPreset,
  ReactionDiffusionCoralParams,
} from './ReactionDiffusionCoral';

// Differential Growth Coral (polygon-based, vertex growth with repulsion)
export {
  DifferentialGrowthCoralGenerator,
  generateDifferentialGrowthCoral,
} from './DifferentialGrowthCoral';

export type {
  DifferentialGrowthCoralVariant,
  DifferentialGrowthCoralParams,
} from './DifferentialGrowthCoral';
