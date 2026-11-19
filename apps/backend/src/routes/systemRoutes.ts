import { Router, type NextFunction, type Request, type Response } from 'express';
import { AppError, ErrorCode } from '@ngegame/shared';
import { loadEnvConfig, validateEnvConfig } from '../config/env.js';
import { BackupService } from '../services/system/backupService.js';

export function createSystemRouter(backupService = new BackupService()): Router {
  const router = Router();

  router.get('/integrity', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const integrity = await backupService.checkIntegrity();
      res.json({ ok: integrity.ok, integrity });
    } catch (err) {
      next(err);
    }
  });

  router.get('/env-check', (_req: Request, res: Response) => {
    const config = loadEnvConfig();
    const validation = validateEnvConfig(config);
    res.json({
      ok: validation.valid,
      nodeEnv: config.nodeEnv,
      host: config.host,
      port: config.port,
      warnings: validation.warnings,
      errors: validation.errors,
    });
  });

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
