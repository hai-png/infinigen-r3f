/**
 * Utility Tools
 *
 * Development and debugging tools for Infinigen.
 * Based on Infinigen's tools/ module.
 *
 * Export system is now consolidated: SceneExporter is the single entry point.
 * ExportToolkit remains as a backward-compatibility shim that delegates to SceneExporter.
 */

import { ExportToolkit, createExportToolkit } from './ExportToolkit';

// Backward-compatibility shim (delegates to SceneExporter)
export { ExportToolkit, createExportToolkit } from './ExportToolkit';
export type {
  ExportFormat as ExportToolkitFormat,
  ExportOptions,
  ExportResult,
  ExportTransform,
  LODSettings,
  TextureExportSettings,
} from './ExportToolkit';

// Consolidated export pipeline — the canonical API
export {
  SceneExporter,
  exportSceneToBlob,
  getSupportedFormats,
  TextureBaker,
  SimulationExporter,
  MeshSimplifier,
  simplifyGeometry,
} from './export';

export type {
  ExportFormat,
  ExportFormat as SceneExportFormat,
  ExportScope,
  SceneExportOptions,
  SceneExportResult,
  TextureBakeOptions,
  TextureBakeResult,
  TextureSize,
  UVProjection,
  SimulationExportOptions,
  SimulationExportResult,
  ArticulatedBody,
  JointDefinition,
  SimplificationOptions,
} from './export';

// Version info
export const TOOLS_VERSION = '0.4.0';

export default {
  ExportToolkit,
  createExportToolkit,
};
