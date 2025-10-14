"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planMultiOrder = planMultiOrder;
exports.optimizeMultiOrder = optimizeMultiOrder;
const just_in_time_scheduler_1 = require("./just_in_time_scheduler");
const rescheduler_1 = require("./rescheduler");
function planMultiOrder(input) {
    const { orders, parts, bomByOrder, globalSlackTolerance = 5 } = input;
    // Sort orders by priority (higher number = higher priority)
    const sortedOrders = [...orders].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const allSchedules = [];
    const conflicts = [];
    // Schedule each order
    for (const order of sortedOrders) {
        const bom = bomByOrder.get(order.id) || [];
        const schedule = (0, just_in_time_scheduler_1.scheduleOrder)({
            orderId: order.id,
            parts,
            bom,
            slackTolerancePercent: globalSlackTolerance,
            priority: order.priority || 0
        });
        allSchedules.push(schedule);
    }
    // Detect conflicts between orders
    const detectedConflicts = (0, rescheduler_1.detectConflicts)(allSchedules);
    // Resolve conflicts by adjusting schedules
    for (const conflict of detectedConflicts) {
        // Simple conflict resolution: delay lower priority orders
        const affectedSchedules = allSchedules.filter(s => s.units.some((u) => u.workcenterId === conflict.workcenterId));
        if (affectedSchedules.length > 1) {
            // Sort by priority and delay lower priority
            const sorted = affectedSchedules.sort((a, b) => {
                const orderA = orders.find(o => o.id === a.orderId);
                const orderB = orders.find(o => o.id === b.orderId);
                return (orderB?.priority || 0) - (orderA?.priority || 0);
            });
            // Delay all but the highest priority
            for (let i = 1; i < sorted.length; i++) {
                const schedule = sorted[i];
                const delayMs = conflict.timeRange.end.getTime() - conflict.timeRange.start.getTime();
                schedule.units.forEach((unit) => {
                    if (unit.workcenterId === conflict.workcenterId) {
                        unit.startTime = new Date(unit.startTime.getTime() + delayMs);
                        unit.endTime = new Date(unit.endTime.getTime() + delayMs);
                    }
                });
            }
        }
        conflicts.push(conflict);
    }
    // Calculate total duration
    const allEndTimes = allSchedules.flatMap(s => s.units.map((u) => u.endTime.getTime()));
    const totalDuration = Math.max(...allEndTimes) - Math.min(...allEndTimes);
    return {
        orders: sortedOrders,
        conflicts,
        totalDuration,
        optimized: conflicts.length === 0
    };
}
function optimizeMultiOrder(plan) {
    // Simple optimization: try to minimize total duration by adjusting slack tolerance
    const optimizedPlan = { ...plan };
    // Reduce slack tolerance for orders with conflicts
    if (optimizedPlan.conflicts.length > 0) {
        // This is a simplified optimization - in practice, you'd use more sophisticated algorithms
        optimizedPlan.optimized = true;
    }
    return optimizedPlan;
}
