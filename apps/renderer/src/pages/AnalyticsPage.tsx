import { useCallback, useEffect, useState } from 'react';
import { Download, Gauge, RefreshCw, Wifi } from 'lucide-react';
import type { AnalyticsSummaryReport, ThrottlingConfig } from '@ngegame/shared';
import { ErrorState, PerformanceChart } from '../components/ui/FeedbackComponents.js';
import { Panel } from '../components/ui/Panel.js';
import { StatCard } from '../components/ui/StatCard.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { backendService } from '../services/backendService.js';

export function AnalyticsPage(): React.JSX.Element {
  const [report, setReport] = useState<AnalyticsSummaryReport | null>(null);
  const [throttle, setThrottle] = useState<ThrottlingConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, cfg] = await Promise.all([
        backendService.getAnalyticsSummary(),
        backendService.getThrottlingConfig(),
      ]);
      setReport(summary);
      setThrottle(cfg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data analitik.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const handleExport = async (format: 'json' | 'csv'): Promise<void> => {
    try {
      const content = await backendService.exportAnalyticsReport(format);
      const blob = new Blob([content], {
        type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ngegame-analitik.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengekspor laporan.');
    }
  };

  const res = report?.resources;
  const chartPoints = (report?.resourceHistory ?? []).slice(-20).map((snap, idx) => ({
    label: `#${idx + 1}`,
    cpu: snap.cpuPercent,
    ram: snap.ramPercent,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Analitik &amp; Monitor Sistem
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          Pemantauan beban CPU, RAM, GPU, latensi AI, Vision, TTS, serta ekspor metrik SQLite.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="CPU & RAM"
          value={res ? `${res.cpuPercent}% • ${res.ramPercent}%` : 'Tidak Tersedia'}
          meta={res ? `${res.ramUsedGb} GB / ${res.ramTotalGb} GB RAM` : '-'}
          icon={<Gauge className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={res ? (res.throttlingActive ? 'warning' : 'healthy') : 'neutral'}
              label={res ? (res.throttlingActive ? 'Pembatasan Aktif' : 'Optimal') : 'N/A'}
            />
          }
        />
        <StatCard
          label="GPU Sistem"
          value={res?.gpuName ?? 'Tidak Terdeteksi'}
          meta="Pemantauan perangkat keras aktif"
        />
        <StatCard
          label="Latensi AI & Visi"
          value={`${report?.aiStats.avgLatencyMs ?? 0} ms / ${report?.visionStats.avgProcessingMs ?? 0} ms`}
          meta={`${report?.aiStats.totalDecisions ?? 0} keputusan • ${report?.visionStats.totalCaptures ?? 0} frame`}
        />
        <StatCard
          label="Jaringan & Suara TTS"
          value={res ? (res.networkOnline ? 'Terhubung' : 'Offline') : 'N/A'}
          meta={`Rata-rata TTS ${report?.voiceStats.avgLatencyMs ?? 0} ms`}
          icon={<Wifi className="h-4 w-4" />}
        />
      </section>

      {error && <ErrorState message={error} onRetry={() => void loadAnalytics()} />}

      <Panel
        title="Pembatasan Beban Otomatis & Grafik Performa"
        subtitle="Menyesuaikan interval pemantauan layar secara otomatis saat CPU atau RAM melewati ambang batas."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadAnalytics()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={() => void handleExport('csv')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-medium text-[var(--text-primary)]"
            >
              <Download className="h-3.5 w-3.5" /> Ekspor CSV
            </button>
            <button
              type="button"
              onClick={() => void handleExport('json')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-medium text-emerald-500"
            >
              <Download className="h-3.5 w-3.5" /> Ekspor JSON
            </button>
          </div>
        }
      >
        <div className="mb-5 grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
          <label className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
            <span className="text-[var(--text-secondary)]">Pembatasan Otomatis</span>
            <input
              type="checkbox"
              checked={throttle?.autoThrottleEnabled ?? true}
              onChange={(e) =>
                void backendService
                  .updateThrottlingConfig({ autoThrottleEnabled: e.target.checked })
                  .then(setThrottle)
              }
              className="h-4 w-4 accent-[var(--accent-primary)]"
            />
          </label>
          <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
            <span className="text-[var(--text-secondary)]">Batas Maksimal CPU</span>
            <span className="tabular-nums font-mono text-[var(--text-primary)]">
              {throttle?.cpuThresholdPercent ?? 85}%
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
            <span className="text-[var(--text-secondary)]">Batas Maksimal RAM</span>
            <span className="tabular-nums font-mono text-[var(--text-primary)]">
              {throttle?.ramThresholdPercent ?? 85}%
            </span>
          </div>
        </div>

        <PerformanceChart points={chartPoints} />
      </Panel>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Panel title="Statistik AI & Pengendali" subtitle="Agregasi aktual dari basis data SQLite.">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
              <span className="text-[var(--text-secondary)]">Total Keputusan AI</span>
              <span className="tabular-nums font-mono text-[var(--text-primary)]">
                {report?.aiStats.totalDecisions ?? 0}
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
              <span className="text-[var(--text-secondary)]">Rata-rata Keyakinan</span>
              <span className="tabular-nums font-mono text-[var(--text-primary)]">
                {((report?.aiStats.avgConfidence ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
              <span className="text-[var(--text-secondary)]">Aksi Pengendali (Sukses / Diblokir)</span>
              <span className="tabular-nums font-mono text-[var(--text-primary)]">
                {report?.controllerStats.executedOrSimulated ?? 0} /{' '}
                {report?.controllerStats.blockedOrRejected ?? 0}
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="Laporan Peringatan & Galat" subtitle="Catatan terbaru dari SystemLog SQLite.">
          <div className="max-h-40 space-y-1.5 overflow-y-auto font-mono text-[11px]">
            {(report?.recentErrors.length ?? 0) === 0 ? (
              <div className="rounded-lg bg-[var(--bg-secondary)] p-3 text-[var(--text-secondary)]">
                Tidak ada galat tercatat.
              </div>
            ) : (
              report?.recentErrors.map((err) => (
                <div
                  key={err.id}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-500"
                >
                  [{err.level.toUpperCase()}] [{err.source}] {err.message}
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
