import type {
  GameplayEventType,
  HighlightCandidateItem,
  StreamHighlightsStatusResponse,
  VerifiedGameplayEvent,
} from '@ngegame/shared';
import { AppError, ErrorCode } from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import type { ObsWebSocketClient } from '../streaming/obsWebSocketClient.js';
import type { StreamWsBroadcaster } from './gameplayEventIntelligenceService.js';

const EVENT_BASE_SCORE: Record<GameplayEventType, number> = {
  game_over: 95,
  rare_event: 92,
  achievement: 88,
  combat: 82,
  item_discovery: 75,
  harvesting: 68,
  npc_interaction: 60,
  farming: 48,
  scene_transition: 35,
  player_movement: 30,
  idle: 10,
};

export class HighlightIntelligenceService {
  private readonly broadcast: StreamWsBroadcaster;
  private readonly obsClient: ObsWebSocketClient | null;

  constructor(
    broadcast: StreamWsBroadcaster = () => undefined,
    obsClient: ObsWebSocketClient | null = null,
  ) {
    this.broadcast = broadcast;
    this.obsClient = obsClient;
  }

  private async getRecordingCapability(): Promise<{
    recordingActive: boolean;
    replayBufferAvailable: boolean;
    recordingSeconds: number;
    recordingSource: string | null;
  }> {
    if (!this.obsClient || !this.obsClient.isConnected()) {
      return {
        recordingActive: false,
        replayBufferAvailable: false,
        recordingSeconds: 0,
        recordingSource: null,
      };
    }

    let recordingActive = false;
    let recordingSeconds = 0;
    let replayBufferAvailable = false;

    try {
      const rec = await this.obsClient.request('GetRecordStatus');
      recordingActive = Boolean(rec.outputActive);
      recordingSeconds = Math.max(0, Math.round(Number(rec.outputDuration ?? 0) / 1000));
    } catch {
      // OBS tidak dalam mode rekaman
    }

    try {
      const rep = await this.obsClient.request('GetReplayBufferStatus');
      replayBufferAvailable = Boolean(rep.outputActive);
    } catch {
      replayBufferAvailable = false;
    }

    return {
      recordingActive,
      replayBufferAvailable,
      recordingSeconds,
      recordingSource: recordingActive
        ? 'obs-recording'
        : replayBufferAvailable
          ? 'obs-replay-buffer'
          : null,
    };
  }

  private toItem(row: {
    id: number;
    eventId: number | null;
    gameId: string;
    eventType: string;
    title: string;
    highlightScore: number;
    eventTimestamp: Date;
    startOffsetSeconds: number;
    endOffsetSeconds: number;
    clipSupported: boolean;
    recordingSource: string | null;
    status: string;
    createdAt: Date;
  }): HighlightCandidateItem {
    return {
      id: row.id,
      eventId: row.eventId,
      gameId: row.gameId,
      eventType: row.eventType as GameplayEventType,
      title: row.title,
      highlightScore: row.highlightScore,
      eventTimestamp: row.eventTimestamp.toISOString(),
      startOffsetSeconds: row.startOffsetSeconds,
      endOffsetSeconds: row.endOffsetSeconds,
      clipSupported: row.clipSupported,
      recordingSource: row.recordingSource,
      status: row.status as HighlightCandidateItem['status'],
      createdAt: row.createdAt.toISOString(),
    };
  }

  public async detectFromEvent(
    event: VerifiedGameplayEvent,
    minScore = 55,
  ): Promise<HighlightCandidateItem | null> {
    const base = EVENT_BASE_SCORE[event.eventType] ?? 40;
    const score = Math.min(100, Math.round(base * 0.85 + event.confidence * 15));
    if (score < minScore) {
      return null;
    }

    const cap = await this.getRecordingCapability();
    const clipSupported = cap.recordingActive || cap.replayBufferAvailable;
    const anchorSec = cap.recordingSeconds;
    const startOffsetSeconds = Math.max(0, anchorSec - 15);
    const endOffsetSeconds = anchorSec + 15;

    const prisma = getPrismaClient();
    const row = await prisma.highlightCandidate.create({
      data: {
        eventId: event.id,
        gameId: event.gameId,
        eventType: event.eventType,
        title: event.title,
        highlightScore: score,
        eventTimestamp: new Date(event.createdAt),
        startOffsetSeconds,
        endOffsetSeconds,
        clipSupported,
        recordingSource: cap.recordingSource,
        status: 'pending',
      },
    });

    const item = this.toItem(row);
    this.broadcast('stream:highlight-detected', item);
    return item;
  }

  public async approveHighlight(id: number): Promise<HighlightCandidateItem> {
    const prisma = getPrismaClient();
    const existing = await prisma.highlightCandidate.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Kandidat highlight tidak ditemukan', ErrorCode.NOT_FOUND, 404);
    }
    const updated = await prisma.highlightCandidate.update({
      where: { id },
      data: { status: 'approved' },
    });
    await recordSystemLog('info', 'stream-intelligence', `Highlight #${id} disetujui`);
    return this.toItem(updated);
  }

  public async rejectHighlight(id: number): Promise<HighlightCandidateItem> {
    const prisma = getPrismaClient();
    const updated = await prisma.highlightCandidate.update({
      where: { id },
      data: { status: 'rejected' },
    });
    return this.toItem(updated);
  }

  public async exportMetadata(format: 'json' | 'csv' = 'json'): Promise<string> {
    const prisma = getPrismaClient();
    const rows = await prisma.highlightCandidate.findMany({
      orderBy: { highlightScore: 'desc' },
      take: 100,
    });
    const items = rows.map((r) => this.toItem(r));

    if (format === 'csv') {
      const header =
        'id,gameId,eventType,title,highlightScore,startOffsetSeconds,endOffsetSeconds,clipSupported,recordingSource,status,eventTimestamp';
      const lines = items.map(
        (i) =>
          `${i.id},"${i.gameId}",${i.eventType},"${i.title.replace(/"/g, '""')}",${i.highlightScore},${i.startOffsetSeconds},${i.endOffsetSeconds},${i.clipSupported},"${i.recordingSource ?? ''}",${i.status},${i.eventTimestamp}`,
      );
      return [header, ...lines].join('\n');
    }

    return JSON.stringify({ exportedAt: new Date().toISOString(), highlights: items }, null, 2);
  }

  public async getStatus(limit = 25): Promise<StreamHighlightsStatusResponse> {
    const [cap, rows] = await Promise.all([
      this.getRecordingCapability(),
      getPrismaClient().highlightCandidate.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    return {
      recordingActive: cap.recordingActive,
      replayBufferAvailable: cap.replayBufferAvailable,
      candidates: rows.map((r) => this.toItem(r)),
    };
  }
}
