/**
 * Tectonic Module Exports
 *
 * Comprehensive plate tectonics simulation system including:
 * - Dynamic plate simulation with Voronoi tessellation and geophysical forces
 * - Fault line generation with proper boundary-type classification
 * - Mountain building with orogenic process modeling
 *
 * All modules use seed-based randomness for reproducibility.
 */

// ============================================================================
// TectonicPlateSimulator
// ============================================================================

export { TectonicPlateSimulator } from './TectonicPlateSimulator';

export type {
  PlateConfig as TectonicPlateParams,
  TectonicPlate,
  PlateBoundary,
  BoundaryType,
  ConvergentSubType,
  DivergentSubType,
  VolcanicFeature,
  RiftFeature,
  TectonicSimulationResult,
} from './TectonicPlateSimulator';

// ============================================================================
// FaultLineGenerator
// ============================================================================

export { FaultLineGenerator } from './FaultLineGenerator';

export type {
  FaultLineParams,
  FaultSegmentType,
  FaultSegment,
  OffsetFeature,
  PressureRidge,
  SagPond,
  EnEchelonFractures,
  FaultLine,
} from './FaultLineGenerator';

// ============================================================================
// MountainBuilding
// ============================================================================

export { MountainBuilding } from './MountainBuilding';

export type {
  MountainBuildingParams,
  ThrustFault,
  FoldStructure,
  ForelandBasin,
  OrogenicBeltType,
  MountainRange,
} from './MountainBuilding';
