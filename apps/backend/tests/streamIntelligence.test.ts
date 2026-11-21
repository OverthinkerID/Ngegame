import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameplayEventIntelligenceService } from '../src/services/streamIntelligence/gameplayEventIntelligenceService.js';
import { LiveCommentaryService } from '../src/services/streamIntelligence/liveCommentaryService.js';

describe('Phase 16.2 & 16.3: Gameplay Event Intelligence & AI Live Commentary', () => {
  it('rejects unverified controller-only claims and detects verified Stardew Valley events with WS broadcast', async () => {
    const emitted: Array<{ eventType: string; payload: unknown }> = [];
    const service = new GameplayEventIntelligenceService((eventType, payload) => {
      emitted.push({ eventType, payload });
    });

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

  it('generates multi-personality & multi-language commentary with cooldown, duplicate prevention, silence detection, priority queue, and manual edit', async () => {
    const emitted: Array<{ eventType: string; payload: unknown }> = [];
    const eventService = new GameplayEventIntelligenceService();
    const commentary = new LiveCommentaryService((eventType, payload) => {
      emitted.push({ eventType, payload });
    });

    commentary.updateConfig({
      personality: 'funny',
      language: 'id',
      cooldownSeconds: 10,
      silenceThresholdSeconds: 20,
    });

    const uniqueRunTag = `Run${Date.now()}`;
    const obs = await eventService.analyzeObservation({
      windowTitle: 'Stardew Valley',
      sceneLabel: 'active_gameplay',
      motionScore: 0.16,
      ocrText: `Level up! Farming ${uniqueRunTag}`,
    });
    const ev = obs.events[0]!;
    const t0 = 1_700_000_000_000;

    const first = await commentary.generateCommentary({ event: ev, nowMs: t0 });
    assert.equal(first.accepted, true);
    assert.ok(first.item?.text.includes('Waduh'));
    assert.ok(emitted.some((e) => e.eventType === 'stream:commentary-generated'));

    // Cooldown blocks immediate non-critical commentary
    const cooled = await commentary.generateCommentary({
      text: 'Komentar terlalu cepat',
      nowMs: t0 + 3000,
    });
    assert.equal(cooled.accepted, false);

    // Duplicate prevention blocks identical text even after cooldown
    const dup = await commentary.generateCommentary({
      text: first.item!.text,
      nowMs: t0 + 15000,
    });
    assert.equal(dup.accepted, false);

    // Different language + cinematic personality + higher priority
    const enCinematic = await commentary.generateCommentary({
      event: ev,
      personality: 'cinematic',
      language: 'en',
      priority: 4,
      nowMs: t0 + 16000,
    });
    assert.equal(enCinematic.accepted, true);
    assert.ok(enCinematic.item?.text.includes('decisive moment'));

    // Manual edit
    const edited = await commentary.editCommentary(
      enCinematic.item!.id,
      'Momen sinematik yang telah disunting manual.',
    );
    assert.equal(edited.status, 'edited');
    assert.equal(edited.editedText, 'Momen sinematik yang telah disunting manual.');

    // Silence detection after threshold
    const silenceStatus = await commentary.getStatus(t0 + 45000);
    assert.equal(silenceStatus.silenceDetected, true);
    assert.ok(silenceStatus.queue[0]!.priority >= 4);

    // Stop & clear queue
    const stopped = await commentary.stopAndClear(true);
    assert.equal(stopped.queue.length, 0);
    assert.equal(stopped.config.muted, true);
  });
});
