import type {
  EventVerificationSource,
  GameplayEventSeverity,
  GameplayEventType,
  GameplayObservationInput,
  StreamIntelligenceMode,
  StreamIntelligenceStatus,
  VerifiedGameplayEvent,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';

export type StreamWsBroadcaster = (eventType: string, payload: unknown) => void;

interface ObservationCandidate {
  eventType: GameplayEventType;
  severity: GameplayEventSeverity;
  title: string;
  description: string;
  confidence: number;
  verifiedBy: EventVerificationSource[];
}

function inferGameId(windowTitle: string, explicitGameId?: string): string {
  if (explicitGameId?.trim()) return explicitGameId.trim();
  if (/stardew/i.test(windowTitle)) return 'stardew-valley';
  return windowTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown-game';
}

export class GameplayEventIntelligenceService {
  private readonly broadcast: StreamWsBroadcaster;

  private active = true;
  private mode: StreamIntelligenceMode = 'semi-automatic';
  private emergencyStopped = false;
  private lastObservedAt: string | null = null;
  private activeGameId: string | null = null;
  private activeWindowTitle: string | null = null;
  private lastSceneByWindow = new Map<string, string>();
  private lastOcrByWindow = new Map<string, string>();

  constructor(broadcast: StreamWsBroadcaster = () => undefined) {
    this.broadcast = broadcast;
  }

  public setMode(mode: StreamIntelligenceMode): StreamIntelligenceMode {
    this.mode = mode;
    return this.mode;
  }

  public async emergencyStop(): Promise<void> {
    this.emergencyStopped = true;
    this.active = false;
    await recordSystemLog(
      'warn',
      'stream-intelligence',
      'Emergency stop diaktifkan pada Gameplay Event Intelligence',
    );
  }

  public resetEmergencyStop(): void {
    this.emergencyStopped = false;
    this.active = true;
  }

  public async getStatus(limit = 15): Promise<StreamIntelligenceStatus> {
    const prisma = getPrismaClient();
    const [totalEventsDetected, recentEvents] = await Promise.all([
      prisma.streamEvent.count(),
      this.listEvents(limit),
    ]);

    return {
      active: this.active && !this.emergencyStopped,
      mode: this.mode,
      emergencyStopped: this.emergencyStopped,
      lastObservedAt: this.lastObservedAt,
      activeGameId: this.activeGameId,
      activeWindowTitle: this.activeWindowTitle,
      totalEventsDetected,
      recentEvents,
    };
  }

  public async listEvents(limit = 30, gameId?: string): Promise<VerifiedGameplayEvent[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.streamEvent.findMany({
      where: gameId ? { gameId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)),
    });

    return rows.map((row) => ({
      id: row.id,
      gameId: row.gameId,
      windowTitle: row.windowTitle,
      eventType: row.eventType as GameplayEventType,
      severity: row.severity as GameplayEventSeverity,
      title: row.title,
      description: row.description,
      confidence: row.confidence,
      verifiedBy: JSON.parse(row.verifiedByJson) as EventVerificationSource[],
      ocrExcerpt: row.ocrExcerpt,
      motionScore: row.motionScore,
      sceneLabel: row.sceneLabel,
      metadata: JSON.parse(row.metadataJson) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  public async observeLatestVision(): Promise<{
    verified: boolean;
    events: VerifiedGameplayEvent[];
    reason?: string;
  }> {
    const prisma = getPrismaClient();
    const latest = await prisma.visionCapture.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) {
      return {
        verified: false,
        events: [],
        reason: 'Belum ada tangkapan layar terverifikasi di VisionCapture.',
      };
    }

    const hudItems = JSON.parse(latest.hudJson) as Array<{ label: string; value?: string }>;
    return this.analyzeObservation({
      windowTitle: latest.windowTitle,
      sceneLabel: latest.sceneLabel,
      motionScore: latest.motionScore,
      brightness: latest.brightness,
      ocrText: latest.ocrText,
      hudItems,
      visionCaptureId: latest.id,
    });
  }

  public async analyzeObservation(input: GameplayObservationInput): Promise<{
    verified: boolean;
    events: VerifiedGameplayEvent[];
    reason?: string;
  }> {
    if (this.emergencyStopped) {
      return {
        verified: false,
        events: [],
        reason: 'Gameplay Event Intelligence sedang dalam status Emergency Stop.',
      };
    }

    const gameId = inferGameId(input.windowTitle, input.gameId);
    const ocr = (input.ocrText ?? '').trim();
    const ocrLower = ocr.toLowerCase();
    const motion = Number(input.motionScore ?? 0);
    const scene = (input.sceneLabel ?? 'unknown').trim();
    const prevScene = this.lastSceneByWindow.get(input.windowTitle);
    const prevOcr = this.lastOcrByWindow.get(input.windowTitle) ?? '';

    this.lastObservedAt = new Date().toISOString();
    this.activeGameId = gameId;
    this.activeWindowTitle = input.windowTitle;
    this.lastSceneByWindow.set(input.windowTitle, scene);
    this.lastOcrByWindow.set(input.windowTitle, ocr);

    // Aturan verifikasi: jangan menganggap event berhasil hanya dari controllerAttempted
    const hasVisualEvidence =
      motion >= 0.04 ||
      ocr.length > 0 ||
      (prevScene !== undefined && prevScene !== scene) ||
      scene === 'dialogue';

    if (!hasVisualEvidence) {
      return {
        verified: false,
        events: [],
        reason: input.controllerAttempted
          ? 'Input kontroler tercatat, tetapi tidak ada perubahan visual/OCR/gerak terverifikasi.'
          : 'Tidak ada perubahan gameplay signifikan yang terverifikasi.',
      };
    }

    const candidates: ObservationCandidate[] = [];

    if (/\b(passed out|exhausted|game over|you died|knocked out|fainted)\b/i.test(ocrLower)) {
      candidates.push({
        eventType: 'game_over',
        severity: 'critical',
        title: 'Game Over / Karakter Kelelahan',
        description: `Terdeteksi kondisi kritis pada layar ${input.windowTitle}.`,
        confidence: 0.95,
        verifiedBy: ['vision', 'ocr'],
      });
    }

    if (/\b(achievement|level up|new recipe|skill level|trophy|unlocked)\b/i.test(ocrLower)) {
      candidates.push({
        eventType: 'achievement',
        severity: 'high',
        title: 'Pencapaian / Kenaikan Level',
        description: `Pencapaian atau kenaikan level terverifikasi melalui OCR di ${input.windowTitle}.`,
        confidence: 0.91,
        verifiedBy: ['vision', 'ocr'],
      });
    }

    if (/\b(prismatic|meteor|crop fairy|legendary|rare|ancient seed|witch)\b/i.test(ocrLower)) {
      candidates.push({
        eventType: 'rare_event',
        severity: 'high',
        title: 'Event Langka Terdeteksi',
        description: `Kemunculan event atau item langka terverifikasi di ${input.windowTitle}.`,
        confidence: 0.9,
        verifiedBy: ['vision', 'ocr'],
      });
    }

    if (
      /\b(harvest|picked|crops ready|parsnip|strawberry|cauliflower|blueberry|melon)\b/i.test(
        ocrLower,
      ) &&
      (motion >= 0.03 || ocr !== prevOcr)
    ) {
      candidates.push({
        eventType: 'harvesting',
        severity: 'medium',
        title: 'Panen Tanaman Terverifikasi',
        description: `Aktivitas panen terkonfirmasi oleh perubahan layar dan OCR di ${input.windowTitle}.`,
        confidence: 0.87,
        verifiedBy: ['vision', 'ocr', 'adapter'],
      });
    }

    if (
      /\b(watered|tilled|planted|watering can|hoe|seed|fertilizer)\b/i.test(ocrLower) &&
      motion >= 0.04
    ) {
      candidates.push({
        eventType: 'farming',
        severity: 'low',
        title: 'Aktivitas Bertani Terverifikasi',
        description: `Aktivitas bertani (menyiram/menanam/mencangkul) teramati di ${input.windowTitle}.`,
        confidence: 0.84,
        verifiedBy: ['vision', 'ocr', 'motion'],
      });
    }

    if (
      /\b(slime|monster|damage|attack|skull cavern|mine level|hp:)\b/i.test(ocrLower) &&
      motion >= 0.08
    ) {
      candidates.push({
        eventType: 'combat',
        severity: 'high',
        title: 'Pertarungan / Bahaya Terdeteksi',
        description: `Situasi pertarungan aktif terdeteksi di ${input.windowTitle}.`,
        confidence: 0.88,
        verifiedBy: ['vision', 'ocr', 'motion'],
      });
    }

    if (/\b(found|obtained|collected|geode|artifact|treasure chest)\b/i.test(ocrLower)) {
      candidates.push({
        eventType: 'item_discovery',
        severity: 'medium',
        title: 'Penemuan Item',
        description: `Penemuan item baru terverifikasi di ${input.windowTitle}.`,
        confidence: 0.85,
        verifiedBy: ['vision', 'ocr'],
      });
    }

    if (
      scene === 'dialogue' ||
      /\b(hearts|dialogue|mayor lewis|pierre|robin|abigail|gift|shop)\b/i.test(ocrLower)
    ) {
      candidates.push({
        eventType: 'npc_interaction',
        severity: 'medium',
        title: 'Interaksi NPC / Dialog',
        description: `Dialog atau interaksi karakter NPC terdeteksi di ${input.windowTitle}.`,
        confidence: scene === 'dialogue' ? 0.9 : 0.82,
        verifiedBy: scene === 'dialogue' ? ['vision', 'ocr'] : ['ocr'],
      });
    }

    if (prevScene !== undefined && prevScene !== scene) {
      candidates.push({
        eventType: 'scene_transition',
        severity: 'low',
        title: `Perpindahan Adegan (${prevScene} → ${scene})`,
        description: `Layar berpindah dari ${prevScene} ke ${scene}.`,
        confidence: 0.92,
        verifiedBy: ['vision'],
      });
    }

    if (candidates.length === 0 && motion >= 0.08 && scene === 'active_gameplay') {
      candidates.push({
        eventType: 'player_movement',
        severity: 'low',
        title: 'Pergerakan Pemain Teramati',
        description: `Pergerakan aktif pemain terdeteksi (motion=${motion.toFixed(2)}).`,
        confidence: 0.78,
        verifiedBy: ['vision', 'motion'],
      });
    }

    if (candidates.length === 0) {
      return {
        verified: false,
        events: [],
        reason: 'Observasi tidak cocok dengan kategori event gameplay terverifikasi.',
      };
    }

    const prisma = getPrismaClient();
    const persisted: VerifiedGameplayEvent[] = [];

    for (const c of candidates) {
      const row = await prisma.streamEvent.create({
        data: {
          gameId,
          windowTitle: input.windowTitle,
          eventType: c.eventType,
          severity: c.severity,
          title: c.title,
          description: c.description,
          confidence: c.confidence,
          verifiedByJson: JSON.stringify(c.verifiedBy),
          ocrExcerpt: ocr ? ocr.slice(0, 160) : null,
          motionScore: motion,
          sceneLabel: scene,
          metadataJson: JSON.stringify({
            hudCount: input.hudItems?.length ?? 0,
            controllerAttempted: Boolean(input.controllerAttempted),
          }),
          visionId: input.visionCaptureId ?? null,
        },
      });

      const event: VerifiedGameplayEvent = {
        id: row.id,
        gameId: row.gameId,
        windowTitle: row.windowTitle,
        eventType: row.eventType as GameplayEventType,
        severity: row.severity as GameplayEventSeverity,
        title: row.title,
        description: row.description,
        confidence: row.confidence,
        verifiedBy: c.verifiedBy,
        ocrExcerpt: row.ocrExcerpt,
        motionScore: row.motionScore,
        sceneLabel: row.sceneLabel,
        metadata: JSON.parse(row.metadataJson) as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      };
      persisted.push(event);
      this.broadcast('stream:event-detected', event);
    }

    return { verified: true, events: persisted };
  }
}
