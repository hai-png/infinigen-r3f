/**
 * Placement Algorithms Module
 * 
 * Exports path finding, density-based placement,
 * instance scattering, and other spatial algorithms.
 */

export {
  PathFinder,
  Path,
  PathNode,
  BVHRayCaster
} from './path-finding.js';

export {
  DensityFunction,
  SimplexDensity,
  TagDensity,
  NormalFilter,
  ThresholdFilter,
  DensityParams
} from './density.js';

export {
  InstanceScatterer,
  MultiObjectScatterer,
  SpatialHashGrid,
  ScatteredInstance,
  ScatterConfig
} from './instance-scatter.js';
