import { loadEnvConfig, validateEnvConfig } from './config/env.js';
import { createBackendApp } from './app.js';
import { disconnectDatabase, recordSystemLog } from './db/prisma.js';

async function bootstrap(): Promise<void> {
  const config = loadEnvConfig();
  const validation = validateEnvConfig(config);
  const {
    server,
    wss,
    workerClient,
    visionService,
    controllerService,
    runtimeOrchestrator,
    logger,
  } = createBackendApp(config);

  for (const warn of validation.warnings) {
    logger.warn('Environment warning', { detail: warn });
  }
  if (!validation.valid) {
    for (const err of validation.errors) {
      logger.error('Invalid environment configuration', { detail: err });
    }
    process.exit(1);
  }

  workerClient.start();
  void runtimeOrchestrator.recoverInterruptedSessions().catch(() => {});

  server.listen(config.port, config.host, () => {
    logger.info(`Backend listening on http://${config.host}:${config.port}`);
    void recordSystemLog('info', 'backend', 'Backend server started', {
      host: config.host,
      port: config.port,
      nodeEnv: config.nodeEnv,
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await runtimeOrchestrator.stopSession('Backend shutdown').catch(() => {});
    await visionService.stopMonitor().catch(() => {});
    await controllerService.releaseAll().catch(() => {});
    wss.close();
    server.close();
    await workerClient.stop();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  // Crash recovery: log and release any active controller keys safely
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception in backend', { error: err.message, stack: err.stack });
    void workerClient.sendCommand('controller_release_all').catch(() => {});
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection in backend', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

void bootstrap();
