/**
 * Placement Module - Object Placement and Scattering System
 * Based on Infinigen's placement system
 */

import { ScatterSystem } from './advanced/ScatterSystem';
import { AssetFactory } from './utils/AssetFactory';

// Density-based placement (two-phase scatter → populate pipeline)
export {
  DensityPlacementSystem,
  PlacementMask,
  NoiseFilter,
  AltitudeFilter,
  SlopeFilter,
  TagFilter,
  BiomeFilter,
  DistanceFilter,
} from './DensityPlacementSystem';

export type { PlacementFilter, PlaceholderInstance, TerrainData } from './DensityPlacementSystem';

// Camera pose search engine (re-exported from DensityPlacementSystem for backward compat)
export {
  CameraPoseSearchEngine,
} from './DensityPlacementSystem';

export type {
  CameraConstraint,
  CameraPoseResult,
} from './DensityPlacementSystem';

// Scatter registry (strategy pattern for scatter algorithms)
export {
  ScatterRegistry,
  PoissonDiskStrategy,
  GridJitterStrategy,
  DensityMaskStrategy,
  VolumeScatterStrategy,
  TaperScatterStrategy,
  GPUScatterStrategy,
} from './ScatterRegistry';

export type {
  ScatterOutput,
  ScatterConfigBase,
  ScatterStrategyConfig,
  ScatterStrategy,
  PoissonDiskConfig,
  GridJitterConfig,
  DensityMaskConfig,
  VolumeConfig,
  TaperConfig,
  GPUScatterConfig,
} from './ScatterRegistry';

// Camera subsystem
export * from './camera/index';

// Advanced placement and scattering
export { ScatterSystem } from './advanced/ScatterSystem';
export type { ScatterConfig, ScatteredInstance } from './advanced/ScatterSystem';

// Asset factory for procedural generation
export { AssetFactory } from './utils/AssetFactory';
export type {
  AssetFactoryOptions,
  AssetDescription
} from './utils/AssetFactory';

// Domain types
export type { ConstraintGraph, Node as PlacementNode, Edge } from './domain/types';

export default {
  ScatterSystem,
  AssetFactory,
};
