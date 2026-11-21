import type {
  AIActionType,
  ControllerExecutionResult,
  GameInputBinding,
  GameProfile,
} from '@ngegame/shared';
import type { ControllerService } from '../controller/controllerService.js';

export interface ControlConflictReport {
  hasConflicts: boolean;
  conflicts: string[];
  gamepadSupported: boolean;
}

export class ControlAdaptationEngine {
  private readonly lastExecutedAt = new Map<string, number>();

  public detectConflicts(profile: GameProfile): ControlConflictReport {
    const conflicts: string[] = [];
    const keyOwners = new Map<string, AIActionType>();

    for (const binding of profile.inputMapping) {
      if (binding.keyboard) {
        const normalized = binding.keyboard.trim().toLowerCase();
        const prev = keyOwners.get(normalized);
        if (prev && prev !== binding.actionType) {
          conflicts.push(
            `Konflik keyboard '${binding.keyboard}' antara ${prev} dan ${binding.actionType}`,
          );
        } else {
          keyOwners.set(normalized, binding.actionType);
        }
      }
      if (binding.holdDurationMs > profile.safetyConfiguration.maxHoldDurationMs) {
        conflicts.push(
          `Durasi tahan ${binding.actionType} (${binding.holdDurationMs}ms) melebihi batas aman (${profile.safetyConfiguration.maxHoldDurationMs}ms).`,
        );
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      gamepadSupported: profile.controlScheme === 'gamepad' || profile.controlScheme === 'hybrid',
    };
  }

  public resolveBinding(
    profile: GameProfile,
    actionType: AIActionType,
  ): GameInputBinding | null {
    return profile.inputMapping.find((b) => b.actionType === actionType) ?? null;
  }

  public async executeWithSafeguards(
    controllerService: ControllerService,
    profile: GameProfile,
    actionType: AIActionType,
    target: string,
    options?: {
      durationMs?: number;
      dryRun?: boolean;
      extraParameters?: Record<string, string | number | boolean>;
    },
  ): Promise<ControllerExecutionResult> {
    const binding = this.resolveBinding(profile, actionType);
    const cooldownMs = binding?.cooldownMs ?? 150;
    const key = `${profile.gameId}:${actionType}`;
    const now = Date.now();
    const lastTs = this.lastExecutedAt.get(key) ?? 0;

    if (now - lastTs < cooldownMs) {
      return {
        ok: false,
        actionType,
        mappedInput: binding?.keyboard ?? 'none',
        durationMs: 0,
        dryRun: options?.dryRun ?? profile.safetyConfiguration.dryRunByDefault,
        activeWindow: 'cooldown-guard',
        status: 'blocked',
        reason: `Cooldown aktif untuk ${actionType} (${cooldownMs - (now - lastTs)}ms tersisa).`,
        executedAt: new Date(now).toISOString(),
      };
    }

    const durationMs = Math.min(
      Math.max(options?.durationMs ?? binding?.holdDurationMs ?? 250, 50),
      profile.safetyConfiguration.maxHoldDurationMs,
    );

    const mappedKey = binding?.keyboard?.split('/')[0];
    const result = await controllerService.executeAction({
      actionType,
      target,
      parameters: {
        ...(mappedKey ? { key: mappedKey } : {}),
        ...(binding?.mouse ? { mouse: binding.mouse } : {}),
        ...(options?.extraParameters ?? {}),
      },
      durationMs,
      expectedGameTitle:
        profile.safetyConfiguration.requireFocus || binding?.requiresFocus
          ? profile.gameName
          : undefined,
      dryRun: options?.dryRun ?? profile.safetyConfiguration.dryRunByDefault,
    });

    if (result.ok) {
      this.lastExecutedAt.set(key, Date.now());
    } else {
      await controllerService.releaseAll().catch(() => {});
    }

    return result;
  }
}
