import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STARDEW_VALLEY_PROFILE } from '../src/services/adaptation/builtinProfiles.js';
import { ControlAdaptationEngine } from '../src/services/adaptation/controlAdaptationEngine.js';

describe('Phase 12F.6 — Control Adaptation Engine', () => {
  it('detects keyboard mapping conflicts and unsafe hold durations', () => {
    const engine = new ControlAdaptationEngine();
    const clean = engine.detectConflicts(STARDEW_VALLEY_PROFILE);
    assert.equal(clean.hasConflicts, false);

    const conflicted = engine.detectConflicts({
      ...STARDEW_VALLEY_PROFILE,
      inputMapping: [
        {
          actionType: 'MOVE_DIRECTION',
          keyboard: 'e',
          holdDurationMs: 2500,
          cooldownMs: 100,
          requiresFocus: true,
        },
        {
          actionType: 'INTERACT',
          keyboard: 'e',
          holdDurationMs: 150,
          cooldownMs: 100,
          requiresFocus: true,
        },
      ],
    });
    assert.equal(conflicted.hasConflicts, true);
    assert.ok(conflicted.conflicts.length >= 2);
  });

  it('enforces cooldown and clamps duration to profile maxHoldDurationMs', async () => {
    const engine = new ControlAdaptationEngine();
    const fakeController = {
      executeAction: async (req: { durationMs?: number; actionType: string; target: string; dryRun?: boolean }) => ({
        ok: true,
        actionType: req.actionType,
        mappedInput: "Key 'w'",
        durationMs: req.durationMs ?? 250,
        dryRun: req.dryRun ?? true,
        activeWindow: 'Stardew Valley',
        status: 'simulated' as const,
        reason: 'OK',
        executedAt: new Date().toISOString(),
      }),
      releaseAll: async () => ({}),
    };

    const first = await engine.executeWithSafeguards(
      fakeController as never,
      STARDEW_VALLEY_PROFILE,
      'MOVE_DIRECTION',
      'tile',
      { durationMs: 9999, dryRun: true },
    );
    assert.equal(first.ok, true);
    assert.equal(first.durationMs, STARDEW_VALLEY_PROFILE.safetyConfiguration.maxHoldDurationMs);

    // Panggilan kedua segera harus diblokir oleh cooldown
    const second = await engine.executeWithSafeguards(
      fakeController as never,
      STARDEW_VALLEY_PROFILE,
      'MOVE_DIRECTION',
      'tile',
      { durationMs: 200, dryRun: true },
    );
    assert.equal(second.ok, false);
    assert.equal(second.status, 'blocked');
  });
});
