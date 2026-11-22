import {
  ALLOWED_AI_ACTIONS,
  AppError,
  ErrorCode,
  type ControllerExecuteRequest,
  type ControllerExecutionResult,
  type ControllerState,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import type { PythonWorkerClient } from '../../workers/pythonWorkerClient.js';

const ALLOWED_SET = new Set<string>(ALLOWED_AI_ACTIONS);

export class ControllerService {
  private readonly workerClient: PythonWorkerClient;

  constructor(workerClient: PythonWorkerClient) {
    this.workerClient = workerClient;
  }

  private async callWorkerState(
    command:
      | 'controller_status'
      | 'controller_pause'
      | 'controller_resume'
      | 'controller_release_all'
      | 'controller_emergency_stop'
      | 'controller_reset_emergency',
  ): Promise<ControllerState> {
    const res = await this.workerClient.sendCommand(command);
    if (!res.ok || !res.data) {
      throw new AppError(
        res.error?.message ?? `Controller command '${command}' failed`,
        ErrorCode.WORKER_EXECUTION_ERROR,
        500,
      );
    }
    return res.data as unknown as ControllerState;
  }

  public async getStatus(): Promise<ControllerState> {
    return this.callWorkerState('controller_status');
  }

  public async getDiagnostics(expectedGameTitle?: string): Promise<Record<string, unknown>> {
    const res = await this.workerClient.sendCommand('controller_diagnostics', {
      expectedGameTitle: expectedGameTitle ?? 'Stardew Valley',
    });
    if (!res.ok || !res.data) {
      throw new AppError(
        res.error?.message ?? 'Controller diagnostics failed',
        ErrorCode.WORKER_EXECUTION_ERROR,
        500,
      );
    }
    return res.data;
  }

  public async pause(): Promise<ControllerState> {
    const state = await this.callWorkerState('controller_pause');
    await recordSystemLog('info', 'controller', 'Controller paused');
    return state;
  }

  public async resume(): Promise<ControllerState> {
    const state = await this.callWorkerState('controller_resume');
    await recordSystemLog('info', 'controller', 'Controller resumed');
    return state;
  }

  public async releaseAll(): Promise<ControllerState> {
    const state = await this.callWorkerState('controller_release_all');
    await recordSystemLog('info', 'controller', 'Released all controller keys');
    return state;
  }

  public async emergencyStop(): Promise<ControllerState> {
    const state = await this.callWorkerState('controller_emergency_stop');
    await recordSystemLog('warn', 'controller', 'EMERGENCY STOP activated on Game Controller');
    return state;
  }

  public async resetEmergency(): Promise<ControllerState> {
    const state = await this.callWorkerState('controller_reset_emergency');
    await recordSystemLog('info', 'controller', 'Controller Emergency Stop reset');
    return state;
  }

  public async executeAction(
    request: ControllerExecuteRequest,
  ): Promise<ControllerExecutionResult> {
    if (!ALLOWED_SET.has(request.actionType)) {
      throw new AppError(
        `Action '${request.actionType}' is not in the controller allowlist`,
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    const durationMs = Math.min(Math.max(request.durationMs ?? 300, 50), 2000);
    const dryRun = request.dryRun ?? true;

    const res = await this.workerClient.sendCommand('controller_execute', {
      actionType: request.actionType,
      target: request.target,
      parameters: request.parameters ?? {},
      durationMs,
      expectedGameTitle: request.expectedGameTitle,
      dryRun,
    });

    if (!res.ok || !res.data) {
      throw new AppError(
        res.error?.message ?? 'Controller execution failed',
        ErrorCode.WORKER_EXECUTION_ERROR,
        500,
      );
    }

    const execResult = res.data as unknown as ControllerExecutionResult;
    const prisma = getPrismaClient();
    const saved = await prisma.controllerActionLog.create({
      data: {
        actionType: execResult.actionType,
        mappedInput: execResult.mappedInput,
        durationMs: execResult.durationMs,
        dryRun: execResult.dryRun,
        activeWindow: execResult.activeWindow,
        status: execResult.status,
        reason: execResult.reason,
      },
    });

    await recordSystemLog(
      execResult.ok ? 'info' : 'warn',
      'controller',
      `Controller ${execResult.status}: ${execResult.actionType} (${execResult.mappedInput})`,
    );

    return {
      ...execResult,
      id: saved.id,
    };
  }

  public async getHistory(limit = 20): Promise<ControllerExecutionResult[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.controllerActionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });

    return rows.map((row) => ({
      id: row.id,
      ok: row.status === 'executed' || row.status === 'simulated',
      actionType: row.actionType as ControllerExecutionResult['actionType'],
      mappedInput: row.mappedInput,
      durationMs: row.durationMs,
      dryRun: row.dryRun,
      activeWindow: row.activeWindow,
      status: row.status as ControllerExecutionResult['status'],
      reason: row.reason,
      executedAt: row.createdAt.toISOString(),
    }));
  }
}
