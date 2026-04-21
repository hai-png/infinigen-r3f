/**
 * Scatter Module
 * 
 * Comprehensive scatter system for distributing vegetation, debris, and environmental elements
 * across terrain surfaces. Includes both core infrastructure and specialized generators.
 * 
 * @module scatter
 */

// Core scatter infrastructure (from terrain)
export {
  ScatterGenerator,
  ScatterOptions,
  ScatterInstance,
} from '../terrain/scatter/ScatterGenerator';

export {
  GroundCoverScatter,
} from '../terrain/scatter/GroundCoverScatter';

export {
  FernScatterGenerator,
} from '../terrain/scatter/FernScatterGenerator';

export {
  MossScatterGenerator,
} from '../terrain/scatter/MossScatterGenerator';

export {
  MushroomScatterGenerator,
} from '../terrain/scatter/MushroomScatterGenerator';

export {
  ClimbingPlantGenerator,
} from '../terrain/scatter/ClimbingPlantGenerator';

export {
  DecorativePlantsScatter,
} from '../terrain/scatter/DecorativePlantsScatter';

export {
  UnderwaterScatterGenerator,
} from '../terrain/scatter/UnderwaterScatterGenerator';

// Additional scatter types
export {
  GroundDebrisScatter,
  FlowerScatter,
} from './types';

export type {
  GroundDebrisOptions,
  FlowerScatterOptions,
} from './types';
