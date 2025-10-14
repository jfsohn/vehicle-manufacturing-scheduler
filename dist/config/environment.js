"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
function loadConfig() {
    return {
        database: {
            url: process.env.DATABASE_URL || 'file:./dev.db',
        },
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        server: {
            port: parseInt(process.env.PORT || '4000'),
            nodeEnv: process.env.NODE_ENV || 'development',
        },
        scheduling: {
            defaultSlackTolerance: parseInt(process.env.DEFAULT_SLACK_TOLERANCE || '5'),
            maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3'),
        },
    };
}
