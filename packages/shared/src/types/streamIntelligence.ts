export type StreamIntelligenceMode = 'semi-automatic' | 'automatic';

export type GameplayEventType =
  | 'player_movement'
  | 'farming'
  | 'harvesting'
  | 'combat'
  | 'item_discovery'
  | 'achievement'
  | 'game_over'
  | 'rare_event'
  | 'npc_interaction'
  | 'scene_transition'
  | 'idle';

export type GameplayEventSeverity = 'low' | 'medium' | 'high' | 'critical';

export type EventVerificationSource = 'vision' | 'ocr' | 'motion' | 'adapter' | 'session';

export interface VerifiedGameplayEvent {
  id: number;
  gameId: string;
  windowTitle: string;
  eventType: GameplayEventType;
  severity: GameplayEventSeverity;
  title: string;
  description: string;
  confidence: number;
  verifiedBy: EventVerificationSource[];
  ocrExcerpt: string | null;
  motionScore: number;
  sceneLabel: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface GameplayObservationInput {
  gameId?: string;
  windowTitle: string;
  sceneLabel: string;
  motionScore: number;
  brightness?: number;
  ocrText?: string;
  hudItems?: Array<{ label: string; value?: string }>;
  visionCaptureId?: number;
  controllerAttempted?: boolean;
}

export interface StreamIntelligenceStatus {
  active: boolean;
  mode: StreamIntelligenceMode;
  emergencyStopped: boolean;
  lastObservedAt: string | null;
  activeGameId: string | null;
  activeWindowTitle: string | null;
  totalEventsDetected: number;
  recentEvents: VerifiedGameplayEvent[];
}

export type CommentaryPersonality = 'casual' | 'funny' | 'professional' | 'cinematic';

export type CommentaryLanguage = 'id' | 'en' | 'ja';

export interface CommentaryConfig {
  personality: CommentaryPersonality;
  language: CommentaryLanguage;
  cooldownSeconds: number;
  silenceThresholdSeconds: number;
  maxQueueSize: number;
  muted: boolean;
  autoGenerateOnEvent: boolean;
}

export interface CommentaryItem {
  id: number;
  eventId: number | null;
  gameId: string;
  personality: CommentaryPersonality;
  language: CommentaryLanguage;
  text: string;
  editedText: string | null;
  priority: number;
  status:
    | 'queued'
    | 'ready'
    | 'spoken'
    | 'edited'
    | 'cancelled'
    | 'skipped_duplicate'
    | 'skipped_cooldown';
  verifiedContext: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommentaryStatusResponse {
  config: CommentaryConfig;
  silenceDetected: boolean;
  secondsSinceLastCommentary: number;
  lastCommentaryAt: string | null;
  queue: CommentaryItem[];
  history: CommentaryItem[];
}

export interface StreamVoiceProfile {
  id: string;
  name: string;
  engine: 'voxcpm2' | 'os-local' | 'cloud-tts';
  language: CommentaryLanguage;
  speed: number;
  pitch: number;
  emotion: 'neutral' | 'excited' | 'tense' | 'humorous' | 'calm';
  expressiveness: number;
  isDefault: boolean;
}

export interface VoicePersonalityConfig {
  activeProfileId: string;
  language: CommentaryLanguage;
  speed: number;
  pitch: number;
  emotion: 'neutral' | 'excited' | 'tense' | 'humorous' | 'calm';
  expressiveness: number;
  preferLocalTts: boolean;
  routeToObs: boolean;
  obsAudioInputName: string;
}

export interface VoiceQueueEntry {
  id: string;
  text: string;
  profileId: string;
  language: CommentaryLanguage;
  emotion: 'neutral' | 'excited' | 'tense' | 'humorous' | 'calm';
  priority: number;
  status: 'queued' | 'speaking' | 'completed' | 'interrupted' | 'failed';
  engineUsed: string | null;
  createdAt: string;
}

export interface VoicePersonalityStatusResponse {
  speaking: boolean;
  interrupted: boolean;
  config: VoicePersonalityConfig;
  profiles: StreamVoiceProfile[];
  queue: VoiceQueueEntry[];
  history: VoiceQueueEntry[];
  lastError: string | null;
}

export type ChatAutomationMode =
  | 'observe_only'
  | 'suggest_reply'
  | 'approval_required'
  | 'automatic_reply';

export type ChatMessageCategory =
  | 'question'
  | 'command'
  | 'praise'
  | 'spam'
  | 'toxic'
  | 'general';

export type ChatModerationAction = 'none' | 'warn' | 'timeout' | 'delete';

export interface ChatFaqEntry {
  keyword: string;
  answer: string;
}

export interface ChatIntelligenceConfig {
  mode: ChatAutomationMode;
  allowAutoReply: boolean;
  allowAutoModeration: boolean;
  blockedWords: string[];
  faqs: ChatFaqEntry[];
}

export interface ChatInteractionItem {
  id: number;
  platform: 'youtube' | 'twitch';
  author: string;
  message: string;
  category: ChatMessageCategory;
  isSpam: boolean;
  isQuestion: boolean;
  proposedReply: string | null;
  finalReply: string | null;
  replyStatus: 'none' | 'proposed' | 'approved' | 'sent' | 'rejected';
  moderationSuggestion: ChatModerationAction;
  createdAt: string;
}

export interface ChatModerationLogItem {
  id: number;
  interactionId: number | null;
  platform: 'youtube' | 'twitch';
  author: string;
  action: ChatModerationAction;
  reason: string;
  status: 'suggested' | 'approved' | 'executed' | 'rejected';
  createdAt: string;
}

export interface ChatIntelligenceStatusResponse {
  config: ChatIntelligenceConfig;
  interactions: ChatInteractionItem[];
  moderationLogs: ChatModerationLogItem[];
}


