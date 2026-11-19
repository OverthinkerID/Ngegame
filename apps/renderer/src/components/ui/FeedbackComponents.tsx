import { AlertTriangle, CheckCircle2, Inbox, Loader2, X, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element | null {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
              danger
                ? 'border-rose-500/35 bg-rose-500/15 text-rose-500'
                : 'border-[var(--border-subtle)] bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 ${
              danger ? 'bg-rose-600' : 'bg-[var(--accent-primary)]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-6 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-muted)]">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <div className="mt-3 text-xs font-semibold text-[var(--text-primary)]">{title}</div>
      <p className="mt-1 max-w-sm text-xs text-[var(--text-secondary)]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Memuat data sistem...' }: { label?: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3 text-xs text-[var(--text-secondary)]">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-primary)]" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-xs text-rose-500">
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-rose-500/40 px-2.5 py-1 text-[11px] font-semibold hover:bg-rose-500/15"
        >
          Coba Lagi
        </button>
      )}
    </div>
  );
}

export function ToastNotification({
  message,
  type = 'info',
  onClose,
}: {
  message: string | null;
  type?: 'info' | 'success' | 'error';
  onClose: () => void;
}): React.JSX.Element | null {
  if (!message) return null;

  const tone =
    type === 'success'
      ? 'border-emerald-500/40 bg-[var(--bg-elevated)] text-emerald-500'
      : type === 'error'
        ? 'border-rose-500/40 bg-[var(--bg-elevated)] text-rose-500'
        : 'border-[var(--accent-primary)]/40 bg-[var(--bg-elevated)] text-[var(--text-primary)]';

  return (
    <div className="fixed bottom-12 right-5 z-50 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-xl">
      <div className={`flex items-center gap-2 ${tone}`}>
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="text-[var(--text-primary)]">{message}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup notifikasi"
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface ChartPoint {
  label: string;
  cpu: number;
  ram: number;
}

export function PerformanceChart({ points }: { points: ChartPoint[] }): React.JSX.Element {
  if (points.length === 0) {
    return (
      <EmptyState
        title="Belum Ada Sampel Performa"
        description="Grafik CPU dan RAM akan tampil otomatis setelah backend mengumpulkan sampel."
      />
    );
  }

  const width = 560;
  const height = 160;
  const padX = 12;
  const padY = 14;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const buildPath = (values: number[]): string =>
    values
      .map((v, i) => {
        const x = padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
        const clamped = Math.max(0, Math.min(100, v));
        const y = padY + innerH - (clamped / 100) * innerH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const cpuPath = buildPath(points.map((p) => p.cpu));
  const ramPath = buildPath(points.map((p) => p.ram));

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#38BDF8]" />
            CPU (%)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#8B5CF6]" />
            RAM (%)
          </span>
        </div>
        <span className="tabular-nums text-[var(--text-muted)]">{points.length} sampel</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full overflow-visible">
        {[25, 50, 75].map((pct) => {
          const y = padY + innerH - (pct / 100) * innerH;
          return (
            <line
              key={pct}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="var(--border-subtle)"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          );
        })}
        <path d={ramPath} fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
        <path d={cpuPath} fill="none" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
