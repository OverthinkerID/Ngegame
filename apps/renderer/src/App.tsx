import { useCallback, useEffect, useState } from 'react';
import type {
  AnalyticsSummaryReport,
  AppInfo,
  StreamingStatusResponse,
  SystemHealthResponse,
  SystemLogEntry,
} from '@ngegame/shared';
import { GlobalStatusBar } from './components/layout/GlobalStatusBar.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { Topbar } from './components/layout/Topbar.js';
import { ErrorState, ToastNotification } from './components/ui/FeedbackComponents.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { AIControlPage } from './pages/AIControlPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { GameAdaptersPage } from './pages/GameAdaptersPage.js';
import { GameLibraryPage } from './pages/GameLibraryPage.js';
import { LiveStreamingPage } from './pages/LiveStreamingPage.js';
import { MainDashboardPage } from './pages/MainDashboardPage.js';
import { SessionHistoryPage } from './pages/SessionHistoryPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { VisionMonitorPage } from './pages/VisionMonitorPage.js';
import { VoiceStudioPage } from './pages/VoiceStudioPage.js';
import { backendService } from './services/backendService.js';
import type { PageId } from './types/dashboard.js';

function DashboardShell(): React.JSX.Element {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummaryReport | null>(null);
  const [streamingStatus, setStreamingStatus] = useState<StreamingStatusResponse | null>(null);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(
    null,
  );

  const refreshBackendData = useCallback(async (silent = false) => {
    setLoading(true);
    setError(null);
    try {
      const [info, healthData, recentLogs, summary, stream] = await Promise.all([
        backendService.getAppInfo(),
        backendService.getHealth(),
        backendService.getRecentLogs(20),
        backendService.getAnalyticsSummary().catch(() => null),
        backendService.getStreamingStatus().catch(() => null),
      ]);
      setAppInfo(info);
      setHealth(healthData);
      setLogs(recentLogs);
      if (summary) setAnalytics(summary);
      if (stream) setStreamingStatus(stream);
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
      case 'history':
        return <SessionHistoryPage logs={logs} />;
      case 'analytics':
        return <AnalyticsPage />;
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
          obsConnected={Boolean(streamingStatus?.obsConnected)}
          loading={loading}
          pinging={pinging}
          platform={appInfo?.platform}
          onSelectPage={setActivePage}
          onRefresh={() => void refreshBackendData(false)}
          onPingWorker={() => void handlePingWorker()}
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
