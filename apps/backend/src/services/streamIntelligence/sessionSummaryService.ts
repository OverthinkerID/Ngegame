import type {
  StreamSessionSummaryItem,
  StreamSessionSummaryResponse,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';

export class StreamSessionSummaryService {
  private toItem(row: {
    id: number;
    sessionId: number | null;
    gameId: string;
    totalDurationSeconds: number;
    importantEventsCount: number;
    totalChatMessages: number;
    questionsCount: number;
    repliesApprovedCount: number;
    moderationActionsCount: number;
    commentaryCount: number;
    highlightCandidatesCount: number;
    approvedHighlightsCount: number;
    avgBitrateKbps: number;
    avgFps: number;
    droppedFrames: number;
    summaryText: string;
    reportMarkdown: string;
    createdAt: Date;
  }): StreamSessionSummaryItem {
    return {
      id: row.id,
      sessionId: row.sessionId,
      gameId: row.gameId,
      totalDurationSeconds: row.totalDurationSeconds,
      importantEventsCount: row.importantEventsCount,
      totalChatMessages: row.totalChatMessages,
      questionsCount: row.questionsCount,
      repliesApprovedCount: row.repliesApprovedCount,
      moderationActionsCount: row.moderationActionsCount,
      commentaryCount: row.commentaryCount,
      highlightCandidatesCount: row.highlightCandidatesCount,
      approvedHighlightsCount: row.approvedHighlightsCount,
      avgBitrateKbps: row.avgBitrateKbps,
      avgFps: row.avgFps,
      droppedFrames: row.droppedFrames,
      summaryText: row.summaryText,
      reportMarkdown: row.reportMarkdown,
      createdAt: row.createdAt.toISOString(),
    };
  }

  public async generateSummary(input?: {
    sessionId?: number;
    gameId?: string;
    durationSeconds?: number;
  }): Promise<StreamSessionSummaryItem> {
    const prisma = getPrismaClient();

    const [
      latestSession,
      events,
      commentaries,
      chats,
      moderations,
      highlights,
      samples,
    ] = await Promise.all([
      input?.sessionId
        ? prisma.streamSessionLog.findUnique({ where: { id: input.sessionId } })
        : prisma.streamSessionLog.findFirst({ orderBy: { startedAt: 'desc' } }),
      prisma.streamEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.commentaryHistory.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.chatInteraction.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.chatModerationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.highlightCandidate.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.streamAnalyticsSample.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
    ]);

    const gameId = input?.gameId ?? events[0]?.gameId ?? 'stardew-valley';
    const totalDurationSeconds =
      input?.durationSeconds ?? latestSession?.durationSeconds ?? 0;

    const importantEvents = events.filter((e) =>
      ['medium', 'high', 'critical'].includes(e.severity),
    );
    const questionsCount = chats.filter((c) => c.isQuestion).length;
    const repliesApprovedCount = chats.filter((c) =>
      ['approved', 'sent'].includes(c.replyStatus),
    ).length;
    const approvedHighlightsCount = highlights.filter(
      (h) => h.status === 'approved' || h.status === 'exported',
    ).length;

    const avgBitrateKbps =
      samples.length > 0
        ? Math.round(samples.reduce((acc, s) => acc + s.bitrateKbps, 0) / samples.length)
        : latestSession?.avgBitrate ?? 0;
    const avgFps =
      samples.length > 0
        ? Number((samples.reduce((acc, s) => acc + s.fps, 0) / samples.length).toFixed(1))
        : latestSession?.avgFps ?? 0;
    const droppedFrames =
      latestSession?.droppedFrames ??
      (samples.length > 0 ? samples[0]!.droppedFrames : 0);

    const summaryText = `Sesi ${gameId} berdurasi ${totalDurationSeconds}d mencatat ${importantEvents.length} event penting, ${commentaries.length} komentar AI, ${chats.length} pesan chat (${questionsCount} pertanyaan), dan ${highlights.length} kandidat highlight (${approvedHighlightsCount} disetujui).`;

    const reportMarkdown = [
      `# Laporan Sesi Streaming — ${gameId}`,
      `- **Durasi Total**: ${totalDurationSeconds} detik`,
      `- **Event Gameplay Penting**: ${importantEvents.length} (total terdeteksi: ${events.length})`,
      `- **Komentar AI**: ${commentaries.length}`,
      `- **Interaksi Penonton**: ${chats.length} pesan (${questionsCount} pertanyaan, ${repliesApprovedCount} balasan disetujui/terkirim, ${moderations.length} catatan moderasi)`,
      `- **Kandidat Highlight**: ${highlights.length} (${approvedHighlightsCount} disetujui)`,
      `- **Performa Siaran**: ${avgBitrateKbps} kbps • ${avgFps} FPS • ${droppedFrames} dropped frames`,
    ].join('\n');

    const row = await prisma.streamSessionSummary.create({
      data: {
        sessionId: latestSession?.id ?? input?.sessionId ?? null,
        gameId,
        totalDurationSeconds,
        importantEventsCount: importantEvents.length,
        totalChatMessages: chats.length,
        questionsCount,
        repliesApprovedCount,
        moderationActionsCount: moderations.length,
        commentaryCount: commentaries.length,
        highlightCandidatesCount: highlights.length,
        approvedHighlightsCount,
        avgBitrateKbps,
        avgFps,
        droppedFrames,
        summaryText,
        reportMarkdown,
      },
    });

    await recordSystemLog('info', 'stream-intelligence', `Ringkasan sesi #${row.id} dibuat (${gameId})`);
    return this.toItem(row);
  }

  public async getStatus(limit = 10): Promise<StreamSessionSummaryResponse> {
    const prisma = getPrismaClient();
    const rows = await prisma.streamSessionSummary.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const history = rows.map((r) => this.toItem(r));
    return {
      latest: history[0] ?? null,
      history,
    };
  }
}
