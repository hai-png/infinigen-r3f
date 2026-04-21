/**
 * Infinigen R3F Port - Phase 3: Scatter Systems
 * Module Exports
 */

export {
  GroundCoverScatter,
  type GroundCoverType,
  type GroundCoverConfig,
  type GroundCoverInstance,
} from './GroundCoverScatter';

export {
  ClimbingPlantGenerator,
  type ClimbingPlantType,
  type ClimbingPlantConfig,
  type ClimbingSegment,
  type ClimbingPlantInstance,
} from './ClimbingPlantGenerator';

export {
  UnderwaterScatterGenerator,
  type UnderwaterScatterParams,
  type ScatterInstance,
} from './UnderwaterScatterGenerator';

export {
  DecorativePlantsScatter,
  type DecorativePlantsParams,
  type PlantInstance,
} from './DecorativePlantsScatter';

export {
  MushroomScatterGenerator,
  type MushroomScatterParams,
  type MushroomInstance,
} from './MushroomScatterGenerator';

export {
  MossScatterGenerator,
  type MossScatterParams,
  type MossInstance,
} from './MossScatterGenerator';

export {
  FernScatterGenerator,
  type FernScatterParams,
  type FernInstance,
} from './FernScatterGenerator';

export default {
  GroundCoverScatter,
  ClimbingPlantGenerator,
  UnderwaterScatterGenerator,
  DecorativePlantsScatter,
  MushroomScatterGenerator,
  MossScatterGenerator,
  FernScatterGenerator,
};
