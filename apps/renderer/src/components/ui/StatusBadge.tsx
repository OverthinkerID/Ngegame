import type { ComponentState } from '@ngegame/shared';

type BadgeVariant = ComponentState | 'info' | 'warning' | 'neutral';

interface StatusBadgeProps {
  variant: BadgeVariant;
  label?: string;
  pulse?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, { dot: string; box: string }> = {
  healthy: {
    dot: 'bg-emerald-500',
    box: 'bg-emerald-500/12 text-emerald-500 border-emerald-500/30',
  },
  degraded: {
    dot: 'bg-amber-500',
    box: 'bg-amber-500/12 text-amber-500 border-amber-500/30',
  },
  offline: {
    dot: 'bg-rose-500',
    box: 'bg-rose-500/12 text-rose-500 border-rose-500/30',
  },
  warning: {
    dot: 'bg-amber-500',
    box: 'bg-amber-500/12 text-amber-500 border-amber-500/30',
  },
  info: {
    dot: 'bg-sky-500',
    box: 'bg-sky-500/12 text-sky-500 border-sky-500/30',
  },
  neutral: {
    dot: 'bg-slate-400',
    box: 'bg-slate-500/12 text-[var(--text-secondary)] border-[var(--border-subtle)]',
  },
};

export function StatusBadge({
  variant,
  label,
  pulse = false,
}: StatusBadgeProps): React.JSX.Element {
  const style = VARIANT_STYLES[variant];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${style.box}`}
    >
      <span className="relative flex h-2 w-2 items-center justify-center">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${style.dot}`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${style.dot}`} />
      </span>
      {label ?? variant}
    </span>
  );
}
