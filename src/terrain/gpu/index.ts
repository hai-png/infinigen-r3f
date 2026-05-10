/**
 * Infinigen R3F Port - GPU Module Exports
 *
 * HydraulicErosionGPU now has full WebGPU compute shader support with
 * CPU fallback. The new primary types are HydraulicErosionGPUConfig and
 * ErosionGPUResult. The old ErosionConfig/ErosionData aliases are kept
 * for backward compatibility but are deprecated.
 */

export {
  MarchingCubesCompute,
  type GPUComputeConfig,
  type MarchingCubesResult,
} from './MarchingCubesCompute';

export {
  HydraulicErosionGPU,
  DEFAULT_HYDRAULIC_EROSION_GPU_CONFIG,
  type HydraulicErosionGPUConfig,
  type ErosionGPUResult,
  // Backward-compatible aliases (deprecated — use the new types above)
  type ErosionConfig as HydraulicErosionGPUConfigLegacy,
  type ErosionData as HydraulicErosionGPUDataLegacy,
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
