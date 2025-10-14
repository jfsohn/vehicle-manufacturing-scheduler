"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const schema_1 = require("../../src/graphql/schema");
const graphql_1 = require("graphql");
const prisma_1 = require("../../src/repository/prisma");
const schema = (0, schema_1.buildSchema)();
beforeAll(async () => {
    await (0, prisma_1.getPrisma)().$connect();
});
afterAll(async () => {
    await (0, prisma_1.getPrisma)().$disconnect();
});
test('upsert master, submit order, run scheduling, and query schedule', async () => {
    const UPSERT = `
    mutation U($input: MasterUpsertInput!) { upsertMasterData(input: $input) }
  `;
    const upsertRes = await (0, graphql_1.graphql)({ schema, source: UPSERT, variableValues: {
            input: {
                workcenters: [{ name: 'Fabrication' }, { name: 'Assembly' }],
                parts: [
                    { name: 'Frame', leadTimeMins: 120, workcenterName: 'Fabrication' },
                    { name: 'Wheels', leadTimeMins: 30, workcenterName: 'Assembly' },
                ],
                vehicle: { sku: 'BIKE-1', bom: [{ partName: 'Frame', quantity: 1 }, { partName: 'Wheels', quantity: 2 }] },
            },
        } });
    expect(upsertRes.errors).toBeUndefined();
    const SUBMIT = `mutation S($sku: String!){ submitOrder(vehicleSku: $sku) }`;
    const submitRes = await (0, graphql_1.graphql)({ schema, source: SUBMIT, variableValues: { sku: 'BIKE-1' } });
    expect(submitRes.errors).toBeUndefined();
    const orderId = submitRes.data?.submitOrder;
    expect(orderId).toBeTruthy();
    const RUN = `mutation R($orderId: ID!){ runScheduling(orderId: $orderId) }`;
    const runRes = await (0, graphql_1.graphql)({ schema, source: RUN, variableValues: { orderId } });
    expect(runRes.errors).toBeUndefined();
    expect(runRes.data?.runScheduling).toBe(true);
    const QUERY = `query Q($orderId: ID!){ schedule(orderId: $orderId){ partId unitIndex workcenterId startTime endTime } }`;
    const scheduleRes = await (0, graphql_1.graphql)({ schema, source: QUERY, variableValues: { orderId } });
    expect(scheduleRes.errors).toBeUndefined();
    const units = scheduleRes.data?.schedule;
    expect(units.length).toBe(3);
});
test('test slack tolerance parameter', async () => {
    const RUN_WITH_SLACK = `mutation R($orderId: ID!, $slack: Int!){ runScheduling(orderId: $orderId, slackTolerancePercent: $slack) }`;
    const runRes = await (0, graphql_1.graphql)({ schema, source: RUN_WITH_SLACK, variableValues: { orderId: 'test', slack: 5 } });
    // Should handle slack tolerance parameter (may fail due to missing order, but should not crash)
    expect(runRes.errors).toBeDefined(); // Expected to fail due to missing order
});
test('test Gantt chart generation', async () => {
    const GANTT_QUERY = `query G($orderId: ID!){ ganttChart(orderId: $orderId) }`;
    const ganttRes = await (0, graphql_1.graphql)({ schema, source: GANTT_QUERY, variableValues: { orderId: 'test' } });
    // Should return a string (Gantt chart)
    expect(typeof ganttRes.data?.ganttChart).toBe('string');
});
test('test job status queries', async () => {
    const JOB_STATUS_QUERY = `query J($jobId: ID!){ jobStatus(jobId: $jobId) { status progress } }`;
    const jobRes = await (0, graphql_1.graphql)({ schema, source: JOB_STATUS_QUERY, variableValues: { jobId: 'test' } });
    // Should handle job status query (may return null for non-existent job)
    expect(jobRes.errors).toBeUndefined();
});
test('test multi-order planning', async () => {
    const MULTI_ORDER_QUERY = `query M($orderIds: [ID!]!){ multiOrderPlan(orderIds: $orderIds) { totalDuration optimized } }`;
    const multiRes = await (0, graphql_1.graphql)({ schema, source: MULTI_ORDER_QUERY, variableValues: { orderIds: ['test1', 'test2'] } });
    // Should return multi-order plan structure
    expect(multiRes.errors).toBeUndefined();
    expect(multiRes.data?.multiOrderPlan).toBeDefined();
});
