import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  AppError,
  ErrorCode,
  type GameplayObservationInput,
  type StreamIntelligenceMode,
} from '@ngegame/shared';
import { GameplayEventIntelligenceService } from '../services/streamIntelligence/gameplayEventIntelligenceService.js';

export function createStreamIntelligenceRouter(
  eventService = new GameplayEventIntelligenceService(),
): Router {
  const router = Router();

  router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Number(req.query.limit ?? 15) || 15;
      const status = await eventService.getStatus(limit);
      res.json({ ok: true, ...status });
    } catch (err) {
      next(err);
    }
  });

  router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Number(req.query.limit ?? 30) || 30;
      const gameId = req.query.gameId ? String(req.query.gameId) : undefined;
      const events = await eventService.listEvents(limit, gameId);
      res.json({ ok: true, events });
    } catch (err) {
      next(err);
    }
  });

  router.post('/events/analyze', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Partial<GameplayObservationInput> | undefined;
      if (body && body.windowTitle) {
        const result = await eventService.analyzeObservation({
          gameId: body.gameId,
          windowTitle: String(body.windowTitle),
          sceneLabel: String(body.sceneLabel ?? 'active_gameplay'),
          motionScore: Number(body.motionScore ?? 0),
          brightness: body.brightness,
          ocrText: body.ocrText,
          hudItems: body.hudItems,
          visionCaptureId: body.visionCaptureId,
          controllerAttempted: body.controllerAttempted,
        });
        res.json({ ok: true, ...result });
        return;
      }

      const result = await eventService.observeLatestVision();
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  router.put('/mode', (req: Request, res: Response, next: NextFunction) => {
    try {
      const mode = String(req.body?.mode ?? '') as StreamIntelligenceMode;
      if (mode !== 'semi-automatic' && mode !== 'automatic') {
        throw new AppError(
          'mode harus semi-automatic atau automatic',
          ErrorCode.VALIDATION_ERROR,
          400,
        );
      }
      const updated = eventService.setMode(mode);
      res.json({ ok: true, mode: updated });
    } catch (err) {
      next(err);
    }
  });

  router.post('/emergency-stop', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await eventService.emergencyStop();
      res.json({ ok: true, status: await eventService.getStatus() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/reset-emergency', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      eventService.resetEmergencyStop();
      res.json({ ok: true, status: await eventService.getStatus() });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
