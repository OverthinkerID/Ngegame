import { History, Info, Moon, Palette, Shield, Sun } from 'lucide-react';
import { useState } from 'react';
import type { AppInfo, SystemLogEntry } from '@ngegame/shared';
import { NgegameLogo } from '../components/ui/OverthinkerLogo.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Panel } from '../components/ui/Panel.js';
import { useTheme } from '../context/ThemeContext.js';
import type { PageId, ThemeAccent } from '../types/dashboard.js';
import { SessionHistoryPage } from './SessionHistoryPage.js';

interface SettingsPageProps {
  appInfo: AppInfo | null;
  logs?: SystemLogEntry[];
  onNavigate?: (page: PageId) => void;
}

type SettingsTab = 'appearance' | 'integrations' | 'history' | 'about';

const ACCENT_OPTIONS: { id: ThemeAccent; label: string; desc: string; swatch: string }[] = [
  { id: 'violet', label: 'Studio Violet', desc: 'Ungu futuristik (#8B5CF6)', swatch: 'bg-[#8B5CF6]' },
  { id: 'cyan', label: 'Electric Sky', desc: 'Biru modern (#38BDF8)', swatch: 'bg-[#38BDF8]' },
  { id: 'emerald', label: 'Emerald Studio', desc: 'Hijau presisi (#22C55E)', swatch: 'bg-[#22C55E]' },
  { id: 'overthinker', label: 'Overthinker Olive', desc: 'Olive khas Overthinker', swatch: 'bg-[#6F9C4E]' },
];

export function SettingsPage({
  appInfo,
  logs = [],
  onNavigate,
}: SettingsPageProps): React.JSX.Element {
  const { mode, setMode, accent, setAccent } = useTheme();
  const [tab, setTab] = useState<SettingsTab>('appearance');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengaturan Aplikasi"
        description="Konfigurasi tampilan gelap/terang, akses cepat modul AI/Suara/OBS, keamanan, riwayat sesi, dan tentang aplikasi."
        actions={
          <div className="inline-flex rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1">
            {[
              { id: 'appearance' as SettingsTab, label: 'Tampilan', icon: Palette },
              { id: 'integrations' as SettingsTab, label: 'Layanan & Keamanan', icon: Shield },
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

      {tab === 'history' && <SessionHistoryPage logs={logs} />}

      {tab === 'about' && (
        <div className="space-y-6">
          <Panel
            title="Tentang Overthinker-Ngegame"
            subtitle="Identitas visual aplikasi dan informasi arsitektur desktop."
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0B0D12] p-4">
                <NgegameLogo className="h-11 w-11" withText={false} />
                <div className="text-xs">
                  <div className="font-semibold text-slate-100">Ikon Aplikasi (Gelap)</div>
                  <div className="text-slate-400">Latar transparan</div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0B0D12] p-4">
                <NgegameLogo className="h-12 w-14" withText={true} />
                <div className="text-xs">
                  <div className="font-semibold text-slate-100">Logo &amp; Teks (Gelap)</div>
                  <div className="text-slate-400">Identitas penuh</div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <NgegameLogo className="h-12 w-14" withText={true} />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">Logo &amp; Teks (Terang)</div>
                  <div className="text-slate-600">Kontras tinggi</div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="Informasi Lingkungan &amp; Runtime"
            subtitle="Detail proses aktif Electron, Node.js, dan layanan lokal."
          >
            <div className="space-y-2 text-xs">
              {[
                { label: 'Nama Produk', value: 'Overthinker-Ngegame' },
                { label: 'Versi Rilis', value: appInfo?.version ?? '0.1.0' },
                { label: 'Alamat Backend', value: appInfo?.backendUrl ?? 'http://localhost:47800' },
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
