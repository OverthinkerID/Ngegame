import { useCallback, useEffect, useState } from 'react';
import { Camera, Eye, Layers, Play, RefreshCw, Square } from 'lucide-react';
import type {
  DetectedWindow,
  VisionAnalysisResult,
  VisionMonitorStatus,
} from '@ngegame/shared';
import { AppSelect } from '../components/ui/AppSelect.js';
import { EmptyState, ErrorState } from '../components/ui/FeedbackComponents.js';
import { Panel } from '../components/ui/Panel.js';
import { StatCard } from '../components/ui/StatCard.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { BACKEND_WS_URL, backendService } from '../services/backendService.js';

export function VisionMonitorPage(): React.JSX.Element {
  const [status, setStatus] = useState<VisionMonitorStatus | null>(null);
  const [windows, setWindows] = useState<DetectedWindow[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<string>('Primary Display');
  const [latestFrame, setLatestFrame] = useState<VisionAnalysisResult | null>(null);
  const [history, setHistory] = useState<VisionAnalysisResult[]>([]);
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInitial = useCallback(async () => {
    setError(null);
    try {
      const [visionStatus, winList, hist] = await Promise.all([
        backendService.getVisionStatus(),
        backendService.listVisionWindows(),
        backendService.getVisionHistory(10),
      ]);
      setStatus(visionStatus);
      setWindows(winList);
      setHistory(hist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat status Vision Engine.');
    }
  }, []);

  useEffect(() => {
    void loadInitial();

    const ws = new WebSocket(BACKEND_WS_URL);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          type?: string;
          payload?: VisionAnalysisResult;
        };
        if (msg.type === 'vision:frame' && msg.payload) {
          const frame = msg.payload;
          setLatestFrame(frame);
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  samplingIntervalMs: frame.samplingIntervalMs,
                  lastCaptureAt: frame.createdAt,
                  lastProcessingMs: frame.processingMs,
                  framesCaptured: prev.framesCaptured + 1,
                  capabilities: frame.capabilities,
                }
              : prev,
          );
          setHistory((prev) => [frame, ...prev].slice(0, 10));
        }
      } catch {
        // abaikan pesan non-JSON
      }
    };

    return () => {
      ws.close();
    };
  }, [loadInitial]);

  const handleCaptureOnce = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await backendService.captureVisionOnce({
        windowTitle: selectedWindow,
      });
      setLatestFrame(result);
      await loadInitial();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengambil tangkapan layar.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMonitor = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const next = status?.running
        ? await backendService.stopVisionMonitor()
        : await backendService.startVisionMonitor({
            windowTitle: selectedWindow,
            baseIntervalMs: 1000,
          });
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status monitor.');
    } finally {
      setLoading(false);
    }
  };

  const caps = latestFrame?.capabilities ?? status?.capabilities;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Monitor Visi &amp; Pengambilan Layar
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          Pantau tangkapan layar game secara langsung, aktifkan overlay deteksi HUD, dan periksa hasil OCR.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Status Monitor"
          value={status?.running ? 'Siaran Langsung' : 'Siaga'}
          meta={`Interval adaptif: ${status?.samplingIntervalMs ?? 1000} ms`}
          badge={
            <StatusBadge
              variant={status?.running ? 'healthy' : 'neutral'}
              label={status?.running ? 'Aktif' : 'Siaga'}
              pulse={Boolean(status?.running)}
            />
          }
        />
        <StatCard
          label="Backend Pengambilan"
          value={caps?.captureBackend ?? 'Mendeteksi...'}
          meta={`Platform: ${caps?.platform ?? '-'}`}
        />
        <StatCard
          label="OpenCV &amp; OCR"
          value={
            caps
              ? `CV: ${caps.opencvAvailable ? 'Aktif' : 'Cadangan'} • OCR: ${caps.ocrAvailable ? 'Aktif' : 'Nonaktif'}`
              : 'Menunggu'
          }
          meta="Gunakan requirements.txt untuk akselerasi penuh"
        />
        <StatCard
          label="Latensi &amp; Gerakan"
          value={
            latestFrame
              ? `${latestFrame.processingMs} ms • ${(latestFrame.motionScore * 100).toFixed(1)}%`
              : `${status?.lastProcessingMs ?? 0} ms`
          }
          meta={`Adegan: ${latestFrame?.sceneLabel ?? 'Belum dianalisis'}`}
        />
      </section>

      {error && <ErrorState message={error} onRetry={() => void loadInitial()} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          title="Pratinjau Tangkapan Layar"
          subtitle="Frame real-time dari Python Vision Worker melalui WebSocket."
          className="lg:col-span-2"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <AppSelect
                value={selectedWindow}
                onChange={setSelectedWindow}
                options={[
                  { value: 'Primary Display', label: 'Layar Utama (Primary)' },
                  ...windows.map((win) => ({
                    value: `${win.owner} — ${win.title}`,
                    label: `${win.owner}: ${win.title}`,
                  })),
                ]}
                className="w-48"
              />

              <button
                type="button"
                onClick={() => setOverlayEnabled((prev) => !prev)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                  overlayEnabled
                    ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] text-[var(--text-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                {overlayEnabled ? 'Overlay Aktif' : 'Overlay Nonaktif'}
              </button>

              <button
                type="button"
                onClick={() => void loadInitial()}
                aria-label="Muat ulang"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleCaptureOnce()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5" />
                Ambil 1 Frame
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleToggleMonitor()}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50 ${
                  status?.running
                    ? 'border-rose-500/40 bg-rose-500/15 text-rose-500 hover:bg-rose-500/25'
                    : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25'
                }`}
              >
                {status?.running ? (
                  <>
                    <Square className="h-3.5 w-3.5" />
                    Hentikan
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Mulai Live
                  </>
                )}
              </button>
            </div>
          }
        >
          {latestFrame?.imageBase64 ? (
            <div className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-black">
              <img
                src={
                  latestFrame.imageBase64.startsWith('data:')
                    ? latestFrame.imageBase64
                    : `data:image/png;base64,${latestFrame.imageBase64}`
                }
                alt={`Pratinjau ${latestFrame.windowTitle}`}
                className="aspect-video w-full object-contain"
              />
              {overlayEnabled && (
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 backdrop-blur-xs">
                      Adegan: {latestFrame.sceneLabel}
                    </span>
                    <span className="rounded-md bg-black/70 px-2.5 py-1 tabular-nums text-[11px] font-medium text-sky-400 backdrop-blur-xs">
                      {latestFrame.processingMs} ms • Gerakan {(latestFrame.motionScore * 100).toFixed(1)}%
                    </span>
                  </div>
                  {latestFrame.hud.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {latestFrame.hud.map((h) => (
                        <span
                          key={h.region}
                          className="rounded border border-violet-400/50 bg-black/75 px-2 py-0.5 text-[10px] text-slate-100"
                        >
                          {h.region}: {h.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2 text-[11px] text-[var(--text-secondary)]">
                <span>
                  {latestFrame.windowTitle} ({latestFrame.width}×{latestFrame.height})
                </span>
                <span className="tabular-nums">
                  Kecerahan {(latestFrame.brightness * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Eye className="h-5 w-5" />}
              title="Belum Ada Frame yang Diambil"
              description='Tekan "Ambil 1 Frame" atau "Mulai Live" untuk mengambil tangkapan layar aktif.'
            />
          )}
        </Panel>

        <Panel title="Hasil Analisis Visi" subtitle="Klasifikasi adegan, HUD, objek, dan OCR.">
          <div className="space-y-3 text-xs">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Klasifikasi Adegan
              </div>
              <div className="mt-1 font-semibold text-[var(--accent-primary)]">
                {latestFrame?.sceneLabel ?? 'Menunggu frame'}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Wilayah HUD ({latestFrame?.hud.length ?? 0})
              </div>
              <div className="mt-1.5 space-y-1">
                {latestFrame?.hud.length ? (
                  latestFrame.hud.map((h) => (
                    <div key={h.region} className="flex justify-between text-[11px]">
                      <span className="text-[var(--text-secondary)]">{h.region}</span>
                      <span className="text-[var(--text-primary)]">{h.value}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-[var(--text-muted)]">Belum ada data HUD</span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Teks OCR &amp; Kejadian
              </div>
              <div className="mt-1 text-[11px] text-[var(--text-primary)]">
                {latestFrame?.ocrText ? latestFrame.ocrText : 'OCR belum aktif / tidak ada teks'}
              </div>
              {latestFrame?.events.map((ev, idx) => (
                <div key={`${ev.type}-${idx}`} className="mt-1 text-[11px] text-amber-500">
                  [{ev.type}] {ev.description}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Riwayat Hasil Visi (SQLite)"
        subtitle="Metadata analisis frame yang tersimpan di basis data lokal."
      >
        <div className="max-h-52 space-y-1.5 overflow-y-auto font-mono text-xs">
          {history.length === 0 ? (
            <div className="rounded-lg bg-[var(--bg-secondary)] p-3 text-[var(--text-secondary)]">
              Belum ada riwayat analisis tersimpan.
            </div>
          ) : (
            history.map((item, idx) => (
              <div
                key={`${item.id ?? idx}-${item.createdAt}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-secondary)]"
              >
                <span>
                  [{item.createdAt}] {item.windowTitle} ({item.width}×{item.height})
                </span>
                <span className="text-[var(--accent-primary)]">
                  {item.sceneLabel} • {item.processingMs}ms • interval {item.samplingIntervalMs}ms
                </span>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
