import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: PanelProps): React.JSX.Element {
  return (
    <section className={`studio-card rounded-xl p-5 ${className}`}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{subtitle}</p>
          )}
        </div>
        {action && <div>{action}</div>}
      </header>
      <div>{children}</div>
    </section>
  );
}
