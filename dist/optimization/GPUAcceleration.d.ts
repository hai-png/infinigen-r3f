/**
 * GPU-Accelerated Constraint Evaluation Engine
 *
 * Provides WebGPU-based parallel constraint evaluation for massive performance gains.
 * Falls back to CPU implementation when WebGPU is unavailable.
 */
import type { Problem } from '../constraints/language/types';
import type { State } from '../constraints/evaluator/state';
export interface GPUContext {
    device: GPUDevice;
    adapter: GPUAdapter;
    queue: GPUQueue;
    limits: GPUSupportedLimits;
}
export interface GPUConstraintBuffers {
    constraintBuffer: GPUBuffer;
    expressionBuffer: GPUBuffer;
    objectBuffer: GPUBuffer;
    resultBuffer: GPUBuffer;
    violationBuffer: GPUBuffer;
    constraintCount: number;
    expressionCount: number;
    objectCount: number;
}
export interface GPUEvaluationResult {
    violations: Float32Array;
    scores: Float32Array;
    executionTime: number;
    gpuUsed: boolean;
}
export interface GPUOptimizationConfig {
    enableGPU: boolean;
    batchSize: number;
    useComputeShaders: boolean;
    validateResults: boolean;
    memoryBudget: number;
}
export declare function initGPUContext(): Promise<GPUContext | null>;
export declare function isGPUAvailable(): boolean;
export declare function createGPUConstraintBuffers(context: GPUContext, problem: Problem, state: State): GPUConstraintBuffers;
export declare function destroyGPUConstraintBuffers(buffers: GPUConstraintBuffers): void;
export declare function createEvaluationPipeline(context: GPUContext, buffers: GPUConstraintBuffers): GPUComputePipeline;
export declare function evaluateConstraintsGPU(problem: Problem, state: State, config?: GPUOptimizationConfig): Promise<GPUEvaluationResult>;
export declare function evaluateConstraintsCPU(problem: Problem, state: State, startTime?: number): GPUEvaluationResult;
export declare function evaluateStatesInParallel(problem: Problem, states: State[], config?: GPUOptimizationConfig): Promise<GPUEvaluationResult[]>;
export interface GPUPerformanceMetrics {
    averageExecutionTime: number;
    gpuUtilization: number;
    memoryUsage: number;
    fallbackCount: number;
    totalEvaluations: number;
}
export declare function trackGPUEvaluation(result: GPUEvaluationResult): void;
export declare function getGPUMetrics(): GPUPerformanceMetrics;
export declare function resetGPUMetrics(): void;
declare const _default: {
    initGPUContext: typeof initGPUContext;
    isGPUAvailable: typeof isGPUAvailable;
    evaluateConstraintsGPU: typeof evaluateConstraintsGPU;
    evaluateConstraintsCPU: typeof evaluateConstraintsCPU;
    evaluateStatesInParallel: typeof evaluateStatesInParallel;
    createGPUConstraintBuffers: typeof createGPUConstraintBuffers;
    destroyGPUConstraintBuffers: typeof destroyGPUConstraintBuffers;
    createEvaluationPipeline: typeof createEvaluationPipeline;
    trackGPUEvaluation: typeof trackGPUEvaluation;
    getGPUMetrics: typeof getGPUMetrics;
    resetGPUMetrics: typeof resetGPUMetrics;
};
export default _default;
//# sourceMappingURL=GPUAcceleration.d.ts.map