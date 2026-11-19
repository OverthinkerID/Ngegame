import { Router, type NextFunction, type Request, type Response } from 'express';
import type { ComponentState, SystemHealthResponse } from '@ngegame/shared';
import { checkDatabaseHealth, getPrismaClient, recordSystemLog } from '../db/prisma.js';
import type { PythonWorkerClient } from '../workers/pythonWorkerClient.js';

export function createHealthRouter(workerClient: PythonWorkerClient, version: string): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [dbStatus, workerStatus] = await Promise.all([
        checkDatabaseHealth(),
        workerClient.checkHealth(),
      ]);

      const backendStatus = {
        name: 'Node.js Backend',
        status: 'healthy' as const,
        latencyMs: 0,
        message: `Node ${process.version}`,
        checkedAt: new Date().toISOString(),
      };

      const states: ComponentState[] = [
        backendStatus.status,
        dbStatus.status,
        workerStatus.status,
      ];

      let overall: ComponentState = 'healthy';
      if (states.includes('offline')) {
        overall = 'degraded';
      } else if (states.includes('degraded')) {
        overall = 'degraded';
      }

      const payload: SystemHealthResponse = {
        status: overall,
        version,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        components: {
          backend: backendStatus,
          database: dbStatus,
          pythonWorker: workerStatus,
        },
      };

      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  router.post('/worker/ping', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const message =
        typeof req.body?.message === 'string' ? req.body.message : 'ping-from-backend';
      const result = await workerClient.sendCommand('ping', { message });
      await recordSystemLog('info', 'worker', 'Python worker ping executed', {
        id: result.id,
        ok: result.ok,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 20;
      const limit = Number.isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), 100);

      const prisma = getPrismaClient();
      const logs = await prisma.systemLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      res.json({
        ok: true,
        logs: logs.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
