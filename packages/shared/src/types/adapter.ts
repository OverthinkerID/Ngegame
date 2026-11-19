import type { AIActionType, GameGenreTemplate } from './ai.js';

export type AdapterCompatibilityStatus = 'verified' | 'experimental' | 'planned';

export interface AdapterMetadata {
  id: string;
  name: string;
  version: string;
  author: string;
  genre: GameGenreTemplate;
  description: string;
}

export interface AdapterGameIdentification {
  steamAppIds: number[];
  windowTitlePatterns: string[];
}

export interface AdapterScreenRegion {
  name: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  purpose: 'ocr' | 'hud_bar' | 'minimap' | 'inventory' | 'viewport';
}

export interface AdapterControlBinding {
  actionType: AIActionType;
  key: string;
  defaultDurationMs: number;
  notes: string;
}

export interface AdapterObjective {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
}

export interface AdapterVisionConfig {
  targetIntervalMs: number;
  motionThreshold: number;
  enableOcr: boolean;
}

export interface GameAdapterDefinition {
  metadata: AdapterMetadata;
  gameIdentification: AdapterGameIdentification;
  controlMapping: AdapterControlBinding[];
  screenLayout: AdapterScreenRegion[];
  objectiveDefinition: AdapterObjective[];
  actionLibrary: AIActionType[];
  strategyRules: string[];
  visionConfig: AdapterVisionConfig;
  compatibilityStatus: AdapterCompatibilityStatus;
}

export interface AdapterResolveRequest {
  steamAppId?: number;
  windowTitle?: string;
  genre?: GameGenreTemplate;
}
