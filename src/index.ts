/**
 * Infinigen R3F - Procedural Generation Engine for React Three Fiber
 * 
 * A TypeScript port of the Infinigen procedural generation system,
 * adapted for use with React Three Fiber and the React ecosystem.
 * 
 * @packageDocumentation
 * 
 * Note: Several names exist in multiple sub-modules. Conflicts are resolved here:
 * - ScatterConfig: from ./core (placement) is primary; ./assets has InstanceScatterSystem.ScatterConfig
 * - LODConfig: from ./terrain is primary; canonical shared types (RenderingLODConfig, ExportLODConfig, TerrainLODConfigFields) live in ./assets/core/LODSystem
 * - BiomeType, TerrainConfig: from ./terrain is primary; ./datagen has its own versions
 * - ThreePointLightingConfig: from ./assets/lighting is primary; ./datagen has its own version
 * - ExportFormat: from ./tools is primary; ./datagen has its own version
 * - SolverState: from ./types is primary; ./core/constraints/solver has its own version
 * - BBox: from ./types is primary; ./core/util/math has its own class version
 * - Vector3: from three.js (via core) is primary; ./core/util/math has custom interface
 * - lerp: from core (number lerp) is primary; animation and math/vector have their own
 * - ZERO: from core/constraints (ScalarConstant) is primary; math/vector has Vector3 ZERO
 */

// Core Engine Systems (primary for: Node, Tag, VariableBinding, Expression, createIndoorLighting)
// createIndoorLighting from core/rendering takes precedence over the one from assets/objects/architectural
export * from './core';

// Asset Library (primary for: ThreePointLightingConfig)
// Note: ScatterConfig from ./assets/scatters conflicts with ./core/placement
// The assets/procedural module now aliases it as AssetScatterConfig
// Note: createIndoorLighting from architectural conflicts with core/rendering — we handle it here
export * from './assets/procedural/index';
export * from './assets/materials/index';
export * from './assets/shaders/index';
export {
  SkyLightingSystem,
  type SkyLightingSystemConfig,
  ThreePointLightingSystem,
  type ThreePointLightingConfig,
} from './assets/lighting/index';

// Terrain Generation (primary for: BiomeType, TerrainConfig, LODConfig)
export * from './terrain';

// Simulation System
export * from './sim';

// Data Generation - export selectively to avoid conflicts with core, assets, terrain, tools
export {
  // Types from pipeline/types - exclude conflicting names
  type JobStatus,
  type JobPriority,
  type JobConfig,
  type JobProgress,
  type JobError,
  type JobResult as PipelineJobResult,
  type JobMetadata as PipelineJobMetadata,
  type SceneGenerationConfig,
  type TerrainFeatureConfig,
  type ObjectGenerationConfig,
  type CreatureConfig,
  type CreatureType,
  type PlantConfig,
  type PlantType,
  type StructureConfig,
  type StructureType,
  type PropConfig,
  type PropType,
  type LightingConfig,
  type LightingType,
  type VolumetricConfig,
  type CameraConfig,
  type CameraType,
  type OrbitConfig,
  type CameraPathConfig,
  type EnvironmentConfig,
  type WeatherType,
  type GroundCoverConfig,
  type ClimbingPlantConfig,
  type SurfaceType,
  type UnderwaterScatterConfig,
  type OutputConfig,
  type OutputFormat as PipelineOutputFormat,
  type GroundTruthConfig,
  type GeneratedAsset,
  type AssetType,
  type AssetMetadata as PipelineAssetMetadata,
  type RenderConfig as PipelineRenderConfig,
  type RenderEngine,
  type ToneMappingType,
  type PipelineMetrics,
  type ResourceUtilization,
  type PipelineHealth,
  type HealthIssue,
  type CloudProvider,
  type CloudProviderName,
  type CloudCredentials,
  type CloudStorageConfig,
  type StorageACL,
  type CloudComputeConfig,
  type BatchJob as PipelineBatchJob,
  type CloudIntegrationConfig,
  type NotificationConfig,
  type SlackConfig,
  type WebhookConfig,
  type BatchStatus,
  type BatchProgress as PipelineBatchProgress,
  type PipelineEvent,
  type JobCreatedEvent,
  type JobStartedEvent,
  type JobProgressEvent,
  type JobCompletedEvent,
  type JobFailedEvent,
  type BatchStartedEvent,
  type BatchCompletedEvent,
  type PipelineHealthEvent,
  type PaginationParams,
  type PaginatedResult,
  type QueryParams,
  // ScatterConfig from datagen conflicts with core/placement — alias it
  type ScatterConfig as PipelineScatterConfig,
  // These conflict with terrain module — alias them
  type TerrainConfig as PipelineTerrainConfig,
  type BiomeType as PipelineBiomeType,
  // This conflicts with assets/lighting — alias it
  type ThreePointLightingConfig as PipelineThreePointLightingConfig,
} from './datagen';

// Also export the non-type items from datagen/pipeline
export {
  JobManager,
  type JobManagerOptions,
  BatchProcessor,
  type BatchProcessorOptions,
  GroundTruthGenerator,
  type GroundTruthOptions,
  type GroundTruthResult,
  ConfigParser,
  type SceneConfig,
  TaskRegistry,
  taskRegistry,
  type TaskFunction,
  type TaskResult,
  type TaskConfig,
  type TaskMetadata,
  type TaskParamType,
  renderTask,
  renderTaskMetadata,
  registerRenderTask,
  executeRender,
  type RenderConfig,
  saveMeshesTask,
  saveMeshesTaskMetadata,
  registerSaveMeshesTask,
  executeSaveMeshes,
  isStaticObject,
  triangulateGeometry,
  triangulateScene,
  getMeshStats,
  type MeshExportConfig,
  type ExportFormat as MeshExportFormat,
  type MeshExportInfo,
} from './datagen';

// Utility Tools (primary for: ExportFormat)
export {
  ExportToolkit,
  createExportToolkit,
  type ExportOptions,
  type ExportResult,
  type ExportTransform,
  type LODSettings,
  type TextureExportSettings,
  TOOLS_VERSION,
} from './tools';

// Re-export ExportFormat from tools as the primary one
// Also export the consolidated pipeline-specific types (LODConfig, TexturePackResult)
export type { ExportFormat, SceneExportFormat, LODConfig, TexturePackResult } from './tools';

// GPL Module (placeholder)
export * from './infinigen_gpl';

// R3F-Specific Modules
export * from './ui';
export * from './editor';
export * from './integration';

// Re-exported from consolidated locations
export {
  AnimationEngine, getGlobalEngine, resetGlobalEngine,
  Timeline, AnimationTrack, Easings, getEasing, animationLerp,
  OscillatoryMotion, PatternGenerator, evaluateWave, createPresetMotion, createPresetPattern,
  PathFollower, generateCameraPath,
  WindAnimationSystem, WindZone,
  InverseKinematics, CCDIKSolver, FABRIKSolver, createArmChain, createLegChain, createSnakeChain,
  GaitGenerator, createPresetGait,
  AnimationPolicyEngine, EasingFunctions, DefaultPolicies,
} from './assets/animation';
export type {
  AnimationEventType, AnimationEvent, TimeConfig, AnimationEngineConfig, Updatable,
  EasingType, EasingFunction, Keyframe, TrackConfig, InterpolationType,
  WaveType, OscillatoryConfig, PatternType, PatternConfig,
  SplineType, OrientationMode, SplineKeyframe, PathFollowingConfig, PathSample,
  WindLayer, WindParams, AnimationConfig,
  JointConfig, IKSolverType, IKChainConfig, JointState,
  GaitType, LegConfig, GaitConfig, LegState,
  AnimationClip, AnimationCategory, Trajectory,
  AnimationPolicy, TrajectoryConstraint,
  ConstraintType as AnimationConstraintType,
  PolicyWeights, TrajectoryScore, AnimatedScene, AnimatedObject,
  QualityMetrics, AnimationContext, TrajectoryOptions,
} from './assets/animation';
export * from './assets/particles';
export * from './assets/utils/streaming';
export * from './core/constraints/tags';
// core/util/math is already exported via core → util → math
// No need to re-export separately to avoid duplicate conflicts

// Rendering IO
export * from './core/rendering/io';
// Optimization - exclude GPUComputeConfig (conflicts with terrain/gpu)
export {
  GPUComputeManager,
  FrameBudgetManager,
  ShaderVariantCache,
  WorkerPool,
  MemoryProfiler,
  DrawCallOptimizer,
  isGPUAvailable,
  type ComputeJob,
  type ComputeJobResult,
  type GPUComputeCapabilities,
  type QualityPreset,
  type FrameBudgetConfig,
  type ShaderVariantKey,
  type WorkerPoolConfig,
  type MemoryStats,
} from './core/util/optimization';
// LOD — canonical types from assets/core/LODSystem
// The rendering-pipeline types (RenderingLODConfig, LODLevel, etc.) were
// previously imported from ./core/rendering/lod which now re-exports from
// the canonical location for backward compatibility.
export {
  // Classes
  LODManager,
  InstancedLODManager,

  // Constants
  DEFAULT_LOD_CONFIG,

  // Functions
  generateLODLevels,
  selectLODByDistance,
  selectLODByScreenSpace,
  updateLODWithHysteresis,
  calculateMemorySavings,
  estimateRenderingImprovement,

  // Rendering types
  type RenderingLODConfig,
  type RenderingLODLevel,
  type LODLevel,
  type LODMesh,
  type LODObject,
  type InstancedLODConfig,

  // Export-pipeline type
  type ExportLODConfig,

  // Terrain LOD type
  type TerrainLODConfigFields,
} from './core/rendering/lod';

// Shaders
export * from './core/rendering/shaders';

// Integration bridge
export * from './integration/bridge';

// Types (primary for: SolverState, BBox, MeshData, etc.)
export type {
  MeshData,
  PhysicsConfig,
  RayHit,
  BBox,
  Pose,
  EvalContext,
  Proposal,
  ConstraintOperator,
  // SolverState, SceneObject, DomainType, ConstraintType are already exported via ./core, ./editor, ./assets/animation
} from './types';
