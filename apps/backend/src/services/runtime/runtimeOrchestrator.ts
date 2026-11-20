import type {
  AIProviderHealth,
  ControllerState,
  GameBrainCycleResult,
  SupervisionState,
} from '@ngegame/shared';
import { AppError, ErrorCode } from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { Logger } from '../../utils/logger.js';
import type { GameBrainService } from '../adaptation/gameBrainService.js';
import type { GameProfileManager } from '../adaptation/gameProfileManager.js';
import type { AIBrainService } from '../ai/aiBrainService.js';
import type { ControllerService } from '../controller/controllerService.js';
import type { SteamManager } from '../steam/steamManager.js';
import type { SupervisionService } from '../supervision/supervisionService.js';
import type { VisionService } from '../vision/visionService.js';

export type RuntimeLifecyclePhase =
  | 'idle'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'recovered'
  | 'error';

export interface ActiveSessionSnapshot {
  id: string;
  title: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totalActions: number;
  totalDecisions: number;
}

export interface RuntimeOrchestrationState {
  phase: RuntimeLifecyclePhase;
  activeSession: ActiveSessionSnapshot | null;
  activeGameId: string | null;
  activeGameName: string | null;
  currentTask: string | null;
  gameState: string;
  lastCycleId: string | null;
  lastCycleAt: string | null;
  aiProviderHealth: AIProviderHealth | null;
  controllerStatus: ControllerState | null;
  supervisionState: SupervisionState | null;
  lastError: string | null;
  updatedAt: string;
}

export class RuntimeOrchestratorService {
  private readonly logger: Logger;
  private phase: RuntimeLifecyclePhase = 'idle';
  private activeSessionId: string | null = null;
  private activeGameId: string | null = null;
  private activeGameName: string | null = null;
  private currentTask: string | null = null;
  private gameState = 'unknown';
  private lastCycleId: string | null = null;
  private lastCycleAt: string | null = null;
  private lastError: string | null = null;
  private totalActions = 0;
  private totalDecisions = 0;

  constructor(
    private readonly profileManager: GameProfileManager,
    private readonly steamManager: SteamManager,
    private readonly visionService: VisionService,
    private readonly aiBrainService: AIBrainService,
    private readonly controllerService: ControllerService,
    private readonly supervisionService: SupervisionService,
    private readonly gameBrainService: GameBrainService,
    private readonly broadcastWs?: (eventType: string, payload: unknown) => void,
    logger = new Logger('runtime-orchestrator'),
  ) {
    this.logger = logger;
  }

  private emitWs(eventType: string, payload: unknown): void {
    try {
      this.broadcastWs?.(eventType, payload);
    } catch {
      // Abaikan error broadcast WS agar loop kontrol tetap aman
    }
  }

  public async getState(): Promise<RuntimeOrchestrationState> {
    const prisma = getPrismaClient();
    const [sessionRow, aiProviderHealth, controllerStatus, supervisionState] = await Promise.all([
      this.activeSessionId !== null
        ? prisma.sessionRecord.findUnique({ where: { id: this.activeSessionId } }).catch(() => null)
        : prisma.sessionRecord
            .findFirst({ where: { status: 'active' }, orderBy: { startedAt: 'desc' } })
            .catch(() => null),
      this.aiBrainService.getProvidersHealth().catch(() => null),
      this.controllerService.getStatus().catch(() => null),
      this.supervisionService.getState().catch(() => null),
    ]);

    return {
      phase: this.phase,
      activeSession: sessionRow
        ? {
            id: sessionRow.id,
            title: sessionRow.title,
            status: sessionRow.status,
            startedAt: sessionRow.startedAt.toISOString(),
            endedAt: sessionRow.endedAt ? sessionRow.endedAt.toISOString() : null,
            totalActions: this.totalActions,
            totalDecisions: this.totalDecisions,
          }
        : null,
      activeGameId: this.activeGameId,
      activeGameName: this.activeGameName,
      currentTask: this.currentTask,
      gameState: this.gameState,
      lastCycleId: this.lastCycleId,
      lastCycleAt: this.lastCycleAt,
      aiProviderHealth,
      controllerStatus,
      supervisionState,
      lastError: this.lastError,
      updatedAt: new Date().toISOString(),
    };
  }

  public async startSession(input: {
    gameId: string;
    windowTitle?: string;
    goal?: string;
  }): Promise<RuntimeOrchestrationState> {
    this.phase = 'initializing';
    this.lastError = null;

    try {
      await this.profileManager.ensureBuiltinProfiles();
      const profile = await this.profileManager.getProfile(input.gameId);
      await this.steamManager.listGames().catch(() => []);
      await this.visionService.getStatus();

      const prisma = getPrismaClient();
      await prisma.sessionRecord.updateMany({
        where: { status: 'active' },
        data: {
          status: 'recovered',
          endedAt: new Date(),
        },
      });

      const created = await prisma.sessionRecord.create({
        data: {
          title: input.windowTitle?.trim() || profile.gameName,
          status: 'active',
        },
      });

      this.activeSessionId = created.id;
      this.activeGameId = profile.gameId;
      this.activeGameName = profile.gameName;
      this.currentTask = input.goal?.trim() || profile.objectiveProfile.primaryGoal;
      this.gameState = 'initialized';
      this.totalActions = 0;
      this.totalDecisions = 0;
      this.phase = 'running';

      await recordSystemLog(
        'info',
        'runtime',
        `Sesi runtime ${created.id} dimulai untuk ${profile.gameName}`,
      );

      const state = await this.getState();
      this.emitWs('runtime:state', state);
      return state;
    } catch (err) {
      this.phase = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  public async runStep(input?: {
    gameId?: string;
    windowTitle?: string;
    dryRun?: boolean;
    goalOverride?: string;
  }): Promise<{ runtime: RuntimeOrchestrationState; cycle: GameBrainCycleResult }> {
    const gameId = input?.gameId ?? this.activeGameId;
    if (!gameId) {
      throw new AppError(
        'Tidak ada game aktif. Mulai sesi runtime terlebih dahulu.',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    if (this.activeSessionId === null) {
      await this.startSession({
        gameId,
        windowTitle: input?.windowTitle,
        goal: input?.goalOverride,
      });
    }

    const cycle = await this.gameBrainService.runBrainCycle({
      gameId,
      windowTitle: input?.windowTitle,
      dryRun: input?.dryRun,
      goalOverride: input?.goalOverride,
    });

    this.lastCycleId = cycle.cycleId;
    this.lastCycleAt = cycle.timestamp;
    this.gameState = cycle.interpret.screenState;
    this.currentTask = cycle.plan.goal;
    this.totalDecisions += 1;
    if (cycle.execution.executed) {
      this.totalActions += 1;
    }

    const runtime = await this.getState();
    this.emitWs('runtime:cycle', { runtime, cycle });
    return { runtime, cycle };
  }

  public async stopSession(reason = 'Dihentikan oleh pengguna'): Promise<RuntimeOrchestrationState> {
    this.phase = 'stopping';
    await this.supervisionService.stopTask();

    const prisma = getPrismaClient();
    if (this.activeSessionId !== null) {
      await prisma.sessionRecord.update({
        where: { id: this.activeSessionId },
        data: {
          status: 'completed',
          endedAt: new Date(),
        },
      });
    } else {
      await prisma.sessionRecord.updateMany({
        where: { status: 'active' },
        data: {
          status: 'completed',
          endedAt: new Date(),
        },
      });
    }

    this.activeSessionId = null;
    this.phase = 'idle';
    this.gameState = 'stopped';

    await recordSystemLog('info', 'runtime', `Sesi runtime dihentikan: ${reason}`);
    const state = await this.getState();
    this.emitWs('runtime:state', state);
    return state;
  }

  public async recoverInterruptedSessions(): Promise<{
    recoveredCount: number;
    runtime: RuntimeOrchestrationState;
  }> {
    // Pastikan pemulihan tidak pernah menjalankan ulang aksi berisiko secara otomatis
    await this.supervisionService.stopTask();

    const prisma = getPrismaClient();
    const res = await prisma.sessionRecord.updateMany({
      where: { status: 'active' },
      data: {
        status: 'recovered',
        endedAt: new Date(),
      },
    });

    this.activeSessionId = null;
    this.phase = res.count > 0 ? 'recovered' : 'idle';
    this.gameState = 'recovered_safe';

    if (res.count > 0) {
      this.logger.warn(`Recovered ${res.count} interrupted active session(s) safely`);
      await recordSystemLog(
        'warn',
        'runtime',
        `Memulihkan ${res.count} sesi terputus secara aman (AI dijeda)`,
      );
    }

    const runtime = await this.getState();
    this.emitWs('runtime:state', runtime);
    return { recoveredCount: res.count, runtime };
  }
}
