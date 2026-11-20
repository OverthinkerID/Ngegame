import { useCallback, useEffect, useState } from 'react';
import { Camera, ExternalLink, KeyRound, Mic, Play, RefreshCw, Square, Volume2, VolumeX } from 'lucide-react';
import type {
  StreamingStatusResponse,
  StreamPlatform,
  VoiceServiceStatus,
} from '@ngegame/shared';
import { AppSelect } from '../components/ui/AppSelect.js';
import { ObsLogo, TwitchLogo, YouTubeLogo } from '../components/ui/BrandIcons.js';
import { EmptyState, ErrorState } from '../components/ui/FeedbackComponents.js';
import { Panel } from '../components/ui/Panel.js';
import { StatCard } from '../components/ui/StatCard.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { backendService } from '../services/backendService.js';
import { GUIDE_URLS, parseFriendlyError } from '../utils/guideHelper.js';

interface LiveStreamingPageProps {
  onNotify?: (
    message: string,
    type?: 'info' | 'success' | 'error',
    guideUrl?: string,
    guideLabel?: string,
  ) => void;
}

export function LiveStreamingPage({ onNotify }: LiveStreamingPageProps): React.JSX.Element {
  const [status, setStatus] = useState<StreamingStatusResponse | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceServiceStatus | null>(null);
  const [obsUrl, setObsUrl] = useState('ws://localhost:4455');
  const [obsPassword, setObsPassword] = useState('');
  const [ytKey, setYtKey] = useState('');
  const [ytVisibility, setYtVisibility] = useState<'private' | 'unlisted' | 'public'>('unlisted');
  const [twKey, setTwKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportError = (err: unknown, fallback: string): void => {
    const friendly = parseFriendlyError(err, fallback);
    setError(friendly.message);
    onNotify?.(friendly.message, 'error', friendly.guideUrl, friendly.guideLabel);
  };

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const [data, vStatus] = await Promise.all([
        backendService.getStreamingStatus(),
        backendService.getVoiceStatus().catch(() => null),
      ]);
      setStatus(data);
      if (vStatus) setVoiceStatus(vStatus);
    } catch (err) {
      const friendly = parseFriendlyError(err, 'Gagal memuat status OBS & Siaran.');
      setError(friendly.message);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleSaveKey = async (platform: StreamPlatform): Promise<void> => {
    const key = platform === 'youtube' ? ytKey : twKey;
    if (!key.trim()) return;
    setError(null);
    try {
      const updated = await backendService.saveStreamCredential({
        platform,
        streamKey: key,
        visibilityMode: platform === 'youtube' ? ytVisibility : 'private',
        enabled: true,
      });
      setStatus(updated);
      if (platform === 'youtube') setYtKey('');
      else setTwKey('');
      onNotify?.(`Kunci siaran ${platform === 'youtube' ? 'YouTube' : 'Twitch'} tersimpan aman.`, 'success');
    } catch (err) {
      reportError(err, 'Gagal menyimpan kunci siaran.');
    }
  };

  const handleConnectObs = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const updated = status?.obsConnected
        ? await backendService.disconnectObs()
        : await backendService.connectObs({ url: obsUrl, password: obsPassword || undefined });
      setStatus(updated);
      onNotify?.(
        updated.obsConnected ? 'OBS Studio terhubung.' : 'Koneksi OBS Studio diputus.',
        updated.obsConnected ? 'success' : 'info',
      );
    } catch (err) {
      reportError(err, 'Gagal menghubungkan OBS Studio.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Studio Siaran OBS &amp; Multistream
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Kendalikan OBS WebSocket v5, pratinjau adegan, pencampur audio, dan kunci siaran terenkripsi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void backendService.openExternalUrl(GUIDE_URLS.obs)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Panduan Setup OBS &amp; Kunci Siaran
        </button>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="OBS WebSocket"
          value={status?.obsConnected ? 'Terhubung' : 'Terputus'}
          meta={
            status?.currentScene
              ? `Adegan: ${status.currentScene}`
              : status?.obsUrl ?? 'ws://localhost:4455'
          }
          icon={<ObsLogo className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={status?.obsConnected ? 'healthy' : 'warning'}
              label={status?.obsConnected ? 'Aktif' : 'Nonaktif'}
            />
          }
        />
        <StatCard
          label="Status Siaran"
          value={status?.health.streaming ? 'MENGUDARA' : 'Siaga'}
          meta={`Durasi: ${status?.health.durationSeconds ?? 0} dtk`}
          badge={
            <StatusBadge
              variant={status?.health.streaming ? 'healthy' : 'neutral'}
              label={status?.health.streaming ? 'Siaran' : 'Siaga'}
              pulse={Boolean(status?.health.streaming)}
            />
          }
        />
        <StatCard
          label="Suara AI (VoxCPM 2.0)"
          value={voiceStatus?.voxcpmAvailable ? 'Terhubung' : 'Cadangan Lokal'}
          meta={`${status?.health.bitrateKbps ?? 0} kbps • ${status?.health.fps ?? 0} FPS`}
          icon={<Mic className="h-4 w-4" />}
        />
        <StatCard
          label="Frame Terlewat"
          value={`${status?.health.droppedFrames ?? 0} (${status?.health.droppedPercent ?? 0}%)`}
          meta="Pemantauan kesehatan siaran langsung"
        />
      </section>

      {error && (
        <ErrorState
          message={error}
          guideUrl={GUIDE_URLS.obs}
          guideLabel="Panduan OBS & Siaran"
          onRetry={() => void loadStatus()}
        />
      )}

      {status?.lastError && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-500">
          {status.lastError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel
          title="Koneksi OBS Studio &amp; Kendali Siaran"
          subtitle="Gunakan mode siaran uji (privat atau tidak terdaftar) sebelum siaran publik."
          className="lg:col-span-8"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadStatus()}
                aria-label="Muat ulang"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  void backendService
                    .captureObsPreview()
                    .then(setStatus)
                    .catch((e) => reportError(e, 'Gagal mengambil pratinjau OBS.'))
                }
                disabled={!status?.obsConnected}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
              >
                <Camera className="h-3.5 w-3.5" /> Pratinjau
              </button>
              {status?.health.streaming ? (
                <button
                  type="button"
                  onClick={() =>
                    void backendService
                      .stopStreaming()
                      .then(setStatus)
                      .catch((e) => reportError(e, 'Gagal menghentikan siaran.'))
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 text-xs font-medium text-rose-500"
                >
                  <Square className="h-3.5 w-3.5" /> Hentikan Siaran
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    void backendService
                      .startStreaming()
                      .then((updated) => {
                        setStatus(updated);
                        onNotify?.('Siaran langsung dimulai.', 'success');
                      })
                      .catch((e) => reportError(e, 'Gagal memulai siaran.'))
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-500"
                >
                  <Play className="h-3.5 w-3.5" /> Mulai Siaran
                </button>
              )}
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="text"
              value={obsUrl}
              onChange={(e) => setObsUrl(e.target.value)}
              placeholder="ws://localhost:4455"
              className="studio-input h-9 rounded-lg px-3 text-xs"
            />
            <input
              type="password"
              value={obsPassword}
              onChange={(e) => setObsPassword(e.target.value)}
              placeholder="Kata sandi OBS WebSocket (opsional)"
              className="studio-input h-9 rounded-lg px-3 text-xs"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleConnectObs()}
              className="h-9 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:opacity-90 disabled:opacity-50"
            >
              {status?.obsConnected ? 'Putuskan OBS' : 'Hubungkan OBS WebSocket'}
            </button>
          </div>

          {status?.obsConnected && (
            <div className="mt-4 grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
              <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                <div className="font-semibold text-[var(--text-primary)]">
                  Adegan ({status.scenes.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {status.scenes.map((sc) => (
                    <button
                      key={sc.sceneName}
                      type="button"
                      onClick={() => void backendService.setObsScene(sc.sceneName).then(setStatus)}
                      className={`rounded-lg border px-2.5 py-1 ${
                        sc.isCurrent
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)] text-[var(--text-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {sc.sceneName}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                <div className="font-semibold text-[var(--text-primary)]">
                  Pencampur Audio ({status.audioInputs.length})
                </div>
                {status.audioInputs.map((inp) => (
                  <div key={inp.inputName} className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">{inp.inputName}</span>
                    <button
                      type="button"
                      onClick={() =>
                        void backendService
                          .setObsAudioMute(inp.inputName, !inp.muted)
                          .then(setStatus)
                      }
                      className="inline-flex items-center gap-1 rounded border border-[var(--border-subtle)] px-2 py-0.5 text-[var(--text-primary)]"
                    >
                      {inp.muted ? (
                        <VolumeX className="h-3 w-3 text-rose-500" />
                      ) : (
                        <Volume2 className="h-3 w-3 text-emerald-500" />
                      )}
                      {inp.muted ? 'Dibisukan' : 'Aktif'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Pratinjau Output OBS"
          subtitle="Cuplikan langsung adegan aktif OBS Studio."
          className="lg:col-span-4"
        >
          {status?.previewImageBase64 ? (
            <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-black">
              <img
                src={
                  status.previewImageBase64.startsWith('data:')
                    ? status.previewImageBase64
                    : `data:image/png;base64,${status.previewImageBase64}`
                }
                alt="Pratinjau OBS Studio"
                className="aspect-video w-full object-contain"
              />
            </div>
          ) : (
            <EmptyState
              icon={<ObsLogo className="h-6 w-6" />}
              title="Pratinjau Belum Tersedia"
              description="Hubungkan OBS WebSocket lalu tekan Pratinjau untuk mengambil gambar adegan."
            />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Panel
          title="YouTube Live (Manajer Kredensial)"
          subtitle="Kunci siaran disimpan aman di Keychain / Credential Manager sistem operasi."
          action={<YouTubeLogo className="h-4 w-6" />}
        >
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
              <span className="text-[var(--text-secondary)]">Status Kunci</span>
              <span className="font-mono text-[var(--text-primary)]">
                {status?.targets.find((t) => t.platform === 'youtube')?.maskedKey ?? 'Belum diatur'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="password"
                value={ytKey}
                onChange={(e) => setYtKey(e.target.value)}
                placeholder="Masukkan kunci siaran YouTube..."
                className="studio-input h-9 min-w-44 flex-1 rounded-lg px-3 text-xs"
              />
              <AppSelect
                value={ytVisibility}
                onChange={(v) => setYtVisibility(v as 'private' | 'unlisted' | 'public')}
                options={[
                  { value: 'unlisted', label: 'Tidak Terdaftar (Uji)' },
                  { value: 'private', label: 'Privat (Uji)' },
                  { value: 'public', label: 'Publik' },
                ]}
                className="w-44"
              />
              <button
                type="button"
                onClick={() => void handleSaveKey('youtube')}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)]"
              >
                <KeyRound className="h-3.5 w-3.5" /> Simpan
              </button>
            </div>
          </div>
        </Panel>

        <Panel
          title="Twitch (Manajer Kredensial)"
          subtitle="Target multistream kedua dengan penyimpanan kunci terenkripsi."
          action={<TwitchLogo className="h-5 w-5" />}
        >
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
              <span className="text-[var(--text-secondary)]">Status Kunci</span>
              <span className="font-mono text-[var(--text-primary)]">
                {status?.targets.find((t) => t.platform === 'twitch')?.maskedKey ?? 'Belum diatur'}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={twKey}
                onChange={(e) => setTwKey(e.target.value)}
                placeholder="Masukkan kunci siaran Twitch..."
                className="studio-input h-9 flex-1 rounded-lg px-3 text-xs"
              />
              <button
                type="button"
                onClick={() => void handleSaveKey('twitch')}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)]"
              >
                <KeyRound className="h-3.5 w-3.5" /> Simpan
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
