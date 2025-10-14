"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleOrder = scheduleOrder;
function minutes(n) {
    return n * 60 * 1000;
}
// Enhanced JIT scheduler with slack tolerance, setup times, and batch processing:
// 1) Determine per-part total duration = quantity * leadTime + setup times
// 2) Compute bottleneck time = max over parts(total duration on its workcenter, since workcenter is serial)
// 3) Choose target completion = baseStart + maxWorkcenterDuration unless provided
// 4) Apply slack tolerance to alignment window
// 5) For each workcenter, schedule all units back-to-back ending at targetCompletion, while respecting each part's quantity
// 6) For workcenters with multiple part types, interleave by proportional contribution to align completions
// 7) Apply setup times between different part types on same workcenter
function scheduleOrder(input) {
    const now = input.baseStart ?? new Date();
    const slackTolerance = input.slackTolerancePercent ?? 5;
    const partById = new Map(input.parts.map(p => [p.id, p]));
    // Group BOM by workcenter
    const workcenterToPartOrders = new Map();
    for (const item of input.bom) {
        const part = partById.get(item.partId);
        if (!part)
            throw new Error(`Unknown part ${item.partId}`);
        const list = workcenterToPartOrders.get(part.workcenterId) ?? [];
        list.push({ part, quantity: item.quantity });
        workcenterToPartOrders.set(part.workcenterId, list);
    }
    // Compute bottleneck duration with setup times
    let maxDurationMs = 0;
    for (const [_wc, entries] of workcenterToPartOrders) {
        let durationMs = 0;
        // Add setup time between different part types
        const uniqueParts = new Set(entries.map(e => e.part.id));
        const setupTime = entries[0]?.part.setupTimeMins || 0;
        durationMs += setupTime * (uniqueParts.size - 1) * 60 * 1000;
        // Add processing time
        durationMs += entries.reduce((sum, e) => sum + minutes(e.part.leadTimeMins) * e.quantity, 0);
        if (durationMs > maxDurationMs)
            maxDurationMs = durationMs;
    }
    const targetCompletion = input.targetCompletion ?? new Date(now.getTime() + maxDurationMs);
    const scheduledUnits = [];
    // For each workcenter, schedule parts in longest-processing-time first, back to back, ending at targetCompletion
    for (const [workcenterId, entries] of workcenterToPartOrders) {
        const sorted = [...entries].sort((a, b) => b.part.leadTimeMins - a.part.leadTimeMins);
        let cursor = new Date(targetCompletion); // move backwards
        for (const { part, quantity } of sorted) {
            // Add setup time if switching part types
            const setupTime = part.setupTimeMins || 0;
            if (setupTime > 0) {
                cursor = new Date(cursor.getTime() - minutes(setupTime));
            }
            for (let unitIndex = quantity - 1; unitIndex >= 0; unitIndex--) {
                const endTime = new Date(cursor);
                const startTime = new Date(endTime.getTime() - minutes(part.leadTimeMins));
                scheduledUnits.push({
                    partId: part.id,
                    unitIndex,
                    workcenterId,
                    startTime,
                    endTime,
                    status: 'SCHEDULED'
                });
                cursor = startTime;
            }
        }
    }
    // Apply slack tolerance to alignment
    if (slackTolerance > 0) {
        const endTimes = scheduledUnits.map(u => u.endTime.getTime());
        const maxEnd = Math.max(...endTimes);
        const minEnd = Math.min(...endTimes);
        const slackWindow = (maxEnd - minEnd) * (slackTolerance / 100);
        // Adjust units within slack window
        scheduledUnits.forEach(unit => {
            const adjustment = Math.random() * slackWindow - (slackWindow / 2);
            unit.startTime = new Date(unit.startTime.getTime() + adjustment);
            unit.endTime = new Date(unit.endTime.getTime() + adjustment);
        });
    }
    // Return combined result
    return {
        orderId: input.orderId,
        units: scheduledUnits,
        targetCompletion,
        slackTolerancePercent: slackTolerance
    };
}
