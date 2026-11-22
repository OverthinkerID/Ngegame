export type AIProviderType = 'ollama' | 'openai';

export type GameGenreTemplate =
  | 'FPS'
  | 'RPG'
  | 'Survival'
  | 'Simulation'
  | 'Strategy'
  | 'Racing'
  | 'Platformer'
  | 'Universal';

export const ALLOWED_AI_ACTIONS = [
  'OBSERVE_ONLY',
  'WAIT',
  'MOVE_DIRECTION',
  'LOOK_AT',
  'INTERACT',
  'USE_ITEM',
  'SELECT_OPTION',
  'NAVIGATE_WAYPOINT',
  'PAUSE_MENU',
] as const;

export type AIActionType = (typeof ALLOWED_AI_ACTIONS)[number];

export interface AIPlannedAction {
  actionType: AIActionType;
  target: string;
  parameters: Record<string, string | number | boolean>;
  durationMs: number;
  confidence: number;
  rationale: string;
}

export interface AITokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AIBrainConfig {
  primaryProvider: AIProviderType;
  fallbackProvider: AIProviderType | null;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openaiModel: string;
  openaiConfigured: boolean;
  genre: GameGenreTemplate;
  temperature: number;
}

export interface AIBrainThinkRequest {
  gameTitle?: string;
  genre?: GameGenreTemplate;
  objective?: string;
  visionState: {
    windowTitle: string;
    sceneLabel: string;
    motionScore: number;
    brightness: number;
    ocrText: string;
    hudSummary?: string[];
    imageBase64?: string;
  };
}

export interface AIBrainDecisionResult {
  id?: number;
  providerUsed: AIProviderType | 'deterministic-fallback';
  modelUsed: string;
  fallbackUsed: boolean;
  genre: GameGenreTemplate;
  gameStateSummary: string;
  strategyPlan: string;
  reasoning: string;
  confidence: number;
  actions: AIPlannedAction[];
  rejectedActions: string[];
  tokenUsage: AITokenUsage;
  latencyMs: number;
  executionStatus: 'planned_only';
  createdAt: string;
}

export interface AIProviderHealth {
  ollamaAvailable: boolean;
  ollamaModels: string[];
  openaiConfigured: boolean;
}
