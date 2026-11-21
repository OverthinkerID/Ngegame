import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  TTSEngineType,
  VoiceCommentaryRequest,
  VoiceEmotion,
  VoiceProfile,
  VoiceServiceStatus,
  VoiceSettings,
  VoiceSpeakRequest,
  VoiceSpeechResult,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { Logger } from '../../utils/logger.js';
import { generateIndonesianCommentary } from './commentaryGenerator.js';

const execFileAsync = promisify(execFile);

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

export class VoiceStudioService {
  private readonly logger: Logger;
  private settings: VoiceSettings;
  private lastSpokenAt: number | null = null;
  private lastError: string | null = null;
  private isSpeaking = false;
  private queueLength = 0;

  constructor(logger = new Logger('voice-studio')) {
    this.logger = logger;
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

  public listProfiles(): VoiceProfile[] {
    return DEFAULT_PROFILES;
  }

  public getSettings(): VoiceSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<VoiceSettings>): VoiceSettings {
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
    return this.getSettings();
  }

  private async checkVoxCpmHealth(): Promise<boolean> {
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
      healthy: true, // Isolated service: failure never blocks AI gaming
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
    const started = Date.now();
    const text = request.text.trim();
    const emotion: VoiceEmotion = request.emotion ?? 'neutral';
    const playAudio = request.playAudio ?? false;

    this.queueLength += 1;
    this.isSpeaking = true;

    let engineUsed: TTSEngineType | 'simulated' = this.settings.activeEngine;
    let fallbackUsed = false;
    let audioBase64: string | undefined;
    let status: VoiceSpeechResult['status'] = 'spoken';
    let reason = 'Berhasil disintesis melalui VoxCPM 2.0';

    try {
      if (this.settings.activeEngine === 'voxcpm2') {
        try {
          audioBase64 = await this.synthesizeViaVoxCpm(
            text,
            emotion,
            request.referenceAudioBase64,
            request.referenceFileName,
          );
          this.lastError = null;
        } catch (voxErr) {
          const msg = voxErr instanceof Error ? voxErr.message : String(voxErr);
          this.lastError = `VoxCPM 2.0 tidak terjangkau (${msg}); beralih ke fallback lokal.`;
          this.logger.warn(this.lastError);
          fallbackUsed = true;
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

      this.lastSpokenAt = Date.now();
    } catch (isolatedErr) {
      // Strict isolation: TTS failure must NEVER crash or halt AI gaming
      const msg = isolatedErr instanceof Error ? isolatedErr.message : String(isolatedErr);
      this.lastError = msg;
      status = 'failed_isolated';
      reason = `Gagal terisolasi: ${msg}`;
      this.logger.warn('Isolated TTS error', { error: msg });
    } finally {
      this.queueLength = Math.max(0, this.queueLength - 1);
      this.isSpeaking = false;
    }

    const latencyMs = Date.now() - started;
    const prisma = getPrismaClient();
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

    await recordSystemLog('info', 'voice', `TTS [${engineUsed}] (${status}): ${text.slice(0, 60)}`);

    return {
      id: saved.id,
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
