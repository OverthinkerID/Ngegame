import { Router, type NextFunction, type Request, type Response } from 'express';
import { AppError, ErrorCode, type AIBrainThinkRequest } from '@ngegame/shared';
import { AIBrainService } from '../services/ai/aiBrainService.js';

export function createAIRouter(aiService = new AIBrainService()): Router {
  const router = Router();

  router.get('/config', (_req: Request, res: Response) => {
    res.json(aiService.getConfig());
  });

  router.put('/config', (req: Request, res: Response) => {
    const updated = aiService.updateConfig(req.body ?? {});
    res.json(updated);
  });

  router.post('/openai-key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = String(req.body?.apiKey ?? '');
      const updated = await aiService.setOpenAIApiKey(apiKey);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/openai-key', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await aiService.clearOpenAIApiKey();
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.get('/providers/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const health = await aiService.getProvidersHealth();
      res.json(health);
    } catch (err) {
      next(err);
    }
  });

  router.post('/think', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Partial<AIBrainThinkRequest> | undefined;
      if (!body || !body.visionState || typeof body.visionState.sceneLabel !== 'string') {
        throw new AppError(
          'visionState with sceneLabel is required',
          ErrorCode.VALIDATION_ERROR,
          400,
        );
      }
      const result = await aiService.think(body as AIBrainThinkRequest);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawLimit =
        typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 15;
      const limit = Number.isNaN(rawLimit) ? 15 : rawLimit;
      const history = await aiService.getHistory(limit);
      res.json({ ok: true, history });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
