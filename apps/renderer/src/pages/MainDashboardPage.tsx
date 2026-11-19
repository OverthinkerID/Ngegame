import {
  Activity,
  Bot,
  Cpu,
  Eye,
  Gamepad2,
  Hand,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type {
  AIBrainDecisionResult,
  AnalyticsSummaryReport,
  AppInfo,
  SteamGameRecord,
  StreamingStatusResponse,
  SupervisionState,
  SystemHealthResponse,
  SystemLogEntry,
  VisionAnalysisResult,
  VisionMonitorStatus,
} from '@ngegame/shared';
import { ObsLogo, SteamLogo, TwitchLogo, YouTubeLogo } from '../components/ui/BrandIcons.js';
import { ConfirmDialog, EmptyState } from '../components/ui/FeedbackComponents.js';
import { Panel } from '../components/ui/Panel.js';
import { StatCard } from '../components/ui/StatCard.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { backendService } from '../services/backendService.js';
import type { PageId } from '../types/dashboard.js';

interface MainDashboardPageProps {
  appInfo: AppInfo | null;
  health: SystemHealthResponse | null;
  logs: SystemLogEntry[];
  analytics: AnalyticsSummaryReport | null;
  streamingStatus: StreamingStatusResponse | null;
  lastPing: string | null;
  onNavigate: (page: PageId) => void;
  onNotify: (message: string, type?: 'info' | 'success' | 'error') => void;
}

export function MainDashboardPage({
  appInfo,
  health,
  logs,
  analytics,
  streamingStatus,
  lastPing,
  onNavigate,
  onNotify,
}: MainDashboardPageProps): React.JSX.Element {
  const [supervision, setSupervision] = useState<SupervisionState | null>(null);
  const [aiHistory, setAiHistory] = useState<AIBrainDecisionResult[]>([]);
  const [visionStatus, setVisionStatus] = useState<VisionMonitorStatus | null>(null);
  const [latestFrame, setLatestFrame] = useState<VisionAnalysisResult | null>(null);
  const [runningGame, setRunningGame] = useState<SteamGameRecord | null>(null);
  const [confirmEmergency, setConfirmEmergency] = useState(false);

  const loadDashboardLive = useCallback(async () => {
    const [sup, aiHist, vStat, vHist, games] = await Promise.all([
      backendService.getSupervisionState().catch(() => null),
      backendService.getAIHistory(5).catch(() => []),
      backendService.getVisionStatus().catch(() => null),
      backendService.getVisionHistory(1).catch(() => []),
      backendService.listSteamGames().catch(() => []),
    ]);
    if (sup) setSupervision(sup);
    setAiHistory(aiHist);
    if (vStat) setVisionStatus(vStat);
    setLatestFrame(vHist[0] ?? null);
    setRunningGame(games.find((g) => g.isRunning) ?? null);
  }, []);

  useEffect(() => {
    void loadDashboardLive();
  }, [loadDashboardLive]);

  const handleQuickAction = async (
    action: 'pause' | 'resume' | 'takeover' | 'return' | 'emergency' | 'reset',
  ): Promise<void> => {
    try {
      let updated: SupervisionState;
      if (action === 'pause') updated = await backendService.pauseAI();
      else if (action === 'resume') updated = await backendService.resumeAI();
      else if (action === 'takeover') updated = await backendService.takeOverControl();
      else if (action === 'return') updated = await backendService.returnControlToAI();
      else if (action === 'emergency') updated = await backendService.supervisionEmergencyStop();
      else updated = await backendService.supervisionResetEmergency();
      setSupervision(updated);
      onNotify(
        action === 'emergency'
          ? 'Emergency Stop diaktifkan. Seluruh input AI dihentikan.'
          : 'Status kendali AI diperbarui.',
        action === 'emergency' ? 'error' : 'success',
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui kendali AI.', 'error');
    }
  };

  const res = analytics?.resources;
  const ytTarget = streamingStatus?.targets.find((t) => t.platform === 'youtube');
  const twTarget = streamingStatus?.targets.find((t) => t.platform === 'twitch');
  const aiActive = supervision ? !supervision.aiPaused && !supervision.emergencyStopped : false;

  return (
    <div className="space-y-6">
      {/* Header Halaman + Quick Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Ringkasan Studio &amp; Kendali Operasional
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Pantau sesi game aktif, status AI Brain, siaran OBS, dan telemetri perangkat secara langsung.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {supervision?.aiPaused ? (
            <button
              type="button"
              onClick={() => void handleQuickAction('resume')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/25"
            >
              <Play className="h-3.5 w-3.5" /> Lanjutkan AI
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleQuickAction('pause')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            >
              <Pause className="h-3.5 w-3.5" /> Jeda AI
            </button>
          )}

          {supervision?.controlOwner === 'human' ? (
            <button
              type="button"
              onClick={() => void handleQuickAction('return')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 text-xs font-semibold text-sky-500 hover:bg-sky-500/25"
            >
              <Bot className="h-3.5 w-3.5" /> Kembalikan ke AI
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleQuickAction('takeover')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 text-xs font-semibold text-amber-500 hover:bg-amber-500/25"
            >
              <Hand className="h-3.5 w-3.5" /> Ambil Alih Manusia
            </button>
          )}

          {supervision?.emergencyStopped ? (
            <button
              type="button"
              onClick={() => void handleQuickAction('reset')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/25"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Pulihkan Emergency
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmEmergency(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-500/15 px-3 text-xs font-semibold text-rose-500 hover:bg-rose-500/25"
            >
              <ShieldAlert className="h-3.5 w-3.5" /> Emergency Stop
            </button>
          )}
        </div>
      </div>

      {/* KPI Telemetri Real */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="CPU & RAM"
          value={res ? `${res.cpuPercent}% / ${res.ramPercent}%` : 'Tidak Tersedia'}
          meta={res ? `${res.ramUsedGb} GB dari ${res.ramTotalGb} GB` : 'Menunggu data analitik'}
          icon={<Cpu className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={res ? (res.throttlingActive ? 'warning' : 'healthy') : 'neutral'}
              label={res ? (res.throttlingActive ? 'Throttled' : 'Normal') : 'N/A'}
            />
          }
        />
        <StatCard
          label="GPU Sistem"
          value={res?.gpuName ?? 'Tidak Terdeteksi'}
          meta={appInfo ? `${appInfo.platform} (${appInfo.arch})` : 'Lingkungan Web'}
          icon={<Monitor className="h-4 w-4" />}
        />
        <StatCard
          label="Status AI & Latensi"
          value={
            supervision?.emergencyStopped
              ? 'Emergency Stop'
              : aiActive
                ? 'AI Aktif'
                : 'AI Dijeda'
          }
          meta={`Latensi AI: ${analytics?.aiStats.avgLatencyMs ?? 0} ms • Izin ${
            supervision?.permissionLevel ?? 'L2'
          }`}
          icon={<Bot className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={
                supervision?.emergencyStopped
                  ? 'offline'
                  : aiActive
                    ? 'healthy'
                    : 'warning'
              }
              label={supervision?.controlOwner === 'human' ? 'Manusia' : 'AI'}
              pulse={aiActive}
            />
          }
        />
        <StatCard
          label="Vision & FPS"
          value={
            visionStatus?.running
              ? `${visionStatus.samplingIntervalMs} ms`
              : 'Siaga'
          }
          meta={`Proses rata-rata: ${analytics?.visionStats.avgProcessingMs ?? 0} ms`}
          icon={<Eye className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={visionStatus?.running ? 'healthy' : 'neutral'}
              label={visionStatus?.running ? 'Memantau' : 'Nonaktif'}
            />
          }
        />
      </section>

      {/* Sesi Game + Pratinjau Visi + Status Siaran Platform */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel
          title="Sesi Game & Pratinjau Layar"
          subtitle="Status game Steam yang berjalan dan hasil tangkapan layar terbaru."
          className="lg:col-span-7"
          action={
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Pustaka Steam
            </button>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5">
              <div className="flex items-center gap-3">
                <SteamLogo className="h-7 w-7 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    {runningGame ? runningGame.name : 'Tidak Ada Game Aktif'}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {runningGame
                      ? `AppID ${runningGame.appId} • PID ${runningGame.pid ?? '-'}`
                      : 'Jalankan game melalui menu Pustaka Steam untuk memulai sesi.'}
                  </div>
                </div>
              </div>
              <StatusBadge
                variant={runningGame ? 'healthy' : 'neutral'}
                label={runningGame ? 'Berjalan' : 'Siaga'}
                pulse={Boolean(runningGame)}
              />
            </div>

            {latestFrame?.imageBase64 ? (
              <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-black">
                <img
                  src={`data:image/png;base64,${latestFrame.imageBase64}`}
                  alt="Pratinjau Vision Monitor"
                  className="max-h-52 w-full object-contain"
                />
              </div>
            ) : (
              <EmptyState
                icon={<Gamepad2 className="h-5 w-5" />}
                title="Pratinjau Layar Belum Tersedia"
                description="Mulai pemantauan di Monitor Visi untuk melihat tangkapan layar game secara langsung."
                action={
                  <button
                    type="button"
                    onClick={() => onNavigate('vision')}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                  >
                    Buka Monitor Visi
                  </button>
                }
              />
            )}
          </div>
        </Panel>

        <Panel
          title="Status Siaran & Platform"
          subtitle="Koneksi real OBS Studio, YouTube Live, dan Twitch."
          className="lg:col-span-5"
          action={
            <button
              type="button"
              onClick={() => onNavigate('streaming')}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Studio Siaran
            </button>
          }
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
              <div className="flex items-center gap-3">
                <ObsLogo className="h-6 w-6 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">OBS Studio</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {streamingStatus?.currentScene
                      ? `Adegan: ${streamingStatus.currentScene}`
                      : streamingStatus?.obsUrl ?? 'ws://localhost:4455'}
                  </div>
                </div>
              </div>
              <StatusBadge
                variant={streamingStatus?.obsConnected ? 'healthy' : 'neutral'}
                label={streamingStatus?.obsConnected ? 'Terhubung' : 'Terputus'}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
              <div className="flex items-center gap-3">
                <YouTubeLogo className="h-4 w-6 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">YouTube Live</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {ytTarget?.hasStreamKey ? `Kunci: ${ytTarget.maskedKey}` : 'Kunci siaran belum diatur'}
                  </div>
                </div>
              </div>
              <StatusBadge
                variant={
                  streamingStatus?.health.streaming && ytTarget?.enabled
                    ? 'healthy'
                    : ytTarget?.hasStreamKey
                      ? 'info'
                      : 'neutral'
                }
                label={
                  streamingStatus?.health.streaming && ytTarget?.enabled
                    ? 'Live'
                    : ytTarget?.hasStreamKey
                      ? 'Siap'
                      : 'Terputus'
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
              <div className="flex items-center gap-3">
                <TwitchLogo className="h-5 w-6 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">Twitch</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {twTarget?.hasStreamKey ? `Kunci: ${twTarget.maskedKey}` : 'Kunci siaran belum diatur'}
                  </div>
                </div>
              </div>
              <StatusBadge
                variant={
                  streamingStatus?.health.streaming && twTarget?.enabled
                    ? 'healthy'
                    : twTarget?.hasStreamKey
                      ? 'info'
                      : 'neutral'
                }
                label={
                  streamingStatus?.health.streaming && twTarget?.enabled
                    ? 'Live'
                    : twTarget?.hasStreamKey
                      ? 'Siap'
                      : 'Terputus'
                }
              />
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2.5 text-[11px] text-[var(--text-secondary)]">
              <div className="flex items-center justify-between">
                <span>Bitrate Siaran</span>
                <span className="tabular-nums font-medium text-[var(--text-primary)]">
                  {streamingStatus?.health.bitrateKbps ?? 0} kbps •{' '}
                  {streamingStatus?.health.fps ?? 0} FPS
                </span>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Linimasa Aktivitas AI & Respon Worker */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel
          title="Linimasa Aktivitas AI Terbaru"
          subtitle="Ringkasan keputusan dan observasi yang tersimpan di SQLite."
          className="lg:col-span-7"
          action={
            <button
              type="button"
              onClick={() => onNavigate('ai-control')}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Kendali AI
            </button>
          }
        >
          {aiHistory.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-5 w-5" />}
              title="Belum Ada Keputusan AI"
              description="Jalankan simulasi atau sesi AI di menu Kendali AI untuk melihat linimasa keputusan."
            />
          ) : (
            <div className="space-y-2">
              {aiHistory.map((item, idx) => (
                <div
                  key={`${item.createdAt}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[var(--text-primary)]">
                      {item.strategyPlan || item.reasoning}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {item.providerUsed} • Keyakinan {(item.confidence * 100).toFixed(0)}% •{' '}
                      {item.latencyMs} ms
                    </div>
                  </div>
                  <StatusBadge variant="info" label={`${item.actions.length} aksi`} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Log Sistem & Python Worker"
          subtitle="Keluaran diagnostik terbaru backend dan worker."
          className="lg:col-span-5"
          action={
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Riwayat Sesi
            </button>
          }
        >
          <div className="space-y-3">
            <div className="max-h-28 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 font-mono text-[11px] text-[var(--text-secondary)]">
              {lastPing ?? 'Tekan "Uji Worker" di bilah atas untuk memeriksa respon Python Worker.'}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {logs[0]
                ? `Log terakhir: [${logs[0].source}] ${logs[0].message}`
                : `Backend: ${health?.components.backend.status ?? 'offline'}`}
            </div>
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        open={confirmEmergency}
        title="Aktifkan Emergency Stop?"
        description="Seluruh input kendali AI ke game akan dihentikan seketika tanpa menutup game atau OBS Studio."
        confirmLabel="Aktifkan Emergency Stop"
        cancelLabel="Batal"
        danger={true}
        onCancel={() => setConfirmEmergency(false)}
        onConfirm={() => {
          setConfirmEmergency(false);
          void handleQuickAction('emergency');
        }}
      />
    </div>
  );
}
