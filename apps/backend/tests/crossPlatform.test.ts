import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { VisionAnalysisResult } from '@ngegame/shared';
import {
  createSteamScanner,
  WindowsSteamScanner,
  MacOSSteamScanner,
  LinuxSteamScanner,
} from '../src/services/steam/scanners.js';
import { GameProfileManager } from '../src/services/adaptation/gameProfileManager.js';
import { VisionAdaptationEngine } from '../src/services/adaptation/visionAdaptationEngine.js';
import { ControlAdaptationEngine } from '../src/services/adaptation/controlAdaptationEngine.js';
import {
  parseStardewState,
  planStardewTask,
  StardewAdapterService,
} from '../src/services/adaptation/stardewAdapter.js';
import { HybridLearningService } from '../src/services/adaptation/hybridLearningService.js';
import { ControllerService } from '../src/services/controller/controllerService.js';
import { SupervisionService } from '../src/services/supervision/supervisionService.js';
import { PythonWorkerClient } from '../src/workers/pythonWorkerClient.js';

function makeVisionFrame(overrides: Partial<VisionAnalysisResult>): VisionAnalysisResult {
  return {
    windowTitle: 'Stardew Valley',
    platform: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux',
    width: 1280,
    height: 720,
    imageBase64: '',
    sceneLabel: 'active_gameplay',
    motionScore: 0.1,
    brightness: 0.55,
    processingMs: 16,
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

describe('Phase 12F.10 — Cross-Platform & Integrated Pipeline Validation', () => {
  it('validates Windows, macOS, and Linux Steam scanner factories and path normalization', async () => {
    const winScanner = createSteamScanner('win32');
    const macScanner = createSteamScanner('darwin');
    const linScanner = createSteamScanner('linux');

    assert.ok(winScanner instanceof WindowsSteamScanner);
    assert.ok(macScanner instanceof MacOSSteamScanner);
    assert.ok(linScanner instanceof LinuxSteamScanner);

    const winWithMockReg = new WindowsSteamScanner(undefined, async () => 'D:\\Games\\Steam');
    const winRes = await winWithMockReg.getCandidateSteamPaths();
    assert.equal(winRes.registryQueried, true);
    assert.equal(winRes.registrySteamPath, 'D:\\Games\\Steam');
    assert.ok(winRes.candidates.includes('D:\\Games\\Steam'));
    assert.ok(winRes.candidates.includes('C:\\Steam'));
    assert.equal(
      winWithMockReg.normalizeLibraryPath('D:\\\\SteamLibrary/steamapps'),
      'D:\\SteamLibrary\\steamapps',
    );

    const macRes = await macScanner.getCandidateSteamPaths();
    assert.equal(macRes.registryQueried, false);
    assert.ok(macRes.candidates.some((p) => p.includes('Application Support/Steam')));

    const linRes = await linScanner.getCandidateSteamPaths();
    assert.equal(linRes.registryQueried, false);
    assert.ok(linRes.candidates.some((p) => p.includes('.local/share/Steam')));
  });

  it('validates integrated 12F pipeline: Profile -> Vision -> Stardew -> Control -> Supervision -> Learning', async () => {
    const workerScript = path.resolve(process.cwd(), '..', 'python-worker', 'main.py');
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    const workerClient = new PythonWorkerClient({
      pythonBin,
      workerScriptPath: workerScript,
      timeoutMs: 5000,
    });

    const profileManager = new GameProfileManager();
    const visionEngine = new VisionAdaptationEngine();
    const controlEngine = new ControlAdaptationEngine();
    const stardewAdapter = new StardewAdapterService();
    const learningService = new HybridLearningService(profileManager);
    const controller = new ControllerService(workerClient);
    const supervision = new SupervisionService(controller);

    const createdQueueIds: number[] = [];
    const createdProposalIds: number[] = [];

    try {
      await profileManager.ensureBuiltinProfiles();
      const stardew = await profileManager.getProfile('stardew-valley');
      assert.ok(stardew, 'Built-in Stardew Valley profile must exist');

      // 1. Vision observation
      const observation = visionEngine.observe(
        stardew,
        makeVisionFrame({
          ocrText: '6:30 AM Spring 1 Energy 90% Gold 500g',
        }),
      );
      assert.equal(observation.screenState, 'gameplay');
      assert.ok(observation.confidence >= 0.7);

      // 2. Stardew Level 1..2 acceptance & farming plan
      await stardewAdapter.resetGates();
      const l1 = await stardewAdapter.runLevelAcceptanceTest(1);
      assert.equal(l1.passed, true);
      const l2 = await stardewAdapter.runLevelAcceptanceTest(2);
      assert.equal(l2.passed, true);

      const parsedState = parseStardewState(observation);
      const plan = planStardewTask(parsedState, 'Jalan ke ladang dan cek tanaman', 2);
      assert.equal(plan.allowed, true);
      assert.ok(plan.steps.length > 0);

      // 3. Control adaptation conflict check
      const conflicts = controlEngine.detectConflicts(stardew);
      assert.equal(conflicts.hasConflicts, false);

      // 4. Supervision semi-automatic gating
      await supervision.setPermissionLevel('L1');
      await supervision.returnControlToAI();

      const lowRiskMove = await supervision.submitAction({
        actionType: 'MOVE_DIRECTION',
        target: 'south',
        parameters: { direction: 'down' },
        confidence: 0.95,
        dryRun: true,
      });
      createdQueueIds.push(lowRiskMove.id);
      assert.equal(lowRiskMove.status, 'executed');

      const destructiveSell = await supervision.submitAction({
        actionType: 'USE_ITEM',
        target: 'Shipping Bin',
        rationale: 'Sell all parsnips',
        confidence: 0.98,
        dryRun: true,
      });
      createdQueueIds.push(destructiveSell.id);
      assert.equal(destructiveSell.status, 'pending');

      await supervision.stopTask();

      // 5. Hybrid learning experience -> proposal (non-mutating until approved)
      await learningService.resetLearning('stardew-valley');
      await learningService.recordExperience(
        'stardew-valley',
        'failure',
        'MOVE_DIRECTION:unknown',
        { reason: 'low_conf' },
        0.42,
      );
      await learningService.recordExperience(
        'stardew-valley',
        'failure',
        'INTERACT:unknown',
        { reason: 'no_focus' },
        0.45,
      );

      const proposal = await learningService.generateProposalFromExperience('stardew-valley');
      assert.ok(proposal);
      createdProposalIds.push(proposal.id);
      assert.equal(proposal.status, 'pending');

      const rejected = await learningService.rejectProposal(proposal.id, 'Uji lintas platform');
      assert.equal(rejected.status, 'rejected');

      await learningService.resetLearning('stardew-valley');
    } finally {
      const { getPrismaClient, disconnectDatabase } = await import('../src/db/prisma.js');
      const prisma = getPrismaClient();
      if (createdQueueIds.length > 0) {
        await prisma.supervisionQueueItem.deleteMany({
          where: { id: { in: createdQueueIds } },
        });
      }
      if (createdProposalIds.length > 0) {
        await prisma.adaptationProposal.deleteMany({
          where: { id: { in: createdProposalIds } },
        });
      }
      await disconnectDatabase();
      await workerClient.stop();
    }
  });
});
