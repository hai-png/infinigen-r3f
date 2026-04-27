// WebGPU type declarations
interface GPUDevice {}
interface GPUComputePipeline {}
interface GPUBindGroupLayout {}
interface GPUShaderStage {
  VERTEX: number;
  FRAGMENT: number;
  COMPUTE: number;
}
interface GPUBufferUsage {
  MAP_READ: number;
  MAP_WRITE: number;
  COPY_SRC: number;
  COPY_DST: number;
  INDEX: number;
  VERTEX: number;
  UNIFORM: number;
  STORAGE: number;
  INDIRECT: number;
}
interface GPUMapMode {
  READ: number;
  WRITE: number;
}
declare const GPUShaderStage: GPUShaderStage;
declare const GPUBufferUsage: GPUBufferUsage;
declare const GPUMapMode: GPUMapMode;
