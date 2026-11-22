import {
  AppError,
  ErrorCode,
  type DetectedWindow,
  type VisionAnalysisResult,
  type VisionCapabilities,
  type VisionMonitorStatus,
  type VisionSessionRecord,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { Logger } from '../../utils/logger.js';
import type { PythonWorkerClient } from '../../workers/pythonWorkerClient.js';
import { UserDataStorageService } from '../persistence/userDataStorage.js';

export type WsBroadcaster = (eventType: string, payload: unknown) => void;
const DEFAULT_VISION_SESSION_ID = 'default-vision-session';

function decodeImageBase64(raw: string): { buffer: Buffer; mimeType: string; ext: string } {
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (match) {
    const mimeType = match[1] || 'image/jpeg';
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    return { mimeType, ext, buffer: Buffer.from(match[2] ?? '', 'base64') };
  }
  return { mimeType: 'image/jpeg', ext: 'jpg', buffer: Buffer.from(raw, 'base64') };
}

export class VisionService {
  private readonly workerClient: PythonWorkerClient;
  private readonly broadcast: WsBroadcaster;
  private readonly logger: Logger;
  private readonly storage: UserDataStorageService;

  private running = false;
  private targetWindow: string | null = null;
  private samplingIntervalMs = 1000;
  private lastCaptureAt: string | null = null;
  private lastProcessingMs: number | null = null;
  private framesCaptured = 0;
  private cachedCapabilities: VisionCapabilities | null = null;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(
    workerClient: PythonWorkerClient,
    broadcast: WsBroadcaster = () => {},
    logger = new Logger('vision-service'),
    storage = new UserDataStorageService(),
  ) {
    this.workerClient = workerClient;
    this.broadcast = broadcast;
    this.logger = logger;
    this.storage = storage;
  }

  public async getCapabilities(): Promise<VisionCapabilities> {
    const res = await this.workerClient.sendCommand('vision_capabilities');
    if (!res.ok || !res.data) {
      throw new AppError(
        res.error?.message ?? 'Failed to query vision capabilities',
        ErrorCode.WORKER_EXECUTION_ERROR,
        500,
      );
    }
    this.cachedCapabilities = res.data as unknown as VisionCapabilities;
    return this.cachedCapabilities;
  }

  public async listWindows(): Promise<DetectedWindow[]> {
    const res = await this.workerClient.sendCommand('list_windows');
    if (!res.ok) {
      throw new AppError(
        res.error?.message ?? 'Failed to list visible windows',
        ErrorCode.WORKER_EXECUTION_ERROR,
        500,
      );
    }
    const windows = res.data?.windows;
    return Array.isArray(windows) ? (windows as DetectedWindow[]) : [];
  }

  public async getStatus(): Promise<VisionMonitorStatus> {
    if (!this.cachedCapabilities) {
      try {
        await this.getCapabilities();
      } catch {
        // leave null if worker offline
      }
    }
    return {
      running: this.running,
      targetWindow: this.targetWindow,
      samplingIntervalMs: this.samplingIntervalMs,
      lastCaptureAt: this.lastCaptureAt,
      lastProcessingMs: this.lastProcessingMs,
      framesCaptured: this.framesCaptured,
      capabilities: this.cachedCapabilities,
    };
  }

  public async getSession(): Promise<VisionSessionRecord> {
    const prisma = getPrismaClient();
    const row = await prisma.visionSession.upsert({
      where: { id: DEFAULT_VISION_SESSION_ID },
      create: {
        id: DEFAULT_VISION_SESSION_ID,
        captureSource: this.targetWindow ?? 'Primary Display',
        targetWindow: this.targetWindow ?? 'Primary Display',
        samplingIntervalMs: this.samplingIntervalMs,
        status: this.running ? 'active' : 'idle',
      },
      update: {
        status: this.running ? 'active' : 'idle',
      },
    });

    let lastAnalysis: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(row.lastAnalysisJson) as Record<string, unknown>;
      if (parsed && Object.keys(parsed).length > 0) {
        lastAnalysis = parsed;
      }
    } catch {
      lastAnalysis = null;
    }

    let captureConfig: Record<string, unknown> = {};
    try {
      captureConfig = JSON.parse(row.captureConfigJson) as Record<string, unknown>;
    } catch {
      captureConfig = {};
    }

    return {
      id: row.id,
      gameId: row.gameId,
      captureSource: row.captureSource,
      targetWindow: row.targetWindow,
      width: row.width,
      height: row.height,
      samplingIntervalMs: row.samplingIntervalMs,
      status: this.running ? 'active' : ((row.status as VisionSessionRecord['status']) || 'idle'),
      overlayEnabled: row.overlayEnabled,
      lastCaptureAt: row.lastCaptureAt ? row.lastCaptureAt.toISOString() : null,
      lastSnapshotAssetId: row.lastSnapshotAssetId,
      snapshotUrl: row.lastSnapshotAssetId
        ? `/api/persistence/assets/${encodeURIComponent(row.lastSnapshotAssetId)}/content`
        : null,
      lastAnalysis,
      captureConfig,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public async updateSessionConfig(patch: {
    gameId?: string | null;
    captureSource?: string;
    targetWindow?: string;
    overlayEnabled?: boolean;
    samplingIntervalMs?: number;
    captureConfig?: Record<string, unknown>;
  }): Promise<VisionSessionRecord> {
    const prisma = getPrismaClient();
    if (patch.targetWindow) {
      this.targetWindow = patch.targetWindow;
    }
    if (typeof patch.samplingIntervalMs === 'number' && patch.samplingIntervalMs >= 350) {
      this.samplingIntervalMs = Math.round(patch.samplingIntervalMs);
    }
    await prisma.visionSession.upsert({
      where: { id: DEFAULT_VISION_SESSION_ID },
      create: {
        id: DEFAULT_VISION_SESSION_ID,
        gameId: patch.gameId ?? null,
        captureSource: patch.captureSource ?? patch.targetWindow ?? 'Primary Display',
        targetWindow: patch.targetWindow ?? 'Primary Display',
        samplingIntervalMs: this.samplingIntervalMs,
        overlayEnabled: patch.overlayEnabled ?? true,
        status: this.running ? 'active' : 'idle',
        captureConfigJson: JSON.stringify(patch.captureConfig ?? {}),
      },
      update: {
        ...(patch.gameId !== undefined ? { gameId: patch.gameId } : {}),
        ...(patch.captureSource !== undefined ? { captureSource: patch.captureSource } : {}),
        ...(patch.targetWindow !== undefined ? { targetWindow: patch.targetWindow } : {}),
        ...(patch.overlayEnabled !== undefined ? { overlayEnabled: patch.overlayEnabled } : {}),
        ...(patch.samplingIntervalMs !== undefined
          ? { samplingIntervalMs: this.samplingIntervalMs }
          : {}),
        ...(patch.captureConfig !== undefined
          ? { captureConfigJson: JSON.stringify(patch.captureConfig) }
          : {}),
      },
    });
    return this.getSession();
  }

  public async clearSnapshot(): Promise<VisionSessionRecord> {
    const prisma = getPrismaClient();
    const current = await prisma.visionSession.findUnique({
      where: { id: DEFAULT_VISION_SESSION_ID },
    });
    if (current?.lastSnapshotAssetId) {
      await this.storage.deleteAsset(current.lastSnapshotAssetId);
    }
    await prisma.visionSession.upsert({
      where: { id: DEFAULT_VISION_SESSION_ID },
      create: {
        id: DEFAULT_VISION_SESSION_ID,
        lastSnapshotAssetId: null,
        lastAnalysisJson: '{}',
      },
      update: {
        lastSnapshotAssetId: null,
        lastAnalysisJson: '{}',
      },
    });
    return this.getSession();
  }

  private computeNextInterval(motionScore: number, processingMs: number): number {
    if (processingMs >= 350) {
      return Math.min(3000, this.samplingIntervalMs + 350);
    }
    if (motionScore >= 0.08 && processingMs < 250) {
      return Math.max(350, this.samplingIntervalMs - 200);
    }
    if (motionScore < 0.02) {
      return Math.min(2000, this.samplingIntervalMs + 150);
    }
    return this.samplingIntervalMs;
  }

  public async captureOnce(options?: {
    windowTitle?: string;
    sourcePath?: string;
  }): Promise<VisionAnalysisResult> {
    const windowTitle = options?.windowTitle ?? this.targetWindow ?? 'Primary Display';
    const res = await this.workerClient.sendCommand('capture_frame', {
      windowTitle,
      sourcePath: options?.sourcePath,
      samplingIntervalMs: this.samplingIntervalMs,
    });

    if (!res.ok || !res.data) {
      throw new AppError(
        res.error?.message ?? 'Vision capture failed',
        ErrorCode.WORKER_EXECUTION_ERROR,
        500,
      );
    }

    const analysis = res.data as unknown as VisionAnalysisResult;
    this.lastCaptureAt = analysis.createdAt;
    this.lastProcessingMs = analysis.processingMs;
    this.framesCaptured += 1;
    this.cachedCapabilities = analysis.capabilities;
    this.samplingIntervalMs = this.computeNextInterval(
      analysis.motionScore,
      analysis.processingMs,
    );

    const prisma = getPrismaClient();
    let snapshotAssetId: string | null = null;
    let snapshotUrl: string | null = null;

    if (analysis.imageBase64) {
      try {
        const decoded = decodeImageBase64(analysis.imageBase64);
        if (decoded.buffer.byteLength > 0) {
          const asset = await this.storage.saveBuffer({
            category: 'vision_snapshot',
            originalName: `vision-snapshot-${Date.now()}.${decoded.ext}`,
            buffer: decoded.buffer,
            mimeType: decoded.mimeType,
            entityType: 'vision_session',
            entityId: DEFAULT_VISION_SESSION_ID,
          });
          snapshotAssetId = asset.id;
          snapshotUrl = asset.url;
          await this.storage.cleanupCategoryRetention('vision_snapshot', 10, [asset.id]);
        }
      } catch (err) {
        this.logger.warn('Failed to persist vision snapshot file', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const saved = await prisma.visionCapture.create({
      data: {
        windowTitle: analysis.windowTitle,
        platform: analysis.platform,
        width: analysis.width,
        height: analysis.height,
        sceneLabel: analysis.sceneLabel,
        motionScore: analysis.motionScore,
        brightness: analysis.brightness,
        processingMs: analysis.processingMs,
        samplingIntervalMs: this.samplingIntervalMs,
        ocrText: analysis.ocrText,
        hudJson: JSON.stringify(analysis.hud),
        objectsJson: JSON.stringify(analysis.objects),
        eventsJson: JSON.stringify(analysis.events),
        capabilitiesJson: JSON.stringify(analysis.capabilities),
      },
    });

    const compactAnalysis = {
      id: saved.id,
      windowTitle: analysis.windowTitle,
      platform: analysis.platform,
      width: analysis.width,
      height: analysis.height,
      sceneLabel: analysis.sceneLabel,
      motionScore: analysis.motionScore,
      brightness: analysis.brightness,
      processingMs: analysis.processingMs,
      samplingIntervalMs: this.samplingIntervalMs,
      ocrText: analysis.ocrText,
      hud: analysis.hud,
      objects: analysis.objects,
      events: analysis.events,
      capabilities: analysis.capabilities,
      createdAt: analysis.createdAt,
      snapshotAssetId,
      snapshotUrl,
    };

    await prisma.visionSession.upsert({
      where: { id: DEFAULT_VISION_SESSION_ID },
      create: {
        id: DEFAULT_VISION_SESSION_ID,
        captureSource: windowTitle,
        targetWindow: windowTitle,
        width: analysis.width,
        height: analysis.height,
        samplingIntervalMs: this.samplingIntervalMs,
        status: this.running ? 'active' : 'idle',
        lastCaptureAt: new Date(analysis.createdAt),
        lastSnapshotAssetId: snapshotAssetId,
        lastAnalysisJson: JSON.stringify(compactAnalysis),
      },
      update: {
        captureSource: windowTitle,
        targetWindow: windowTitle,
        width: analysis.width,
        height: analysis.height,
        samplingIntervalMs: this.samplingIntervalMs,
        status: this.running ? 'active' : 'idle',
        lastCaptureAt: new Date(analysis.createdAt),
        ...(snapshotAssetId ? { lastSnapshotAssetId: snapshotAssetId } : {}),
        lastAnalysisJson: JSON.stringify(compactAnalysis),
      },
    });

    const enriched: VisionAnalysisResult = {
      ...analysis,
      id: saved.id,
      snapshotAssetId,
      snapshotUrl,
      samplingIntervalMs: this.samplingIntervalMs,
    };

    this.broadcast('vision:frame', enriched);
    return enriched;
  }

  public async startMonitor(options?: {
    windowTitle?: string;
    baseIntervalMs?: number;
  }): Promise<VisionMonitorStatus> {
    if (this.running) {
      return this.getStatus();
    }

    this.running = true;
    this.targetWindow = options?.windowTitle ?? 'Primary Display';
    if (options?.baseIntervalMs && options.baseIntervalMs >= 350) {
      this.samplingIntervalMs = options.baseIntervalMs;
    }

    await this.updateSessionConfig({
      targetWindow: this.targetWindow,
      captureSource: this.targetWindow,
      samplingIntervalMs: this.samplingIntervalMs,
    });
    await recordSystemLog('info', 'vision', `Vision monitor started (${this.targetWindow})`);
    this.scheduleNextTick(0);
    return this.getStatus();
  }

  private scheduleNextTick(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.runTick();
    }, delayMs);
  }

  private async runTick(): Promise<void> {
    if (!this.running || this.inFlight) return;
    this.inFlight = true;
    try {
      await this.captureOnce({ windowTitle: this.targetWindow ?? 'Primary Display' });
    } catch (err) {
      this.logger.warn('Vision monitor tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.inFlight = false;
      if (this.running) {
        this.scheduleNextTick(this.samplingIntervalMs);
      }
    }
  }

  public async stopMonitor(): Promise<VisionMonitorStatus> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const prisma = getPrismaClient();
    await prisma.visionSession
      .updateMany({
        where: { id: DEFAULT_VISION_SESSION_ID },
        data: { status: 'stopped' },
      })
      .catch(() => undefined);
    await recordSystemLog('info', 'vision', 'Vision monitor stopped');
    return this.getStatus();
  }

  public async getHistory(limit = 15): Promise<VisionAnalysisResult[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.visionCapture.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });

    return rows.map((row) => ({
      id: row.id,
      windowTitle: row.windowTitle,
      platform: row.platform,
      width: row.width,
      height: row.height,
      imageBase64: '',
      sceneLabel: row.sceneLabel,
      motionScore: row.motionScore,
      brightness: row.brightness,
      processingMs: row.processingMs,
      samplingIntervalMs: row.samplingIntervalMs,
      ocrText: row.ocrText,
      hud: JSON.parse(row.hudJson) as VisionAnalysisResult['hud'],
      objects: JSON.parse(row.objectsJson) as VisionAnalysisResult['objects'],
      events: JSON.parse(row.eventsJson) as VisionAnalysisResult['events'],
      capabilities: JSON.parse(row.capabilitiesJson) as VisionCapabilities,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
