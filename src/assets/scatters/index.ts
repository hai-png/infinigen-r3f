export { GrassScatterSystem } from './GrassScatterSystem';
export type { GrassScatterConfig } from './GrassScatterSystem';

export { InstanceScatterSystem } from './InstanceScatterSystem';
export type {
  ScatterConfig,
  ScatterMode,
  BiomeRule,
  ScatterResult
} from './InstanceScatterSystem';

export { RockScatterSystem } from './RockScatterSystem';
export type { RockScatterConfig, RockScatterStats } from './RockScatterSystem';

export { ScatterFactory } from './ScatterFactory';
export type { ScatterType, SurfaceSDF, SurfaceSelector, ScatterConfig as FactoryScatterConfig, ScatterResult as FactoryScatterResult } from './ScatterFactory';

export {
  FernScatter,
  MossScatter,
  GroundLeavesScatter,
  PineNeedleScatter,
  SeashellScatter,
  LichenScatter,
  PebbleScatter,
  SnowLayerScatter,
  SlimeMoldScatter,
  MolluskScatter,
  JellyfishScatter,
} from './NewScatterTypes';

export type {
  Season,
  BaseScatterConfig,
  ScatterGeneratorResult,
  ScatterGenerator,
  FernScatterConfig,
  MossScatterConfig,
  GroundLeavesScatterConfig,
  PineNeedleScatterConfig,
  SeashellScatterConfig,
  LichenScatterConfig,
  PebbleScatterConfig,
  SnowLayerScatterConfig,
  SlimeMoldScatterConfig,
  MolluskScatterConfig,
  JellyfishScatterConfig,
} from './NewScatterTypes';
