import type { AnalyticsSummaryReport, SystemHealthResponse } from '@ngegame/shared';

interface GlobalStatusBarProps {
  health: SystemHealthResponse | null;
  obsConnected: boolean;
  analytics: AnalyticsSummaryReport | null;
}

export function GlobalStatusBar({
  health,
  obsConnected,
  analytics,
}: GlobalStatusBarProps): React.JSX.Element {
  const apiOk = health?.components.backend.status === 'healthy';
  const dbOk = health?.components.database.status === 'healthy';
  const workerOk = health?.components.pythonWorker.status === 'healthy';
  const res = analytics?.resources;

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-sidebar)] px-4 text-[11px] text-[var(--text-muted)]">
      <div className="flex items-center gap-4 overflow-x-auto">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className={`h-1.5 w-1.5 rounded-full ${apiOk ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          Backend: {apiOk ? 'Aktif' : 'Terputus'}
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className={`h-1.5 w-1.5 rounded-full ${workerOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          Worker: {workerOk ? 'Siap' : 'Nonaktif'}
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className={`h-1.5 w-1.5 rounded-full ${dbOk ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          SQLite: {dbOk ? 'Terhubung' : 'Terputus'}
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className={`h-1.5 w-1.5 rounded-full ${obsConnected ? 'bg-emerald-500' : 'bg-slate-500'}`} />
          OBS: {obsConnected ? 'Terhubung' : 'Tidak Terhubung'}
        </span>
      </div>

      <div className="hidden items-center gap-3 tabular-nums sm:flex">
        <span>
          CPU: {res ? `${res.cpuPercent}%` : 'N/A'}
        </span>
        <span>
          RAM: {res ? `${res.ramPercent}%` : 'N/A'}
        </span>
      </div>
    </footer>
  );
}
