import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  AppError,
  ErrorCode,
  type CommentaryConfig,
  type CommentaryLanguage,
  type CommentaryPersonality,
  type GameplayObservationInput,
  type StreamIntelligenceMode,
  type VoicePersonalityConfig,
} from '@ngegame/shared';
import { ChatIntelligenceService } from '../services/streamIntelligence/chatIntelligenceService.js';
import { GameplayEventIntelligenceService } from '../services/streamIntelligence/gameplayEventIntelligenceService.js';
import { LiveCommentaryService } from '../services/streamIntelligence/liveCommentaryService.js';
import { SceneIntelligenceService } from '../services/streamIntelligence/sceneIntelligenceService.js';
import { VoicePersonalityService } from '../services/streamIntelligence/voicePersonalityService.js';

export function createStreamIntelligenceRouter(
  eventService = new GameplayEventIntelligenceService(),
  commentaryService = new LiveCommentaryService(),
  voicePersonalityService = new VoicePersonalityService(),
  chatIntelligenceService = new ChatIntelligenceService(),
  sceneIntelligenceService = new SceneIntelligenceService(),
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
      const result =
        body && body.windowTitle
          ? await eventService.analyzeObservation({
              gameId: body.gameId,
              windowTitle: String(body.windowTitle),
              sceneLabel: String(body.sceneLabel ?? 'active_gameplay'),
              motionScore: Number(body.motionScore ?? 0),
              brightness: body.brightness,
              ocrText: body.ocrText,
              hudItems: body.hudItems,
              visionCaptureId: body.visionCaptureId,
              controllerAttempted: body.controllerAttempted,
            })
          : await eventService.observeLatestVision();

      if (result.verified && result.events.length > 0 && commentaryService.getConfig().autoGenerateOnEvent) {
        await commentaryService.generateCommentary({ event: result.events[0] });
      }
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

  router.get('/commentary', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await commentaryService.getStatus();
      res.json({ ok: true, ...status });
    } catch (err) {
      next(err);
    }
  });

  router.post('/commentary', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const text = req.body?.text ? String(req.body.text) : undefined;
      const eventId = req.body?.eventId ? Number(req.body.eventId) : undefined;
      let targetEvent = undefined;
      if (!text) {
        const events = await eventService.listEvents(20);
        targetEvent = eventId ? events.find((e) => e.id === eventId) : events[0];
      }

      const result = await commentaryService.generateCommentary({
        event: targetEvent,
        text,
        gameId: req.body?.gameId ? String(req.body.gameId) : undefined,
        personality: req.body?.personality as CommentaryPersonality | undefined,
        language: req.body?.language as CommentaryLanguage | undefined,
        priority: req.body?.priority !== undefined ? Number(req.body.priority) : undefined,
        bypassCooldown: Boolean(req.body?.bypassCooldown),
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/commentary/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('ID komentar tidak valid', ErrorCode.VALIDATION_ERROR, 400);
      }
      const editedText = String(req.body?.editedText ?? req.body?.text ?? '');
      const item = await commentaryService.editCommentary(id, editedText);
      res.json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });

  router.put('/commentary/config', (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = commentaryService.updateConfig((req.body ?? {}) as Partial<CommentaryConfig>);
      res.json({ ok: true, config });
    } catch (err) {
      next(err);
    }
  });

  router.post('/commentary/stop', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mute = Boolean(req.body?.mute);
      const status = await commentaryService.stopAndClear(mute);
      res.json({ ok: true, ...status });
    } catch (err) {
      next(err);
    }
  });

  router.get('/voice', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await voicePersonalityService.getStatus();
      res.json({ ok: true, ...status });
    } catch (err) {
      next(err);
    }
  });

  router.get('/voice/profiles', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const profiles = await voicePersonalityService.listProfiles();
      res.json({ ok: true, profiles });
    } catch (err) {
      next(err);
    }
  });

  router.post('/voice/profiles', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await voicePersonalityService.upsertProfile(req.body ?? {});
      res.status(201).json({ ok: true, profile });
    } catch (err) {
      next(err);
    }
  });

  router.put('/voice/config', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await voicePersonalityService.updateConfig(
        (req.body ?? {}) as Partial<VoicePersonalityConfig>,
      );
      res.json({ ok: true, config });
    } catch (err) {
      next(err);
    }
  });

  router.post('/voice/speak', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await voicePersonalityService.enqueueSpeech({
        text: String(req.body?.text ?? ''),
        priority: req.body?.priority !== undefined ? Number(req.body.priority) : undefined,
        emotion: req.body?.emotion,
        language: req.body?.language,
        playAudio: Boolean(req.body?.playAudio),
        urgent: Boolean(req.body?.urgent),
      });
      res.json({ ok: true, ...status });
    } catch (err) {
      next(err);
    }
  });

  router.post('/voice/interrupt', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await voicePersonalityService.interrupt();
      res.json({ ok: true, ...status });
    } catch (err) {
      next(err);
    }
  });

  router.get('/chat', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await chatIntelligenceService.getStatus();
      res.json({ ok: true, ...status });
    } catch (err) {
      next(err);
    }
  });

  router.post('/chat/ingest', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const platform = req.body?.platform === 'twitch' ? 'twitch' : 'youtube';
      const item = await chatIntelligenceService.ingestMessage({
        platform,
        author: String(req.body?.author ?? ''),
        message: String(req.body?.message ?? ''),
      });
      res.status(201).json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });

  router.put('/chat/config', (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = chatIntelligenceService.updateConfig(req.body ?? {});
      res.json({ ok: true, config });
    } catch (err) {
      next(err);
    }
  });

  router.post('/chat/approve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.body?.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('id interaksi chat tidak valid', ErrorCode.VALIDATION_ERROR, 400);
      }
      const item = await chatIntelligenceService.approveReply(id, req.body?.editedReply);
      res.json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });

  router.post('/chat/reject', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.body?.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('id interaksi chat tidak valid', ErrorCode.VALIDATION_ERROR, 400);
      }
      const item = await chatIntelligenceService.rejectReply(id);
      res.json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });

  router.post('/chat/moderation/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('id log moderasi tidak valid', ErrorCode.VALIDATION_ERROR, 400);
      }
      const log = await chatIntelligenceService.approveModeration(id);
      res.json({ ok: true, log });
    } catch (err) {
      next(err);
    }
  });

  router.get('/scene', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await sceneIntelligenceService.getStatus();
      res.json({ ok: true, ...status });
    } catch (err) {
      next(err);
    }
  });

  router.post('/scene/analyze', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recommendation = await sceneIntelligenceService.analyzeContext(req.body ?? {});
      res.json({ ok: true, recommendation });
    } catch (err) {
      next(err);
    }
  });

  router.put('/scene/config', (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = sceneIntelligenceService.updateConfig(req.body ?? {});
      res.json({ ok: true, config });
    } catch (err) {
      next(err);
    }
  });

  router.post('/scene/approve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.body?.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('id rekomendasi scene tidak valid', ErrorCode.VALIDATION_ERROR, 400);
      }
      const recommendation = await sceneIntelligenceService.approveRecommendation(id);
      res.json({ ok: true, recommendation });
    } catch (err) {
      next(err);
    }
  });

  router.post('/scene/reject', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.body?.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('id rekomendasi scene tidak valid', ErrorCode.VALIDATION_ERROR, 400);
      }
      const recommendation = await sceneIntelligenceService.rejectRecommendation(id);
      res.json({ ok: true, recommendation });
    } catch (err) {
      next(err);
    }
  });

  router.post('/emergency-stop', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await eventService.emergencyStop();
      await commentaryService.stopAndClear(true);
      await voicePersonalityService.interrupt();
      res.json({ ok: true, status: await eventService.getStatus() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/reset-emergency', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      eventService.resetEmergencyStop();
      commentaryService.updateConfig({ muted: false });
      res.json({ ok: true, status: await eventService.getStatus() });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
