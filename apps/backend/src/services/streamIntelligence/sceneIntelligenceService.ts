import type {
  SceneAutomationRule,
  SceneIntelligenceConfig,
  SceneIntelligenceStatusResponse,
  SceneRecommendationItem,
  StreamPhase,
} from '@ngegame/shared';
import { AppError, ErrorCode } from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import type { ObsWebSocketClient } from '../streaming/obsWebSocketClient.js';
import type { StreamWsBroadcaster } from './gameplayEventIntelligenceService.js';

const DEFAULT_RULES: SceneAutomationRule[] = [
  {
    id: 'rule-active-gameplay',
    name: 'Gameplay Aktif → Scene Gameplay',
    triggerSceneLabel: 'active_gameplay',
    targetObsScene: 'Gameplay',
    recommendedOverlay: 'Gameplay HUD',
    cameraVisible: true,
    enabled: true,
  },
  {
    id: 'rule-pause-menu',
    name: 'Menu Jeda → Scene Pause / BRB',
    triggerSceneLabel: 'pause_menu',
    targetObsScene: 'Pause / BRB',
    recommendedOverlay: 'BRB Overlay',
    cameraVisible: false,
    enabled: true,
  },
  {
    id: 'rule-dialogue',
    name: 'Dialog NPC → Overlay Minimal',
    triggerSceneLabel: 'dialogue',
    targetObsScene: 'Gameplay',
    recommendedOverlay: 'Minimal Story Overlay',
    cameraVisible: true,
    enabled: true,
  },
];

export class SceneIntelligenceService {
  private readonly broadcast: StreamWsBroadcaster;
  private readonly obsClient: ObsWebSocketClient | null;

  private config: SceneIntelligenceConfig = {
    autoSwitchEnabled: false,
    rules: DEFAULT_RULES.map((r) => ({ ...r })),
  };

  private currentScene: string | null = null;
  private streamPhase: StreamPhase = 'idle';

  constructor(
    broadcast: StreamWsBroadcaster = () => undefined,
    obsClient: ObsWebSocketClient | null = null,
  ) {
    this.broadcast = broadcast;
    this.obsClient = obsClient;
  }

  public getConfig(): SceneIntelligenceConfig {
    return {
      autoSwitchEnabled: this.config.autoSwitchEnabled,
      rules: this.config.rules.map((r) => ({ ...r })),
    };
  }

  public updateConfig(partial: Partial<SceneIntelligenceConfig>): SceneIntelligenceConfig {
    this.config = {
      autoSwitchEnabled:
        partial.autoSwitchEnabled !== undefined
          ? Boolean(partial.autoSwitchEnabled)
          : this.config.autoSwitchEnabled,
      rules: Array.isArray(partial.rules)
        ? partial.rules.map((r) => ({ ...r }))
        : this.config.rules,
    };
    return this.getConfig();
  }

  public async detectObsScene(): Promise<{
    obsConnected: boolean;
    currentScene: string | null;
    availableScenes: string[];
    streamPhase: StreamPhase;
  }> {
    if (!this.obsClient || !this.obsClient.isConnected()) {
      return {
        obsConnected: false,
        currentScene: this.currentScene,
        availableScenes: [],
        streamPhase: this.streamPhase,
      };
    }

    try {
      const sceneRes = await this.obsClient.request('GetSceneList');
      const current = typeof sceneRes.currentProgramSceneName === 'string'
        ? sceneRes.currentProgramSceneName
        : null;
      const scenesRaw = Array.isArray(sceneRes.scenes) ? sceneRes.scenes : [];
      const availableScenes = scenesRaw
        .map((s) => (s && typeof s === 'object' ? String((s as { sceneName?: string }).sceneName ?? '') : ''))
        .filter(Boolean);

      this.currentScene = current;

      const streamRes = await this.obsClient.request('GetStreamStatus').catch(() => ({}));
      const outputActive = Boolean((streamRes as { outputActive?: boolean }).outputActive);
      if (outputActive) {
        if (current && /starting|intro|soon/i.test(current)) {
          this.streamPhase = 'starting';
        } else if (current && /ending|outro|bye/i.test(current)) {
          this.streamPhase = 'ending';
        } else {
          this.streamPhase = 'live';
        }
      } else {
        this.streamPhase = 'idle';
      }

      return {
        obsConnected: true,
        currentScene: this.currentScene,
        availableScenes,
        streamPhase: this.streamPhase,
      };
    } catch {
      return {
        obsConnected: false,
        currentScene: this.currentScene,
        availableScenes: [],
        streamPhase: this.streamPhase,
      };
    }
  }

  public async analyzeContext(input?: {
    sceneLabel?: string;
    currentScene?: string | null;
    streamPhase?: StreamPhase;
  }): Promise<SceneRecommendationItem | null> {
    const obsState = await this.detectObsScene();
    const currentScene =
      input?.currentScene !== undefined ? input.currentScene : obsState.currentScene;
    const streamPhase = input?.streamPhase ?? obsState.streamPhase;
    this.currentScene = currentScene;
    this.streamPhase = streamPhase;

    const prisma = getPrismaClient();
    const latestVision = input?.sceneLabel
      ? null
      : await prisma.visionCapture.findFirst({ orderBy: { createdAt: 'desc' } });
    const sceneLabel = input?.sceneLabel ?? latestVision?.sceneLabel ?? 'active_gameplay';

    const matchedRule = this.config.rules.find(
      (r) => r.enabled && r.triggerSceneLabel.toLowerCase() === sceneLabel.toLowerCase(),
    );

    const recommendedScene = matchedRule?.targetObsScene ?? currentScene ?? 'Gameplay';
    const recommendedOverlay = matchedRule?.recommendedOverlay ?? null;
    const cameraVisible = matchedRule?.cameraVisible ?? true;
    const reason = matchedRule
      ? `Aturan "${matchedRule.name}" cocok dengan kondisi layar (${sceneLabel}).`
      : `Analisis konteks layar (${sceneLabel}) pada fase siaran ${streamPhase}.`;

    let status: SceneRecommendationItem['status'] = 'pending';
    if (
      this.config.autoSwitchEnabled &&
      this.obsClient?.isConnected() &&
      recommendedScene &&
      recommendedScene !== currentScene
    ) {
      await this.obsClient.request('SetCurrentProgramScene', {
        sceneName: recommendedScene,
      });
      this.currentScene = recommendedScene;
      status = 'executed';
    }

    const row = await prisma.sceneRecommendation.create({
      data: {
        currentScene,
        recommendedScene,
        recommendedOverlay,
        cameraVisible,
        streamPhase,
        reason,
        confidence: matchedRule ? 0.88 : 0.72,
        status,
      },
    });

    const item: SceneRecommendationItem = {
      id: row.id,
      currentScene: row.currentScene,
      recommendedScene: row.recommendedScene,
      recommendedOverlay: row.recommendedOverlay,
      cameraVisible: row.cameraVisible,
      streamPhase: row.streamPhase as StreamPhase,
      reason: row.reason,
      confidence: row.confidence,
      status: row.status as SceneRecommendationItem['status'],
      createdAt: row.createdAt.toISOString(),
    };

    this.broadcast('stream:scene-recommended', item);
    return item;
  }

  public async approveRecommendation(id: number): Promise<SceneRecommendationItem> {
    const prisma = getPrismaClient();
    const existing = await prisma.sceneRecommendation.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Rekomendasi scene tidak ditemukan', ErrorCode.NOT_FOUND, 404);
    }

    let nextStatus: SceneRecommendationItem['status'] = 'approved';
    if (existing.recommendedScene && this.obsClient?.isConnected()) {
      await this.obsClient.request('SetCurrentProgramScene', {
        sceneName: existing.recommendedScene,
      });
      this.currentScene = existing.recommendedScene;
      nextStatus = 'executed';
    }

    const updated = await prisma.sceneRecommendation.update({
      where: { id },
      data: { status: nextStatus },
    });
    await recordSystemLog(
      'info',
      'stream-intelligence',
      `Rekomendasi scene #${id} -> ${updated.recommendedScene} (${nextStatus})`,
    );

    return {
      id: updated.id,
      currentScene: updated.currentScene,
      recommendedScene: updated.recommendedScene,
      recommendedOverlay: updated.recommendedOverlay,
      cameraVisible: updated.cameraVisible,
      streamPhase: updated.streamPhase as StreamPhase,
      reason: updated.reason,
      confidence: updated.confidence,
      status: updated.status as SceneRecommendationItem['status'],
      createdAt: updated.createdAt.toISOString(),
    };
  }

  public async rejectRecommendation(id: number): Promise<SceneRecommendationItem> {
    const prisma = getPrismaClient();
    const updated = await prisma.sceneRecommendation.update({
      where: { id },
      data: { status: 'rejected' },
    });
    return {
      id: updated.id,
      currentScene: updated.currentScene,
      recommendedScene: updated.recommendedScene,
      recommendedOverlay: updated.recommendedOverlay,
      cameraVisible: updated.cameraVisible,
      streamPhase: updated.streamPhase as StreamPhase,
      reason: updated.reason,
      confidence: updated.confidence,
      status: updated.status as SceneRecommendationItem['status'],
      createdAt: updated.createdAt.toISOString(),
    };
  }

  public async getStatus(limit = 20): Promise<SceneIntelligenceStatusResponse> {
    const obsState = await this.detectObsScene();
    const prisma = getPrismaClient();
    const rows = await prisma.sceneRecommendation.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      obsConnected: obsState.obsConnected,
      currentScene: obsState.currentScene,
      streamPhase: obsState.streamPhase,
      config: this.getConfig(),
      recommendations: rows.map((row) => ({
        id: row.id,
        currentScene: row.currentScene,
        recommendedScene: row.recommendedScene,
        recommendedOverlay: row.recommendedOverlay,
        cameraVisible: row.cameraVisible,
        streamPhase: row.streamPhase as StreamPhase,
        reason: row.reason,
        confidence: row.confidence,
        status: row.status as SceneRecommendationItem['status'],
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
