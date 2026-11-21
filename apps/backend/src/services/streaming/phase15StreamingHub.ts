import crypto from 'node:crypto';
import type {
  ObsDetectionResult,
  ObsRecordingStatus,
  StreamAnalyticsSampleItem,
  StreamSessionHistoryItem,
  TwitchAccountStatus,
  YouTubeAccountStatus,
} from '@ngegame/shared';
import { AppError, ErrorCode } from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { redactSensitiveText, StreamCredentialStore } from './credentialStore.js';
import type { ObsWebSocketClient } from './obsWebSocketClient.js';
import type { StreamNarrationService } from './streamNarrationService.js';

export class Phase15StreamingHub {
  private readonly obsClient: ObsWebSocketClient;
  private readonly credentialStore: StreamCredentialStore;
  private readonly narrationService: StreamNarrationService;

  private obsDetection: ObsDetectionResult | null = null;
  private emergencyStopActive = false;
  private ytClientId = '';
  private ytAuthUrl = '';
  private ytRedirectUri = '';
  private ytState: string | null = null;
  private ytStatus: YouTubeAccountStatus = {
    configured: false,
    connected: false,
    channelTitle: null,
    channelId: null,
    scopes: ['youtube.readonly'],
    broadcast: null,
    chatMessages: [],
    lastSyncedAt: null,
    lastError: null,
  };

  private twClientId = '';
  private twAuthUrl = '';
  private twRedirectUri = '';
  private twState: string | null = null;
  private twStatus: TwitchAccountStatus = {
    configured: false,
    connected: false,
    scopes: ['user:read:email', 'chat:read'],
    channel: null,
    ircConnected: false,
    eventSubConnected: false,
    chatMessages: [],
    lastSyncedAt: null,
    lastError: null,
  };

  constructor(
    obsClient: ObsWebSocketClient,
    credentialStore: StreamCredentialStore,
    narrationService: StreamNarrationService,
  ) {
    this.obsClient = obsClient;
    this.credentialStore = credentialStore;
    this.narrationService = narrationService;
  }

  public isEmergencyStopActive(): boolean {
    return this.emergencyStopActive;
  }

  public clearEmergencyStop(): void {
    this.emergencyStopActive = false;
  }

  public getLastDetection(): ObsDetectionResult | null {
    return this.obsDetection;
  }

  public getYouTubeStatus(): YouTubeAccountStatus {
    return this.ytStatus;
  }

  public getTwitchStatus(): TwitchAccountStatus {
    return this.twStatus;
  }

  public async detectObs(url: string): Promise<ObsDetectionResult> {
    this.obsDetection = await this.obsClient.detectObs(url);
    return this.obsDetection;
  }

  public async getRecordingStatus(): Promise<ObsRecordingStatus> {
    const rec: ObsRecordingStatus = {
      recording: false,
      paused: false,
      durationSeconds: 0,
      bytes: 0,
      outputPath: null,
    };
    if (!this.obsClient.isConnected()) return rec;
    try {
      const res = await this.obsClient.request('GetRecordStatus');
      rec.recording = Boolean(res.outputActive);
      rec.paused = Boolean(res.outputPaused);
      rec.durationSeconds = Math.round(Number(res.outputDuration ?? 0) / 1000);
      rec.bytes = Number(res.outputBytes ?? 0);
    } catch {
      // ignore if unsupported
    }
    return rec;
  }

  public async emergencyStop(activeSessionId: number | null): Promise<void> {
    this.emergencyStopActive = true;
    this.narrationService.interrupt();
    if (this.obsClient.isConnected()) {
      await this.obsClient.request('StopStream').catch(() => undefined);
      await this.obsClient.request('StopRecord').catch(() => undefined);
    }
    if (activeSessionId !== null) {
      await getPrismaClient().streamSessionLog.update({
        where: { id: activeSessionId },
        data: { status: 'emergency_stopped', endedAt: new Date() },
      });
    }
    await recordSystemLog('warn', 'streaming', 'EMERGENCY STOP siaran & narasi diaktifkan');
  }

  public async configureYouTube(input: {
    clientId: string;
    authEndpoint?: string;
    redirectUri?: string;
    allowManage?: boolean;
  }): Promise<YouTubeAccountStatus> {
    if (!input.clientId?.trim()) {
      throw new AppError('clientId YouTube wajib diisi', ErrorCode.VALIDATION_ERROR, 400);
    }
    this.ytClientId = input.clientId.trim();
    if (input.authEndpoint?.trim()) this.ytAuthUrl = input.authEndpoint.trim();
    if (input.redirectUri?.trim()) this.ytRedirectUri = input.redirectUri.trim();
    this.ytStatus.scopes = input.allowManage
      ? ['youtube.readonly', 'youtube']
      : ['youtube.readonly'];
    await this.credentialStore.saveSecret('yt-app-id', this.ytClientId);
    this.ytStatus.configured = true;
    this.ytStatus.lastError = null;
    return this.ytStatus;
  }

  public async getYouTubeAuthUrl(): Promise<{ url: string; state: string; scopes: string[] }> {
    const cid = this.ytClientId || (await this.credentialStore.getSecret('yt-app-id')) || '';
    if (!cid || !this.ytAuthUrl) {
      throw new AppError(
        'Konfigurasi Client ID dan Auth Endpoint YouTube terlebih dahulu.',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }
    const state = crypto.randomBytes(12).toString('hex');
    this.ytState = state;
    const url = new URL(this.ytAuthUrl);
    url.searchParams.set('client_id', cid);
    if (this.ytRedirectUri) url.searchParams.set('redirect_uri', this.ytRedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.ytStatus.scopes.join(' '));
    url.searchParams.set('state', state);
    return { url: url.toString(), state, scopes: this.ytStatus.scopes };
  }

  public async handleYouTubeCallback(code: string, state?: string): Promise<YouTubeAccountStatus> {
    if (!code?.trim()) throw new AppError('Code YouTube kosong', ErrorCode.VALIDATION_ERROR, 400);
    if (this.ytState && state && state !== this.ytState) {
      throw new AppError('OAuth state mismatch', ErrorCode.VALIDATION_ERROR, 400);
    }
    await this.credentialStore.saveSecret('yt-cred-primary', code.trim());
    return this.syncYouTube();
  }

  public async syncYouTube(): Promise<YouTubeAccountStatus> {
    const cred = await this.credentialStore.getSecret('yt-cred-primary');
    this.ytStatus.connected = Boolean(cred);
    this.ytStatus.lastSyncedAt = new Date().toISOString();
    return this.ytStatus;
  }

  public async disconnectYouTube(): Promise<YouTubeAccountStatus> {
    await this.credentialStore.deleteSecret('yt-cred-primary');
    this.ytStatus.connected = false;
    this.ytStatus.channelTitle = null;
    this.ytStatus.broadcast = null;
    this.ytStatus.lastError = null;
    return this.ytStatus;
  }

  public async configureTwitch(input: {
    clientId: string;
    authEndpoint?: string;
    redirectUri?: string;
    allowManage?: boolean;
  }): Promise<TwitchAccountStatus> {
    if (!input.clientId?.trim()) {
      throw new AppError('clientId Twitch wajib diisi', ErrorCode.VALIDATION_ERROR, 400);
    }
    this.twClientId = input.clientId.trim();
    if (input.authEndpoint?.trim()) this.twAuthUrl = input.authEndpoint.trim();
    if (input.redirectUri?.trim()) this.twRedirectUri = input.redirectUri.trim();
    this.twStatus.scopes = input.allowManage
      ? ['user:read:email', 'chat:read', 'chat:edit', 'channel:manage:broadcast']
      : ['user:read:email', 'chat:read'];
    await this.credentialStore.saveSecret('tw-app-id', this.twClientId);
    this.twStatus.configured = true;
    this.twStatus.lastError = null;
    return this.twStatus;
  }

  public async getTwitchAuthUrl(): Promise<{ url: string; state: string; scopes: string[] }> {
    const cid = this.twClientId || (await this.credentialStore.getSecret('tw-app-id')) || '';
    if (!cid || !this.twAuthUrl) {
      throw new AppError(
        'Konfigurasi Client ID dan Auth Endpoint Twitch terlebih dahulu.',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }
    const state = crypto.randomBytes(12).toString('hex');
    this.twState = state;
    const url = new URL(this.twAuthUrl);
    url.searchParams.set('client_id', cid);
    if (this.twRedirectUri) url.searchParams.set('redirect_uri', this.twRedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.twStatus.scopes.join(' '));
    url.searchParams.set('state', state);
    return { url: url.toString(), state, scopes: this.twStatus.scopes };
  }

  public async handleTwitchCallback(code: string, state?: string): Promise<TwitchAccountStatus> {
    if (!code?.trim()) throw new AppError('Code Twitch kosong', ErrorCode.VALIDATION_ERROR, 400);
    if (this.twState && state && state !== this.twState) {
      throw new AppError('OAuth state mismatch', ErrorCode.VALIDATION_ERROR, 400);
    }
    await this.credentialStore.saveSecret('tw-cred-primary', code.trim());
    return this.syncTwitch();
  }

  public async syncTwitch(): Promise<TwitchAccountStatus> {
    const cred = await this.credentialStore.getSecret('tw-cred-primary');
    this.twStatus.connected = Boolean(cred);
    this.twStatus.lastSyncedAt = new Date().toISOString();
    return this.twStatus;
  }

  public async disconnectTwitch(): Promise<TwitchAccountStatus> {
    await this.credentialStore.deleteSecret('tw-cred-primary');
    this.twStatus.connected = false;
    this.twStatus.channel = null;
    this.twStatus.lastError = null;
    return this.twStatus;
  }

  public async recordSample(input: {
    sessionId: number | null;
    bitrateKbps: number;
    fps: number;
    droppedFrames: number;
    audioLevelDb: number;
  }): Promise<void> {
    try {
      await getPrismaClient().streamAnalyticsSample.create({
        data: {
          sessionId: input.sessionId,
          bitrateKbps: input.bitrateKbps,
          fps: input.fps,
          droppedFrames: input.droppedFrames,
          audioLevelDb: input.audioLevelDb,
          viewers: this.twStatus.channel?.viewerCount ?? 0,
          chatCount: this.ytStatus.chatMessages.length + this.twStatus.chatMessages.length,
        },
      });
    } catch {
      // non-fatal
    }
  }

  public async getAnalyticsAndHistory(): Promise<{
    samples: StreamAnalyticsSampleItem[];
    sessions: StreamSessionHistoryItem[];
  }> {
    const prisma = getPrismaClient();
    const [samples, sessions] = await Promise.all([
      prisma.streamAnalyticsSample.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.streamSessionLog.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
    ]);
    return {
      samples: samples.map((s) => ({
        id: s.id,
        sessionId: s.sessionId,
        bitrateKbps: s.bitrateKbps,
        fps: s.fps,
        droppedFrames: s.droppedFrames,
        audioLevelDb: s.audioLevelDb,
        viewers: s.viewers,
        chatCount: s.chatCount,
        createdAt: s.createdAt.toISOString(),
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        platforms: s.platforms,
        visibility: s.visibility,
        title: s.title,
        avgBitrate: s.avgBitrate,
        peakBitrate: s.peakBitrate,
        avgFps: s.avgFps,
        droppedFrames: s.droppedFrames,
        durationSeconds: s.durationSeconds,
        chatCount: s.chatCount,
        narrationCount: s.narrationCount,
        peakViewers: s.peakViewers,
        status: s.status,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt ? s.endedAt.toISOString() : null,
      })),
    };
  }

  public formatError(err: unknown): string {
    return redactSensitiveText(err instanceof Error ? err.message : String(err));
  }
}
