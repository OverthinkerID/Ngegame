import crypto from 'node:crypto';
import type {
  ObsSceneItem,
  StreamAssistantStatusResponse,
  StreamAssistantSuggestion,
  StreamHealthMetrics,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import type { ObsWebSocketClient } from './obsWebSocketClient.js';
import type { StreamNarrationService } from './streamNarrationService.js';

export class StreamAssistantService {
  private readonly obsClient: ObsWebSocketClient;
  private readonly narrationService: StreamNarrationService;

  private active = true;
  private lastSummary: string | null = null;
  private importantEvents: string[] = [];
  private suggestions: StreamAssistantSuggestion[] = [];
  private lastAnalyzedAt: string | null = null;

  constructor(obsClient: ObsWebSocketClient, narrationService: StreamNarrationService) {
    this.obsClient = obsClient;
    this.narrationService = narrationService;
  }

  public async analyzeCurrentState(
    health: StreamHealthMetrics,
    scenes: ObsSceneItem[],
    currentScene: string | null,
  ): Promise<StreamAssistantStatusResponse> {
    const prisma = getPrismaClient();
    const [latestVision, recentChats] = await Promise.all([
      prisma.visionCapture.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.streamChatLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);

    const events: string[] = [];
    const newSuggestions: StreamAssistantSuggestion[] = [];

    if (latestVision) {
      this.lastSummary = `Game aktif: ${latestVision.windowTitle} (${latestVision.sceneLabel}, gerak=${latestVision.motionScore.toFixed(2)}).`;
      if (latestVision.motionScore > 0.3) {
        events.push(`Aktivitas tinggi terdeteksi di ${latestVision.windowTitle}`);
      }
      if (latestVision.sceneLabel === 'pause_menu' || latestVision.sceneLabel === 'dark_menu_or_loading') {
        const brbScene = scenes.find((s) => /pause|brb|menu|intermission/i.test(s.sceneName));
        if (brbScene && brbScene.sceneName !== currentScene) {
          newSuggestions.push(
            await this.createSuggestion({
              suggestionType: 'scene_switch',
              title: `Pindah Adegan ke "${brbScene.sceneName}"`,
              message: `Visi mendeteksi ${latestVision.sceneLabel}; disarankan berpindah ke adegan ${brbScene.sceneName}.`,
              suggestedScene: brbScene.sceneName,
              confidence: 0.82,
              requiresApproval: true,
            }),
          );
        }
      } else if (latestVision.sceneLabel === 'active_gameplay') {
        const gameScene = scenes.find((s) => /game|play|main|stardew/i.test(s.sceneName));
        if (gameScene && gameScene.sceneName !== currentScene) {
          newSuggestions.push(
            await this.createSuggestion({
              suggestionType: 'scene_switch',
              title: `Kembali ke Adegan "${gameScene.sceneName}"`,
              message: `Gameplay aktif terdeteksi di ${latestVision.windowTitle}.`,
              suggestedScene: gameScene.sceneName,
              confidence: 0.86,
              requiresApproval: true,
            }),
          );
        }
      }
    } else {
      this.lastSummary = 'Menunggu frame visi terverifikasi dari Monitor Visi.';
    }

    if (health.streaming && health.droppedPercent > 2.5) {
      events.push(`Peringatan bitrate/frame terlewat tinggi (${health.droppedPercent}%)`);
      newSuggestions.push(
        await this.createSuggestion({
          suggestionType: 'warning',
          title: 'Frame Terlewat Meningkat',
          message: `Dropped frames mencapai ${health.droppedPercent}%. Pertimbangkan turunkan bitrate atau cek koneksi.`,
          confidence: 0.9,
          requiresApproval: false,
        }),
      );
    }

    if (recentChats.length > 0) {
      const cmd = recentChats.find((c) => c.isCommand);
      if (cmd) {
        events.push(`Perintah chat dari ${cmd.author}: ${cmd.message}`);
      }
    }

    this.importantEvents = events.slice(0, 8);
    this.suggestions = [...newSuggestions, ...this.suggestions].slice(0, 15);
    this.lastAnalyzedAt = new Date().toISOString();
    return this.getStatus();
  }

  private async createSuggestion(input: {
    suggestionType: StreamAssistantSuggestion['suggestionType'];
    title: string;
    message: string;
    suggestedScene?: string;
    confidence: number;
    requiresApproval: boolean;
  }): Promise<StreamAssistantSuggestion> {
    const prisma = getPrismaClient();
    const row = await prisma.streamAssistantLog.create({
      data: {
        suggestionType: input.suggestionType,
        title: input.title,
        message: input.message,
        suggestedScene: input.suggestedScene ?? null,
        confidence: input.confidence,
        status: 'pending',
      },
    });
    return {
      id: String(row.id),
      suggestionType: input.suggestionType,
      title: input.title,
      message: input.message,
      suggestedScene: input.suggestedScene ?? null,
      confidence: input.confidence,
      requiresApproval: input.requiresApproval,
      status: 'pending',
      createdAt: row.createdAt.toISOString(),
    };
  }

  public async handleUserCommand(
    commandText: string,
    health: StreamHealthMetrics,
  ): Promise<{ reply: string; status: StreamAssistantStatusResponse }> {
    const cmd = commandText.trim().toLowerCase();
    const prisma = getPrismaClient();
    const latestVision = await prisma.visionCapture.findFirst({ orderBy: { createdAt: 'desc' } });

    let reply = '';
    if (cmd.includes('status')) {
      reply = health.streaming
        ? `Siaran sedang berjalan (${health.bitrateKbps} kbps, ${health.fps} FPS, dropped ${health.droppedFrames}).`
        : 'Siaran saat ini dalam mode siaga (belum mengudara).';
    } else if (cmd.includes('game')) {
      reply = latestVision
        ? `Game terpantau: ${latestVision.windowTitle} (adegan: ${latestVision.sceneLabel}).`
        : 'Belum ada tangkapan game terverifikasi.';
    } else if (cmd.includes('ringkas') || cmd.includes('summary')) {
      reply = this.lastSummary ?? 'Belum ada ringkasan gameplay terbaru.';
    } else {
      reply = `Perintah "${commandText.trim()}" diterima. Gunakan !status, !game, atau !ringkas.`;
    }

    await this.narrationService.enqueueNarration({
      text: reply,
      emotion: 'calm',
      source: 'chat-command',
      verifiedGameState: latestVision?.windowTitle,
    });

    return { reply, status: this.getStatus() };
  }

  public async approveSuggestion(id: string): Promise<StreamAssistantStatusResponse> {
    const found = this.suggestions.find((s) => s.id === id);
    if (found) {
      if (found.suggestionType === 'scene_switch' && found.suggestedScene && this.obsClient.isConnected()) {
        await this.obsClient.request('SetCurrentProgramScene', {
          sceneName: found.suggestedScene,
        });
        found.status = 'executed';
      } else {
        found.status = 'approved';
      }
      const prisma = getPrismaClient();
      const numId = Number(id);
      if (Number.isFinite(numId)) {
        await prisma.streamAssistantLog.update({
          where: { id: numId },
          data: { status: found.status },
        });
      }
      await recordSystemLog('info', 'stream-assistant', `Saran #${id} disetujui (${found.status})`);
    }
    return this.getStatus();
  }

  public async rejectSuggestion(id: string): Promise<StreamAssistantStatusResponse> {
    const found = this.suggestions.find((s) => s.id === id);
    if (found) {
      found.status = 'rejected';
      const prisma = getPrismaClient();
      const numId = Number(id);
      if (Number.isFinite(numId)) {
        await prisma.streamAssistantLog.update({
          where: { id: numId },
          data: { status: 'rejected' },
        });
      }
    }
    return this.getStatus();
  }

  public getStatus(): StreamAssistantStatusResponse {
    return {
      active: this.active,
      lastSummary: this.lastSummary,
      importantEvents: this.importantEvents,
      suggestions: this.suggestions,
      lastAnalyzedAt: this.lastAnalyzedAt,
    };
  }
}
