/**
 * Phase 4: Data Pipeline - Main Module Exports
 * 
 * Central export point for all pipeline components.
 * Includes task execution framework (Sprint 2.1).
 */

export * from './types';
export { JobManager, type JobManagerOptions } from './JobManager';
export { BatchProcessor, type BatchProcessorOptions } from './BatchProcessor';
export { GroundTruthGenerator, type GroundTruthOptions, type GroundTruthResult } from './GroundTruthGenerator';
export { ConfigParser, type SceneConfig } from './SceneConfigSystem';

// Task Execution Framework (Sprint 2.1)
export {
  TaskRegistry,
  taskRegistry,
  TaskFunction,
  TaskResult,
  TaskConfig,
  TaskMetadata,
  TaskParamType,
} from './TaskRegistry';

export {
  renderTask,
  renderTaskMetadata,
  registerRenderTask,
  executeRender,
  type RenderConfig,
} from '../../core/rendering/RenderTask';

export {
  saveMeshesTask,
  saveMeshesTaskMetadata,
  registerSaveMeshesTask,
  executeSaveMeshes,
  isStaticObject,
  triangulateGeometry,
  triangulateScene,
  getMeshStats,
  type MeshExportConfig,
  type ExportFormat,
  type MeshExportInfo,
} from './MeshExportTask';

// Convenience re-exports of key types
export type {
  JobConfig,
  JobStatus,
  JobPriority,
  JobProgress,
  JobResult,
  BatchJob,
  BatchStatus,
  BatchProgress,
  SceneGenerationConfig,
  OutputConfig,
  GroundTruthConfig,
  CloudIntegrationConfig,
  PipelineMetrics,
  PipelineHealth,
} from './types';
