import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChatIntelligenceService } from '../src/services/streamIntelligence/chatIntelligenceService.js';
import { GameplayEventIntelligenceService } from '../src/services/streamIntelligence/gameplayEventIntelligenceService.js';
import { LiveCommentaryService } from '../src/services/streamIntelligence/liveCommentaryService.js';
import { SceneIntelligenceService } from '../src/services/streamIntelligence/sceneIntelligenceService.js';
import { VoicePersonalityService } from '../src/services/streamIntelligence/voicePersonalityService.js';

describe('Phase 16.2–16.6: Stream Intelligence Engine', () => {
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

    const cooled = await commentary.generateCommentary({
      text: 'Komentar terlalu cepat',
      nowMs: t0 + 3000,
    });
    assert.equal(cooled.accepted, false);

    const dup = await commentary.generateCommentary({
      text: first.item!.text,
      nowMs: t0 + 15000,
    });
    assert.equal(dup.accepted, false);

    const enCinematic = await commentary.generateCommentary({
      event: ev,
      personality: 'cinematic',
      language: 'en',
      priority: 4,
      nowMs: t0 + 16000,
    });
    assert.equal(enCinematic.accepted, true);
    assert.ok(enCinematic.item?.text.includes('decisive moment'));

    const edited = await commentary.editCommentary(
      enCinematic.item!.id,
      'Momen sinematik yang telah disunting manual.',
    );
    assert.equal(edited.status, 'edited');
    assert.equal(edited.editedText, 'Momen sinematik yang telah disunting manual.');

    const silenceStatus = await commentary.getStatus(t0 + 45000);
    assert.equal(silenceStatus.silenceDetected, true);
    assert.ok(silenceStatus.queue[0]!.priority >= 4);

    const stopped = await commentary.stopAndClear(true);
    assert.equal(stopped.queue.length, 0);
    assert.equal(stopped.config.muted, true);
  });

  it('manages VoiceProfile persistence, speed/pitch/emotion config, priority speech queue, WS broadcast, and interrupt', async () => {
    const emitted: Array<{ eventType: string; payload: unknown }> = [];
    const voicePersonality = new VoicePersonalityService((eventType, payload) => {
      emitted.push({ eventType, payload });
    });

    const profiles = await voicePersonality.listProfiles();
    assert.ok(profiles.length >= 4);

    const custom = await voicePersonality.upsertProfile({
      id: 'custom-stardew-id',
      name: 'Petani Santai (ID)',
      engine: 'os-local',
      language: 'id',
      speed: 1.1,
      pitch: 1.05,
      emotion: 'excited',
      expressiveness: 0.85,
    });
    assert.equal(custom.id, 'custom-stardew-id');

    const cfg = await voicePersonality.updateConfig({
      activeProfileId: 'custom-stardew-id',
      preferLocalTts: false,
      routeToObs: true,
    });
    assert.equal(cfg.speed, 1.1);
    assert.equal(cfg.pitch, 1.05);
    assert.equal(cfg.emotion, 'excited');

    const spoken = await voicePersonality.enqueueSpeech({
      text: 'Panen parsnip hari ini sukses besar!',
      priority: 3,
      playAudio: false,
    });
    assert.ok(emitted.some((e) => e.eventType === 'stream:voice-started'));
    assert.ok(spoken.history.length >= 1);

    const interrupted = await voicePersonality.interrupt();
    assert.equal(interrupted.interrupted, true);
    assert.equal(interrupted.queue.length, 0);
  });

  it('classifies YouTube/Twitch chat, detects spam & blocked words, proposes & approves replies, and guards auto-moderation', async () => {
    const emitted: Array<{ eventType: string; payload: unknown }> = [];
    const chat = new ChatIntelligenceService((eventType, payload) => {
      emitted.push({ eventType, payload });
    });

    const q = await chat.ingestMessage({
      platform: 'youtube',
      author: 'BudiGamer',
      message: 'Bang ini game apa ya?',
    });
    assert.equal(q.isQuestion, true);
    assert.equal(q.category, 'question');
    assert.equal(q.replyStatus, 'proposed');
    assert.ok(q.proposedReply?.includes('@BudiGamer'));
    assert.ok(emitted.some((e) => e.eventType === 'stream:chat-received'));
    assert.ok(emitted.some((e) => e.eventType === 'stream:chat-reply-proposed'));

    const approved = await chat.approveReply(q.id, '@BudiGamer Lagi main Stardew Valley!');
    assert.equal(approved.replyStatus, 'approved');
    assert.equal(approved.finalReply, '@BudiGamer Lagi main Stardew Valley!');

    const spam = await chat.ingestMessage({
      platform: 'twitch',
      author: 'SpamBot',
      message: 'Cek link gratis https://spam.example.com sekarang!',
    });
    assert.equal(spam.isSpam, true);
    assert.equal(spam.moderationSuggestion, 'delete');

    const toxic = await chat.ingestMessage({
      platform: 'youtube',
      author: 'BadUser',
      message: 'Awas ada scam di sini',
    });
    assert.equal(toxic.category, 'toxic');
    assert.equal(toxic.moderationSuggestion, 'timeout');

    const st = await chat.getStatus(10);
    assert.ok(st.moderationLogs.some((l) => l.status === 'suggested'));
  });

  it('analyzes gameplay context for OBS scene, overlay, camera visibility, custom rules, and WS broadcast', async () => {
    const emitted: Array<{ eventType: string; payload: unknown }> = [];
    const switchedScenes: string[] = [];
    const mockObs = {
      isConnected: () => true,
      request: async (reqType: string, data?: Record<string, unknown>) => {
        if (reqType === 'GetSceneList') {
          return {
            currentProgramSceneName: 'Gameplay',
            scenes: [{ sceneName: 'Gameplay' }, { sceneName: 'Pause / BRB' }],
          };
        }
        if (reqType === 'GetStreamStatus') {
          return { outputActive: true };
        }
        if (reqType === 'SetCurrentProgramScene') {
          switchedScenes.push(String(data?.sceneName ?? ''));
          return {};
        }
        return {};
      },
    } as unknown as import('../src/services/streaming/obsWebSocketClient.js').ObsWebSocketClient;

    const sceneSvc = new SceneIntelligenceService((eventType, payload) => {
      emitted.push({ eventType, payload });
    }, mockObs);

    const rec = await sceneSvc.analyzeContext({ sceneLabel: 'pause_menu' });
    assert.ok(rec);
    assert.equal(rec?.recommendedScene, 'Pause / BRB');
    assert.equal(rec?.recommendedOverlay, 'BRB Overlay');
    assert.equal(rec?.cameraVisible, false);
    assert.equal(rec?.status, 'pending');
    assert.equal(switchedScenes.length, 0);
    assert.ok(emitted.some((e) => e.eventType === 'stream:scene-recommended'));

    const approved = await sceneSvc.approveRecommendation(rec!.id);
    assert.equal(approved.status, 'executed');
    assert.deepEqual(switchedScenes, ['Pause / BRB']);
  });
});
