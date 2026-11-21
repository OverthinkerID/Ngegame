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

  router.get('/diagnostics', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      let diagnostics = steamManager.getDiagnostics();
      if (!diagnostics) {
        await steamManager.detectInstallation();
        diagnostics = steamManager.getDiagnostics();
      }
      res.json({ ok: true, diagnostics });
    } catch (err) {
      next(err);
    }
  });

  router.get('/libraries/manual', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const paths = await steamManager.getManualLibraryPaths();
      res.json({ ok: true, paths });
    } catch (err) {
      next(err);
    }
  });

  router.post('/libraries/manual', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { libraryPath } = req.body as { libraryPath?: string };
      if (!libraryPath || typeof libraryPath !== 'string') {
        throw new AppError('libraryPath wajib diisi.', ErrorCode.VALIDATION_ERROR, 400);
      }
      const paths = await steamManager.addManualLibraryPath(libraryPath);
      res.status(201).json({ ok: true, paths });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/libraries/manual', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { libraryPath } = req.body as { libraryPath?: string };
      if (!libraryPath || typeof libraryPath !== 'string') {
        throw new AppError('libraryPath wajib diisi.', ErrorCode.VALIDATION_ERROR, 400);
      }
      const paths = await steamManager.removeManualLibraryPath(libraryPath);
      res.json({ ok: true, paths });
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
