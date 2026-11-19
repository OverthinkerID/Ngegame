import {
  ALLOWED_AI_ACTIONS,
  AppError,
  ErrorCode,
  type AIActionType,
  type ControlOwner,
  type SupervisionAuditEntry,
  type SupervisionPermissionLevel,
  type SupervisionQueueItem,
  type SupervisionQueueStatus,
  type SupervisionSafetyPolicy,
  type SupervisionState,
  type SupervisionSubmitRequest,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import type { ControllerService } from '../controller/controllerService.js';

const ALLOWED_SET = new Set<string>(ALLOWED_AI_ACTIONS);

export class SupervisionService {
  private readonly controllerService: ControllerService;
  private permissionLevel: SupervisionPermissionLevel = 'L2';
  private controlOwner: ControlOwner = 'ai';
  private aiPaused = false;
  private emergencyStopped = false;
  private policy: SupervisionSafetyPolicy = {
    minConfidenceL1: 0.85,
    maxDurationMs: 1500,
    dryRunDefault: true,
    allowAutoExecuteL1: true,
  };

  constructor(controllerService: ControllerService) {
    this.controllerService = controllerService;
  }

  private async logAudit(
    eventType: string,
    actor: 'ai' | 'human' | 'system',
    details: string,
  ): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.supervisionAuditLog.create({
      data: {
        eventType,
        actor,
        permissionLevel: this.permissionLevel,
        controlOwner: this.controlOwner,
        details,
      },
    });
    await recordSystemLog('info', 'supervision', `[${eventType}] ${details}`);
  }

  public async getState(): Promise<SupervisionState> {
    const prisma = getPrismaClient();
    const pendingCount = await prisma.supervisionQueueItem.count({
      where: { status: 'pending' },
    });

    return {
      permissionLevel: this.permissionLevel,
      controlOwner: this.controlOwner,
      aiPaused: this.aiPaused,
      emergencyStopped: this.emergencyStopped,
      obsAffectedByEmergency: false,
      gameClosedByEmergency: false,
      policy: { ...this.policy },
      pendingCount,
      updatedAt: new Date().toISOString(),
    };
  }

  public async setPermissionLevel(
    level: SupervisionPermissionLevel,
  ): Promise<SupervisionState> {
    if (level !== 'L1' && level !== 'L2' && level !== 'L3') {
      throw new AppError('Invalid permission level', ErrorCode.VALIDATION_ERROR, 400);
    }
    this.permissionLevel = level;
    if (level === 'L3') {
      this.controlOwner = 'human';
      this.aiPaused = true;
      await this.controllerService.pause();
    }
    await this.logAudit(
      'PERMISSION_CHANGED',
      'human',
      `Permission level diubah ke ${level}`,
    );
    return this.getState();
  }

  public async updatePolicy(
    partial: Partial<SupervisionSafetyPolicy>,
  ): Promise<SupervisionState> {
    if (typeof partial.minConfidenceL1 === 'number') {
      this.policy.minConfidenceL1 = Math.min(Math.max(partial.minConfidenceL1, 0.5), 1);
    }
    if (typeof partial.maxDurationMs === 'number') {
      this.policy.maxDurationMs = Math.min(Math.max(Math.round(partial.maxDurationMs), 100), 2000);
    }
    if (typeof partial.dryRunDefault === 'boolean') {
      this.policy.dryRunDefault = partial.dryRunDefault;
    }
    if (typeof partial.allowAutoExecuteL1 === 'boolean') {
      this.policy.allowAutoExecuteL1 = partial.allowAutoExecuteL1;
    }
    await this.logAudit('POLICY_UPDATED', 'human', 'Safety policy diperbarui');
    return this.getState();
  }

  public async pauseAI(): Promise<SupervisionState> {
    this.aiPaused = true;
    await this.controllerService.pause();
    await this.logAudit('AI_PAUSED', 'human', 'AI gaming dijeda oleh supervisor');
    return this.getState();
  }

  public async resumeAI(): Promise<SupervisionState> {
    if (this.emergencyStopped) {
      throw new AppError(
        'Cannot resume AI while Emergency Stop is active',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }
    if (this.permissionLevel === 'L3') {
      throw new AppError(
        'Cannot resume AI in L3 Human Only mode',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }
    this.aiPaused = false;
    await this.controllerService.resume();
    await this.logAudit('AI_RESUMED', 'human', 'AI gaming dilanjutkan');
    return this.getState();
  }

  public async takeOverControl(): Promise<SupervisionState> {
    this.controlOwner = 'human';
    this.aiPaused = true;
    await this.controllerService.pause();
    await this.controllerService.releaseAll();
    await this.logAudit(
      'HUMAN_TAKEOVER',
      'human',
      'Kontrol diambil alih penuh oleh manusia; semua tombol dilepas',
    );
    return this.getState();
  }

  public async returnControlToAI(): Promise<SupervisionState> {
    if (this.emergencyStopped) {
      throw new AppError(
        'Cannot return control to AI while Emergency Stop is active',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }
    if (this.permissionLevel === 'L3') {
      throw new AppError(
        'Cannot return control to AI in L3 Human Only mode',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }
    this.controlOwner = 'ai';
    this.aiPaused = false;
    await this.controllerService.resume();
    await this.logAudit(
      'RETURN_CONTROL_TO_AI',
      'human',
      'Kontrol dikembalikan ke AI',
    );
    return this.getState();
  }

  public async emergencyStop(): Promise<SupervisionState> {
    this.emergencyStopped = true;
    this.aiPaused = true;
    this.controlOwner = 'human';
    await this.controllerService.emergencyStop();

    const prisma = getPrismaClient();
    await prisma.supervisionQueueItem.updateMany({
      where: { status: 'pending' },
      data: {
        status: 'blocked',
        reviewedBy: 'system',
        reviewNote: 'Diblokir otomatis oleh Emergency Stop',
      },
    });

    await this.logAudit(
      'EMERGENCY_STOP',
      'human',
      'Emergency Stop menghentikan seluruh input otomatis tanpa menutup game atau OBS',
    );
    return this.getState();
  }

  public async resetEmergency(): Promise<SupervisionState> {
    this.emergencyStopped = false;
    await this.controllerService.resetEmergency();
    await this.controllerService.pause();
    await this.logAudit(
      'EMERGENCY_RESET',
      'human',
      'Emergency Stop direset; kontrol tetap di tangan manusia hingga dialihkan',
    );
    return this.getState();
  }

  private mapQueueRow(row: {
    id: number;
    actionType: string;
    target: string;
    parametersJson: string;
    durationMs: number;
    confidence: number;
    rationale: string;
    permissionLevel: string;
    status: string;
    reviewedBy: string | null;
    reviewNote: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SupervisionQueueItem {
    return {
      id: row.id,
      actionType: row.actionType as AIActionType,
      target: row.target,
      parameters: JSON.parse(row.parametersJson) as Record<string, string | number | boolean>,
      durationMs: row.durationMs,
      confidence: row.confidence,
      rationale: row.rationale,
      permissionLevel: row.permissionLevel as SupervisionPermissionLevel,
      status: row.status as SupervisionQueueStatus,
      reviewedBy: row.reviewedBy,
      reviewNote: row.reviewNote,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public async submitAction(
    request: SupervisionSubmitRequest,
  ): Promise<SupervisionQueueItem> {
    if (!ALLOWED_SET.has(request.actionType)) {
      throw new AppError(
        `Action '${request.actionType}' is not allowed`,
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    const durationMs = Math.min(
      Math.max(request.durationMs ?? 300, 50),
      this.policy.maxDurationMs,
    );
    const confidence = Math.min(Math.max(request.confidence, 0), 1);
    const prisma = getPrismaClient();

    // Blocked immediately if Emergency Stop, Human Takeover, AI Paused, or L3 Human Only
    if (
      this.emergencyStopped ||
      this.controlOwner === 'human' ||
      this.aiPaused ||
      this.permissionLevel === 'L3'
    ) {
      const blocked = await prisma.supervisionQueueItem.create({
        data: {
          actionType: request.actionType,
          target: request.target,
          parametersJson: JSON.stringify(request.parameters ?? {}),
          durationMs,
          confidence,
          rationale: request.rationale ?? '',
          permissionLevel: this.permissionLevel,
          status: 'blocked',
          reviewedBy: 'system',
          reviewNote: `Diblokir (owner=${this.controlOwner}, level=${this.permissionLevel}, emergency=${this.emergencyStopped})`,
        },
      });
      await this.logAudit(
        'ACTION_BLOCKED',
        'system',
        `Aksi ${request.actionType} diblokir oleh kebijakan pengawasan`,
      );
      return this.mapQueueRow(blocked);
    }

    // L1 Auto Execute
    if (
      this.permissionLevel === 'L1' &&
      this.policy.allowAutoExecuteL1 &&
      confidence >= this.policy.minConfidenceL1
    ) {
      const execRes = await this.controllerService.executeAction({
        actionType: request.actionType,
        target: request.target,
        parameters: request.parameters,
        durationMs,
        dryRun: request.dryRun ?? this.policy.dryRunDefault,
      });

      const created = await prisma.supervisionQueueItem.create({
        data: {
          actionType: request.actionType,
          target: request.target,
          parametersJson: JSON.stringify(request.parameters ?? {}),
          durationMs,
          confidence,
          rationale: request.rationale ?? '',
          permissionLevel: 'L1',
          status: execRes.ok ? 'executed' : 'blocked',
          reviewedBy: 'auto-l1',
          reviewNote: execRes.reason,
        },
      });
      await this.logAudit(
        'L1_AUTO_EXECUTED',
        'ai',
        `L1 auto-execute ${request.actionType} (${execRes.status})`,
      );
      return this.mapQueueRow(created);
    }

    // L2 Approval Required (or L1 below confidence threshold)
    const pending = await prisma.supervisionQueueItem.create({
      data: {
        actionType: request.actionType,
        target: request.target,
        parametersJson: JSON.stringify(request.parameters ?? {}),
        durationMs,
        confidence,
        rationale: request.rationale ?? '',
        permissionLevel: this.permissionLevel,
        status: 'pending',
      },
    });
    await this.logAudit(
      'ACTION_QUEUED',
      'ai',
      `Aksi ${request.actionType} masuk antrean persetujuan (#${pending.id})`,
    );
    return this.mapQueueRow(pending);
  }

  public async approveAction(id: number, note?: string): Promise<SupervisionQueueItem> {
    if (this.emergencyStopped) {
      throw new AppError(
        'Cannot approve actions while Emergency Stop is active',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }
    if (this.permissionLevel === 'L3' || this.controlOwner === 'human') {
      throw new AppError(
        'Cannot approve AI execution while Human has control or in L3 mode',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    const prisma = getPrismaClient();
    const item = await prisma.supervisionQueueItem.findUnique({ where: { id } });
    if (!item) {
      throw new AppError(`Queue item #${id} not found`, ErrorCode.NOT_FOUND, 404);
    }
    if (item.status !== 'pending') {
      throw new AppError(
        `Queue item #${id} is already '${item.status}'`,
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    const execRes = await this.controllerService.executeAction({
      actionType: item.actionType as AIActionType,
      target: item.target,
      parameters: JSON.parse(item.parametersJson) as Record<string, string | number | boolean>,
      durationMs: item.durationMs,
      dryRun: this.policy.dryRunDefault,
    });

    const updated = await prisma.supervisionQueueItem.update({
      where: { id },
      data: {
        status: execRes.ok ? 'executed' : 'blocked',
        reviewedBy: 'human',
        reviewNote: note ?? execRes.reason,
      },
    });
    await this.logAudit(
      'ACTION_APPROVED',
      'human',
      `Aksi #${id} (${item.actionType}) disetujui dan dijalankan (${execRes.status})`,
    );
    return this.mapQueueRow(updated);
  }

  public async rejectAction(id: number, note?: string): Promise<SupervisionQueueItem> {
    const prisma = getPrismaClient();
    const item = await prisma.supervisionQueueItem.findUnique({ where: { id } });
    if (!item) {
      throw new AppError(`Queue item #${id} not found`, ErrorCode.NOT_FOUND, 404);
    }
    if (item.status !== 'pending') {
      throw new AppError(
        `Queue item #${id} is already '${item.status}'`,
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    const updated = await prisma.supervisionQueueItem.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy: 'human',
        reviewNote: note ?? 'Ditolak oleh supervisor',
      },
    });
    await this.logAudit(
      'ACTION_REJECTED',
      'human',
      `Aksi #${id} (${item.actionType}) ditolak oleh supervisor`,
    );
    return this.mapQueueRow(updated);
  }

  public async getQueue(limit = 25): Promise<SupervisionQueueItem[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.supervisionQueueItem.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((r) => this.mapQueueRow(r));
  }

  public async getAuditLogs(limit = 25): Promise<SupervisionAuditEntry[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.supervisionAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      actor: r.actor as SupervisionAuditEntry['actor'],
      permissionLevel: r.permissionLevel as SupervisionPermissionLevel,
      controlOwner: r.controlOwner as ControlOwner,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
