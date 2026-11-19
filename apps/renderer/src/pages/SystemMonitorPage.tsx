import { Cpu, Database, HardDrive, Monitor, RefreshCw, Server, Terminal, Wifi } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AnalyticsSummaryReport, AppInfo, SystemHealthResponse } from '@ngegame/shared';
import { ErrorState, PerformanceChart } from '../components/ui/FeedbackComponents.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Panel } from '../components/ui/Panel.js';
import { StatCard } from '../components/ui/StatCard.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { backendService } from '../services/backendService.js';

interface SystemMonitorPageProps {
  appInfo: AppInfo | null;
  health: SystemHealthResponse | null;
  analytics: AnalyticsSummaryReport | null;
  onRefresh: () => void;
}

export function SystemMonitorPage({
  appInfo,
  health,
  analytics,
  onRefresh,
}: SystemMonitorPageProps): React.JSX.Element {
  const [integrity, setIntegrity] = useState<{ ok: boolean; result: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const checkDbIntegrity = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:47800/api/system/integrity');
      if (res.ok) {
        const json = (await res.json()) as { integrity?: { ok: boolean; result: string } };
        setIntegrity(json.integrity ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memeriksa integritas basis data.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkDbIntegrity();
  }, [checkDbIntegrity]);

  const res = analytics?.resources;
  const chartPoints = (analytics?.resourceHistory ?? []).slice(-20).map((s, i) => ({
    label: `#${i + 1}`,
    cpu: s.cpuPercent,
    ram: s.ramPercent,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitor Sistem &amp; Kesehatan Layanan"
        description="Pantau penggunaan CPU, GPU, RAM, jaringan, proses Python Worker, Node.js Backend, dan integritas SQLite."
        actions={
          <button
            type="button"
            onClick={() => {
              onRefresh();
              void checkDbIntegrity();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
            Periksa Ulang
          </button>
        }
      />

      {error && <ErrorState message={error} onRetry={() => void checkDbIntegrity()} />}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="CPU &amp; Memori"
          value={res ? `${res.cpuPercent}% / ${res.ramPercent}%` : 'Tidak Tersedia'}
          meta={res ? `${res.ramUsedGb} GB dari ${res.ramTotalGb} GB` : 'Data belum tersedia'}
          icon={<Cpu className="h-4 w-4" />}
        />
        <StatCard
          label="GPU Perangkat"
          value={res?.gpuName ?? 'Tidak Terdeteksi'}
          meta={appInfo ? `${appInfo.platform} (${appInfo.arch})` : 'Mode Peramban'}
          icon={<Monitor className="h-4 w-4" />}
        />
        <StatCard
          label="Node.js Backend"
          value={health?.components.backend.status === 'healthy' ? 'Aktif' : 'Terputus'}
          meta={health?.components.backend.message ?? 'Port 47800'}
          icon={<Server className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={health?.components.backend.status ?? 'offline'}
              label={health?.components.backend.status ?? 'offline'}
            />
          }
        />
        <StatCard
          label="Python AI Worker"
          value={health?.components.pythonWorker.status === 'healthy' ? 'Siap' : 'Nonaktif'}
          meta={health?.components.pythonWorker.message ?? 'NDJSON IPC'}
          icon={<Terminal className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={health?.components.pythonWorker.status ?? 'offline'}
              label={health?.components.pythonWorker.status ?? 'offline'}
            />
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel
          title="Grafik Beban CPU &amp; RAM"
          subtitle="Riwayat sampel penggunaan sumber daya dari backend."
          className="lg:col-span-7"
        >
          <PerformanceChart points={chartPoints} />
        </Panel>

        <Panel
          title="Basis Data, Disk, &amp; Jaringan"
          subtitle="Status konektivitas aktual dan pemeriksaan integritas SQLite."
          className="lg:col-span-5"
        >
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2.5">
              <span className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
                <Database className="h-3.5 w-3.5" /> Koneksi SQLite (Prisma)
              </span>
              <StatusBadge
                variant={health?.components.database.status ?? 'offline'}
                label={health?.components.database.status === 'healthy' ? 'Terhubung' : 'Terputus'}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2.5">
              <span className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
                <HardDrive className="h-3.5 w-3.5" /> Integritas SQLite (`PRAGMA`)
              </span>
              <StatusBadge
                variant={integrity?.ok ? 'healthy' : 'neutral'}
                label={integrity ? integrity.result.toUpperCase() : 'Memeriksa'}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2.5">
              <span className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
                <Wifi className="h-3.5 w-3.5" /> Antarmuka Jaringan
              </span>
              <StatusBadge
                variant={res?.networkOnline ? 'healthy' : 'warning'}
                label={res ? (res.networkOnline ? `${res.activeInterfaces} Aktif` : 'Offline') : 'N/A'}
              />
            </div>

            <button
              type="button"
              onClick={() => void backendService.getHealth().then(() => onRefresh())}
              className="mt-2 h-8 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            >
              Sinkronkan Telemetri
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
