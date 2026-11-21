import type {
  ChatAutomationMode,
  ChatIntelligenceConfig,
  ChatIntelligenceStatusResponse,
  ChatInteractionItem,
  ChatMessageCategory,
  ChatModerationAction,
  ChatModerationLogItem,
} from '@ngegame/shared';
import { AppError, ErrorCode } from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import type { StreamWsBroadcaster } from './gameplayEventIntelligenceService.js';

export class ChatIntelligenceService {
  private readonly broadcast: StreamWsBroadcaster;

  private config: ChatIntelligenceConfig = {
    mode: 'approval_required',
    allowAutoReply: false,
    allowAutoModeration: false,
    blockedWords: ['scam', 'phishing', 'judi'],
    faqs: [
      {
        keyword: 'game apa',
        answer: 'Saat ini sedang memainkan game yang terpantau oleh Overthinker-Ngegame.',
      },
      {
        keyword: 'ai apa',
        answer: 'Menggunakan Overthinker-Ngegame AI Vision + Brain + VoxCPM 2.0 Bahasa Indonesia.',
      },
    ],
  };

  private recentMessagesByAuthor = new Map<string, string>();

  constructor(broadcast: StreamWsBroadcaster = () => undefined) {
    this.broadcast = broadcast;
  }

  public getConfig(): ChatIntelligenceConfig {
    return {
      ...this.config,
      blockedWords: [...this.config.blockedWords],
      faqs: this.config.faqs.map((f) => ({ ...f })),
    };
  }

  public updateConfig(partial: Partial<ChatIntelligenceConfig>): ChatIntelligenceConfig {
    this.config = {
      ...this.config,
      ...partial,
      blockedWords: Array.isArray(partial.blockedWords)
        ? partial.blockedWords.map((w) => w.trim().toLowerCase()).filter(Boolean)
        : this.config.blockedWords,
      faqs: Array.isArray(partial.faqs)
        ? partial.faqs.filter((f) => f.keyword?.trim() && f.answer?.trim())
        : this.config.faqs,
    };
    return this.getConfig();
  }

  private detectSpam(author: string, message: string): boolean {
    const trimmed = message.trim();
    if (/(.)\1{6,}/i.test(trimmed)) return true;
    if (/https?:\/\/\S+/i.test(trimmed)) return true;
    if (trimmed.length >= 16 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
      return true;
    }
    const last = this.recentMessagesByAuthor.get(author.toLowerCase());
    this.recentMessagesByAuthor.set(author.toLowerCase(), trimmed.toLowerCase());
    return last !== undefined && last === trimmed.toLowerCase();
  }

  private detectQuestion(message: string): boolean {
    if (message.includes('?')) return true;
    return /\b(apa|kenapa|gimana|bagaimana|berapa|kapan|siapa|dimana|mana|what|how|why|when|where)\b/i.test(
      message,
    );
  }

  private classifyMessage(
    author: string,
    message: string,
  ): {
    category: ChatMessageCategory;
    isSpam: boolean;
    isQuestion: boolean;
    moderationSuggestion: ChatModerationAction;
    moderationReason: string | null;
  } {
    const lower = message.toLowerCase();
    const blocked = this.config.blockedWords.find((w) => lower.includes(w));
    if (blocked) {
      return {
        category: 'toxic',
        isSpam: false,
        isQuestion: false,
        moderationSuggestion: 'timeout',
        moderationReason: `Mengandung kata terlarang: "${blocked}"`,
      };
    }

    const isSpam = this.detectSpam(author, message);
    if (isSpam) {
      return {
        category: 'spam',
        isSpam: true,
        isQuestion: false,
        moderationSuggestion: 'delete',
        moderationReason: 'Terdeteksi pola spam (tautan/flood/kapital berlebih)',
      };
    }

    if (message.trim().startsWith('!')) {
      return {
        category: 'command',
        isSpam: false,
        isQuestion: false,
        moderationSuggestion: 'none',
        moderationReason: null,
      };
    }

    const isQuestion = this.detectQuestion(message);
    if (isQuestion) {
      return {
        category: 'question',
        isSpam: false,
        isQuestion: true,
        moderationSuggestion: 'none',
        moderationReason: null,
      };
    }

    if (/\b(keren|mantap|bagus|lucu|gg|nice|hebat)\b/i.test(lower)) {
      return {
        category: 'praise',
        isSpam: false,
        isQuestion: false,
        moderationSuggestion: 'none',
        moderationReason: null,
      };
    }

    return {
      category: 'general',
      isSpam: false,
      isQuestion: false,
      moderationSuggestion: 'none',
      moderationReason: null,
    };
  }

  private async buildContextReply(
    author: string,
    message: string,
    category: ChatMessageCategory,
  ): Promise<string | null> {
    if (category === 'spam' || category === 'toxic') {
      return null;
    }

    const lower = message.toLowerCase();
    const faq = this.config.faqs.find((f) => lower.includes(f.keyword.toLowerCase()));
    if (faq) {
      return `@${author} ${faq.answer}`;
    }

    const prisma = getPrismaClient();
    const latestEvent = await prisma.streamEvent.findFirst({ orderBy: { createdAt: 'desc' } });

    if (category === 'question') {
      if (latestEvent) {
        return `@${author} Saat ini di ${latestEvent.windowTitle}, aktivitas terbaru yang terpantau adalah ${latestEvent.title}.`;
      }
      return `@${author} Terima kasih sudah bertanya! AI sedang memantau layar game saat ini.`;
    }

    if (category === 'praise') {
      return `Terima kasih banyak @${author}!`;
    }

    return null;
  }

  public async ingestMessage(input: {
    platform: 'youtube' | 'twitch';
    author: string;
    message: string;
  }): Promise<ChatInteractionItem> {
    if (!input.author?.trim() || !input.message?.trim()) {
      throw new AppError('author dan message wajib diisi', ErrorCode.VALIDATION_ERROR, 400);
    }

    const classification = this.classifyMessage(input.author, input.message);
    const shouldGenerateReply = this.config.mode !== 'observe_only';
    const proposedReply = shouldGenerateReply
      ? await this.buildContextReply(input.author, input.message, classification.category)
      : null;

    let replyStatus: ChatInteractionItem['replyStatus'] = 'none';
    let finalReply: string | null = null;
    if (proposedReply) {
      if (this.config.mode === 'automatic_reply' && this.config.allowAutoReply) {
        replyStatus = 'sent';
        finalReply = proposedReply;
      } else {
        replyStatus = 'proposed';
      }
    }

    const prisma = getPrismaClient();
    const row = await prisma.chatInteraction.create({
      data: {
        platform: input.platform,
        author: input.author.trim(),
        message: input.message.trim(),
        category: classification.category,
        isSpam: classification.isSpam,
        isQuestion: classification.isQuestion,
        proposedReply,
        finalReply,
        replyStatus,
        moderationSuggestion: classification.moderationSuggestion,
      },
    });

    if (classification.moderationSuggestion !== 'none' && classification.moderationReason) {
      await prisma.chatModerationLog.create({
        data: {
          interactionId: row.id,
          platform: input.platform,
          author: input.author.trim(),
          action: classification.moderationSuggestion,
          reason: classification.moderationReason,
          status: this.config.allowAutoModeration ? 'executed' : 'suggested',
        },
      });
    }

    const item: ChatInteractionItem = {
      id: row.id,
      platform: row.platform as 'youtube' | 'twitch',
      author: row.author,
      message: row.message,
      category: row.category as ChatMessageCategory,
      isSpam: row.isSpam,
      isQuestion: row.isQuestion,
      proposedReply: row.proposedReply,
      finalReply: row.finalReply,
      replyStatus: row.replyStatus as ChatInteractionItem['replyStatus'],
      moderationSuggestion: row.moderationSuggestion as ChatModerationAction,
      createdAt: row.createdAt.toISOString(),
    };

    this.broadcast('stream:chat-received', item);
    if (item.replyStatus === 'proposed') {
      this.broadcast('stream:chat-reply-proposed', item);
    }

    return item;
  }

  public async approveReply(id: number, editedReply?: string): Promise<ChatInteractionItem> {
    const prisma = getPrismaClient();
    const existing = await prisma.chatInteraction.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Interaksi chat tidak ditemukan', ErrorCode.NOT_FOUND, 404);
    }
    const finalText = editedReply?.trim() || existing.proposedReply || '';
    if (!finalText) {
      throw new AppError('Tidak ada balasan untuk disetujui', ErrorCode.VALIDATION_ERROR, 400);
    }

    const updated = await prisma.chatInteraction.update({
      where: { id },
      data: { finalReply: finalText, replyStatus: 'approved' },
    });
    await recordSystemLog('info', 'stream-intelligence', `Balasan chat #${id} disetujui`);
    return {
      id: updated.id,
      platform: updated.platform as 'youtube' | 'twitch',
      author: updated.author,
      message: updated.message,
      category: updated.category as ChatMessageCategory,
      isSpam: updated.isSpam,
      isQuestion: updated.isQuestion,
      proposedReply: updated.proposedReply,
      finalReply: updated.finalReply,
      replyStatus: updated.replyStatus as ChatInteractionItem['replyStatus'],
      moderationSuggestion: updated.moderationSuggestion as ChatModerationAction,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  public async rejectReply(id: number): Promise<ChatInteractionItem> {
    const prisma = getPrismaClient();
    const updated = await prisma.chatInteraction.update({
      where: { id },
      data: { replyStatus: 'rejected' },
    });
    return {
      id: updated.id,
      platform: updated.platform as 'youtube' | 'twitch',
      author: updated.author,
      message: updated.message,
      category: updated.category as ChatMessageCategory,
      isSpam: updated.isSpam,
      isQuestion: updated.isQuestion,
      proposedReply: updated.proposedReply,
      finalReply: updated.finalReply,
      replyStatus: updated.replyStatus as ChatInteractionItem['replyStatus'],
      moderationSuggestion: updated.moderationSuggestion as ChatModerationAction,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  public async approveModeration(logId: number): Promise<ChatModerationLogItem> {
    const prisma = getPrismaClient();
    const updated = await prisma.chatModerationLog.update({
      where: { id: logId },
      data: { status: 'approved' },
    });
    return {
      id: updated.id,
      interactionId: updated.interactionId,
      platform: updated.platform as 'youtube' | 'twitch',
      author: updated.author,
      action: updated.action as ChatModerationAction,
      reason: updated.reason,
      status: updated.status as ChatModerationLogItem['status'],
      createdAt: updated.createdAt.toISOString(),
    };
  }

  public async getStatus(limit = 25): Promise<ChatIntelligenceStatusResponse> {
    const prisma = getPrismaClient();
    const [interactions, moderationLogs] = await Promise.all([
      prisma.chatInteraction.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      prisma.chatModerationLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
    ]);

    return {
      config: this.getConfig(),
      interactions: interactions.map((row) => ({
        id: row.id,
        platform: row.platform as 'youtube' | 'twitch',
        author: row.author,
        message: row.message,
        category: row.category as ChatMessageCategory,
        isSpam: row.isSpam,
        isQuestion: row.isQuestion,
        proposedReply: row.proposedReply,
        finalReply: row.finalReply,
        replyStatus: row.replyStatus as ChatInteractionItem['replyStatus'],
        moderationSuggestion: row.moderationSuggestion as ChatModerationAction,
        createdAt: row.createdAt.toISOString(),
      })),
      moderationLogs: moderationLogs.map((row) => ({
        id: row.id,
        interactionId: row.interactionId,
        platform: row.platform as 'youtube' | 'twitch',
        author: row.author,
        action: row.action as ChatModerationAction,
        reason: row.reason,
        status: row.status as ChatModerationLogItem['status'],
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
