import app from './app';
import config from './config';
import logger from './utils/logger';
import { testConnection, disconnect } from './database/prisma';

async function startServer(): Promise<void> {
  logger.info('─────────────────────────────────────────');
  logger.info('  ZKTeco SDK Middleware Server');
  logger.info('─────────────────────────────────────────');
  logger.info(`Environment: ${config.nodeEnv}`);

  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    logger.warn('⚠️  Server starting without database — some features will be unavailable');
  }

  // Start HTTP server
  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info(`🚀 Server running on http://0.0.0.0:${config.port}`);
    logger.info(`📋 Health check: http://0.0.0.0:${config.port}/health`);
    logger.info(`🔌 Test device: http://0.0.0.0:${config.port}/api/v1/test/connect?ip=DEVICE_IP`);
    logger.info('─────────────────────────────────────────');
  });

  // ─── Graceful Shutdown ───────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`\n${signal} received. Shutting down gracefully...`);

    server.close(async () => {
      await disconnect();
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled Rejection', { reason: (reason as Error)?.message || reason });
  });
}

startServer();
