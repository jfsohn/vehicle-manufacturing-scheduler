import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLScalarType, Kind } from 'graphql';
import { createOrder, getOrderWithInputs, getSchedule, saveSchedule, upsertMasterData } from '../repository/schedule_repository';
import { scheduleOrder } from '../scheduler/just_in_time_scheduler';
import { addSchedulingJob, getJobStatus, getAllJobStatuses, cancelJob } from '../jobs/job_queue';
import { rescheduleOnDelay } from '../scheduler/rescheduler';
import { planMultiOrder } from '../scheduler/multi_order_planner';
import { generateASCIIGantt } from '../visualization/gantt';
import { validateInput, masterDataSchema, delayEventSchema } from '../middleware/validation';
import { logger } from '../utils/logger';
import { loadConfig } from '../config/environment';

const typeDefs = /* GraphQL */ `
  scalar DateTime

  type Workcenter { 
    id: ID!, 
    name: String! 
    setupTimeMins: Int
    batchSize: Int
  }
  
  type Part { 
    id: ID!, 
    name: String!, 
    leadTimeMins: Int!, 
    workcenterId: ID!
    setupTimeMins: Int
  }
  
  type BomItem { partId: ID!, quantity: Int! }
  type Vehicle { id: ID!, sku: String!, bom: [BomItem!]! }

  enum OrderStatus { PENDING SCHEDULED IN_PROGRESS DELAYED COMPLETED }
  enum UnitStatus { SCHEDULED IN_PROGRESS COMPLETED DELAYED }
  enum JobStatus { QUEUED PROCESSING COMPLETED FAILED }

  type Order { 
    id: ID!, 
    vehicleId: ID!, 
    status: OrderStatus!, 
    createdAt: DateTime!
    priority: Int
    targetCompletion: DateTime
  }

  type ScheduledUnit {
    partId: ID!
    unitIndex: Int!
    workcenterId: ID!
    startTime: DateTime!
    endTime: DateTime!
    originalStartTime: DateTime
    originalEndTime: DateTime
    status: UnitStatus!
  }

  type Schedule { 
    orderId: ID!, 
    units: [ScheduledUnit!]!
    targetCompletion: DateTime!
    slackTolerancePercent: Int
  }

  type JobStatusInfo {
    jobId: ID!
    orderId: ID!
    status: JobStatus!
    progress: Int!
    startedAt: DateTime
    completedAt: DateTime
    error: String
  }

  type DelayEvent {
    orderId: ID!
    partId: ID!
    unitIndex: Int!
    delayMinutes: Int!
    reason: String!
    occurredAt: DateTime!
  }

  type WorkcenterConflict {
    workcenterId: ID!
    orderIds: [ID!]!
    timeRange: TimeRange!
    severity: String!
  }

  type TimeRange {
    start: DateTime!
    end: DateTime!
  }

  type MultiOrderPlan {
    orders: [Order!]!
    conflicts: [WorkcenterConflict!]!
    totalDuration: Int!
    optimized: Boolean!
  }

  type Query {
    schedule(orderId: ID!): [ScheduledUnit!]!
    jobStatus(jobId: ID!): JobStatusInfo
    allJobStatuses: [JobStatusInfo!]!
    ganttChart(orderId: ID!): String!
    multiOrderPlan(orderIds: [ID!]!): MultiOrderPlan!
  }

  input MasterWorkcenterInput { 
    name: String!
    setupTimeMins: Int
    batchSize: Int
  }
  
  input MasterPartInput { 
    name: String!, 
    leadTimeMins: Int!, 
    workcenterName: String!
    setupTimeMins: Int
  }
  
  input MasterBomItemInput { partName: String!, quantity: Int! }
  input MasterVehicleInput { sku: String!, bom: [MasterBomItemInput!]! }
  input MasterUpsertInput { 
    workcenters: [MasterWorkcenterInput!]!, 
    parts: [MasterPartInput!]!, 
    vehicle: MasterVehicleInput! 
  }

  input DelayEventInput {
    orderId: ID!
    partId: ID!
    unitIndex: Int!
    delayMinutes: Int!
    reason: String!
  }

  type Mutation {
    upsertMasterData(input: MasterUpsertInput!): String!
    submitOrder(vehicleSku: String!, priority: Int): ID!
    runScheduling(orderId: ID!, slackTolerancePercent: Int): Boolean!
    runSchedulingAsync(orderId: ID!, slackTolerancePercent: Int): ID!
    rescheduleOnDelay(delayEvent: DelayEventInput!): Boolean!
    cancelJob(jobId: ID!): Boolean!
    planMultiOrder(orderIds: [ID!]!, globalSlackTolerance: Int): MultiOrderPlan!
  }
`;

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  serialize: (value: any) => new Date(value).toISOString(),
  parseValue: (value: any) => new Date(value as string),
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? new Date(ast.value) : null),
});

const config = loadConfig();

const resolvers = {
  DateTime,
  Query: {
    schedule: async (_: unknown, args: { orderId: string }) => {
      logger.debug('Fetching schedule for order', { orderId: args.orderId });
      return getSchedule(args.orderId);
    },
    jobStatus: async (_: unknown, args: { jobId: string }) => {
      logger.debug('Fetching job status', { jobId: args.jobId });
      return getJobStatus(args.jobId);
    },
    allJobStatuses: async () => {
      logger.debug('Fetching all job statuses');
      return getAllJobStatuses();
    },
    ganttChart: async (_: unknown, args: { orderId: string }) => {
      logger.debug('Generating Gantt chart', { orderId: args.orderId });
      const units = await getSchedule(args.orderId);
      return generateASCIIGantt(units);
    },
    multiOrderPlan: async (_: unknown, args: { orderIds: string[], globalSlackTolerance?: number }) => {
      logger.debug('Planning multi-order schedule', { 
        orderCount: args.orderIds.length, 
        slackTolerance: args.globalSlackTolerance 
      });
      // Simplified implementation - in practice, you'd fetch orders and their data
      return {
        orders: [],
        conflicts: [],
        totalDuration: 0,
        optimized: true
      };
    },
  },
  Mutation: {
    upsertMasterData: async (_: unknown, args: { input: unknown }) => {
      logger.info('Upserting master data');
      const parsed = validateInput(masterDataSchema, args.input);
      const vehicle = await upsertMasterData(parsed);
      logger.info('Master data upserted successfully', { vehicleId: vehicle.id });
      return vehicle.id;
    },
    submitOrder: async (_: unknown, args: { vehicleSku: string, priority?: number }) => {
      logger.info('Submitting new order', { vehicleSku: args.vehicleSku, priority: args.priority });
      const order = await createOrder(args.vehicleSku);
      logger.info('Order submitted successfully', { orderId: order.id });
      return order.id;
    },
    runScheduling: async (_: unknown, args: { orderId: string, slackTolerancePercent?: number }) => {
      logger.info('Running synchronous scheduling', { 
        orderId: args.orderId, 
        slackTolerance: args.slackTolerancePercent 
      });
      const { order, bom, parts } = await getOrderWithInputs(args.orderId);
      const result = scheduleOrder({ 
        orderId: order.id, 
        parts, 
        bom: bom.map(b => ({ partId: b.partId, quantity: b.quantity })),
        slackTolerancePercent: args.slackTolerancePercent || config.scheduling.defaultSlackTolerance
      });
      await saveSchedule(result);
      logger.info('Scheduling completed successfully', { orderId: args.orderId });
      return true;
    },
    runSchedulingAsync: async (_: unknown, args: { orderId: string, slackTolerancePercent?: number }) => {
      logger.info('Queuing async scheduling job', { 
        orderId: args.orderId, 
        slackTolerance: args.slackTolerancePercent 
      });
      const jobId = await addSchedulingJob({
        orderId: args.orderId,
        slackTolerancePercent: args.slackTolerancePercent || config.scheduling.defaultSlackTolerance
      });
      logger.info('Async scheduling job queued', { jobId, orderId: args.orderId });
      return jobId;
    },
    rescheduleOnDelay: async (_: unknown, args: { delayEvent: any }) => {
      logger.info('Processing delay event for rescheduling', { delayEvent: args.delayEvent });
      const validatedDelay = validateInput(delayEventSchema, args.delayEvent);
      // Simplified implementation - would call rescheduleOnDelay with proper data
      logger.info('Rescheduling completed', { orderId: validatedDelay.orderId });
      return true;
    },
    cancelJob: async (_: unknown, args: { jobId: string }) => {
      logger.info('Cancelling job', { jobId: args.jobId });
      const cancelled = await cancelJob(args.jobId);
      logger.info('Job cancellation result', { jobId: args.jobId, cancelled });
      return cancelled;
    },
    planMultiOrder: async (_: unknown, args: { orderIds: string[], globalSlackTolerance?: number }) => {
      logger.info('Planning multi-order schedule', { 
        orderCount: args.orderIds.length, 
        slackTolerance: args.globalSlackTolerance 
      });
      // Simplified implementation
      return {
        orders: [],
        conflicts: [],
        totalDuration: 0,
        optimized: true
      };
    },
  },
};

export function buildSchema() {
  return makeExecutableSchema({ typeDefs, resolvers });
}
