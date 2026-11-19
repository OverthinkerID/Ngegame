import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AdapterResolveRequest } from '@ngegame/shared';
import { AdapterRegistry } from '../services/adapters/adapterRegistry.js';

export function createAdapterRouter(registry = new AdapterRegistry()): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({ ok: true, adapters: registry.list() });
  });

  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const adapter = registry.getById(String(req.params.id));
      res.json(adapter);
    } catch (err) {
      next(err);
    }
  });

  router.post('/resolve', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as AdapterResolveRequest;
    const resolved = registry.resolve(body);
    res.json(resolved);
  });

  return router;
}
