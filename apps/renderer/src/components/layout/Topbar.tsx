import {
  Activity,
  ChevronRight,
  History,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Terminal,
} from 'lucide-react';
import type { SystemHealthResponse } from '@ngegame/shared';
import { NAV_ITEMS } from '../../data/mockData.js';
import { useTheme } from '../../context/ThemeContext.js';
import type { PageId } from '../../types/dashboard.js';
import { ObsLogo } from '../ui/BrandIcons.js';
import { StatusBadge } from '../ui/StatusBadge.js';

interface TopbarProps {
  activePage: PageId;
  health: SystemHealthResponse | null;
  obsConnected: boolean;
  loading: boolean;
  pinging: boolean;
  platform?: string;
  onSelectPage: (page: PageId) => void;
  onRefresh: () => void;
  onPingWorker: () => void;
}

export function Topbar({
  activePage,
  health,
  obsConnected,
  loading,
  pinging,
  platform,
  onSelectPage,
  onRefresh,
  onPingWorker,
}: TopbarProps): React.JSX.Element {
  const { mode, toggleMode } = useTheme();
  const current = NAV_ITEMS.find((item) => item.id === activePage);
  const isOnline = health?.components.backend.status === 'healthy';
  const workerOnline = health?.components.pythonWorker.status === 'healthy';
  const isWindows = platform === 'win32';
  const platformLabel = isWindows
    ? 'Windows'
    : platform === 'darwin'
      ? 'macOS'
      : 'Desktop';

  return (
    <header
      className={`app-drag-region flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-6 ${
        isWindows ? 'pr-36' : ''
      }`}
    >
      {/* Kiri: Breadcrumb bersih tanpa deskripsi panjang */}
      <div className="app-no-drag flex min-w-0 items-center gap-2 text-xs">
        <span className="hidden font-medium text-[var(--text-muted)] sm:inline">
          Overthinker-Ngegame
        </span>
        <ChevronRight className="hidden h-3.5 w-3.5 text-[var(--text-muted)] sm:inline" />
        <h1 className="truncate text-sm font-semibold tracking-tight text-[var(--text-primary)]">
          {current?.label ?? 'Dasbor'}
        </h1>
      </div>

      {/* Kanan: Status OBS, Worker, Riwayat Sesi, Theme Toggle, Icon Refresh, Uji Worker, Live Badge */}
      <div className="app-no-drag flex shrink-0 items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] lg:flex">
          <Monitor className="h-3.5 w-3.5 text-[var(--accent-secondary)]" />
          <span>{platformLabel}</span>
        </div>

        <button
          type="button"
          onClick={() => onSelectPage('streaming')}
          title="Status OBS Studio"
          className="hidden items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] xl:flex"
        >
          <ObsLogo className="h-3.5 w-3.5" />
          <span>{obsConnected ? 'OBS Aktif' : 'OBS Terputus'}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectPage('history')}
          aria-current={activePage === 'history' ? 'page' : undefined}
          title="Riwayat Sesi"
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
            activePage === 'history'
              ? 'border-[var(--accent-primary)]/50 bg-[var(--accent-primary-soft)] text-[var(--text-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Riwayat Sesi</span>
        </button>

        <button
          type="button"
          onClick={toggleMode}
          aria-label={mode === 'dark' ? 'Aktifkan Mode Terang' : 'Aktifkan Mode Gelap'}
          title={mode === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          {mode === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* Tombol Muat Ulang: Icon Saja */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Muat Ulang"
          title="Muat ulang status sistem"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {/* Tombol Uji Worker dengan Ikon Animasi */}
        <button
          type="button"
          onClick={onPingWorker}
          disabled={loading || pinging}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-2.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {pinging ? (
            <Activity className="h-3.5 w-3.5 animate-pulse text-[var(--accent-primary)]" />
          ) : (
            <Terminal
              className={`h-3.5 w-3.5 text-[var(--accent-primary)] ${
                workerOnline ? 'animate-pulse' : ''
              }`}
            />
          )}
          <span className="hidden sm:inline">{pinging ? 'Menguji...' : 'Uji Worker'}</span>
        </button>

        {/* Badge Live Layanan Aktif di Pojok Kanan Atas */}
        <StatusBadge
          variant={isOnline ? 'healthy' : 'offline'}
          label={isOnline ? 'Layanan Aktif' : 'Terputus'}
          pulse={isOnline}
        />
      </div>
    </header>
  );
}
