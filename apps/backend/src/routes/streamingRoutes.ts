import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  AppError,
  ErrorCode,
  type SaveStreamCredentialRequest,
  type StreamPlatform,
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

  router.post('/obs/connect', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const url = typeof req.body?.url === 'string' ? req.body.url : 'ws://localhost:4455';
      const password = typeof req.body?.password === 'string' ? req.body.password : undefined;
      res.json(await streamingService.connectObs(url, password));
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

  router.post('/start', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.startStreaming());
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

  router.post('/preview', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await streamingService.capturePreview());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
