import crypto from 'node:crypto';
import type {
  AIActionType,
  GameBrainCycleResult,
  GameMechanicId,
  GameMemoryRecord,
  GameProfile,
  StardewCapabilityLevel,
  StructuredVisionObservation,
  VisionAnalysisResult,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import type { AIBrainService } from '../ai/aiBrainService.js';
import type { ControllerService } from '../controller/controllerService.js';
import type { SupervisionService } from '../supervision/supervisionService.js';
import type { VisionService } from '../vision/visionService.js';
import { STARDEW_CAPABILITY_LEVELS } from './builtinProfiles.js';
import { ControlAdaptationEngine } from './controlAdaptationEngine.js';
import type { GameProfileManager } from './gameProfileManager.js';
import { VisionAdaptationEngine } from './visionAdaptationEngine.js';

export interface RunBrainCycleInput {
  gameId: string;
  windowTitle?: string;
  dryRun?: boolean;
  goalOverride?: string;
}

const MECHANIC_KEYWORDS: Record<GameMechanicId, string[]> = {
  movement: ['walk', 'move', 'run', 'gerak'],
  navigation: ['path', 'map', 'door', 'exit', 'jalur'],
  interaction: ['interact', 'talk', 'open', 'pick', 'e'],
  inventory: ['inventory', 'bag', 'item', 'toolbar', 'slot'],
  combat: ['attack', 'sword', 'enemy', 'hp', 'serang'],
  resource_management: ['energy', 'stamina', 'gold', 'water', 'energi'],
  dialogue: ['dialog', 'dialogue', 'npc', 'bicara', 'yes', 'no'],
  quest_objectives: ['quest', 'journal', 'misi', 'target'],
  time_management: ['am', 'pm', 'clock', 'jam', 'day'],
  building_crafting: ['craft', 'build', 'farm', 'crop', 'plant', 'sirami'],
};

export function classifyScreenState(
  ocrText: string,
  sceneLabel: string,
  motionScore: number,
): StructuredVisionObservation['screenState'] {
  const lower = `${ocrText} ${sceneLabel}`.toLowerCase();
  if (lower.includes('new') && lower.includes('load') && lower.includes('exit')) {
    return 'title_screen';
  }
  if (lower.includes('pause') || lower.includes('options') || lower.includes('resume')) {
    return 'pause_menu';
  }
  if (lower.includes('inventory') || lower.includes('crafting') || lower.includes('skills')) {
    return 'inventory';
  }
  if (lower.includes('dialogue') || lower.includes('talk')) {
    return 'dialogue';
  }
  if (sceneLabel === 'active_gameplay' || motionScore >= 0.03) {
    return 'gameplay';
  }
  return 'unknown';
}

export class GameBrainService {
  private readonly visionEngine = new VisionAdaptationEngine();
  private readonly controlEngine = new ControlAdaptationEngine();

  constructor(
    private readonly profileManager: GameProfileManager,
    private readonly visionService: VisionService,
    private readonly aiBrainService: AIBrainService,
    private readonly controllerService: ControllerService,
    private readonly supervisionService: SupervisionService,
  ) {}

  public buildStructuredObservation(
    profile: GameProfile,
    vision: VisionAnalysisResult | null,
  ): StructuredVisionObservation {
    return this.visionEngine.observe(profile, vision);
  }

  public getStardewCapabilities(level: StardewCapabilityLevel = 1) {
    return {
      currentLevel: level,
      levels: STARDEW_CAPABILITY_LEVELS,
    };
  }

  public async listMemories(gameId: string, limit = 30): Promise<GameMemoryRecord[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.gameMemoryEntry.findMany({
      where: { gameId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((row) => ({
      id: row.id,
      gameId: row.gameId,
      memoryType: row.memoryType as GameMemoryRecord['memoryType'],
      key: row.key,
      value: JSON.parse(row.valueJson) as Record<string, unknown>,
      confidence: row.confidence,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  public async recordMemory(
    gameId: string,
    memoryType: GameMemoryRecord['memoryType'],
    key: string,
    value: Record<string, unknown>,
    confidence: number,
    shortTermLimit = 20,
  ): Promise<GameMemoryRecord> {
    const prisma = getPrismaClient();
    const created = await prisma.gameMemoryEntry.create({
      data: {
        gameId,
        memoryType,
        key,
        valueJson: JSON.stringify(value),
        confidence,
      },
    });

    if (memoryType === 'short_term') {
      const oldRows = await prisma.gameMemoryEntry.findMany({
        where: { gameId, memoryType: 'short_term' },
        orderBy: { createdAt: 'desc' },
        skip: Math.max(1, shortTermLimit),
        select: { id: true },
      });
      if (oldRows.length > 0) {
        await prisma.gameMemoryEntry.deleteMany({
          where: { id: { in: oldRows.map((r) => r.id) } },
        });
      }
    }

    return {
      id: created.id,
      gameId: created.gameId,
      memoryType: created.memoryType as GameMemoryRecord['memoryType'],
      key: created.key,
      value,
      confidence: created.confidence,
      createdAt: created.createdAt.toISOString(),
    };
  }

  public async clearMemories(gameId: string): Promise<number> {
    const prisma = getPrismaClient();
    const res = await prisma.gameMemoryEntry.deleteMany({ where: { gameId } });
    return res.count;
  }

  public async runBrainCycle(input: RunBrainCycleInput): Promise<GameBrainCycleResult> {
    const cycleId = crypto.randomUUID();
    const profile = await this.profileManager.getProfile(input.gameId);
    const dryRun = input.dryRun ?? profile.safetyConfiguration.dryRunByDefault;

    // 1. OBSERVE
    let visionCapture: VisionAnalysisResult | null = null;
    try {
      visionCapture = await this.visionService.captureOnce({
        windowTitle: input.windowTitle ?? profile.gameName,
      });
    } catch {
      const recent = await this.visionService.getHistory(1);
      visionCapture = recent[0] ?? null;
    }

    const observe = this.buildStructuredObservation(profile, visionCapture);

    // 2. INTERPRET
    const activeMechanics = profile.mechanicsProfile.enabledMechanics.filter((mechanic) => {
      const keywords = MECHANIC_KEYWORDS[mechanic] ?? [];
      const textLower = observe.extractedText.toLowerCase();
      return (
        observe.screenState === 'gameplay' ||
        keywords.some((kw) => textLower.includes(kw))
      );
    });

    const interpret = {
      screenState: observe.screenState,
      activeMechanics:
        activeMechanics.length > 0
          ? activeMechanics
          : profile.mechanicsProfile.enabledMechanics.slice(0, 2),
      summary: `${profile.gameName}: layar=${observe.screenState}, confidence=${observe.confidence}, teks="${observe.extractedText.slice(0, 60)}"`,
    };

    // 3. PLAN
    const goal = input.goalOverride?.trim() || profile.objectiveProfile.primaryGoal;
    const recentMemories = await this.listMemories(profile.gameId, 5);
    const failedMemories = recentMemories.filter((m) => m.memoryType === 'failed_action');

    const decision = await this.aiBrainService.think({
      gameTitle: profile.gameName,
      genre: profile.genre,
      objective: `${goal}${failedMemories.length > 0 ? ` (hindari aksi gagal terakhir: ${failedMemories[0]?.key})` : ''}`,
      visionState: {
        windowTitle: visionCapture?.windowTitle ?? profile.gameName,
        sceneLabel: visionCapture?.sceneLabel ?? observe.screenState,
        motionScore: visionCapture?.motionScore ?? 0,
        brightness: visionCapture?.brightness ?? 0.5,
        ocrText: observe.extractedText,
      },
    });

    const primaryAction = decision.actions[0] ?? {
      actionType: 'OBSERVE_ONLY' as AIActionType,
      target: 'active_scene',
      durationMs: 250,
      confidence: observe.confidence,
      rationale: 'Tidak ada aksi terencana, fallback ke OBSERVE_ONLY.',
    };

    const clampedDuration = Math.min(
      Math.max(primaryAction.durationMs ?? 250, 50),
      profile.safetyConfiguration.maxHoldDurationMs,
    );

    const plan = {
      goal,
      subTasks: profile.objectiveProfile.dailyTasks,
      chosenAction: primaryAction.actionType,
      target: primaryAction.target,
      durationMs: clampedDuration,
      confidence: Math.min(observe.confidence || 0.5, primaryAction.confidence),
      rationale: primaryAction.rationale,
    };

    // 4. CHECK CONFIDENCE
    const minConfidence = profile.safetyConfiguration.minConfidence;
    const isHighImpact = plan.chosenAction !== 'OBSERVE_ONLY';
    const confidencePassed = !isHighImpact || plan.confidence >= minConfidence;
    const confidenceCheck = {
      passed: confidencePassed,
      threshold: minConfidence,
      actual: Number(plan.confidence.toFixed(2)),
      reason: confidencePassed
        ? 'Skor kepercayaan memenuhi ambang batas keamanan profil.'
        : `Skor kepercayaan (${plan.confidence.toFixed(2)}) di bawah ambang batas (${minConfidence}) — aksi berdampak tinggi diblokir otomatis.`,
    };

    // 5. REQUEST APPROVAL WHEN REQUIRED + 6. EXECUTE
    let approvalStatus: GameBrainCycleResult['approvalStatus'] = 'auto_approved';
    let execution: GameBrainCycleResult['execution'] = {
      executed: false,
      status: 'skipped',
      mappedInput: 'none',
      activeWindow: visionCapture?.windowTitle ?? 'unknown',
      reason: '',
    };

    if (!confidencePassed) {
      approvalStatus = 'blocked_low_confidence';
      execution.status = 'blocked';
      execution.reason = confidenceCheck.reason;
    } else if (!profile.safetyConfiguration.allowAutoExecute && isHighImpact && !dryRun) {
      approvalStatus = 'queued_for_human';
      await this.supervisionService.submitAction({
        actionType: plan.chosenAction,
        target: plan.target,
        durationMs: plan.durationMs,
        confidence: plan.confidence,
        rationale: `${profile.gameName}: ${plan.rationale}`,
        dryRun,
      });
      execution.status = 'queued';
      execution.reason = 'Dikirim ke antrean persetujuan manusia (allowAutoExecute=false).';
    } else {
      const execResult = await this.controlEngine.executeWithSafeguards(
        this.controllerService,
        profile,
        plan.chosenAction,
        plan.target,
        {
          durationMs: plan.durationMs,
          dryRun,
        },
      );

      if (execResult.status === 'blocked') {
        approvalStatus = 'blocked_safety';
      }

      execution = {
        executed: execResult.ok,
        status: execResult.status,
        mappedInput: execResult.mappedInput,
        activeWindow: execResult.activeWindow,
        reason: execResult.reason,
      };
    }

    // 7. VERIFY RESULT (termasuk deteksi perubahan frame before/after saat live)
    let verifyNote = execution.executed
      ? `Aksi ${plan.chosenAction} selesai (${execution.status}) pada jendela '${execution.activeWindow}'.`
      : `Aksi tidak dieksekusi langsung: ${execution.reason}`;
    let verified = execution.executed || approvalStatus === 'queued_for_human';
    if (execution.executed && !dryRun && visionCapture) {
      try {
        const afterCapture = await this.visionService.captureOnce({
          windowTitle: input.windowTitle ?? profile.gameName,
        });
        const change = this.visionEngine.detectStateChange(visionCapture, afterCapture, profile);
        verified = change.changed;
        verifyNote = `${verifyNote} ${change.summary}`;
      } catch {
        // Biarkan hasil eksekusi tetap tercatat jika capture ulang gagal
      }
    }
    const verification = { verified, note: verifyNote };

    // 8. UPDATE MEMORY (Short-term, Long-term, & Failed-action)
    const memoryType: GameMemoryRecord['memoryType'] =
      execution.status === 'blocked' || !confidencePassed
        ? 'failed_action'
        : 'short_term';

    await this.recordMemory(
      profile.gameId,
      memoryType,
      `${plan.chosenAction}:${observe.screenState}`,
      {
        cycleId,
        screenState: observe.screenState,
        chosenAction: plan.chosenAction,
        status: execution.status,
        reason: execution.reason,
      },
      plan.confidence,
      profile.memoryConfiguration.shortTermLimit,
    );

    if (verification.verified && execution.executed && profile.memoryConfiguration.longTermEnabled) {
      await this.recordMemory(
        profile.gameId,
        'long_term',
        `${plan.chosenAction}:${observe.screenState}`,
        {
          outcome: 'success',
          cycleId,
          verifiedNote: verification.note,
        },
        plan.confidence,
        profile.memoryConfiguration.shortTermLimit,
      );
    }

    await recordSystemLog('info', 'adaptation', `Brain cycle '${profile.gameId}' (${approvalStatus})`, {
      cycleId,
      action: plan.chosenAction,
      confidence: plan.confidence,
    });

    return {
      gameId: profile.gameId,
      cycleId,
      dryRun,
      observe,
      interpret,
      plan,
      confidenceCheck,
      approvalStatus,
      execution,
      verification,
      memoryUpdate: {
        recorded: true,
        memoryType,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
