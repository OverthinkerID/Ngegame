import crypto from 'node:crypto';
import type {
  NarrationConfig,
  NarrationQueueItem,
  NarrationStatusResponse,
  VoiceEmotion,
} from '@ngegame/shared';
import { getPrismaClient } from '../../db/prisma.js';
import { VoiceStudioService } from '../voice/voiceService.js';
import type { ObsWebSocketClient } from './obsWebSocketClient.js';

export class StreamNarrationService {
  private readonly voiceService: VoiceStudioService;
  private readonly obsClient: ObsWebSocketClient;

  private config: NarrationConfig = {
    autoNarration: false,
    minCooldownSeconds: 8,
    volume: 85,
    routeToObs: true,
    obsAudioInputName: 'Desktop Audio',
    interruptOnUrgent: true,
  };

  private queue: NarrationQueueItem[] = [];
  private history: NarrationQueueItem[] = [];
  private speaking = false;
  private interrupted = false;
  private lastVerifiedGameState: string | null = null;
  private lastError: string | null = null;
  private narrationCount = 0;

  constructor(obsClient: ObsWebSocketClient, voiceService = new VoiceStudioService()) {
    this.obsClient = obsClient;
    this.voiceService = voiceService;
  }

  public getNarrationCount(): number {
    return this.narrationCount;
  }

  public async updateConfig(partial: Partial<NarrationConfig>): Promise<NarrationStatusResponse> {
    this.config = {
      ...this.config,
      ...partial,
      minCooldownSeconds: Math.max(0, Math.min(60, partial.minCooldownSeconds ?? this.config.minCooldownSeconds)),
      volume: Math.max(0, Math.min(100, partial.volume ?? this.config.volume)),
    };
    await this.voiceService.updateSettings({
      volume: this.config.volume,
      minCooldownSeconds: this.config.minCooldownSeconds,
    });
    return this.getStatus();
  }

  public async enqueueNarration(input: {
    text: string;
    emotion?: VoiceEmotion;
    source?: NarrationQueueItem['source'];
    verifiedGameState?: string;
    urgent?: boolean;
  }): Promise<NarrationStatusResponse> {
    const cleanText = input.text.trim();
    if (!cleanText) return this.getStatus();

    if (input.urgent && this.config.interruptOnUrgent && this.speaking) {
      this.interrupt();
    }

    const item: NarrationQueueItem = {
      id: crypto.randomUUID(),
      text: cleanText,
      emotion: input.emotion ?? 'neutral',
      source: input.source ?? 'manual',
      status: 'queued',
      verifiedGameState: input.verifiedGameState,
      createdAt: new Date().toISOString(),
    };
    if (input.verifiedGameState) {
      this.lastVerifiedGameState = input.verifiedGameState;
    }

    this.queue.push(item);
    void this.processQueue();
    return this.getStatus();
  }

  public async narrateFromVerifiedVision(): Promise<NarrationStatusResponse> {
    const prisma = getPrismaClient();
    const latest = await prisma.visionCapture.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) {
      this.lastError = 'Belum ada frame visi terverifikasi untuk narasi otomatis.';
      return this.getStatus();
    }

    const stateDesc = `${latest.windowTitle} • scene=${latest.sceneLabel} • motion=${latest.motionScore.toFixed(2)}`;
    this.lastVerifiedGameState = stateDesc;

    const text = latest.ocrText.trim()
      ? `Terpantau di ${latest.windowTitle} pada adegan ${latest.sceneLabel}, layar menampilkan teks ${latest.ocrText.slice(0, 80)}.`
      : `Terpantau di ${latest.windowTitle} pada adegan ${latest.sceneLabel} dengan tingkat gerak ${latest.motionScore.toFixed(2)}.`;

    return this.enqueueNarration({
      text,
      emotion: latest.motionScore > 0.25 ? 'excited' : 'calm',
      source: 'auto-gameplay',
      verifiedGameState: stateDesc,
    });
  }

  private async processQueue(): Promise<void> {
    if (this.speaking) return;
    this.speaking = true;
    this.interrupted = false;

    try {
      while (this.queue.length > 0 && !this.interrupted) {
        const next = this.queue.shift()!;
        next.status = 'speaking';

        // Route & ensure OBS audio input unmuted when routing enabled
        if (this.config.routeToObs && this.obsClient.isConnected()) {
          try {
            await this.obsClient.request('SetInputMute', {
              inputName: this.config.obsAudioInputName,
              inputMuted: false,
            });
          } catch {
            // Input name may differ in user's OBS profile
          }
        }

        try {
          await this.voiceService.speak({
            text: next.text,
            emotion: next.emotion,
            playAudio: true,
          });
          next.status = this.interrupted ? 'interrupted' : 'completed';
          this.narrationCount += 1;
          this.lastError = null;
        } catch (err) {
          next.status = 'failed';
          this.lastError = err instanceof Error ? err.message : String(err);
        }

        this.history = [next, ...this.history].slice(0, 20);
      }
    } finally {
      this.speaking = false;
    }
  }

  public interrupt(): NarrationStatusResponse {
    this.interrupted = true;
    for (const item of this.queue) {
      item.status = 'interrupted';
      this.history = [item, ...this.history].slice(0, 20);
    }
    this.queue = [];
    return this.getStatus();
  }

  public getStatus(): NarrationStatusResponse {
    return {
      speaking: this.speaking,
      config: this.config,
      queue: this.queue,
      history: this.history,
      lastVerifiedGameState: this.lastVerifiedGameState,
      lastError: this.lastError,
    };
  }
}
