/**
 * Water System Module Exports
 *
 * Canonical exports default to V2 generators. V1 generators are
 * re-exported with deprecation notices for backward compatibility.
 */

// ── Canonical (V2) generators ──────────────────────────────────────────────
export { LakeGeneratorV2 } from './LakeGeneratorV2';
export type { LakeGeneratorConfig, LakeInfo } from './LakeGeneratorV2';

export { RiverNetworkV2 } from './RiverNetworkV2';
export type { RiverNetworkConfig, RiverPath, RiverSegment } from './RiverNetworkV2';

export { WaterBoundarySDF } from './WaterBoundarySDF';
export type { WaterBoundarySDFConfig, BoundarySDFResult } from './WaterBoundarySDF';

export { RiverFlowAccumulation, D8_DIRECTIONS, D8_DIST } from './RiverFlowAccumulation';
export type {
  FlowAccumulationResult,
  RiverSegment as FlowRiverSegment,
  RiverFlowConfig,
} from './RiverFlowAccumulation';

// ── Other water systems ────────────────────────────────────────────────────
export { WaterfallGenerator } from './WaterfallGenerator';
export { OceanSurface, OceanSystem } from './OceanSystem';
export { CausticsRenderer } from './CausticsRenderer';
export { FFTOceanSpectrum } from './FFTOceanSpectrum';
export { RiverMeshRenderer } from './RiverMeshRenderer';
export { LakeMeshRenderer } from './LakeMeshRenderer';
export { WaterfallMeshRenderer } from './WaterfallMeshRenderer';
export { UnderwaterEffects } from './UnderwaterEffects';
export { WaterSystemManager } from './WaterSystemManager';

// ── Re-export V1 generators for backward compatibility (deprecated) ────────

/**
 * @deprecated Use `LakeGeneratorV2` instead. Re-exported for backward compat.
 */
export { LakeGenerator } from './LakeGenerator';

/**
 * @deprecated Use `RiverNetworkV2` instead. Re-exported for backward compat.
 */
export { RiverNetwork } from './RiverNetwork';

// V1 type exports (still used by some consumers)
export type { 
  LakeConfig, 
  RiverConfig, 
  WaterfallConfig,
  RiverPoint,
  Waterfall,
  WaterfallTier,
  PlungePool
} from './LakeGenerator';

export type { FlowData } from './RiverNetwork';

export type { OceanConfig, GerstnerWave } from './OceanSystem';

export type { CausticsConfig } from './CausticsRenderer';

export type { FFTOceanConfig } from './FFTOceanSpectrum';

export type { RiverMeshConfig } from './RiverMeshRenderer';

export type { LakeMeshConfig, LakeDefinition } from './LakeMeshRenderer';

export type { WaterfallMeshConfig } from './WaterfallMeshRenderer';

export type { UnderwaterEffectsConfig } from './UnderwaterEffects';

export type { WaterSystemConfig } from './WaterSystemManager';
