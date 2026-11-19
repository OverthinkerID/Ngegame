import type { AIActionType } from './ai.js';

export type SupervisionPermissionLevel = 'L1' | 'L2' | 'L3';
export type ControlOwner = 'ai' | 'human';
export type SupervisionQueueStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'blocked';

export interface SupervisionSafetyPolicy {
  minConfidenceL1: number;
  maxDurationMs: number;
  dryRunDefault: boolean;
  allowAutoExecuteL1: boolean;
}

export interface SupervisionState {
  permissionLevel: SupervisionPermissionLevel;
  controlOwner: ControlOwner;
  aiPaused: boolean;
  emergencyStopped: boolean;
  obsAffectedByEmergency: false;
  gameClosedByEmergency: false;
  policy: SupervisionSafetyPolicy;
  pendingCount: number;
  updatedAt: string;
}

export interface SupervisionQueueItem {
  id: number;
  actionType: AIActionType;
  target: string;
  parameters: Record<string, string | number | boolean>;
  durationMs: number;
  confidence: number;
  rationale: string;
  permissionLevel: SupervisionPermissionLevel;
  status: SupervisionQueueStatus;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupervisionAuditEntry {
  id: number;
  eventType: string;
  actor: 'ai' | 'human' | 'system';
  permissionLevel: SupervisionPermissionLevel;
  controlOwner: ControlOwner;
  details: string;
  createdAt: string;
}

export interface SupervisionSubmitRequest {
  actionType: AIActionType;
  target: string;
  parameters?: Record<string, string | number | boolean>;
  durationMs?: number;
  confidence: number;
  rationale?: string;
  dryRun?: boolean;
}
