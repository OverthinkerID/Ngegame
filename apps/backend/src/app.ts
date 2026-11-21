import http from 'node:http';
import cors from 'cors';
import express, { type Express } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type { BackendEnvConfig } from './config/env.js';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createAdaptationRouter } from './routes/adaptationRoutes.js';
import { createAdapterRouter } from './routes/adapterRoutes.js';
import { createAIRouter } from './routes/aiRoutes.js';
import { createAnalyticsRouter } from './routes/analyticsRoutes.js';
import { createControllerRouter } from './routes/controllerRoutes.js';
import { createHealthRouter } from './routes/healthRoutes.js';
import { createRuntimeRouter } from './routes/runtimeRoutes.js';
import { createSteamRouter } from './routes/steamRoutes.js';
import { createStreamIntelligenceRouter } from './routes/streamIntelligenceRoutes.js';
import { createStreamingRouter } from './routes/streamingRoutes.js';
import { createSupervisionRouter } from './routes/supervisionRoutes.js';
import { createSystemRouter } from './routes/systemRoutes.js';
import { createVisionRouter } from './routes/visionRoutes.js';
import { createVoiceRouter } from './routes/voiceRoutes.js';
import { CalibrationService } from './services/adaptation/calibrationService.js';
import { GameBrainService } from './services/adaptation/gameBrainService.js';
import { GameProfileManager } from './services/adaptation/gameProfileManager.js';
import { PipelineDiagnosticsService } from './services/adaptation/pipelineDiagnostics.js';
import { AIBrainService } from './services/ai/aiBrainService.js';
import { ControllerService } from './services/controller/controllerService.js';
import { RuntimeOrchestratorService } from './services/runtime/runtimeOrchestrator.js';
import { SteamManager } from './services/steam/steamManager.js';
import { GameplayEventIntelligenceService } from './services/streamIntelligence/gameplayEventIntelligenceService.js';
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
  runtimeOrchestrator: RuntimeOrchestratorService;
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
  app.use(express.json({ limit: '15mb' }));

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
  const steamManager = new SteamManager();
  const aiBrainService = new AIBrainService();
  const profileManager = new GameProfileManager();
  const diagnosticsService = new PipelineDiagnosticsService(
    steamManager,
    visionService,
    aiBrainService,
    controllerService,
  );
  const gameBrainService = new GameBrainService(
    profileManager,
    visionService,
    aiBrainService,
    controllerService,
    supervisionService,
  );
  const calibrationService = new CalibrationService(
    profileManager,
    steamManager,
    visionService,
    controllerService,
    aiBrainService,
  );
  const runtimeOrchestrator = new RuntimeOrchestratorService(
    profileManager,
    steamManager,
    visionService,
    aiBrainService,
    controllerService,
    supervisionService,
    gameBrainService,
    broadcastWs,
    new Logger('runtime-orchestrator', config.logLevel),
  );

  app.use('/api', createHealthRouter(workerClient, '0.1.0'));
  app.use('/api/runtime', createRuntimeRouter(runtimeOrchestrator));
  app.use('/api/steam', createSteamRouter(steamManager));
  app.use('/api/vision', createVisionRouter(visionService));
  app.use('/api/ai', createAIRouter());
  app.use('/api/controller', createControllerRouter(controllerService));
  app.use('/api/adapters', createAdapterRouter());
  app.use('/api/supervision', createSupervisionRouter(supervisionService));
  app.use('/api/voice', createVoiceRouter());
  const streamEventService = new GameplayEventIntelligenceService(broadcastWs);
  app.use('/api/streaming', createStreamingRouter());
  app.use('/api/stream-intelligence', createStreamIntelligenceRouter(streamEventService));
  app.use('/api/analytics', createAnalyticsRouter());
  app.use('/api/system', createSystemRouter());
  app.use(
    '/api/adaptation',
    createAdaptationRouter({
      profileManager,
      diagnosticsService,
      gameBrainService,
      calibrationService,
      steamManager,
    }),
  );
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

  return {
    app,
    server,
    wss,
    workerClient,
    visionService,
    controllerService,
    runtimeOrchestrator,
    logger,
  };
}
