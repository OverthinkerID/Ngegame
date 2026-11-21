import { Router, type NextFunction, type Request, type Response } from 'express';
import { AppError, ErrorCode, type UpdatePreferences } from '@ngegame/shared';
import { UpdateService } from '../services/updates/updateService.js';
import type { PythonWorkerClient } from '../workers/pythonWorkerClient.js';

export function createUpdateRouter(workerClient?: PythonWorkerClient): Router {
  const router = Router();
  const service = new UpdateService(workerClient);

  router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await service.getStatus();
      res.json({ ok: true, ...status });
    } catch (err) {
      next(err);
    }
  });

  router.get('/check', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await service.markChecked();
      const status = await service.getStatus();
      res.json({
        ok: true,
        checkedAt: new Date().toISOString(),
        ...status,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/check', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await service.markChecked();
      const status = await service.getStatus();
      res.json({
        ok: true,
        checkedAt: new Date().toISOString(),
        ...status,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Number(req.query.limit ?? 20) || 20;
      const history = await service.listHistory(limit);
      res.json({ ok: true, history });
    } catch (err) {
      next(err);
    }
  });

  router.post('/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const toVersion = String(req.body?.toVersion ?? '').trim();
      const status = String(req.body?.status ?? '').trim();
      if (!toVersion || !status) {
        throw new AppError(
          'toVersion and status are required',
          ErrorCode.VALIDATION_ERROR,
          400,
        );
      }
      const entry = await service.recordHistory({
        fromVersion: req.body?.fromVersion,
        toVersion,
        channel: req.body?.channel === 'beta' ? 'beta' : 'stable',
        status,
        releaseNotes: req.body?.releaseNotes ?? null,
        releaseDate: req.body?.releaseDate ?? null,
        packageSize: Number(req.body?.packageSize ?? 0) || 0,
        backupPath: req.body?.backupPath ?? null,
        errorMessage: req.body?.errorMessage ?? null,
        completed: Boolean(req.body?.completed),
      });
      res.status(201).json({ ok: true, entry });
    } catch (err) {
      next(err);
    }
  });

  router.get('/preferences', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const preferences = await service.getPreferences();
      res.json({ ok: true, preferences });
    } catch (err) {
      next(err);
    }
  });

  router.put('/preferences', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const partial = (req.body ?? {}) as Partial<UpdatePreferences>;
      const preferences = await service.updatePreferences(partial);
      res.json({ ok: true, preferences });
    } catch (err) {
      next(err);
    }
  });

  router.post('/download', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const version = String(req.body?.version ?? '').trim();
      if (!version) {
        throw new AppError('version is required', ErrorCode.VALIDATION_ERROR, 400);
      }
      const download = await service.startOrUpdateDownload({
        version,
        channel: req.body?.channel === 'beta' ? 'beta' : 'stable',
        status: String(req.body?.status ?? 'downloading'),
        totalBytes: Number(req.body?.totalBytes ?? 0) || 0,
        downloadedBytes: Number(req.body?.downloadedBytes ?? 0) || 0,
        percent: Number(req.body?.percent ?? 0) || 0,
        bytesPerSecond: Number(req.body?.bytesPerSecond ?? 0) || 0,
        errorMessage: req.body?.errorMessage ?? null,
      });
      res.json({ ok: true, download });
    } catch (err) {
      next(err);
    }
  });

  router.post('/cancel', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const version = req.body?.version ? String(req.body.version) : undefined;
      const download = await service.cancelActiveDownload(version);
      res.json({ ok: true, cancelled: Boolean(download), download });
    } catch (err) {
      next(err);
    }
  });

  router.post('/install', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const compatibility = await service.checkRuntimeCompatibility();
      if (!compatibility.ok && !req.body?.force) {
        res.status(409).json({
          ok: false,
          error: 'Pemeriksaan kompatibilitas runtime gagal sebelum instalasi.',
          compatibility,
        });
        return;
      }
      const targetVersion = String(req.body?.toVersion ?? '').trim();
      const entry = targetVersion
        ? await service.recordHistory({
            toVersion: targetVersion,
            channel: req.body?.channel === 'beta' ? 'beta' : 'stable',
            status: 'installing',
            backupPath: req.body?.backupPath ?? null,
          })
        : null;
      res.json({ ok: true, compatibility, entry });
    } catch (err) {
      next(err);
    }
  });

  router.get('/compatibility', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const compatibility = await service.checkRuntimeCompatibility();
      res.json({ ok: compatibility.ok, compatibility });
    } catch (err) {
      next(err);
    }
  });

  router.get('/recovery', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Number(req.query.limit ?? 20) || 20;
      const logs = await service.listRecoveryLogs(limit);
      res.json({ ok: true, logs });
    } catch (err) {
      next(err);
    }
  });

  router.post('/recovery/log', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const action = String(req.body?.action ?? '').trim();
      const details = String(req.body?.details ?? '').trim();
      if (!action || !details) {
        throw new AppError(
          'action and details are required',
          ErrorCode.VALIDATION_ERROR,
          400,
        );
      }
      const log = await service.recordRecoveryLog({
        version: req.body?.version,
        action,
        backupPath: req.body?.backupPath ?? null,
        success: req.body?.success !== undefined ? Boolean(req.body.success) : true,
        details,
      });
      res.status(201).json({ ok: true, log });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
