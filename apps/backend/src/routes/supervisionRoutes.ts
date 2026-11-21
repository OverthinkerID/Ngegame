import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  AppError,
  ErrorCode,
  type SupervisionPermissionLevel,
  type SupervisionSubmitRequest,
} from '@ngegame/shared';
import type { SupervisionService } from '../services/supervision/supervisionService.js';

export function createSupervisionRouter(supervisionService: SupervisionService): Router {
  const router = Router();

  router.get('/state', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await supervisionService.getState());
    } catch (err) {
      next(err);
    }
  });

  router.put('/permission', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const level = req.body?.permissionLevel as SupervisionPermissionLevel;
      res.json(await supervisionService.setPermissionLevel(level));
    } catch (err) {
      next(err);
    }
  });

  router.put('/policy', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await supervisionService.updatePolicy(req.body ?? {}));
    } catch (err) {
      next(err);
    }
  });

  router.post('/pause-ai', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await supervisionService.pauseAI());
    } catch (err) {
      next(err);
    }
  });

  router.post('/resume-ai', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await supervisionService.resumeAI());
    } catch (err) {
      next(err);
    }
  });

  router.post('/takeover', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await supervisionService.takeOverControl());
    } catch (err) {
      next(err);
    }
  });

  router.post('/return-ai', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await supervisionService.returnControlToAI());
    } catch (err) {
      next(err);
    }
  });

  router.post('/emergency-stop', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await supervisionService.emergencyStop());
    } catch (err) {
      next(err);
    }
  });

  router.post('/reset-emergency', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await supervisionService.resetEmergency());
    } catch (err) {
      next(err);
    }
  });

  router.post('/stop-task', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await supervisionService.stopTask());
    } catch (err) {
      next(err);
    }
  });

  router.post('/risk-assess', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Partial<SupervisionSubmitRequest> | undefined;
      if (!body || typeof body.actionType !== 'string' || typeof body.confidence !== 'number') {
        throw new AppError(
          'actionType and numeric confidence are required',
          ErrorCode.VALIDATION_ERROR,
          400,
        );
      }
      const assessment = supervisionService.assessActionRisk(
        body.actionType,
        body.target ?? '',
        body.rationale ?? '',
        body.confidence,
      );
      res.json({ ok: true, assessment });
    } catch (err) {
      next(err);
    }
  });

  router.get('/queue', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawLimit =
        typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 25;
      const items = await supervisionService.getQueue(Number.isNaN(rawLimit) ? 25 : rawLimit);
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });

  router.post('/submit', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Partial<SupervisionSubmitRequest> | undefined;
      if (!body || typeof body.actionType !== 'string' || typeof body.confidence !== 'number') {
        throw new AppError(
          'actionType and numeric confidence are required',
          ErrorCode.VALIDATION_ERROR,
          400,
        );
      }
      const item = await supervisionService.submitAction(body as SupervisionSubmitRequest);
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  router.post('/queue/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (Number.isNaN(id) || id <= 0) {
        throw new AppError('Invalid queue item id', ErrorCode.VALIDATION_ERROR, 400);
      }
      const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
      res.json(await supervisionService.approveAction(id, note));
    } catch (err) {
      next(err);
    }
  });

  router.post('/queue/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (Number.isNaN(id) || id <= 0) {
        throw new AppError('Invalid queue item id', ErrorCode.VALIDATION_ERROR, 400);
      }
      const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
      res.json(await supervisionService.rejectAction(id, note));
    } catch (err) {
      next(err);
    }
  });

  router.get('/audit', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawLimit =
        typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 25;
      const logs = await supervisionService.getAuditLogs(Number.isNaN(rawLimit) ? 25 : rawLimit);
      res.json({ ok: true, logs });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
