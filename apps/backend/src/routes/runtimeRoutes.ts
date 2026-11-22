import { Router, type NextFunction, type Request, type Response } from 'express';
import { AppError, ErrorCode } from '@ngegame/shared';
import type { RuntimeOrchestratorService } from '../services/runtime/runtimeOrchestrator.js';

export function createRuntimeRouter(runtimeOrchestrator: RuntimeOrchestratorService): Router {
  const router = Router();

  router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await runtimeOrchestrator.getState());
    } catch (err) {
      next(err);
    }
  });

  router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gameId = typeof req.body?.gameId === 'string' ? req.body.gameId.trim() : '';
      if (!gameId) {
        throw new AppError('gameId is required', ErrorCode.VALIDATION_ERROR, 400);
      }
      const windowTitle =
        typeof req.body?.windowTitle === 'string' ? req.body.windowTitle : undefined;
      const goal = typeof req.body?.goal === 'string' ? req.body.goal : undefined;
      res.json(await runtimeOrchestrator.startSession({ gameId, windowTitle, goal }));
    } catch (err) {
      next(err);
    }
  });

  router.post('/loop/start', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gameId = typeof req.body?.gameId === 'string' ? req.body.gameId.trim() : '';
      if (!gameId) {
        throw new AppError('gameId is required', ErrorCode.VALIDATION_ERROR, 400);
      }
      const windowTitle =
        typeof req.body?.windowTitle === 'string' ? req.body.windowTitle : undefined;
      const dryRun = typeof req.body?.dryRun === 'boolean' ? req.body.dryRun : true;
      const intervalMs =
        typeof req.body?.intervalMs === 'number' ? req.body.intervalMs : undefined;
      const goalOverride =
        typeof req.body?.goalOverride === 'string' ? req.body.goalOverride : undefined;
      res.json(
        await runtimeOrchestrator.startLoop({
          gameId,
          windowTitle,
          dryRun,
          intervalMs,
          goalOverride,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  router.post('/loop/stop', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
      res.json(await runtimeOrchestrator.stopLoop(reason));
    } catch (err) {
      next(err);
    }
  });

  router.post('/step', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gameId = typeof req.body?.gameId === 'string' ? req.body.gameId.trim() : undefined;
      const windowTitle =
        typeof req.body?.windowTitle === 'string' ? req.body.windowTitle : undefined;
      const dryRun = typeof req.body?.dryRun === 'boolean' ? req.body.dryRun : undefined;
      const goalOverride =
        typeof req.body?.goalOverride === 'string' ? req.body.goalOverride : undefined;
      res.json(await runtimeOrchestrator.runStep({ gameId, windowTitle, dryRun, goalOverride }));
    } catch (err) {
      next(err);
    }
  });

  router.post('/stop', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
      res.json(await runtimeOrchestrator.stopSession(reason));
    } catch (err) {
      next(err);
    }
  });

  router.post('/recover', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await runtimeOrchestrator.recoverInterruptedSessions());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
