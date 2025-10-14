"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertMasterData = upsertMasterData;
exports.createOrder = createOrder;
exports.getOrderWithInputs = getOrderWithInputs;
exports.saveSchedule = saveSchedule;
exports.getSchedule = getSchedule;
const prisma_1 = require("./prisma");
async function upsertMasterData(params) {
    const prisma = (0, prisma_1.getPrisma)();
    // idempotent upserts by name/sku
    const wcByName = {};
    for (const wc of params.workcenters) {
        const rec = await prisma.workcenter.upsert({
            where: { name: wc.name },
            create: { name: wc.name },
            update: {},
        });
        wcByName[wc.name] = rec.id;
    }
    const partByName = {};
    for (const p of params.parts) {
        const workcenterId = wcByName[p.workcenterName];
        const rec = await prisma.part.upsert({
            where: { name_workcenterId: { name: p.name, workcenterId } },
            create: { name: p.name, leadTimeMins: p.leadTimeMins, workcenterId },
            update: { leadTimeMins: p.leadTimeMins, workcenterId },
        });
        partByName[p.name] = rec.id;
    }
    const vehicle = await prisma.vehicle.upsert({
        where: { sku: params.vehicle.sku },
        create: { sku: params.vehicle.sku },
        update: {},
    });
    // reset BOM for vehicle
    await prisma.bomItem.deleteMany({ where: { vehicleId: vehicle.id } });
    for (const item of params.vehicle.bom) {
        const partId = partByName[item.partName];
        await prisma.bomItem.create({ data: { vehicleId: vehicle.id, partId, quantity: item.quantity } });
    }
    return vehicle;
}
async function createOrder(vehicleSku) {
    const prisma = (0, prisma_1.getPrisma)();
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { sku: vehicleSku } });
    return prisma.order.create({ data: { vehicleId: vehicle.id } });
}
async function getOrderWithInputs(orderId) {
    const prisma = (0, prisma_1.getPrisma)();
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: order.vehicleId } });
    const bom = await prisma.bomItem.findMany({ where: { vehicleId: vehicle.id } });
    const parts = await prisma.part.findMany({
        where: { id: { in: bom.map(b => b.partId) } },
    });
    return { order, vehicle, bom, parts };
}
async function saveSchedule(result) {
    const prisma = (0, prisma_1.getPrisma)();
    await prisma.$transaction(async (tx) => {
        await tx.schedule.deleteMany({ where: { orderId: result.orderId } });
        for (const u of result.units) {
            await tx.schedule.create({
                data: {
                    orderId: result.orderId,
                    partId: u.partId,
                    unitIndex: u.unitIndex,
                    startTime: u.startTime,
                    endTime: u.endTime,
                    workcenterId: u.workcenterId,
                },
            });
        }
        await tx.order.update({ where: { id: result.orderId }, data: { status: 'SCHEDULED' } });
    });
}
async function getSchedule(orderId) {
    const prisma = (0, prisma_1.getPrisma)();
    const schedules = await prisma.schedule.findMany({ where: { orderId }, orderBy: [{ startTime: 'asc' }] });
    // Convert to ScheduledUnit format with status
    return schedules.map(s => ({
        partId: s.partId,
        unitIndex: s.unitIndex,
        workcenterId: s.workcenterId,
        startTime: s.startTime,
        endTime: s.endTime,
        status: 'SCHEDULED'
    }));
}
