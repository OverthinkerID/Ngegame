import { useCallback, useEffect, useState } from 'react';
import { AudioLines, Mic, Play, RefreshCw, Sparkles, Upload, Volume2 } from 'lucide-react';
import type {
  VoiceEmotion,
  VoiceProfile,
  VoiceServiceStatus,
  VoiceSettings,
  VoiceSpeakingStyle,
  VoiceSpeechResult,
} from '@ngegame/shared';
import { AppSelect } from '../components/ui/AppSelect.js';
import { ErrorState } from '../components/ui/FeedbackComponents.js';
import { Panel } from '../components/ui/Panel.js';
import { StatCard } from '../components/ui/StatCard.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { backendService } from '../services/backendService.js';
import { GUIDE_URLS, parseFriendlyError } from '../utils/guideHelper.js';

interface VoiceSamplePreset {
  id: string;
  label: string;
  style: VoiceSpeakingStyle;
  emotion: VoiceEmotion;
  sampleLine: string;
}

const BUILTIN_CLONE_SAMPLES: VoiceSamplePreset[] = [
  {
    id: 'sample-santai',
    label: 'Narator Santai Overthinker (ID)',
    style: 'santai',
    emotion: 'neutral',
    sampleLine: 'Oke santai dulu, kita cek energi dan inventori sebelum masuk ke tambang.',
  },
  {
    id: 'sample-esport',
    label: 'Komentator Antusias (ID)',
    style: 'ekspresif',
    emotion: 'excited',
    sampleLine: 'Wah! Gerakan barusan pas banget, langsung lanjut ke misi berikutnya!',
  },
  {
    id: 'sample-taktis',
    label: 'Pemandu Taktis Tenang (ID)',
    style: 'taktis',
    emotion: 'calm',
    sampleLine: 'Status aman, latensi stabil, siap menjalankan perintah yang disetujui.',
  },
];

interface VoiceStudioPageProps {
  onNotify?: (
    message: string,
    type?: 'info' | 'success' | 'error',
    guideUrl?: string,
    guideLabel?: string,
  ) => void;
}

export function VoiceStudioPage({ onNotify }: VoiceStudioPageProps): React.JSX.Element {
  const [status, setStatus] = useState<VoiceServiceStatus | null>(null);
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [history, setHistory] = useState<VoiceSpeechResult[]>([]);
  const [sampleText, setSampleText] = useState(
    'Halo semuanya! Selamat datang di siaran langsung Overthinker Ngegame!',
  );
  const [emotion, setEmotion] = useState<VoiceEmotion>('excited');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(BUILTIN_CLONE_SAMPLES[0]!.id);
  const [customSample, setCustomSample] = useState<{
    name: string;
    sizeKb: number;
    url: string;
    audioBase64: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVoice = useCallback(async () => {
    setError(null);
    try {
      const [st, cfg, profs, hist] = await Promise.all([
        backendService.getVoiceStatus(),
        backendService.getVoiceSettings(),
        backendService.listVoiceProfiles(),
        backendService.getVoiceHistory(12),
      ]);
      setStatus(st);
      setSettings(cfg);
      setProfiles(profs);
      setHistory(hist);
    } catch (err) {
      const friendly = parseFriendlyError(err, 'Gagal memuat status Studio Suara.');
      setError(friendly.message);
    }
  }, []);

  useEffect(() => {
    void loadVoice();
  }, [loadVoice]);

  useEffect(() => {
    return () => {
      if (customSample?.url) {
        URL.revokeObjectURL(customSample.url);
      }
    };
  }, [customSample]);

  const handleUpdateSettings = async (partial: Partial<VoiceSettings>): Promise<void> => {
    setError(null);
    try {
      const updated = await backendService.updateVoiceSettings(partial);
      setSettings(updated);
    } catch (err) {
      const friendly = parseFriendlyError(err, 'Gagal memperbarui pengaturan suara.');
      setError(friendly.message);
      onNotify?.(friendly.message, 'error', friendly.guideUrl, friendly.guideLabel);
    }
  };

  const handleSpeak = async (textOverride?: string, emotionOverride?: VoiceEmotion): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await backendService.speakVoiceText({
        text: textOverride ?? sampleText,
        emotion: emotionOverride ?? emotion,
        playAudio: true,
        ...(customSample?.audioBase64
          ? {
              referenceAudioBase64: customSample.audioBase64,
              referenceFileName: customSample.name,
            }
          : {}),
      });
      if (res.audioBase64) {
        const audio = new Audio(res.audioBase64);
        audio.volume = (settings?.volume ?? 85) / 100;
        void audio.play();
      }
      onNotify?.(`Sampel suara dijalankan (${res.engineUsed}).`, 'success');
      await loadVoice();
    } catch (err) {
      const friendly = parseFriendlyError(err, 'Gagal menjalankan sintesis suara.');
      setError(friendly.message);
      onNotify?.(friendly.message, 'error', friendly.guideUrl, friendly.guideLabel);
    } finally {
      setLoading(false);
    }
  };

  const handleTestCommentary = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await backendService.generateVoiceCommentary({
        eventType: 'HIGH_MOTION',
        gameTitle: 'Stardew Valley',
        details: 'Karakter memasuki area baru dengan aktivitas tinggi',
        emotion,
        autoSpeak: false,
      });
      onNotify?.('Komentar gameplay berhasil dibuat.', 'success');
      await loadVoice();
    } catch (err) {
      const friendly = parseFriendlyError(err, 'Gagal membuat komentar gameplay.');
      setError(friendly.message);
      onNotify?.(friendly.message, 'error', friendly.guideUrl, friendly.guideLabel);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSample = (file: File | undefined): void => {
    if (!file) return;
    if (customSample?.url) {
      URL.revokeObjectURL(customSample.url);
    }
    const url = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : dataUrl;
      setCustomSample({
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        url,
        audioBase64: base64,
      });
      onNotify?.(`Sampel cloning "${file.name}" siap dikirim ke VoxCPM 2.0.`, 'success');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Studio Suara AI (VoxCPM 2.0)
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          Atur profil narator Bahasa Indonesia, sampel cloning suara, gaya bicara, kecepatan, dan uji komentar.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Mesin VoxCPM 2.0"
          value={status?.voxcpmAvailable ? 'Terhubung' : 'Cadangan Lokal'}
          meta={settings?.voxcpmBaseUrl ?? 'http://localhost:8000'}
          icon={<Mic className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={status?.voxcpmAvailable ? 'healthy' : 'warning'}
              label={status?.voxcpmAvailable ? 'VoxCPM 2.0' : 'Terisolasi'}
            />
          }
        />
        <StatCard
          label="Isolasi Layanan"
          value="Non-Blocking"
          meta="Gangguan TTS tidak menghentikan kontrol game"
          badge={<StatusBadge variant="healthy" label="Terlindungi" />}
        />
        <StatCard
          label="Gaya &amp; Jeda"
          value={`${settings?.style ?? 'santai'} • ${settings?.minCooldownSeconds ?? 8} dtk`}
          meta="Pembatasan jeda otomatis antar komentar"
        />
        <StatCard
          label="Whisper STT"
          value={status?.whisperAvailable ? 'Siap' : 'Opsional (Nonaktif)'}
          meta="Pengenalan suara tambahan"
        />
      </section>

      {error && (
        <ErrorState
          message={error}
          guideUrl={GUIDE_URLS.voice}
          guideLabel="Panduan Suara AI"
          onRetry={() => void loadVoice()}
        />
      )}

      {/* Sampel Cloning Suara */}
      <Panel
        title="Sampel Cloning Suara (Siap Uji)"
        subtitle="Pilih preset suara bawaan atau unggah berkas audio referensi (.wav, .mp3, .ogg) untuk pratinjau cloning VoxCPM 2.0."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-7">
            {BUILTIN_CLONE_SAMPLES.map((preset) => {
              const active = selectedPresetId === preset.id;
              return (
                <div
                  key={preset.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-xs transition-colors ${
                    active
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPresetId(preset.id);
                      setSampleText(preset.sampleLine);
                      setEmotion(preset.emotion);
                      void handleUpdateSettings({ style: preset.style });
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                      <AudioLines className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                      <span>{preset.label}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
                      &quot;{preset.sampleLine}&quot;
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setSelectedPresetId(preset.id);
                      void handleSpeak(preset.sampleLine, preset.emotion);
                    }}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                  >
                    <Play className="h-3 w-3 text-emerald-500" />
                    Putar Sampel
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs lg:col-span-5">
            <div>
              <div className="font-semibold text-[var(--text-primary)]">
                Unggah Sampel Suara Referensi
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                Durasi ideal 5–15 detik suara jernih tanpa musik latar untuk referensi cloning VoxCPM 2.0.
              </p>

              <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:opacity-90">
                <Upload className="h-3.5 w-3.5" />
                <span>Pilih File Audio (.wav / .mp3)</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => handleUploadSample(e.target.files?.[0])}
                />
              </label>
            </div>

            {customSample ? (
              <div className="mt-3 space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-main)] p-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="truncate font-semibold text-[var(--text-primary)]">
                    {customSample.name}
                  </span>
                  <span className="text-[var(--text-muted)]">{customSample.sizeKb} KB</span>
                </div>
                <audio controls src={customSample.url} className="h-8 w-full" />
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-main)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
                Belum ada file sampel lokal dipilih. Anda dapat memutar 3 preset bawaan di samping.
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title="Konfigurasi Narator Bahasa Indonesia"
        subtitle="Pilih profil suara, gaya bicara, kecepatan, volume, dan alamat server VoxCPM 2.0."
        action={
          <button
            type="button"
            onClick={() => void loadVoice()}
            aria-label="Muat ulang"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5 text-xs">
            <span className="block text-[var(--text-secondary)]">Profil Suara</span>
            <AppSelect
              value={settings?.activeProfileId ?? 'overthinker-voxcpm2'}
              onChange={(val) => void handleUpdateSettings({ activeProfileId: val })}
              options={
                profiles.length > 0
                  ? profiles.map((p) => ({ value: p.id, label: p.name }))
                  : [{ value: 'overthinker-voxcpm2', label: 'Overthinker VoxCPM 2.0' }]
              }
            />
          </div>

          <div className="space-y-1.5 text-xs">
            <span className="block text-[var(--text-secondary)]">Gaya Bicara</span>
            <AppSelect
              value={settings?.style ?? 'santai'}
              onChange={(val) =>
                void handleUpdateSettings({ style: val as VoiceSpeakingStyle })
              }
              options={[
                { value: 'santai', label: 'Santai & Natural' },
                { value: 'ekspresif', label: 'Ekspresif & Antusias' },
                { value: 'taktis', label: 'Taktis & Ringkas' },
              ]}
            />
          </div>

          <label className="space-y-1.5 text-xs">
            <span className="block text-[var(--text-secondary)]">URL Server VoxCPM 2.0</span>
            <input
              type="text"
              value={settings?.voxcpmBaseUrl ?? 'http://localhost:8000'}
              onChange={(e) =>
                void handleUpdateSettings({ voxcpmBaseUrl: e.target.value })
              }
              className="studio-input h-9 w-full rounded-lg px-3 text-xs"
            />
          </label>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3">
          <label className="space-y-2 text-xs">
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>Kecepatan Bicara</span>
              <span className="tabular-nums font-mono text-[var(--accent-primary)]">
                {(settings?.speed ?? 1.0).toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min="0.7"
              max="1.5"
              step="0.1"
              value={settings?.speed ?? 1.0}
              onChange={(e) =>
                void handleUpdateSettings({ speed: Number.parseFloat(e.target.value) })
              }
              className="w-full accent-[var(--accent-primary)]"
            />
          </label>

          <label className="space-y-2 text-xs">
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1">
                <Volume2 className="h-3.5 w-3.5" /> Volume Output
              </span>
              <span className="tabular-nums font-mono text-[var(--accent-primary)]">
                {settings?.volume ?? 85}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={settings?.volume ?? 85}
              onChange={(e) =>
                void handleUpdateSettings({ volume: Number.parseInt(e.target.value, 10) })
              }
              className="w-full accent-[var(--accent-primary)]"
            />
          </label>

          <label className="space-y-2 text-xs">
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>Jeda Minimum Komentar</span>
              <span className="tabular-nums font-mono text-[var(--accent-primary)]">
                {settings?.minCooldownSeconds ?? 8} detik
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              step="2"
              value={settings?.minCooldownSeconds ?? 8}
              onChange={(e) =>
                void handleUpdateSettings({
                  minCooldownSeconds: Number.parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-[var(--accent-primary)]"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
          <input
            type="text"
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            className="studio-input h-9 min-w-64 flex-1 rounded-lg px-3 text-xs"
          />
          <AppSelect
            value={emotion}
            onChange={(val) => setEmotion(val as VoiceEmotion)}
            options={[
              { value: 'neutral', label: 'Netral' },
              { value: 'excited', label: 'Antusias' },
              { value: 'tense', label: 'Tegang' },
              { value: 'humorous', label: 'Humoris' },
              { value: 'calm', label: 'Tenang' },
            ]}
            className="w-36"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleSpeak()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:opacity-90 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" /> Uji Suara ID
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleTestCommentary()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> Uji Komentar Event
          </button>
        </div>
      </Panel>

      <Panel
        title="Riwayat Sintesis &amp; Komentar (SQLite)"
        subtitle="Catatan suara Bahasa Indonesia beserta mesin sintesis yang digunakan."
      >
        <div className="max-h-52 space-y-1.5 overflow-y-auto font-mono text-xs">
          {history.length === 0 ? (
            <div className="rounded-lg bg-[var(--bg-secondary)] p-3 text-[var(--text-secondary)]">
              Belum ada riwayat suara tercatat.
            </div>
          ) : (
            history.map((item, idx) => (
              <div
                key={`${item.id ?? idx}-${item.createdAt}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-secondary)]"
              >
                <span>
                  [{item.engineUsed}/{item.emotion}] &quot;{item.text}&quot;
                </span>
                <span className="text-[var(--accent-primary)]">
                  {item.status} • {item.latencyMs}ms
                </span>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
