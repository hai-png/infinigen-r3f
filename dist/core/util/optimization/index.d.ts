/**
 * Optimization Module Exports
 */
export * from './GPUAcceleration';
export * from './DrawCallOptimizer';
export * from './MemoryProfiler';
import GPUAcceleration, { initGPUContext, isGPUAvailable, evaluateConstraintsGPU, evaluateConstraintsCPU, evaluateStatesInParallel, createGPUConstraintBuffers, destroyGPUConstraintBuffers, createEvaluationPipeline, trackGPUEvaluation, getGPUMetrics, resetGPUMetrics, type GPUContext, type GPUConstraintBuffers, type GPUEvaluationResult, type GPUOptimizationConfig, type GPUPerformanceMetrics } from './GPUAcceleration';
export { GPUAcceleration as default, initGPUContext, isGPUAvailable, evaluateConstraintsGPU, evaluateConstraintsCPU, evaluateStatesInParallel, createGPUConstraintBuffers, destroyGPUConstraintBuffers, createEvaluationPipeline, trackGPUEvaluation, getGPUMetrics, resetGPUMetrics, };
export type { GPUContext, GPUConstraintBuffers, GPUEvaluationResult, GPUOptimizationConfig, GPUPerformanceMetrics, };
//# sourceMappingURL=index.d.ts.map