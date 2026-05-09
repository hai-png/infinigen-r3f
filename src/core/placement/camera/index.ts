/**
 * Camera System Module
 * 
 * Exports camera placement, cinematography, and trajectory components.
 */

// Core camera system
export {
  // Types
  type CameraType,
  type ShotSize,
  type CameraAngle,
  type CameraMovement,
  type CameraProperties as CameraPropertiesType,
  type CompositionRule,
  type CameraPlacementConfig,
  type TrajectoryKeyframe,
  type TrajectoryConfig as TrajectoryConfigType,
  
  // Constants
  DEFAULT_CAMERA_PROPERTIES,
  SHOT_SIZE_DISTANCES,
  CAMERA_ANGLE_ELEVATIONS,
  
  // Functions
  calculateOptimalPosition,
  generateTrajectoryKeyframes,
  
  // Constraints
  Frames,
  HasLineOfSight,
  MaintainsShotSize,
  HasCameraAngle,
  AvoidsObstruction,
  FollowsSubject,
} from './CameraSystem';

// Camera pose proposer (Phase 4.1)
export {
  CameraPoseProposer,
  type CameraPoseProposerConfig,
  type CameraPose,
  type PoseScoreBreakdown,
  DEFAULT_POSE_PROPOSER_CONFIG,
} from './CameraPoseProposer';

// Camera parameter exporter (Phase 4.1)
export {
  CameraParameterExporter,
  type CameraIntrinsics,
  type CameraExtrinsics,
  type PerFrameCameraParams,
  type StereoBaselineConfig,
  type CameraExportOptions,
} from './CameraParameterExporter';

// Depth of field (Phase 4.1)
export {
  DepthOfField,
  type DepthOfFieldConfig,
  type DepthOfFieldResult,
  type BokehShape,
  DEFAULT_DOF_CONFIG,
} from './DepthOfField';

// Camera types (physical camera)
export {
  CameraType as PhysicalCameraType,
  type BaseCameraConfig,
  type PerspectiveCameraConfig,
  type OrthographicCameraConfig,
  type StereoCameraConfig,
  type PanoramicCameraConfig,
  type FisheyeCameraConfig,
  type CameraConfig,
  type TypedCamera,
  createCamera,
  createPerspectiveCamera,
  createOrthographicCamera,
  createStereoCamera,
  createPanoramicCamera,
  createFisheyeCamera,
  getCameraFOV,
  isPerspective,
  isOrthographic,
  cloneCamera,
  lookAt,
  setPosition,
} from './CameraTypes';

// Camera properties (physical)
export {
  FilmFormat,
  SENSOR_DIMENSIONS,
  type CameraProperties,
  DEFAULT_CAMERA_PROPERTIES as DEFAULT_PHYSICAL_CAMERA_PROPERTIES,
  calculateDepthOfField,
  calculateHorizontalFOV,
  calculateVerticalFOV,
  getSensorDimensions,
  calculateEquivalentFocalLength,
  calculateExposureValue,
  applyCameraProperties,
  CAMERA_PRESETS as PLACEMENT_CAMERA_PRESETS,
} from './CameraProperties';

// Camera pose search engine (extracted from DensityPlacementSystem)
export {
  CameraPoseSearchEngine,
  type CameraConstraint,
  type CameraPoseResult,
  type TagCoverageConstraint,
  type CameraSearchConfig,
} from './CameraPoseSearchEngine';

// Camera orchestrator — unified camera placement and composition (System A Phase B)
export {
  CameraOrchestrator,
  type CameraOrchestratorConfig,
  type CameraOrchestratorResult,
  type TrajectoryValidationResult,
} from './CameraOrchestrator';

// Camera registry — strategy pattern for trajectory types (System A Phase B)
export {
  CameraRegistry,
  type TrajectoryGenerator,
  type TerrainHeightSampler,
  DollyTrajectory,
  CraneTrajectory,
  OrbitTrajectory,
  HandheldTrajectory,
  TrackingTrajectory,
  PanTiltTrajectory,
  AltitudeWalkTrajectory,
} from './CameraRegistry';

// Camera rig system — stereo and multiview camera hierarchies
export {
  CameraRig as PlacementCameraRig,
  type ChildCameraDescriptor,
  type StereoRigConfig,
  type MultiviewRigConfig,
  type CameraRigResult,
  DEFAULT_STEREO_RIG_CONFIG,
  DEFAULT_MULTIVIEW_RIG_CONFIG,
} from './CameraRig';

// Trajectories (consolidated implementations)
export {
  OrbitShot,
  PanTilt,
  DollyShot as DollyShotImpl,
  TrackingShot,
  CraneShot as CraneShotImpl,
  HandheldSim,
  GoToProposals,
  createTrajectory,
  type TrajectoryTypeName,
  type TrajectoryBaseConfig,
  type CameraKeyframe,
  type OrbitShotConfig,
  type PanTiltConfig,
  type DollyConfig,
  type TrackingConfig,
  type CraneConfig,
  type HandheldConfig,
  type GoToProposalsConfig,
} from './trajectories/TrajectoryImplementations';
