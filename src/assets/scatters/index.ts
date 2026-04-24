/**
 * Scatter Module
 * Provides instance scattering systems for vegetation, debris, and environmental elements
 */

export * from './types';
export * from './utils/wind';
export { InstanceScatterSystem } from './InstanceScatterSystem';
export type {
  ScatterInstance,
  ScatterObject,
  ScatterRules,
  ScatterConfig,
  ScatterResult,
  Biome
} from './InstanceScatterSystem';

// Scatter registry for easy access
import { FlowerScatter } from './types/FlowerScatter';
import { GroundDebrisScatter } from './types/GroundDebrisScatter';
import { PebblesScatter } from './types/PebblesScatter';
import { GroundTwigsScatter } from './types/GroundTwigsScatter';
import { GrassScatter } from './types/GrassScatter';
import { FernScatter } from './types/FernScatter';
import { MushroomScatter } from './types/MushroomScatter';
import { MossScatter } from './types/MossScatter';
import { LichenScatter } from './types/LichenScatter';
import { WaterSurfaceScatter } from './types/WaterSurfaceScatter';
import { RockScatter } from './types/RockScatter';
import { BushScatter } from './types/BushScatter';
import { TreeScatter } from './types/TreeScatter';
import { IvyScatter } from './types/IvyScatter';
import { SnowLayerScatter } from './types/SnowLayerScatter';
import { SlimeMoldScatter } from './types/SlimeMoldScatter';
import { PineNeedleScatter } from './types/PineNeedleScatter';
import { PineconeScatter } from './types/PineconeScatter';
import { MonocotsScatter } from './types/MonocotsScatter';
import { JellyfishScatter } from './types/JellyfishScatter';
import { UrchinScatter } from './types/UrchinScatter';
import { SeaweedScatter } from './types/SeaweedScatter';
import { CoralReefScatter } from './types/CoralReefScatter';
import { MolluskScatter } from './types/MolluskScatter';
import { SeashellsScatter } from './types/SeashellsScatter';
import { ChoppedTreesScatter } from './types/ChoppedTreesScatter';

export const ScatterRegistry = {
  flower: FlowerScatter,
  groundDebris: GroundDebrisScatter,
  pebbles: PebblesScatter,
  groundTwigs: GroundTwigsScatter,
  grass: GrassScatter,
  fern: FernScatter,
  mushroom: MushroomScatter,
  moss: MossScatter,
  lichen: LichenScatter,
  waterSurface: WaterSurfaceScatter,
  rock: RockScatter,
  bush: BushScatter,
  tree: TreeScatter,
  ivy: IvyScatter,
  snowLayer: SnowLayerScatter,
  slimeMold: SlimeMoldScatter,
  pineNeedle: PineNeedleScatter,
  pinecone: PineconeScatter,
  monocots: MonocotsScatter,
  jellyfish: JellyfishScatter,
  urchin: UrchinScatter,
  seaweed: SeaweedScatter,
  coralReef: CoralReefScatter,
  mollusk: MolluskScatter,
  seashells: SeashellsScatter,
  choppedTrees: ChoppedTreesScatter,
};

export type ScatterType = keyof typeof ScatterRegistry;

/**
 * Factory function to create scatter instances by type
 */
export function createScatter(type: ScatterType, params?: any) {
  const ScatterClass = ScatterRegistry[type];
  if (!ScatterClass) {
    throw new Error(`Unknown scatter type: ${type}`);
  }
  return new ScatterClass(params);
}

export default ScatterRegistry;
