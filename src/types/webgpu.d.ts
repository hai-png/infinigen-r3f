// WebGPU type declarations
interface GPUBuffer {
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
  destroy(): void;
  size: number;
  usage: number;
  label: string;
}
interface GPUDevice {
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createPipelineLayout(descriptor: { bindGroupLayouts: GPUBindGroupLayout[] }): GPUPipelineLayout;
  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
  createRenderPipeline(descriptor: any): GPURenderPipeline;
  createRenderBundleEncoder(descriptor: any): GPURenderBundleEncoder;
  createTexture(descriptor: any): GPUTexture;
  createSampler(descriptor?: any): GPUSampler;
  createQuerySet(descriptor: any): GPUQuerySet;
  queue: GPUQueue;
  label: string;
  destroyed: boolean;
  features: Set<string>;
  limits: Record<string, number>;
  lost: Promise<GPUDeviceLostInfo>;
  pushErrorScope(filter: string): void;
  popErrorScope(): Promise<GPUError | null>;
  destroy(): void;
}
interface GPUQueue {
  submit(commands: GPUCommandBuffer[]): void;
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource | ArrayBufferView, dataOffset?: number, size?: number): void;
  writeTexture(destination: any, data: BufferSource | ArrayBufferView, dataLayout: any, size: any): void;
  onSubmittedWorkDone(): Promise<void>;
  label: string;
}
interface GPUCommandEncoder {
  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder;
  beginRenderPass(descriptor: any): any;
  copyBufferToBuffer(source: GPUBuffer, sourceOffset: number, destination: GPUBuffer, destinationOffset: number, size: number): void;
  copyBufferToTexture(source: any, destination: any, copySize: any): void;
  copyTextureToBuffer(source: any, destination: any, copySize: any): void;
  copyTextureToTexture(source: any, destination: any, copySize: any): void;
  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer;
  label: string;
  pushDebugGroup(groupLabel: string): void;
  popDebugGroup(): void;
  insertDebugMarker(markerLabel: string): void;
}
interface GPUComputePassEncoder {
  setPipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: number[]): void;
  dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
  dispatchWorkgroupsIndirect(indirectBuffer: GPUBuffer, indirectOffset: number): void;
  end(): void;
  label: string;
  pushDebugGroup(groupLabel: string): void;
  popDebugGroup(): void;
  insertDebugMarker(markerLabel: string): void;
}
interface GPUCommandBuffer { label: string; }
interface GPUCommandBufferDescriptor { label?: string; }
interface GPUCommandEncoderDescriptor { label?: string; }
interface GPUComputePassDescriptor { label?: string; }
interface GPUComputePipeline { label: string; getBindGroupLayout(index: number): GPUBindGroupLayout; }
interface GPUBindGroupLayout { label: string; }
interface GPUBindGroupLayoutDescriptor {
  label?: string;
  entries: GPUBindGroupLayoutEntry[];
}
interface GPUBindGroupLayoutEntry {
  binding: number;
  visibility: number;
  buffer?: { type: string; hasDynamicOffset?: boolean; minBindingSize?: number };
  sampler?: { type: string };
  texture?: { viewDimension?: string; sampleType?: string; multisampled?: boolean };
  storageTexture?: { access?: string; format?: string; viewDimension?: string };
}
interface GPUBindGroup { label: string; }
interface GPUBindGroupDescriptor {
  label?: string;
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
}
interface GPUBindGroupEntry {
  binding: number;
  resource: GPUBuffer | GPUSampler | GPUTextureView;
}
interface GPUPipelineLayout { label: string; }
interface GPUShaderModule { label: string; getCompilationInfo(): Promise<any>; }
interface GPUShaderModuleDescriptor {
  label?: string;
  code: string;
  sourceMap?: any;
}
interface GPUBufferDescriptor {
  label?: string;
  size: number;
  usage: number;
  mappedAtCreation?: boolean;
}
interface GPUTexture { label: string; }
interface GPUSampler { label: string; }
interface GPUTextureView { label: string; }
interface GPUQuerySet { label: string; }
interface GPURenderBundleEncoder { label: string; }
interface GPURenderPipeline { label: string; getBindGroupLayout(index: number): GPUBindGroupLayout; }
interface GPUDeviceLostInfo { reason: string; message: string; }
interface GPUError { message: string; }
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
  QUERY_RESOLVE: number;
}
interface GPUMapMode {
  READ: number;
  WRITE: number;
}
interface GPUTextureUsage {
  COPY_SRC: number;
  COPY_DST: number;
  TEXTURE_BINDING: number;
  STORAGE_BINDING: number;
  RENDER_ATTACHMENT: number;
}
declare const GPUShaderStage: GPUShaderStage;
declare const GPUBufferUsage: GPUBufferUsage;
declare const GPUMapMode: GPUMapMode;
declare const GPUTextureUsage: GPUTextureUsage;

// Navigator.gpu
interface Navigator {
  gpu?: GPU;
}
interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): string;
}
interface GPURequestAdapterOptions {
  powerPreference?: 'low-power' | 'high-performance';
  forceFallbackAdapter?: boolean;
}
interface GPUAdapter {
  features: Set<string>;
  limits: Record<string, number>;
  isFallbackAdapter: boolean;
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  requestAdapterInfo(): Promise<GPUAdapterInfo>;
}
interface GPUDeviceDescriptor {
  label?: string;
  requiredFeatures?: string[];
  requiredLimits?: Record<string, number>;
  defaultQueue?: any;
}
interface GPUAdapterInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}
