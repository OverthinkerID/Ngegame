import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  AppError,
  ErrorCode,
  type SaveStreamCredentialRequest,
  type StreamPlatform,
  type VoiceEmotion,
} from '@ngegame/shared';
import { StreamingService } from '../services/streaming/streamingService.js';

export function createStreamingRouter(streamingService = new StreamingService()): Router {
  const router = Router();

  router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.getStatus());
    } catch (err) {
      next(err);
    }
  });

  router.get('/obs/detect', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.detectObs());
    } catch (err) {
      next(err);
    }
  });

  router.post('/obs/connect', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const url = typeof req.body?.url === 'string' ? req.body.url : 'ws://localhost:4455';
      const password = typeof req.body?.password === 'string' ? req.body.password : undefined;
      res.json(await streamingService.connectObs(url, password));
    } catch (err) {
      next(err);
    }
  });

  router.post('/obs/reconnect', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.reconnectObs());
    } catch (err) {
      next(err);
    }
  });

  router.post('/obs/disconnect', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.disconnectObs());
    } catch (err) {
      next(err);
    }
  });

  router.post('/scene', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sceneName = String(req.body?.sceneName ?? '');
      if (!sceneName) throw new AppError('sceneName is required', ErrorCode.VALIDATION_ERROR, 400);
      res.json(await streamingService.setScene(sceneName));
    } catch (err) {
      next(err);
    }
  });

  router.post('/source/toggle', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sceneItemId = Number(req.body?.sceneItemId);
      const visible = Boolean(req.body?.visible);
      res.json(await streamingService.toggleSource(sceneItemId, visible));
    } catch (err) {
      next(err);
    }
  });

  router.post('/audio/mute', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inputName = String(req.body?.inputName ?? '');
      const muted = Boolean(req.body?.muted);
      res.json(await streamingService.setAudioMute(inputName, muted));
    } catch (err) {
      next(err);
    }
  });

  router.post('/audio/volume', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inputName = String(req.body?.inputName ?? '');
      const volumeDb = Number(req.body?.volumeDb ?? 0);
      if (!inputName) throw new AppError('inputName is required', ErrorCode.VALIDATION_ERROR, 400);
      res.json(await streamingService.setAudioVolume(inputName, volumeDb));
    } catch (err) {
      next(err);
    }
  });

  router.post('/recording/start', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.startRecording());
    } catch (err) {
      next(err);
    }
  });

  router.post('/recording/stop', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.stopRecording());
    } catch (err) {
      next(err);
    }
  });

  router.post('/recording/pause', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.toggleRecordingPause());
    } catch (err) {
      next(err);
    }
  });

  router.post('/credentials', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await streamingService.saveCredential(req.body as SaveStreamCredentialRequest),
      );
    } catch (err) {
      next(err);
    }
  });

  router.delete('/credentials/:platform', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const platform = String(req.params.platform) as StreamPlatform;
      res.json(await streamingService.deleteCredential(platform));
    } catch (err) {
      next(err);
    }
  });

  router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const confirmedPublic = Boolean(req.body?.confirmedPublic);
      const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
      res.json(await streamingService.startStreaming({ confirmedPublic, title }));
    } catch (err) {
      next(err);
    }
  });

  router.post('/stop', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.stopStreaming());
    } catch (err) {
      next(err);
    }
  });

  router.post('/emergency-stop', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.emergencyStop());
    } catch (err) {
      next(err);
    }
  });

  router.post('/preview', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.capturePreview());
    } catch (err) {
      next(err);
    }
  });

  // YouTube Live OAuth & API
  router.post('/youtube/oauth/config', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.configureYouTubeOAuth(req.body));
    } catch (err) {
      next(err);
    }
  });

  router.get('/youtube/oauth/url', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.getYouTubeAuthUrl());
    } catch (err) {
      next(err);
    }
  });

  router.get('/youtube/oauth/callback', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = String(req.query.code ?? '');
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      res.json(await streamingService.handleYouTubeCallback(code, state));
    } catch (err) {
      next(err);
    }
  });

  router.post('/youtube/refresh', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.syncYouTube());
    } catch (err) {
      next(err);
    }
  });

  router.post('/youtube/disconnect', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.disconnectYouTube());
    } catch (err) {
      next(err);
    }
  });

  // Twitch OAuth & API
  router.post('/twitch/oauth/config', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.configureTwitchOAuth(req.body));
    } catch (err) {
      next(err);
    }
  });

  router.get('/twitch/oauth/url', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.getTwitchAuthUrl());
    } catch (err) {
      next(err);
    }
  });

  router.get('/twitch/oauth/callback', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = String(req.query.code ?? '');
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      res.json(await streamingService.handleTwitchCallback(code, state));
    } catch (err) {
      next(err);
    }
  });

  router.post('/twitch/refresh', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.syncTwitch());
    } catch (err) {
      next(err);
    }
  });

  router.post('/twitch/disconnect', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.disconnectTwitch());
    } catch (err) {
      next(err);
    }
  });

  // AI Voice Narration & OBS Audio Routing
  router.get('/narration/status', (_req: Request, res: Response) => {
    res.json(streamingService.narrationService.getStatus());
  });

  router.post('/narration/config', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.narrationService.updateConfig(req.body ?? {}));
    } catch (err) {
      next(err);
    }
  });

  router.post('/narration/enqueue', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const text = String(req.body?.text ?? '');
      const emotion = (req.body?.emotion as VoiceEmotion | undefined) ?? 'neutral';
      const urgent = Boolean(req.body?.urgent);
      res.json(
        await streamingService.narrationService.enqueueNarration({
          text,
          emotion,
          source: 'manual',
          urgent,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  router.post('/narration/auto', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.narrationService.narrateFromVerifiedVision());
    } catch (err) {
      next(err);
    }
  });

  router.post('/narration/interrupt', (_req: Request, res: Response) => {
    res.json(streamingService.narrationService.interrupt());
  });

  // AI Stream Assistant
  router.get('/assistant/status', (_req: Request, res: Response) => {
    res.json(streamingService.assistantService.getStatus());
  });

  router.post('/assistant/analyze', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const st = await streamingService.getStatus();
      res.json(
        await streamingService.assistantService.analyzeCurrentState(
          st.health,
          st.scenes,
          st.currentScene,
        ),
      );
    } catch (err) {
      next(err);
    }
  });

  router.post('/assistant/command', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const command = String(req.body?.command ?? '');
      if (!command) throw new AppError('command is required', ErrorCode.VALIDATION_ERROR, 400);
      const st = await streamingService.getStatus();
      res.json(await streamingService.assistantService.handleUserCommand(command, st.health));
    } catch (err) {
      next(err);
    }
  });

  router.post('/assistant/suggestions/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.assistantService.approveSuggestion(String(req.params.id)));
    } catch (err) {
      next(err);
    }
  });

  router.post('/assistant/suggestions/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.assistantService.rejectSuggestion(String(req.params.id)));
    } catch (err) {
      next(err);
    }
  });

  // Stream Analytics & History
  router.get('/analytics', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.getAnalyticsAndHistory());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
