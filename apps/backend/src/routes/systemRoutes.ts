import { Router, type NextFunction, type Request, type Response } from 'express';
import { AppError, ErrorCode } from '@ngegame/shared';
import { BackupService } from '../services/system/backupService.js';

export function createSystemRouter(backupService = new BackupService()): Router {
  const router = Router();

  router.get('/backups', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const backups = await backupService.listBackups();
      res.json({ ok: true, backups });
    } catch (err) {
      next(err);
    }
  });

  router.post('/backup', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const created = await backupService.createBackup();
      res.json({ ok: true, backup: created });
    } catch (err) {
      next(err);
    }
  });

  router.post('/restore', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filename = String(req.body?.filename ?? '');
      if (!filename) {
        throw new AppError('filename is required', ErrorCode.VALIDATION_ERROR, 400);
      }
      res.json(await backupService.restoreBackup(filename));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
