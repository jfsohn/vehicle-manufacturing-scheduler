"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addSchedulingJob = addSchedulingJob;
exports.getJobStatus = getJobStatus;
exports.getAllJobStatuses = getAllJobStatuses;
exports.cancelJob = cancelJob;
const bullmq_1 = require("bullmq");
const ioredis_1 = require("ioredis");
const scheduling_job_1 = require("./scheduling_job");
const environment_1 = require("../config/environment");
const logger_1 = require("../utils/logger");
const errors_1 = require("../utils/errors");
const config = (0, environment_1.loadConfig)();
// Redis connection with error handling
let redis;
let schedulingQueue;
let schedulingWorker;
let isRedisAvailable = false;
// Initialize Redis components only when needed
async function initializeRedisComponents() {
    if (isRedisAvailable)
        return; // Already initialized
    try {
        redis = new ioredis_1.Redis({
            host: config.redis.host,
            port: config.redis.port,
            maxRetriesPerRequest: null, // Required for BullMQ
            enableReadyCheck: false,
            lazyConnect: true, // Don't connect immediately
        });
        // Test Redis connection
        await redis.ping();
        isRedisAvailable = true;
        logger_1.logger.info('Redis connection established');
        // Create queues only if Redis is available
        schedulingQueue = new bullmq_1.Queue('scheduling', {
            connection: redis,
            defaultJobOptions: {
                removeOnComplete: 10,
                removeOnFail: 5,
            },
        });
        // Create workers
        schedulingWorker = new bullmq_1.Worker('scheduling', async (job) => {
            logger_1.logger.info(`Processing scheduling job ${job.id} for order ${job.data.orderId}`);
            try {
                return await (0, scheduling_job_1.processSchedulingJob)(job);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger_1.logger.error(`Scheduling job ${job.id} failed`, { error: errorMessage, orderId: job.data.orderId });
                throw error;
            }
        }, {
            connection: redis,
            concurrency: config.scheduling.maxConcurrentJobs,
        });
        // Set up event listeners
        schedulingWorker.on('completed', (job, result) => {
            logger_1.logger.info(`Scheduling job ${job.id} completed successfully`);
            jobStatuses.set(job.id, result);
        });
        schedulingWorker.on('failed', (job, err) => {
            if (job) {
                logger_1.logger.error(`Scheduling job ${job.id} failed`, { error: err.message, orderId: job.data.orderId });
                jobStatuses.set(job.id, {
                    jobId: job.id,
                    orderId: job.data.orderId,
                    status: 'FAILED',
                    progress: typeof job.progress === 'number' ? job.progress : 0,
                    startedAt: new Date(job.timestamp),
                    error: err.message
                });
            }
        });
        schedulingWorker.on('active', (job) => {
            logger_1.logger.info(`Scheduling job ${job.id} started processing`);
            jobStatuses.set(job.id, {
                jobId: job.id,
                orderId: job.data.orderId,
                status: 'PROCESSING',
                progress: typeof job.progress === 'number' ? job.progress : 0,
                startedAt: new Date(job.timestamp)
            });
        });
        schedulingWorker.on('error', (err) => {
            logger_1.logger.error('Scheduling worker error', { error: err.message });
        });
    }
    catch (error) {
        logger_1.logger.warn('Redis not available, falling back to synchronous processing', { error: error instanceof Error ? error.message : 'Unknown error' });
        isRedisAvailable = false;
    }
}
// Job status tracking
const jobStatuses = new Map();
// Queue management functions
async function addSchedulingJob(data, options) {
    // Try to initialize Redis components if not already done
    if (!isRedisAvailable) {
        await initializeRedisComponents();
    }
    if (!isRedisAvailable || !schedulingQueue) {
        logger_1.logger.warn('Redis not available, cannot queue async job. Use synchronous scheduling instead.');
        throw new errors_1.JobQueueError('Redis not available for async job processing. Use runScheduling instead of runSchedulingAsync.');
    }
    try {
        logger_1.logger.info(`Adding scheduling job for order ${data.orderId}`, {
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
        jobStatuses.set(job.id, {
            jobId: job.id,
            orderId: data.orderId,
            status: 'QUEUED',
            progress: 0
        });
        logger_1.logger.info(`Scheduling job ${job.id} queued successfully`);
        return job.id;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.logger.error(`Failed to queue scheduling job for order ${data.orderId}`, { error: errorMessage });
        throw new errors_1.JobQueueError(`Failed to queue scheduling job: ${errorMessage}`, undefined, error instanceof Error ? error : new Error(errorMessage));
    }
}
function getJobStatus(jobId) {
    return jobStatuses.get(jobId);
}
async function getAllJobStatuses() {
    return Array.from(jobStatuses.values());
}
async function cancelJob(jobId) {
    if (!isRedisAvailable || !schedulingQueue) {
        logger_1.logger.warn('Redis not available, cannot cancel job');
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
