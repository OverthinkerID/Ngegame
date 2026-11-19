import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Eye,
  History,
  LayoutDashboard,
  Mic,
  Puzzle,
  Settings,
  type LucideIcon,
} from 'lucide-react';
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

interface SidebarProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
}

export function Sidebar({
  activePage,
  onSelectPage,
}: SidebarProps): React.JSX.Element {
  const { sidebarCollapsed, toggleSidebar } = useTheme();

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] transition-all duration-200 ${
        sidebarCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Header Brand */}
      <div className="app-drag-region flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4">
        {!sidebarCollapsed ? (
          <div className="app-no-drag flex items-center gap-2.5 overflow-hidden">
            <NgegameLogo className="h-8 w-8 shrink-0" withText={false} />
            <div className="truncate">
              <div className="truncate text-sm font-bold tracking-wide">
                <span className="text-[#009EEB]">NGE</span>
                <span className="text-[#FF9233]">GAME</span>
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Overthinker Studio
              </div>
            </div>
          </div>
        ) : (
          <NgegameLogo className="app-no-drag mx-auto h-7 w-7 shrink-0" withText={false} />
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Perluas navigasi' : 'Ciutkan navigasi'}
          title={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          className="app-no-drag rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Menu Navigasi Lengkap 11 Halaman */}
      <nav
        className="flex flex-1 flex-col justify-between overflow-y-auto p-3"
        aria-label="Navigasi utama"
      >
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            const Icon = ICON_MAP[item.id];

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectPage(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center gap-3.5 rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-medium transition-all duration-150 ${
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
      </nav>
    </aside>
  );
}
