import type {
  CommentaryConfig,
  CommentaryItem,
  CommentaryLanguage,
  CommentaryPersonality,
  CommentaryStatusResponse,
  GameplayEventSeverity,
  VerifiedGameplayEvent,
} from '@ngegame/shared';
import { AppError, ErrorCode } from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import type { StreamWsBroadcaster } from './gameplayEventIntelligenceService.js';

const SEVERITY_PRIORITY: Record<GameplayEventSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export class LiveCommentaryService {
  private readonly broadcast: StreamWsBroadcaster;

  private config: CommentaryConfig = {
    personality: 'casual',
    language: 'id',
    cooldownSeconds: 8,
    silenceThresholdSeconds: 45,
    maxQueueSize: 5,
    muted: false,
    autoGenerateOnEvent: true,
  };

  private lastCommentaryAtMs: number | null = null;
  private queue: CommentaryItem[] = [];

  constructor(broadcast: StreamWsBroadcaster = () => undefined) {
    this.broadcast = broadcast;
  }

  public getConfig(): CommentaryConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<CommentaryConfig>): CommentaryConfig {
    this.config = {
      ...this.config,
      ...partial,
      cooldownSeconds: Math.max(
        0,
        Math.min(120, partial.cooldownSeconds ?? this.config.cooldownSeconds),
      ),
      silenceThresholdSeconds: Math.max(
        10,
        Math.min(300, partial.silenceThresholdSeconds ?? this.config.silenceThresholdSeconds),
      ),
      maxQueueSize: Math.max(1, Math.min(20, partial.maxQueueSize ?? this.config.maxQueueSize)),
    };
    return this.getConfig();
  }

  private buildLineFromEvent(
    event: VerifiedGameplayEvent,
    personality: CommentaryPersonality,
    language: CommentaryLanguage,
  ): string {
    const contextHint = event.ocrExcerpt
      ? ` (${event.ocrExcerpt.slice(0, 48)})`
      : '';

    if (language === 'en') {
      switch (personality) {
        case 'funny':
          return `Whoa, ${event.title} in ${event.windowTitle}! Looks like things just got spicy${contextHint}.`;
        case 'professional':
          return `Verified gameplay update in ${event.windowTitle}: ${event.title}${contextHint}.`;
        case 'cinematic':
          return `In the quiet flow of ${event.windowTitle}, a decisive moment unfolds: ${event.title}${contextHint}.`;
        case 'casual':
        default:
          return `Nice! We just hit ${event.title} in ${event.windowTitle}${contextHint}.`;
      }
    }

    if (language === 'ja') {
      switch (personality) {
        case 'funny':
          return `おっと、${event.windowTitle}で「${event.title}」が発生！なかなかの展開ですね${contextHint}。`;
        case 'professional':
          return `${event.windowTitle}のプレイ状況を確認：${event.title}${contextHint}。`;
        case 'cinematic':
          return `静かな流れの中で、${event.windowTitle}に新たな局面が訪れました——${event.title}${contextHint}。`;
        case 'casual':
        default:
          return `いいですね！${event.windowTitle}で「${event.title}」を確認しました${contextHint}。`;
      }
    }

    // Bahasa Indonesia (default)
    switch (personality) {
      case 'funny':
        return `Waduh, ada ${event.title} di ${event.windowTitle}! Situasinya langsung rame nih${contextHint}.`;
      case 'professional':
        return `Pembaruan terverifikasi di ${event.windowTitle}: ${event.title}${contextHint}.`;
      case 'cinematic':
        return `Di tengah perjalanan ${event.windowTitle}, momen penting pun terjadi: ${event.title}${contextHint}.`;
      case 'casual':
      default:
        return `Mantap, terpantau ${event.title} di ${event.windowTitle}${contextHint}.`;
    }
  }

  private toItem(row: {
    id: number;
    eventId: number | null;
    gameId: string;
    personality: string;
    language: string;
    text: string;
    editedText: string | null;
    priority: number;
    status: string;
    verifiedContext: string;
    createdAt: Date;
    updatedAt: Date;
  }): CommentaryItem {
    return {
      id: row.id,
      eventId: row.eventId,
      gameId: row.gameId,
      personality: row.personality as CommentaryPersonality,
      language: row.language as CommentaryLanguage,
      text: row.text,
      editedText: row.editedText,
      priority: row.priority,
      status: row.status as CommentaryItem['status'],
      verifiedContext: row.verifiedContext,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public async generateCommentary(input: {
    event?: VerifiedGameplayEvent;
    text?: string;
    gameId?: string;
    personality?: CommentaryPersonality;
    language?: CommentaryLanguage;
    priority?: number;
    bypassCooldown?: boolean;
    nowMs?: number;
  }): Promise<{ accepted: boolean; reason?: string; item?: CommentaryItem }> {
    if (this.config.muted) {
      return { accepted: false, reason: 'Komentar AI sedang di-mute.' };
    }

    const nowMs = input.nowMs ?? Date.now();
    const personality = input.personality ?? this.config.personality;
    const language = input.language ?? this.config.language;
    const priority =
      input.priority ??
      (input.event ? SEVERITY_PRIORITY[input.event.severity] : 2);

    const rawText = input.text?.trim()
      ? input.text.trim()
      : input.event
        ? this.buildLineFromEvent(input.event, personality, language)
        : '';

    if (!rawText) {
      return {
        accepted: false,
        reason: 'Tidak ada event terverifikasi atau teks komentar yang diberikan.',
      };
    }

    const gameId = input.event?.gameId ?? input.gameId ?? 'unknown-game';
    const verifiedContext = input.event
      ? `${input.event.windowTitle} | ${input.event.eventType} | ${input.event.sceneLabel}`
      : 'manual';

    // Cooldown check (critical events atau bypassCooldown dapat melewati cooldown)
    const isCritical = priority >= SEVERITY_PRIORITY.critical;
    if (
      !input.bypassCooldown &&
      !isCritical &&
      this.lastCommentaryAtMs !== null &&
      nowMs - this.lastCommentaryAtMs < this.config.cooldownSeconds * 1000
    ) {
      return {
        accepted: false,
        reason: `Cooldown komentar aktif (${this.config.cooldownSeconds} detik).`,
      };
    }

    // Duplicate prevention against recent 10 commentaries
    const prisma = getPrismaClient();
    const recentRows = await prisma.commentaryHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const normalizedCandidate = normalizeText(rawText);
    const isDuplicate = recentRows.some((r) => {
      const existing = normalizeText(r.editedText ?? r.text);
      return existing === normalizedCandidate;
    });
    if (isDuplicate) {
      return {
        accepted: false,
        reason: 'Komentar duplikat dicegah.',
      };
    }

    const saved = await prisma.commentaryHistory.create({
      data: {
        eventId: input.event?.id ?? null,
        gameId,
        personality,
        language,
        text: rawText,
        priority,
        status: 'queued',
        verifiedContext,
      },
    });

    const item = this.toItem(saved);
    this.queue.push(item);
    this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
    if (this.queue.length > this.config.maxQueueSize) {
      this.queue = this.queue.slice(0, this.config.maxQueueSize);
    }

    this.lastCommentaryAtMs = nowMs;
    this.broadcast('stream:commentary-generated', item);
    return { accepted: true, item };
  }

  public async editCommentary(id: number, editedText: string): Promise<CommentaryItem> {
    const clean = editedText.trim();
    if (!clean) {
      throw new AppError('editedText tidak boleh kosong', ErrorCode.VALIDATION_ERROR, 400);
    }
    const prisma = getPrismaClient();
    const updated = await prisma.commentaryHistory.update({
      where: { id },
      data: { editedText: clean, status: 'edited' },
    });
    const item = this.toItem(updated);
    this.queue = this.queue.map((q) => (q.id === id ? item : q));
    return item;
  }

  public async stopAndClear(mute = false): Promise<CommentaryStatusResponse> {
    this.queue = [];
    if (mute) {
      this.config.muted = true;
    }
    await recordSystemLog(
      'info',
      'stream-intelligence',
      `Antrean komentar dihentikan${mute ? ' dan di-mute' : ''}`,
    );
    return this.getStatus();
  }

  public async getStatus(nowMs = Date.now(), limit = 20): Promise<CommentaryStatusResponse> {
    const prisma = getPrismaClient();
    const rows = await prisma.commentaryHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(50, limit)),
    });
    const history = rows.map((r) => this.toItem(r));
    const latestMs =
      this.lastCommentaryAtMs ??
      (history[0] ? Date.parse(history[0].createdAt) : null);
    const secondsSinceLastCommentary =
      latestMs !== null ? Math.max(0, Math.round((nowMs - latestMs) / 1000)) : 0;
    const silenceDetected =
      latestMs !== null && secondsSinceLastCommentary >= this.config.silenceThresholdSeconds;

    return {
      config: this.getConfig(),
      silenceDetected,
      secondsSinceLastCommentary,
      lastCommentaryAt: latestMs !== null ? new Date(latestMs).toISOString() : null,
      queue: [...this.queue],
      history,
    };
  }
}
