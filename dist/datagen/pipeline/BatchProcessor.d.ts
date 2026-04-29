/**
 * Phase 4: Data Pipeline - Batch Processor
 *
 * Handles batch processing of multiple jobs with cloud integration,
 * auto-scaling, and notification support.
 */
import { EventEmitter } from 'events';
import { BatchJob, BatchStatus, BatchProgress, JobConfig, CloudIntegrationConfig } from './types';
import { JobManager } from './JobManager';
export interface BatchProcessorOptions {
    maxConcurrentBatches: number;
    maxJobsPerBatch: number;
    enableCloudScaling: boolean;
    defaultCloudConfig?: CloudIntegrationConfig;
}
export declare class BatchProcessor extends EventEmitter {
    private batches;
    private jobManager;
    private activeBatches;
    private maxConcurrentBatches;
    private maxJobsPerBatch;
    private enableCloudScaling;
    private defaultCloudConfig?;
    constructor(jobManager: JobManager, options?: Partial<BatchProcessorOptions>);
    /**
     * Create a new batch job
     */
    createBatch(name: string, jobConfigs: Array<Omit<JobConfig, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt' | 'retryCount'>>, cloudConfig?: CloudIntegrationConfig): string;
    /**
     * Start processing a batch
     */
    startBatch(batchId: string): boolean;
    /**
     * Get batch progress
     */
    getBatchProgress(batchId: string): BatchProgress | undefined;
    /**
     * Cancel a batch
     */
    cancelBatch(batchId: string): boolean;
    /**
     * Get all batches
     */
    getBatches(status?: BatchStatus): BatchJob[];
    /**
     * Get batch by ID
     */
    getBatch(batchId: string): BatchJob | undefined;
    /**
     * Send notifications for batch completion/failure
     */
    private sendNotifications;
    private sendEmailNotification;
    private sendSlackNotification;
    private sendWebhookNotification;
    private formatNotificationBody;
    private formatDuration;
    private estimateAverageJobTime;
    private scaleCloudResources;
    private handleJobCompleted;
    private handleJobFailed;
    private generateBatchId;
}
export default BatchProcessor;
//# sourceMappingURL=BatchProcessor.d.ts.map