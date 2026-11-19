import type { AIActionType } from './ai.js';

export interface ControllerState {
  paused: boolean;
  emergencyStopped: boolean;
  dryRun: boolean;
  backend: 'pynput' | 'macos-osascript' | 'windows-sendinput' | 'dry-run';
  pressedKeys: string[];
  queueLength: number;
  activeWindow: string | null;
  lastActionAt: string | null;
}

export interface ControllerExecuteRequest {
  actionType: AIActionType;
  target: string;
  parameters?: Record<string, string | number | boolean>;
  durationMs?: number;
  expectedGameTitle?: string;
  dryRun?: boolean;
}

export interface ControllerExecutionResult {
  id?: number;
  ok: boolean;
  actionType: AIActionType;
  mappedInput: string;
  durationMs: number;
  dryRun: boolean;
  activeWindow: string;
  status: 'executed' | 'simulated' | 'blocked' | 'rejected';
  reason: string;
  executedAt: string;
}
