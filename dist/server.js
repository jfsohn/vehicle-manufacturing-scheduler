"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const server_1 = require("@apollo/server");
const standalone_1 = require("@apollo/server/standalone");
const schema_1 = require("./graphql/schema");
const environment_1 = require("./config/environment");
const logger_1 = require("./utils/logger");
const prisma_1 = require("./repository/prisma");
async function start() {
    const config = (0, environment_1.loadConfig)();
    try {
        // Initialize database connection
        await (0, prisma_1.getPrisma)().$connect();
        logger_1.logger.info('Database connected successfully');
        // Build GraphQL schema
        const schema = (0, schema_1.buildSchema)();
        // Create Apollo Server
        const server = new server_1.ApolloServer({
            schema,
            introspection: config.server.nodeEnv === 'development',
        });
        // Start server
        const { url } = await (0, standalone_1.startStandaloneServer)(server, {
            listen: { port: config.server.port },
        });
        logger_1.logger.info(`Manufacturing Scheduler Service started`, {
            url,
            environment: config.server.nodeEnv,
            port: config.server.port,
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.logger.error('Failed to start server', { error: errorMessage });
        process.exit(1);
    }
}
// Graceful shutdown
process.on('SIGINT', async () => {
    logger_1.logger.info('Received SIGINT, shutting down gracefully...');
    try {
        await (0, prisma_1.getPrisma)().$disconnect();
        logger_1.logger.info('Database disconnected');
        process.exit(0);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.logger.error('Error during shutdown', { error: errorMessage });
        process.exit(1);
    }
});
process.on('SIGTERM', async () => {
    logger_1.logger.info('Received SIGTERM, shutting down gracefully...');
    try {
        await (0, prisma_1.getPrisma)().$disconnect();
        logger_1.logger.info('Database disconnected');
        process.exit(0);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.logger.error('Error during shutdown', { error: errorMessage });
        process.exit(1);
    }
});
start().catch(err => {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const stack = err instanceof Error ? err.stack : undefined;
    logger_1.logger.error('Unhandled error during startup', { error: errorMessage, stack });
    process.exit(1);
});
