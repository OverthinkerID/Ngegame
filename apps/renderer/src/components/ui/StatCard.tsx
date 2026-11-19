import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  meta?: string;
  badge?: ReactNode;
  icon?: ReactNode;
}

export function StatCard({
  label,
  value,
  meta,
  badge,
  icon,
}: StatCardProps): React.JSX.Element {
  return (
    <article className="studio-card rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
        {icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="tabular-nums text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          {value}
        </span>
        {badge}
      </div>
      {meta && (
        <p className="mt-1.5 truncate text-xs text-[var(--text-secondary)]">{meta}</p>
      )}
    </article>
  );
}
