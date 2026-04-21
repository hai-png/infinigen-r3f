/**
 * Phase 4: Data Pipeline - Main Module Exports
 * 
 * Central export point for all pipeline components.
 */

export * from './types';
export { JobManager, type JobManagerOptions } from './JobManager';
export { BatchProcessor, type BatchProcessorOptions } from './BatchProcessor';
export { GroundTruthGenerator, type GroundTruthOptions, type GroundTruthResult } from './GroundTruthGenerator';

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
