import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Camera,
  Check,
  Disc,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Layers,
  Mic,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  StreamAnalyticsSampleItem,
  StreamingStatusResponse,
  StreamPlatform,
  StreamSessionHistoryItem,
  VoiceEmotion,
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

type StreamingTab =
  | 'dashboard'
  | 'obs'
  | 'scenes'
  | 'mixer'
  | 'health'
  | 'recording'
  | 'youtube'
  | 'twitch'
  | 'assistant'
  | 'history';

const STREAMING_TABS: Array<{ id: StreamingTab; label: string }> = [
  { id: 'dashboard', label: 'Dasbor Siaran' },
  { id: 'obs', label: 'Koneksi OBS' },
  { id: 'scenes', label: 'Manajer Adegan' },
  { id: 'mixer', label: 'Pencampur Audio' },
  { id: 'health', label: 'Kesehatan Stream' },
  { id: 'recording', label: 'Manajer Rekaman' },
  { id: 'youtube', label: 'YouTube Studio' },
  { id: 'twitch', label: 'Twitch Studio' },
  { id: 'assistant', label: 'Asisten AI & Narasi' },
  { id: 'history', label: 'Riwayat & Keamanan' },
];

interface LiveStreamingPageProps {
  onNotify?: (
    message: string,
    type?: 'info' | 'success' | 'error',
    guideUrl?: string,
    guideLabel?: string,
  ) => void;
}

export function LiveStreamingPage({ onNotify }: LiveStreamingPageProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<StreamingTab>('dashboard');
  const [status, setStatus] = useState<StreamingStatusResponse | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceServiceStatus | null>(null);
  const [analytics, setAnalytics] = useState<{
    samples: StreamAnalyticsSampleItem[];
    sessions: StreamSessionHistoryItem[];
  }>({ samples: [], sessions: [] });

  const [obsUrl, setObsUrl] = useState('ws://localhost:4455');
  const [obsPassword, setObsPassword] = useState('');
  const [ytKey, setYtKey] = useState('');
  const [ytVisibility, setYtVisibility] = useState<'private' | 'unlisted' | 'public'>('unlisted');
  const [ytClientId, setYtClientId] = useState('');
  const [ytAuthEndpoint, setYtAuthEndpoint] = useState('');
  const [twKey, setTwKey] = useState('');
  const [twClientId, setTwClientId] = useState('');
  const [twAuthEndpoint, setTwAuthEndpoint] = useState('');

  const [narrationText, setNarrationText] = useState('');
  const [narrationEmotion, setNarrationEmotion] = useState<VoiceEmotion>('neutral');
  const [assistantCmd, setAssistantCmd] = useState('');
  const [assistantReply, setAssistantReply] = useState<string | null>(null);

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
      const [data, vStatus, hist] = await Promise.all([
        backendService.getStreamingStatus(),
        backendService.getVoiceStatus().catch(() => null),
        backendService.getStreamingAnalytics().catch(() => ({ samples: [], sessions: [] })),
      ]);
      setStatus(data);
      if (vStatus) setVoiceStatus(vStatus);
      setAnalytics(hist);
    } catch (err) {
      const friendly = parseFriendlyError(err, 'Gagal memuat status Studio Siaran.');
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
      onNotify?.(`Kunci siaran ${platform === 'youtube' ? 'YouTube' : 'Twitch'} tersimpan aman di Vault.`, 'success');
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
      setObsPassword('');
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

  const handleEmergencyStop = async (): Promise<void> => {
    try {
      const updated = await backendService.emergencyStopStreaming();
      setStatus(updated);
      onNotify?.('Emergency Stop siaran & narasi diaktifkan.', 'info');
    } catch (err) {
      reportError(err, 'Gagal menjalankan Emergency Stop.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Studio Siaran OBS, YouTube &amp; Twitch
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Pusat kendali siaran nyata OBS WebSocket v5, YouTube Live, Twitch, narasi AI Indonesia, dan analitik.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadStatus()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Muat Ulang
          </button>
          <button
            type="button"
            onClick={() => void handleEmergencyStop()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-500/15 px-3 text-xs font-semibold text-rose-500 hover:bg-rose-500/25"
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Emergency Stop Siaran
          </button>
          <button
            type="button"
            onClick={() => void backendService.openExternalUrl(GUIDE_URLS.obs)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Panduan OBS
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="OBS WebSocket"
          value={status?.obsConnected ? 'Terhubung' : status?.obsReconnecting ? 'Menyambung...' : 'Terputus'}
          meta={status?.currentScene ? `Adegan: ${status.currentScene}` : status?.obsUrl ?? 'ws://localhost:4455'}
          icon={<ObsLogo className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={status?.obsConnected ? 'healthy' : 'warning'}
              label={status?.obsConnected ? 'Aktif' : 'Nonaktif'}
            />
          }
        />
        <StatCard
          label="Status Siaran & Rekam"
          value={status?.health.streaming ? 'MENGUDARA' : status?.recording.recording ? 'MEREKAM' : 'Siaga'}
          meta={`Bitrate: ${status?.health.bitrateKbps ?? 0} kbps • ${status?.health.fps ?? 0} FPS`}
          icon={<Radio className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={status?.health.streaming ? 'healthy' : 'neutral'}
              label={status?.health.streaming ? 'Live' : 'Siaga'}
              pulse={Boolean(status?.health.streaming)}
            />
          }
        />
        <StatCard
          label="Suara AI & Routing OBS"
          value={voiceStatus?.voxcpmAvailable ? 'VoxCPM 2.0' : 'Cadangan Lokal'}
          meta={`Antrean: ${status?.narration.queue.length ?? 0} • ${status?.narration.speaking ? 'Berbicara' : 'Siaga'}`}
          icon={<Mic className="h-4 w-4" />}
        />
        <StatCard
          label="Keamanan Vault"
          value={status?.vault.vaultBackend === 'os-credential-manager' ? 'OS Keychain' : 'AES-256-GCM'}
          meta={`YT: ${status?.vault.youtubeStreamKeyMasked ?? 'Belum'} • TW: ${status?.vault.twitchStreamKeyMasked ?? 'Belum'}`}
          icon={<KeyRound className="h-4 w-4" />}
        />
      </section>

      <nav className="flex flex-wrap gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1.5">
        {STREAMING_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-[var(--accent-primary-soft)] text-[var(--text-primary)] ring-1 ring-[var(--accent-primary)]/40'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

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

      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Panel
            title="Kontrol Utama Multistream"
            subtitle="Gunakan mode Privat atau Tidak Terdaftar untuk pengujian sebelum siaran publik."
            className="lg:col-span-7"
            action={
              status?.health.streaming ? (
                <button
                  type="button"
                  onClick={() => void backendService.stopStreaming().then(setStatus)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 text-xs font-semibold text-rose-500"
                >
                  <Square className="h-3.5 w-3.5" /> Hentikan Siaran
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    void backendService
                      .startStreaming()
                      .then((u) => {
                        setStatus(u);
                        onNotify?.('Siaran uji dimulai.', 'success');
                      })
                      .catch((e) => reportError(e, 'Gagal memulai siaran.'))
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-500"
                >
                  <Play className="h-3.5 w-3.5" /> Mulai Siaran Uji
                </button>
              )
            }
          >
            <div className="space-y-3 text-xs">
              {(status?.targets ?? []).map((t) => (
                <div
                  key={t.platform}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3"
                >
                  <div className="flex items-center gap-2">
                    {t.platform === 'youtube' ? <YouTubeLogo className="h-4 w-5" /> : <TwitchLogo className="h-4 w-4" />}
                    <div>
                      <div className="font-semibold capitalize text-[var(--text-primary)]">{t.platform}</div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {t.rtmpUrl} • Visibilitas: {t.visibilityMode}
                      </div>
                    </div>
                  </div>
                  <StatusBadge
                    variant={t.status === 'streaming' ? 'healthy' : t.status === 'ready' ? 'info' : 'warning'}
                    label={t.status}
                  />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Pratinjau Output OBS" subtitle="Tangkapan langsung adegan aktif OBS." className="lg:col-span-5">
            {status?.previewImageBase64 ? (
              <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-black">
                <img
                  src={
                    status.previewImageBase64.startsWith('data:')
                      ? status.previewImageBase64
                      : `data:image/png;base64,${status.previewImageBase64}`
                  }
                  alt="Pratinjau OBS"
                  className="aspect-video w-full object-contain"
                />
              </div>
            ) : (
              <EmptyState
                icon={<Camera className="h-6 w-6" />}
                title="Pratinjau Belum Tersedia"
                description="Hubungkan OBS WebSocket di tab Koneksi OBS lalu tekan Ambil Pratinjau."
              />
            )}
          </Panel>
        </div>
      )}

      {activeTab === 'obs' && (
        <Panel
          title="Koneksi & Deteksi OBS Studio WebSocket v5"
          subtitle="Deteksi proses OBS lokal, sambungkan dengan autentikasi SHA-256, dan pantau reconnect."
          action={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void backendService.detectObs().then(() => loadStatus())}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)]"
              >
                Deteksi OBS
              </button>
              <button
                type="button"
                onClick={() => void backendService.captureObsPreview().then(setStatus)}
                disabled={!status?.obsConnected}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)] disabled:opacity-40"
              >
                <Camera className="h-3.5 w-3.5" /> Ambil Pratinjau
              </button>
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
              placeholder="Kata sandi OBS WebSocket (disimpan di Vault)"
              className="studio-input h-9 rounded-lg px-3 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleConnectObs()}
                className="h-9 flex-1 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)]"
              >
                {status?.obsConnected ? 'Putuskan OBS' : 'Hubungkan OBS'}
              </button>
              <button
                type="button"
                onClick={() => void backendService.reconnectObs().then(setStatus)}
                className="h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-secondary)]"
              >
                Reconnect
              </button>
            </div>
          </div>

          {status?.obsDetection && (
            <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 text-xs text-[var(--text-secondary)]">
              Deteksi OBS ({status.obsDetection.platform}): Proses{' '}
              <strong className="text-[var(--text-primary)]">
                {status.obsDetection.processRunning ? 'Berjalan' : 'Tidak Terdeteksi'}
              </strong>{' '}
              • Port {status.obsDetection.port}{' '}
              <strong className="text-[var(--text-primary)]">
                {status.obsDetection.portReachable ? 'Terbuka' : 'Tertutup'}
              </strong>
            </div>
          )}
        </Panel>
      )}

      {activeTab === 'scenes' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Panel title="Manajer Adegan (Scenes)" subtitle="Pilih adegan program aktif di OBS.">
            {status?.scenes.length ? (
              <div className="flex flex-wrap gap-2">
                {status.scenes.map((sc) => (
                  <button
                    key={sc.sceneName}
                    type="button"
                    onClick={() => void backendService.setObsScene(sc.sceneName).then(setStatus)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
                      sc.isCurrent
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)] text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    {sc.sceneName}
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Layers className="h-6 w-6" />} title="Belum Ada Adegan" description="Hubungkan OBS WebSocket untuk memuat daftar adegan." />
            )}
          </Panel>

          <Panel title="Manajemen Sumber (Sources)" subtitle="Tampilkan atau sembunyikan elemen pada adegan aktif.">
            {status?.sources.length ? (
              <div className="space-y-2 text-xs">
                {status.sources.map((src) => (
                  <div key={src.sceneItemId} className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2">
                    <span className="text-[var(--text-primary)]">{src.sourceName}</span>
                    <button
                      type="button"
                      onClick={() => void backendService.toggleObsSource(src.sceneItemId, !src.visible).then(setStatus)}
                      className="inline-flex items-center gap-1 rounded border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                    >
                      {src.visible ? <Eye className="h-3 w-3 text-emerald-500" /> : <EyeOff className="h-3 w-3 text-rose-500" />}
                      {src.visible ? 'Tampil' : 'Tersembunyi'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Eye className="h-6 w-6" />} title="Belum Ada Source" description="Pilih adegan aktif setelah OBS terhubung." />
            )}
          </Panel>
        </div>
      )}

      {activeTab === 'mixer' && (
        <Panel title="Pencampur Audio OBS & Routing Narasi AI" subtitle="Atur mute dan volume dB input audio OBS secara langsung.">
          {status?.audioInputs.length ? (
            <div className="space-y-3 text-xs">
              {status.audioInputs.map((inp) => (
                <div key={inp.inputName} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                  <div className="min-w-44">
                    <div className="font-semibold text-[var(--text-primary)]">{inp.inputName}</div>
                    <div className="text-[11px] text-[var(--text-secondary)]">{inp.volumeDb.toFixed(1)} dB</div>
                  </div>
                  <input
                    type="range"
                    min="-60"
                    max="0"
                    step="1"
                    value={Math.round(inp.volumeDb)}
                    onChange={(e) => void backendService.setObsAudioVolume(inp.inputName, Number(e.target.value)).then(setStatus)}
                    className="min-w-40 flex-1 accent-[var(--accent-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => void backendService.setObsAudioMute(inp.inputName, !inp.muted).then(setStatus)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[var(--text-primary)]"
                  >
                    {inp.muted ? <VolumeX className="h-3.5 w-3.5 text-rose-500" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-500" />}
                    {inp.muted ? 'Dibisukan' : 'Aktif'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Sliders className="h-6 w-6" />} title="Input Audio OBS Kosong" description="Hubungkan OBS WebSocket untuk memantau mixer audio." />
          )}
        </Panel>
      )}

      {activeTab === 'health' && (
        <Panel title="Pemantauan Kesehatan Stream" subtitle="Metrik bitrate aktual, FPS, frame terlewat, dan kongesti jaringan.">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Bitrate" value={`${status?.health.bitrateKbps ?? 0} kbps`} meta="Dihitung dari byte output OBS" icon={<Activity className="h-4 w-4" />} />
            <StatCard label="FPS Aktif" value={`${status?.health.fps ?? 0} FPS`} meta="Render OBS real-time" />
            <StatCard label="Frame Terlewat" value={`${status?.health.droppedFrames ?? 0}`} meta={`${status?.health.droppedPercent ?? 0}% dari ${status?.health.totalFrames ?? 0}`} />
            <StatCard label="Kongesti" value={`${((status?.health.congestion ?? 0) * 100).toFixed(1)}%`} meta={status?.health.reconnecting ? 'Reconnecting...' : 'Stabil'} />
          </div>
        </Panel>
      )}

      {activeTab === 'recording' && (
        <Panel
          title="Manajer Rekaman OBS"
          subtitle="Kendalikan perekaman lokal (Start, Pause, Stop) melalui OBS WebSocket."
          action={
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!status?.obsConnected || status?.recording.recording}
                onClick={() => void backendService.startObsRecording().then(setStatus)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-500 disabled:opacity-40"
              >
                <Disc className="h-3.5 w-3.5" /> Mulai Rekam
              </button>
              <button
                type="button"
                disabled={!status?.recording.recording}
                onClick={() => void backendService.toggleObsRecordingPause().then(setStatus)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)] disabled:opacity-40"
              >
                <Pause className="h-3.5 w-3.5" /> Jeda/Lanjut
              </button>
              <button
                type="button"
                disabled={!status?.recording.recording}
                onClick={() => void backendService.stopObsRecording().then(setStatus)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 text-xs font-semibold text-rose-500 disabled:opacity-40"
              >
                <Square className="h-3.5 w-3.5" /> Stop Rekam
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
            <StatCard label="Status Rekaman" value={status?.recording.recording ? (status.recording.paused ? 'Dijeda' : 'Merekam') : 'Siaga'} meta="OBS Record Output" />
            <StatCard label="Durasi Rekaman" value={`${status?.recording.durationSeconds ?? 0} dtk`} meta="Waktu aktif sesi rekam" />
            <StatCard label="Ukuran Output" value={`${Math.round((status?.recording.bytes ?? 0) / 1024)} KB`} meta={status?.recording.outputPath ?? 'Lokasi folder OBS'} />
          </div>
        </Panel>
      )}

      {activeTab === 'youtube' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Panel title="YouTube Live — OAuth & Broadcast" subtitle="Integrasi least-privilege OAuth & Data API tanpa menyimpan token plaintext." action={<YouTubeLogo className="h-4 w-6" />}>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                <span className="text-[var(--text-secondary)]">Status Akun</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {status?.youtube.connected ? status.youtube.channelTitle ?? 'Terhubung' : status?.youtube.configured ? 'Terkonfigurasi (Belum Login)' : 'Belum Dikonfigurasi'}
                </span>
              </div>
              <input type="text" value={ytClientId} onChange={(e) => setYtClientId(e.target.value)} placeholder="Google OAuth Client ID" className="studio-input h-9 w-full rounded-lg px-3 text-xs" />
              <input type="text" value={ytAuthEndpoint} onChange={(e) => setYtAuthEndpoint(e.target.value)} placeholder="URL OAuth Authorize Endpoint" className="studio-input h-9 w-full rounded-lg px-3 text-xs" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void backendService.configureYouTubeOAuth({ clientId: ytClientId, authEndpoint: ytAuthEndpoint }).then(() => loadStatus()).catch((e) => reportError(e, 'Gagal menyimpan konfigurasi YouTube.'))}
                  className="h-9 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)]"
                >
                  Simpan OAuth
                </button>
                <button
                  type="button"
                  onClick={() => void backendService.getYouTubeOAuthUrl().then((r) => backendService.openExternalUrl(r.url)).catch((e) => reportError(e, 'Gagal membuka OAuth YouTube.'))}
                  className="h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)]"
                >
                  Hubungkan OAuth
                </button>
                {status?.youtube.connected && (
                  <button type="button" onClick={() => void backendService.disconnectYouTube().then(() => loadStatus())} className="h-9 rounded-lg border border-rose-500/40 px-3 text-xs text-rose-500">
                    Revoke
                  </button>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Kunci Siaran YouTube (Vault)" subtitle="Disimpan di Keychain / Credential Manager OS.">
            <div className="space-y-3 text-xs">
              <div className="flex justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                <span className="text-[var(--text-secondary)]">Kunci Tersimpan</span>
                <span className="font-mono text-[var(--text-primary)]">{status?.vault.youtubeStreamKeyMasked ?? 'Belum diatur'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <input type="password" value={ytKey} onChange={(e) => setYtKey(e.target.value)} placeholder="Masukkan stream key YouTube..." className="studio-input h-9 min-w-44 flex-1 rounded-lg px-3 text-xs" />
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
                <button type="button" onClick={() => void handleSaveKey('youtube')} className="h-9 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)]">
                  Simpan Kunci
                </button>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'twitch' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Panel title="Twitch Studio — OAuth, Channel & EventSub" subtitle="Integrasi Twitch OAuth, status channel, IRC chat, dan EventSub." action={<TwitchLogo className="h-5 w-5" />}>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                <span className="text-[var(--text-secondary)]">Status Akun</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {status?.twitch.connected ? status.twitch.channel?.displayName ?? 'Terhubung' : status?.twitch.configured ? 'Terkonfigurasi' : 'Belum Dikonfigurasi'}
                </span>
              </div>
              <input type="text" value={twClientId} onChange={(e) => setTwClientId(e.target.value)} placeholder="Twitch Client ID" className="studio-input h-9 w-full rounded-lg px-3 text-xs" />
              <input type="text" value={twAuthEndpoint} onChange={(e) => setTwAuthEndpoint(e.target.value)} placeholder="URL Twitch Authorize Endpoint" className="studio-input h-9 w-full rounded-lg px-3 text-xs" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void backendService.configureTwitchOAuth({ clientId: twClientId, authEndpoint: twAuthEndpoint }).then(() => loadStatus()).catch((e) => reportError(e, 'Gagal menyimpan konfigurasi Twitch.'))}
                  className="h-9 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)]"
                >
                  Simpan OAuth
                </button>
                <button
                  type="button"
                  onClick={() => void backendService.getTwitchOAuthUrl().then((r) => backendService.openExternalUrl(r.url)).catch((e) => reportError(e, 'Gagal membuka OAuth Twitch.'))}
                  className="h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)]"
                >
                  Hubungkan OAuth
                </button>
                {status?.twitch.connected && (
                  <button type="button" onClick={() => void backendService.disconnectTwitch().then(() => loadStatus())} className="h-9 rounded-lg border border-rose-500/40 px-3 text-xs text-rose-500">
                    Revoke
                  </button>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Kunci Siaran Twitch (Vault)" subtitle="Target multistream dengan penyimpanan kunci terenkripsi.">
            <div className="space-y-3 text-xs">
              <div className="flex justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                <span className="text-[var(--text-secondary)]">Kunci Tersimpan</span>
                <span className="font-mono text-[var(--text-primary)]">{status?.vault.twitchStreamKeyMasked ?? 'Belum diatur'}</span>
              </div>
              <div className="flex gap-2">
                <input type="password" value={twKey} onChange={(e) => setTwKey(e.target.value)} placeholder="Masukkan stream key Twitch..." className="studio-input h-9 flex-1 rounded-lg px-3 text-xs" />
                <button type="button" onClick={() => void handleSaveKey('twitch')} className="h-9 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)]">
                  Simpan Kunci
                </button>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'assistant' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Panel title="Antrean Narasi Suara Indonesia" subtitle="Narasi otomatis hanya menggunakan status game terverifikasi dari Monitor Visi." className="lg:col-span-6">
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={narrationText}
                  onChange={(e) => setNarrationText(e.target.value)}
                  placeholder="Tulis narasi manual Bahasa Indonesia..."
                  className="studio-input h-9 min-w-44 flex-1 rounded-lg px-3 text-xs"
                />
                <AppSelect
                  value={narrationEmotion}
                  onChange={(v) => setNarrationEmotion(v as VoiceEmotion)}
                  options={[
                    { value: 'neutral', label: 'Netral' },
                    { value: 'excited', label: 'Antusias' },
                    { value: 'tense', label: 'Tegang' },
                    { value: 'calm', label: 'Tenang' },
                  ]}
                  className="w-32"
                />
                <button
                  type="button"
                  onClick={() =>
                    void backendService
                      .enqueueStreamNarration({ text: narrationText, emotion: narrationEmotion })
                      .then(() => {
                        setNarrationText('');
                        void loadStatus();
                      })
                  }
                  className="h-9 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 font-semibold text-[var(--text-primary)]"
                >
                  Kirim Narasi
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void backendService.triggerAutoStreamNarration().then(() => loadStatus())} className="h-8 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-emerald-500">
                  Narasi dari Visi Terverifikasi
                </button>
                <button type="button" onClick={() => void backendService.interruptStreamNarration().then(() => loadStatus())} className="h-8 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 text-rose-500">
                  Interupsi Suara
                </button>
              </div>
              {status?.narration.lastVerifiedGameState && (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2.5 text-[11px] text-[var(--text-secondary)]">
                  State Terverifikasi: {status.narration.lastVerifiedGameState}
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title="AI Stream Assistant (Dengan Persetujuan)"
            subtitle="Ringkas gameplay, deteksi event, dan usulkan pindah adegan OBS dengan persetujuan pengguna."
            className="lg:col-span-6"
            action={
              <button type="button" onClick={() => void backendService.analyzeStreamAssistant().then(() => loadStatus())} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)]">
                <Bot className="h-3.5 w-3.5" /> Analisis Sekarang
              </button>
            }
          >
            <div className="space-y-3 text-xs">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={assistantCmd}
                  onChange={(e) => setAssistantCmd(e.target.value)}
                  placeholder="Perintah asisten (mis. !status, !game, !ringkas)..."
                  className="studio-input h-9 flex-1 rounded-lg px-3 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    void backendService.sendStreamAssistantCommand(assistantCmd).then((r) => {
                      setAssistantReply(r.reply);
                      setAssistantCmd('');
                      void loadStatus();
                    })
                  }
                  className="h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-[var(--text-primary)]"
                >
                  Kirim
                </button>
              </div>
              {assistantReply && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[var(--text-primary)]">
                  {assistantReply}
                </div>
              )}
              {(status?.assistant.suggestions ?? []).map((sug) => (
                <div key={sug.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2.5">
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">{sug.title}</div>
                    <div className="text-[11px] text-[var(--text-secondary)]">{sug.message}</div>
                  </div>
                  {sug.status === 'pending' ? (
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => void backendService.approveStreamSuggestion(sug.id).then(() => loadStatus())} className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-500">
                        <Check className="h-3 w-3" /> Setujui
                      </button>
                      <button type="button" onClick={() => void backendService.rejectStreamSuggestion(sug.id).then(() => loadStatus())} className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[11px] text-rose-500">
                        <X className="h-3 w-3" /> Tolak
                      </button>
                    </div>
                  ) : (
                    <StatusBadge variant="neutral" label={sug.status} />
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'history' && (
        <Panel title="Riwayat Sesi Siaran & Sampel Analitik (SQLite)" subtitle="Catatan durasi, rata-rata bitrate, FPS, frame terlewat, dan jumlah narasi.">
          {analytics.sessions.length === 0 ? (
            <EmptyState icon={<History className="h-6 w-6" />} title="Belum Ada Sesi Siaran" description="Riwayat sesi siaran uji dan publik akan tercatat otomatis di SQLite." />
          ) : (
            <div className="space-y-2 text-xs">
              {analytics.sessions.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">
                      #{s.id} • {s.title} ({s.platforms})
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {s.visibility} • {s.durationSeconds} dtk • {s.avgBitrate} kbps • {s.avgFps} FPS • Drop: {s.droppedFrames} • Narasi: {s.narrationCount}
                    </div>
                  </div>
                  <StatusBadge variant={s.status === 'streaming' ? 'healthy' : s.status === 'emergency_stopped' ? 'warning' : 'neutral'} label={s.status} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
