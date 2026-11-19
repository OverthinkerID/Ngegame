import { Router, type NextFunction, type Request, type Response } from 'express';
import { AppError, ErrorCode } from '@ngegame/shared';
import { SteamManager } from '../services/steam/steamManager.js';

export function createSteamRouter(steamManager = new SteamManager()): Router {
  const router = Router();

  router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await steamManager.detectInstallation();
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  router.get('/games', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const games = await steamManager.listGames();
      res.json({ ok: true, games });
    } catch (err) {
      next(err);
    }
  });

  router.post('/scan', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await steamManager.scanLibrary();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/games/:appId/launch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appId = Number.parseInt(String(req.params.appId), 10);
      if (Number.isNaN(appId) || appId <= 0) {
        throw new AppError('Invalid Steam AppID', ErrorCode.VALIDATION_ERROR, 400);
      }
      const result = await steamManager.launchGame(appId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/games/:appId/stop', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appId = Number.parseInt(String(req.params.appId), 10);
      if (Number.isNaN(appId) || appId <= 0) {
        throw new AppError('Invalid Steam AppID', ErrorCode.VALIDATION_ERROR, 400);
      }
      const result = await steamManager.stopGame(appId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
