/**
 * GPU-Accelerated Constraint Evaluation Engine
 *
 * Provides WebGPU-based parallel constraint evaluation for massive performance gains.
 * Falls back to CPU implementation when WebGPU is unavailable.
 */
import { evaluateNode } from '../constraints/evaluator/evaluate';
// ============================================================================
// GPU Context Management
// ============================================================================
let cachedContext = null;
export async function initGPUContext() {
    if (cachedContext)
        return cachedContext;
    if (!navigator.gpu) {
        console.warn('WebGPU not available, falling back to CPU');
        return null;
    }
    try {
        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance',
        });
        if (!adapter) {
            console.warn('No suitable GPU adapter found');
            return null;
        }
        const device = await adapter.requestDevice({
            requiredLimits: {
                maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
                maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
                maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
            },
        });
        cachedContext = { device, adapter, queue: device.queue, limits: adapter.limits };
        console.log('WebGPU initialized:', {
            maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
            maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
        });
        return cachedContext;
    }
    catch (error) {
        console.error('Failed to initialize WebGPU:', error);
        return null;
    }
}
export function isGPUAvailable() {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
}
// ============================================================================
// WGSL Shader Code
// ============================================================================
const constraintEvaluationWGSL = `
struct ConstraintData {
  id: u32,
  type: u32,
  exprOffset: u32,
  exprCount: u32,
  weight: f32,
  padding: vec3<f32>,
};

struct ExpressionData {
  opType: u32,
  leftIndex: u32,
  rightIndex: u32,
  value: f32,
  varIndex: i32,
  padding: vec2<f32>,
};

struct ObjectData {
  position: vec3<f32>,
  rotation: vec4<f32>,
  scale: vec3<f32>,
  bboxMin: vec3<f32>,
  bboxMax: vec3<f32>,
  typeId: u32,
  flags: u32,
};

struct EvalResult {
  violation: f32,
  score: f32,
  constraintId: u32,
  padding: f32,
};

@group(0) @binding(0) var<storage, read> constraints: array<ConstraintData>;
@group(0) @binding(1) var<storage, read> expressions: array<ExpressionData>;
@group(0) @binding(2) var<storage, read> objects: array<ObjectData>;
@group(0) @binding(3) var<storage, read_write> results: array<EvalResult>;

fn evaluateExpression(exprIndex: u32, objIndex: u32) -> f32 {
  let expr = expressions[exprIndex];
  
  switch expr.opType {
    case 0u: { return expr.value; }
    case 1u: {
      if (expr.varIndex >= 0 && expr.varIndex < i32(arrayLength(&objects))) {
        let obj = objects[expr.varIndex];
        return length(obj.position);
      }
      return 0.0;
    }
    case 2u: {
      let left = evaluateExpression(expr.leftIndex, objIndex);
      let right = evaluateExpression(expr.rightIndex, objIndex);
      return left + right;
    }
    case 3u: {
      let left = evaluateExpression(expr.leftIndex, objIndex);
      let right = evaluateExpression(expr.rightIndex, objIndex);
      return left - right;
    }
    case 4u: {
      let left = evaluateExpression(expr.leftIndex, objIndex);
      let right = evaluateExpression(expr.rightIndex, objIndex);
      return left * right;
    }
    default: { return 0.0; }
  }
}

@compute @workgroup_size(64)
fn evaluateConstraints(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let constraintIdx = global_id.x;
  
  if (constraintIdx >= arrayLength(&constraints)) {
    return;
  }
  
  let constraint = constraints[constraintIdx];
  var totalViolation: f32 = 0.0;
  var totalScore: f32 = 0.0;
  
  for (var i: u32 = 0; i < constraint.exprCount; i = i + 1) {
    let exprIdx = constraint.exprOffset + i;
    let value = evaluateExpression(exprIdx, 0);
    totalScore += value;
    if (value < 0.0) {
      totalViolation += abs(value);
    }
  }
  
  results[constraintIdx] = EvalResult(
    totalViolation * constraint.weight,
    totalScore * constraint.weight,
    constraint.id,
    0.0
  );
}
`;
// ============================================================================
// Buffer Management
// ============================================================================
export function createGPUConstraintBuffers(context, problem, state) {
    const { device } = context;
    const constraintData = new Float32Array(problem.constraints.length * 8);
    const expressionData = new Float32Array(problem.expressions.length * 6);
    for (let i = 0; i < problem.constraints.length; i++) {
        const c = problem.constraints[i];
        const offset = i * 8;
        constraintData[offset] = c.id;
        constraintData[offset + 1] = c.type;
        constraintData[offset + 2] = c.exprOffset || 0;
        constraintData[offset + 3] = c.exprCount || 0;
        constraintData[offset + 4] = c.weight || 1.0;
    }
    for (let i = 0; i < problem.expressions.length; i++) {
        const e = problem.expressions[i];
        const offset = i * 6;
        expressionData[offset] = e.opType;
        expressionData[offset + 1] = e.leftIndex || 0;
        expressionData[offset + 2] = e.rightIndex || 0;
        expressionData[offset + 3] = e.value || 0;
        expressionData[offset + 4] = e.varIndex ?? -1;
    }
    const objectKeys = Object.keys(state.objects);
    const objectData = new Float32Array(objectKeys.length * 16);
    for (let i = 0; i < objectKeys.length; i++) {
        const obj = state.objects[objectKeys[i]];
        const offset = i * 16;
        if (obj.pose) {
            objectData[offset] = obj.pose.position?.[0] || 0;
            objectData[offset + 1] = obj.pose.position?.[1] || 0;
            objectData[offset + 2] = obj.pose.position?.[2] || 0;
            objectData[offset + 7] = obj.pose.scale?.[0] || 1;
        }
        if (obj.bbox) {
            objectData[offset + 10] = obj.bbox.min?.[0] || 0;
            objectData[offset + 13] = obj.bbox.max?.[0] || 0;
        }
    }
    const constraintBuffer = device.createBuffer({
        size: constraintData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(constraintBuffer.getMappedRange()).set(constraintData);
    constraintBuffer.unmap();
    const expressionBuffer = device.createBuffer({
        size: expressionData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(expressionBuffer.getMappedRange()).set(expressionData);
    expressionBuffer.unmap();
    const objectBuffer = device.createBuffer({
        size: objectData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(objectBuffer.getMappedRange()).set(objectData);
    objectBuffer.unmap();
    const resultBuffer = device.createBuffer({
        size: problem.constraints.length * 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const violationBuffer = device.createBuffer({
        size: problem.constraints.length * 4,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    return {
        constraintBuffer,
        expressionBuffer,
        objectBuffer,
        resultBuffer,
        violationBuffer,
        constraintCount: problem.constraints.length,
        expressionCount: problem.expressions.length,
        objectCount: objectKeys.length,
    };
}
export function destroyGPUConstraintBuffers(buffers) {
    buffers.constraintBuffer.destroy();
    buffers.expressionBuffer.destroy();
    buffers.objectBuffer.destroy();
    buffers.resultBuffer.destroy();
    buffers.violationBuffer.destroy();
}
// ============================================================================
// Pipeline Creation
// ============================================================================
export function createEvaluationPipeline(context, buffers) {
    const { device } = context;
    const shaderModule = device.createShaderModule({ code: constraintEvaluationWGSL });
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
    const computePipeline = device.createComputePipeline({
        layout: pipelineLayout,
        compute: { module: shaderModule, entryPoint: 'evaluateConstraints' },
    });
    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: buffers.constraintBuffer } },
            { binding: 1, resource: { buffer: buffers.expressionBuffer } },
            { binding: 2, resource: { buffer: buffers.objectBuffer } },
            { binding: 3, resource: { buffer: buffers.resultBuffer } },
        ],
    });
    computePipeline._bindGroup = bindGroup;
    return computePipeline;
}
// ============================================================================
// Main Evaluation Functions
// ============================================================================
export async function evaluateConstraintsGPU(problem, state, config = {}) {
    const startTime = performance.now();
    const effectiveConfig = {
        enableGPU: true,
        batchSize: 1024,
        useComputeShaders: true,
        validateResults: false,
        memoryBudget: 512,
        ...config,
    };
    if (effectiveConfig.enableGPU) {
        const context = await initGPUContext();
        if (context) {
            try {
                const buffers = createGPUConstraintBuffers(context, problem, state);
                const pipeline = createEvaluationPipeline(context, buffers);
                const commandEncoder = context.device.createCommandEncoder();
                const passEncoder = commandEncoder.beginComputePass();
                passEncoder.setPipeline(pipeline);
                passEncoder.setBindGroup(0, pipeline._bindGroup);
                const workgroupCount = Math.ceil(buffers.constraintCount / 64);
                passEncoder.dispatchWorkgroups(workgroupCount);
                passEncoder.end();
                commandEncoder.copyBufferToBuffer(buffers.resultBuffer, 0, buffers.violationBuffer, 0, buffers.constraintCount * 16);
                const commandBuffer = commandEncoder.finish();
                context.queue.submit([commandBuffer]);
                await buffers.violationBuffer.mapAsync(GPUMapMode.READ);
                const resultArray = new Float32Array(buffers.violationBuffer.getMappedRange());
                const violations = new Float32Array(resultArray.length / 4);
                const scores = new Float32Array(resultArray.length / 4);
                for (let i = 0; i < resultArray.length / 4; i++) {
                    violations[i] = resultArray[i * 4];
                    scores[i] = resultArray[i * 4 + 1];
                }
                buffers.violationBuffer.unmap();
                destroyGPUConstraintBuffers(buffers);
                return {
                    violations,
                    scores,
                    executionTime: performance.now() - startTime,
                    gpuUsed: true,
                };
            }
            catch (error) {
                console.warn('GPU evaluation failed, falling back to CPU:', error);
            }
        }
    }
    return evaluateConstraintsCPU(problem, state, startTime);
}
export function evaluateConstraintsCPU(problem, state, startTime = performance.now()) {
    const violations = new Float32Array(problem.constraints.length);
    const scores = new Float32Array(problem.constraints.length);
    for (let i = 0; i < problem.constraints.length; i++) {
        const constraint = problem.constraints[i];
        const result = evaluateNode(constraint.expression, state);
        violations[i] = result.violation || 0;
        scores[i] = result.score || 0;
    }
    return {
        violations,
        scores,
        executionTime: performance.now() - startTime,
        gpuUsed: false,
    };
}
export async function evaluateStatesInParallel(problem, states, config = {}) {
    const batchSize = config.batchSize || 1024;
    const results = [];
    for (let i = 0; i < states.length; i += batchSize) {
        const batch = states.slice(i, i + batchSize);
        const batchPromises = batch.map(state => evaluateConstraintsGPU(problem, state, config));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }
    return results;
}
let metrics = {
    averageExecutionTime: 0,
    gpuUtilization: 0,
    memoryUsage: 0,
    fallbackCount: 0,
    totalEvaluations: 0,
};
export function trackGPUEvaluation(result) {
    metrics.totalEvaluations++;
    metrics.averageExecutionTime =
        (metrics.averageExecutionTime * (metrics.totalEvaluations - 1) + result.executionTime) /
            metrics.totalEvaluations;
    if (result.gpuUsed) {
        metrics.gpuUtilization =
            (metrics.gpuUtilization * (metrics.totalEvaluations - 1) + 1) /
                metrics.totalEvaluations;
    }
    else {
        metrics.fallbackCount++;
    }
}
export function getGPUMetrics() {
    return { ...metrics };
}
export function resetGPUMetrics() {
    metrics = {
        averageExecutionTime: 0,
        gpuUtilization: 0,
        memoryUsage: 0,
        fallbackCount: 0,
        totalEvaluations: 0,
    };
}
export default {
    initGPUContext,
    isGPUAvailable,
    evaluateConstraintsGPU,
    evaluateConstraintsCPU,
    evaluateStatesInParallel,
    createGPUConstraintBuffers,
    destroyGPUConstraintBuffers,
    createEvaluationPipeline,
    trackGPUEvaluation,
    getGPUMetrics,
    resetGPUMetrics,
};
//# sourceMappingURL=GPUAcceleration.js.map