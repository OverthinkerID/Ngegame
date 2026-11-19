import { useCallback, useEffect, useState } from 'react';
import { Info, Play, RefreshCw, Search, Square, X } from 'lucide-react';
import type {
  SteamGameCompatibility,
  SteamGameRecord,
  SteamInstallationStatus,
} from '@ngegame/shared';
import { AppSelect, type SelectOption } from '../components/ui/AppSelect.js';
import { SteamLogo } from '../components/ui/BrandIcons.js';
import { EmptyState, ErrorState } from '../components/ui/FeedbackComponents.js';
import { Panel } from '../components/ui/Panel.js';
import { StatCard } from '../components/ui/StatCard.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { backendService } from '../services/backendService.js';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

const COMPAT_OPTIONS: SelectOption<'all' | SteamGameCompatibility>[] = [
  { value: 'all', label: 'Semua Status' },
  { value: 'verified', label: 'Terverifikasi' },
  { value: 'experimental', label: 'Eksperimental' },
  { value: 'unsupported', label: 'Tidak Didukung' },
  { value: 'unknown', label: 'Tidak Diketahui' },
];

export function GameLibraryPage(): React.JSX.Element {
  const [status, setStatus] = useState<SteamInstallationStatus | null>(null);
  const [games, setGames] = useState<SteamGameRecord[]>([]);
  const [query, setQuery] = useState('');
  const [compatFilter, setCompatFilter] = useState<'all' | SteamGameCompatibility>('all');
  const [selectedGame, setSelectedGame] = useState<SteamGameRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSteamData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [steamStatus, savedGames] = await Promise.all([
        backendService.getSteamStatus(),
        backendService.listSteamGames(),
      ]);
      setStatus(steamStatus);
      setGames(savedGames);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data Steam.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSteamData();
  }, [loadSteamData]);

  const handleScan = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await backendService.scanSteamLibrary();
      setStatus(res.installation);
      setGames(res.games);
      setActionMessage(
        res.installation.installed
          ? `Pemindaian selesai: ${res.games.length} game disimpan ke SQLite.`
          : 'Instalasi Steam belum terdeteksi di sistem ini.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memindai pustaka Steam.');
    } finally {
      setLoading(false);
    }
  };

  const handleLaunch = async (game: SteamGameRecord): Promise<void> => {
    setError(null);
    setActionMessage(null);
    try {
      const res = await backendService.launchSteamGame(game.appId);
      setActionMessage(res.message);
      await loadSteamData();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Gagal menjalankan ${game.name}`);
    }
  };

  const handleStop = async (game: SteamGameRecord): Promise<void> => {
    setError(null);
    setActionMessage(null);
    try {
      const res = await backendService.stopSteamGame(game.appId);
      setActionMessage(res.message);
      await loadSteamData();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Gagal menghentikan ${game.name}`);
    }
  };

  const filtered = games.filter((game) => {
    const matchesQuery =
      game.name.toLowerCase().includes(query.toLowerCase()) ||
      String(game.appId).includes(query.trim());
    const matchesCompat =
      compatFilter === 'all' || game.compatibility === compatFilter;
    return matchesQuery && matchesCompat;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Pustaka Game Steam</h2>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          Deteksi instalasi Steam lokal, kelola kompatibilitas adaptor, dan jalankan game secara aman.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Instalasi Steam"
          value={status?.installed ? 'Terdeteksi' : 'Belum Terdeteksi'}
          meta={status?.steamPath ?? 'Pastikan Steam terpasang atau atur STEAM_PATH'}
          icon={<SteamLogo className="h-4 w-4" />}
          badge={
            <StatusBadge
              variant={status?.installed ? 'healthy' : 'warning'}
              label={status?.installed ? 'Terpasang' : 'Tidak Ditemukan'}
            />
          }
        />
        <StatCard
          label="Direktori Pustaka"
          value={`${status?.libraryPaths.length ?? 0} Lokasi`}
          meta={status?.platform ? `Platform: ${status.platform}` : 'Menunggu pemeriksaan'}
        />
        <StatCard
          label="Game Tersimpan (SQLite)"
          value={`${games.length} Game`}
          meta={`${games.filter((g) => g.isRunning).length} sedang berjalan`}
        />
      </section>

      {error && <ErrorState message={error} onRetry={() => void loadSteamData()} />}

      {actionMessage && (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-500">
          {actionMessage}
        </div>
      )}

      <Panel
        title="Daftar Game Lokal"
        subtitle="Dipindai dari berkas manifes appmanifest_*.acf di direktori Steam."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari judul atau AppID..."
                className="studio-input h-9 rounded-lg pl-8 pr-3 text-xs placeholder:text-[var(--text-muted)]"
              />
            </div>

            <AppSelect
              value={compatFilter}
              options={COMPAT_OPTIONS}
              onChange={setCompatFilter}
              className="w-44"
            />

            <button
              type="button"
              onClick={() => void handleScan()}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:opacity-90 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Pindai Pustaka
            </button>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={<SteamLogo className="h-5 w-5" />}
            title={games.length === 0 ? 'Belum Ada Game Steam' : 'Tidak Ada Hasil Pencarian'}
            description={
              games.length === 0
                ? 'Tekan "Pindai Pustaka" untuk membaca instalasi Steam lokal Anda.'
                : 'Coba ubah kata kunci pencarian atau filter status kompatibilitas.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.map((game) => (
              <article
                key={game.appId}
                className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        {game.name}
                      </h3>
                      <p className="mt-0.5 tabular-nums text-xs text-[var(--text-secondary)]">
                        AppID {game.appId} • {formatBytes(game.sizeOnDiskBytes)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {game.isRunning && (
                        <StatusBadge
                          variant="healthy"
                          label={`Berjalan${game.pid ? ` (${game.pid})` : ''}`}
                          pulse={true}
                        />
                      )}
                      <StatusBadge
                        variant={
                          game.compatibility === 'verified'
                            ? 'healthy'
                            : game.compatibility === 'experimental'
                              ? 'warning'
                              : game.compatibility === 'unsupported'
                                ? 'offline'
                                : 'neutral'
                        }
                        label={game.compatibility}
                      />
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    {game.compatibilityReason}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
                  <button
                    type="button"
                    onClick={() => setSelectedGame(game)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <Info className="h-3.5 w-3.5" /> Detail
                  </button>

                  <div className="flex items-center gap-2">
                    {game.isRunning ? (
                      <button
                        type="button"
                        onClick={() => void handleStop(game)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 text-xs font-medium text-rose-500 hover:bg-rose-500/25"
                      >
                        <Square className="h-3 w-3" />
                        Hentikan
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={game.compatibility === 'unsupported'}
                        onClick={() => void handleLaunch(game)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-medium text-emerald-500 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Play className="h-3 w-3" />
                        Jalankan
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {/* Modal Detail Game */}
      {selectedGame && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {selectedGame.name}
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Steam AppID {selectedGame.appId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGame(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
                <span className="text-[var(--text-secondary)]">Ukuran Disk</span>
                <span className="tabular-nums text-[var(--text-primary)]">
                  {formatBytes(selectedGame.sizeOnDiskBytes)}
                </span>
              </div>
              <div className="flex justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
                <span className="text-[var(--text-secondary)]">Direktori Instalasi</span>
                <span className="font-mono text-[var(--text-primary)]">
                  {selectedGame.installDir}
                </span>
              </div>
              <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
                <div className="text-[var(--text-secondary)]">Berkas Eksekusi</div>
                <div className="mt-1 break-all font-mono text-[11px] text-[var(--text-primary)]">
                  {selectedGame.executablePath ?? 'Tidak terdeteksi'}
                </div>
              </div>
              <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
                <div className="text-[var(--text-secondary)]">Catatan Kompatibilitas</div>
                <div className="mt-1 text-[var(--text-primary)]">
                  {selectedGame.compatibilityReason}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
