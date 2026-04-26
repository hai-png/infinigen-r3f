/**
 * Phase 4: Data Pipeline - Job Manager
 *
 * Core job management system for handling scene generation jobs,
 * including queue management, execution, and progress tracking.
 */
import { EventEmitter } from 'events';
import { JobConfig, JobProgress, JobResult, JobError, PaginationParams, PaginatedResult, QueryParams } from './types';
export interface JobManagerOptions {
    maxConcurrentJobs: number;
    maxQueueSize: number;
    defaultMaxRetries: number;
    jobTimeout?: number;
    enablePersistence?: boolean;
    persistencePath?: string;
}
export declare class JobManager extends EventEmitter {
    private jobs;
    private queue;
    private runningJobs;
    private completedJobs;
    private failedJobs;
    private maxConcurrentJobs;
    private maxQueueSize;
    private defaultMaxRetries;
    private jobTimeout?;
    private enablePersistence;
    private persistencePath?;
    private isProcessing;
    private processInterval?;
    constructor(options?: Partial<JobManagerOptions>);
    /**
     * Create and queue a new job
     */
    createJob(config: Omit<JobConfig, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt' | 'retryCount'>): string;
    /**
     * Get job by ID
     */
    getJob(jobId: string): JobConfig | undefined;
    /**
     * Get job progress
     */
    getJobProgress(jobId: string): JobProgress | undefined;
    /**
     * Update job progress
     */
    updateProgress(jobId: string, progress: number, currentStage?: string): void;
    /**
     * Mark job as completed
     */
    completeJob(jobId: string, result: JobResult): void;
    /**
     * Mark job as failed
     */
    failJob(jobId: string, error: JobError): void;
    /**
     * Cancel a job
     */
    cancelJob(jobId: string): boolean;
    /**
     * Pause a running job
     */
    pauseJob(jobId: string): boolean;
    /**
     * Resume a paused job
     */
    resumeJob(jobId: string): boolean;
    /**
     * Query jobs with filters
     */
    queryJobs(params: QueryParams & PaginationParams): PaginatedResult<JobConfig>;
    /**
     * Get queue statistics
     */
    getStats(): {
        total: number;
        pending: number;
        queued: number;
        running: number;
        paused: number;
        completed: number;
        failed: number;
        cancelled: number;
    };
    /**
     * Clear completed and failed jobs
     */
    clearCompleted(olderThan?: Date): number;
    /**
     * Start processing queue
     */
    start(): void;
    /**
     * Stop processing queue
     */
    stop(): void;
    private scheduleProcessing;
    private processQueue;
    private sortQueueByPriority;
    private generateJobId;
    private generateWorkerId;
    private getCurrentStage;
    private saveToPersistence;
    private loadFromPersistence;
}
export default JobManager;
//# sourceMappingURL=JobManager.d.ts.map