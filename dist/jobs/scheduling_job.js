"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSchedulingJob = processSchedulingJob;
const just_in_time_scheduler_1 = require("../scheduler/just_in_time_scheduler");
const schedule_repository_1 = require("../repository/schedule_repository");
async function processSchedulingJob(job) {
    const { orderId, slackTolerancePercent = 5, priority = 0 } = job.data;
    try {
        // Update job status
        await job.updateProgress(10);
        // Get order data
        const { order, bom, parts } = await (0, schedule_repository_1.getOrderWithInputs)(orderId);
        await job.updateProgress(30);
        // Run scheduling with slack tolerance
        const result = (0, just_in_time_scheduler_1.scheduleOrder)({
            orderId,
            parts,
            bom: bom.map(b => ({ partId: b.partId, quantity: b.quantity })),
            slackTolerancePercent,
            priority
        });
        await job.updateProgress(70);
        // Save schedule
        await (0, schedule_repository_1.saveSchedule)(result);
        await job.updateProgress(100);
        return {
            jobId: job.id,
            orderId,
            status: 'COMPLETED',
            progress: 100,
            startedAt: new Date(job.timestamp),
            completedAt: new Date()
        };
    }
    catch (error) {
        return {
            jobId: job.id,
            orderId,
            status: 'FAILED',
            progress: typeof job.progress === 'number' ? job.progress : 0,
            startedAt: new Date(job.timestamp),
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
