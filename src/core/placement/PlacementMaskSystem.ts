/**
 * Placement Mask System — Re-export from composition module
 *
 * The PlacementMaskSystem has been moved to the placement module as it is
 * a core placement concern. The original implementation lives in
 * assets/composition/PlacementMaskSystem.ts for backward compatibility.
 *
 * Re-exports the PlacementMaskSystem class and all associated types
 * so that consumers can import from the placement module directly.
 *
 * Note: Some types are prefixed with "Mask" to avoid conflicts with
 * similarly-named types in the assets/materials module (e.g.
 * AltitudeMaskParams, SlopeMaskParams, NoiseMaskParams which also
 * exist in MaterialBlendingSystem).
 *
 * @module placement
 */

export {
  PlacementMaskSystem,
} from '../../assets/composition/PlacementMaskSystem';

export type {
  MaskMode,
  MaskCombinOp,
  TerrainTag,
  NoiseMaskParams as MaskNoiseParams,
  NormalMaskParams as MaskNormalParams,
  AltitudeMaskParams as MaskAltitudeParams,
  SlopeMaskParams as MaskSlopeParams,
  TagMaskParams as MaskTagParams,
  DistanceFromFeatureParams as MaskDistanceParams,
  MaskParams as MaskParamsBase,
  PlacementMask as MaskPlacementMask,
  TerrainDataInput as MaskTerrainDataInput,
} from '../../assets/composition/PlacementMaskSystem';
