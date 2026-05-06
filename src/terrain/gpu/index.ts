/**
 * Infinigen R3F Port - GPU Module Exports
 *
 * NOTE: HydraulicErosionGPU is CPU-only despite the name.
 * ErosionConfig and ErosionData here have different shapes than
 * the ones in erosion/ErosionEnhanced.ts. We alias them to avoid
 * name collisions in the barrel export.
 */

export {
  MarchingCubesCompute,
  type GPUComputeConfig,
  type MarchingCubesResult,
} from './MarchingCubesCompute';

export {
  HydraulicErosionGPU,
  type ErosionConfig as HydraulicErosionGPUConfig,
  type ErosionData as HydraulicErosionGPUData,
} from './HydraulicErosionGPU';

export {
  TerrainSurfaceShaderPipeline,
  DEFAULT_TERRAIN_SURFACE_CONFIG,
  type TerrainSurfaceConfig,
} from './TerrainSurfaceShaderPipeline';

export {
  GPUSurfaceShaders,
  SDF_SURFACE_DISPLACEMENT_WGSL,
  DEFAULT_SDF_DISPLACEMENT_UNIFORMS,
  type SurfaceShaderConfig,
  type SDFDisplacementUniforms,
} from './GPUSurfaceShaders';

export {
  GPUSDFEvaluator,
  DEFAULT_GPU_SDF_EVALUATOR_CONFIG,
  buildCompositionFromRegistry,
  makeSphereElement,
  makeBoxElement,
  makeCylinderElement,
  makeTorusElement,
  makeConeElement,
  makeSegmentElement,
  type GPUSDFEvaluatorConfig,
  type SDFEvaluationResult,
} from './GPUSDFEvaluator';

export {
  WGSL_SDF_PRIMITIVES,
  WGSL_SDF_COMBINATORS,
  WGSL_SDF_TRANSFORMS,
  ALL_WGSL_SDF_FUNCTIONS,
  SDF_ELEMENT_FLOATS,
  SDFPrimitiveType,
  SDFCombinatorType,
  type SDFElementDesc,
} from './WGSLSDFFunctions';
