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

  router.get('/settings', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await voiceService.getSettings());
    } catch (err) {
      next(err);
    }
  });

  router.put('/settings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await voiceService.updateSettings(req.body ?? {}));
    } catch (err) {
      next(err);
    }
  });

  router.get('/profiles', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ ok: true, profiles: await voiceService.listProfiles() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/profiles', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await voiceService.upsertProfile(req.body ?? {});
      res.status(201).json({ ok: true, profile });
    } catch (err) {
      next(err);
    }
  });

  router.get('/samples', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ ok: true, samples: await voiceService.listSamples() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/samples', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        name?: string;
        language?: string;
        durationSeconds?: number;
        voiceProfileId?: string | null;
        transcript?: string;
        audioBase64?: string;
        fileName?: string;
        mimeType?: string;
      };
      if (!body?.audioBase64) {
        throw new AppError('audioBase64 is required', ErrorCode.VALIDATION_ERROR, 400);
      }
      const sample = await voiceService.saveSample({
        name: body.name ?? body.fileName ?? 'Voice Sample',
        language: body.language,
        durationSeconds: body.durationSeconds,
        voiceProfileId: body.voiceProfileId,
        transcript: body.transcript,
        audioBase64: body.audioBase64,
        fileName: body.fileName,
        mimeType: body.mimeType,
      });
      res.status(201).json({ ok: true, sample });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/samples/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await voiceService.deleteSample(String(req.params.id));
      res.json({ ok: true, deleted });
    } catch (err) {
      next(err);
    }
  });

  router.get('/jobs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawLimit =
        typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 30;
      const jobs = await voiceService.listCloneJobs(Number.isNaN(rawLimit) ? 30 : rawLimit);
      res.json({ ok: true, jobs });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/jobs/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await voiceService.deleteCloneJob(String(req.params.id));
      res.json({ ok: true, deleted });
    } catch (err) {
      next(err);
    }
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
