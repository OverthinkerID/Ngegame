import type { SystemLogEntry } from '@ngegame/shared';
import { DUMMY_SESSIONS } from '../data/mockData.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { Panel } from '../components/ui/Panel.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import type { DummySessionItem } from '../types/dashboard.js';

interface SessionHistoryPageProps {
  logs: SystemLogEntry[];
}

const SESSION_COLUMNS: TableColumn<DummySessionItem>[] = [
  {
    key: 'game',
    header: 'Game',
    render: (row) => <span className="font-medium text-[var(--text-primary)]">{row.gameTitle}</span>,
  },
  { key: 'duration', header: 'Durasi', render: (row) => row.duration },
  { key: 'actions', header: 'Aksi AI', render: (row) => `${row.aiActions} aksi` },
  { key: 'platform', header: 'Platform', render: (row) => row.streamPlatform },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <StatusBadge
        variant={row.status === 'completed' ? 'healthy' : 'warning'}
        label={row.status === 'completed' ? 'Selesai' : 'Dihentikan'}
      />
    ),
  },
  { key: 'date', header: 'Tanggal', render: (row) => row.date },
];

export function SessionHistoryPage({ logs }: SessionHistoryPageProps): React.JSX.Element {
  return (
    <div className="space-y-6">
      <Panel
        title="Arsip Sesi Bermain &amp; Siaran"
        subtitle="Ringkasan sesi yang tercatat pada modul pelacakan."
      >
        <DataTable columns={SESSION_COLUMNS} rows={DUMMY_SESSIONS} rowKey={(row) => row.id} />
      </Panel>

      <Panel
        title="Log Sistem SQLite (Data Aktual Backend)"
        subtitle="Catatan aktivitas sistem yang tersimpan secara lokal di basis data SQLite."
      >
        <div className="max-h-72 space-y-1.5 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="rounded-lg bg-[var(--bg-secondary)] p-4 text-[var(--text-secondary)]">
              Belum ada log tersimpan di SQLite.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-secondary)]"
              >
                <span className="text-[var(--text-muted)]">#{log.id}</span>{' '}
                <span className="text-[var(--text-muted)]">[{log.createdAt}]</span>{' '}
                <span className="text-[var(--accent-primary)]">[{log.level.toUpperCase()}]</span>{' '}
                <span className="text-[var(--text-primary)]">[{log.source}]</span> {log.message}
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
