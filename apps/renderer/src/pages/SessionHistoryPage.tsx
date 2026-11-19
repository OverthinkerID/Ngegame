import { Download, Search, X } from 'lucide-react';
import { useState } from 'react';
import type { SystemLogEntry } from '@ngegame/shared';
import { AppSelect } from '../components/ui/AppSelect.js';
import { EmptyState } from '../components/ui/FeedbackComponents.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Panel } from '../components/ui/Panel.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';

interface SessionHistoryPageProps {
  logs: SystemLogEntry[];
}

export function SessionHistoryPage({ logs }: SessionHistoryPageProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [selectedLog, setSelectedLog] = useState<SystemLogEntry | null>(null);

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = levelFilter === 'all' || log.level.toLowerCase() === levelFilter;
    const matchesQuery =
      !query.trim() ||
      log.message.toLowerCase().includes(query.toLowerCase()) ||
      log.source.toLowerCase().includes(query.toLowerCase());
    return matchesLevel && matchesQuery;
  });

  const handleExportJson = (): void => {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ngegame-riwayat-log.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Riwayat Sesi &amp; Log SQLite"
        description="Telusuri catatan aktivitas aktual sistem, filter berdasarkan level, lihat detail, dan ekspor JSON."
        actions={
          <button
            type="button"
            disabled={filteredLogs.length === 0}
            onClick={handleExportJson}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> Ekspor JSON
          </button>
        }
      />

      <Panel
        title="Catatan Aktivitas Sistem (SQLite)"
        subtitle="Seluruh entri di bawah berasal langsung dari tabel SystemLog basis data lokal."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari pesan atau modul..."
                className="studio-input h-9 rounded-lg pl-8 pr-3 text-xs placeholder:text-[var(--text-muted)]"
              />
            </div>

            <AppSelect
              value={levelFilter}
              onChange={(val) => setLevelFilter(val as 'all' | 'info' | 'warn' | 'error')}
              options={[
                { value: 'all', label: 'Semua Level' },
                { value: 'info', label: 'Info' },
                { value: 'warn', label: 'Peringatan' },
                { value: 'error', label: 'Galat' },
              ]}
              className="w-36"
            />
          </div>
        }
      >
        {filteredLogs.length === 0 ? (
          <EmptyState
            title="Belum Ada Catatan Aktivitas"
            description="Tidak ada log SQLite yang cocok dengan pencarian atau filter Anda saat ini."
          />
        ) : (
          <div className="max-h-96 space-y-1.5 overflow-y-auto text-xs">
            {filteredLogs.map((log) => (
              <button
                key={log.id}
                type="button"
                onClick={() => setSelectedLog(log)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-[var(--text-primary)]">
                    {log.message}
                  </div>
                  <div className="mt-0.5 tabular-nums text-[11px] text-[var(--text-muted)]">
                    #{log.id} • {log.source} • {log.createdAt}
                  </div>
                </div>
                <StatusBadge
                  variant={
                    log.level === 'error'
                      ? 'offline'
                      : log.level === 'warn'
                        ? 'warning'
                        : 'info'
                  }
                  label={log.level}
                />
              </button>
            ))}
          </div>
        )}
      </Panel>

      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Detail Log #{selectedLog.id}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="rounded-lg bg-[var(--bg-secondary)] p-3">
                <div className="text-[var(--text-muted)]">Pesan</div>
                <div className="mt-1 text-[var(--text-primary)]">{selectedLog.message}</div>
              </div>
              <div className="flex justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
                <span className="text-[var(--text-muted)]">Sumber / Level</span>
                <span className="font-mono text-[var(--text-primary)]">
                  {selectedLog.source} ({selectedLog.level})
                </span>
              </div>
              <div className="flex justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
                <span className="text-[var(--text-muted)]">Waktu</span>
                <span className="tabular-nums font-mono text-[var(--text-primary)]">
                  {selectedLog.createdAt}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
