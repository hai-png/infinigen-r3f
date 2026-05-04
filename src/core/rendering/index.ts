/**
 * Rendering Module Index for Infinigen R3F
 *
 * Central export point for all rendering-related functionality.
 *
 * @module rendering
 */

export { ShaderCompiler, type ShaderVariant, type ShaderCompilationResult, PREDEFINED_VARIANTS } from './shader-compiler';
export * from './postprocessing';
export * as io from './io';
export * as shaders from './shaders';

// Screen-space post-processing passes
export { SSGIPass, type SSGIConfig } from './postprocess/SSGIPass';
export { SSAOPass, type SSAOConfig } from './postprocess/SSAOPass';
export { OpticalFlowPass, type OpticalFlowConfig } from './postprocess/OpticalFlowPass';

// Volumetric rendering
export { VolumetricPass, type VolumetricFogParams, type VolumetricSmokeParams, type VolumetricAtmosphereParams, type VolumetricPassConfig } from './postprocess/VolumetricPass';
export { VolumetricRenderer, type FogVolumeParams, type SmokeVolumeParams, type AtmosphereVolumeParams } from './VolumetricRenderer';

// Velocity buffer for optical flow ground truth
export { VelocityBuffer, type ObjectVelocityData, type CameraVelocityData } from './VelocityBuffer';

// Shadow system
export { PCSSShadow, type PCSSConfig } from './shadows/PCSSShadow';
export { CascadedShadowMap, type CSMConfig, type CascadeInfo } from './shadows/CascadedShadowMap';

// Lighting system
export { LightProbeSystem, type LightProbeConfig, type SH9, type SH9RGB } from './lighting/LightProbeSystem';
export { ExposureControl, type ExposureConfig, type ToneMappingPreset, TONE_MAPPING_SHADERS, TONE_MAPPING_THREEJS } from './lighting/ExposureControl';

// Phase 0 — Dual-Mode Rendering Architecture
export {
  RenderingModeProvider,
  useRenderingMode,
  RenderingModeContext,
  type RenderingMode,
  type ConvergenceInfo,
  type RenderingModeContextValue,
  type RenderingModeProviderProps,
} from './RenderingModeContext';

export {
  PathTracerAdapter,
  PathTracerRenderer,
  usePathTracerRenderer,
  type PathTracerAdapterProps,
} from './PathTracerAdapter';

export {
  InstanceExpander,
  globalInstanceExpander,
  expandSceneForPathTracing,
  hasInstancedMesh,
  type ExpansionResult,
} from './InstanceExpander';

// Phase 1 — Rendering Pipeline Overhaul
export {
  PathTracerManager,
  DEFAULT_PATHTRACER_CONFIG,
  detectGPUCapabilities,
  type PathTracerConfig,
  type GPUCapabilities,
} from './PathTracedRenderer';

export {
  createProceduralEnvironment,
  createBlurredEnvironment,
  createStudioEnvironment,
  disposeProceduralEnvironmentResources,
  atmosphereToSunDirection,
  DEFAULT_ATMOSPHERE,
  type AtmosphereParams,
  type StudioEnvironmentConfig,
} from './ProceduralEnvironment';

export {
  createPhysicalSpotLight,
  createShapedAreaLight,
  createPhysicalDirectionalLight,
  createOutdoorLighting,
  createIndoorLighting,
  upgradeSceneLights,
  type PhysicalSpotLightConfig,
  type ShapedAreaLightConfig,
  type PhysicalDirectionalLightConfig,
} from './PhysicalLightSystem';

export {
  createFogVolume,
  createGroundFog,
  createCloudLayer,
  createLocalizedFog,
  FogVolumeManager,
  type FogVolumeConfig,
  type GroundFogConfig,
  type CloudLayerConfig,
} from './FogVolumeSystem';

export {
  DenoisePipeline,
  createDenoisePipeline,
  DENOISE_PRESETS,
  DEFAULT_DENOISE_CONFIG,
  type DenoiseStrength,
  type DenoiseConfig,
} from './DenoisePipeline';

export {
  SSRPass,
  HBAOPass,
  DEFAULT_SSR_CONFIG,
  DEFAULT_HBAO_CONFIG,
  type SSRConfig,
  type HBAOConfig,
} from './RasterizedEnhancements';

// Phase 9 — Animation and Camera Systems
export {
  PhysicalCameraSetup,
  useAnimatedPathTracer,
  getCameraPreset,
  listCameraPresets,
  DEFAULT_PHYSICAL_CAMERA_CONFIG,
  DEFAULT_ANIMATED_PATHTRACER_CONFIG,
  CAMERA_PRESETS,
  type PhysicalCameraConfig,
  type AnimatedPathTracerConfig,
  type CameraPreset,
} from './PhysicalCameraSetup';
