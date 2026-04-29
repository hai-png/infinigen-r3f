/**
 * Optimization Module Exports
 */
export * from './GPUAcceleration';
export * from './DrawCallOptimizer';
export * from './MemoryProfiler';
// Future optimization modules can be added here:
// export * from './MemoryOptimizer';
// export * from './PerformanceProfiler';
// export * from './BundleAnalyzer';
import GPUAcceleration, { initGPUContext, isGPUAvailable, evaluateConstraintsGPU, evaluateConstraintsCPU, evaluateStatesInParallel, createGPUConstraintBuffers, destroyGPUConstraintBuffers, createEvaluationPipeline, trackGPUEvaluation, getGPUMetrics, resetGPUMetrics, } from './GPUAcceleration';
export { GPUAcceleration as default, initGPUContext, isGPUAvailable, evaluateConstraintsGPU, evaluateConstraintsCPU, evaluateStatesInParallel, createGPUConstraintBuffers, destroyGPUConstraintBuffers, createEvaluationPipeline, trackGPUEvaluation, getGPUMetrics, resetGPUMetrics, };
//# sourceMappingURL=index.js.map