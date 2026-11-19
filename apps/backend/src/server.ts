import { loadEnvConfig } from './config/env.js';
import { createBackendApp } from './app.js';
import { disconnectDatabase, recordSystemLog } from './db/prisma.js';

async function bootstrap(): Promise<void> {
  const config = loadEnvConfig();
  const { server, wss, workerClient, logger } = createBackendApp(config);

  workerClient.start();

  server.listen(config.port, config.host, () => {
    logger.info(`Backend listening on http://${config.host}:${config.port}`);
    void recordSystemLog('info', 'backend', 'Backend server started', {
      host: config.host,
      port: config.port,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
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
