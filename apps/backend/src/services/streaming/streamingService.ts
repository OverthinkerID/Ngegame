import {
  AppError,
  ErrorCode,
  type MultistreamTarget,
  type ObsAudioInput,
  type ObsDetectionResult,
  type ObsSceneItem,
  type ObsSourceItem,
  type SaveStreamCredentialRequest,
  type StreamAnalyticsSampleItem,
  type StreamHealthMetrics,
  type StreamingStatusResponse,
  type StreamPlatform,
  type StreamSessionHistoryItem,
  type TwitchAccountStatus,
  type YouTubeAccountStatus,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { Logger } from '../../utils/logger.js';
import { maskSecret, StreamCredentialStore } from './credentialStore.js';
import { ObsWebSocketClient } from './obsWebSocketClient.js';
import { Phase15StreamingHub } from './phase15StreamingHub.js';
import { StreamAssistantService } from './streamAssistantService.js';
import { StreamNarrationService } from './streamNarrationService.js';

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
  public readonly narrationService: StreamNarrationService;
  public readonly assistantService: StreamAssistantService;
  private readonly hub: Phase15StreamingHub;

  private obsUrl = process.env.OBS_WS_URL ?? 'ws://localhost:4455';
  private obsCredStored = false;
  private lastError: string | null = null;
  private previewImageBase64: string | null = null;
  private activeSessionId: number | null = null;
  private prevOutputBytes = 0;
  private prevSampleTimeMs = 0;
  private lastBitrateKbps = 0;

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
    this.narrationService = new StreamNarrationService(this.obsClient);
    this.assistantService = new StreamAssistantService(this.obsClient, this.narrationService);
    this.hub = new Phase15StreamingHub(this.obsClient, this.credentialStore, this.narrationService);
  }

  public async detectObs(): Promise<ObsDetectionResult> {
    return this.hub.detectObs(this.obsUrl);
  }

  public async connectObs(url: string, password?: string): Promise<StreamingStatusResponse> {
    this.obsUrl = url.trim() || this.obsUrl;
    if (password && password.trim()) {
      await this.credentialStore.saveSecret('obs-ws-cred', password.trim());
      this.obsCredStored = true;
    }
    const secret =
      password?.trim() || (await this.credentialStore.getSecret('obs-ws-cred')) || undefined;
    try {
      await this.obsClient.connect(this.obsUrl, secret);
      this.lastError = null;
      await recordSystemLog('info', 'streaming', `Connected to OBS WebSocket (${this.obsUrl})`);
    } catch (err) {
      this.lastError = `OBS tidak terjangkau di ${this.obsUrl}: ${this.hub.formatError(err)}`;
      this.logger.warn(this.lastError);
    }
    return this.getStatus();
  }

  public async reconnectObs(): Promise<StreamingStatusResponse> {
    try {
      await this.obsClient.reconnect();
      this.lastError = null;
    } catch (err) {
      this.lastError = this.hub.formatError(err);
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

  public async setAudioVolume(
    inputName: string,
    volumeDb: number,
  ): Promise<StreamingStatusResponse> {
    await this.obsClient.request('SetInputVolume', {
      inputName,
      inputVolumeDb: Math.max(-60, Math.min(0, volumeDb)),
    });
    return this.getStatus();
  }

  public async startRecording(): Promise<StreamingStatusResponse> {
    await this.obsClient.request('StartRecord');
    return this.getStatus();
  }

  public async stopRecording(): Promise<StreamingStatusResponse> {
    await this.obsClient.request('StopRecord');
    return this.getStatus();
  }

  public async toggleRecordingPause(): Promise<StreamingStatusResponse> {
    await this.obsClient.request('ToggleRecordPause');
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

  public async startStreaming(options?: {
    confirmedPublic?: boolean;
    title?: string;
  }): Promise<StreamingStatusResponse> {
    this.hub.clearEmergencyStop();
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

    if (
      enabledPlatforms.some((p) => this.targets[p].visibilityMode === 'public') &&
      !options?.confirmedPublic
    ) {
      throw new AppError(
        'Siaran publik memerlukan konfirmasi eksplisit pengguna sebelum mengudara.',
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
        title: options?.title?.trim() || 'Sesi Siaran Overthinker',
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
    const before = await this.getStatus();
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
        data: {
          status: 'ended',
          endedAt: new Date(),
          avgBitrate: before.health.bitrateKbps,
          avgFps: before.health.fps,
          droppedFrames: before.health.droppedFrames,
          durationSeconds: before.health.durationSeconds,
          narrationCount: this.narrationService.getNarrationCount(),
        },
      });
      this.activeSessionId = null;
    }

    await recordSystemLog('info', 'streaming', 'Streaming stopped');
    return this.getStatus();
  }

  public async emergencyStop(): Promise<StreamingStatusResponse> {
    await this.hub.emergencyStop(this.activeSessionId);
    this.activeSessionId = null;
    return this.getStatus();
  }

  public async configureYouTubeOAuth(input: {
    clientId: string;
    authEndpoint?: string;
    redirectUri?: string;
    allowManage?: boolean;
  }): Promise<YouTubeAccountStatus> {
    return this.hub.configureYouTube(input);
  }

  public async getYouTubeAuthUrl(): Promise<{ url: string; state: string; scopes: string[] }> {
    return this.hub.getYouTubeAuthUrl();
  }

  public async handleYouTubeCallback(code: string, state?: string): Promise<YouTubeAccountStatus> {
    return this.hub.handleYouTubeCallback(code, state);
  }

  public async syncYouTube(): Promise<YouTubeAccountStatus> {
    return this.hub.syncYouTube();
  }

  public async disconnectYouTube(): Promise<YouTubeAccountStatus> {
    return this.hub.disconnectYouTube();
  }

  public async configureTwitchOAuth(input: {
    clientId: string;
    authEndpoint?: string;
    redirectUri?: string;
    allowManage?: boolean;
  }): Promise<TwitchAccountStatus> {
    return this.hub.configureTwitch(input);
  }

  public async getTwitchAuthUrl(): Promise<{ url: string; state: string; scopes: string[] }> {
    return this.hub.getTwitchAuthUrl();
  }

  public async handleTwitchCallback(code: string, state?: string): Promise<TwitchAccountStatus> {
    return this.hub.handleTwitchCallback(code, state);
  }

  public async syncTwitch(): Promise<TwitchAccountStatus> {
    return this.hub.syncTwitch();
  }

  public async disconnectTwitch(): Promise<TwitchAccountStatus> {
    return this.hub.disconnectTwitch();
  }

  public async getAnalyticsAndHistory(): Promise<{
    samples: StreamAnalyticsSampleItem[];
    sessions: StreamSessionHistoryItem[];
  }> {
    return this.hub.getAnalyticsAndHistory();
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
              inputKind?: string;
            };
            return {
              sceneItemId: Number(rec.sceneItemId ?? 0),
              sourceName: String(rec.sourceName ?? ''),
              visible: Boolean(rec.sceneItemEnabled ?? true),
              inputKind: rec.inputKind,
            };
          });
        }

        const inputsRes = await this.obsClient.request('GetInputList');
        const rawInputs = Array.isArray(inputsRes.inputs) ? inputsRes.inputs : [];
        audioInputs = await Promise.all(
          rawInputs.slice(0, 8).map(async (inp) => {
            const inputName = String((inp as { inputName?: string }).inputName ?? '');
            const inputKind = String((inp as { inputKind?: string }).inputKind ?? '');
            let muted = false;
            let volumeDb = 0;
            let volumeMul = 1;
            try {
              const m = await this.obsClient.request('GetInputMute', { inputName });
              muted = Boolean(m.inputMuted);
              const v = await this.obsClient.request('GetInputVolume', { inputName });
              volumeDb = Number(v.inputVolumeDb ?? 0);
              volumeMul = Number(v.inputVolumeMul ?? 1);
            } catch {
              // non-audio input
            }
            return { inputName, inputKind, muted, volumeDb, volumeMul };
          }),
        );

        const streamStatus = await this.obsClient.request('GetStreamStatus');
        const stats = await this.obsClient.request('GetStats');
        const totalFrames = Number(streamStatus.outputTotalFrames ?? 0);
        const droppedFrames = Number(streamStatus.outputSkippedFrames ?? 0);
        const outputBytes = Number(streamStatus.outputBytes ?? 0);
        const nowMs = Date.now();
        if (this.prevSampleTimeMs > 0 && outputBytes > this.prevOutputBytes) {
          const dtSec = Math.max(0.25, (nowMs - this.prevSampleTimeMs) / 1000);
          this.lastBitrateKbps = Math.round(((outputBytes - this.prevOutputBytes) * 8) / (dtSec * 1000));
        }
        this.prevOutputBytes = outputBytes;
        this.prevSampleTimeMs = nowMs;

        health.streaming = Boolean(streamStatus.outputActive);
        health.reconnecting = Boolean(streamStatus.outputReconnecting);
        health.durationSeconds = Math.round(Number(streamStatus.outputDuration ?? 0) / 1000);
        health.bitrateKbps = health.streaming ? this.lastBitrateKbps : 0;
        health.droppedFrames = droppedFrames;
        health.totalFrames = totalFrames;
        health.droppedPercent =
          totalFrames > 0 ? Number(((droppedFrames / totalFrames) * 100).toFixed(2)) : 0;
        health.congestion = Number(streamStatus.outputCongestion ?? 0);
        health.fps = Math.round(Number(stats.activeFps ?? 0));

        if (health.streaming) {
          await this.hub.recordSample({
            sessionId: this.activeSessionId,
            bitrateKbps: health.bitrateKbps,
            fps: health.fps,
            droppedFrames: health.droppedFrames,
            audioLevelDb: audioInputs[0]?.volumeDb ?? -12,
          });
        }
      } catch (err) {
        this.lastError = this.hub.formatError(err);
      }
    }

    const recording = await this.hub.getRecordingStatus();
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
          bandwidthKbps: health.streaming && cfg.enabled ? health.bitrateKbps : 0,
          status:
            health.streaming && cfg.enabled
              ? 'streaming'
              : cfg.hasStreamKey
                ? 'ready'
                : 'unconfigured',
        };
      },
    );
    const yt = this.hub.getYouTubeStatus();
    const tw = this.hub.getTwitchStatus();

    return {
      obsConnected,
      obsReconnecting: this.obsClient.isReconnecting(),
      obsVersion: this.obsClient.getObsVersion(),
      obsUrl: this.obsUrl,
      obsDetection: this.hub.getLastDetection(),
      currentScene,
      scenes,
      sources,
      audioInputs,
      recording,
      health,
      targets,
      youtube: yt,
      twitch: tw,
      narration: this.narrationService.getStatus(),
      assistant: this.assistantService.getStatus(),
      vault: {
        vaultBackend: this.credentialStore.getVaultBackend(),
        obsPasswordStored: this.obsCredStored,
        youtubeOAuthConfigured: yt.configured,
        youtubeOAuthConnected: yt.connected,
        twitchOAuthConfigured: tw.configured,
        twitchOAuthConnected: tw.connected,
        youtubeStreamKeyMasked: this.targets.youtube.maskedKey,
        twitchStreamKeyMasked: this.targets.twitch.maskedKey,
        emergencyStopActive: this.hub.isEmergencyStopActive(),
      },
      previewImageBase64: this.previewImageBase64,
      lastError: this.lastError,
    };
  }
}
