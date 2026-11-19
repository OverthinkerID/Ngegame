import http from 'node:http';
import cors from 'cors';
import express, { type Express } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type { BackendEnvConfig } from './config/env.js';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createAdapterRouter } from './routes/adapterRoutes.js';
import { createAIRouter } from './routes/aiRoutes.js';
import { createAnalyticsRouter } from './routes/analyticsRoutes.js';
import { createControllerRouter } from './routes/controllerRoutes.js';
import { createHealthRouter } from './routes/healthRoutes.js';
import { createSteamRouter } from './routes/steamRoutes.js';
import { createStreamingRouter } from './routes/streamingRoutes.js';
import { createSupervisionRouter } from './routes/supervisionRoutes.js';
import { createSystemRouter } from './routes/systemRoutes.js';
import { createVisionRouter } from './routes/visionRoutes.js';
import { createVoiceRouter } from './routes/voiceRoutes.js';
import { ControllerService } from './services/controller/controllerService.js';
import { SupervisionService } from './services/supervision/supervisionService.js';
import { VisionService } from './services/vision/visionService.js';
import { Logger } from './utils/logger.js';
import { PythonWorkerClient } from './workers/pythonWorkerClient.js';

export interface BackendAppContext {
  app: Express;
  server: http.Server;
  wss: WebSocketServer;
  workerClient: PythonWorkerClient;
  visionService: VisionService;
  controllerService: ControllerService;
  logger: Logger;
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin.startsWith('file://')) return true;
  try {
    const parsed = new URL(origin);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function createBackendApp(config: BackendEnvConfig): BackendAppContext {
  const logger = new Logger('backend', config.logLevel);
  const workerClient = new PythonWorkerClient(
    {
      pythonBin: config.pythonBin,
      workerScriptPath: config.pythonWorkerPath,
      timeoutMs: config.pythonWorkerTimeoutMs,
    },
    new Logger('python-worker', config.logLevel),
  );

  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin '${origin}' not allowed by CORS policy`));
      },
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcastWs = (eventType: string, payload: unknown): void => {
    const message = JSON.stringify({
      type: eventType,
      payload,
      timestamp: new Date().toISOString(),
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  const visionService = new VisionService(
    workerClient,
    broadcastWs,
    new Logger('vision-service', config.logLevel),
  );

  app.get('/', (_req, res) => {
    res.json({
      name: 'Overthinker-Ngegame Backend',
      version: '0.1.0',
      status: 'running',
    });
  });

  const controllerService = new ControllerService(workerClient);
  const supervisionService = new SupervisionService(controllerService);

  app.use('/api', createHealthRouter(workerClient, '0.1.0'));
  app.use('/api/steam', createSteamRouter());
  app.use('/api/vision', createVisionRouter(visionService));
  app.use('/api/ai', createAIRouter());
  app.use('/api/controller', createControllerRouter(controllerService));
  app.use('/api/adapters', createAdapterRouter());
  app.use('/api/supervision', createSupervisionRouter(supervisionService));
  app.use('/api/voice', createVoiceRouter());
  app.use('/api/streaming', createStreamingRouter());
  app.use('/api/analytics', createAnalyticsRouter());
  app.use('/api/system', createSystemRouter());
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  wss.on('connection', (ws) => {
    logger.info('WebSocket client connected');
    ws.send(
      JSON.stringify({
        type: 'connected',
        message: 'Connected to Overthinker-Ngegame Backend WS',
        timestamp: new Date().toISOString(),
      }),
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString('utf8')) as { type?: string };
        if (msg.type === 'ping') {
          ws.send(
            JSON.stringify({
              type: 'pong',
              timestamp: new Date().toISOString(),
            }),
          );
        }
      } catch {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Invalid JSON payload',
          }),
        );
      }
    });

    ws.on('error', (err) => {
      logger.warn('WebSocket client error', { error: err.message });
    });
  });

  return { app, server, wss, workerClient, visionService, controllerService, logger };
}
