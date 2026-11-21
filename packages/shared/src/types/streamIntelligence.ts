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
