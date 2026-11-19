import {
  AppError,
  ErrorCode,
  type DetectedWindow,
  type VisionAnalysisResult,
  type VisionCapabilities,
  type VisionMonitorStatus,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { Logger } from '../../utils/logger.js';
import type { PythonWorkerClient } from '../../workers/pythonWorkerClient.js';

export type WsBroadcaster = (eventType: string, payload: unknown) => void;

export class VisionService {
  private readonly workerClient: PythonWorkerClient;
  private readonly broadcast: WsBroadcaster;
  private readonly logger: Logger;

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
  ) {
    this.workerClient = workerClient;
    this.broadcast = broadcast;
    this.logger = logger;
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

    const enriched: VisionAnalysisResult = {
      ...analysis,
      id: saved.id,
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
