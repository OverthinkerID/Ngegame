import crypto from 'node:crypto';
import type {
  CommentaryLanguage,
  StreamVoiceProfile,
  VoiceEmotion,
  VoicePersonalityConfig,
  VoicePersonalityStatusResponse,
  VoiceQueueEntry,
} from '@ngegame/shared';
import { AppError, ErrorCode } from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import type { ObsWebSocketClient } from '../streaming/obsWebSocketClient.js';
import { VoiceStudioService } from '../voice/voiceService.js';
import type { StreamWsBroadcaster } from './gameplayEventIntelligenceService.js';

const DEFAULT_VOICE_PROFILES: StreamVoiceProfile[] = [
  {
    id: 'overthinker-casual-id',
    name: 'Overthinker Santai (ID)',
    engine: 'voxcpm2',
    language: 'id',
    speed: 1.0,
    pitch: 1.0,
    emotion: 'neutral',
    expressiveness: 0.75,
    isDefault: true,
  },
  {
    id: 'overthinker-funny-id',
    name: 'Overthinker Kocak (ID)',
    engine: 'voxcpm2',
    language: 'id',
    speed: 1.08,
    pitch: 1.05,
    emotion: 'humorous',
    expressiveness: 0.9,
    isDefault: false,
  },
  {
    id: 'overthinker-cinematic-id',
    name: 'Overthinker Sinematik (ID)',
    engine: 'voxcpm2',
    language: 'id',
    speed: 0.92,
    pitch: 0.95,
    emotion: 'calm',
    expressiveness: 0.85,
    isDefault: false,
  },
  {
    id: 'overthinker-en',
    name: 'Overthinker Narrator (EN)',
    engine: 'os-local',
    language: 'en',
    speed: 1.0,
    pitch: 1.0,
    emotion: 'neutral',
    expressiveness: 0.7,
    isDefault: false,
  },
];

export class VoicePersonalityService {
  private readonly broadcast: StreamWsBroadcaster;
  private readonly voiceService: VoiceStudioService;
  private readonly obsClient: ObsWebSocketClient | null;

  private config: VoicePersonalityConfig = {
    activeProfileId: 'overthinker-casual-id',
    language: 'id',
    speed: 1.0,
    pitch: 1.0,
    emotion: 'neutral',
    expressiveness: 0.75,
    preferLocalTts: true,
    routeToObs: true,
    obsAudioInputName: 'Desktop Audio',
  };

  private queue: VoiceQueueEntry[] = [];
  private history: VoiceQueueEntry[] = [];
  private speaking = false;
  private interrupted = false;
  private lastError: string | null = null;
  private seeded = false;

  constructor(
    broadcast: StreamWsBroadcaster = () => undefined,
    voiceService = new VoiceStudioService(),
    obsClient: ObsWebSocketClient | null = null,
  ) {
    this.broadcast = broadcast;
    this.voiceService = voiceService;
    this.obsClient = obsClient;
  }

  private async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    const prisma = getPrismaClient();
    const count = await prisma.voiceProfile.count();
    if (count === 0) {
      for (const p of DEFAULT_VOICE_PROFILES) {
        await prisma.voiceProfile.upsert({
          where: { id: p.id },
          update: {},
          create: {
            id: p.id,
            name: p.name,
            engine: p.engine,
            language: p.language,
            speed: p.speed,
            pitch: p.pitch,
            emotion: p.emotion,
            expressiveness: p.expressiveness,
            isDefault: p.isDefault,
          },
        });
      }
    }
    this.seeded = true;
  }

  public async listProfiles(): Promise<StreamVoiceProfile[]> {
    await this.ensureSeeded();
    const prisma = getPrismaClient();
    const rows = await prisma.voiceProfile.findMany({ orderBy: { isDefault: 'desc' } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      engine: r.engine as StreamVoiceProfile['engine'],
      language: r.language as CommentaryLanguage,
      speed: r.speed,
      pitch: r.pitch,
      emotion: r.emotion as VoiceEmotion,
      expressiveness: r.expressiveness,
      isDefault: r.isDefault,
    }));
  }

  public async upsertProfile(
    input: Partial<StreamVoiceProfile> & { id: string; name: string },
  ): Promise<StreamVoiceProfile> {
    if (!input.id?.trim() || !input.name?.trim()) {
      throw new AppError('id dan name profil suara wajib diisi', ErrorCode.VALIDATION_ERROR, 400);
    }
    await this.ensureSeeded();
    const prisma = getPrismaClient();
    const saved = await prisma.voiceProfile.upsert({
      where: { id: input.id.trim() },
      update: {
        name: input.name.trim(),
        engine: input.engine ?? 'voxcpm2',
        language: input.language ?? 'id',
        speed: Math.max(0.7, Math.min(1.5, input.speed ?? 1.0)),
        pitch: Math.max(0.7, Math.min(1.4, input.pitch ?? 1.0)),
        emotion: input.emotion ?? 'neutral',
        expressiveness: Math.max(0, Math.min(1, input.expressiveness ?? 0.75)),
      },
      create: {
        id: input.id.trim(),
        name: input.name.trim(),
        engine: input.engine ?? 'voxcpm2',
        language: input.language ?? 'id',
        speed: Math.max(0.7, Math.min(1.5, input.speed ?? 1.0)),
        pitch: Math.max(0.7, Math.min(1.4, input.pitch ?? 1.0)),
        emotion: input.emotion ?? 'neutral',
        expressiveness: Math.max(0, Math.min(1, input.expressiveness ?? 0.75)),
        isDefault: Boolean(input.isDefault),
      },
    });
    return {
      id: saved.id,
      name: saved.name,
      engine: saved.engine as StreamVoiceProfile['engine'],
      language: saved.language as CommentaryLanguage,
      speed: saved.speed,
      pitch: saved.pitch,
      emotion: saved.emotion as VoiceEmotion,
      expressiveness: saved.expressiveness,
      isDefault: saved.isDefault,
    };
  }

  public async updateConfig(
    partial: Partial<VoicePersonalityConfig>,
  ): Promise<VoicePersonalityConfig> {
    if (partial.activeProfileId) {
      const profiles = await this.listProfiles();
      const matched = profiles.find((p) => p.id === partial.activeProfileId);
      if (matched) {
        this.config.activeProfileId = matched.id;
        this.config.language = partial.language ?? matched.language;
        this.config.speed = partial.speed ?? matched.speed;
        this.config.pitch = partial.pitch ?? matched.pitch;
        this.config.emotion = partial.emotion ?? matched.emotion;
        this.config.expressiveness = partial.expressiveness ?? matched.expressiveness;
      } else {
        this.config.activeProfileId = partial.activeProfileId;
      }
    }

    this.config = {
      ...this.config,
      ...partial,
      speed: Math.max(0.7, Math.min(1.5, partial.speed ?? this.config.speed)),
      pitch: Math.max(0.7, Math.min(1.4, partial.pitch ?? this.config.pitch)),
      expressiveness: Math.max(
        0,
        Math.min(1, partial.expressiveness ?? this.config.expressiveness),
      ),
    };

    this.voiceService.updateSettings({
      activeProfileId: this.config.activeProfileId,
      speed: this.config.speed,
      activeEngine: this.config.preferLocalTts ? 'voxcpm2' : 'os-local',
    });

    return { ...this.config };
  }

  public async enqueueSpeech(input: {
    text: string;
    priority?: number;
    emotion?: VoiceEmotion;
    language?: CommentaryLanguage;
    playAudio?: boolean;
    urgent?: boolean;
  }): Promise<VoicePersonalityStatusResponse> {
    const cleanText = input.text.trim();
    if (!cleanText) {
      throw new AppError('text wajib diisi', ErrorCode.VALIDATION_ERROR, 400);
    }

    if (input.urgent && this.speaking) {
      await this.interrupt();
    }

    const entry: VoiceQueueEntry = {
      id: crypto.randomUUID(),
      text: cleanText,
      profileId: this.config.activeProfileId,
      language: input.language ?? this.config.language,
      emotion: input.emotion ?? this.config.emotion,
      priority: input.priority ?? 2,
      status: 'queued',
      engineUsed: null,
      createdAt: new Date().toISOString(),
    };

    this.queue.push(entry);
    this.queue.sort((a, b) => b.priority - a.priority);

    await this.processQueue(input.playAudio ?? false);
    return this.getStatus();
  }

  private async processQueue(playAudio: boolean): Promise<void> {
    if (this.speaking) return;
    this.speaking = true;
    this.interrupted = false;

    try {
      while (this.queue.length > 0 && !this.interrupted) {
        const next = this.queue.shift()!;
        next.status = 'speaking';
        this.broadcast('stream:voice-started', next);

        if (this.config.routeToObs && this.obsClient?.isConnected()) {
          await this.obsClient
            .request('SetInputMute', {
              inputName: this.config.obsAudioInputName,
              inputMuted: false,
            })
            .catch(() => undefined);
        }

        try {
          const result = await this.voiceService.speak({
            text: next.text,
            emotion: next.emotion,
            playAudio,
          });
          next.engineUsed = result.engineUsed;
          next.status = this.interrupted ? 'interrupted' : 'completed';
          this.lastError = null;
        } catch (err) {
          next.status = 'failed';
          this.lastError = err instanceof Error ? err.message : String(err);
        }

        this.history = [next, ...this.history].slice(0, 25);
      }
    } finally {
      this.speaking = false;
    }
  }

  public async interrupt(): Promise<VoicePersonalityStatusResponse> {
    this.interrupted = true;
    for (const item of this.queue) {
      item.status = 'interrupted';
      this.history = [item, ...this.history].slice(0, 25);
    }
    this.queue = [];
    await recordSystemLog('info', 'stream-intelligence', 'Voice Personality playback dihentikan/interupsi');
    return this.getStatus();
  }

  public async getStatus(): Promise<VoicePersonalityStatusResponse> {
    const profiles = await this.listProfiles();
    return {
      speaking: this.speaking,
      interrupted: this.interrupted,
      config: { ...this.config },
      profiles,
      queue: [...this.queue],
      history: [...this.history],
      lastError: this.lastError,
    };
  }
}
