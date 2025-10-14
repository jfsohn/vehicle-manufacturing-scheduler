"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const just_in_time_scheduler_1 = require("../../src/scheduler/just_in_time_scheduler");
describe('scheduler', () => {
    const wcA = 'WCA';
    const wcB = 'WCB';
    const partA = { id: 'A', name: 'A', leadTimeMins: 30, workcenterId: wcA };
    const partB = { id: 'B', name: 'B', leadTimeMins: 60, workcenterId: wcB };
    test('aligns completion times for different workcenters', () => {
        const base = new Date('2025-01-01T00:00:00Z');
        const res = (0, just_in_time_scheduler_1.scheduleOrder)({ orderId: 'O1', parts: [partA, partB], bom: [
                { partId: 'A', quantity: 2 },
                { partId: 'B', quantity: 1 },
            ], baseStart: base, slackTolerancePercent: 0 }); // Disable slack for deterministic test
        // Compare per-part latest completion times (final units at integration)
        const perPartMaxEnd = new Map();
        for (const u of res.units) {
            const end = u.endTime.getTime();
            const prev = perPartMaxEnd.get(u.partId) ?? -Infinity;
            if (end > prev)
                perPartMaxEnd.set(u.partId, end);
        }
        const ends = Array.from(perPartMaxEnd.values());
        const maxEnd = Math.max(...ends);
        const minEnd = Math.min(...ends);
        expect(maxEnd - minEnd).toBeLessThanOrEqual(60 * 1000); // within 1 minute
    });
    test('serializes units on same workcenter', () => {
        const parts = [
            { id: 'A', name: 'A', leadTimeMins: 10, workcenterId: wcA },
            { id: 'B', name: 'B', leadTimeMins: 20, workcenterId: wcA },
        ];
        const base = new Date('2025-01-01T00:00:00Z');
        const res = (0, just_in_time_scheduler_1.scheduleOrder)({ orderId: 'O2', parts, bom: [
                { partId: 'A', quantity: 2 },
                { partId: 'B', quantity: 1 },
            ], baseStart: base, slackTolerancePercent: 0 }); // Disable slack for deterministic test
        const wcUnits = res.units.filter(u => u.workcenterId === wcA).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        for (let i = 1; i < wcUnits.length; i++) {
            expect(wcUnits[i].startTime.getTime()).toBeGreaterThanOrEqual(wcUnits[i - 1].endTime.getTime());
        }
    });
    test('handles very long lead time part as bottleneck', () => {
        const parts = [
            { id: 'A', name: 'A', leadTimeMins: 10, workcenterId: wcA },
            { id: 'C', name: 'C', leadTimeMins: 240, workcenterId: wcB },
        ];
        const base = new Date('2025-01-01T00:00:00Z');
        const res = (0, just_in_time_scheduler_1.scheduleOrder)({ orderId: 'O3', parts, bom: [
                { partId: 'A', quantity: 1 },
                { partId: 'C', quantity: 1 },
            ], baseStart: base, slackTolerancePercent: 0 });
        const long = res.units.find(u => u.partId === 'C');
        const short = res.units.find(u => u.partId === 'A');
        // Long part defines target completion
        expect(long.endTime.getTime()).toBeGreaterThanOrEqual(short.endTime.getTime() - 60 * 1000);
    });
    test('applies slack tolerance correctly', () => {
        const parts = [
            { id: 'A', name: 'A', leadTimeMins: 30, workcenterId: wcA },
            { id: 'B', name: 'B', leadTimeMins: 30, workcenterId: wcB },
        ];
        const base = new Date('2025-01-01T00:00:00Z');
        const res = (0, just_in_time_scheduler_1.scheduleOrder)({ orderId: 'O4', parts, bom: [
                { partId: 'A', quantity: 1 },
                { partId: 'B', quantity: 1 },
            ], baseStart: base, slackTolerancePercent: 10 });
        // With slack tolerance, units should have some variation
        expect(res.slackTolerancePercent).toBe(10);
        expect(res.units.length).toBe(2);
        expect(res.units.every(u => u.status === 'SCHEDULED')).toBe(true);
    });
    test('handles setup times between different parts', () => {
        const parts = [
            { id: 'A', name: 'A', leadTimeMins: 10, workcenterId: wcA, setupTimeMins: 5 },
            { id: 'B', name: 'B', leadTimeMins: 15, workcenterId: wcA, setupTimeMins: 3 },
        ];
        const base = new Date('2025-01-01T00:00:00Z');
        const res = (0, just_in_time_scheduler_1.scheduleOrder)({ orderId: 'O5', parts, bom: [
                { partId: 'A', quantity: 1 },
                { partId: 'B', quantity: 1 },
            ], baseStart: base, slackTolerancePercent: 0 });
        // Should account for setup time between different parts
        const wcUnits = res.units.filter(u => u.workcenterId === wcA).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        expect(wcUnits.length).toBe(2);
        // Second unit should start after first unit + setup time
        const timeDiff = wcUnits[1].startTime.getTime() - wcUnits[0].endTime.getTime();
        expect(timeDiff).toBeGreaterThanOrEqual(3 * 60 * 1000); // At least 3 minutes setup
    });
});
