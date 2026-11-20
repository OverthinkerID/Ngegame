import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  Camera,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  Gamepad2,
  History,
  Keyboard,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  Sliders,
  Target,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import type {
  CalibrationSessionState,
  ControllerExecutionResult,
  GameBrainCycleResult,
  GameMechanicId,
  GameMemoryRecord,
  GameProfile,
  GameProfileVersionRecord,
  PipelineDiagnosticsReport,
  StardewCapabilityLevel,
  SteamScannerDiagnostics,
  VisionAnalysisResult,
} from '@ngegame/shared';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Panel as PanelCard } from '../components/ui/Panel.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { backendService } from '../services/backendService.js';

interface GameAdaptationStudioPageProps {
  onNotify?: (message: string, type?: 'info' | 'success' | 'error') => void;
}

type StudioSection =
  | 'selection'
  | 'profile'
  | 'detection'
  | 'vision'
  | 'controls'
  | 'mechanics'
  | 'strategy'
  | 'goals'
  | 'memory'
  | 'calibration'
  | 'safety'
  | 'diagnostics';

const SECTIONS: Array<{ id: StudioSection; label: string; icon: typeof Sliders }> = [
  { id: 'selection', label: '1. Pilih Game', icon: Gamepad2 },
  { id: 'profile', label: '2. Profil Game', icon: Sliders },
  { id: 'detection', label: '3. Deteksi Game', icon: RefreshCw },
  { id: 'vision', label: '4. Konfigurasi Visi', icon: Eye },
  { id: 'controls', label: '5. Pemetaan Kontrol', icon: Wrench },
  { id: 'mechanics', label: '6. Mekanik Game', icon: Cpu },
  { id: 'strategy', label: '7. Strategi AI', icon: Brain },
  { id: 'goals', label: '8. Tugas & Tujuan', icon: Target },
  { id: 'memory', label: '9. Memori & Belajar', icon: Database },
  { id: 'calibration', label: '10. Kalibrasi (11)', icon: CheckCircle2 },
  { id: 'safety', label: '11. Keamanan', icon: Shield },
  { id: 'diagnostics', label: '12. Diagnostik', icon: Activity },
];

const ALL_MECHANICS: Array<{ id: GameMechanicId; label: string }> = [
  { id: 'movement', label: 'Movement' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'interaction', label: 'Interaction' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'combat', label: 'Combat' },
  { id: 'resource_management', label: 'Resource Management' },
  { id: 'dialogue', label: 'Dialogue' },
  { id: 'quest_objectives', label: 'Quest Objectives' },
  { id: 'time_management', label: 'Time Management' },
  { id: 'building_crafting', label: 'Building / Crafting' },
];

const CALIBRATION_STEP_LABELS = [
  '1. Pilih Game',
  '2. Deteksi Executable',
  '3. Deteksi Jendela',
  '4. Tangkap Layar',
  '5. Kalibrasi Area UI',
  '6. Uji OCR',
  '7. Uji Gerak',
  '8. Uji Pelepasan Tombol',
  '9. Uji Penalaran AI',
  '10. Verifikasi Ambang Kepercayaan',
  '11. Simpan Profil',
];

export function GameAdaptationStudioPage({
  onNotify,
}: GameAdaptationStudioPageProps): React.JSX.Element {
  const [activeSection, setActiveSection] = useState<StudioSection>('selection');
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>('stardew-valley');
  const [profile, setProfile] = useState<GameProfile | null>(null);
  const [validation, setValidation] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [diagnostics, setDiagnostics] = useState<PipelineDiagnosticsReport | null>(null);
  const [steamDiag, setSteamDiag] = useState<SteamScannerDiagnostics | null>(null);
  const [calibration, setCalibration] = useState<CalibrationSessionState | null>(null);
  const [memories, setMemories] = useState<GameMemoryRecord[]>([]);
  const [profileHistory, setProfileHistory] = useState<GameProfileVersionRecord[]>([]);
  const [visionPreview, setVisionPreview] = useState<VisionAnalysisResult | null>(null);
  const [controlTestResult, setControlTestResult] = useState<ControllerExecutionResult | null>(null);
  const [brainResult, setBrainResult] = useState<GameBrainCycleResult | null>(null);
  const [stardewCaps, setStardewCaps] = useState<{
    currentLevel: StardewCapabilityLevel;
    levels: Record<number, { title: string; capabilities: string[]; smapiNote?: string }>;
  } | null>(null);
  const [importText, setImportText] = useState('');
  const [duplicateId, setDuplicateId] = useState('');
  const [duplicateName, setDuplicateName] = useState('');
  const [goalOverride, setGoalOverride] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSelectedGame = useCallback(async (gameId: string) => {
    try {
      const [detail, cal, mem, hist] = await Promise.all([
        backendService.getGameProfile(gameId),
        backendService.getCalibrationState(gameId),
        backendService.listGameMemories(gameId, 30),
        backendService.getGameProfileHistory(gameId, 20).catch(() => []),
      ]);
      setProfile(detail.profile);
      setValidation(detail.validation);
      setCalibration(cal);
      setMemories(mem);
      setProfileHistory(hist);
      if (detail.profile.adapterType === 'stardew_valley') {
        const caps = await backendService.getStardewCapabilities(detail.profile.stardewLevel ?? 1);
        setStardewCaps(caps);
      }
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal memuat profil game', 'error');
    }
  }, [onNotify]);

  const loadAll = useCallback(async () => {
    setBusy(true);
    try {
      const [list, diag, sDiag] = await Promise.all([
        backendService.listGameProfiles(),
        backendService.getAdaptationDiagnostics(),
        backendService.getSteamDiagnostics().catch(() => null),
      ]);
      setProfiles(list);
      setDiagnostics(diag);
      setSteamDiag(sDiag);
      const targetId = list.some((p) => p.gameId === selectedId)
        ? selectedId
        : (list[0]?.gameId ?? 'stardew-valley');
      setSelectedId(targetId);
      await loadSelectedGame(targetId);
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal memuat Adaptation Studio', 'error');
    } finally {
      setBusy(false);
    }
  }, [loadSelectedGame, onNotify, selectedId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSaveProfile = async (): Promise<void> => {
    if (!profile) return;
    setBusy(true);
    try {
      const saved = await backendService.saveGameProfile(profile);
      setProfile(saved);
      await loadSelectedGame(saved.gameId);
      onNotify?.(`Profil '${saved.gameName}' disimpan (v${saved.profileVersion}).`, 'success');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menyimpan profil', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleResetProfile = async (): Promise<void> => {
    if (!profile) return;
    setBusy(true);
    try {
      const reset = await backendService.resetGameProfile(profile.gameId);
      setProfile(reset);
      await loadSelectedGame(reset.gameId);
      onNotify?.(`Profil '${reset.gameName}' direset ke bawaan.`, 'info');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal mereset profil', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (): Promise<void> => {
    if (!profile) return;
    try {
      const json = await backendService.exportGameProfile(profile.gameId);
      await navigator.clipboard?.writeText(json);
      setImportText(json);
      onNotify?.('JSON profil disalin ke clipboard & editor impor.', 'success');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal mengekspor profil', 'error');
    }
  };

  const handleImport = async (): Promise<void> => {
    if (!importText.trim()) return;
    setBusy(true);
    try {
      const imported = await backendService.importGameProfile(importText);
      await loadAll();
      setSelectedId(imported.gameId);
      await loadSelectedGame(imported.gameId);
      onNotify?.(`Profil '${imported.gameName}' berhasil diimpor.`, 'success');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal mengimpor profil', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRunCalibrationStep = async (step: number): Promise<void> => {
    if (!profile) return;
    setBusy(true);
    try {
      const state = await backendService.runCalibrationStep(profile.gameId, step);
      setCalibration(state);
      const stepRes = state.results.find((r) => r.step === step);
      onNotify?.(
        `${stepRes?.name ?? `Langkah ${step}`}: ${stepRes?.detail ?? 'Selesai'}`,
        stepRes?.ok ? 'success' : 'info',
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Kalibrasi gagal', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRunAllCalibration = async (): Promise<void> => {
    if (!profile) return;
    setBusy(true);
    try {
      for (let step = 1; step <= 11; step += 1) {
        const state = await backendService.runCalibrationStep(profile.gameId, step);
        setCalibration(state);
      }
      await loadSelectedGame(profile.gameId);
      onNotify?.('Seluruh 11 langkah kalibrasi selesai dijalankan.', 'success');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Kalibrasi gagal', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRunBrainCycle = async (): Promise<void> => {
    if (!profile) return;
    setBusy(true);
    try {
      const res = await backendService.runGameBrainCycle({
        gameId: profile.gameId,
        dryRun: profile.safetyConfiguration.dryRunByDefault,
        goalOverride: goalOverride.trim() || undefined,
      });
      setBrainResult(res);
      await loadSelectedGame(profile.gameId);
      onNotify?.(
        `Siklus AI Brain: ${res.plan.chosenAction} (${res.approvalStatus})`,
        res.confidenceCheck.passed ? 'success' : 'info',
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menjalankan siklus AI Brain', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleMechanic = (id: GameMechanicId): void => {
    if (!profile) return;
    const exists = profile.mechanicsProfile.enabledMechanics.includes(id);
    const next = exists
      ? profile.mechanicsProfile.enabledMechanics.filter((m) => m !== id)
      : [...profile.mechanicsProfile.enabledMechanics, id];
    setProfile({
      ...profile,
      mechanicsProfile: { enabledMechanics: next },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Game Adaptation Studio"
        description="Kelola profil game versi tervalidasi, pemindaian lintas platform, kalibrasi 11 langkah, AI Game Brain 8-tahap, dan diagnostik pipeline 12-tahap."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={busy || !profile}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Simpan Profil</span>
            </button>
          </div>
        }
      />

      {/* Status Ringkas Profil & Pipeline */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Profil Aktif
          </div>
          <div className="mt-1 text-base font-bold text-[var(--text-primary)]">
            {profile?.gameName ?? 'Memuat...'}
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            v{profile?.profileVersion ?? 1} • {profile?.genre ?? '-'}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Validasi Konfigurasi
          </div>
          <div className="mt-2">
            <StatusBadge
              variant={validation?.valid ? 'healthy' : 'degraded'}
              label={validation?.valid ? 'Valid' : 'Perlu Perhatian'}
            />
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            {validation?.warnings.length ?? 0} peringatan
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Progres Kalibrasi
          </div>
          <div className="mt-1 text-base font-bold text-[var(--text-primary)]">
            {calibration?.completedSteps.length ?? 0} / 11 Langkah
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <div
              className="h-full bg-[var(--accent-primary)] transition-all"
              style={{ width: `${Math.round(((calibration?.completedSteps.length ?? 0) / 11) * 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Status Pipeline AI
          </div>
          <div className="mt-2">
            <StatusBadge
              variant={diagnostics?.overallStatus ?? 'degraded'}
              label={(diagnostics?.overallStatus ?? 'degraded').toUpperCase()}
            />
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            {diagnostics?.controllerStatus ?? '-'}
          </div>
        </div>
      </div>

      {/* Peringatan fitur tidak didukung / validasi */}
      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span>Peringatan Validasi & Kompatibilitas</span>
          </div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {validation.errors.map((e) => (
              <li key={e} className="text-rose-300">
                {e}
              </li>
            ))}
            {validation.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Navigasi 12 Bagian */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2">
        {SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const active = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSection(sec.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* Konten Bagian */}
      {activeSection === 'selection' && (
        <PanelCard
          title="1. Pemilihan & Manajemen Profil Game"
          subtitle="Pilih profil bawaan atau kustom, ekspor/impor JSON, atau reset ke konfigurasi awal."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {profiles.map((p) => (
              <button
                key={p.gameId}
                type="button"
                onClick={() => {
                  setSelectedId(p.gameId);
                  void loadSelectedGame(p.gameId);
                }}
                className={`rounded-xl border p-4 text-left transition-all ${
                  selectedId === p.gameId
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--accent-primary)]/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text-primary)]">{p.gameName}</span>
                  <span className="rounded bg-[var(--surface-card)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                    {p.isBuiltin ? 'Bawaan' : 'Kustom'} • v{p.profileVersion}
                  </span>
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                  {p.genre} • {p.cameraPerspective} • {p.gameEngine}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Ekspor JSON</span>
            </button>
            <button
              type="button"
              onClick={() => void handleResetProfile()}
              disabled={!profile?.isBuiltin}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Bawaan</span>
            </button>
            <button
              type="button"
              disabled={!profile || profile.isBuiltin || busy}
              onClick={() => {
                if (!profile) return;
                setBusy(true);
                void backendService
                  .deleteGameProfile(profile.gameId)
                  .then(async () => {
                    onNotify?.(`Profil '${profile.gameName}' dihapus.`, 'info');
                    setSelectedId('stardew-valley');
                    await loadAll();
                  })
                  .catch((err) => onNotify?.(err instanceof Error ? err.message : 'Gagal menghapus profil', 'error'))
                  .finally(() => setBusy(false));
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Hapus Profil Kustom</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 md:grid-cols-3">
            <input
              type="text"
              value={duplicateId}
              onChange={(e) => setDuplicateId(e.target.value)}
              placeholder="Slug ID baru (mis. stardew-coop)"
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)]"
            />
            <input
              type="text"
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="Nama profil baru"
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
            />
            <button
              type="button"
              disabled={!profile || !duplicateId.trim() || busy}
              onClick={() => {
                if (!profile) return;
                setBusy(true);
                void backendService
                  .duplicateGameProfile(profile.gameId, duplicateId.trim(), duplicateName.trim())
                  .then(async (created) => {
                    setDuplicateId('');
                    setDuplicateName('');
                    await loadAll();
                    setSelectedId(created.gameId);
                    await loadSelectedGame(created.gameId);
                    onNotify?.(`Profil '${created.gameName}' berhasil diduplikasi.`, 'success');
                  })
                  .catch((err) => onNotify?.(err instanceof Error ? err.message : 'Gagal menduplikasi profil', 'error'))
                  .finally(() => setBusy(false));
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:opacity-90 disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Duplikat Profil Aktif</span>
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              Impor Profil JSON
            </label>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={4}
              placeholder='Tempel JSON profil game di sini...'
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2.5 font-mono text-xs text-[var(--text-primary)]"
            />
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={!importText.trim() || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Impor Profil ke SQLite</span>
            </button>
          </div>
        </PanelCard>
      )}

      {activeSection === 'profile' && profile && (
        <PanelCard title="2. Metadata Profil Game" subtitle="Identitas teknis, engine, resolusi target, skema kontrol, dan riwayat versi.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Nama Game</label>
              <input
                type="text"
                value={profile.gameName}
                onChange={(e) => setProfile({ ...profile, gameName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Game Engine</label>
              <input
                type="text"
                value={profile.gameEngine}
                onChange={(e) => setProfile({ ...profile, gameEngine: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Perspektif Kamera</label>
              <select
                value={profile.cameraPerspective}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    cameraPerspective: e.target.value as GameProfile['cameraPerspective'],
                  })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                <option value="top_down">Top Down</option>
                <option value="isometric">Isometric</option>
                <option value="first_person">First Person</option>
                <option value="third_person">Third Person</option>
                <option value="side_scroller">Side Scroller</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Skema Kontrol</label>
              <select
                value={profile.controlScheme}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    controlScheme: e.target.value as GameProfile['controlScheme'],
                  })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                <option value="keyboard_mouse">Keyboard + Mouse</option>
                <option value="keyboard_only">Keyboard Only</option>
                <option value="gamepad">Gamepad</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Lebar Resolusi (px)</label>
              <input
                type="number"
                value={profile.resolution.width}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    resolution: { ...profile.resolution, width: Number(e.target.value) || 1280 },
                  })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Tinggi Resolusi (px)</label>
              <input
                type="number"
                value={profile.resolution.height}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    resolution: { ...profile.resolution, height: Number(e.target.value) || 720 },
                  })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-primary)]"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--text-secondary)]">Path Executable</label>
              <input
                type="text"
                value={profile.executablePath ?? ''}
                onChange={(e) => setProfile({ ...profile, executablePath: e.target.value || null })}
                placeholder="Diisi otomatis saat kalibrasi atau pindai Steam"
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
              <History className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              <span>Riwayat Perubahan Konfigurasi (SQLite)</span>
            </div>
            {profileHistory.length === 0 ? (
              <div className="text-xs text-[var(--text-secondary)]">Belum ada riwayat perubahan tersimpan.</div>
            ) : (
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                {profileHistory.map((h) => (
                  <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-[11px]">
                    <span>
                      <strong>v{h.profileVersion}</strong> • {h.changeSummary} ({h.author})
                    </span>
                    <span className="text-[var(--text-muted)]">{h.createdAt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PanelCard>
      )}

      {activeSection === 'detection' && (
        <PanelCard
          title="3. Deteksi Game & Diagnostik Steam Scanner"
          subtitle="Hasil nyata dari WindowsSteamScanner / MacOSSteamScanner / LinuxSteamScanner."
        >
          {steamDiag ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg bg-[var(--bg-secondary)] p-3">
                  <div className="text-[var(--text-muted)]">Scanner Aktif</div>
                  <div className="mt-1 font-semibold">{steamDiag.scannerName}</div>
                </div>
                <div className="rounded-lg bg-[var(--bg-secondary)] p-3">
                  <div className="text-[var(--text-muted)]">Registry Windows</div>
                  <div className="mt-1 font-semibold">
                    {steamDiag.registryQueried ? steamDiag.registrySteamPath ?? 'Tidak ditemukan' : 'N/A (Non-Windows)'}
                  </div>
                </div>
                <div className="rounded-lg bg-[var(--bg-secondary)] p-3">
                  <div className="text-[var(--text-muted)]">Pustaka Ditemukan</div>
                  <div className="mt-1 font-semibold">{steamDiag.librariesFound.length}</div>
                </div>
                <div className="rounded-lg bg-[var(--bg-secondary)] p-3">
                  <div className="text-[var(--text-muted)]">Manifest Stale</div>
                  <div className="mt-1 font-semibold">{steamDiag.staleManifests.length}</div>
                </div>
              </div>
              <div className="rounded-lg bg-[var(--bg-secondary)] p-3">
                <div className="font-semibold text-[var(--text-primary)]">Jalur Kandidat Diperiksa:</div>
                <ul className="mt-1 list-disc pl-5 text-[var(--text-secondary)]">
                  {steamDiag.candidatePathsChecked.map((c) => (
                    <li key={c} className="font-mono">{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-secondary)]">Belum ada data diagnostik scanner.</div>
          )}
        </PanelCard>
      )}

      {activeSection === 'vision' && profile && (
        <PanelCard title="4. Konfigurasi Visi & Region UI" subtitle="Pengaturan interval tangkapan layar, OCR, dan area HUD terstruktur.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Interval Target (ms)</label>
              <input
                type="number"
                value={profile.visionProfile.targetIntervalMs}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    visionProfile: {
                      ...profile.visionProfile,
                      targetIntervalMs: Number(e.target.value) || 900,
                    },
                  })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Ambang Gerak</label>
              <input
                type="number"
                step="0.01"
                value={profile.visionProfile.motionThreshold}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    visionProfile: {
                      ...profile.visionProfile,
                      motionThreshold: Number(e.target.value) || 0.05,
                    },
                  })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs"
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={profile.visionProfile.enableOcr}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    visionProfile: { ...profile.visionProfile, enableOcr: e.target.checked },
                  })
                }
              />
              <span>Aktifkan Ekstraksi OCR</span>
            </label>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Region UI Terdaftar &amp; Preview Screen Capture:
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void backendService
                    .captureVisionOnce({ windowTitle: profile.gameName })
                    .then((res) => {
                      setVisionPreview(res);
                      onNotify?.(
                        `Preview layar tertangkap (${res.width}x${res.height}, ${res.processingMs}ms).`,
                        'success',
                      );
                    })
                    .catch((err) =>
                      onNotify?.(err instanceof Error ? err.message : 'Gagal menangkap layar', 'error'),
                    )
                    .finally(() => setBusy(false));
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:opacity-90 disabled:opacity-40"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Ambil Preview &amp; Uji Objek</span>
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {profile.uiProfile.regions.map((r) => (
                <div key={r.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2.5 text-xs">
                  <div className="font-semibold">{r.label} ({r.purpose})</div>
                  <div className="text-[var(--text-secondary)]">
                    x={r.xPercent}%, y={r.yPercent}%, w={r.widthPercent}%, h={r.heightPercent}%
                  </div>
                </div>
              ))}
            </div>
            {visionPreview && (
              <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 md:grid-cols-2">
                {visionPreview.imageBase64 ? (
                  <img
                    src={
                      visionPreview.imageBase64.startsWith('data:')
                        ? visionPreview.imageBase64
                        : `data:image/png;base64,${visionPreview.imageBase64}`
                    }
                    alt="Preview Screen Capture"
                    className="max-h-56 w-full rounded-lg border border-[var(--border-subtle)] object-contain"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                    Gambar tidak tersedia
                  </div>
                )}
                <div className="space-y-1.5 text-xs">
                  <div><strong>Jendela:</strong> {visionPreview.windowTitle} ({visionPreview.width}x{visionPreview.height})</div>
                  <div><strong>Scene:</strong> {visionPreview.sceneLabel} • Motion: {visionPreview.motionScore}</div>
                  <div><strong>OCR:</strong> {visionPreview.ocrText || '(kosong)'}</div>
                  <div><strong>Objek Terdeteksi:</strong> {visionPreview.objects.length} • HUD: {visionPreview.hud.length}</div>
                </div>
              </div>
            )}
          </div>
        </PanelCard>
      )}

      {activeSection === 'controls' && profile && (
        <PanelCard title="5. Pemetaan Kontrol & Safeguard" subtitle="Keyboard, mouse, durasi tekan aman, cooldown, dan uji input langsung.">
          <div className="space-y-2">
            {profile.inputMapping.map((bind, idx) => (
              <div
                key={`${bind.actionType}-${idx}`}
                className="grid grid-cols-1 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 text-xs md:grid-cols-5"
              >
                <div className="font-semibold text-[var(--text-primary)]">{bind.actionType}</div>
                <div>Key: <span className="font-mono">{bind.keyboard ?? '-'}</span></div>
                <div>Mouse: <span className="font-mono">{bind.mouse ?? '-'}</span></div>
                <div>Hold: {bind.holdDurationMs}ms / Cooldown: {bind.cooldownMs}ms</div>
                <div className="text-[var(--text-secondary)]">{bind.requiresFocus ? 'Wajib Fokus' : 'Bebas Fokus'}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void backendService
                  .executeControllerAction({
                    actionType: 'MOVE_DIRECTION',
                    target: 'test_w',
                    parameters: { key: 'w' },
                    durationMs: 200,
                    dryRun: profile.safetyConfiguration.dryRunByDefault,
                  })
                  .then((res) => {
                    setControlTestResult(res);
                    onNotify?.(`Uji Gerak W: ${res.status} (${res.reason})`, res.ok ? 'success' : 'error');
                  })
                  .finally(() => setBusy(false));
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
            >
              <Keyboard className="h-3.5 w-3.5" />
              <span>Test Keyboard (W)</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void backendService
                  .executeControllerAction({
                    actionType: 'INTERACT',
                    target: 'test_e',
                    parameters: { key: 'e' },
                    durationMs: 150,
                    dryRun: profile.safetyConfiguration.dryRunByDefault,
                  })
                  .then((res) => {
                    setControlTestResult(res);
                    onNotify?.(`Uji Interaksi E: ${res.status} (${res.reason})`, res.ok ? 'success' : 'error');
                  })
                  .finally(() => setBusy(false));
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
            >
              <span>Test Interaksi (E)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                void backendService.releaseAllKeys().then(() => {
                  onNotify?.('Semua tombol dilepas aman.', 'info');
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300"
            >
              <span>Release All Keys</span>
            </button>
          </div>
          {controlTestResult && (
            <div className="mt-2 rounded-lg bg-[var(--bg-secondary)] p-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
              [{controlTestResult.status}] {controlTestResult.mappedInput} • Window: {controlTestResult.activeWindow} • {controlTestResult.reason}
            </div>
          )}
        </PanelCard>
      )}

      {activeSection === 'mechanics' && profile && (
        <PanelCard title="6. Mekanik Game & Level Kemampuan" subtitle="Aktifkan mekanik yang didukung game agar AI tidak mengasumsikan fitur yang tidak ada.">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {ALL_MECHANICS.map((m) => {
              const enabled = profile.mechanicsProfile.enabledMechanics.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMechanic(m.id)}
                  className={`rounded-lg border p-2.5 text-left text-xs font-medium transition-colors ${
                    enabled
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {profile.adapterType === 'stardew_valley' && stardewCaps && (
            <div className="mt-5 space-y-2">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Kemampuan Progresif Stardew Valley (Level 1–5)
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {Object.entries(stardewCaps.levels).map(([lvl, info]) => (
                  <div
                    key={lvl}
                    className={`rounded-lg border p-3 text-xs ${
                      Number(lvl) === (profile.stardewLevel ?? 1)
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)]'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span>{info.title}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setProfile({ ...profile, stardewLevel: Number(lvl) as StardewCapabilityLevel })
                        }
                        className="rounded bg-[var(--surface-card)] px-2 py-0.5 text-[10px]"
                      >
                        Pilih Level {lvl}
                      </button>
                    </div>
                    <ul className="mt-1 list-disc pl-4 text-[var(--text-secondary)]">
                      {info.capabilities.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    {info.smapiNote && (
                      <div className="mt-1.5 text-[11px] text-amber-300">{info.smapiNote}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </PanelCard>
      )}

      {activeSection === 'strategy' && profile && (
        <PanelCard title="7. Strategi AI (Lokal / Cloud)" subtitle="Pilih mesin penalaran utama dan aturan pemulihan saat aksi gagal.">
          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[var(--text-secondary)]">Provider Utama</label>
              <select
                value={profile.aiStrategy.preferredProvider}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    aiStrategy: {
                      ...profile.aiStrategy,
                      preferredProvider: e.target.value as 'ollama' | 'openai',
                    },
                  })
                }
                className="mt-1 w-full max-w-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2"
              >
                <option value="ollama">Ollama (Lokal)</option>
                <option value="openai">OpenAI (Cloud)</option>
              </select>
            </div>
            <div>
              <div className="font-semibold text-[var(--text-primary)]">Aturan Strategi:</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--text-secondary)]">
                {profile.aiStrategy.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <div>
              <label className="block text-[var(--text-secondary)]">Pemulihan Kegagalan</label>
              <input
                type="text"
                value={profile.aiStrategy.recoveryOnFailure}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    aiStrategy: { ...profile.aiStrategy, recoveryOnFailure: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2"
              />
            </div>
          </div>
        </PanelCard>
      )}

      {activeSection === 'goals' && profile && (
        <PanelCard
          title="8. Tugas, Tujuan & Uji Siklus AI Game Brain (8 Tahap)"
          subtitle="Observe -> Interpret -> Plan -> Check Confidence -> Approval -> Execute -> Verify -> Update Memory."
        >
          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[var(--text-secondary)]">Tujuan Utama Profil</label>
              <input
                type="text"
                value={profile.objectiveProfile.primaryGoal}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    objectiveProfile: { ...profile.objectiveProfile, primaryGoal: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-[var(--text-secondary)]">Override Tujuan Siklus Uji (Opsional)</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={goalOverride}
                  onChange={(e) => setGoalOverride(e.target.value)}
                  placeholder="Contoh: Amati layar kebun dan cek energi"
                  className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => void handleRunBrainCycle()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Jalankan 1 Siklus AI Brain</span>
                </button>
              </div>
            </div>
            {brainResult && (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 font-mono text-[11px]">
                <div>Cycle: {brainResult.cycleId} • Status Persetujuan: {brainResult.approvalStatus}</div>
                <div>Observe: screenState={brainResult.observe.screenState}, confidence={brainResult.observe.confidence}</div>
                <div>Plan: {brainResult.plan.chosenAction} ({brainResult.plan.durationMs}ms) — {brainResult.plan.rationale}</div>
                <div>Confidence Check: {brainResult.confidenceCheck.passed ? 'PASS' : 'BLOCKED'} ({brainResult.confidenceCheck.reason})</div>
                <div>Execution: {brainResult.execution.status} — {brainResult.execution.reason}</div>
                <div>Verification: {brainResult.verification.note}</div>
              </div>
            )}
          </div>
        </PanelCard>
      )}

      {activeSection === 'memory' && profile && (
        <PanelCard title="9. Memori & Pembelajaran Per-Game" subtitle="Short-term, long-term, dan failed-action memory tersimpan di SQLite.">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span>Total entri memori tersimpan: {memories.length}</span>
            <button
              type="button"
              onClick={() => {
                void backendService.clearGameMemories(profile.gameId).then(() => {
                  setMemories([]);
                  onNotify?.('Memori game dibersihkan.', 'info');
                });
              }}
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-rose-300 hover:bg-rose-500/20"
            >
              Bersihkan Memori
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {memories.length === 0 ? (
              <div className="text-xs text-[var(--text-secondary)]">Belum ada rekaman memori untuk game ini.</div>
            ) : (
              memories.map((m) => (
                <div key={m.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{m.key}</span>
                    <span className="rounded bg-[var(--surface-card)] px-2 py-0.5 text-[10px]">
                      {m.memoryType} • conf {m.confidence}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">
                    {JSON.stringify(m.value)}
                  </div>
                </div>
              ))
            )}
          </div>
        </PanelCard>
      )}

      {activeSection === 'calibration' && profile && (
        <PanelCard
          title="10. Wizard Kalibrasi 11 Langkah"
          subtitle="Jalankan verifikasi bertahap sebelum mengizinkan AI mengendalikan gameplay."
          action={
            <button
              type="button"
              onClick={() => void handleRunAllCalibration()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Jalankan Semua 11 Langkah</span>
            </button>
          }
        >
          <div className="space-y-2">
            {CALIBRATION_STEP_LABELS.map((label, idx) => {
              const stepNum = idx + 1;
              const res = calibration?.results.find((r) => r.step === stepNum);
              const done = calibration?.completedSteps.includes(stepNum);
              return (
                <div
                  key={label}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">{label}</div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {res?.detail ?? 'Belum dijalankan'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      variant={done ? 'healthy' : res ? 'degraded' : 'offline'}
                      label={done ? 'Lulus' : res ? 'Perlu Cek' : 'Menunggu'}
                    />
                    <button
                      type="button"
                      onClick={() => void handleRunCalibrationStep(stepNum)}
                      disabled={busy}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1 text-[11px] font-medium hover:bg-[var(--surface-hover)]"
                    >
                      Uji Langkah
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </PanelCard>
      )}

      {activeSection === 'safety' && profile && (
        <PanelCard title="11. Keamanan & Pengawasan Manusia" subtitle="Batas kepercayaan minimum, verifikasi fokus, dan mode dry-run.">
          <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
            <div>
              <label className="block text-[var(--text-secondary)]">
                Ambang Kepercayaan Minimum ({profile.safetyConfiguration.minConfidence})
              </label>
              <input
                type="range"
                min="0.5"
                max="0.98"
                step="0.02"
                value={profile.safetyConfiguration.minConfidence}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    safetyConfiguration: {
                      ...profile.safetyConfiguration,
                      minConfidence: Number(e.target.value),
                    },
                  })
                }
                className="mt-2 w-full"
              />
            </div>
            <div>
              <label className="block text-[var(--text-secondary)]">Durasi Tahan Maksimum (ms)</label>
              <input
                type="number"
                max={2000}
                min={100}
                value={profile.safetyConfiguration.maxHoldDurationMs}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    safetyConfiguration: {
                      ...profile.safetyConfiguration,
                      maxHoldDurationMs: Math.min(2000, Number(e.target.value) || 800),
                    },
                  })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2"
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={profile.safetyConfiguration.requireFocus}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    safetyConfiguration: { ...profile.safetyConfiguration, requireFocus: e.target.checked },
                  })
                }
              />
              <span>Wajib verifikasi fokus jendela game sebelum input</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={profile.safetyConfiguration.dryRunByDefault}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    safetyConfiguration: { ...profile.safetyConfiguration, dryRunByDefault: e.target.checked },
                  })
                }
              />
              <span>Gunakan Dry-Run secara bawaan</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={profile.safetyConfiguration.allowAutoExecute}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    safetyConfiguration: { ...profile.safetyConfiguration, allowAutoExecute: e.target.checked },
                  })
                }
              />
              <span>Izinkan Auto-Execute Level 1 (aksi aman dengan confidence tinggi)</span>
            </label>
          </div>
        </PanelCard>
      )}

      {activeSection === 'diagnostics' && (
        <PanelCard title="12. Diagnostik Pipeline AI 12-Tahap" subtitle="Audit langsung setiap tahap mulai dari deteksi game hingga pembelajaran memori.">
          <div className="space-y-2">
            {(diagnostics?.stages ?? []).map((s) => (
              <div
                key={s.stage}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 text-xs"
              >
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">{s.label}</div>
                  <div className="text-[var(--text-secondary)]">{s.detail}</div>
                </div>
                <StatusBadge variant={s.status} label={s.status.toUpperCase()} />
              </div>
            ))}
          </div>
        </PanelCard>
      )}
    </div>
  );
}
