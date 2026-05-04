/**
 * GPU Evaluation Module - Index
 *
 * Provides WebGPU-based per-vertex evaluation of node graphs,
 * with CPU fallback when WebGPU is not available.
 *
 * @module core/nodes/execution/gpu
 */

// WGSL Node Functions
export {
  WGSL_COMMON_UTILITIES,
  WGSL_NOISE_TEXTURE,
  WGSL_VORONOI_TEXTURE,
  WGSL_MUSGRAVE_TEXTURE,
  WGSL_GRADIENT_TEXTURE,
  WGSL_MATH,
  WGSL_VECTOR_MATH,
  WGSL_BRICK_TEXTURE,
  WGSL_CHECKER_TEXTURE,
  WGSL_MAPPING,
  ALL_WGSL_NODE_FUNCTIONS,
} from './WGSLNodeFunctions';

// GPU Per-Vertex Evaluator
export {
  GPUPerVertexEvaluator,
  default as GPUPerVertexEvaluatorDefault,
} from './GPUPerVertexEvaluator';

export type {
  GPUEvaluationChannels,
  GPUEvaluationResult,
  GPUNode,
  GPUShaderGraph,
  GPUEvalOptions,
} from './GPUPerVertexEvaluator';

// GPU Evaluation Pipeline
export {
  GPUEvaluationPipeline,
  isWebGPUAvailable,
  getWebGPUDevice,
  default as GPUEvaluationPipelineDefault,
} from './GPUEvaluationPipeline';

export type {
  PipelineEvalOptions,
  PipelineEvalResult,
} from './GPUEvaluationPipeline';
