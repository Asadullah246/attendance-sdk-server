import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

// Singleton pattern — one Prisma client instance for the whole app
let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    });

    // Log Prisma errors through Winston
    prisma.$on('error' as never, (e: { message: string; target?: string }) => {
      logger.error('Prisma error', { message: e.message, target: e.target });
    });

    prisma.$on('warn' as never, (e: { message: string }) => {
      logger.warn('Prisma warning', { message: e.message });
    });
  }
  return prisma;
}

/**
 * Test database connection and log result
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getPrisma();
    await client.$queryRaw`SELECT 1`;
    logger.info('✅ Database connected successfully');
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error('❌ Database connection failed', {
      error: err.message,
      hint: 'Make sure PostgreSQL is running and DATABASE_URL in .env is correct',
    });
    return false;
  }
}

/**
 * Gracefully disconnect Prisma client
 */
export async function disconnect(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  }
}
