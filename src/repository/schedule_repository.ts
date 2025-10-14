import { getPrisma } from './prisma';
import { ScheduleResult } from '../domain/types';

export async function upsertMasterData(params: {
  workcenters: { id?: string; name: string }[];
  parts: { id?: string; name: string; leadTimeMins: number; workcenterName: string }[];
  vehicle: { sku: string; bom: { partName: string; quantity: number }[] };
}) {
  const prisma = getPrisma();
  // idempotent upserts by name/sku
  const wcByName: Record<string, string> = {};
  for (const wc of params.workcenters) {
    const rec = await prisma.workcenter.upsert({
      where: { name: wc.name },
      create: { name: wc.name },
      update: {},
    });
    wcByName[wc.name] = rec.id;
  }

  const partByName: Record<string, string> = {};
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

export async function createOrder(vehicleSku: string) {
  const prisma = getPrisma();
  const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { sku: vehicleSku } });
  return prisma.order.create({ data: { vehicleId: vehicle.id } });
}

export async function getOrderWithInputs(orderId: string) {
  const prisma = getPrisma();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: order.vehicleId } });
  const bom = await prisma.bomItem.findMany({ where: { vehicleId: vehicle.id } });
  const parts = await prisma.part.findMany({
    where: { id: { in: bom.map(b => b.partId) } },
  });
  return { order, vehicle, bom, parts };
}

export async function saveSchedule(result: ScheduleResult) {
  const prisma = getPrisma();
  await prisma.$transaction(async tx => {
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

export async function getSchedule(orderId: string) {
  const prisma = getPrisma();
  const schedules = await prisma.schedule.findMany({ where: { orderId }, orderBy: [{ startTime: 'asc' }] });
  
  // Convert to ScheduledUnit format with status
  return schedules.map(s => ({
    partId: s.partId,
    unitIndex: s.unitIndex,
    workcenterId: s.workcenterId,
    startTime: s.startTime,
    endTime: s.endTime,
    status: 'SCHEDULED' as const
  }));
}
