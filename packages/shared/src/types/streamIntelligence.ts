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
