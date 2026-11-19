import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createBackendApp } from '../src/app.js';
import { loadEnvConfig } from '../src/config/env.js';
import { disconnectDatabase } from '../src/db/prisma.js';
import { AdapterRegistry } from '../src/services/adapters/adapterRegistry.js';
import { AIBrainService } from '../src/services/ai/aiBrainService.js';
import { AnalyticsService } from '../src/services/analytics/analyticsService.js';
import { ControllerService } from '../src/services/controller/controllerService.js';
import { StreamingService } from '../src/services/streaming/streamingService.js';
import { SupervisionService } from '../src/services/supervision/supervisionService.js';
import { BackupService } from '../src/services/system/backupService.js';
import { VisionService } from '../src/services/vision/visionService.js';
import { VoiceStudioService } from '../src/services/voice/voiceService.js';
import { PythonWorkerClient } from '../src/workers/pythonWorkerClient.js';

function makePng(width: number, height: number): Buffer {
  const chunk = (tag: string, data: Buffer): Buffer => {
    const tagBuf = Buffer.from(tag, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(zlib.crc32(Buffer.concat([tagBuf, data])) >>> 0, 0);
    return Buffer.concat([lenBuf, tagBuf, data, crcBuf]);
  };
  const row = Buffer.alloc(1 + width * 3, 100);
  row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('End-to-End Backend Pipeline', () => {
  it('verifies Express app wiring and full Vision -> Adapter -> AI -> Supervision -> Controller -> Voice -> Streaming -> Analytics -> Backup pipeline', async () => {
    const config = loadEnvConfig();
    const ctx = createBackendApp(config);
    assert.ok(ctx.app);

    const workerClient = new PythonWorkerClient({
      pythonBin: process.platform === 'win32' ? 'python' : 'python3',
      workerScriptPath: path.resolve(process.cwd(), '..', 'python-worker', 'main.py'),
      timeoutMs: 5000,
    });
    const vision = new VisionService(workerClient);
    const adapters = new AdapterRegistry();
    const ai = new AIBrainService();
    ai.updateConfig({ ollamaBaseUrl: 'http://localhost:59999', fallbackProvider: null });
    const controller = new ControllerService(workerClient);
    const supervision = new SupervisionService(controller);
    const voice = new VoiceStudioService();
    voice.updateSettings({ voxcpmBaseUrl: 'http://localhost:59998' });
    const streaming = new StreamingService();
    const analytics = new AnalyticsService();
    const backup = new BackupService();

    const tmpPng = path.join(os.tmpdir(), `ngegame-e2e-${Date.now()}.png`);
    await fs.writeFile(tmpPng, makePng(64, 36));

    const createdVisionIds: number[] = [];
    const createdAiIds: number[] = [];
    const createdQueueIds: number[] = [];
    const createdVoiceIds: number[] = [];

    try {
      // 1. Vision capture
      const vis = await vision.captureOnce({ windowTitle: 'Stardew Valley', sourcePath: tmpPng });
      if (vis.id) createdVisionIds.push(vis.id);
      assert.equal(vis.width, 64);

      // 2. Adapter resolution
      const adapter = adapters.resolve({ windowTitle: vis.windowTitle });
      assert.equal(adapter.metadata.id, 'stardew-valley-poc');

      // 3. AI Brain reasoning
      const decision = await ai.think({
        gameTitle: vis.windowTitle,
        genre: adapter.metadata.genre,
        visionState: {
          windowTitle: vis.windowTitle,
          sceneLabel: vis.sceneLabel,
          motionScore: vis.motionScore,
          brightness: vis.brightness,
          ocrText: vis.ocrText,
        },
      });
      if (decision.id) createdAiIds.push(decision.id);
      assert.equal(decision.executionStatus, 'planned_only');

      // 4. Supervision submit & approve -> Controller dry-run
      await supervision.setPermissionLevel('L2');
      const firstAct = decision.actions[0];
      assert.ok(firstAct);
      const queued = await supervision.submitAction({
        actionType: firstAct.actionType,
        target: firstAct.target,
        confidence: firstAct.confidence,
        dryRun: true,
      });
      createdQueueIds.push(queued.id);
      assert.equal(queued.status, 'pending');

      const executed = await supervision.approveAction(queued.id, 'E2E verified');
      assert.equal(executed.status, 'executed');

      // 5. Voice Studio (isolated)
      const speech = await voice.speak({
        text: 'Uji end-to-end Overthinker Ngegame Bahasa Indonesia',
        playAudio: false,
      });
      if (speech.id) createdVoiceIds.push(speech.id);
      assert.equal(speech.ok, true);

      // 6. Streaming status, Analytics summary, & Backup list
      const streamStatus = await streaming.getStatus();
      assert.equal(streamStatus.obsConnected, false);

      const summary = await analytics.getSummary();
      assert.ok(summary.resources.ramTotalGb > 0);

      const backups = await backup.listBackups();
      assert.ok(Array.isArray(backups));
    } finally {
      const { getPrismaClient } = await import('../src/db/prisma.js');
      const prisma = getPrismaClient();
      if (createdVisionIds.length) {
        await prisma.visionCapture.deleteMany({ where: { id: { in: createdVisionIds } } });
      }
      if (createdAiIds.length) {
        await prisma.aIDecision.deleteMany({ where: { id: { in: createdAiIds } } });
      }
      if (createdQueueIds.length) {
        await prisma.supervisionQueueItem.deleteMany({ where: { id: { in: createdQueueIds } } });
      }
      if (createdVoiceIds.length) {
        await prisma.voiceSpeechLog.deleteMany({ where: { id: { in: createdVoiceIds } } });
      }
      ctx.wss.close();
      await ctx.workerClient.stop();
      await workerClient.stop();
      await disconnectDatabase();
      await fs.rm(tmpPng, { force: true });
    }
  });
});
