import { Router, type NextFunction, type Request, type Response } from 'express';
import { AppError, ErrorCode, type ControllerExecuteRequest } from '@ngegame/shared';
import type { ControllerService } from '../services/controller/controllerService.js';

export function createControllerRouter(controllerService: ControllerService): Router {
  const router = Router();

  router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const state = await controllerService.getStatus();
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.get('/diagnostics', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expectedGame =
        typeof req.query.expectedGameTitle === 'string'
          ? req.query.expectedGameTitle
          : undefined;
      res.json(await controllerService.getDiagnostics(expectedGame));
    } catch (err) {
      next(err);
    }
  });

  router.post('/execute', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Partial<ControllerExecuteRequest> | undefined;
      if (!body || typeof body.actionType !== 'string') {
        throw new AppError('actionType is required', ErrorCode.VALIDATION_ERROR, 400);
      }
      const result = await controllerService.executeAction(body as ControllerExecuteRequest);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/pause', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await controllerService.pause());
    } catch (err) {
      next(err);
    }
  });

  router.post('/resume', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await controllerService.resume());
    } catch (err) {
      next(err);
    }
  });

  router.post('/release-all', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await controllerService.releaseAll());
    } catch (err) {
      next(err);
    }
  });

  router.post('/emergency-stop', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await controllerService.emergencyStop());
    } catch (err) {
      next(err);
    }
  });

  router.post('/reset-emergency', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await controllerService.resetEmergency());
    } catch (err) {
      next(err);
    }
  });

  router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawLimit =
        typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 20;
      const limit = Number.isNaN(rawLimit) ? 20 : rawLimit;
      const history = await controllerService.getHistory(limit);
      res.json({ ok: true, history });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
