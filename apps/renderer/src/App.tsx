import { useCallback, useEffect, useState } from 'react';
import type {
  AnalyticsSummaryReport,
  AppInfo,
  StreamingStatusResponse,
  SupervisionState,
  SystemHealthResponse,
  SystemLogEntry,
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
import { AIControlPage } from './pages/AIControlPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { GameAdaptersPage } from './pages/GameAdaptersPage.js';
import { GameLibraryPage } from './pages/GameLibraryPage.js';
import { LiveStreamingPage } from './pages/LiveStreamingPage.js';
import { MainDashboardPage } from './pages/MainDashboardPage.js';
import { SessionHistoryPage } from './pages/SessionHistoryPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { SystemMonitorPage } from './pages/SystemMonitorPage.js';
import { VisionMonitorPage } from './pages/VisionMonitorPage.js';
import { VoiceStudioPage } from './pages/VoiceStudioPage.js';
import { backendService } from './services/backendService.js';
import type { PageId } from './types/dashboard.js';

function DashboardShell(): React.JSX.Element {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [supervision, setSupervision] = useState<SupervisionState | null>(null);
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummaryReport | null>(null);
  const [streamingStatus, setStreamingStatus] = useState<StreamingStatusResponse | null>(null);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [confirmEmergency, setConfirmEmergency] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(
    null,
  );

  const refreshBackendData = useCallback(async (silent = false) => {
    setLoading(true);
    setError(null);
    try {
      const [info, healthData, recentLogs, summary, stream, sup] = await Promise.all([
        backendService.getAppInfo(),
        backendService.getHealth(),
        backendService.getRecentLogs(30),
        backendService.getAnalyticsSummary().catch(() => null),
        backendService.getStreamingStatus().catch(() => null),
        backendService.getSupervisionState().catch(() => null),
      ]);
      setAppInfo(info);
      setHealth(healthData);
      setLogs(recentLogs);
      if (summary) setAnalytics(summary);
      if (stream) setStreamingStatus(stream);
      if (sup) setSupervision(sup);
      if (!silent) {
        setToast({ message: 'Status sistem berhasil diperbarui.', type: 'success' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal terhubung ke layanan backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePingWorker = async (): Promise<void> => {
    setPinging(true);
    setError(null);
    try {
      const res = await backendService.pingWorker();
      setLastPing(JSON.stringify(res, null, 2));
      setToast({ message: 'Python Worker merespons dengan normal.', type: 'success' });
      await refreshBackendData(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghubungi Python Worker.';
      setError(msg);
      setToast({ message: msg, type: 'error' });
    } finally {
      setPinging(false);
    }
  };

  const handlePauseOrResumeAI = async (): Promise<void> => {
    try {
      const updated = supervision?.aiPaused
        ? await backendService.resumeAI()
        : await backendService.pauseAI();
      setSupervision(updated);
      setToast({
        message: updated.aiPaused ? 'AI dijeda.' : 'AI dilanjutkan.',
        type: 'info',
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Gagal mengubah status AI.',
        type: 'error',
      });
    }
  };

  const handleTakeoverOrReturn = async (): Promise<void> => {
    try {
      const updated =
        supervision?.controlOwner === 'human'
          ? await backendService.returnControlToAI()
          : await backendService.takeOverControl();
      setSupervision(updated);
      setToast({
        message:
          updated.controlOwner === 'human'
            ? 'Kendali diambil alih oleh manusia.'
            : 'Kendali dikembalikan ke AI.',
        type: 'success',
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Gagal mengubah pemegang kendali.',
        type: 'error',
      });
    }
  };

  useEffect(() => {
    void refreshBackendData(true);
  }, [refreshBackendData]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

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
            onNotify={(message, type = 'info') => setToast({ message, type })}
          />
        );
      case 'library':
        return <GameLibraryPage />;
      case 'ai-control':
        return <AIControlPage />;
      case 'vision':
        return <VisionMonitorPage />;
      case 'adapters':
        return <GameAdaptersPage />;
      case 'streaming':
        return <LiveStreamingPage />;
      case 'voice':
        return <VoiceStudioPage />;
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
        return <SettingsPage appInfo={appInfo} logs={logs} onNavigate={setActivePage} />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-main)] text-[var(--text-primary)]">
      <Sidebar activePage={activePage} onSelectPage={setActivePage} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          activePage={activePage}
          health={health}
          supervision={supervision}
          logs={logs}
          obsConnected={Boolean(streamingStatus?.obsConnected)}
          loading={loading}
          pinging={pinging}
          platform={appInfo?.platform}
          onSelectPage={setActivePage}
          onRefresh={() => void refreshBackendData(false)}
          onPingWorker={() => void handlePingWorker()}
          onPauseOrResumeAI={() => void handlePauseOrResumeAI()}
          onTakeoverOrReturn={() => void handleTakeoverOrReturn()}
          onRequestEmergencyStop={() => setConfirmEmergency(true)}
        />

        <main className="flex-1 overflow-y-auto p-6">
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
            setToast({
              message: 'Emergency Stop aktif. Semua input AI dihentikan.',
              type: 'error',
            });
          });
        }}
      />

      <ToastNotification
        message={toast?.message ?? null}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}

export function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <DashboardShell />
    </ThemeProvider>
  );
}
