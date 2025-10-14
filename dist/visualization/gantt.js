"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGanttChart = generateGanttChart;
exports.generateASCIIGantt = generateASCIIGantt;
function generateGanttChart(units, options = {}) {
    const { width = 80, timeFormat = 'hours', showWorkcenters = true, showParts = true } = options;
    if (units.length === 0) {
        return 'No units to display';
    }
    // Find time range
    const startTimes = units.map(u => u.startTime.getTime());
    const endTimes = units.map(u => u.endTime.getTime());
    const minTime = Math.min(...startTimes);
    const maxTime = Math.max(...endTimes);
    const totalDuration = maxTime - minTime;
    // Convert to display units
    const timeScale = timeFormat === 'minutes' ? 1 : timeFormat === 'hours' ? 60 : 24 * 60;
    const duration = totalDuration / (60 * 1000) / timeScale;
    // Group units by workcenter
    const workcenterGroups = new Map();
    for (const unit of units) {
        const existing = workcenterGroups.get(unit.workcenterId) || [];
        existing.push(unit);
        workcenterGroups.set(unit.workcenterId, existing);
    }
    let chart = '';
    chart += `Gantt Chart (${duration.toFixed(1)} ${timeFormat})\n`;
    chart += '='.repeat(width) + '\n\n';
    // Generate chart for each workcenter
    for (const [workcenterId, workcenterUnits] of workcenterGroups) {
        if (showWorkcenters) {
            chart += `Workcenter: ${workcenterId}\n`;
            chart += '-'.repeat(width) + '\n';
        }
        // Sort units by start time
        const sortedUnits = workcenterUnits.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        for (const unit of sortedUnits) {
            const startOffset = (unit.startTime.getTime() - minTime) / (60 * 1000) / timeScale;
            const duration = (unit.endTime.getTime() - unit.startTime.getTime()) / (60 * 1000) / timeScale;
            // Create bar representation
            const barWidth = Math.max(1, Math.round((duration / totalDuration) * width));
            const bar = '█'.repeat(barWidth);
            const padding = ' '.repeat(Math.max(0, Math.round(startOffset / totalDuration * width)));
            const partInfo = showParts ? ` (${unit.partId}[${unit.unitIndex}])` : '';
            const statusLabel = unit.status === 'DELAYED' ? 'DELAYED' : unit.status === 'COMPLETED' ? 'COMPLETED' : 'SCHEDULED';
            chart += `${statusLabel} ${unit.partId}${partInfo}: ${padding}${bar}\n`;
        }
        chart += '\n';
    }
    // Add timeline
    chart += 'Timeline:\n';
    const timelineSteps = 5;
    for (let i = 0; i <= timelineSteps; i++) {
        const time = minTime + (totalDuration * i / timelineSteps);
        const timeStr = new Date(time).toLocaleTimeString();
        const position = Math.round((i / timelineSteps) * width);
        chart += `${timeStr.padEnd(8)} ${'|'.padStart(position)}\n`;
    }
    return chart;
}
function generateASCIIGantt(units) {
    return generateGanttChart(units, {
        width: 60,
        timeFormat: 'hours',
        showWorkcenters: true,
        showParts: true
    });
}
