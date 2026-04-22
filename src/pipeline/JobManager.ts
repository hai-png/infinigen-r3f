/**
 * Phase 4: Data Pipeline - Job Manager
 * 
 * Core job management system for handling scene generation jobs,
 * including queue management, execution, and progress tracking.
 */

import { EventEmitter } from 'events';
import {
  JobConfig,
  JobStatus,
  JobPriority,
  JobProgress,
  JobResult,
  JobError,
  JobMetadata,
  PipelineEvent,
  JobCreatedEvent,
  JobStartedEvent,
  JobProgressEvent,
  JobCompletedEvent,
  JobFailedEvent,
  PaginationParams,
  PaginatedResult,
  QueryParams,
} from './types';

export interface JobManagerOptions {
  maxConcurrentJobs: number;
  maxQueueSize: number;
  defaultMaxRetries: number;
  jobTimeout?: number; // milliseconds
  enablePersistence?: boolean;
  persistencePath?: string;
}

export class JobManager extends EventEmitter {
  private jobs: Map<string, JobConfig>;
  private queue: JobConfig[];
  private runningJobs: Map<string, JobConfig>;
  private completedJobs: Map<string, JobResult>;
  private failedJobs: Map<string, JobError>;
  
  private maxConcurrentJobs: number;
  private maxQueueSize: number;
  private defaultMaxRetries: number;
  private jobTimeout?: number;
  private enablePersistence: boolean;
  private persistencePath?: string;
  
  private isProcessing: boolean;
  private processInterval?: NodeJS.Timeout;

  constructor(options: Partial<JobManagerOptions> = {}) {
    super();
    
    this.jobs = new Map();
    this.queue = [];
    this.runningJobs = new Map();
    this.completedJobs = new Map();
    this.failedJobs = new Map();
    
    this.maxConcurrentJobs = options.maxConcurrentJobs ?? 4;
    this.maxQueueSize = options.maxQueueSize ?? 1000;
    this.defaultMaxRetries = options.defaultMaxRetries ?? 3;
    this.jobTimeout = options.jobTimeout;
    this.enablePersistence = options.enablePersistence ?? false;
    this.persistencePath = options.persistencePath;
    
    this.isProcessing = false;
    
    if (this.enablePersistence && this.persistencePath) {
      this.loadFromPersistence();
    }
  }

  /**
   * Create and queue a new job
   */
  createJob(config: Omit<JobConfig, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt' | 'retryCount'>): string {
    const jobId = this.generateJobId();
    
    const now = new Date();
    const fullConfig: JobConfig = {
      ...config,
      id: jobId,
      status: 'pending',
      progress: 0,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: config.maxRetries ?? this.defaultMaxRetries,
    };
    
    // Validate queue size
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`Queue is full (max: ${this.maxQueueSize})`);
    }
    
    // Store job
    this.jobs.set(jobId, fullConfig);
    this.queue.push(fullConfig);
    
    // Emit event
    const event: JobCreatedEvent = {
      type: 'job_created',
      jobId,
      timestamp: now,
      config: fullConfig,
    };
    this.emit('job_created', event);
    this.emit('event', event);
    
    // Trigger processing
    this.scheduleProcessing();
    
    return jobId;
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): JobConfig | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get job progress
   */
  getJobProgress(jobId: string): JobProgress | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      currentStage: this.getCurrentStage(job),
      stageProgress: job.progress % 100,
      errorMessage: job.errorMessage,
    };
  }

  /**
   * Update job progress
   */
  updateProgress(jobId: string, progress: number, currentStage?: string): void {
    const job = this.jobs.get(jobId);
    if (!job || !this.runningJobs.has(jobId)) {
      throw new Error(`Job ${jobId} is not running`);
    }
    
    job.progress = Math.min(100, Math.max(0, progress));
    job.updatedAt = new Date();
    
    if (currentStage) {
      job.metadata = { ...job.metadata, currentStage };
    }
    
    const event: JobProgressEvent = {
      type: 'job_progress',
      jobId,
      timestamp: new Date(),
      progress: this.getJobProgress(jobId)!,
    };
    this.emit('job_progress', event);
    this.emit('event', event);
    
    this.saveToPersistence();
  }

  /**
   * Mark job as completed
   */
  completeJob(jobId: string, result: JobResult): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    job.status = 'completed';
    job.progress = 100;
    job.updatedAt = new Date();
    
    this.runningJobs.delete(jobId);
    this.completedJobs.set(jobId, result);
    
    const event: JobCompletedEvent = {
      type: 'job_completed',
      jobId,
      timestamp: new Date(),
      result,
    };
    this.emit('job_completed', event);
    this.emit('event', event);
    
    this.saveToPersistence();
    this.scheduleProcessing();
  }

  /**
   * Mark job as failed
   */
  failJob(jobId: string, error: JobError): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    job.retryCount++;
    job.updatedAt = new Date();
    
    if (job.retryCount < job.maxRetries && error.recoverable) {
      // Retry job
      job.status = 'queued';
      job.progress = 0;
      job.errorMessage = undefined;
      this.runningJobs.delete(jobId);
      this.queue.push(job);
      
      this.emit('job_retry', { jobId, retryCount: job.retryCount });
      this.scheduleProcessing();
    } else {
      // Final failure
      job.status = 'failed';
      job.errorMessage = error.message;
      this.runningJobs.delete(jobId);
      this.failedJobs.set(jobId, error);
      
      const event: JobFailedEvent = {
        type: 'job_failed',
        jobId,
        timestamp: new Date(),
        error,
      };
      this.emit('job_failed', event);
      this.emit('event', event);
      
      this.saveToPersistence();
      this.scheduleProcessing();
    }
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    
    if (job.status === 'completed' || job.status === 'failed') {
      return false;
    }
    
    // Remove from queue if pending
    const queueIndex = this.queue.findIndex(j => j.id === jobId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
    }
    
    // Remove from running if active
    if (this.runningJobs.has(jobId)) {
      this.runningJobs.delete(jobId);
    }
    
    job.status = 'cancelled';
    job.updatedAt = new Date();
    
    this.emit('job_cancelled', { jobId, timestamp: new Date() });
    this.saveToPersistence();
    
    return true;
  }

  /**
   * Pause a running job
   */
  pauseJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') return false;
    
    job.status = 'paused';
    job.updatedAt = new Date();
    
    // Keep in runningJobs but move back to queue
    const queueIndex = this.queue.findIndex(j => j.id === jobId);
    if (queueIndex === -1) {
      this.queue.unshift(job);
    }
    
    this.emit('job_paused', { jobId, timestamp: new Date() });
    this.saveToPersistence();
    
    return true;
  }

  /**
   * Resume a paused job
   */
  resumeJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'paused') return false;
    
    job.status = 'queued';
    job.updatedAt = new Date();
    
    const queueIndex = this.queue.findIndex(j => j.id === jobId);
    if (queueIndex === -1) {
      this.queue.push(job);
    }
    
    this.emit('job_resumed', { jobId, timestamp: new Date() });
    this.scheduleProcessing();
    
    return true;
  }

  /**
   * Query jobs with filters
   */
  queryJobs(params: QueryParams & PaginationParams): PaginatedResult<JobConfig> {
    let filtered = Array.from(this.jobs.values());
    
    // Apply filters
    if (params.status && params.status.length > 0) {
      filtered = filtered.filter(job => params.status!.includes(job.status));
    }
    
    if (params.priority && params.priority.length > 0) {
      filtered = filtered.filter(job => params.priority!.includes(job.priority));
    }
    
    if (params.tags && params.tags.length > 0) {
      filtered = filtered.filter(job => 
        job.tags?.some(tag => params.tags!.includes(tag))
      );
    }
    
    if (params.dateFrom) {
      filtered = filtered.filter(job => job.createdAt >= params.dateFrom!);
    }
    
    if (params.dateTo) {
      filtered = filtered.filter(job => job.createdAt <= params.dateTo!);
    }
    
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(job => 
        job.name.toLowerCase().includes(searchLower) ||
        job.tags?.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }
    
    // Sort
    const sortBy = params.sortBy ?? 'createdAt';
    const sortOrder = params.sortOrder ?? 'desc';
    
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'createdAt':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case 'updatedAt':
          comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
          break;
        case 'priority':
          const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
          comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
          break;
        case 'progress':
          comparison = a.progress - b.progress;
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    // Paginate
    const total = filtered.length;
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const totalPages = Math.ceil(total / pageSize);
    
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const items = filtered.slice(start, end);
    
    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

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
  } {
    const stats = {
      total: this.jobs.size,
      pending: 0,
      queued: 0,
      running: 0,
      paused: 0,
      completed: this.completedJobs.size,
      failed: this.failedJobs.size,
      cancelled: 0,
    };
    
    for (const job of this.jobs.values()) {
      switch (job.status) {
        case 'pending': stats.pending++; break;
        case 'queued': stats.queued++; break;
        case 'running': stats.running++; break;
        case 'paused': stats.paused++; break;
        case 'cancelled': stats.cancelled++; break;
      }
    }
    
    return stats;
  }

  /**
   * Clear completed and failed jobs
   */
  clearCompleted(olderThan?: Date): number {
    let cleared = 0;
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        if (!olderThan || job.updatedAt < olderThan) {
          this.jobs.delete(jobId);
          this.completedJobs.delete(jobId);
          this.failedJobs.delete(jobId);
          cleared++;
        }
      }
    }
    
    this.saveToPersistence();
    return cleared;
  }

  /**
   * Start processing queue
   */
  start(): void {
    this.scheduleProcessing();
  }

  /**
   * Stop processing queue
   */
  stop(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = undefined;
    }
    this.isProcessing = false;
  }

  private scheduleProcessing(): void {
    if (!this.isProcessing && this.queue.length > 0) {
      this.isProcessing = true;
      setImmediate(() => this.processQueue());
    }
  }

  private async processQueue(): Promise<void> {
    while (this.runningJobs.size < this.maxConcurrentJobs && this.queue.length > 0) {
      // Sort queue by priority
      this.sortQueueByPriority();
      
      const job = this.queue.shift();
      if (!job) break;
      
      // Start job
      job.status = 'running';
      job.updatedAt = new Date();
      this.runningJobs.set(job.id, job);
      
      const event: JobStartedEvent = {
        type: 'job_started',
        jobId: job.id,
        timestamp: new Date(),
        workerId: this.generateWorkerId(),
      };
      this.emit('job_started', event);
      this.emit('event', event);
      
      this.saveToPersistence();
      
      // Emit event for actual job execution (listener should handle execution)
      this.emit('execute_job', job);
    }
    
    this.isProcessing = this.runningJobs.size < this.maxConcurrentJobs && this.queue.length > 0;
  }

  private sortQueueByPriority(): void {
    const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
    
    this.queue.sort((a, b) => {
      // First by priority
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by creation time (FIFO)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateWorkerId(): string {
    return `worker_${Math.random().toString(36).substr(2, 8)}`;
  }

  private getCurrentStage(job: JobConfig): string {
    return job.metadata?.currentStage ?? 'initializing';
  }

  private saveToPersistence(): void {
    if (!this.enablePersistence || !this.persistencePath) return;
    
    // In a real implementation, this would serialize and save to disk/database
    // For now, we'll just emit an event
    this.emit('persistence_save', { timestamp: new Date(), jobCount: this.jobs.size });
  }

  private loadFromPersistence(): void {
    if (!this.persistencePath) return;
    
    // In a real implementation, this would load from disk/database
    // For now, we'll just emit an event
    this.emit('persistence_load', { timestamp: new Date() });
  }
}

export default JobManager;
