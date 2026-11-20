export type TTSEngineType = 'voxcpm2' | 'f5-tts' | 'os-local';
export type VoiceEmotion = 'neutral' | 'excited' | 'tense' | 'humorous' | 'calm';
export type VoiceSpeakingStyle = 'santai' | 'ekspresif' | 'taktis';

export interface VoiceProfile {
  id: string;
  name: string;
  language: 'id-ID';
  engine: TTSEngineType;
  style: VoiceSpeakingStyle;
  defaultEmotion: VoiceEmotion;
  description: string;
  referenceAudioPath?: string;
}

export interface VoiceSettings {
  activeEngine: TTSEngineType;
  voxcpmBaseUrl: string;
  activeProfileId: string;
  speed: number;
  volume: number;
  pauseMs: number;
  style: VoiceSpeakingStyle;
  minCooldownSeconds: number;
  whisperEnabled: boolean;
}

export interface VoiceServiceStatus {
  healthy: boolean;
  voxcpmAvailable: boolean;
  localFallbackAvailable: boolean;
  whisperAvailable: boolean;
  queueLength: number;
  isSpeaking: boolean;
  lastSpokenAt: string | null;
  lastError: string | null;
}

export interface VoiceSpeakRequest {
  text: string;
  emotion?: VoiceEmotion;
  profileId?: string;
  playAudio?: boolean;
  referenceAudioBase64?: string;
  referenceFileName?: string;
}

export interface VoiceCommentaryRequest {
  eventType: string;
  gameTitle: string;
  details: string;
  emotion?: VoiceEmotion;
  autoSpeak?: boolean;
}

export interface VoiceSpeechResult {
  id?: number;
  ok: boolean;
  text: string;
  emotion: VoiceEmotion;
  engineUsed: TTSEngineType | 'simulated';
  fallbackUsed: boolean;
  audioBase64?: string;
  latencyMs: number;
  status: 'spoken' | 'queued' | 'skipped_cooldown' | 'failed_isolated';
  reason: string;
  createdAt: string;
}
