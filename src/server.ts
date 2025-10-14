import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSchema } from './graphql/schema';
import { loadConfig } from './config/environment';
import { logger } from './utils/logger';
import { getPrisma } from './repository/prisma';

async function start() {
  const config = loadConfig();
  
  try {
    // Initialize database connection
    await getPrisma().$connect();
    logger.info('Database connected successfully');
    
    // Build GraphQL schema
    const schema = buildSchema();
    
    // Create Apollo Server
    const server = new ApolloServer({ 
      schema,
      introspection: config.server.nodeEnv === 'development',
    });
    
    // Start server
    const { url } = await startStandaloneServer(server, {
      listen: { port: config.server.port },
    });
    
    logger.info(`Manufacturing Scheduler Service started`, {
      url,
      environment: config.server.nodeEnv,
      port: config.server.port,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start server', { error: errorMessage });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  try {
    await getPrisma().$disconnect();
    logger.info('Database disconnected');
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error during shutdown', { error: errorMessage });
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  try {
    await getPrisma().$disconnect();
    logger.info('Database disconnected');
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error during shutdown', { error: errorMessage });
    process.exit(1);
  }
});

start().catch(err => {
  const errorMessage = err instanceof Error ? err.message : 'Unknown error';
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error('Unhandled error during startup', { error: errorMessage, stack });
  process.exit(1);
});
