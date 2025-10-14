import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { processSchedulingJob, SchedulingJobData } from './scheduling_job';
import { JobStatus } from '../domain/types';
import { loadConfig } from '../config/environment';
import { logger } from '../utils/logger';
import { JobQueueError } from '../utils/errors';

const config = loadConfig();

// Redis connection with error handling
let redis: Redis | undefined;
let schedulingQueue: Queue<SchedulingJobData> | undefined;
let schedulingWorker: Worker<SchedulingJobData> | undefined;
let isRedisAvailable = false;

// Initialize Redis components only when needed
async function initializeRedisComponents() {
  if (isRedisAvailable) return; // Already initialized

  try {
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      lazyConnect: true, // Don't connect immediately
    });

    // Test Redis connection
    await redis.ping();
    isRedisAvailable = true;
    logger.info('Redis connection established');

    // Create queues only if Redis is available
    schedulingQueue = new Queue<SchedulingJobData>('scheduling', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    });

    // Create workers
    schedulingWorker = new Worker<SchedulingJobData>(
      'scheduling',
      async (job) => {
        logger.info(`Processing scheduling job ${job.id} for order ${job.data.orderId}`);
        try {
          return await processSchedulingJob(job);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Scheduling job ${job.id} failed`, { error: errorMessage, orderId: job.data.orderId });
          throw error;
        }
      },
      {
        connection: redis,
        concurrency: config.scheduling.maxConcurrentJobs,
      }
    );

    // Set up event listeners
    schedulingWorker.on('completed', (job: Job<SchedulingJobData>, result: JobStatus) => {
      logger.info(`Scheduling job ${job.id} completed successfully`);
      jobStatuses.set(job.id!, result);
    });

    schedulingWorker.on('failed', (job: Job<SchedulingJobData> | undefined, err: Error) => {
      if (job) {
        logger.error(`Scheduling job ${job.id} failed`, { error: err.message, orderId: job.data.orderId });
        jobStatuses.set(job.id!, {
          jobId: job.id!,
          orderId: job.data.orderId,
          status: 'FAILED',
          progress: typeof job.progress === 'number' ? job.progress : 0,
          startedAt: new Date(job.timestamp),
          error: err.message
        });
      }
    });

    schedulingWorker.on('active', (job: Job<SchedulingJobData>) => {
      logger.info(`Scheduling job ${job.id} started processing`);
      jobStatuses.set(job.id!, {
        jobId: job.id!,
        orderId: job.data.orderId,
        status: 'PROCESSING',
        progress: typeof job.progress === 'number' ? job.progress : 0,
        startedAt: new Date(job.timestamp)
      });
    });

    schedulingWorker.on('error', (err: Error) => {
      logger.error('Scheduling worker error', { error: err.message });
    });

  } catch (error) {
    logger.warn('Redis not available, falling back to synchronous processing', { error: error instanceof Error ? error.message : 'Unknown error' });
    isRedisAvailable = false;
  }
}

// Job status tracking
const jobStatuses = new Map<string, JobStatus>();

// Queue management functions
export async function addSchedulingJob(data: SchedulingJobData, options?: { priority?: number; delay?: number }): Promise<string> {
  // Try to initialize Redis components if not already done
  if (!isRedisAvailable) {
    await initializeRedisComponents();
  }

  if (!isRedisAvailable || !schedulingQueue) {
    logger.warn('Redis not available, cannot queue async job. Use synchronous scheduling instead.');
    throw new JobQueueError('Redis not available for async job processing. Use runScheduling instead of runSchedulingAsync.');
  }

  try {
    logger.info(`Adding scheduling job for order ${data.orderId}`, { 
      priority: options?.priority, 
      delay: options?.delay,
      slackTolerance: data.slackTolerancePercent 
    });
    
    const job = await schedulingQueue.add('schedule', data, {
      priority: options?.priority || 0,
      delay: options?.delay || 0,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
    
    jobStatuses.set(job.id!, {
      jobId: job.id!,
      orderId: data.orderId,
      status: 'QUEUED',
      progress: 0
    });
    
    logger.info(`Scheduling job ${job.id} queued successfully`);
    return job.id!;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to queue scheduling job for order ${data.orderId}`, { error: errorMessage });
    throw new JobQueueError(`Failed to queue scheduling job: ${errorMessage}`, undefined, error instanceof Error ? error : new Error(errorMessage));
  }
}

export function getJobStatus(jobId: string): JobStatus | undefined {
  return jobStatuses.get(jobId);
}

export async function getAllJobStatuses(): Promise<JobStatus[]> {
  return Array.from(jobStatuses.values());
}

export async function cancelJob(jobId: string): Promise<boolean> {
  if (!isRedisAvailable || !schedulingQueue) {
    logger.warn('Redis not available, cannot cancel job');
    return false;
  }

  const job = await schedulingQueue.getJob(jobId);
  if (job) {
    await job.remove();
    jobStatuses.delete(jobId);
    return true;
  }
  return false;
}

// Cleanup on shutdown
process.on('SIGINT', async () => {
  if (isRedisAvailable && schedulingWorker && schedulingQueue && redis) {
    await schedulingWorker.close();
    await schedulingQueue.close();
    await redis.quit();
  }
});
