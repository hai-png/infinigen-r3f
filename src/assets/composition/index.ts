/**
 * Composition System Module for Infinigen R3F Port
 *
 * Provides automated scene composition through rules, constraints, and templates.
 */

// Core engine
export {
  CompositionEngine,
  compositionEngine,
  SpatialRelation,
  AestheticPrinciple,
} from './CompositionEngine';

// Types
export type {
  CompositionRule,
  CompositionConstraint,
  CompositionTemplate,
  TemplateObject,
  TemplateVariable,
  CompositionContext,
  CompositionResult,
  CompositionMetrics,
} from './CompositionEngine';

// Basic rules
export {
  basicRules,
  centerObjectRule,
  alignObjectsRule,
  gridDistributionRule,
  radialArrangementRule,
  separationRule,
  symmetryRule,
} from './rules/BasicRules';

// Interior templates
export {
  interiorTemplates,
  livingRoomTemplate,
  bedroomTemplate,
  kitchenTemplate,
  officeTemplate,
} from './templates/InteriorTemplates';

// Nature scene composer
export {
  NatureSceneComposer,
} from './NatureSceneComposer';

export type {
  Season,
  WeatherType,
  CreatureType,
  TerrainParams,
  VegetationDensityParams,
  CloudParams,
  CameraParams,
  LightingParams,
  CreatureParams,
  WaterParams,
  WindParams,
  WeatherParticleParams,
  NatureSceneConfig,
  NatureSceneResult,
  BoulderData,
  GroundCoverData,
  ScatterMaskData,
  RiverData,
} from './NatureSceneComposer';

// Placement mask system
export {
  PlacementMaskSystem,
} from './PlacementMaskSystem';

export type {
  MaskMode,
  MaskCombinOp,
  TerrainTag,
  NoiseMaskParams,
  NormalMaskParams,
  AltitudeMaskParams,
  SlopeMaskParams,
  TagMaskParams,
  DistanceFromFeatureParams,
  MaskParams,
  PlacementMask,
  TerrainDataInput,
} from './PlacementMaskSystem';

// Visibility culler
export {
  VisibilityCuller,
  createCullableObject,
} from './VisibilityCuller';

export type {
  CullReason,
  CullableObject,
  CullingConfig,
  CullingResult,
  CullingStats,
  LODLevel,
} from './VisibilityCuller';

// Indoor scene composer
export {
  IndoorSceneComposer,
} from './IndoorSceneComposer';

export type {
  RoomType,
  SurfaceType,
  IndoorTimeOfDay,
  IndoorObject,
  SurfaceMaterial,
  DoorPlacement,
  WindowPlacement,
  RoomSpec,
  ConstraintRelation,
  IndoorDimensions,
  FurnitureSpec,
  IndoorLightingParams,
  RoomGeometry,
  IndoorCameraParams,
  IndoorSceneConfig,
  IndoorSceneResult,
} from './IndoorSceneComposer';

// Scene object factory
export {
  SceneObjectFactory,
  composeAndCreateNatureScene,
} from './SceneObjectFactory';

export type {
  NatureSceneObjects,
  IndoorSceneObjects,
  SceneFactoryResult,
  LightingObjectConfig,
  CameraObjectConfig,
} from './SceneObjectFactory';

// Scene presets
export {
  ALPINE_MEADOW,
  TROPICAL_BEACH,
  DENSE_FOREST,
  DESERT_CANYON,
  ARCTIC_TUNDRA,
  CORAL_REEF,
  LIVING_ROOM_PRESET,
  CAVE_PRESET,
  ALL_PRESETS,
  PRESET_MAP,
  getPreset,
  getPresetsByCategory,
  getPresetIds,
  // Re-exports from ExpandedScenePresets
  ALL_EXPANDED_PRESETS,
  EXPANDED_PRESET_MAP,
  getExpandedPreset,
  getExpandedPresetsByCategory,
  getExpandedPresetIds,
  getNatureConfigForPreset,
  getRoomTypeForPreset,
} from './ScenePresets';

export type {
  PresetCategory,
  ScenePreset,
  ExtendedPresetCategory,
} from './ScenePresets';

// Expanded scene presets
export {
  CANYON,
  CLIFF,
  COAST,
  KELP_FOREST,
  MOUNTAIN,
  PLAIN,
  RIVER,
  SNOWY_MOUNTAIN,
  UNDERWATER,
  BEDROOM_PRESET,
  KITCHEN_PRESET,
  BATHROOM_PRESET,
  OFFICE_PRESET,
  DINING_ROOM_PRESET,
  LIVING_ROOM_ENHANCED,
  STUDIO_PRESET,
  GARAGE_PRESET,
  LIBRARY_PRESET,
  ATTIC_PRESET,
  BASEMENT_PRESET,
  WAREHOUSE_PRESET,
  STEREO_TRAINING,
  MULTIVIEW_STEREO,
  NOISY_VIDEO,
  ASSET_DEMO,
  BENCHMARK,
  EXPANDED_NATURE_PRESETS,
  EXPANDED_INDOOR_PRESETS,
  EXPANDED_PERFORMANCE_PRESETS,
} from './ExpandedScenePresets';
