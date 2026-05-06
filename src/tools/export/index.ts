export {
  SceneExporter,
  exportSceneToBlob,
  getSupportedFormats,
  getAvailableFormatIds,
  type SceneExportOptions,
  type SceneExportResult,
  type ExportFormat,
  type ExportScope,
  type FormatCapability,
  // Backward-compatible type aliases
  type ExportOptions,
  type ExportResult,
  // Pipeline-specific types
  type LODConfig,
  type TexturePackResult,
} from './SceneExporter';
export { TextureBaker, type TextureBakeOptions, type TextureBakeResult, type TextureSize, type UVProjection, type PBRBakeResult } from './TextureBaker';
export { SimulationExporter, type SimulationExportOptions, type SimulationExportResult, type ArticulatedBody, type JointDefinition } from './SimulationExporter';
export { MeshSimplifier, simplifyGeometry, generateCollisionMesh, generateCollisionHull, type SimplificationOptions, type CollisionMeshOptions } from './MeshSimplifier';
