/**
 * Coral Generators Module
 *
 * Standalone coral generators at /objects/coral/ providing class-based
 * generators for branching, fan, and brain coral types.
 *
 * Complements the existing generators at /vegetation/coral/ which
 * focus on growth algorithms (differential growth, reaction-diffusion).
 *
 * @module objects/coral
 */

// Branching Coral — recursive CylinderGeometry with noise-displaced endpoints
export {
  BranchingCoralGenerator,
  generateBranchingCoral,
  type BranchingCoralConfig,
} from './BranchingCoralGenerator';

// Fan Coral — flat fan-shaped mesh with radial vein pattern
export {
  FanCoralGenerator,
  generateFanCoral,
  type FanCoralConfig,
} from './FanCoralGenerator';

// Brain Coral — SphereGeometry with reaction-diffusion displacement
export {
  BrainCoralGenerator,
  generateBrainCoral,
  type BrainCoralConfig,
} from './BrainCoralGenerator';
