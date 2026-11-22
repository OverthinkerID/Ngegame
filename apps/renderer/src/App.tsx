import { useCallback, useEffect, useState } from 'react';
import type {
  AnalyticsSummaryReport,
  AppInfo,
  SteamGameRecord,
  StreamingStatusResponse,
  SupervisionState,
  SystemHealthResponse,
  SystemLogEntry,
  UpdateState,
} from '@ngegame/shared';
import { GlobalStatusBar } from './components/layout/GlobalStatusBar.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { Topbar } from './components/layout/Topbar.js';
import {
  ConfirmDialog,
  ErrorState,
  ToastNotification,
} from './components/ui/FeedbackComponents.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { AppStateProvider } from './context/AppStateContext.js';
import { AIControlPage } from './pages/AIControlPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { GameAdaptationStudioPage } from './pages/GameAdaptationStudioPage.js';
import { GameAdaptersPage } from './pages/GameAdaptersPage.js';
import { GameLibraryPage } from './pages/GameLibraryPage.js';
import { LiveStreamingPage } from './pages/LiveStreamingPage.js';
import { MainDashboardPage } from './pages/MainDashboardPage.js';
import { SessionHistoryPage } from './pages/SessionHistoryPage.js';
import { SettingsPage, type SettingsTab } from './pages/SettingsPage.js';
import { StreamIntelligencePage } from './pages/StreamIntelligencePage.js';
import { SystemMonitorPage } from './pages/SystemMonitorPage.js';
import { VisionMonitorPage } from './pages/VisionMonitorPage.js';
import { VoiceStudioPage } from './pages/VoiceStudioPage.js';
import { BACKEND_WS_URL, backendService } from './services/backendService.js';
import { wsManager } from './services/wsManager.js';
import type { PageId } from './types/dashboard.js';
import { parseFriendlyError } from './utils/guideHelper.js';

interface ToastState {
  message: string;
  type: 'info' | 'success' | 'error';
  guideUrl?: string;
  guideLabel?: string;
}

function DashboardShell(): React.JSX.Element {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance');
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [supervision, setSupervision] = useState<SupervisionState | null>(null);
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [scannedGames, setScannedGames] = useState<SteamGameRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummaryReport | null>(null);
  const [streamingStatus, setStreamingStatus] = useState<StreamingStatusResponse | null>(null);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [confirmEmergency, setConfirmEmergency] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showNotify = useCallback(
    (
      message: string,
      type: 'info' | 'success' | 'error' = 'info',
      guideUrl?: string,
      guideLabel?: string,
    ) => {
      setToast({ message, type, guideUrl, guideLabel });
    },
    [],
  );

  const refreshBackendData = useCallback(async (silent = false) => {
    setLoading(true);
    setError(null);
    try {
      const info = await backendService.getAppInfo().catch(() => null);
      if (info) setAppInfo(info);

      const [healthData, recentLogs, summary, stream, sup, games] = await Promise.all([
        backendService.getHealth(),
        backendService.getRecentLogs(30),
        backendService.getAnalyticsSummary().catch(() => null),
        backendService.getStreamingStatus().catch(() => null),
        backendService.getSupervisionState().catch(() => null),
        backendService.listSteamGames().catch(() => []),
      ]);
      setHealth(healthData);
      setLogs(recentLogs);
      setScannedGames(games);
      if (summary) setAnalytics(summary);
      if (stream) setStreamingStatus(stream);
      if (sup) setSupervision(sup);
      if (!silent) {
        showNotify('Status sistem berhasil diperbarui.', 'success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal terhubung ke layanan backend.');
    } finally {
      setLoading(false);
    }
  }, [showNotify]);

  const handlePingWorker = async (): Promise<void> => {
    setPinging(true);
    setError(null);
    try {
      const res = await backendService.pingWorker();
      setLastPing(JSON.stringify(res, null, 2));
      showNotify('Python Worker merespons dengan normal.', 'success');
      await refreshBackendData(true);
    } catch (err) {
      const friendly = parseFriendlyError(err, 'Gagal menghubungi Python Worker.');
      setError(friendly.message);
      showNotify(friendly.message, 'error', friendly.guideUrl, friendly.guideLabel);
    } finally {
      setPinging(false);
    }
  };

  const handleLaunchQuickGame = async (game: SteamGameRecord): Promise<void> => {
    try {
      const res = await backendService.launchSteamGame(game.appId);
      showNotify(res.message, 'success');
      await refreshBackendData(true);
    } catch (err) {
      const friendly = parseFriendlyError(err, `Gagal menjalankan ${game.name}.`);
      showNotify(friendly.message, 'error', friendly.guideUrl, friendly.guideLabel);
    }
  };

  const handlePauseOrResumeAI = async (): Promise<void> => {
    try {
      const updated = supervision?.aiPaused
        ? await backendService.resumeAI()
        : await backendService.pauseAI();
      setSupervision(updated);
      showNotify(updated.aiPaused ? 'AI dijeda.' : 'AI dilanjutkan.', 'info');
    } catch (err) {
      const friendly = parseFriendlyError(err, 'Gagal mengubah status AI.');
      showNotify(friendly.message, 'error', friendly.guideUrl, friendly.guideLabel);
    }
  };

  const handleTakeoverOrReturn = async (): Promise<void> => {
    try {
      const updated =
        supervision?.controlOwner === 'human'
          ? await backendService.returnControlToAI()
          : await backendService.takeOverControl();
      setSupervision(updated);
      showNotify(
        updated.controlOwner === 'human'
          ? 'Kendali diambil alih oleh manusia.'
          : 'Kendali dikembalikan ke AI.',
        'success',
      );
    } catch (err) {
      const friendly = parseFriendlyError(err, 'Gagal mengubah pemegang kendali.');
      showNotify(friendly.message, 'error', friendly.guideUrl, friendly.guideLabel);
    }
  };

  useEffect(() => {
    void refreshBackendData(true);
    void backendService.getUpdaterState().then(setUpdateState).catch(() => undefined);
    void backendService
      .getRuntimeStateMap()
      .then((state) => {
        if (typeof state.activePage === 'string') {
          setActivePage(state.activePage as PageId);
        }
        if (typeof state.settingsTab === 'string') {
          setSettingsTab(state.settingsTab as SettingsTab);
        }
      })
      .catch(() => undefined);
    return backendService.onUpdaterStateChanged((st) => setUpdateState(st));
  }, [refreshBackendData]);

  const handleSelectPage = useCallback((page: PageId) => {
    setActivePage(page);
    void backendService.setRuntimeState('activePage', page).catch(() => undefined);
  }, []);

  useEffect(() => {
    const wsUrl = appInfo?.backendUrl
      ? `${appInfo.backendUrl.replace(/^http/, 'ws')}/ws`
      : BACKEND_WS_URL;
    const releaseWs = wsManager.retain(wsUrl);
    const unsubEvents = wsManager.subscribe((msg) => {
      if (msg.type === 'runtime:state' || msg.type === 'runtime:cycle') {
        void refreshBackendData(true);
      }
    });
    const unsubResync = wsManager.onReconnectResync(() => {
      void refreshBackendData(true);
    });
    return () => {
      unsubEvents();
      unsubResync();
      releaseWs();
    };
  }, [appInfo?.backendUrl, refreshBackendData]);

  useEffect(() => {
    if (!toast) return;
    const duration = toast.guideUrl ? 6500 : 3500;
    const id = window.setTimeout(() => setToast(null), duration);
    return () => window.clearTimeout(id);
  }, [toast]);

  const workerOnline = health?.components.pythonWorker.status === 'healthy';

  const renderPage = (): React.JSX.Element => {
    switch (activePage) {
      case 'dashboard':
        return (
          <MainDashboardPage
            appInfo={appInfo}
            health={health}
            logs={logs}
            analytics={analytics}
            streamingStatus={streamingStatus}
            lastPing={lastPing}
            onNavigate={setActivePage}
            onNotify={(message, type = 'info') => showNotify(message, type)}
          />
        );
      case 'library':
        return <GameLibraryPage onNotify={showNotify} onGamesUpdated={setScannedGames} />;
      case 'ai-control':
        return <AIControlPage platform={appInfo?.platform} onNotify={showNotify} />;
      case 'vision':
        return <VisionMonitorPage />;
      case 'adapters':
        return <GameAdaptersPage />;
      case 'adaptation-studio':
        return <GameAdaptationStudioPage onNotify={showNotify} />;
      case 'streaming':
        return <LiveStreamingPage onNotify={showNotify} />;
      case 'stream-intelligence':
        return <StreamIntelligencePage onNotify={showNotify} />;
      case 'voice':
        return <VoiceStudioPage onNotify={showNotify} />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'history':
        return <SessionHistoryPage logs={logs} />;
      case 'system-monitor':
        return (
          <SystemMonitorPage
            appInfo={appInfo}
            health={health}
            analytics={analytics}
            onRefresh={() => void refreshBackendData(false)}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            appInfo={appInfo}
            logs={logs}
            initialTab={settingsTab}
            onNavigate={setActivePage}
            onNotify={showNotify}
          />
        );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-main)] text-[var(--text-primary)]">
      <Sidebar
        activePage={activePage}
        scannedGames={scannedGames}
        workerOnline={workerOnline}
        pinging={pinging}
        onSelectPage={handleSelectPage}
        onPingWorker={() => void handlePingWorker()}
        onLaunchQuickGame={(game) => void handleLaunchQuickGame(game)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          activePage={activePage}
          health={health}
          supervision={supervision}
          logs={logs}
          obsConnected={Boolean(streamingStatus?.obsConnected)}
          loading={loading}
          platform={appInfo?.platform}
          onSelectPage={handleSelectPage}
          onRefresh={() => void refreshBackendData(false)}
          onPauseOrResumeAI={() => void handlePauseOrResumeAI()}
          onTakeoverOrReturn={() => void handleTakeoverOrReturn()}
          onRequestEmergencyStop={() => setConfirmEmergency(true)}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {updateState?.updateAvailable && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-primary-soft)] px-4 py-3 text-xs">
              <div>
                <span className="font-semibold text-[var(--text-primary)]">
                  Pembaruan v{updateState.latestVersion} tersedia
                </span>{' '}
                <span className="text-[var(--text-secondary)]">
                  ({updateState.status === 'downloaded' ? 'Siap dipasang & restart' : 'Siap diunduh dari GitHub Releases'})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSettingsTab('updates');
                  setActivePage('settings');
                }}
                className="rounded-lg border border-[var(--accent-primary)] bg-[var(--surface-card)] px-3 py-1.5 font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              >
                Buka Pembaruan
              </button>
            </div>
          )}
          {error && (
            <div className="mb-5">
              <ErrorState message={error} onRetry={() => void refreshBackendData(false)} />
            </div>
          )}
          {renderPage()}
        </main>

        <GlobalStatusBar
          health={health}
          obsConnected={Boolean(streamingStatus?.obsConnected)}
          analytics={analytics}
        />
      </div>

      <ConfirmDialog
        open={confirmEmergency}
        title="Aktifkan Emergency Stop?"
        description="Seluruh input kendali AI ke game akan dihentikan seketika tanpa menutup game atau OBS Studio."
        confirmLabel="Aktifkan Emergency Stop"
        cancelLabel="Batal"
        danger={true}
        onCancel={() => setConfirmEmergency(false)}
        onConfirm={() => {
          setConfirmEmergency(false);
          void backendService.supervisionEmergencyStop().then((updated) => {
            setSupervision(updated);
            showNotify('Emergency Stop aktif. Semua input AI dihentikan.', 'error');
          });
        }}
      />

      <ToastNotification
        message={toast?.message ?? null}
        type={toast?.type}
        guideUrl={toast?.guideUrl}
        guideLabel={toast?.guideLabel}
        onClose={() => setToast(null)}
      />
    </div>
  );
}

export function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppStateProvider>
        <DashboardShell />
      </AppStateProvider>
    </ThemeProvider>
  );
}
