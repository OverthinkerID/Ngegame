import { Router, type NextFunction, type Request, type Response } from 'express';
import { AnalyticsService } from '../services/analytics/analyticsService.js';

export function createAnalyticsRouter(analyticsService = new AnalyticsService()): Router {
  const router = Router();

  router.get('/summary', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await analyticsService.getSummary());
    } catch (err) {
      next(err);
    }
  });

  router.get('/throttling', (_req: Request, res: Response) => {
    res.json(analyticsService.getThrottlingConfig());
  });

  router.put('/throttling', (req: Request, res: Response) => {
    res.json(analyticsService.updateThrottlingConfig(req.body ?? {}));
  });

  router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const format = req.query.format === 'csv' ? 'csv' : 'json';
      const content = await analyticsService.exportReport(format);
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="ngegame-analytics.csv"');
      } else {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="ngegame-analytics.json"');
      }
      res.send(content);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
