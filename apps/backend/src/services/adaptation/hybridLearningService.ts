import type { AdaptationProposalRecord, GameMemoryRecord, GameProfile } from '@ngegame/shared';
import { AppError, ErrorCode } from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import type { GameProfileManager } from './gameProfileManager.js';

export interface LearningInsightsSummary {
  gameId: string;
  totalMemories: number;
  successfulCount: number;
  failedCount: number;
  feedbackCount: number;
  avoidPatterns: string[];
  preferredPatterns: string[];
  recentFeedback: string[];
}

export class HybridLearningService {
  constructor(private readonly profileManager: GameProfileManager) {}

  public async recordExperience(
    gameId: string,
    outcome: 'success' | 'failure' | 'feedback',
    key: string,
    details: Record<string, unknown>,
    confidence = 0.75,
  ): Promise<GameMemoryRecord> {
    const prisma = getPrismaClient();
    const memoryType = outcome === 'failure' ? 'failed_action' : 'long_term';
    const created = await prisma.gameMemoryEntry.create({
      data: {
        gameId,
        memoryType,
        key,
        valueJson: JSON.stringify({ outcome, ...details }),
        confidence,
      },
    });
    return {
      id: created.id,
      gameId: created.gameId,
      memoryType: created.memoryType as GameMemoryRecord['memoryType'],
      key: created.key,
      value: { outcome, ...details },
      confidence: created.confidence,
      createdAt: created.createdAt.toISOString(),
    };
  }

  public async submitUserFeedback(
    gameId: string,
    feedbackText: string,
    correctionType: 'positive' | 'correction' = 'correction',
    relatedAction = 'general',
  ): Promise<GameMemoryRecord> {
    if (!feedbackText.trim()) {
      throw new AppError('Teks umpan balik tidak boleh kosong.', ErrorCode.VALIDATION_ERROR, 400);
    }
    const record = await this.recordExperience(
      gameId,
      'feedback',
      `user_feedback:${relatedAction}`,
      {
        correctionType,
        feedback: feedbackText.trim(),
        relatedAction,
      },
      correctionType === 'positive' ? 0.9 : 0.85,
    );
    await recordSystemLog('info', 'learning', `Umpan balik pengguna dicatat untuk '${gameId}'`);
    return record;
  }

  public async getContextualInsights(gameId: string): Promise<LearningInsightsSummary> {
    const prisma = getPrismaClient();
    const rows = await prisma.gameMemoryEntry.findMany({
      where: { gameId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const avoidSet = new Set<string>();
    const preferredSet = new Set<string>();
    const recentFeedback: string[] = [];
    let successfulCount = 0;
    let failedCount = 0;
    let feedbackCount = 0;

    for (const row of rows) {
      const parsed = JSON.parse(row.valueJson) as Record<string, unknown>;
      if (row.memoryType === 'failed_action' || parsed.outcome === 'failure') {
        failedCount += 1;
        avoidSet.add(row.key);
      } else if (parsed.outcome === 'feedback' || row.key.startsWith('user_feedback:')) {
        feedbackCount += 1;
        if (typeof parsed.feedback === 'string') {
          recentFeedback.push(parsed.feedback);
        }
      } else {
        successfulCount += 1;
        preferredSet.add(row.key);
      }
    }

    return {
      gameId,
      totalMemories: rows.length,
      successfulCount,
      failedCount,
      feedbackCount,
      avoidPatterns: Array.from(avoidSet).slice(0, 8),
      preferredPatterns: Array.from(preferredSet).slice(0, 8),
      recentFeedback: recentFeedback.slice(0, 5),
    };
  }

  private mapProposal(row: {
    id: number;
    gameId: string;
    title: string;
    rationale: string;
    proposedChanges: string;
    confidence: number;
    status: string;
    reviewedBy: string | null;
    reviewNote: string | null;
    createdAt: Date;
    reviewedAt: Date | null;
  }): AdaptationProposalRecord {
    return {
      id: row.id,
      gameId: row.gameId,
      title: row.title,
      rationale: row.rationale,
      proposedChanges: JSON.parse(row.proposedChanges) as Record<string, unknown>,
      confidence: row.confidence,
      status: row.status as AdaptationProposalRecord['status'],
      reviewedBy: row.reviewedBy,
      reviewNote: row.reviewNote,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    };
  }

  public async listProposals(gameId: string): Promise<AdaptationProposalRecord[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.adaptationProposal.findMany({
      where: { gameId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((r) => this.mapProposal(r));
  }

  public async generateProposalFromExperience(gameId: string): Promise<AdaptationProposalRecord> {
    const profile = await this.profileManager.getProfile(gameId);
    const insights = await this.getContextualInsights(gameId);

    // Aturan: jangan menganggap 1 keberhasilan/kegagalan tunggal sebagai bukti mutlak
    if (insights.totalMemories < 2) {
      throw new AppError(
        'Minimal 2 pengalaman atau umpan balik diperlukan sebelum AI mengusulkan perubahan profil.',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    let title = 'Penyesuaian Ambang Kepercayaan & Interval Observasi';
    let rationale = `Berdasarkan ${insights.totalMemories} pengalaman (${insights.successfulCount} sukses, ${insights.failedCount} gagal).`;
    let proposedChanges: Record<string, unknown> = {};

    if (insights.failedCount > insights.successfulCount) {
      const nextConfidence = Math.min(0.95, Number((profile.safetyConfiguration.minConfidence + 0.04).toFixed(2)));
      const nextInterval = Math.min(2000, profile.visionProfile.targetIntervalMs + 150);
      title = 'Perketat Ambang Kepercayaan untuk Mengurangi Aksi Gagal';
      rationale = `Terdeteksi ${insights.failedCount} kegagalan vs ${insights.successfulCount} sukses. Mengusulkan kenaikan minConfidence ke ${nextConfidence} dan interval visi ke ${nextInterval}ms.`;
      proposedChanges = {
        minConfidence: nextConfidence,
        targetIntervalMs: nextInterval,
      };
    } else {
      const ruleNote =
        insights.recentFeedback[0] ??
        `Prioritaskan pola terverifikasi: ${insights.preferredPatterns[0] ?? 'observasi aman'}`;
      title = 'Tambahkan Aturan Strategi dari Pengalaman Terverifikasi';
      rationale = `${insights.successfulCount} tindakan terverifikasi berhasil. Mengusulkan penambahan aturan strategi AI.`;
      proposedChanges = {
        appendRule: ruleNote,
      };
    }

    const prisma = getPrismaClient();
    const created = await prisma.adaptationProposal.create({
      data: {
        gameId,
        title,
        rationale,
        proposedChanges: JSON.stringify(proposedChanges),
        confidence: insights.failedCount > insights.successfulCount ? 0.84 : 0.88,
        status: 'pending',
      },
    });

    await recordSystemLog('info', 'learning', `Proposal adaptasi #${created.id} dibuat untuk '${gameId}'`);
    return this.mapProposal(created);
  }

  public async approveProposal(
    proposalId: number,
    note?: string,
  ): Promise<{ proposal: AdaptationProposalRecord; updatedProfile: GameProfile }> {
    const prisma = getPrismaClient();
    const row = await prisma.adaptationProposal.findUnique({ where: { id: proposalId } });
    if (!row) {
      throw new AppError(`Proposal #${proposalId} tidak ditemukan.`, ErrorCode.NOT_FOUND, 404);
    }
    if (row.status !== 'pending') {
      throw new AppError(`Proposal #${proposalId} sudah berstatus '${row.status}'.`, ErrorCode.VALIDATION_ERROR, 400);
    }

    const profile = await this.profileManager.getProfile(row.gameId);
    const changes = JSON.parse(row.proposedChanges) as {
      minConfidence?: number;
      targetIntervalMs?: number;
      appendRule?: string;
    };

    const nextProfile: GameProfile = {
      ...profile,
      safetyConfiguration: {
        ...profile.safetyConfiguration,
        ...(typeof changes.minConfidence === 'number'
          ? { minConfidence: Math.min(0.98, Math.max(0.5, changes.minConfidence)) }
          : {}),
      },
      visionProfile: {
        ...profile.visionProfile,
        ...(typeof changes.targetIntervalMs === 'number'
          ? { targetIntervalMs: Math.max(350, changes.targetIntervalMs) }
          : {}),
      },
      aiStrategy: {
        ...profile.aiStrategy,
        rules: changes.appendRule
          ? Array.from(new Set([...profile.aiStrategy.rules, changes.appendRule]))
          : profile.aiStrategy.rules,
      },
    };

    const updatedProfile = await this.profileManager.saveProfile(
      nextProfile,
      `Proposal adaptasi #${proposalId} disetujui manusia: ${row.title}`,
      'ai',
    );

    const updatedProposal = await prisma.adaptationProposal.update({
      where: { id: proposalId },
      data: {
        status: 'approved',
        reviewedBy: 'human',
        reviewNote: note ?? 'Disetujui oleh pengguna',
        reviewedAt: new Date(),
      },
    });

    return {
      proposal: this.mapProposal(updatedProposal),
      updatedProfile,
    };
  }

  public async rejectProposal(proposalId: number, note?: string): Promise<AdaptationProposalRecord> {
    const prisma = getPrismaClient();
    const row = await prisma.adaptationProposal.findUnique({ where: { id: proposalId } });
    if (!row) {
      throw new AppError(`Proposal #${proposalId} tidak ditemukan.`, ErrorCode.NOT_FOUND, 404);
    }
    if (row.status !== 'pending') {
      throw new AppError(`Proposal #${proposalId} sudah berstatus '${row.status}'.`, ErrorCode.VALIDATION_ERROR, 400);
    }

    const updated = await prisma.adaptationProposal.update({
      where: { id: proposalId },
      data: {
        status: 'rejected',
        reviewedBy: 'human',
        reviewNote: note ?? 'Ditolak oleh pengguna',
        reviewedAt: new Date(),
      },
    });
    return this.mapProposal(updated);
  }

  public async resetLearning(gameId: string): Promise<{ deletedMemories: number; clearedProposals: number }> {
    const prisma = getPrismaClient();
    const mem = await prisma.gameMemoryEntry.deleteMany({ where: { gameId } });
    const prop = await prisma.adaptationProposal.deleteMany({ where: { gameId, status: 'pending' } });
    await recordSystemLog('info', 'learning', `Reset pembelajaran untuk '${gameId}'`);
    return {
      deletedMemories: mem.count,
      clearedProposals: prop.count,
    };
  }
}
