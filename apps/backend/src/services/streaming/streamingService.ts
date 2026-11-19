import {
  AppError,
  ErrorCode,
  type MultistreamTarget,
  type ObsAudioInput,
  type ObsSceneItem,
  type ObsSourceItem,
  type SaveStreamCredentialRequest,
  type StreamHealthMetrics,
  type StreamingStatusResponse,
  type StreamPlatform,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { Logger } from '../../utils/logger.js';
import { maskSecret, StreamCredentialStore } from './credentialStore.js';
import { ObsWebSocketClient } from './obsWebSocketClient.js';

interface TargetConfigState {
  enabled: boolean;
  rtmpUrl: string;
  visibilityMode: 'private' | 'unlisted' | 'public';
  maskedKey: string | null;
  hasStreamKey: boolean;
}

export class StreamingService {
  private readonly logger: Logger;
  private readonly obsClient = new ObsWebSocketClient();
  private readonly credentialStore = new StreamCredentialStore();

  private obsUrl = process.env.OBS_WS_URL ?? 'ws://localhost:4455';
  private lastError: string | null = null;
  private previewImageBase64: string | null = null;
  private activeSessionId: number | null = null;

  private targets: Record<StreamPlatform, TargetConfigState> = {
    youtube: {
      enabled: true,
      rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
      visibilityMode: 'unlisted',
      maskedKey: null,
      hasStreamKey: false,
    },
    twitch: {
      enabled: true,
      rtmpUrl: 'rtmp://live.twitch.tv/app',
      visibilityMode: 'private',
      maskedKey: null,
      hasStreamKey: false,
    },
  };

  constructor(logger = new Logger('streaming-service')) {
    this.logger = logger;
  }

  public async connectObs(url: string, password?: string): Promise<StreamingStatusResponse> {
    this.obsUrl = url.trim() || this.obsUrl;
    try {
      await this.obsClient.connect(this.obsUrl, password);
      this.lastError = null;
      await recordSystemLog('info', 'streaming', `Connected to OBS WebSocket (${this.obsUrl})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = `OBS tidak terjangkau di ${this.obsUrl}: ${msg}`;
      this.logger.warn(this.lastError);
    }
    return this.getStatus();
  }

  public async disconnectObs(): Promise<StreamingStatusResponse> {
    await this.obsClient.disconnect();
    await recordSystemLog('info', 'streaming', 'Disconnected from OBS WebSocket');
    return this.getStatus();
  }

  public async saveCredential(
    req: SaveStreamCredentialRequest,
  ): Promise<StreamingStatusResponse> {
    if (req.platform !== 'youtube' && req.platform !== 'twitch') {
      throw new AppError('Invalid streaming platform', ErrorCode.VALIDATION_ERROR, 400);
    }
    if (!req.streamKey || !req.streamKey.trim()) {
      throw new AppError('streamKey is required', ErrorCode.VALIDATION_ERROR, 400);
    }

    const storageMode = await this.credentialStore.saveSecret(
      `stream-key-${req.platform}`,
      req.streamKey,
    );

    const target = this.targets[req.platform];
    target.hasStreamKey = true;
    target.maskedKey = maskSecret(req.streamKey);
    if (req.rtmpUrl && req.rtmpUrl.trim()) {
      target.rtmpUrl = req.rtmpUrl.trim();
    }
    if (req.visibilityMode) {
      target.visibilityMode = req.visibilityMode;
    }
    if (typeof req.enabled === 'boolean') {
      target.enabled = req.enabled;
    }

    // Never log plaintext stream key!
    await recordSystemLog(
      'info',
      'streaming',
      `Stream credential saved securely for ${req.platform} via ${storageMode} (key=${target.maskedKey})`,
    );

    return this.getStatus();
  }

  public async deleteCredential(platform: StreamPlatform): Promise<StreamingStatusResponse> {
    await this.credentialStore.deleteSecret(`stream-key-${platform}`);
    this.targets[platform].hasStreamKey = false;
    this.targets[platform].maskedKey = null;
    await recordSystemLog('info', 'streaming', `Stream credential removed for ${platform}`);
    return this.getStatus();
  }

  public async setScene(sceneName: string): Promise<StreamingStatusResponse> {
    await this.obsClient.request('SetCurrentProgramScene', { sceneName });
    return this.getStatus();
  }

  public async toggleSource(
    sceneItemId: number,
    visible: boolean,
  ): Promise<StreamingStatusResponse> {
    const status = await this.getStatus();
    if (status.currentScene) {
      await this.obsClient.request('SetSceneItemEnabled', {
        sceneName: status.currentScene,
        sceneItemId,
        sceneItemEnabled: visible,
      });
    }
    return this.getStatus();
  }

  public async setAudioMute(
    inputName: string,
    muted: boolean,
  ): Promise<StreamingStatusResponse> {
    await this.obsClient.request('SetInputMute', {
      inputName,
      inputMuted: muted,
    });
    return this.getStatus();
  }

  public async capturePreview(): Promise<StreamingStatusResponse> {
    const status = await this.getStatus();
    if (this.obsClient.isConnected() && status.currentScene) {
      try {
        const res = await this.obsClient.request('GetSourceScreenshot', {
          sourceName: status.currentScene,
          imageFormat: 'png',
          imageWidth: 640,
        });
        if (typeof res.imageData === 'string') {
          this.previewImageBase64 = res.imageData;
        }
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
      }
    }
    return this.getStatus();
  }

  public async startStreaming(): Promise<StreamingStatusResponse> {
    const enabledPlatforms = (Object.keys(this.targets) as StreamPlatform[]).filter(
      (p) => this.targets[p].enabled,
    );

    if (enabledPlatforms.length === 0) {
      throw new AppError(
        'Aktifkan minimal satu target stream (YouTube atau Twitch)',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    const missingKeys = enabledPlatforms.filter((p) => !this.targets[p].hasStreamKey);
    if (missingKeys.length > 0) {
      throw new AppError(
        `Stream key belum dikonfigurasi untuk: ${missingKeys.join(', ')}`,
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    if (!this.obsClient.isConnected()) {
      throw new AppError(
        'OBS Studio WebSocket belum terhubung. Hubungkan OBS terlebih dahulu.',
        ErrorCode.WORKER_UNAVAILABLE,
        503,
      );
    }

    // Configure primary stream service in OBS from Credential Manager (never persisted to SQLite)
    const primaryPlatform = enabledPlatforms[0] ?? 'youtube';
    const primaryKey = await this.credentialStore.getSecret(`stream-key-${primaryPlatform}`);
    if (primaryKey) {
      await this.obsClient.request('SetStreamServiceSettings', {
        streamServiceType: 'rtmp_custom',
        streamServiceSettings: {
          server: this.targets[primaryPlatform].rtmpUrl,
          key: primaryKey,
        },
      });
    }

    await this.obsClient.request('StartStream');

    const prisma = getPrismaClient();
    const session = await prisma.streamSessionLog.create({
      data: {
        platforms: enabledPlatforms.join(','),
        visibility: this.targets[primaryPlatform].visibilityMode,
        status: 'streaming',
      },
    });
    this.activeSessionId = session.id;
    await recordSystemLog(
      'info',
      'streaming',
      `Streaming started (${enabledPlatforms.join(' + ')}, mode=${this.targets[primaryPlatform].visibilityMode})`,
    );

    return this.getStatus();
  }

  public async stopStreaming(): Promise<StreamingStatusResponse> {
    if (this.obsClient.isConnected()) {
      try {
        await this.obsClient.request('StopStream');
      } catch {
        // ignore if already stopped
      }
    }

    if (this.activeSessionId !== null) {
      const prisma = getPrismaClient();
      await prisma.streamSessionLog.update({
        where: { id: this.activeSessionId },
        data: { status: 'ended', endedAt: new Date() },
      });
      this.activeSessionId = null;
    }

    await recordSystemLog('info', 'streaming', 'Streaming stopped');
    return this.getStatus();
  }

  public async getStatus(): Promise<StreamingStatusResponse> {
    const obsConnected = this.obsClient.isConnected();
    let currentScene: string | null = null;
    let scenes: ObsSceneItem[] = [];
    let sources: ObsSourceItem[] = [];
    let audioInputs: ObsAudioInput[] = [];
    const health: StreamHealthMetrics = {
      streaming: false,
      reconnecting: false,
      durationSeconds: 0,
      bitrateKbps: 0,
      fps: 0,
      droppedFrames: 0,
      totalFrames: 0,
      droppedPercent: 0,
      congestion: 0,
    };

    if (obsConnected) {
      try {
        const sceneList = await this.obsClient.request('GetSceneList');
        currentScene =
          typeof sceneList.currentProgramSceneName === 'string'
            ? sceneList.currentProgramSceneName
            : null;
        const rawScenes = Array.isArray(sceneList.scenes) ? sceneList.scenes : [];
        scenes = rawScenes.map((s) => {
          const name = String((s as { sceneName?: string }).sceneName ?? '');
          return { sceneName: name, isCurrent: name === currentScene };
        });

        if (currentScene) {
          const itemList = await this.obsClient.request('GetSceneItemList', {
            sceneName: currentScene,
          });
          const rawItems = Array.isArray(itemList.sceneItems) ? itemList.sceneItems : [];
          sources = rawItems.map((item) => {
            const rec = item as {
              sceneItemId?: number;
              sourceName?: string;
              sceneItemEnabled?: boolean;
            };
            return {
              sceneItemId: Number(rec.sceneItemId ?? 0),
              sourceName: String(rec.sourceName ?? ''),
              visible: Boolean(rec.sceneItemEnabled ?? true),
            };
          });
        }

        const inputsRes = await this.obsClient.request('GetInputList');
        const rawInputs = Array.isArray(inputsRes.inputs) ? inputsRes.inputs : [];
        audioInputs = rawInputs.slice(0, 6).map((inp) => ({
          inputName: String((inp as { inputName?: string }).inputName ?? ''),
          muted: false,
          volumeDb: 0,
        }));

        const streamStatus = await this.obsClient.request('GetStreamStatus');
        const stats = await this.obsClient.request('GetStats');
        const totalFrames = Number(streamStatus.outputTotalFrames ?? 0);
        const droppedFrames = Number(streamStatus.outputSkippedFrames ?? 0);
        health.streaming = Boolean(streamStatus.outputActive);
        health.reconnecting = Boolean(streamStatus.outputReconnecting);
        health.durationSeconds = Math.round(Number(streamStatus.outputDuration ?? 0) / 1000);
        health.droppedFrames = droppedFrames;
        health.totalFrames = totalFrames;
        health.droppedPercent =
          totalFrames > 0 ? Number(((droppedFrames / totalFrames) * 100).toFixed(2)) : 0;
        health.congestion = Number(streamStatus.outputCongestion ?? 0);
        health.fps = Math.round(Number(stats.activeFps ?? 0));
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
      }
    }

    const targets: MultistreamTarget[] = (['youtube', 'twitch'] as StreamPlatform[]).map(
      (platform) => {
        const cfg = this.targets[platform];
        return {
          platform,
          enabled: cfg.enabled,
          rtmpUrl: cfg.rtmpUrl,
          hasStreamKey: cfg.hasStreamKey,
          maskedKey: cfg.maskedKey,
          visibilityMode: cfg.visibilityMode,
          status: health.streaming && cfg.enabled
            ? 'streaming'
            : cfg.hasStreamKey
              ? 'ready'
              : 'unconfigured',
        };
      },
    );

    return {
      obsConnected,
      obsUrl: this.obsUrl,
      currentScene,
      scenes,
      sources,
      audioInputs,
      health,
      targets,
      previewImageBase64: this.previewImageBase64,
      lastError: this.lastError,
    };
  }
}
