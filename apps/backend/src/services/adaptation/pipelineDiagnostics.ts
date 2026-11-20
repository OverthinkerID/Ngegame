import type {
  PipelineDiagnosticsReport,
  PipelineStageDiagnostic,
} from '@ngegame/shared';
import { getPrismaClient } from '../../db/prisma.js';
import type { AIBrainService } from '../ai/aiBrainService.js';
import type { ControllerService } from '../controller/controllerService.js';
import type { SteamManager } from '../steam/steamManager.js';
import type { VisionService } from '../vision/visionService.js';

export class PipelineDiagnosticsService {
  constructor(
    private readonly steamManager: SteamManager,
    private readonly visionService: VisionService,
    private readonly aiBrainService: AIBrainService,
    private readonly controllerService: ControllerService,
  ) {}

  public async runFullAudit(): Promise<PipelineDiagnosticsReport> {
    const prisma = getPrismaClient();
    const [steamInstall, games, windows, visionStatus, aiHealth, ctrlState, memoryCount] =
      await Promise.all([
        this.steamManager.detectInstallation(),
        this.steamManager.listGames().catch(() => []),
        this.visionService.listWindows().catch(() => []),
        Promise.resolve(this.visionService.getStatus()),
        this.aiBrainService.getProvidersHealth().catch(() => null),
        this.controllerService.getStatus().catch(() => null),
        prisma.gameMemoryEntry.count().catch(() => 0),
      ]);

    const latestCapture = await prisma.visionCapture
      .findFirst({ orderBy: { createdAt: 'desc' } })
      .catch(() => null);
    const latestDecision = await prisma.aIDecision
      .findFirst({ orderBy: { createdAt: 'desc' } })
      .catch(() => null);
    const latestControl = await prisma.controllerActionLog
      .findFirst({ orderBy: { createdAt: 'desc' } })
      .catch(() => null);

    const stages: PipelineStageDiagnostic[] = [
      {
        stage: 'game_detection',
        label: '1. Game Detection',
        status: steamInstall.installed ? 'healthy' : 'degraded',
        detail: steamInstall.installed
          ? `Steam terdeteksi (${steamInstall.libraryPaths.length} lokasi)`
          : 'Steam belum terdeteksi di jalur kandidat',
      },
      {
        stage: 'game_identification',
        label: '2. Game Identification',
        status: games.length > 0 ? 'healthy' : 'degraded',
        detail: `${games.length} game tersimpan di SQLite`,
      },
      {
        stage: 'process_detection',
        label: '3. Game Process Detection',
        status: windows.length > 0 ? 'healthy' : 'degraded',
        detail: `${windows.length} jendela aktif terdeteksi (${windows[0]?.title ?? 'tidak ada'})`,
      },
      {
        stage: 'screen_capture',
        label: '4. Screen Capture',
        status: latestCapture ? 'healthy' : 'degraded',
        detail: latestCapture
          ? `${latestCapture.width}x${latestCapture.height} (${latestCapture.platform})`
          : 'Belum ada tangkapan layar',
      },
      {
        stage: 'image_preprocessing',
        label: '5. Image Preprocessing',
        status: visionStatus.capabilities ? 'healthy' : 'degraded',
        detail: visionStatus.capabilities?.opencvAvailable
          ? 'OpenCV aktif'
          : 'Mode analisis ringan (OpenCV opsional)',
      },
      {
        stage: 'vision_inference',
        label: '6. Vision Inference',
        status: latestCapture ? 'healthy' : 'degraded',
        detail: latestCapture
          ? `Scene: ${latestCapture.sceneLabel} (${latestCapture.processingMs}ms)`
          : 'Menunggu frame visi',
      },
      {
        stage: 'state_interpretation',
        label: '7. Game State Interpretation',
        status: latestCapture ? 'healthy' : 'degraded',
        detail: latestCapture
          ? `OCR: ${latestCapture.ocrText ? 'tersedia' : 'kosong'}`
          : 'Belum ada interpretasi state',
      },
      {
        stage: 'ai_decision_making',
        label: '8. AI Decision-Making',
        status:
          aiHealth?.ollamaAvailable || aiHealth?.openaiConfigured
            ? 'healthy'
            : 'degraded',
        detail: aiHealth?.ollamaAvailable
          ? 'Ollama lokal siap'
          : aiHealth?.openaiConfigured
            ? 'OpenAI cloud terkonfigurasi'
            : 'Menggunakan fallback heuristik lokal',
      },
      {
        stage: 'control_mapping',
        label: '9. Control Mapping',
        status: 'healthy',
        detail: 'Pemetaan aksi allowlist & durasi aman aktif',
      },
      {
        stage: 'input_execution',
        label: '10. Input Execution',
        status: ctrlState ? (ctrlState.dryRun ? 'degraded' : 'healthy') : 'offline',
        detail: ctrlState
          ? `Backend: ${ctrlState.backend} (dryRun=${ctrlState.dryRun})`
          : 'Controller worker tidak terjangkau',
      },
      {
        stage: 'action_verification',
        label: '11. Action Verification',
        status: latestControl ? 'healthy' : 'degraded',
        detail: latestControl
          ? `Terakhir: ${latestControl.actionType} (${latestControl.status})`
          : 'Belum ada eksekusi terverifikasi',
      },
      {
        stage: 'memory_and_learning',
        label: '12. Memory & Learning',
        status: 'healthy',
        detail: `${memoryCount} entri memori game tersimpan di SQLite`,
      },
    ];

    const hasOffline = stages.some((s) => s.status === 'offline');
    const hasDegraded = stages.some((s) => s.status === 'degraded');

    return {
      platform: process.platform,
      checkedAt: new Date().toISOString(),
      overallStatus: hasOffline ? 'offline' : hasDegraded ? 'degraded' : 'healthy',
      captureStatus: stages[3]!.detail,
      visionStatus: stages[5]!.detail,
      aiInferenceStatus: latestDecision ? `${latestDecision.modelUsed} (${latestDecision.latencyMs}ms)` : stages[7]!.detail,
      decisionStatus: latestDecision ? latestDecision.executionStatus : 'Belum ada keputusan',
      controllerStatus: stages[9]!.detail,
      inputExecutionStatus: ctrlState?.backend ?? 'unknown',
      actionVerificationStatus: stages[10]!.detail,
      stages,
    };
  }
}
