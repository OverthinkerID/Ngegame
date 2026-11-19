import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Check,
  Cpu,
  Hand,
  OctagonAlert,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  AIBrainConfig,
  AIBrainDecisionResult,
  AIProviderHealth,
  AIProviderType,
  GameGenreTemplate,
  SupervisionAuditEntry,
  SupervisionPermissionLevel,
  SupervisionQueueItem,
  SupervisionState,
} from '@ngegame/shared';
import { AppSelect } from '../components/ui/AppSelect.js';
import { ConfirmDialog, EmptyState, ErrorState } from '../components/ui/FeedbackComponents.js';
import { Panel } from '../components/ui/Panel.js';
import { StatCard } from '../components/ui/StatCard.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { backendService } from '../services/backendService.js';

const GENRE_OPTIONS: GameGenreTemplate[] = [
  'Universal',
  'Simulation',
  'RPG',
  'Survival',
  'Strategy',
  'FPS',
  'Racing',
  'Platformer',
];

export function AIControlPage(): React.JSX.Element {
  const [config, setConfig] = useState<AIBrainConfig | null>(null);
  const [providerHealth, setProviderHealth] = useState<AIProviderHealth | null>(null);
  const [latestDecision, setLatestDecision] = useState<AIBrainDecisionResult | null>(null);
  const [supervision, setSupervision] = useState<SupervisionState | null>(null);
  const [queue, setQueue] = useState<SupervisionQueueItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<SupervisionAuditEntry[]>([]);
  const [objective, setObjective] = useState('Eksplorasi aman dan cek status HUD');
  const [confirmEmergency, setConfirmEmergency] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [cfg, health, aiHist, supState, supQueue, supAudit] = await Promise.all([
        backendService.getAIConfig(),
        backendService.getAIProvidersHealth(),
        backendService.getAIHistory(5),
        backendService.getSupervisionState(),
        backendService.getSupervisionQueue(15),
        backendService.getSupervisionAudit(15),
      ]);
      setConfig(cfg);
      setProviderHealth(health);
      setSupervision(supState);
      setQueue(supQueue);
      setAuditLogs(supAudit);
      if (aiHist.length > 0 && !latestDecision) {
        setLatestDecision(aiHist[0] ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat status AI & Pengawasan.');
    }
  }, [latestDecision]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleRunReasoningAndQueue = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const visionHist = await backendService.getVisionHistory(1);
      const latestVision = visionHist[0];
      const result = await backendService.runAIThink({
        gameTitle: latestVision?.windowTitle ?? 'Simulated Game Session',
        genre: config?.genre ?? 'Universal',
        objective,
        visionState: latestVision
          ? {
              windowTitle: latestVision.windowTitle,
              sceneLabel: latestVision.sceneLabel,
              motionScore: latestVision.motionScore,
              brightness: latestVision.brightness,
              ocrText: latestVision.ocrText,
            }
          : {
              windowTitle: 'Stardew Valley (Simulated)',
              sceneLabel: 'active_gameplay',
              motionScore: 0.14,
              brightness: 0.56,
              ocrText: 'Energy 84% • 11:20 AM',
            },
      });
      setLatestDecision(result);

      const firstAction = result.actions[0];
      if (firstAction) {
        await backendService.submitSupervisionAction({
          actionType: firstAction.actionType,
          target: firstAction.target,
          parameters: firstAction.parameters,
          durationMs: firstAction.durationMs,
          confidence: firstAction.confidence,
          rationale: firstAction.rationale,
          dryRun: true,
        });
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menjalankan AI reasoning.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Pusat Kendali AI &amp; Pengawasan Manusia
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          Kelola model AI, tingkat izin L1–L3, antrean persetujuan aksi, pengambilalihan kontrol, dan Emergency Stop.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tingkat Izin"
          value={supervision?.permissionLevel ?? 'L2'}
          meta={
            supervision?.permissionLevel === 'L1'
              ? 'Eksekusi Otomatis (L1)'
              : supervision?.permissionLevel === 'L2'
                ? 'Perlu Persetujuan (L2)'
                : 'Kendali Manusia Penuh (L3)'
          }
          icon={<ShieldCheck className="h-4 w-4 text-[var(--accent-primary)]" />}
          badge={
            <StatusBadge
              variant={supervision?.emergencyStopped ? 'offline' : 'info'}
              label={supervision?.emergencyStopped ? 'Emergency' : supervision?.permissionLevel ?? 'L2'}
            />
          }
        />
        <StatCard
          label="Pemegang Kontrol"
          value={supervision?.controlOwner === 'human' ? 'Manusia' : 'AI Aktif'}
          meta={supervision?.aiPaused ? 'AI sedang dijeda' : 'AI siap merencanakan aksi'}
          icon={<Hand className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={supervision?.controlOwner === 'human' ? 'warning' : 'healthy'}
              label={supervision?.controlOwner === 'human' ? 'Takeover' : 'AI'}
            />
          }
        />
        <StatCard
          label="Antrean Persetujuan"
          value={`${supervision?.pendingCount ?? 0} Menunggu`}
          meta="Semua persetujuan divalidasi backend"
        />
        <StatCard
          label="Penyedia AI"
          value={providerHealth?.ollamaAvailable ? 'Ollama Aktif' : 'Cadangan Siap'}
          meta={`OpenAI: ${providerHealth?.openaiConfigured ? 'Terkonfigurasi' : 'Tanpa Kunci'}`}
          icon={<Cpu className="h-4 w-4" />}
        />
      </section>

      {error && <ErrorState message={error} onRetry={() => void loadAll()} />}

      <Panel
        title="Pengawasan Manusia &amp; Pengambilalihan Kontrol"
        subtitle="Pilih tingkat izin L1/L2/L3, ambil alih kendali, atau aktifkan Emergency Stop tanpa mematikan game/OBS."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {supervision?.controlOwner === 'human' ? (
              <button
                type="button"
                onClick={() => void backendService.returnControlToAI().then(() => loadAll())}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-medium text-emerald-500 hover:bg-emerald-500/25"
              >
                <Bot className="h-3.5 w-3.5" /> Kembalikan ke AI
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void backendService.takeOverControl().then(() => loadAll())}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 text-xs font-medium text-amber-500 hover:bg-amber-500/25"
              >
                <Hand className="h-3.5 w-3.5" /> Ambil Alih Kontrol
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                void (supervision?.aiPaused
                  ? backendService.resumeAI()
                  : backendService.pauseAI()
                ).then(() => loadAll())
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            >
              {supervision?.aiPaused ? (
                <>
                  <Play className="h-3.5 w-3.5" /> Lanjutkan AI
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" /> Jeda AI
                </>
              )}
            </button>

            {supervision?.emergencyStopped ? (
              <button
                type="button"
                onClick={() => void backendService.supervisionResetEmergency().then(() => loadAll())}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-medium text-emerald-500"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Pulihkan Emergency
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmEmergency(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/45 bg-rose-500/15 px-3 text-xs font-semibold text-rose-500 hover:bg-rose-500/25"
              >
                <OctagonAlert className="h-3.5 w-3.5" /> Emergency Stop
              </button>
            )}
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {(['L1', 'L2', 'L3'] as SupervisionPermissionLevel[]).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() =>
                void backendService.setSupervisionPermission(lvl).then(() => loadAll())
              }
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                supervision?.permissionLevel === lvl
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)] text-[var(--text-primary)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {lvl === 'L1'
                ? 'L1 Eksekusi Otomatis'
                : lvl === 'L2'
                  ? 'L2 Wajib Persetujuan'
                  : 'L3 Khusus Manusia'}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {queue.length === 0 ? (
            <EmptyState
              title="Antrean Persetujuan Kosong"
              description='Tekan "Uji AI + Kirim ke Antrean" di bawah untuk menguji pengajuan aksi dan validasi persetujuan.'
            />
          ) : (
            queue.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3 text-xs"
              >
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">
                    #{item.id} {item.actionType} →{' '}
                    <span className="text-[var(--accent-primary)]">{item.target}</span>
                  </div>
                  <div className="mt-0.5 tabular-nums text-[var(--text-secondary)]">
                    Keyakinan {(item.confidence * 100).toFixed(0)}% • {item.permissionLevel} •{' '}
                    {item.durationMs}ms
                    {item.reviewNote ? ` • ${item.reviewNote}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          void backendService
                            .approveSupervisionAction(item.id, 'Disetujui dari UI')
                            .then(() => loadAll())
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-500 hover:bg-emerald-500/25"
                      >
                        <Check className="h-3 w-3" /> Setujui
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void backendService
                            .rejectSupervisionAction(item.id, 'Ditolak dari UI')
                            .then(() => loadAll())
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-[11px] font-medium text-rose-500 hover:bg-rose-500/25"
                      >
                        <X className="h-3 w-3" /> Tolak
                      </button>
                    </>
                  ) : (
                    <StatusBadge
                      variant={
                        item.status === 'executed' || item.status === 'approved'
                          ? 'healthy'
                          : item.status === 'rejected' || item.status === 'blocked'
                            ? 'offline'
                            : 'warning'
                      }
                      label={item.status}
                    />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel
          title="Konfigurasi Penalaran &amp; Pengajuan Aksi"
          subtitle="Pilih penyedia AI, templat genre, lalu ajukan rencana aksi ke antrean pengawasan."
          className="lg:col-span-7"
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadAll()}
                aria-label="Muat ulang"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleRunReasoningAndQueue()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:opacity-90 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                {loading ? 'Memproses...' : 'Uji AI + Kirim ke Antrean'}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5 text-xs">
              <span className="block text-[var(--text-secondary)]">Penyedia AI Utama</span>
              <AppSelect
                value={config?.primaryProvider ?? 'ollama'}
                onChange={(val) =>
                  void backendService
                    .updateAIConfig({ primaryProvider: val as AIProviderType })
                    .then(() => loadAll())
                }
                options={[
                  { value: 'ollama', label: 'Ollama (Lokal)' },
                  { value: 'openai', label: 'OpenAI (Cloud)' },
                ]}
              />
            </div>

            <div className="space-y-1.5 text-xs">
              <span className="block text-[var(--text-secondary)]">Templat Genre</span>
              <AppSelect
                value={config?.genre ?? 'Universal'}
                onChange={(val) =>
                  void backendService
                    .updateAIConfig({ genre: val as GameGenreTemplate })
                    .then(() => loadAll())
                }
                options={GENRE_OPTIONS.map((g) => ({ value: g, label: g }))}
              />
            </div>

            <label className="space-y-1.5 text-xs md:col-span-2">
              <span className="block text-[var(--text-secondary)]">Objektif Simulasi</span>
              <input
                type="text"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </label>
          </div>
        </Panel>

        <Panel
          title="Ringkasan Observasi &amp; Keputusan AI"
          subtitle="Penjelasan tingkat pengguna dari keputusan terbaru AI Brain."
          className="lg:col-span-5"
        >
          {latestDecision ? (
            <div className="space-y-2.5 text-xs">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Observasi Layar
                </div>
                <div className="mt-1 text-[var(--text-primary)]">
                  {latestDecision.gameStateSummary}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Rencana Strategi
                </div>
                <div className="mt-1 text-[var(--text-primary)]">
                  {latestDecision.strategyPlan}
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span>Model: {latestDecision.modelUsed}</span>
                <span className="tabular-nums">
                  Keyakinan {(latestDecision.confidence * 100).toFixed(0)}% •{' '}
                  {latestDecision.latencyMs} ms
                </span>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Belum Ada Keputusan AI"
              description="Jalankan uji AI untuk melihat ringkasan observasi dan rencana strategi."
            />
          )}
        </Panel>
      </div>

      <Panel
        title="Audit Log Pengawasan Manusia (SQLite)"
        subtitle="Catatan seluruh pengambilalihan kontrol, persetujuan, penolakan, dan Emergency Stop."
      >
        <div className="max-h-48 space-y-1.5 overflow-y-auto font-mono text-xs">
          {auditLogs.length === 0 ? (
            <div className="rounded-lg bg-[var(--bg-secondary)] p-3 text-[var(--text-secondary)]">
              Belum ada audit log pengawasan.
            </div>
          ) : (
            auditLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-secondary)]"
              >
                <span>
                  [{log.eventType}] ({log.actor}/{log.permissionLevel}/{log.controlOwner}){' '}
                  {log.details}
                </span>
                <span className="text-[var(--text-muted)]">{log.createdAt}</span>
              </div>
            ))
          )}
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmEmergency}
        title="Aktifkan Emergency Stop?"
        description="Seluruh eksekusi input kendali AI ke game akan dihentikan seketika tanpa menutup game atau OBS Studio."
        confirmLabel="Aktifkan Emergency Stop"
        cancelLabel="Batal"
        danger={true}
        onCancel={() => setConfirmEmergency(false)}
        onConfirm={() => {
          setConfirmEmergency(false);
          void backendService.supervisionEmergencyStop().then(() => loadAll());
        }}
      />
    </div>
  );
}
