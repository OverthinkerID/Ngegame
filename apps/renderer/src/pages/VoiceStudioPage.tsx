import { useCallback, useEffect, useState } from 'react';
import { AudioLines, Mic, Play, RefreshCw, Sparkles, Trash2, Upload, Volume2 } from 'lucide-react';
import type {
  VoiceCloneJobRecord,
  VoiceEmotion,
  VoiceProfile,
  VoiceSampleRecord,
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
import { useAppState } from '../context/AppStateContext.js';
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
  const { voiceState, setVoiceState } = useAppState();
  const [status, setStatus] = useState<VoiceServiceStatus | null>(null);
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [samples, setSamples] = useState<VoiceSampleRecord[]>([]);
  const [cloneJobs, setCloneJobs] = useState<VoiceCloneJobRecord[]>([]);
  const [history, setHistory] = useState<VoiceSpeechResult[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(BUILTIN_CLONE_SAMPLES[0]!.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVoice = useCallback(async () => {
    setError(null);
    try {
      const [st, cfg, profs, savedSamples, jobs, hist] = await Promise.all([
        backendService.getVoiceStatus(),
        backendService.getVoiceSettings(),
        backendService.listVoiceProfiles(),
        backendService.listVoiceSamples(),
        backendService.listVoiceCloneJobs(25),
        backendService.getVoiceHistory(12),
      ]);
      setStatus(st);
      setSettings(cfg);
      setProfiles(profs);
      setSamples(savedSamples);
      setCloneJobs(jobs);
      setHistory(hist);
      if (!voiceState.selectedSampleId && savedSamples.length > 0) {
        setVoiceState((prev) => ({ ...prev, selectedSampleId: savedSamples[0]!.id }));
      }
    } catch (err) {
      const friendly = parseFriendlyError(err, 'Gagal memuat status Studio Suara.');
      setError(friendly.message);
    }
  }, [setVoiceState, voiceState.selectedSampleId]);

  useEffect(() => {
    void loadVoice();
  }, [loadVoice]);

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
        text: textOverride ?? voiceState.text,
        emotion: emotionOverride ?? voiceState.emotion,
        profileId: settings?.activeProfileId,
        sourceSampleId: voiceState.selectedSampleId ?? undefined,
        playAudio: true,
      });
      setVoiceState((prev) => ({ ...prev, lastResult: res }));
      const playbackUrl = backendService.resolveAssetUrl(res.audioUrl) ?? res.audioBase64;
      if (playbackUrl) {
        const audio = new Audio(playbackUrl);
        audio.volume = (settings?.volume ?? 85) / 100;
        void audio.play();
      }
      onNotify?.(`Sampel suara disimpan & dijalankan (${res.engineUsed}).`, 'success');
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
        emotion: voiceState.emotion,
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
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) return;
        const saved = await backendService.uploadVoiceSample({
          name: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          mimeType: file.type || 'audio/wav',
          language: 'id-ID',
          voiceProfileId: settings?.activeProfileId ?? null,
          audioBase64: dataUrl,
        });
        setVoiceState((prev) => ({ ...prev, selectedSampleId: saved.id }));
        onNotify?.(`Sampel "${saved.name}" tersimpan permanen di userData.`, 'success');
        await loadVoice();
      } catch (err) {
        const friendly = parseFriendlyError(err, 'Gagal menyimpan sampel suara.');
        setError(friendly.message);
        onNotify?.(friendly.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteSample = async (id: string): Promise<void> => {
    await backendService.deleteVoiceSample(id);
    if (voiceState.selectedSampleId === id) {
      setVoiceState((prev) => ({ ...prev, selectedSampleId: null }));
    }
    await loadVoice();
  };

  const handleDeleteCloneJob = async (id: string): Promise<void> => {
    await backendService.deleteVoiceCloneJob(id);
    await loadVoice();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Studio Suara AI (VoxCPM 2.0)
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          Seluruh sampel referensi dan hasil voice cloning disimpan permanen di folder userData &amp; SQLite agar tetap dapat diputar setelah restart.
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
          label="Sampel Tersimpan"
          value={String(samples.length)}
          meta="Disimpan permanen di userData/voice/samples"
          badge={<StatusBadge variant="healthy" label="Persisten" />}
        />
        <StatCard
          label="Hasil Voice Cloning"
          value={String(cloneJobs.length)}
          meta="File .wav tersimpan di userData/voice/outputs"
        />
        <StatCard
          label="Gaya &amp; Jeda"
          value={`${settings?.style ?? 'santai'} • ${settings?.minCooldownSeconds ?? 8} dtk`}
          meta="Pengaturan tersimpan di SQLite"
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

      <Panel
        title="Sampel Cloning Suara (Persisten)"
        subtitle="Pilih preset suara bawaan atau unggah berkas audio referensi (.wav, .mp3, .ogg) untuk disimpan permanen di userData."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-6">
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
                      setVoiceState((prev) => ({
                        ...prev,
                        text: preset.sampleLine,
                        emotion: preset.emotion,
                      }));
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

          <div className="flex flex-col justify-between rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs lg:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-[var(--text-primary)]">
                  Pustaka Sampel Suara Referensi
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                  Unggah audio 5–15 detik; otomatis disimpan ke disk dan tersedia setelah restart.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:opacity-90">
                <Upload className="h-3.5 w-3.5" />
                <span>Unggah Audio</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => handleUploadSample(e.target.files?.[0])}
                />
              </label>
            </div>

            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
              {samples.length === 0 ? (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-main)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
                  Belum ada file sampel tersimpan di userData.
                </div>
              ) : (
                samples.map((smp) => {
                  const selected = voiceState.selectedSampleId === smp.id;
                  const audioSrc = backendService.resolveAssetUrl(smp.audioUrl) ?? '';
                  return (
                    <div
                      key={smp.id}
                      className={`space-y-1.5 rounded-lg border p-2.5 ${
                        selected
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-main)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() =>
                            setVoiceState((prev) => ({ ...prev, selectedSampleId: smp.id }))
                          }
                          className="truncate text-left font-semibold text-[var(--text-primary)]"
                        >
                          {selected ? '● ' : ''}
                          {smp.name} ({smp.language})
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSample(smp.id)}
                          aria-label={`Hapus sampel ${smp.name}`}
                          className="text-[var(--text-muted)] hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {audioSrc && <audio controls src={audioSrc} className="h-8 w-full" />}
                    </div>
                  );
                })
              )}
            </div>
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
            value={voiceState.text}
            onChange={(e) => setVoiceState((prev) => ({ ...prev, text: e.target.value }))}
            className="studio-input h-9 min-w-64 flex-1 rounded-lg px-3 text-xs"
          />
          <AppSelect
            value={voiceState.emotion}
            onChange={(val) =>
              setVoiceState((prev) => ({ ...prev, emotion: val as VoiceEmotion }))
            }
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
            <Play className="h-3.5 w-3.5" /> Uji &amp; Simpan Suara
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
        title="Hasil Voice Cloning Tersimpan (Playable)"
        subtitle="Output audio yang disimpan fisik di userData sehingga tetap dapat diputar setelah restart."
      >
        <div className="space-y-2">
          {cloneJobs.length === 0 ? (
            <div className="rounded-lg bg-[var(--bg-secondary)] p-3 text-xs text-[var(--text-secondary)]">
              Belum ada hasil voice cloning tersimpan.
            </div>
          ) : (
            cloneJobs.map((job) => {
              const audioSrc = backendService.resolveAssetUrl(job.audioUrl);
              return (
                <div
                  key={job.id}
                  className="flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-[var(--text-primary)]">
                        [{job.modelProvider}/{job.emotion}]
                      </span>{' '}
                      <span className="text-[var(--text-secondary)]">&quot;{job.text}&quot;</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        variant={job.status === 'completed' ? 'healthy' : 'warning'}
                        label={job.status}
                      />
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {new Date(job.createdAt).toLocaleString('id-ID')}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCloneJob(job.id)}
                        aria-label="Hapus hasil clone"
                        className="text-[var(--text-muted)] hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {audioSrc ? (
                    <audio controls src={audioSrc} className="h-8 w-full" />
                  ) : job.errorMessage ? (
                    <div className="text-[11px] text-amber-400">{job.errorMessage}</div>
                  ) : null}
                </div>
              );
            })
          )}
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
