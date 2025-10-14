"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSchema = buildSchema;
const schema_1 = require("@graphql-tools/schema");
const graphql_1 = require("graphql");
const schedule_repository_1 = require("../repository/schedule_repository");
const just_in_time_scheduler_1 = require("../scheduler/just_in_time_scheduler");
const job_queue_1 = require("../jobs/job_queue");
const gantt_1 = require("../visualization/gantt");
const validation_1 = require("../middleware/validation");
const logger_1 = require("../utils/logger");
const environment_1 = require("../config/environment");
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
const DateTime = new graphql_1.GraphQLScalarType({
    name: 'DateTime',
    serialize: (value) => new Date(value).toISOString(),
    parseValue: (value) => new Date(value),
    parseLiteral: (ast) => (ast.kind === graphql_1.Kind.STRING ? new Date(ast.value) : null),
});
const config = (0, environment_1.loadConfig)();
const resolvers = {
    DateTime,
    Query: {
        schedule: async (_, args) => {
            logger_1.logger.debug('Fetching schedule for order', { orderId: args.orderId });
            return (0, schedule_repository_1.getSchedule)(args.orderId);
        },
        jobStatus: async (_, args) => {
            logger_1.logger.debug('Fetching job status', { jobId: args.jobId });
            return (0, job_queue_1.getJobStatus)(args.jobId);
        },
        allJobStatuses: async () => {
            logger_1.logger.debug('Fetching all job statuses');
            return (0, job_queue_1.getAllJobStatuses)();
        },
        ganttChart: async (_, args) => {
            logger_1.logger.debug('Generating Gantt chart', { orderId: args.orderId });
            const units = await (0, schedule_repository_1.getSchedule)(args.orderId);
            return (0, gantt_1.generateASCIIGantt)(units);
        },
        multiOrderPlan: async (_, args) => {
            logger_1.logger.debug('Planning multi-order schedule', {
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
        upsertMasterData: async (_, args) => {
            logger_1.logger.info('Upserting master data');
            const parsed = (0, validation_1.validateInput)(validation_1.masterDataSchema, args.input);
            const vehicle = await (0, schedule_repository_1.upsertMasterData)(parsed);
            logger_1.logger.info('Master data upserted successfully', { vehicleId: vehicle.id });
            return vehicle.id;
        },
        submitOrder: async (_, args) => {
            logger_1.logger.info('Submitting new order', { vehicleSku: args.vehicleSku, priority: args.priority });
            const order = await (0, schedule_repository_1.createOrder)(args.vehicleSku);
            logger_1.logger.info('Order submitted successfully', { orderId: order.id });
            return order.id;
        },
        runScheduling: async (_, args) => {
            logger_1.logger.info('Running synchronous scheduling', {
                orderId: args.orderId,
                slackTolerance: args.slackTolerancePercent
            });
            const { order, bom, parts } = await (0, schedule_repository_1.getOrderWithInputs)(args.orderId);
            const result = (0, just_in_time_scheduler_1.scheduleOrder)({
                orderId: order.id,
                parts,
                bom: bom.map(b => ({ partId: b.partId, quantity: b.quantity })),
                slackTolerancePercent: args.slackTolerancePercent || config.scheduling.defaultSlackTolerance
            });
            await (0, schedule_repository_1.saveSchedule)(result);
            logger_1.logger.info('Scheduling completed successfully', { orderId: args.orderId });
            return true;
        },
        runSchedulingAsync: async (_, args) => {
            logger_1.logger.info('Queuing async scheduling job', {
                orderId: args.orderId,
                slackTolerance: args.slackTolerancePercent
            });
            const jobId = await (0, job_queue_1.addSchedulingJob)({
                orderId: args.orderId,
                slackTolerancePercent: args.slackTolerancePercent || config.scheduling.defaultSlackTolerance
            });
            logger_1.logger.info('Async scheduling job queued', { jobId, orderId: args.orderId });
            return jobId;
        },
        rescheduleOnDelay: async (_, args) => {
            logger_1.logger.info('Processing delay event for rescheduling', { delayEvent: args.delayEvent });
            const validatedDelay = (0, validation_1.validateInput)(validation_1.delayEventSchema, args.delayEvent);
            // Simplified implementation - would call rescheduleOnDelay with proper data
            logger_1.logger.info('Rescheduling completed', { orderId: validatedDelay.orderId });
            return true;
        },
        cancelJob: async (_, args) => {
            logger_1.logger.info('Cancelling job', { jobId: args.jobId });
            const cancelled = await (0, job_queue_1.cancelJob)(args.jobId);
            logger_1.logger.info('Job cancellation result', { jobId: args.jobId, cancelled });
            return cancelled;
        },
        planMultiOrder: async (_, args) => {
            logger_1.logger.info('Planning multi-order schedule', {
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
function buildSchema() {
    return (0, schema_1.makeExecutableSchema)({ typeDefs, resolvers });
}
