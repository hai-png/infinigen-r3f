/**
 * Terrain Surface Module Exports
 *
 * Re-exports the surface registry, kernel pipeline, shader graph bridge,
 * and the terrain surface library.
 */

// Surface Registry — weighted sampling and material descriptor types
export {
  SurfaceType,
  getEffectiveSurfaceType,
  SurfaceTemplate,
  SurfaceAttributeTypes,
  TerrainSurfaceRegistry,
  processSurfaceInput,
} from './SurfaceRegistry';

export type {
  SurfaceMaterialDescriptor,
  SurfaceMaterialParams,
  SurfaceDisplacementConfig,
  SurfaceAttributeType,
} from './SurfaceRegistry';

// TagMaterialMapper — tag-based material zone assignment
export {
  TagMaterialMapper,
} from './TagMaterialMapper';

export type {
  TagZoneAssignment,
  TagMaterialMapperConfig,
} from './TagMaterialMapper';

// Surface Kernel Pipeline — shader graph-driven surface processing
export {
  DisplacementMode,
  MaterialChannel,
  DEFAULT_SURFACE_KERNEL_CONFIG,
  SurfaceKernel,
  TerrainMaterialZone,
  DEFAULT_TERRAIN_SURFACE_BRIDGE_CONFIG,
  TerrainSurfaceBridge,
} from './SurfaceKernelPipeline';

export type {
  SurfaceKernelConfig,
  ShaderGraphContext,
  DisplacementResult,
  ChannelEvalResult,
  TerrainVertexAttributes,
  TerrainSurfaceBridgeConfig,
} from './SurfaceKernelPipeline';

// Shader Graph Surface Bridge — node graph → SurfaceKernel integration
export {
  ShaderGraphType,
  GraphBlendMode,
  DEFAULT_SHADER_GRAPH_BRIDGE_CONFIG,
  ShaderGraphSurfaceBridge,
} from './ShaderGraphSurfaceBridge';

export type {
  ShaderGraphDescriptor,
  ComposedSurfaceResult,
  ShaderGraphSurfaceBridgeConfig,
} from './ShaderGraphSurfaceBridge';

// Terrain Surface Library — node-graph-based surface definitions
export {
  TerrainSurfaces,
} from './TerrainSurfaceLibrary';

export type {
  ShaderNodeDescription,
  ShaderLinkDescription,
  TerrainSurfaceDescriptor,
} from './TerrainSurfaceLibrary';

// Surface Kernelizer — GLSL compilation and GPU evaluation
export {
  SurfaceKernelizer,
  CompiledSurfaceKernel,
  SurfaceKernelPresets,
  DEFAULT_KERNELIZER_CONFIG,
  compileSurfaceToDisplacement,
} from './SurfaceKernelizer';

export type {
  SurfaceKernelCompileResult,
  SurfaceKernelEvalResult,
  SurfaceKernelizerConfig,
  SurfaceKernelizerMode,
  UniformDecl,
  SurfaceKernelFunction,
} from './SurfaceKernelizer';

// NodeTerrainBridge — Integration between Node System and Terrain Surface
export {
  TerrainNodeBridge,
  DEFAULT_NODE_TERRAIN_BRIDGE_CONFIG,
  surfaceFuncToKernel,
  addTerrainSurface,
  compileSurfaceToDisplacementFunc,
  perturbSDFWithNodes,
} from './NodeTerrainBridge';

export type {
  SurfaceNodeFunc,
  TerrainSurfaceResult,
  NodeTerrainBridgeConfig,
} from './NodeTerrainBridge';
