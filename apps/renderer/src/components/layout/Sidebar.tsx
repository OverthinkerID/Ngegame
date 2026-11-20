import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Eye,
  Gamepad2,
  History,
  LayoutDashboard,
  Mic,
  Play,
  Puzzle,
  Radio,
  RefreshCw,
  Settings,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import type { SteamGameRecord } from '@ngegame/shared';
import { NAV_ITEMS } from '../../data/mockData.js';
import { useTheme } from '../../context/ThemeContext.js';
import type { PageId } from '../../types/dashboard.js';
import { ObsLogo, SteamLogo } from '../ui/BrandIcons.js';
import { NgegameLogo } from '../ui/OverthinkerLogo.js';

const ICON_MAP: Record<PageId, LucideIcon> = {
  dashboard: LayoutDashboard,
  library: LayoutDashboard,
  'ai-control': Bot,
  vision: Eye,
  adapters: Puzzle,
  streaming: LayoutDashboard,
  voice: Mic,
  analytics: Activity,
  history: History,
  'system-monitor': Cpu,
  settings: Settings,
};

const NAV_GROUPS: { label: string; ids: PageId[] }[] = [
  { label: 'Utama', ids: ['dashboard', 'library'] },
  { label: 'AI & Visi', ids: ['ai-control', 'vision', 'adapters'] },
  { label: 'Studio', ids: ['streaming', 'voice'] },
  { label: 'Sistem', ids: ['analytics', 'history', 'system-monitor', 'settings'] },
];

interface SidebarProps {
  activePage: PageId;
  scannedGames: SteamGameRecord[];
  workerOnline: boolean;
  pinging: boolean;
  onSelectPage: (page: PageId) => void;
  onPingWorker: () => void;
  onLaunchQuickGame: (game: SteamGameRecord) => void;
}

export function Sidebar({
  activePage,
  scannedGames,
  workerOnline,
  pinging,
  onSelectPage,
  onPingWorker,
  onLaunchQuickGame,
}: SidebarProps): React.JSX.Element {
  const { sidebarCollapsed, toggleSidebar } = useTheme();

  return (
    <aside
      className={`group/sidebar relative flex shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] transition-all duration-200 ${
        sidebarCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Header Brand */}
      <div className="relative flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4">
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <NgegameLogo className="h-8 w-8 shrink-0" withText={false} />
            <div className="truncate">
              <div className="truncate text-sm font-bold tracking-wide">
                <span className="text-[#009EEB]">Nge</span>
                <span className="text-[#FF9233]">game</span>
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Overthinker Studio
              </div>
            </div>
          </div>
        ) : (
          <NgegameLogo className="mx-auto h-7 w-7 shrink-0" withText={false} />
        )}

        {/* Auto-hide Collapse/Expand Button */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Perluas navigasi' : 'Ciutkan navigasi'}
          title={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          className="absolute -right-3 top-4 z-40 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1 text-[var(--text-secondary)] opacity-0 shadow-md transition-opacity duration-150 hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] focus:opacity-100 group-hover/sidebar:opacity-100"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Menu Navigasi 11 Halaman dengan 4 Kategori */}
      <nav
        className="flex-1 space-y-4 overflow-y-auto p-3"
        aria-label="Navigasi utama"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            {!sidebarCollapsed ? (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {group.label}
              </div>
            ) : (
              <div className="mx-2 my-1 border-t border-[var(--border-subtle)]" />
            )}

            {group.ids.map((id) => {
              const item = NAV_ITEMS.find((n) => n.id === id);
              if (!item) return null;
              const isActive = activePage === item.id;
              const Icon = ICON_MAP[item.id];

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectPage(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-[13px] font-medium transition-all duration-150 ${
                    isActive
                      ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] font-semibold text-[var(--text-primary)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.id === 'library' ? (
                    <SteamLogo className="h-5 w-5 shrink-0" />
                  ) : item.id === 'streaming' ? (
                    <ObsLogo className="h-5 w-5 shrink-0" />
                  ) : (
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 ${
                        isActive ? 'text-[var(--accent-primary)]' : ''
                      }`}
                    />
                  )}
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Quick Actions & Uji Worker di Bawah Sidebar */}
      <div className="shrink-0 space-y-2.5 border-t border-[var(--border-subtle)] p-3">
        {!sidebarCollapsed && (
          <div className="space-y-1.5">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Aksi Cepat
            </div>

            {scannedGames.slice(0, 2).map((game) => (
              <button
                key={game.appId}
                type="button"
                onClick={() => onLaunchQuickGame(game)}
                title={`Jalankan ${game.name}`}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-left text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--surface-hover)]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-[#009EEB]" />
                  <span className="truncate">{game.name}</span>
                </span>
                <Play className="h-3 w-3 shrink-0 text-emerald-500" />
              </button>
            ))}

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onSelectPage('library')}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Pindai</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectPage('streaming')}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                <Radio className="h-3 w-3 text-rose-500" />
                <span>Siaran</span>
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onPingWorker}
          disabled={pinging}
          title="Uji koneksi Python Worker"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
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
          {!sidebarCollapsed && <span>{pinging ? 'Menguji Worker...' : 'Uji Worker'}</span>}
        </button>
      </div>
    </aside>
  );
}
