import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { VisionAnalysisResult } from '@ngegame/shared';
import { STARDEW_VALLEY_PROFILE } from '../src/services/adaptation/builtinProfiles.js';
import {
  extractHudIndicators,
  VisionAdaptationEngine,
  type LabeledVisionSample,
} from '../src/services/adaptation/visionAdaptationEngine.js';
import {
  parseStardewState,
  planStardewTask,
  StardewAdapterService,
} from '../src/services/adaptation/stardewAdapter.js';
import { ControllerService } from '../src/services/controller/controllerService.js';
import { SupervisionService } from '../src/services/supervision/supervisionService.js';
import { PythonWorkerClient } from '../src/workers/pythonWorkerClient.js';

function makeFrame(overrides: Partial<VisionAnalysisResult>): VisionAnalysisResult {
  return {
    windowTitle: 'Stardew Valley',
    platform: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux',
    width: 1280,
    height: 720,
    imageBase64: '',
    sceneLabel: 'static_hud_or_idle',
    motionScore: 0.01,
    brightness: 0.5,
    processingMs: 14,
    samplingIntervalMs: 900,
    ocrText: '',
    hud: [],
    objects: [],
    events: [],
    capabilities: {
      platform: process.platform,
      captureBackend: process.platform === 'win32' ? 'windows-gdi' : 'macos-screencapture',
      opencvAvailable: false,
      ocrAvailable: false,
      pillowAvailable: false,
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Phase 14 — Labeled Vision Metrics, 20x Movement Dry-Run, Task Planning & Safety', () => {
  it('computes precision, recall, and accuracy on labeled Stardew Valley dataset', () => {
    const engine = new VisionAdaptationEngine();
    const dataset: LabeledVisionSample[] = [
      { id: 'menu-1', expectedScreenState: 'title_screen', vision: makeFrame({ ocrText: 'New Load Co-op Exit' }) },
      { id: 'menu-2', expectedScreenState: 'title_screen', vision: makeFrame({ ocrText: 'Stardew Valley New Load Co-op Exit' }) },
      { id: 'play-1', expectedScreenState: 'gameplay', vision: makeFrame({ sceneLabel: 'active_gameplay', motionScore: 0.12, ocrText: '6:30 AM Energy 95% Gold 500g' }) },
      { id: 'play-2', expectedScreenState: 'gameplay', vision: makeFrame({ sceneLabel: 'active_gameplay', motionScore: 0.08, ocrText: '9:10 AM Energy 80% Toolbar: Watering Can' }) },
      { id: 'play-3', expectedScreenState: 'gameplay', vision: makeFrame({ sceneLabel: 'static_hud_or_idle', motionScore: 0.05, ocrText: '2:20 PM Energy 60% Parsnip Crop' }) },
      { id: 'inv-1', expectedScreenState: 'inventory', vision: makeFrame({ ocrText: 'Inventory Crafting Skills Social' }) },
      { id: 'inv-2', expectedScreenState: 'inventory', vision: makeFrame({ ocrText: 'Inventory Backpack Slot 1-12' }) },
      { id: 'dlg-1', expectedScreenState: 'dialogue', vision: makeFrame({ sceneLabel: 'bright_ui_or_dialog', ocrText: 'Pierre: Welcome to Pierre General Store!' }) },
      { id: 'dlg-2', expectedScreenState: 'dialogue', vision: makeFrame({ sceneLabel: 'bright_ui_or_dialog', ocrText: 'Robin: Dialogue talk option' }) },
      { id: 'pause-1', expectedScreenState: 'pause_menu', vision: makeFrame({ ocrText: 'Pause Menu Options Resume Exit' }) },
    ];

    const evalRes = engine.evaluateLabeledDataset(STARDEW_VALLEY_PROFILE, dataset);
    const classes = ['title_screen', 'gameplay', 'inventory', 'dialogue', 'pause_menu'] as const;
    const perClassMetrics = classes.map((cls) => {
      const tp = evalRes.details.filter((r) => r.expected === cls && r.predicted === cls).length;
      const fp = evalRes.details.filter((r) => r.expected !== cls && r.predicted === cls).length;
      const fn = evalRes.details.filter((r) => r.expected === cls && r.predicted !== cls).length;
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      return { cls, tp, fp, fn, precision, recall };
    });

    console.info('[Phase14 Vision Metrics]', JSON.stringify({
      accuracy: evalRes.accuracy,
      correct: evalRes.correctPredictions,
      total: evalRes.totalSamples,
      perClassMetrics,
    }));

    assert.ok(evalRes.accuracy >= 0.9, `Accuracy ${evalRes.accuracy} < 0.9`);
    for (const m of perClassMetrics) {
      assert.ok(m.precision >= 0.9, `Precision for ${m.cls} < 0.9`);
      assert.ok(m.recall >= 0.9, `Recall for ${m.cls} < 0.9`);
    }

    const hud = extractHudIndicators('9:10 AM • Energy 80% • Gold 1,500 • Toolbar: Watering Can');
    assert.equal(hud.clockText, '9:10 AM');
    assert.equal(hud.energyPercent, 80);
    assert.equal(hud.goldAmount, 1500);
    assert.ok(hud.inventoryHint?.includes('Watering Can'));
  });

  it('validates 20x movement dry-run, gardening task planning, and full safety matrix', async () => {
    const workerScript = path.resolve(process.cwd(), '..', 'python-worker', 'main.py');
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    const workerClient = new PythonWorkerClient({
      pythonBin,
      workerScriptPath: workerScript,
      timeoutMs: 5000,
    });
    const controller = new ControllerService(workerClient);
    const supervision = new SupervisionService(controller);
    const stardewAdapter = new StardewAdapterService();
    const createdQueueIds: number[] = [];

    try {
      // 20x movement dry-run (left, right, up, down) + release_all
      await supervision.setPermissionLevel('L1');
      await supervision.returnControlToAI();
      const dirs = ['left', 'right', 'up', 'down'] as const;
      let movePass = 0;
      for (let i = 0; i < 20; i += 1) {
        const dir = dirs[i % dirs.length]!;
        const res = await supervision.submitAction({
          actionType: 'MOVE_DIRECTION',
          target: `tile_${dir}`,
          parameters: { direction: dir },
          durationMs: 120,
          confidence: 0.95,
          dryRun: true,
        });
        createdQueueIds.push(res.id);
        if (res.status === 'executed') movePass += 1;
      }
      assert.equal(movePass, 20);
      await controller.releaseAll();

      // Task Planning: "Periksa kebun, siram tanaman yang belum disiram, lalu berhenti dan laporkan hasilnya."
      await stardewAdapter.resetGates();
      for (const lvl of [1, 2, 3, 4, 5] as const) {
        const gate = await stardewAdapter.runLevelAcceptanceTest(lvl);
        assert.equal(gate.passed, true);
      }

      const state = parseStardewState({
        gameId: 'stardew-valley',
        screenState: 'gameplay',
        player: { position: { x: 640, y: 360 }, confidence: 0.92 },
        visibleObjects: [{ label: 'crops', confidence: 0.9 }],
        interactableObjects: [{ label: 'dry_crop', actionHint: 'INTERACT', confidence: 0.91 }],
        uiElements: [],
        extractedText: '8:00 AM Energy 85% Toolbar: Watering Can',
        confidence: 0.92,
        timestamp: new Date().toISOString(),
      });

      const plan = planStardewTask(
        state,
        'Periksa kebun, siram tanaman yang belum disiram, lalu berhenti dan laporkan hasilnya.',
        5,
      );
      assert.equal(plan.allowed, true);
      assert.ok(plan.steps.length >= 2);

      // Safety Test: Low confidence stop, Approval Queue, Pause/Resume, Stop Task, Takeover, Emergency Stop
      const lowConf = await supervision.submitAction({
        actionType: 'INTERACT',
        target: 'unknown_object',
        confidence: 0.35,
        dryRun: true,
      });
      createdQueueIds.push(lowConf.id);
      assert.equal(lowConf.status, 'pending');

      await supervision.pauseAI();
      const blockedPaused = await supervision.submitAction({
        actionType: 'MOVE_DIRECTION',
        target: 'north',
        confidence: 0.95,
        dryRun: true,
      });
      createdQueueIds.push(blockedPaused.id);
      assert.equal(blockedPaused.status, 'blocked');

      await supervision.resumeAI();
      await supervision.stopTask();
      await supervision.takeOverControl();
      const em = await supervision.emergencyStop();
      assert.equal(em.emergencyStopped, true);
      await supervision.resetEmergency();
    } finally {
      const { getPrismaClient, disconnectDatabase } = await import('../src/db/prisma.js');
      const prisma = getPrismaClient();
      if (createdQueueIds.length > 0) {
        await prisma.supervisionQueueItem.deleteMany({
          where: { id: { in: createdQueueIds } },
        });
      }
      await disconnectDatabase();
      await workerClient.stop();
    }
  });
});
