import { Router } from 'express';
import { AppError, ErrorCode, type GameProfile, type StardewCapabilityLevel } from '@ngegame/shared';
import type { CalibrationService } from '../services/adaptation/calibrationService.js';
import { CALIBRATION_STEPS } from '../services/adaptation/calibrationService.js';
import type { GameBrainService } from '../services/adaptation/gameBrainService.js';
import { HybridLearningService } from '../services/adaptation/hybridLearningService.js';
import { parseStardewState, planStardewTask, StardewAdapterService } from '../services/adaptation/stardewAdapter.js';
import type { GameProfileManager } from '../services/adaptation/gameProfileManager.js';
import type { PipelineDiagnosticsService } from '../services/adaptation/pipelineDiagnostics.js';
import type { SteamManager } from '../services/steam/steamManager.js';

export function createAdaptationRouter(deps: {
  profileManager: GameProfileManager;
  diagnosticsService: PipelineDiagnosticsService;
  gameBrainService: GameBrainService;
  calibrationService: CalibrationService;
  steamManager: SteamManager;
}): Router {
  const router = Router();

  router.get('/diagnostics', async (_req, res, next) => {
    try {
      const report = await deps.diagnosticsService.runFullAudit();
      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  router.get('/steam/diagnostics', async (_req, res, next) => {
    try {
      let diag = deps.steamManager.getDiagnostics();
      if (!diag) {
        await deps.steamManager.detectInstallation();
        diag = deps.steamManager.getDiagnostics();
      }
      res.json(diag);
    } catch (err) {
      next(err);
    }
  });

  router.get('/profiles', async (_req, res, next) => {
    try {
      const profiles = await deps.profileManager.listProfiles();
      res.json({ profiles });
    } catch (err) {
      next(err);
    }
  });

  router.get('/profiles/:gameId', async (req, res, next) => {
    try {
      const profile = await deps.profileManager.getProfile(req.params.gameId);
      const validation = await deps.profileManager.getDiagnostics(req.params.gameId);
      res.json({ profile, validation });
    } catch (err) {
      next(err);
    }
  });

  router.put('/profiles/:gameId', async (req, res, next) => {
    try {
      const body = req.body as GameProfile;
      const saved = await deps.profileManager.saveProfile({
        ...body,
        gameId: req.params.gameId,
      });
      res.json({ profile: saved });
    } catch (err) {
      next(err);
    }
  });

  router.post('/profiles', async (req, res, next) => {
    try {
      const saved = await deps.profileManager.saveProfile(req.body as GameProfile);
      res.status(201).json({ profile: saved });
    } catch (err) {
      next(err);
    }
  });

  router.post('/profiles/:gameId/reset', async (req, res, next) => {
    try {
      const profile = await deps.profileManager.resetProfile(req.params.gameId);
      res.json({ profile });
    } catch (err) {
      next(err);
    }
  });

  router.post('/profiles/:gameId/duplicate', async (req, res, next) => {
    try {
      const { newGameId, newGameName } = req.body as {
        newGameId?: string;
        newGameName?: string;
      };
      if (!newGameId || typeof newGameId !== 'string') {
        throw new AppError('newGameId wajib diisi.', ErrorCode.VALIDATION_ERROR, 400);
      }
      const profile = await deps.profileManager.duplicateProfile(
        req.params.gameId,
        newGameId,
        newGameName ?? '',
      );
      res.status(201).json({ profile });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/profiles/:gameId', async (req, res, next) => {
    try {
      const result = await deps.profileManager.deleteProfile(req.params.gameId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/profiles/:gameId/history', async (req, res, next) => {
    try {
      const limit = Number.parseInt(String(req.query.limit ?? '25'), 10);
      const history = await deps.profileManager.getProfileHistory(
        req.params.gameId,
        Number.isNaN(limit) ? 25 : limit,
      );
      res.json({ history });
    } catch (err) {
      next(err);
    }
  });

  router.post('/profiles/import', async (req, res, next) => {
    try {
      const { json } = req.body as { json?: string };
      if (!json || typeof json !== 'string') {
        throw new AppError('Field json wajib diisi.', ErrorCode.VALIDATION_ERROR, 400);
      }
      const profile = await deps.profileManager.importProfile(json);
      res.status(201).json({ profile });
    } catch (err) {
      next(err);
    }
  });

  router.get('/profiles/:gameId/export', async (req, res, next) => {
    try {
      const json = await deps.profileManager.exportProfile(req.params.gameId);
      res.json({ json });
    } catch (err) {
      next(err);
    }
  });

  const stardewAdapter = new StardewAdapterService();
  const hybridLearning = new HybridLearningService(deps.profileManager);

  router.get('/learning/:gameId/insights', async (req, res, next) => {
    try {
      const insights = await hybridLearning.getContextualInsights(req.params.gameId);
      res.json(insights);
    } catch (err) {
      next(err);
    }
  });

  router.post('/learning/:gameId/feedback', async (req, res, next) => {
    try {
      const { feedback, correctionType, relatedAction } = req.body as {
        feedback?: string;
        correctionType?: 'positive' | 'correction';
        relatedAction?: string;
      };
      const saved = await hybridLearning.submitUserFeedback(
        req.params.gameId,
        feedback ?? '',
        correctionType ?? 'correction',
        relatedAction ?? 'general',
      );
      res.status(201).json({ record: saved });
    } catch (err) {
      next(err);
    }
  });

  router.post('/learning/:gameId/reset', async (req, res, next) => {
    try {
      const result = await hybridLearning.resetLearning(req.params.gameId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/proposals/:gameId', async (req, res, next) => {
    try {
      const proposals = await hybridLearning.listProposals(req.params.gameId);
      res.json({ proposals });
    } catch (err) {
      next(err);
    }
  });

  router.post('/proposals/:gameId/generate', async (req, res, next) => {
    try {
      const proposal = await hybridLearning.generateProposalFromExperience(req.params.gameId);
      res.status(201).json({ proposal });
    } catch (err) {
      next(err);
    }
  });

  router.post('/proposals/:id/approve', async (req, res, next) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const { note } = (req.body ?? {}) as { note?: string };
      const result = await hybridLearning.approveProposal(id, note);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/proposals/:id/reject', async (req, res, next) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const { note } = (req.body ?? {}) as { note?: string };
      const proposal = await hybridLearning.rejectProposal(id, note);
      res.json({ proposal });
    } catch (err) {
      next(err);
    }
  });

  router.get('/stardew/capabilities', async (req, res, next) => {
    try {
      const levelRaw = Number.parseInt(String(req.query.level ?? '1'), 10);
      const level = (levelRaw >= 1 && levelRaw <= 7 ? levelRaw : 1) as StardewCapabilityLevel;
      const overview = await stardewAdapter.getCapabilitiesOverview(level);
      res.json(overview);
    } catch (err) {
      next(err);
    }
  });

  router.post('/stardew/levels/:level/test', async (req, res, next) => {
    try {
      const levelRaw = Number.parseInt(String(req.params.level), 10);
      if (Number.isNaN(levelRaw) || levelRaw < 1 || levelRaw > 7) {
        throw new AppError('Level Stardew harus bernilai 1..7.', ErrorCode.VALIDATION_ERROR, 400);
      }
      const result = await stardewAdapter.runLevelAcceptanceTest(levelRaw as StardewCapabilityLevel);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/stardew/plan', async (req, res, next) => {
    try {
      const { command, observation } = req.body as {
        command?: string;
        observation?: import('@ngegame/shared').StructuredVisionObservation;
      };
      if (!command || typeof command !== 'string') {
        throw new AppError('command wajib diisi.', ErrorCode.VALIDATION_ERROR, 400);
      }
      const gates = await stardewAdapter.getGateState();
      const state = parseStardewState(
        observation ?? {
          gameId: 'stardew-valley',
          screenState: 'gameplay',
          player: { position: { x: 640, y: 360 }, confidence: 0.9 },
          visibleObjects: [],
          interactableObjects: [],
          uiElements: [],
          extractedText: '10:00 AM Energy 85%',
          confidence: 0.9,
          timestamp: new Date().toISOString(),
        },
      );
      const plan = planStardewTask(state, command, gates.highestUnlockedLevel);
      res.json(plan);
    } catch (err) {
      next(err);
    }
  });

  router.post('/brain/cycle', async (req, res, next) => {
    try {
      const body = req.body as {
        gameId?: string;
        windowTitle?: string;
        dryRun?: boolean;
        goalOverride?: string;
      };
      if (!body.gameId) {
        throw new AppError('gameId wajib diisi.', ErrorCode.VALIDATION_ERROR, 400);
      }
      const result = await deps.gameBrainService.runBrainCycle({
        gameId: body.gameId,
        windowTitle: body.windowTitle,
        dryRun: body.dryRun,
        goalOverride: body.goalOverride,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/memory/:gameId', async (req, res, next) => {
    try {
      const limit = Number.parseInt(String(req.query.limit ?? '30'), 10);
      const memories = await deps.gameBrainService.listMemories(
        req.params.gameId,
        Number.isNaN(limit) ? 30 : limit,
      );
      res.json({ memories });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/memory/:gameId', async (req, res, next) => {
    try {
      const deleted = await deps.gameBrainService.clearMemories(req.params.gameId);
      res.json({ deleted });
    } catch (err) {
      next(err);
    }
  });

  router.get('/calibration/steps', (_req, res) => {
    res.json({ steps: CALIBRATION_STEPS });
  });

  router.get('/calibration/:gameId', async (req, res, next) => {
    try {
      const state = await deps.calibrationService.getState(req.params.gameId);
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.post('/calibration/:gameId/step/:step', async (req, res, next) => {
    try {
      const step = Number.parseInt(req.params.step, 10);
      if (Number.isNaN(step) || step < 1 || step > 11) {
        throw new AppError('Step kalibrasi harus bernilai 1..11.', ErrorCode.VALIDATION_ERROR, 400);
      }
      const state = await deps.calibrationService.runStep(req.params.gameId, step);
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
