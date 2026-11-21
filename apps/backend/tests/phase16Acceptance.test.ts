import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChatIntelligenceService } from '../src/services/streamIntelligence/chatIntelligenceService.js';
import { GameplayEventIntelligenceService } from '../src/services/streamIntelligence/gameplayEventIntelligenceService.js';
import { HighlightIntelligenceService } from '../src/services/streamIntelligence/highlightIntelligenceService.js';
import { LiveCommentaryService } from '../src/services/streamIntelligence/liveCommentaryService.js';
import { SceneIntelligenceService } from '../src/services/streamIntelligence/sceneIntelligenceService.js';
import { StreamSessionSummaryService } from '../src/services/streamIntelligence/sessionSummaryService.js';
import { VoicePersonalityService } from '../src/services/streamIntelligence/voicePersonalityService.js';
import type { ObsWebSocketClient } from '../src/services/streaming/obsWebSocketClient.js';

describe('Phase 16.10: AI Stream Intelligence Integration & Acceptance Testing (Stardew Valley)', () => {
  it('runs end-to-end Stardew Valley pipeline across event detection, commentary, Indonesian TTS, OBS routing, YouTube/Twitch chat, scene, highlight, summary, manual takeover & automatic mode', async () => {
    const wsEvents: string[] = [];
    const broadcast = (eventType: string): void => {
      wsEvents.push(eventType);
    };

    const obsCalls: Array<{ type: string; data?: Record<string, unknown> }> = [];
    let currentScene = 'Gameplay';
    const mockObs = {
      isConnected: () => true,
      request: async (reqType: string, data?: Record<string, unknown>) => {
        obsCalls.push({ type: reqType, data });
        if (reqType === 'GetSceneList') {
          return {
            currentProgramSceneName: currentScene,
            scenes: [{ sceneName: 'Gameplay' }, { sceneName: 'Pause / BRB' }],
          };
        }
        if (reqType === 'GetStreamStatus') return { outputActive: true };
        if (reqType === 'GetRecordStatus') return { outputActive: true, outputDuration: 180000 };
        if (reqType === 'GetReplayBufferStatus') return { outputActive: false };
        if (reqType === 'SetCurrentProgramScene') {
          currentScene = String(data?.sceneName ?? currentScene);
          return {};
        }
        if (reqType === 'SetInputMute') return {};
        return {};
      },
    } as unknown as ObsWebSocketClient;

    const eventSvc = new GameplayEventIntelligenceService(broadcast);
    const commentarySvc = new LiveCommentaryService(broadcast);
    const voiceSvc = new VoicePersonalityService(broadcast, undefined, mockObs);
    const chatSvc = new ChatIntelligenceService(broadcast);
    const sceneSvc = new SceneIntelligenceService(broadcast, mockObs);
    const highlightSvc = new HighlightIntelligenceService(broadcast, mockObs);
    const summarySvc = new StreamSessionSummaryService();

    // 1. Automatic mode & multi-cycle Stardew Valley gameplay simulation (10 cycles)
    eventSvc.setMode('automatic');
    sceneSvc.updateConfig({ autoSwitchEnabled: true });
    commentarySvc.updateConfig({
      personality: 'casual',
      language: 'id',
      cooldownSeconds: 0,
      maxQueueSize: 5,
    });

    const uniqueTag = `S16_${Date.now()}`;
    const ocrFrames = [
      `Harvested Parsnip +1 ${uniqueTag}`,
      `Watered crops ${uniqueTag}`,
      `Achievement unlocked: Greenhorn ${uniqueTag}`,
      `Mayor Lewis dialogue ${uniqueTag}`,
      `Found Ancient Seed ${uniqueTag}`,
    ];

    for (let i = 0; i < 10; i += 1) {
      const ocrText = `#${i} ${ocrFrames[i % ocrFrames.length]}`;
      const sceneLabel = i % 5 === 3 ? 'pause_menu' : 'active_gameplay';
      const obsRes = await eventSvc.analyzeObservation({
        gameId: 'stardew-valley',
        windowTitle: 'Stardew Valley',
        sceneLabel,
        motionScore: 0.18,
        ocrText,
      });
      assert.equal(obsRes.verified, true);
      const ev = obsRes.events[0]!;

      const comRes = await commentarySvc.generateCommentary({
        event: ev,
        bypassCooldown: true,
      });
      assert.equal(comRes.accepted, true);

      await voiceSvc.enqueueSpeech({
        text: comRes.item!.text,
        priority: comRes.item!.priority,
        playAudio: false,
      });

      await sceneSvc.analyzeContext({ sceneLabel });
      await highlightSvc.detectFromEvent(ev, 50);
    }

    // Verify OBS audio routing and automatic scene switch occurred
    assert.ok(obsCalls.some((c) => c.type === 'SetInputMute'));
    assert.ok(obsCalls.some((c) => c.type === 'SetCurrentProgramScene'));

    // Verify queue bounded in long-running session
    const comStatus = await commentarySvc.getStatus();
    assert.ok(comStatus.queue.length <= 5);

    // 2. YouTube & Twitch chat interaction
    const ytMsg = await chatSvc.ingestMessage({
      platform: 'youtube',
      author: 'AndiYT',
      message: 'Bang ini game apa ya?',
    });
    assert.equal(ytMsg.isQuestion, true);
    await chatSvc.approveReply(ytMsg.id, '@AndiYT Lagi main Stardew Valley!');

    const twMsg = await chatSvc.ingestMessage({
      platform: 'twitch',
      author: 'SitiTW',
      message: 'Mantap banget panennya!',
    });
    assert.equal(twMsg.category, 'praise');

    // 3. Manual takeover / Emergency Stop halts pipeline safely, then reset restores
    await eventSvc.emergencyStop();
    await commentarySvc.stopAndClear(true);
    await voiceSvc.interrupt();

    const blocked = await eventSvc.analyzeObservation({
      gameId: 'stardew-valley',
      windowTitle: 'Stardew Valley',
      sceneLabel: 'active_gameplay',
      motionScore: 0.2,
      ocrText: `Blocked during emergency ${uniqueTag}`,
    });
    assert.equal(blocked.verified, false);

    eventSvc.resetEmergencyStop();
    commentarySvc.updateConfig({ muted: false });

    // 4. Final session summary report
    const summary = await summarySvc.generateSummary({
      gameId: 'stardew-valley',
      durationSeconds: 3600,
    });
    assert.equal(summary.gameId, 'stardew-valley');
    assert.ok(summary.importantEventsCount >= 5);
    assert.ok(summary.commentaryCount >= 10);
    assert.ok(summary.totalChatMessages >= 2);
    assert.ok(summary.highlightCandidatesCount >= 1);
    assert.ok(summary.reportMarkdown.includes('Laporan Sesi Streaming'));

    // Verify all Phase 16 WebSocket events were emitted
    for (const expectedWs of [
      'stream:event-detected',
      'stream:commentary-generated',
      'stream:voice-started',
      'stream:chat-received',
      'stream:chat-reply-proposed',
      'stream:scene-recommended',
      'stream:highlight-detected',
    ]) {
      assert.ok(wsEvents.includes(expectedWs), `Missing WS event: ${expectedWs}`);
    }
  });
});
