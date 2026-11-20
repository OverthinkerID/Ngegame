import {
  Activity,
  Bell,
  Bot,
  ChevronRight,
  Hand,
  Monitor,
  Moon,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  Sun,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';
import type { SupervisionState, SystemHealthResponse, SystemLogEntry } from '@ngegame/shared';
import { NAV_ITEMS } from '../../data/mockData.js';
import { useTheme } from '../../context/ThemeContext.js';
import type { PageId } from '../../types/dashboard.js';
import { ObsLogo } from '../ui/BrandIcons.js';
import { StatusBadge } from '../ui/StatusBadge.js';

interface TopbarProps {
  activePage: PageId;
  health: SystemHealthResponse | null;
  supervision: SupervisionState | null;
  logs: SystemLogEntry[];
  obsConnected: boolean;
  loading: boolean;
  pinging: boolean;
  platform?: string;
  onSelectPage: (page: PageId) => void;
  onRefresh: () => void;
  onPingWorker: () => void;
  onPauseOrResumeAI: () => void;
  onTakeoverOrReturn: () => void;
  onRequestEmergencyStop: () => void;
}

export function Topbar({
  activePage,
  health,
  supervision,
  logs,
  obsConnected,
  loading,
  pinging,
  platform,
  onSelectPage,
  onRefresh,
  onPingWorker,
  onPauseOrResumeAI,
  onTakeoverOrReturn,
  onRequestEmergencyStop,
}: TopbarProps): React.JSX.Element {
  const { mode, toggleMode } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);

  const current = NAV_ITEMS.find((item) => item.id === activePage);
  const isOnline = health?.components.backend.status === 'healthy';
  const workerOnline = health?.components.pythonWorker.status === 'healthy';
  const isWindows = platform === 'win32';
  const platformLabel = isWindows ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Desktop';

  const recentAlerts = logs.filter((l) => l.level === 'warn' || l.level === 'error').slice(0, 6);

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-5">
      {/* Kiri: Breadcrumb Bersih */}
      <div className="app-no-drag flex min-w-0 items-center gap-2 text-xs">
        <span className="hidden font-medium text-[var(--text-muted)] sm:inline">
          Overthinker-Ngegame
        </span>
        <ChevronRight className="hidden h-3.5 w-3.5 text-[var(--text-muted)] sm:inline" />
        <h1 className="truncate text-sm font-semibold tracking-tight text-[var(--text-primary)]">
          {current?.label ?? 'Dasbor'}
        </h1>
      </div>

      {/* Kanan: Global Safety Controls + Status + Notification Center + Live Badge */}
      <div className="app-no-drag flex shrink-0 items-center gap-1.5">
        {/* Global Safety Controls */}
        <div className="hidden items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-main)] p-0.5 lg:flex">
          <button
            type="button"
            onClick={onPauseOrResumeAI}
            title={supervision?.aiPaused ? 'Lanjutkan AI' : 'Jeda AI'}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            {supervision?.aiPaused ? (
              <>
                <Play className="h-3 w-3 text-emerald-500" /> Lanjut
              </>
            ) : (
              <>
                <Pause className="h-3 w-3" /> Jeda AI
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onTakeoverOrReturn}
            title={
              supervision?.controlOwner === 'human'
                ? 'Kembalikan Kontrol ke AI'
                : 'Ambil Alih Kontrol Manusia'
            }
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            {supervision?.controlOwner === 'human' ? (
              <>
                <Bot className="h-3 w-3 text-sky-500" /> AI
              </>
            ) : (
              <>
                <Hand className="h-3 w-3 text-amber-500" /> Takeover
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onRequestEmergencyStop}
            title="Emergency Stop"
            className="inline-flex h-7 items-center gap-1 rounded-md bg-rose-500/15 px-2 text-[11px] font-semibold text-rose-500 hover:bg-rose-500/25"
          >
            <ShieldAlert className="h-3 w-3" /> Stop
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelectPage('system-monitor')}
          title="Monitor Sistem"
          className="hidden items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] xl:flex"
        >
          <Monitor className="h-3.5 w-3.5 text-[var(--accent-secondary)]" />
          <span>{platformLabel}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectPage('streaming')}
          title="Status OBS Studio"
          className="hidden items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] xl:flex"
        >
          <ObsLogo className="h-3.5 w-3.5" />
          <span>{obsConnected ? 'OBS Aktif' : 'OBS Terputus'}</span>
        </button>

        {/* Notification Center */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            aria-label="Pusat Notifikasi"
            title="Pusat Notifikasi"
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <Bell className="h-3.5 w-3.5" />
            {recentAlerts.length > 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-2xl">
              <div className="mb-2 flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 text-xs font-semibold text-[var(--text-primary)]">
                <span>Notifikasi Sistem</span>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    onSelectPage('history');
                  }}
                  className="text-[11px] font-medium text-[var(--accent-primary)] hover:underline"
                >
                  Lihat Riwayat
                </button>
              </div>
              {recentAlerts.length === 0 ? (
                <p className="py-3 text-center text-xs text-[var(--text-secondary)]">
                  Tidak ada peringatan atau galat terbaru.
                </p>
              ) : (
                <div className="max-h-56 space-y-1.5 overflow-y-auto">
                  {recentAlerts.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2 text-[11px]"
                    >
                      <div className="font-semibold text-amber-500">
                        [{item.level.toUpperCase()}] {item.source}
                      </div>
                      <div className="mt-0.5 text-[var(--text-secondary)]">{item.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleMode}
          aria-label={mode === 'dark' ? 'Aktifkan Mode Terang' : 'Aktifkan Mode Gelap'}
          title={mode === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          {mode === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* Muat Ulang Icon Only */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Muat Ulang"
          title="Muat ulang status sistem"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {/* Uji Worker dengan Animasi */}
        <button
          type="button"
          onClick={onPingWorker}
          disabled={loading || pinging}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-2.5 text-xs font-semibold text-[var(--text-primary)] hover:opacity-90 disabled:opacity-50"
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

        {/* Live Badge di Pojok Kanan Atas */}
        <StatusBadge
          variant={isOnline ? 'healthy' : 'offline'}
          label={isOnline ? 'Layanan Aktif' : 'Terputus'}
          pulse={isOnline}
        />
      </div>
    </header>
  );
}
