import { Database, Download, History, Info, Moon, Palette, RefreshCw, RotateCcw, Shield, Sun, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  AppInfo,
  RuntimeCompatibilityReport,
  SystemLogEntry,
  UpdateCheckFrequency,
  UpdateHistoryEntry,
  UpdateRecoveryLogEntry,
  UpdateState,
} from '@ngegame/shared';
import { AppSelect } from '../components/ui/AppSelect.js';
import { ObsLogo, SteamLogo, TwitchLogo, YouTubeLogo } from '../components/ui/BrandIcons.js';
import { ConfirmDialog } from '../components/ui/FeedbackComponents.js';
import { NgegameLogo } from '../components/ui/OverthinkerLogo.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Panel } from '../components/ui/Panel.js';
import { StatCard } from '../components/ui/StatCard.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { useTheme } from '../context/ThemeContext.js';
import { backendService } from '../services/backendService.js';
import type { PageId, ThemeAccent } from '../types/dashboard.js';
import { SessionHistoryPage } from './SessionHistoryPage.js';

interface SettingsPageProps {
  appInfo: AppInfo | null;
  logs?: SystemLogEntry[];
  initialTab?: SettingsTab;
  onNavigate?: (page: PageId) => void;
  onNotify?: (message: string, type?: 'info' | 'success' | 'error') => void;
}

export type SettingsTab = 'appearance' | 'integrations' | 'updates' | 'history' | 'about';

const ACCENT_OPTIONS: { id: ThemeAccent; label: string; desc: string; swatch: string }[] = [
  { id: 'violet', label: 'Studio Violet', desc: 'Ungu futuristik (#8B5CF6)', swatch: 'bg-[#8B5CF6]' },
  { id: 'cyan', label: 'Electric Sky', desc: 'Biru modern (#38BDF8)', swatch: 'bg-[#38BDF8]' },
  { id: 'emerald', label: 'Emerald Studio', desc: 'Hijau presisi (#22C55E)', swatch: 'bg-[#22C55E]' },
  { id: 'overthinker', label: 'Overthinker Olive', desc: 'Olive khas Overthinker', swatch: 'bg-[#6F9C4E]' },
];

export function SettingsPage({
  appInfo,
  logs = [],
  initialTab = 'appearance',
  onNavigate,
  onNotify,
}: SettingsPageProps): React.JSX.Element {
  const { mode, setMode, accent, setAccent } = useTheme();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [updateHistory, setUpdateHistory] = useState<UpdateHistoryEntry[]>([]);
  const [compatReport, setCompatReport] = useState<RuntimeCompatibilityReport | null>(null);
  const [recoveryLogs, setRecoveryLogs] = useState<UpdateRecoveryLogEntry[]>([]);
  const [confirmInstallOpen, setConfirmInstallOpen] = useState(false);
  const [busyUpdate, setBusyUpdate] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    void backendService.getUpdaterState().then(setUpdateState).catch(() => undefined);
    void backendService.getUpdateHistory(10).then(setUpdateHistory).catch(() => undefined);
    void backendService.getUpdateCompatibility().then(setCompatReport).catch(() => undefined);
    void backendService.getUpdateRecoveryLogs(10).then(setRecoveryLogs).catch(() => undefined);
    return backendService.onUpdaterStateChanged((st) => setUpdateState(st));
  }, []);

  const handleCheckUpdates = async (): Promise<void> => {
    setBusyUpdate(true);
    try {
      const st = await backendService.checkForUpdates();
      setUpdateState(st);
      if (st.updateAvailable) {
        onNotify?.(`Pembaruan v${st.latestVersion} tersedia.`, 'info');
      } else if (!st.error) {
        onNotify?.('Aplikasi sudah menggunakan versi terbaru.', 'success');
      }
    } finally {
      setBusyUpdate(false);
    }
  };

  const handleDownloadUpdate = async (): Promise<void> => {
    setBusyUpdate(true);
    try {
      const st = await backendService.downloadUpdate();
      setUpdateState(st);
    } finally {
      setBusyUpdate(false);
    }
  };

  const handleCancelDownload = async (): Promise<void> => {
    setBusyUpdate(true);
    try {
      const st = await backendService.cancelUpdateDownload();
      setUpdateState(st);
    } finally {
      setBusyUpdate(false);
    }
  };

  const handleRetryDownload = async (): Promise<void> => {
    setBusyUpdate(true);
    try {
      const st = await backendService.retryUpdateDownload();
      setUpdateState(st);
    } finally {
      setBusyUpdate(false);
    }
  };

  const handleInstallUpdate = async (stopActiveTasks: boolean): Promise<void> => {
    setBusyUpdate(true);
    try {
      const st = await backendService.installUpdate({ confirmed: true, stopActiveTasks });
      setUpdateState(st);
      if (st.activeTasksBlocking) {
        setConfirmInstallOpen(true);
      }
    } finally {
      setBusyUpdate(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengaturan Aplikasi"
        description="Konfigurasi tampilan gelap/terang, akses cepat modul AI/Suara/OBS, pembaruan aplikasi, riwayat sesi, dan tentang aplikasi."
        actions={
          <div className="inline-flex flex-wrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1">
            {[
              { id: 'appearance' as SettingsTab, label: 'Tampilan', icon: Palette },
              { id: 'integrations' as SettingsTab, label: 'Layanan & Keamanan', icon: Shield },
              { id: 'updates' as SettingsTab, label: 'Pembaruan', icon: Download },
              { id: 'history' as SettingsTab, label: 'Riwayat Sesi', icon: History },
              { id: 'about' as SettingsTab, label: 'Tentang', icon: Info },
            ].map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[var(--accent-primary-soft)] font-semibold text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        }
      />

      {tab === 'appearance' && (
        <>
          <Panel
            title="Mode Tampilan (Gelap / Terang)"
            subtitle="Pilih skema pencahayaan antarmuka sesuai kenyamanan ruang kerja Anda."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode('dark')}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left text-xs transition-colors ${
                  mode === 'dark'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)] text-[var(--text-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[#0B0D12] text-slate-200">
                  <Moon className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">Mode Gelap (Dark)</div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    Latar #0B0D12 — optimal untuk sesi gaming dan streaming malam hari.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('light')}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left text-xs transition-colors ${
                  mode === 'light'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)] text-[var(--text-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800">
                  <Sun className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">Mode Terang (Light)</div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    Latar #F4F6FA — kontras tinggi untuk ruangan terang.
                  </div>
                </div>
              </button>
            </div>
          </Panel>

          <Panel
            title="Aksen Warna Utama"
            subtitle="Sesuaikan warna sorotan pada navigasi, tombol utama, dan indikator aktif."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAccent(opt.id)}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left text-xs transition-colors ${
                    accent === opt.id
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <span className={`h-5 w-5 shrink-0 rounded-full ring-2 ring-white/20 ${opt.swatch}`} />
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">{opt.label}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </>
      )}

      {tab === 'integrations' && (
        <Panel
          title="Konfigurasi Layanan &amp; Keamanan"
          subtitle="Buka halaman konfigurasi masing-masing subsistem untuk mengatur penyedia AI, VoxCPM 2.0, Steam, OBS, dan pengawasan."
        >
          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: 'AI Engine (Ollama / OpenAI)', desc: 'Atur model lokal/cloud dan aturan izin L1–L3.', page: 'ai-control' as PageId },
              { title: 'Studio Suara (VoxCPM 2.0)', desc: 'Atur profil suara Indonesia, kecepatan, dan cooldown.', page: 'voice' as PageId },
              { title: 'Steam & Pustaka Game', desc: 'Pindai direktori Steam dan cek kompatibilitas.', page: 'library' as PageId },
              { title: 'OBS & Kunci Siaran', desc: 'Atur koneksi WebSocket v5 & Credential Manager.', page: 'streaming' as PageId },
              { title: 'Monitor Sistem & Integritas DB', desc: 'Cek kesehatan CPU, GPU, Worker, dan PRAGMA SQLite.', page: 'system-monitor' as PageId },
            ].map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => onNavigate?.(item.page)}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-left transition-colors hover:bg-[var(--surface-hover)]"
              >
                <div className="font-semibold text-[var(--text-primary)]">{item.title}</div>
                <div className="mt-1 text-[11px] text-[var(--text-secondary)]">{item.desc}</div>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'updates' && (
        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Versi Saat Ini"
              value={`v${updateState?.currentVersion ?? appInfo?.version ?? '0.1.0'}`}
              meta={updateState?.isPackaged ? 'Aplikasi Terinstal' : 'Mode Pengembangan'}
            />
            <StatCard
              label="Versi Terbaru"
              value={updateState?.latestVersion ? `v${updateState.latestVersion}` : '-'}
              meta={updateState?.releaseDate ? `Rilis: ${new Date(updateState.releaseDate).toLocaleDateString('id-ID')}` : 'Belum diperiksa'}
              badge={
                <StatusBadge
                  variant={updateState?.updateAvailable ? 'info' : updateState?.status === 'error' ? 'warning' : 'healthy'}
                  label={updateState?.updateAvailable ? 'Tersedia' : updateState?.status ?? 'idle'}
                />
              }
            />
            <StatCard
              label="Progres Unduhan"
              value={updateState?.progress ? `${updateState.progress.percent}%` : '-'}
              meta={
                updateState?.progress?.bytesPerSecond
                  ? `${Math.round(updateState.progress.bytesPerSecond / 1024)} KB/s`
                  : updateState?.packageSizeBytes
                    ? `Ukuran: ${(updateState.packageSizeBytes / (1024 * 1024)).toFixed(1)} MB`
                    : 'Siaga'
              }
            />
            <StatCard
              label="Saluran &amp; Terakhir Dicek"
              value={updateState?.lastCheckedAt ? new Date(updateState.lastCheckedAt).toLocaleTimeString('id-ID') : 'Belum pernah'}
              meta={`Saluran: ${updateState?.preferences.allowPrerelease ? 'Beta' : 'Stable'} • ${updateState?.lastBackupPath ? 'Backup siap' : 'Backup otomatis'}`}
            />
          </section>

          <Panel
            title="Pusat Pembaruan (GitHub Releases)"
            subtitle="Sumber resmi HTTPS: OverthinkerID/Ngegame • Verifikasi signature & backup SQLite otomatis sebelum instalasi."
            action={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyUpdate}
                  onClick={() => void handleCheckUpdates()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Check for Updates
                </button>
                <button
                  type="button"
                  disabled={busyUpdate || !updateState?.updateAvailable || updateState?.status === 'downloaded' || updateState?.status === 'downloading'}
                  onClick={() => void handleDownloadUpdate()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)] disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" /> Download Update
                </button>
                {updateState?.status === 'downloading' && (
                  <button
                    type="button"
                    onClick={() => void handleCancelDownload()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 text-xs font-semibold text-rose-400"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Batalkan Unduhan
                  </button>
                )}
                {(updateState?.status === 'error' || updateState?.status === 'cancelled') && updateState?.updateAvailable && (
                  <button
                    type="button"
                    disabled={busyUpdate}
                    onClick={() => void handleRetryDownload()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 text-xs font-semibold text-amber-400"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Coba Lagi
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyUpdate || updateState?.status !== 'downloaded'}
                  onClick={() => setConfirmInstallOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-500 disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Install &amp; Restart
                </button>
              </div>
            }
          >
            <div className="space-y-4 text-xs">
              {updateState?.error && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-500">
                  {updateState.error}
                </div>
              )}
              {updateState?.progress && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
                    <span>Mengunduh paket pembaruan...</span>
                    <span>{updateState.progress.percent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                    <div
                      className="h-full bg-[var(--accent-primary)] transition-all"
                      style={{ width: `${Math.min(100, updateState.progress.percent)}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                <div className="font-semibold text-[var(--text-primary)]">Catatan Rilis (Release Notes)</div>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {updateState?.releaseNotes ?? 'Belum ada catatan rilis baru.'}
                </pre>
              </div>
            </div>
          </Panel>

          <Panel
            title="Preferensi Pembaruan &amp; Keamanan Data"
            subtitle="Default aman: cek otomatis aktif, unduh otomatis nonaktif, dan konfirmasi instalasi aktif."
            action={
              <button
                type="button"
                onClick={() =>
                  void backendService.backupUserDatabase().then((res) => {
                    onNotify?.(
                      res.backupPath ? `Backup SQLite disimpan: ${res.backupPath}` : 'Database lokal belum dibuat.',
                      res.backupPath ? 'success' : 'info',
                    );
                  })
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)]"
              >
                <Database className="h-3.5 w-3.5" /> Backup SQLite Sekarang
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
              {[
                { key: 'autoCheck' as const, label: 'Pemeriksaan update otomatis' },
                { key: 'autoDownload' as const, label: 'Unduh pembaruan otomatis' },
                { key: 'requireInstallConfirmation' as const, label: 'Konfirmasi manual sebelum install & restart' },
                { key: 'allowPrerelease' as const, label: 'Ikut saluran Pre-release (beta)' },
              ].map((pref) => {
                const checked = Boolean(updateState?.preferences[pref.key]);
                return (
                  <label
                    key={pref.key}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2.5"
                  >
                    <span className="text-[var(--text-primary)]">{pref.label}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        void backendService
                          .updateUpdatePreferences({ [pref.key]: e.target.checked })
                          .then((prefs) =>
                            setUpdateState((prev) => (prev ? { ...prev, preferences: prefs } : prev)),
                          )
                      }
                      className="h-4 w-4 accent-[var(--accent-primary)]"
                    />
                  </label>
                );
              })}
              <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2">
                <span className="text-[var(--text-primary)]">Frekuensi Pemeriksaan</span>
                <AppSelect
                  value={updateState?.preferences.checkFrequency ?? 'startup'}
                  onChange={(v) =>
                    void backendService
                      .updateUpdatePreferences({ checkFrequency: v as UpdateCheckFrequency })
                      .then((prefs) =>
                        setUpdateState((prev) => (prev ? { ...prev, preferences: prefs } : prev)),
                      )
                  }
                  options={[
                    { value: 'startup', label: 'Saat Startup' },
                    { value: 'daily', label: 'Harian' },
                    { value: 'weekly', label: 'Mingguan' },
                    { value: 'manual', label: 'Manual Saja' },
                  ]}
                  className="w-36"
                />
              </div>
            </div>
          </Panel>

          <Panel
            title="Kompatibilitas Runtime, Riwayat &amp; Pemulihan"
            subtitle="Pemeriksaan kesehatan Prisma SQLite & Python Worker serta log pemulihan pasca-pembaruan."
          >
            <div className="grid grid-cols-1 gap-4 text-xs lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text-primary)]">Kompatibilitas Runtime</span>
                  <StatusBadge
                    variant={compatReport?.ok ? 'healthy' : 'warning'}
                    label={compatReport ? (compatReport.ok ? 'Siap Update' : 'Perlu Perhatian') : 'Memeriksa'}
                  />
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-[var(--text-secondary)]">
                  <div>Database SQLite: {compatReport?.databaseReadable ? 'Terhubung' : 'Belum terverifikasi'}</div>
                  <div>Skema Prisma: {compatReport?.prismaSchemaValid ? 'Sinkron' : 'Periksa migrasi'}</div>
                  <div>Python Worker: {compatReport?.pythonWorkerAvailable ? compatReport.pythonVersion ?? 'Siap' : 'Tidak aktif'}</div>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                <div className="font-semibold text-[var(--text-primary)]">Riwayat Pembaruan &amp; Pemulihan</div>
                <div className="mt-2 space-y-1.5 text-[11px] text-[var(--text-secondary)]">
                  {updateHistory.length === 0 && recoveryLogs.length === 0 ? (
                    <div>Belum ada riwayat pembaruan atau log pemulihan tercatat.</div>
                  ) : (
                    <>
                      {updateHistory.slice(0, 3).map((item) => (
                        <div key={`hist-${item.id}`} className="flex justify-between">
                          <span>v{item.fromVersion} → v{item.toVersion} ({item.channel})</span>
                          <span className="font-mono">{item.status}</span>
                        </div>
                      ))}
                      {recoveryLogs.slice(0, 2).map((log) => (
                        <div key={`rec-${log.id}`} className="flex justify-between text-amber-400">
                          <span>{log.action}</span>
                          <span>{log.success ? 'OK' : 'Gagal'}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </Panel>

          <ConfirmDialog
            open={confirmInstallOpen}
            title="Pasang Pembaruan & Restart Aplikasi?"
            description={
              updateState?.activeTasksReason
                ? `Aktivitas aktif terdeteksi (${updateState.activeTasksReason}). Aplikasi akan menghentikan AI/siaran secara aman dan mem-backup database SQLite sebelum restart.`
                : 'Database SQLite userData akan di-backup otomatis sebelum aplikasi di-restart untuk memasang pembaruan.'
            }
            confirmLabel="Hentikan Tugas Aktif & Install"
            cancelLabel="Batal"
            onCancel={() => setConfirmInstallOpen(false)}
            onConfirm={() => {
              setConfirmInstallOpen(false);
              void handleInstallUpdate(true);
            }}
          />
        </div>
      )}

      {tab === 'history' && <SessionHistoryPage logs={logs} />}

      {tab === 'about' && (
        <div className="space-y-6">
          <Panel
            title="Tentang Ngegame (Overthinker-Ngegame)"
            subtitle="Dikembangkan oleh Overthinker Studio — terbuka untuk kontribusi dan dukungan pengembangan."
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-7">
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                  <strong>Ngegame</strong> (<em>Overthinker-Ngegame</em>) adalah pusat kendali AI gaming, pengamatan layar real-time, dan studio siaran langsung lintas platform (Windows &amp; macOS) yang dibangun oleh <strong>Overthinker Studio</strong>.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0B0D12] p-3">
                    <NgegameLogo className="h-9 w-9" withText={false} />
                    <div className="text-xs">
                      <div className="font-semibold text-slate-100">Ngegame (Gelap)</div>
                      <div className="text-[11px] text-slate-400">Ikon utama</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <NgegameLogo className="h-9 w-11" withText={true} />
                    <div className="text-xs">
                      <div className="font-semibold text-slate-900">Ngegame (Terang)</div>
                      <div className="text-[11px] text-slate-600">Kontras tinggi</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs lg:col-span-5">
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">
                    Dukungan Pengembangan
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                    Proyek ini terus dikembangkan secara bertahap. Anda dapat mendukung dengan memberi Star di GitHub, melaporkan bug, atau berkontribusi langsung.
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void backendService.openExternalUrl(
                        ['https:/', 'overthinkerid.github.io', 'Ngegame'].join('/') + '/',
                      )
                    }
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-[11px] font-semibold text-[var(--text-primary)] hover:opacity-90"
                  >
                    Halaman Resmi &amp; Panduan
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void backendService.openExternalUrl(
                        ['https:/', 'github.com', 'OverthinkerID', 'Ngegame'].join('/'),
                      )
                    }
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  >
                    Dukung di GitHub
                  </button>
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="Integrasi Pihak Ketiga &amp; Ekosistem"
            subtitle="Perangkat lunak dan layanan resmi yang terhubung dengan Ngegame."
          >
            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  name: 'Steam Client',
                  role: 'Pemindaian library lokal & peluncuran game',
                  icon: <SteamLogo className="h-6 w-6 shrink-0" />,
                },
                {
                  name: 'OBS Studio (WebSocket v5)',
                  role: 'Kontrol adegan, pratinjau output, & siaran',
                  icon: <ObsLogo className="h-6 w-6 shrink-0" />,
                },
                {
                  name: 'YouTube Live',
                  role: 'Target siaran & penyimpanan kunci terenkripsi',
                  icon: <YouTubeLogo className="h-5 w-6 shrink-0" />,
                },
                {
                  name: 'Twitch',
                  role: 'Target multistream kedua',
                  icon: <TwitchLogo className="h-6 w-6 shrink-0" />,
                },
              ].map((app) => (
                <div
                  key={app.name}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5"
                >
                  {app.icon}
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text-primary)]">{app.name}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{app.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Informasi Lingkungan &amp; Runtime"
            subtitle="Detail proses aktif Electron, Node.js, dan layanan lokal."
          >
            <div className="space-y-2 text-xs">
              {[
                { label: 'Nama Produk', value: 'Ngegame (Overthinker-Ngegame)' },
                { label: 'Pengembang', value: 'Overthinker Studio (OverthinkerID)' },
                { label: 'Versi Rilis', value: appInfo?.version ?? '0.1.0' },
                { label: 'Alamat Backend', value: appInfo?.backendUrl ?? 'http://127.0.0.1:47800' },
                {
                  label: 'Platform Sistem',
                  value: appInfo ? `${appInfo.platform} (${appInfo.arch})` : 'Peramban Web',
                },
                { label: 'Versi Electron', value: appInfo?.electronVersion ?? '-' },
                { label: 'Versi Node.js', value: appInfo?.nodeVersion ?? '-' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5"
                >
                  <span className="text-[var(--text-secondary)]">{item.label}</span>
                  <span className="font-mono text-[var(--text-primary)]">{item.value}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
