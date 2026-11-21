import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  TTSEngineType,
  VoiceCloneJobRecord,
  VoiceCommentaryRequest,
  VoiceEmotion,
  VoiceProfile,
  VoiceSampleRecord,
  VoiceServiceStatus,
  VoiceSettings,
  VoiceSpeakRequest,
  VoiceSpeechResult,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { Logger } from '../../utils/logger.js';
import { UserDataStorageService } from '../persistence/userDataStorage.js';
import { generateIndonesianCommentary } from './commentaryGenerator.js';

const execFileAsync = promisify(execFile);
const VOICE_SETTINGS_KEY = 'voice_studio_settings';

const DEFAULT_PROFILES: VoiceProfile[] = [
  {
    id: 'overthinker-voxcpm2',
    name: 'Overthinker Narator (VoxCPM 2.0)',
    language: 'id-ID',
    engine: 'voxcpm2',
    style: 'santai',
    defaultEmotion: 'neutral',
    description: 'Karakter narator gaming Bahasa Indonesia utama menggunakan VoxCPM 2.0.',
  },
  {
    id: 'komentator-hype',
    name: 'Komentator Hype ID (VoxCPM 2.0)',
    language: 'id-ID',
    engine: 'voxcpm2',
    style: 'ekspresif',
    defaultEmotion: 'excited',
    description: 'Gaya ekspresif untuk momen highlight dan aksi cepat.',
  },
  {
    id: 'analis-taktis',
    name: 'Analis Taktis ID',
    language: 'id-ID',
    engine: 'voxcpm2',
    style: 'taktis',
    defaultEmotion: 'calm',
    description: 'Komentar ringkas dan fokus pada strategi.',
  },
  {
    id: 'os-local-fallback',
    name: 'Local OS TTS Fallback',
    language: 'id-ID',
    engine: 'os-local',
    style: 'santai',
    defaultEmotion: 'neutral',
    description: 'Fallback suara bawaan macOS/Windows saat VoxCPM 2.0 tidak aktif.',
  },
];

function decodeDataUrlOrBase64(raw: string): { buffer: Buffer; mimeType: string } {
  const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (match) {
    return {
      mimeType: match[1] || 'audio/wav',
      buffer: Buffer.from(match[2] ?? '', 'base64'),
    };
  }
  return {
    mimeType: 'audio/wav',
    buffer: Buffer.from(raw, 'base64'),
  };
}

export class VoiceStudioService {
  private readonly logger: Logger;
  private readonly storage: UserDataStorageService;
  private settings: VoiceSettings;
  private settingsLoaded = false;
  private lastSpokenAt: number | null = null;
  private lastError: string | null = null;
  private isSpeaking = false;
  private queueLength = 0;

  constructor(
    logger = new Logger('voice-studio'),
    storage = new UserDataStorageService(),
  ) {
    this.logger = logger;
    this.storage = storage;
    this.settings = {
      activeEngine: 'voxcpm2',
      voxcpmBaseUrl: process.env.VOXCPM_BASE_URL ?? 'http://localhost:8000',
      activeProfileId: 'overthinker-voxcpm2',
      speed: 1.0,
      volume: 85,
      pauseMs: 500,
      style: 'santai',
      minCooldownSeconds: 8,
      whisperEnabled: Boolean(process.env.WHISPER_API_URL || process.env.OPENAI_API_KEY),
    };
  }

  private async ensureSettingsLoaded(): Promise<void> {
    if (this.settingsLoaded) return;
    this.settingsLoaded = true;
    try {
      const prisma = getPrismaClient();
      const row = await prisma.appSetting.findUnique({ where: { key: VOICE_SETTINGS_KEY } });
      if (row?.value) {
        const parsed = JSON.parse(row.value) as Partial<VoiceSettings>;
        this.applySettingsPatch(parsed);
      }
    } catch {
      // Abaikan jika DB belum siap
    }
  }

  private applySettingsPatch(partial: Partial<VoiceSettings>): void {
    if (
      partial.activeEngine === 'voxcpm2' ||
      partial.activeEngine === 'f5-tts' ||
      partial.activeEngine === 'os-local'
    ) {
      this.settings.activeEngine = partial.activeEngine;
    }
    if (typeof partial.voxcpmBaseUrl === 'string' && partial.voxcpmBaseUrl.trim()) {
      this.settings.voxcpmBaseUrl = partial.voxcpmBaseUrl.trim().replace(/\/+$/, '');
    }
    if (typeof partial.activeProfileId === 'string' && partial.activeProfileId.trim()) {
      this.settings.activeProfileId = partial.activeProfileId.trim();
    }
    if (typeof partial.speed === 'number' && !Number.isNaN(partial.speed)) {
      this.settings.speed = Math.min(Math.max(partial.speed, 0.7), 1.5);
    }
    if (typeof partial.volume === 'number' && !Number.isNaN(partial.volume)) {
      this.settings.volume = Math.min(Math.max(Math.round(partial.volume), 0), 100);
    }
    if (typeof partial.pauseMs === 'number' && !Number.isNaN(partial.pauseMs)) {
      this.settings.pauseMs = Math.min(Math.max(Math.round(partial.pauseMs), 200), 1200);
    }
    if (
      partial.style === 'santai' ||
      partial.style === 'ekspresif' ||
      partial.style === 'taktis'
    ) {
      this.settings.style = partial.style;
    }
    if (
      typeof partial.minCooldownSeconds === 'number' &&
      !Number.isNaN(partial.minCooldownSeconds)
    ) {
      this.settings.minCooldownSeconds = Math.min(
        Math.max(Math.round(partial.minCooldownSeconds), 0),
        60,
      );
    }
  }

  private async persistSettings(): Promise<void> {
    try {
      const prisma = getPrismaClient();
      await prisma.appSetting.upsert({
        where: { key: VOICE_SETTINGS_KEY },
        create: { key: VOICE_SETTINGS_KEY, value: JSON.stringify(this.settings) },
        update: { value: JSON.stringify(this.settings) },
      });
    } catch (err) {
      this.logger.warn('Failed to persist voice settings', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  public async listProfiles(): Promise<VoiceProfile[]> {
    const prisma = getPrismaClient();
    const count = await prisma.voiceProfile.count();
    if (count === 0) {
      for (const p of DEFAULT_PROFILES) {
        await prisma.voiceProfile.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            name: p.name,
            description: p.description,
            engine: p.engine,
            language: p.language,
            emotion: p.defaultEmotion,
            modelSettingsJson: JSON.stringify({ style: p.style }),
            isDefault: p.id === 'overthinker-voxcpm2',
          },
          update: {},
        });
      }
    }
    const rows = await prisma.voiceProfile.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((row) => {
      let style: VoiceProfile['style'] = 'santai';
      try {
        const parsed = JSON.parse(row.modelSettingsJson) as { style?: VoiceProfile['style'] };
        if (parsed.style) style = parsed.style;
      } catch {
        // default
      }
      return {
        id: row.id,
        name: row.name,
        language: 'id-ID',
        engine: (row.engine as TTSEngineType) || 'voxcpm2',
        style,
        defaultEmotion: (row.emotion as VoiceEmotion) || 'neutral',
        description: row.description || '',
      };
    });
  }

  public async upsertProfile(input: {
    id?: string;
    name: string;
    description?: string;
    engine?: TTSEngineType;
    style?: VoiceProfile['style'];
    defaultEmotion?: VoiceEmotion;
    defaultSampleId?: string | null;
  }): Promise<VoiceProfile> {
    const prisma = getPrismaClient();
    const id = input.id?.trim() || `custom-${Date.now()}`;
    const saved = await prisma.voiceProfile.upsert({
      where: { id },
      create: {
        id,
        name: input.name.trim() || 'Profil Suara Baru',
        description: input.description?.trim() ?? '',
        engine: input.engine ?? 'voxcpm2',
        language: 'id-ID',
        emotion: input.defaultEmotion ?? 'neutral',
        modelSettingsJson: JSON.stringify({ style: input.style ?? 'santai' }),
        defaultSampleId: input.defaultSampleId ?? null,
      },
      update: {
        name: input.name.trim() || 'Profil Suara Baru',
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.engine !== undefined ? { engine: input.engine } : {}),
        ...(input.defaultEmotion !== undefined ? { emotion: input.defaultEmotion } : {}),
        ...(input.style !== undefined
          ? { modelSettingsJson: JSON.stringify({ style: input.style }) }
          : {}),
        ...(input.defaultSampleId !== undefined ? { defaultSampleId: input.defaultSampleId } : {}),
      },
    });
    return {
      id: saved.id,
      name: saved.name,
      language: 'id-ID',
      engine: saved.engine as TTSEngineType,
      style: input.style ?? 'santai',
      defaultEmotion: saved.emotion as VoiceEmotion,
      description: saved.description,
    };
  }

  public async getSettings(): Promise<VoiceSettings> {
    await this.ensureSettingsLoaded();
    return { ...this.settings };
  }

  public async updateSettings(partial: Partial<VoiceSettings>): Promise<VoiceSettings> {
    await this.ensureSettingsLoaded();
    this.applySettingsPatch(partial);
    await this.persistSettings();
    return { ...this.settings };
  }

  public async saveSample(input: {
    name: string;
    language?: string;
    durationSeconds?: number;
    voiceProfileId?: string | null;
    transcript?: string;
    audioBase64: string;
    fileName?: string;
    mimeType?: string;
  }): Promise<VoiceSampleRecord> {
    const decoded = decodeDataUrlOrBase64(input.audioBase64);
    const originalName = input.fileName?.trim() || `${input.name.trim() || 'sample'}.wav`;
    const asset = await this.storage.saveBuffer({
      category: 'voice_sample',
      originalName,
      buffer: decoded.buffer,
      mimeType: input.mimeType || decoded.mimeType || 'audio/wav',
      entityType: 'voice_sample',
    });

    const prisma = getPrismaClient();
    const row = await prisma.voiceSample.create({
      data: {
        name: input.name.trim() || originalName,
        language: input.language?.trim() || 'id-ID',
        durationSeconds: Number.isFinite(input.durationSeconds) ? Number(input.durationSeconds) : 0,
        voiceProfileId: input.voiceProfileId ?? null,
        assetId: asset.id,
        transcript: input.transcript?.trim() ?? '',
      },
    });

    return {
      id: row.id,
      name: row.name,
      language: row.language,
      durationSeconds: row.durationSeconds,
      voiceProfileId: row.voiceProfileId,
      assetId: row.assetId,
      audioUrl: asset.url,
      transcript: row.transcript,
      recordedAt: row.recordedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public async listSamples(): Promise<VoiceSampleRecord[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.voiceSample.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      language: row.language,
      durationSeconds: row.durationSeconds,
      voiceProfileId: row.voiceProfileId,
      assetId: row.assetId,
      audioUrl: `/api/persistence/assets/${encodeURIComponent(row.assetId)}/content`,
      transcript: row.transcript,
      recordedAt: row.recordedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  public async deleteSample(id: string): Promise<boolean> {
    const prisma = getPrismaClient();
    const row = await prisma.voiceSample.findUnique({ where: { id } });
    if (!row) return false;
    await prisma.voiceSample.delete({ where: { id } });
    await this.storage.deleteAsset(row.assetId);
    return true;
  }

  public async listCloneJobs(limit = 30): Promise<VoiceCloneJobRecord[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.voiceCloneJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((row) => {
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(row.configJson) as Record<string, unknown>;
      } catch {
        config = {};
      }
      return {
        id: row.id,
        sourceSampleId: row.sourceSampleId,
        voiceProfileId: row.voiceProfileId,
        text: row.text,
        emotion: row.emotion,
        modelProvider: row.modelProvider,
        config,
        outputAssetId: row.outputAssetId,
        audioUrl: row.outputAssetId
          ? `/api/persistence/assets/${encodeURIComponent(row.outputAssetId)}/content`
          : null,
        status: row.status as VoiceCloneJobRecord['status'],
        errorMessage: row.errorMessage,
        latencyMs: row.latencyMs,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  public async deleteCloneJob(id: string): Promise<boolean> {
    const prisma = getPrismaClient();
    const row = await prisma.voiceCloneJob.findUnique({ where: { id } });
    if (!row) return false;
    await prisma.voiceCloneJob.delete({ where: { id } });
    if (row.outputAssetId) {
      await this.storage.deleteAsset(row.outputAssetId);
    }
    return true;
  }

  private async checkVoxCpmHealth(): Promise<boolean> {
    await this.ensureSettingsLoaded();
    try {
      const res = await fetch(`${this.settings.voxcpmBaseUrl}/health`, {
        signal: AbortSignal.timeout(1200),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async getStatus(): Promise<VoiceServiceStatus> {
    const voxcpmAvailable = await this.checkVoxCpmHealth();
    return {
      healthy: true,
      voxcpmAvailable,
      localFallbackAvailable:
        process.platform === 'darwin' || process.platform === 'win32',
      whisperAvailable: Boolean(
        process.env.WHISPER_API_URL || process.env.OPENAI_API_KEY,
      ),
      queueLength: this.queueLength,
      isSpeaking: this.isSpeaking,
      lastSpokenAt: this.lastSpokenAt
        ? new Date(this.lastSpokenAt).toISOString()
        : null,
      lastError: this.lastError,
    };
  }

  private async synthesizeViaVoxCpm(
    text: string,
    emotion: VoiceEmotion,
    referenceAudioBase64?: string,
    referenceFileName?: string,
  ): Promise<string | undefined> {
    const res = await fetch(`${this.settings.voxcpmBaseUrl}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(300000),
      body: JSON.stringify({
        text,
        language: 'id',
        speed: this.settings.speed,
        emotion,
        profile_id: this.settings.activeProfileId,
        ...(referenceAudioBase64 ? { reference_audio_base64: referenceAudioBase64 } : {}),
        ...(referenceFileName ? { reference_filename: referenceFileName } : {}),
      }),
    });

    if (!res.ok) {
      let detail = `VoxCPM 2.0 HTTP ${res.status}`;
      try {
        const errJson = (await res.json()) as { error?: string };
        if (errJson?.error) detail = `${detail}: ${errJson.error}`;
      } catch {
        // ignore non-json error body
      }
      throw new Error(detail);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as { audio_base64?: string };
      return data.audio_base64
        ? `data:audio/wav;base64,${data.audio_base64}`
        : undefined;
    }

    const arrayBuf = await res.arrayBuffer();
    const b64 = Buffer.from(arrayBuf).toString('base64');
    return `data:audio/wav;base64,${b64}`;
  }

  private async playViaOsLocal(text: string): Promise<void> {
    if (process.platform === 'darwin') {
      const rateWpm = Math.round(175 * this.settings.speed);
      await execFileAsync('say', ['-r', String(rateWpm), text]);
      return;
    }
    if (process.platform === 'win32') {
      const safeText = text.replace(/'/g, "''");
      const rate = Math.round((this.settings.speed - 1.0) * 5);
      await execFileAsync('powershell', [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = ${rate}; $s.Volume = ${this.settings.volume}; $s.Speak('${safeText}');`,
      ]);
    }
  }

  public async speak(request: VoiceSpeakRequest): Promise<VoiceSpeechResult> {
    await this.ensureSettingsLoaded();
    const started = Date.now();
    const text = request.text.trim();
    const emotion: VoiceEmotion = request.emotion ?? 'neutral';
    const playAudio = request.playAudio ?? false;
    const prisma = getPrismaClient();

    let refBase64 = request.referenceAudioBase64;
    let refFileName = request.referenceFileName;
    if (!refBase64 && request.sourceSampleId) {
      const sample = await prisma.voiceSample.findUnique({ where: { id: request.sourceSampleId } });
      if (sample) {
        const file = await this.storage.readAssetBuffer(sample.assetId);
        if (file) {
          refBase64 = `data:${file.asset.mimeType};base64,${file.buffer.toString('base64')}`;
          refFileName = file.asset.originalName;
        }
      }
    }

    this.queueLength += 1;
    this.isSpeaking = true;

    let engineUsed: TTSEngineType | 'simulated' = this.settings.activeEngine;
    let fallbackUsed = false;
    let audioBase64: string | undefined;
    let outputAssetId: string | undefined;
    let audioUrl: string | undefined;
    let status: VoiceSpeechResult['status'] = 'spoken';
    let reason = 'Berhasil disintesis melalui VoxCPM 2.0';
    let cloneJobStatus: 'completed' | 'failed' = 'completed';
    let cloneError: string | null = null;

    try {
      if (this.settings.activeEngine === 'voxcpm2') {
        try {
          audioBase64 = await this.synthesizeViaVoxCpm(
            text,
            emotion,
            refBase64,
            refFileName,
          );
          this.lastError = null;
        } catch (voxErr) {
          const msg = voxErr instanceof Error ? voxErr.message : String(voxErr);
          this.lastError = `VoxCPM 2.0 tidak terjangkau (${msg}); beralih ke fallback lokal.`;
          this.logger.warn(this.lastError);
          fallbackUsed = true;
          cloneError = msg;
          engineUsed = playAudio ? 'os-local' : 'simulated';
          reason = this.lastError;
          if (playAudio) {
            await this.playViaOsLocal(text);
          }
        }
      } else if (playAudio) {
        engineUsed = 'os-local';
        await this.playViaOsLocal(text);
        reason = 'Diputar melalui OS Local TTS';
      } else {
        engineUsed = 'simulated';
        reason = 'Mode pratinjau teks (tanpa pemutaran audio)';
      }

      if (audioBase64) {
        const decoded = decodeDataUrlOrBase64(audioBase64);
        const asset = await this.storage.saveBuffer({
          category: 'voice_output',
          originalName: `clone-${Date.now()}.wav`,
          buffer: decoded.buffer,
          mimeType: decoded.mimeType || 'audio/wav',
          entityType: 'voice_clone_job',
        });
        outputAssetId = asset.id;
        audioUrl = asset.url;
      }

      this.lastSpokenAt = Date.now();
    } catch (isolatedErr) {
      const msg = isolatedErr instanceof Error ? isolatedErr.message : String(isolatedErr);
      this.lastError = msg;
      status = 'failed_isolated';
      cloneJobStatus = 'failed';
      cloneError = msg;
      reason = `Gagal terisolasi: ${msg}`;
      this.logger.warn('Isolated TTS error', { error: msg });
    } finally {
      this.queueLength = Math.max(0, this.queueLength - 1);
      this.isSpeaking = false;
    }

    const latencyMs = Date.now() - started;
    const saved = await prisma.voiceSpeechLog.create({
      data: {
        text,
        emotion,
        engineUsed,
        fallbackUsed,
        latencyMs,
        status,
        reason,
      },
    });

    let cloneJobId: string | undefined;
    if (outputAssetId || cloneJobStatus === 'failed') {
      const job = await prisma.voiceCloneJob.create({
        data: {
          sourceSampleId: request.sourceSampleId ?? null,
          voiceProfileId: request.profileId ?? this.settings.activeProfileId,
          text,
          emotion,
          modelProvider: engineUsed,
          configJson: JSON.stringify({
            speed: this.settings.speed,
            style: this.settings.style,
          }),
          outputAssetId: outputAssetId ?? null,
          status: cloneJobStatus,
          errorMessage: cloneError,
          latencyMs,
        },
      });
      cloneJobId = job.id;
    }

    await recordSystemLog('info', 'voice', `TTS [${engineUsed}] (${status}): ${text.slice(0, 60)}`);

    return {
      id: saved.id,
      ...(cloneJobId ? { cloneJobId } : {}),
      ...(outputAssetId ? { outputAssetId } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      ok: status !== 'failed_isolated',
      text,
      emotion,
      engineUsed,
      fallbackUsed,
      ...(audioBase64 ? { audioBase64 } : {}),
      latencyMs,
      status,
      reason,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  public async generateAndSpeakCommentary(
    request: VoiceCommentaryRequest,
  ): Promise<VoiceSpeechResult> {
    await this.ensureSettingsLoaded();
    const generated = generateIndonesianCommentary(request, this.settings.style);

    if (this.lastSpokenAt !== null && this.settings.minCooldownSeconds > 0) {
      const elapsedSec = (Date.now() - this.lastSpokenAt) / 1000;
      if (elapsedSec < this.settings.minCooldownSeconds) {
        return {
          ok: true,
          text: generated.text,
          emotion: generated.emotion,
          engineUsed: 'simulated',
          fallbackUsed: false,
          latencyMs: 0,
          status: 'skipped_cooldown',
          reason: `Melewati bicara otomatis karena cooldown ${this.settings.minCooldownSeconds}s masih aktif`,
          createdAt: new Date().toISOString(),
        };
      }
    }

    return this.speak({
      text: generated.text,
      emotion: generated.emotion,
      playAudio: request.autoSpeak ?? false,
    });
  }

  public async getHistory(limit = 20): Promise<VoiceSpeechResult[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.voiceSpeechLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });

    return rows.map((row) => ({
      id: row.id,
      ok: row.status !== 'failed_isolated',
      text: row.text,
      emotion: row.emotion as VoiceEmotion,
      engineUsed: row.engineUsed as VoiceSpeechResult['engineUsed'],
      fallbackUsed: row.fallbackUsed,
      latencyMs: row.latencyMs,
      status: row.status as VoiceSpeechResult['status'],
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
