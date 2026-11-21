import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameplayEventIntelligenceService } from '../src/services/streamIntelligence/gameplayEventIntelligenceService.js';

describe('Phase 16.2: Gameplay Event Intelligence', () => {
  it('rejects unverified controller-only claims and detects verified Stardew Valley events with WS broadcast', async () => {
    const emitted: Array<{ eventType: string; payload: unknown }> = [];
    const service = new GameplayEventIntelligenceService((eventType, payload) => {
      emitted.push({ eventType, payload });
    });

    // Controller attempted without visual/OCR/motion change -> must NOT emit verified event
    const unverified = await service.analyzeObservation({
      windowTitle: 'Stardew Valley',
      sceneLabel: 'active_gameplay',
      motionScore: 0.005,
      ocrText: '',
      controllerAttempted: true,
    });
    assert.equal(unverified.verified, false);
    assert.equal(unverified.events.length, 0);
    assert.equal(emitted.length, 0);

    // Verified harvesting + farming + achievement + npc + game_over observations
    const harvest = await service.analyzeObservation({
      windowTitle: 'Stardew Valley',
      sceneLabel: 'active_gameplay',
      motionScore: 0.14,
      ocrText: 'Harvested Parsnip +1 • Watered soil',
      controllerAttempted: true,
    });
    assert.equal(harvest.verified, true);
    const types = harvest.events.map((e) => e.eventType);
    assert.ok(types.includes('harvesting'));
    assert.ok(types.includes('farming'));
    assert.ok(emitted.some((e) => e.eventType === 'stream:event-detected'));

    const dialogue = await service.analyzeObservation({
      windowTitle: 'Stardew Valley',
      sceneLabel: 'dialogue',
      motionScore: 0.01,
      ocrText: 'Mayor Lewis: Welcome to Pelican Town!',
    });
    assert.equal(dialogue.verified, true);
    assert.ok(dialogue.events.some((e) => e.eventType === 'npc_interaction'));
    assert.ok(dialogue.events.some((e) => e.eventType === 'scene_transition'));

    const critical = await service.analyzeObservation({
      windowTitle: 'Stardew Valley',
      sceneLabel: 'active_gameplay',
      motionScore: 0.05,
      ocrText: 'You passed out from exhaustion!',
    });
    assert.equal(critical.verified, true);
    assert.ok(critical.events.some((e) => e.eventType === 'game_over' && e.severity === 'critical'));

    // Mode switch & emergency stop gate
    assert.equal(service.setMode('automatic'), 'automatic');
    await service.emergencyStop();
    const blocked = await service.analyzeObservation({
      windowTitle: 'Stardew Valley',
      sceneLabel: 'active_gameplay',
      motionScore: 0.2,
      ocrText: 'Level up!',
    });
    assert.equal(blocked.verified, false);
    service.resetEmergencyStop();

    const status = await service.getStatus(10);
    assert.equal(status.active, true);
    assert.equal(status.mode, 'automatic');
    assert.ok(status.totalEventsDetected >= 4);
  });
});
