"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rescheduleOnDelay = rescheduleOnDelay;
exports.detectConflicts = detectConflicts;
const just_in_time_scheduler_1 = require("./just_in_time_scheduler");
function rescheduleOnDelay(input) {
    const { orderId, delayEvent, existingSchedule, parts, bom, slackTolerancePercent = 5 } = input;
    // Find the delayed unit in existing schedule
    const delayedUnit = existingSchedule.find(u => u.partId === delayEvent.partId && u.unitIndex === delayEvent.unitIndex);
    if (!delayedUnit) {
        throw new Error(`Delayed unit not found: ${delayEvent.partId}[${delayEvent.unitIndex}]`);
    }
    // Calculate new target completion based on delay
    const delayMs = delayEvent.delayMinutes * 60 * 1000;
    const newTargetCompletion = new Date(delayedUnit.endTime.getTime() + delayMs);
    // Mark delayed unit as delayed
    delayedUnit.status = 'DELAYED';
    delayedUnit.originalEndTime = delayedUnit.endTime;
    delayedUnit.endTime = new Date(delayedUnit.endTime.getTime() + delayMs);
    // Find all units that need rescheduling (those starting after the delayed unit)
    const affectedUnits = existingSchedule.filter(u => u.workcenterId === delayedUnit.workcenterId &&
        u.startTime >= delayedUnit.originalEndTime);
    // Reschedule affected units
    const rescheduledUnits = [];
    let cursor = new Date(delayedUnit.endTime);
    for (const unit of affectedUnits) {
        // Preserve original times for tracking
        unit.originalStartTime = unit.startTime;
        unit.originalEndTime = unit.endTime;
        // Reschedule with delay
        const duration = unit.endTime.getTime() - unit.startTime.getTime();
        unit.startTime = new Date(cursor);
        unit.endTime = new Date(cursor.getTime() + duration);
        unit.status = 'SCHEDULED';
        rescheduledUnits.push(unit);
        cursor = unit.endTime;
    }
    // Re-run full scheduling for remaining parts to ensure alignment
    const remainingParts = parts.filter(p => !existingSchedule.some(u => u.partId === p.id && u.status !== 'DELAYED'));
    if (remainingParts.length > 0) {
        const newSchedule = (0, just_in_time_scheduler_1.scheduleOrder)({
            orderId,
            parts: remainingParts,
            bom: bom.filter(b => !existingSchedule.some(u => u.partId === b.partId)),
            baseStart: new Date(),
            targetCompletion: newTargetCompletion,
            slackTolerancePercent
        });
        // Merge new schedule with existing
        const allUnits = [
            ...existingSchedule.filter(u => u.status !== 'DELAYED'),
            ...newSchedule.units
        ];
        return {
            orderId,
            units: allUnits,
            targetCompletion: newTargetCompletion,
            slackTolerancePercent
        };
    }
    return {
        orderId,
        units: existingSchedule,
        targetCompletion: newTargetCompletion,
        slackTolerancePercent
    };
}
function detectConflicts(schedules) {
    const conflicts = [];
    const workcenterSchedules = new Map();
    // Group units by workcenter
    for (const schedule of schedules) {
        for (const unit of schedule.units) {
            const existing = workcenterSchedules.get(unit.workcenterId) || [];
            existing.push(unit);
            workcenterSchedules.set(unit.workcenterId, existing);
        }
    }
    // Check for overlaps
    for (const [workcenterId, units] of workcenterSchedules) {
        const sorted = units.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            if (prev.endTime > curr.startTime) {
                conflicts.push({
                    workcenterId,
                    orderIds: [prev.partId, curr.partId], // Simplified for demo
                    timeRange: {
                        start: curr.startTime,
                        end: new Date(Math.min(prev.endTime.getTime(), curr.endTime.getTime()))
                    },
                    severity: 'CRITICAL'
                });
            }
        }
    }
    return conflicts;
}
