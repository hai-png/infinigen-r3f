/**
 * Monocots Module — Phyllotaxis-based monocot growth system
 *
 * @module objects/vegetation/monocots
 */

export {
  MonocotGrowthFactory,
  generateMonocot,
} from './MonocotGrowth';

export type {
  MonocotGrowthParams,
  MonocotResult,
} from './MonocotGrowth';

export {
  KelpGenerator,
  generateKelp,
  type KelpConfig,
  type KelpSpecies,
} from './KelpGenerator';

export {
  PineconeGenerator,
  generatePinecone,
  type PineconeConfig,
  type PineconeSpecies,
  type PineconeState,
} from './PineconeGenerator';
