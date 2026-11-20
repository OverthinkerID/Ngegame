import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStardewState,
  planStardewTask,
  StardewAdapterService,
} from '../src/services/adaptation/stardewAdapter.js';

describe('Phase 12F.7 — Stardew Valley AI Adapter (Levels 1-7)', () => {
  it('enforces level gating and passes independent acceptance tests sequentially 1..7', async () => {
    const adapter = new StardewAdapterService();
    await adapter.resetGates();

    // Level 2 & Level 4 harus ditolak sebelum Level 1 lulus
    await assert.rejects(() => adapter.runLevelAcceptanceTest(2));
    await assert.rejects(() => adapter.runLevelAcceptanceTest(4));

    for (const lvl of [1, 2, 3, 4, 5, 6, 7] as const) {
      const res = await adapter.runLevelAcceptanceTest(lvl);
      assert.equal(res.passed, true);
      assert.equal(res.level, lvl);
      assert.ok(res.gateState.passedLevels.includes(lvl));
    }

    const overview = await adapter.getCapabilitiesOverview();
    assert.equal(overview.gateState.passedLevels.length, 7);
    assert.equal(overview.gateState.highestUnlockedLevel, 7);
  });

  it('plans farming tasks and stops automatically when energy is critically low or late night', () => {
    const state = parseStardewState({
      gameId: 'stardew-valley',
      screenState: 'gameplay',
      player: { position: { x: 640, y: 360 }, confidence: 0.91 },
      visibleObjects: [{ label: 'crops', confidence: 0.88 }],
      interactableObjects: [{ label: 'dry_crop', actionHint: 'INTERACT', confidence: 0.9 }],
      uiElements: [],
      extractedText: '9:30 AM Energy 80% Toolbar: Watering Can',
      confidence: 0.91,
      timestamp: new Date().toISOString(),
    });

    // Ditolak jika maxUnlockedLevel < 5 (butuh Watering Can slot 2)
    const gated = planStardewTask(state, 'Siram tanaman yang membutuhkan air', 2);
    assert.equal(gated.allowed, false);

    // Diizinkan jika level >= 5
    const allowed = planStardewTask(state, 'Siram tanaman yang membutuhkan air', 5);
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.steps.length, 3);

    // Berhenti otomatis jika energi <= 15%
    const lowEnergy = planStardewTask(
      { ...state, energyPercent: 12, isLowEnergy: true },
      'Panen tanaman matang',
      7,
    );
    assert.equal(lowEnergy.allowed, false);
    assert.ok(lowEnergy.blockedReason?.includes('Energi'));

    // Berhenti otomatis jika sudah larut malam
    const lateNight = planStardewTask(
      { ...state, clockText: '11:50 PM', isLateNight: true },
      'Panen tanaman matang',
      7,
    );
    assert.equal(lateNight.allowed, false);
    assert.ok(lateNight.blockedReason?.includes('larut malam'));
  });
});
