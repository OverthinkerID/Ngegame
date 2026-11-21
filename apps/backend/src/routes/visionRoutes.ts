import { Router, type NextFunction, type Request, type Response } from 'express';
import type { VisionService } from '../services/vision/visionService.js';

export function createVisionRouter(visionService: VisionService): Router {
  const router = Router();

  router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await visionService.getStatus();
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  router.get('/session', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await visionService.getSession();
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  router.put('/session', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await visionService.updateSessionConfig(req.body ?? {});
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/snapshot', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await visionService.clearSnapshot();
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  router.get('/windows', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const windows = await visionService.listWindows();
      res.json({ ok: true, windows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/capture', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const windowTitle =
        typeof req.body?.windowTitle === 'string' ? req.body.windowTitle : undefined;
      const sourcePath =
        typeof req.body?.sourcePath === 'string' ? req.body.sourcePath : undefined;
      const result = await visionService.captureOnce({ windowTitle, sourcePath });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const windowTitle =
        typeof req.body?.windowTitle === 'string' ? req.body.windowTitle : undefined;
      const baseIntervalMs =
        typeof req.body?.baseIntervalMs === 'number' ? req.body.baseIntervalMs : undefined;
      const status = await visionService.startMonitor({ windowTitle, baseIntervalMs });
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  router.post('/stop', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await visionService.stopMonitor();
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawLimit =
        typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 15;
      const limit = Number.isNaN(rawLimit) ? 15 : rawLimit;
      const history = await visionService.getHistory(limit);
      res.json({ ok: true, history });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
