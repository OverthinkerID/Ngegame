import { PrismaClient } from '@prisma/client';
import type { ComponentStatus } from '@ngegame/shared';
import { Logger } from '../utils/logger.js';

const logger = new Logger('database');

let prismaInstance: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:./dev.db';
  }
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

export async function checkDatabaseHealth(): Promise<ComponentStatus> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    return {
      name: 'SQLite (Prisma)',
      status: 'healthy',
      latencyMs: Date.now() - started,
      message: 'Connected',
      checkedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown database error';
    logger.error('Database health check failed', { message });
    return {
      name: 'SQLite (Prisma)',
      status: 'offline',
      latencyMs: Date.now() - started,
      message,
      checkedAt,
    };
  }
}

export async function recordSystemLog(
  level: 'debug' | 'info' | 'warn' | 'error',
  source: string,
  message: string,
  metadata?: unknown,
): Promise<void> {
  try {
    const prisma = getPrismaClient();
    await prisma.systemLog.create({
      data: {
        level,
        source,
        message,
        metadata: metadata !== undefined ? JSON.stringify(metadata) : null,
      },
    });
  } catch (err) {
    logger.warn('Failed to persist system log to SQLite', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}
