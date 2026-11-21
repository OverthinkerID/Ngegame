import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WindowsSteamScanner,
  MacOSSteamScanner,
  LinuxSteamScanner,
} from '../src/services/steam/scanners.js';
import {
  GameProfileManager,
  validateGameProfile,
} from '../src/services/adaptation/gameProfileManager.js';
import { STARDEW_VALLEY_PROFILE } from '../src/services/adaptation/builtinProfiles.js';
import {
  classifyScreenState,
  GameBrainService,
} from '../src/services/adaptation/gameBrainService.js';

process.env.DATABASE_URL ??= 'file:./dev.db';

describe('Phase 12F — Game Adaptation Engine', () => {

  it('platform-specific Steam scanners generate normalized candidate paths', async () => {
    const win = new WindowsSteamScanner('D:\\CustomSteam');
    const winRes = await win.getCandidateSteamPaths();
    assert.equal(win.scannerName, 'WindowsSteamScanner');
    assert.ok(winRes.candidates.includes('D:\\CustomSteam'));
    assert.equal(win.normalizeLibraryPath('E:\\\\SteamLibrary\\\\'), 'E:\\SteamLibrary\\');

    const mac = new MacOSSteamScanner('/Volumes/Games/Steam');
    const macRes = await mac.getCandidateSteamPaths();
    assert.equal(mac.scannerName, 'MacOSSteamScanner');
    assert.ok(macRes.candidates.includes('/Volumes/Games/Steam'));

    const linux = new LinuxSteamScanner();
    assert.equal(linux.scannerName, 'LinuxSteamScanner');
    const linuxRes = await linux.getCandidateSteamPaths();
    assert.ok(linuxRes.candidates.length >= 2);
  });

  it('validates game profiles and detects keyboard conflicts & unsafe hold duration', () => {
    const valid = validateGameProfile(STARDEW_VALLEY_PROFILE);
    assert.equal(valid.valid, true);

    const invalid = validateGameProfile({
      ...STARDEW_VALLEY_PROFILE,
      gameId: 'bad id!',
      safetyConfiguration: {
        ...STARDEW_VALLEY_PROFILE.safetyConfiguration,
        maxHoldDurationMs: 5000,
      },
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.length >= 2);
  });

  it('persists, versions, duplicates, deletes, tracks history, exports, imports, and resets profiles across restarts', async () => {
    const manager = new GameProfileManager();
    const list = await manager.listProfiles();
    assert.ok(list.some((p) => p.gameId === 'stardew-valley'));
    assert.ok(list.some((p) => p.gameId === 'universal-default'));

    const stardew = await manager.getProfile('stardew-valley');
    const saved = await manager.saveProfile(
      {
        ...stardew,
        objectiveProfile: {
          ...stardew.objectiveProfile,
          primaryGoal: 'Test Goal Phase 12F.3',
        },
      },
      'Ubah tujuan utama untuk uji versi',
    );
    assert.equal(saved.profileVersion, stardew.profileVersion + 1);

    // Simulasi restart aplikasi dengan instance manager baru
    const reloadedManager = new GameProfileManager();
    const reloaded = await reloadedManager.getProfile('stardew-valley');
    assert.equal(reloaded.objectiveProfile.primaryGoal, 'Test Goal Phase 12F.3');
    assert.equal(reloaded.profileVersion, saved.profileVersion);

    const history = await reloadedManager.getProfileHistory('stardew-valley');
    assert.ok(history.length >= 2);
    assert.equal(history[0]?.changeSummary, 'Ubah tujuan utama untuk uji versi');

    // Duplikasi & hapus profil kustom
    const dupId = 'stardew-custom-test';
    await reloadedManager.deleteProfile(dupId).catch(() => {});
    const duplicated = await reloadedManager.duplicateProfile(
      'stardew-valley',
      dupId,
      'Stardew Custom Test',
    );
    assert.equal(duplicated.gameId, dupId);
    assert.equal(duplicated.isBuiltin, false);

    // Profil bawaan tidak boleh dihapus
    await assert.rejects(() => reloadedManager.deleteProfile('stardew-valley'));

    const deleted = await reloadedManager.deleteProfile(dupId);
    assert.equal(deleted.deleted, true);

    const exported = await reloadedManager.exportProfile('stardew-valley');
    const parsed = JSON.parse(exported) as typeof stardew;
    parsed.gameId = 'custom-test-game';
    parsed.gameName = 'Custom Test Game';
    const imported = await reloadedManager.importProfile(JSON.stringify(parsed));
    assert.equal(imported.gameId, 'custom-test-game');
    await reloadedManager.deleteProfile('custom-test-game');

    const reset = await reloadedManager.resetProfile('stardew-valley');
    assert.equal(reset.profileVersion, 1);
  });

  it('classifies screen states and blocks high-impact actions on low confidence', async () => {
    assert.equal(classifyScreenState('New Load Co-op Exit', 'static', 0), 'title_screen');
    assert.equal(classifyScreenState('Resume Options', 'static', 0), 'pause_menu');
    assert.equal(classifyScreenState('', 'active_gameplay', 0.1), 'gameplay');

    const manager = new GameProfileManager();
    const fakeVision = {
      captureOnce: async () => {
        throw new Error('no display');
      },
      getHistory: async () => [],
    };
    const fakeAI = {
      think: async () => ({
        id: 1,
        providerUsed: 'deterministic-fallback' as const,
        modelUsed: 'rule-based',
        fallbackUsed: true,
        genre: 'Simulation' as const,
        gameStateSummary: 'Unknown',
        strategyPlan: 'Try interact',
        reasoning: 'Test',
        confidence: 0.4,
        actions: [
          {
            actionType: 'INTERACT' as const,
            target: 'tile',
            parameters: {},
            durationMs: 200,
            confidence: 0.4,
            rationale: 'Low confidence test',
          },
        ],
        rejectedActions: [],
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
        latencyMs: 5,
        executionStatus: 'planned_only' as const,
        createdAt: new Date().toISOString(),
      }),
    };
    const fakeController = {
      executeAction: async () => {
        throw new Error('Should not execute on low confidence');
      },
    };
    const fakeSupervision = {
      submitAction: async () => {
        throw new Error('Should not queue when blocked by low confidence');
      },
    };

    const brain = new GameBrainService(
      manager,
      fakeVision as never,
      fakeAI as never,
      fakeController as never,
      fakeSupervision as never,
    );

    const cycle = await brain.runBrainCycle({ gameId: 'stardew-valley', dryRun: false });
    assert.equal(cycle.confidenceCheck.passed, false);
    assert.equal(cycle.approvalStatus, 'blocked_low_confidence');
    assert.equal(cycle.execution.executed, false);

    const memories = await brain.listMemories('stardew-valley', 5);
    assert.ok(memories.some((m) => m.memoryType === 'failed_action'));
  });
});
