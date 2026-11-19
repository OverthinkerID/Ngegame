import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  AppError,
  ErrorCode,
  type VoiceCommentaryRequest,
  type VoiceSpeakRequest,
} from '@ngegame/shared';
import { VoiceStudioService } from '../services/voice/voiceService.js';

export function createVoiceRouter(voiceService = new VoiceStudioService()): Router {
  const router = Router();

  router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await voiceService.getStatus());
    } catch (err) {
      next(err);
    }
  });

  router.get('/settings', (_req: Request, res: Response) => {
    res.json(voiceService.getSettings());
  });

  router.put('/settings', (req: Request, res: Response) => {
    res.json(voiceService.updateSettings(req.body ?? {}));
  });

  router.get('/profiles', (_req: Request, res: Response) => {
    res.json({ ok: true, profiles: voiceService.listProfiles() });
  });

  router.post('/speak', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Partial<VoiceSpeakRequest> | undefined;
      if (!body || typeof body.text !== 'string' || !body.text.trim()) {
        throw new AppError('text is required', ErrorCode.VALIDATION_ERROR, 400);
      }
      res.json(await voiceService.speak(body as VoiceSpeakRequest));
    } catch (err) {
      next(err);
    }
  });

  router.post('/commentary', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Partial<VoiceCommentaryRequest> | undefined;
      if (!body || typeof body.eventType !== 'string') {
        throw new AppError('eventType is required', ErrorCode.VALIDATION_ERROR, 400);
      }
      res.json(await voiceService.generateAndSpeakCommentary(body as VoiceCommentaryRequest));
    } catch (err) {
      next(err);
    }
  });

  router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawLimit =
        typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 20;
      const history = await voiceService.getHistory(Number.isNaN(rawLimit) ? 20 : rawLimit);
      res.json({ ok: true, history });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
