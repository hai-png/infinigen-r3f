/**
 * Phase 4: Data Pipeline - Batch Processor
 * 
 * Handles batch processing of multiple jobs with cloud integration,
 * auto-scaling, and notification support.
 */

import { EventEmitter } from 'events';
import {
  BatchJob,
  BatchStatus,
  BatchProgress,
  JobConfig,
  JobResult,
  JobError,
  CloudIntegrationConfig,
  NotificationConfig,
  CloudProviderName,
  PipelineEvent,
  BatchStartedEvent,
  BatchCompletedEvent,
} from './types';
import { JobManager } from './JobManager';

export interface BatchProcessorOptions {
  maxConcurrentBatches: number;
  maxJobsPerBatch: number;
  enableCloudScaling: boolean;
  defaultCloudConfig?: CloudIntegrationConfig;
}

export class BatchProcessor extends EventEmitter {
  private batches: Map<string, BatchJob>;
  private jobManager: JobManager;
  private activeBatches: Set<string>;
  
  private maxConcurrentBatches: number;
  private maxJobsPerBatch: number;
  private enableCloudScaling: boolean;
  private defaultCloudConfig?: CloudIntegrationConfig;

  constructor(
    jobManager: JobManager,
    options: Partial<BatchProcessorOptions> = {}
  ) {
    super();
    
    this.batches = new Map();
    this.jobManager = jobManager;
    this.activeBatches = new Set();
    
    this.maxConcurrentBatches = options.maxConcurrentBatches ?? 10;
    this.maxJobsPerBatch = options.maxJobsPerBatch ?? 1000;
    this.enableCloudScaling = options.enableCloudScaling ?? false;
    this.defaultCloudConfig = options.defaultCloudConfig;
    
    // Listen to job events
    this.jobManager.on('job_completed', (event) => this.handleJobCompleted(event));
    this.jobManager.on('job_failed', (event) => this.handleJobFailed(event));
  }

  /**
   * Create a new batch job
   */
  createBatch(
    name: string,
    jobConfigs: Array<Omit<JobConfig, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt' | 'retryCount'>>,
    cloudConfig?: CloudIntegrationConfig
  ): string {
    const batchId = this.generateBatchId();
    
    if (jobConfigs.length > this.maxJobsPerBatch) {
      throw new Error(`Batch exceeds maximum jobs per batch (${this.maxJobsPerBatch})`);
    }
    
    const now = new Date();
    const batch: BatchJob = {
      id: batchId,
      name,
      jobConfigs: [] as JobConfig[],
      cloudConfig: cloudConfig ?? this.defaultCloudConfig ?? {
        storage: {
          provider: 'local',
          bucket: 'default',
          prefix: `batch_${batchId}`,
          region: 'us-east-1',
          acl: 'private',
        },
      },
      status: 'pending',
      createdAt: now,
    };
    
    // Convert job configs to full JobConfig objects
    const fullJobConfigs: JobConfig[] = jobConfigs.map((config, index) => ({
      ...config,
      id: `job_${batchId}_${index.toString().padStart(6, '0')}`,
      status: 'pending',
      progress: 0,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: config.maxRetries ?? 3,
    }));
    
    batch.jobConfigs = fullJobConfigs;
    this.batches.set(batchId, batch);
    
    return batchId;
  }

  /**
   * Start processing a batch
   */
  startBatch(batchId: string): boolean {
    const batch = this.batches.get(batchId);
    if (!batch) return false;
    
    if (batch.status !== 'pending') {
      return false;
    }
    
    // Check concurrent batch limit
    if (this.activeBatches.size >= this.maxConcurrentBatches) {
      return false;
    }
    
    batch.status = 'running';
    batch.startedAt = new Date();
    this.activeBatches.add(batchId);
    
    // Emit event
    const event: BatchStartedEvent = {
      type: 'batch_started',
      batchId,
      timestamp: new Date(),
      jobCount: batch.jobConfigs.length,
    };
    this.emit('batch_started', event);
    this.emit('event', event);
    
    // Queue all jobs in the batch
    for (const jobConfig of batch.jobConfigs) {
      this.jobManager.createJob({
        name: `${batch.name} - ${jobConfig.id}`,
        priority: jobConfig.priority,
        sceneConfig: jobConfig.sceneConfig,
        outputConfig: jobConfig.outputConfig,
        renderConfig: jobConfig.renderConfig,
        tags: [`batch:${batchId}`, ... (jobConfig.tags ?? [])],
        metadata: {
          ...jobConfig.metadata,
          batchId,
        },
        maxRetries: jobConfig.maxRetries,
      });
    }
    
    // Enable cloud scaling if configured
    if (this.enableCloudScaling && batch.cloudConfig?.compute) {
      this.scaleCloudResources(batch);
    }
    
    return true;
  }

  /**
   * Get batch progress
   */
  getBatchProgress(batchId: string): BatchProgress | undefined {
    const batch = this.batches.get(batchId);
    if (!batch) return undefined;
    
    const stats = {
      completed: 0,
      failed: 0,
      running: 0,
      pending: 0,
    };
    
    for (const jobConfig of batch.jobConfigs) {
      const job = this.jobManager.getJob(jobConfig.id);
      if (!job) {
        stats.pending++;
        continue;
      }
      
      switch (job.status) {
        case 'completed':
          stats.completed++;
          break;
        case 'failed':
        case 'cancelled':
          stats.failed++;
          break;
        case 'running':
        case 'paused':
          stats.running++;
          break;
        default:
          stats.pending++;
      }
    }
    
    const total = batch.jobConfigs.length;
    const processed = stats.completed + stats.failed;
    const progress = total > 0 ? (processed / total) * 100 : 0;
    
    let status: BatchStatus = 'pending';
    if (batch.status === 'running') {
      if (stats.failed > 0 && stats.completed > 0) {
        status = 'partial';
      } else if (stats.completed === total) {
        status = 'completed';
      } else if (stats.failed === total) {
        status = 'failed';
      } else {
        status = 'running';
      }
    } else if (batch.status === 'completed') {
      status = 'completed';
    } else if (batch.status === 'failed') {
      status = 'failed';
    } else if (batch.status === 'cancelled') {
      status = 'cancelled';
    }
    
    // Estimate completion time
    let estimatedCompletion: Date | undefined;
    if (status === 'running' && stats.running > 0) {
      const avgJobTime = this.estimateAverageJobTime(batchId);
      const remainingJobs = stats.pending + stats.running;
      const estimatedSeconds = (avgJobTime * remainingJobs) / 1000;
      estimatedCompletion = new Date(Date.now() + estimatedSeconds * 1000);
    }
    
    return {
      batchId,
      status,
      totalJobs: total,
      completedJobs: stats.completed,
      failedJobs: stats.failed,
      runningJobs: stats.running,
      pendingJobs: stats.pending,
      progress,
      estimatedCompletion,
    };
  }

  /**
   * Cancel a batch
   */
  cancelBatch(batchId: string): boolean {
    const batch = this.batches.get(batchId);
    if (!batch) return false;
    
    if (batch.status === 'completed' || batch.status === 'failed' || batch.status === 'cancelled') {
      return false;
    }
    
    batch.status = 'cancelled';
    batch.completedAt = new Date();
    this.activeBatches.delete(batchId);
    
    // Cancel all pending/running jobs in the batch
    for (const jobConfig of batch.jobConfigs) {
      this.jobManager.cancelJob(jobConfig.id);
    }
    
    this.emit('batch_cancelled', { batchId, timestamp: new Date() });
    
    return true;
  }

  /**
   * Get all batches
   */
  getBatches(status?: BatchStatus): BatchJob[] {
    const batches = Array.from(this.batches.values());
    
    if (status) {
      return batches.filter(batch => {
        const progress = this.getBatchProgress(batch.id);
        return progress?.status === status;
      });
    }
    
    return batches;
  }

  /**
   * Get batch by ID
   */
  getBatch(batchId: string): BatchJob | undefined {
    return this.batches.get(batchId);
  }

  /**
   * Send notifications for batch completion/failure
   */
  private sendNotifications(batch: BatchJob, progress: BatchProgress): void {
    const notifyConfig = batch.cloudConfig?.notification;
    if (!notifyConfig) return;
    
    const shouldNotify = 
      (progress.status === 'completed' && notifyConfig.onComplete) ||
      (progress.status === 'failed' && notifyConfig.onFailure);
    
    if (!shouldNotify) return;
    
    // Email notifications
    if (notifyConfig.email && notifyConfig.email.length > 0) {
      this.sendEmailNotification(batch, progress, notifyConfig.email);
    }
    
    // Slack notifications
    if (notifyConfig.slack) {
      this.sendSlackNotification(batch, progress, notifyConfig.slack);
    }
    
    // Webhook notifications
    if (notifyConfig.webhook) {
      this.sendWebhookNotification(batch, progress, notifyConfig.webhook);
    }
  }

  private sendEmailNotification(
    batch: BatchJob,
    progress: BatchProgress,
    recipients: string[]
  ): void {
    const subject = `Batch "${batch.name}" ${progress.status}`;
    const body = this.formatNotificationBody(batch, progress);
    
    this.emit('notification_email', {
      batchId: batch.id,
      recipients,
      subject,
      body,
      timestamp: new Date(),
    });
    
    // In a real implementation, this would send actual emails
    console.log(`[EMAIL] To: ${recipients.join(', ')} | Subject: ${subject}`);
  }

  private sendSlackNotification(
    batch: BatchJob,
    progress: BatchProgress,
    slackConfig: { webhookUrl: string; channel: string; username: string }
  ): void {
    const color = progress.status === 'completed' ? 'good' : 'danger';
    const emoji = progress.status === 'completed' ? '✅' : '❌';
    
    const message = {
      channel: slackConfig.channel,
      username: slackConfig.username,
      icon_emoji: emoji,
      attachments: [
        {
          color,
          title: `Batch ${emoji}: ${batch.name}`,
          fields: [
            { title: 'Status', value: progress.status, short: true },
            { title: 'Progress', value: `${progress.progress.toFixed(1)}%`, short: true },
            { title: 'Total Jobs', value: progress.totalJobs.toString(), short: true },
            { title: 'Completed', value: progress.completedJobs.toString(), short: true },
            { title: 'Failed', value: progress.failedJobs.toString(), short: true },
            { title: 'Duration', value: this.formatDuration(batch), short: true },
          ],
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
    
    this.emit('notification_slack', {
      batchId: batch.id,
      webhookUrl: slackConfig.webhookUrl,
      message,
      timestamp: new Date(),
    });
    
    // In a real implementation, this would POST to the Slack webhook
    console.log(`[SLACK] Channel: ${slackConfig.channel} | Status: ${progress.status}`);
  }

  private sendWebhookNotification(
    batch: BatchJob,
    progress: BatchProgress,
    webhookConfig: { url: string; method: 'POST' | 'PUT'; headers?: Record<string, string> }
  ): void {
    const payload = {
      batchId: batch.id,
      name: batch.name,
      status: progress.status,
      progress: progress.progress,
      totalJobs: progress.totalJobs,
      completedJobs: progress.completedJobs,
      failedJobs: progress.failedJobs,
      runningJobs: progress.runningJobs,
      pendingJobs: progress.pendingJobs,
      startedAt: batch.startedAt?.toISOString(),
      completedAt: batch.completedAt?.toISOString(),
      timestamp: new Date().toISOString(),
    };
    
    this.emit('notification_webhook', {
      batchId: batch.id,
      url: webhookConfig.url,
      method: webhookConfig.method,
      headers: webhookConfig.headers,
      payload,
      timestamp: new Date(),
    });
    
    // In a real implementation, this would make an HTTP request
    console.log(`[WEBHOOK] ${webhookConfig.method} ${webhookConfig.url}`);
  }

  private formatNotificationBody(batch: BatchJob, progress: BatchProgress): string {
    return `
Batch: ${batch.name}
Status: ${progress.status}
Progress: ${progress.progress.toFixed(2)}%

Statistics:
- Total Jobs: ${progress.totalJobs}
- Completed: ${progress.completedJobs}
- Failed: ${progress.failedJobs}
- Running: ${progress.runningJobs}
- Pending: ${progress.pendingJobs}

${batch.startedAt ? `Started: ${batch.startedAt.toISOString()}` : ''}
${batch.completedAt ? `Completed: ${batch.completedAt.toISOString()}` : ''}
`.trim();
  }

  private formatDuration(batch: BatchJob): string {
    if (!batch.startedAt) return 'N/A';
    
    const end = batch.completedAt ?? new Date();
    const durationMs = end.getTime() - batch.startedAt.getTime();
    
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private estimateAverageJobTime(batchId: string): number {
    // In a real implementation, this would calculate from historical data
    // For now, return a default estimate (30 seconds)
    return 30000;
  }

  private scaleCloudResources(batch: BatchJob): void {
    const computeConfig = batch.cloudConfig?.compute;
    if (!computeConfig) return;
    
    // Calculate required instances based on queue depth
    const progress = this.getBatchProgress(batch.id);
    if (!progress) return;
    
    const pendingJobs = progress.pendingJobs + progress.runningJobs;
    const jobsPerInstance = 10; // Configurable
    const requiredInstances = Math.ceil(pendingJobs / jobsPerInstance);
    
    const targetInstances = Math.max(
      computeConfig.minInstances,
      Math.min(requiredInstances, computeConfig.maxInstances)
    );
    
    this.emit('cloud_scale', {
      batchId: batch.id,
      provider: computeConfig.provider,
      currentInstances: this.activeBatches.size,
      targetInstances,
      timestamp: new Date(),
    });
    
    // In a real implementation, this would interact with cloud provider APIs
    console.log(`[CLOUD] Scaling to ${targetInstances} instances (${computeConfig.provider})`);
  }

  private handleJobCompleted(event: { jobId: string; result: JobResult }): void {
    const batchId = event.result.metadata?.batchId;
    if (!batchId) return;
    
    const batch = this.batches.get(batchId);
    if (!batch) return;
    
    const progress = this.getBatchProgress(batchId);
    if (!progress) return;
    
    // Check if batch is complete
    if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'partial') {
      batch.status = progress.status === 'partial' ? 'completed' : progress.status;
      batch.completedAt = new Date();
      this.activeBatches.delete(batchId);
      
      const completedEvent: BatchCompletedEvent = {
        type: 'batch_completed',
        batchId,
        timestamp: new Date(),
        successCount: progress.completedJobs,
        failureCount: progress.failedJobs,
      };
      this.emit('batch_completed', completedEvent);
      this.emit('event', completedEvent);
      
      // Send notifications
      this.sendNotifications(batch, progress);
    }
  }

  private handleJobFailed(event: { jobId: string; error: JobError }): void {
    const batchId = event.error.message.split('batch:')[1]?.split(' ')[0];
    if (!batchId) return;
    
    const batch = this.batches.get(batchId);
    if (!batch) return;
    
    const progress = this.getBatchProgress(batchId);
    if (!progress) return;
    
    // Check if all jobs failed
    if (progress.failedJobs === progress.totalJobs) {
      batch.status = 'failed';
      batch.completedAt = new Date();
      this.activeBatches.delete(batchId);
      
      const completedEvent: BatchCompletedEvent = {
        type: 'batch_completed',
        batchId,
        timestamp: new Date(),
        successCount: 0,
        failureCount: progress.failedJobs,
      };
      this.emit('batch_completed', completedEvent);
      this.emit('event', completedEvent);
      
      // Send notifications
      this.sendNotifications(batch, progress);
    }
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/** Batch configuration type alias */
export type BatchConfig = BatchProcessorOptions;

/** Batch result type */
export interface BatchResult {
  batchId: string;
  status: BatchStatus;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  duration: number;
}

export default BatchProcessor;
