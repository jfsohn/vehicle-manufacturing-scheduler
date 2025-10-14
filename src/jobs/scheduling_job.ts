import { Job } from 'bullmq';
import { scheduleOrder } from '../scheduler/just_in_time_scheduler';
import { saveSchedule, getOrderWithInputs } from '../repository/schedule_repository';
import { JobStatus } from '../domain/types';

export interface SchedulingJobData {
  orderId: string;
  slackTolerancePercent?: number;
  priority?: number;
}

export async function processSchedulingJob(job: Job<SchedulingJobData>): Promise<JobStatus> {
  const { orderId, slackTolerancePercent = 5, priority = 0 } = job.data;
  
  try {
    // Update job status
    await job.updateProgress(10);
    
    // Get order data
    const { order, bom, parts } = await getOrderWithInputs(orderId);
    await job.updateProgress(30);
    
    // Run scheduling with slack tolerance
    const result = scheduleOrder({
      orderId,
      parts,
      bom: bom.map(b => ({ partId: b.partId, quantity: b.quantity })),
      slackTolerancePercent,
      priority
    });
    
    await job.updateProgress(70);
    
    // Save schedule
    await saveSchedule(result);
    await job.updateProgress(100);
    
    return {
      jobId: job.id!,
      orderId,
      status: 'COMPLETED',
      progress: 100,
      startedAt: new Date(job.timestamp),
      completedAt: new Date()
    };
    
  } catch (error) {
    return {
      jobId: job.id!,
      orderId,
      status: 'FAILED',
      progress: typeof job.progress === 'number' ? job.progress : 0,
      startedAt: new Date(job.timestamp),
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
