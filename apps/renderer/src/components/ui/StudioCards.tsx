import { Info, Play, Square } from 'lucide-react';
import type { SteamGameRecord } from '@ngegame/shared';
import { StatusBadge } from './StatusBadge.js';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export function GameCard({
  game,
  onDetail,
  onLaunch,
  onStop,
}: {
  game: SteamGameRecord;
  onDetail: (game: SteamGameRecord) => void;
  onLaunch: (game: SteamGameRecord) => void;
  onStop: (game: SteamGameRecord) => void;
}): React.JSX.Element {
  return (
    <article className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 transition-colors hover:border-[var(--accent-primary)]/40">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{game.name}</h3>
            <p className="mt-0.5 tabular-nums text-xs text-[var(--text-secondary)]">
              AppID {game.appId} • {formatBytes(game.sizeOnDiskBytes)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {game.isRunning && (
              <StatusBadge
                variant="healthy"
                label={`Berjalan${game.pid ? ` (${game.pid})` : ''}`}
                pulse={true}
              />
            )}
            <StatusBadge
              variant={
                game.compatibility === 'verified'
                  ? 'healthy'
                  : game.compatibility === 'experimental'
                    ? 'warning'
                    : game.compatibility === 'unsupported'
                      ? 'offline'
                      : 'neutral'
              }
              label={game.compatibility}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">{game.compatibilityReason}</p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
        <button
          type="button"
          onClick={() => onDetail(game)}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <Info className="h-3.5 w-3.5" /> Detail
        </button>

        {game.isRunning ? (
          <button
            type="button"
            onClick={() => onStop(game)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 text-xs font-medium text-rose-500 hover:bg-rose-500/25"
          >
            <Square className="h-3 w-3" /> Hentikan
          </button>
        ) : (
          <button
            type="button"
            disabled={game.compatibility === 'unsupported'}
            onClick={() => onLaunch(game)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-medium text-emerald-500 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3 w-3" /> Jalankan
          </button>
        )}
      </div>
    </article>
  );
}

export interface TimelineEntry {
  id: string;
  title: string;
  meta: string;
  badgeLabel?: string;
  badgeVariant?: 'healthy' | 'warning' | 'offline' | 'info' | 'neutral';
}

export function ActivityTimeline({ items }: { items: TimelineEntry[] }): React.JSX.Element {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2.5 text-xs"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-[var(--text-primary)]">{item.title}</div>
            <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{item.meta}</div>
          </div>
          {item.badgeLabel && (
            <StatusBadge variant={item.badgeVariant ?? 'info'} label={item.badgeLabel} />
          )}
        </div>
      ))}
    </div>
  );
}
