import { app, BrowserWindow, ipcMain, session, shell, utilityProcess, type UtilityProcess } from 'electron';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IPC_CHANNELS,
  type AdapterResolveRequest,
  type AIBrainConfig,
  type AIBrainDecisionResult,
  type AIBrainThinkRequest,
  type AIProviderHealth,
  type AnalyticsSummaryReport,
  type AppInfo,
  type CalibrationSessionState,
  type ControllerExecuteRequest,
  type ControllerExecutionResult,
  type ControllerState,
  type DetectedWindow,
  type GameAdapterDefinition,
  type GameBrainCycleResult,
  type GameMemoryRecord,
  type GameProfile,
  type PipelineDiagnosticsReport,
  type StardewCapabilityLevel,
  type SteamScannerDiagnostics,
  type SaveStreamCredentialRequest,
  type SteamGameRecord,
  type SteamInstallationStatus,
  type SteamLaunchResult,
  type SteamScanResult,
  type SteamStopResult,
  type StreamingStatusResponse,
  type StreamPlatform,
  type SupervisionAuditEntry,
  type SupervisionPermissionLevel,
  type SupervisionQueueItem,
  type SupervisionSafetyPolicy,
  type SupervisionState,
  type SupervisionSubmitRequest,
  type SystemHealthResponse,
  type SystemLogEntry,
  type ThrottlingConfig,
  type VisionAnalysisResult,
  type VisionMonitorStatus,
  type VoiceCommentaryRequest,
  type VoiceProfile,
  type VoiceServiceStatus,
  type VoiceSettings,
  type VoiceSpeakRequest,
  type VoiceSpeechResult,
  type WorkerResponse,
} from '@ngegame/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_BACKEND_PORT = 47800;
let activeBackendPort = DEFAULT_BACKEND_PORT;
const getBackendUrl = (): string => `http://${LOOPBACK_HOST}:${activeBackendPort}`;
const RENDERER_DEV_URL = 'http://localhost:5173';
const IS_DEV = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let embeddedBackend: UtilityProcess | null = null;
let backendRestartCount = 0;
let lastBackendExitCode: number | null = null;

function clampLimit(raw: unknown, fallback = 15, max = 200): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), 1), max);
}

function assertPositiveInt(raw: unknown, label: string): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
    throw new Error(`Parameter IPC tidak valid: ${label}`);
  }
  return raw;
}

function getLogDir(): string {
  return path.join(app.getPath('userData'), 'logs');
}

function appendBootLog(logDir: string, message: string): void {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'backend-boot.log'),
      `${new Date().toISOString()} ${message}\n`,
      'utf8',
    );
  } catch {
    // Abaikan error penulisan boot log
  }
}

async function resolveAvailablePort(preferredPort: number): Promise<number> {
  const tryListen = (port: number): Promise<number | null> =>
    new Promise((resolve) => {
      const srv = net.createServer();
      srv.unref();
      srv.on('error', () => resolve(null));
      srv.listen(port, LOOPBACK_HOST, () => {
        const addr = srv.address();
        const boundPort = typeof addr === 'object' && addr ? addr.port : port;
        srv.close(() => resolve(boundPort));
      });
    });

  const preferred = await tryListen(preferredPort);
  if (preferred !== null) return preferred;
  const ephemeral = await tryListen(0);
  return ephemeral ?? preferredPort;
}

function startEmbeddedBackendIfPackaged(): void {
  if (IS_DEV || embeddedBackend) return;
  const backendEntry = path.resolve(__dirname, '..', '..', 'backend', 'dist', 'src', 'server.js');
  const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked');
  const workerScript = path.join(unpackedRoot, 'apps', 'python-worker', 'main.py');
  const userDataDir = app.getPath('userData');
  const userDbPath = path.join(userDataDir, 'ngegame.db');
  const templateDbPath = path.join(unpackedRoot, 'apps', 'backend', 'prisma', 'template.sqlite');
  if (!fs.existsSync(userDbPath) && fs.existsSync(templateDbPath)) {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.copyFileSync(templateDbPath, userDbPath);
  }
  const logDir = getLogDir();
  const prismaEngineFile =
    process.platform === 'win32'
      ? 'query_engine-windows.dll.node'
      : 'libquery_engine-darwin-arm64.dylib.node';
  const prismaEnginePath = path.join(
    unpackedRoot,
    'node_modules',
    '.prisma',
    'client',
    prismaEngineFile,
  );

  appendBootLog(
    logDir,
    `Starting embedded backend: ${backendEntry} on ${LOOPBACK_HOST}:${activeBackendPort}`,
  );
  embeddedBackend = utilityProcess.fork(backendEntry, [], {
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      BACKEND_HOST: LOOPBACK_HOST,
      BACKEND_PORT: String(activeBackendPort),
      DATABASE_URL: `file:${userDbPath}`,
      PYTHON_WORKER_PATH: workerScript,
      NGEGAME_LOG_DIR: logDir,
      ...(fs.existsSync(prismaEnginePath)
        ? { PRISMA_QUERY_ENGINE_LIBRARY: prismaEnginePath }
        : {}),
    },
  });

  embeddedBackend.stdout?.on('data', (chunk: Buffer) => {
    appendBootLog(logDir, `[stdout] ${chunk.toString('utf8').trimEnd()}`);
  });
  embeddedBackend.stderr?.on('data', (chunk: Buffer) => {
    appendBootLog(logDir, `[stderr] ${chunk.toString('utf8').trimEnd()}`);
  });
  embeddedBackend.on('exit', (code) => {
    lastBackendExitCode = code;
    appendBootLog(logDir, `Embedded backend exited with code ${code}`);
    embeddedBackend = null;
    if (!IS_DEV && mainWindow && backendRestartCount < 1 && code !== 0) {
      backendRestartCount += 1;
      appendBootLog(logDir, `Attempting safe backend restart (#${backendRestartCount})`);
      startEmbeddedBackendIfPackaged();
    }
  });
}

async function waitForBackendReady(timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${getBackendUrl()}/api/health`);
      if (res.ok) return true;
    } catch {
      // Backend masih booting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  appendBootLog(getLogDir(), `Backend readiness timeout after ${timeoutMs}ms`);
  return false;
}

async function fetchBackendJson<T>(endpoint: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getBackendUrl()}${endpoint}`, init);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const bootLog = path.join(getLogDir(), 'backend-boot.log');
    const exitInfo = lastBackendExitCode !== null ? ` (exit=${lastBackendExitCode})` : '';
    throw new Error(
      `Backend tidak terjangkau di ${getBackendUrl()}${exitInfo}: ${reason}. Periksa log: ${bootLog}`,
    );
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend error (${response.status}): ${text}`);
  }
  return (await response.json()) as T;
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, (): AppInfo => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      backendUrl: getBackendUrl(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_event, rawUrl: unknown): Promise<void> => {
    if (typeof rawUrl !== 'string' || !rawUrl.startsWith('https://')) {
      throw new Error('URL eksternal harus menggunakan protokol https://');
    }
    await shell.openExternal(rawUrl);
  });

  ipcMain.handle(IPC_CHANNELS.BACKEND_HEALTH, async (): Promise<SystemHealthResponse> => {
    return fetchBackendJson<SystemHealthResponse>('/api/health');
  });

  ipcMain.handle(
    IPC_CHANNELS.BACKEND_LOGS,
    async (_event, limit = 10): Promise<SystemLogEntry[]> => {
      const safeLimit = clampLimit(limit, 10);
      const data = await fetchBackendJson<{ logs?: SystemLogEntry[] }>(
        `/api/logs?limit=${safeLimit}`,
      );
      return data.logs ?? [];
    },
  );

  ipcMain.handle(IPC_CHANNELS.WORKER_PING, async (): Promise<WorkerResponse> => {
    return fetchBackendJson<WorkerResponse>('/api/worker/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ping-from-electron' }),
    });
  });

  ipcMain.handle(IPC_CHANNELS.STEAM_STATUS, async (): Promise<SteamInstallationStatus> => {
    return fetchBackendJson<SteamInstallationStatus>('/api/steam/status');
  });

  ipcMain.handle(IPC_CHANNELS.STEAM_LIST_GAMES, async (): Promise<SteamGameRecord[]> => {
    const data = await fetchBackendJson<{ games?: SteamGameRecord[] }>('/api/steam/games');
    return data.games ?? [];
  });

  ipcMain.handle(IPC_CHANNELS.STEAM_SCAN, async (): Promise<SteamScanResult> => {
    return fetchBackendJson<SteamScanResult>('/api/steam/scan', { method: 'POST' });
  });

  ipcMain.handle(
    IPC_CHANNELS.STEAM_LAUNCH,
    async (_event, appId: number): Promise<SteamLaunchResult> => {
      const validAppId = assertPositiveInt(appId, 'appId');
      return fetchBackendJson<SteamLaunchResult>(`/api/steam/games/${validAppId}/launch`, {
        method: 'POST',
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.STEAM_STOP,
    async (_event, appId: number): Promise<SteamStopResult> => {
      const validAppId = assertPositiveInt(appId, 'appId');
      return fetchBackendJson<SteamStopResult>(`/api/steam/games/${validAppId}/stop`, {
        method: 'POST',
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.STEAM_MANUAL_LIBS_LIST, async (): Promise<string[]> => {
    const data = await fetchBackendJson<{ paths?: string[] }>('/api/steam/libraries/manual');
    return data.paths ?? [];
  });

  ipcMain.handle(
    IPC_CHANNELS.STEAM_MANUAL_LIBS_ADD,
    async (_event, libraryPath: string): Promise<string[]> => {
      const data = await fetchBackendJson<{ paths?: string[] }>('/api/steam/libraries/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryPath }),
      });
      return data.paths ?? [];
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.STEAM_MANUAL_LIBS_REMOVE,
    async (_event, libraryPath: string): Promise<string[]> => {
      const data = await fetchBackendJson<{ paths?: string[] }>('/api/steam/libraries/manual', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryPath }),
      });
      return data.paths ?? [];
    },
  );

  ipcMain.handle(IPC_CHANNELS.VISION_STATUS, async (): Promise<VisionMonitorStatus> => {
    return fetchBackendJson<VisionMonitorStatus>('/api/vision/status');
  });

  ipcMain.handle(IPC_CHANNELS.VISION_WINDOWS, async (): Promise<DetectedWindow[]> => {
    const data = await fetchBackendJson<{ windows?: DetectedWindow[] }>('/api/vision/windows');
    return data.windows ?? [];
  });

  ipcMain.handle(
    IPC_CHANNELS.VISION_CAPTURE_ONCE,
    async (_event, options?: { windowTitle?: string; sourcePath?: string }): Promise<VisionAnalysisResult> => {
      return fetchBackendJson<VisionAnalysisResult>('/api/vision/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options ?? {}),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.VISION_START,
    async (_event, options?: { windowTitle?: string; baseIntervalMs?: number }): Promise<VisionMonitorStatus> => {
      return fetchBackendJson<VisionMonitorStatus>('/api/vision/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options ?? {}),
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.VISION_STOP, async (): Promise<VisionMonitorStatus> => {
    return fetchBackendJson<VisionMonitorStatus>('/api/vision/stop', {
      method: 'POST',
    });
  });

  ipcMain.handle(
    IPC_CHANNELS.VISION_HISTORY,
    async (_event, limit = 15): Promise<VisionAnalysisResult[]> => {
      const safeLimit = typeof limit === 'number' ? limit : 15;
      const data = await fetchBackendJson<{ history?: VisionAnalysisResult[] }>(
        `/api/vision/history?limit=${safeLimit}`,
      );
      return data.history ?? [];
    },
  );

  ipcMain.handle(IPC_CHANNELS.AI_GET_CONFIG, async (): Promise<AIBrainConfig> => {
    return fetchBackendJson<AIBrainConfig>('/api/ai/config');
  });

  ipcMain.handle(
    IPC_CHANNELS.AI_UPDATE_CONFIG,
    async (_event, partial: Partial<AIBrainConfig>): Promise<AIBrainConfig> => {
      return fetchBackendJson<AIBrainConfig>('/api/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.AI_PROVIDERS_HEALTH, async (): Promise<AIProviderHealth> => {
    return fetchBackendJson<AIProviderHealth>('/api/ai/providers/health');
  });

  ipcMain.handle(
    IPC_CHANNELS.AI_THINK,
    async (_event, request: AIBrainThinkRequest): Promise<AIBrainDecisionResult> => {
      return fetchBackendJson<AIBrainDecisionResult>('/api/ai/think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_HISTORY,
    async (_event, limit = 15): Promise<AIBrainDecisionResult[]> => {
      const safeLimit = typeof limit === 'number' ? limit : 15;
      const data = await fetchBackendJson<{ history?: AIBrainDecisionResult[] }>(
        `/api/ai/history?limit=${safeLimit}`,
      );
      return data.history ?? [];
    },
  );

  ipcMain.handle(IPC_CHANNELS.CONTROLLER_STATUS, async (): Promise<ControllerState> => {
    return fetchBackendJson<ControllerState>('/api/controller/status');
  });

  ipcMain.handle(
    IPC_CHANNELS.CONTROLLER_EXECUTE,
    async (_event, req: ControllerExecuteRequest): Promise<ControllerExecutionResult> => {
      return fetchBackendJson<ControllerExecutionResult>('/api/controller/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.CONTROLLER_PAUSE, async (): Promise<ControllerState> => {
    return fetchBackendJson<ControllerState>('/api/controller/pause', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.CONTROLLER_RESUME, async (): Promise<ControllerState> => {
    return fetchBackendJson<ControllerState>('/api/controller/resume', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.CONTROLLER_RELEASE_ALL, async (): Promise<ControllerState> => {
    return fetchBackendJson<ControllerState>('/api/controller/release-all', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.CONTROLLER_EMERGENCY_STOP, async (): Promise<ControllerState> => {
    return fetchBackendJson<ControllerState>('/api/controller/emergency-stop', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.CONTROLLER_RESET_EMERGENCY, async (): Promise<ControllerState> => {
    return fetchBackendJson<ControllerState>('/api/controller/reset-emergency', { method: 'POST' });
  });

  ipcMain.handle(
    IPC_CHANNELS.CONTROLLER_HISTORY,
    async (_event, limit = 20): Promise<ControllerExecutionResult[]> => {
      const safeLimit = typeof limit === 'number' ? limit : 20;
      const data = await fetchBackendJson<{ history?: ControllerExecutionResult[] }>(
        `/api/controller/history?limit=${safeLimit}`,
      );
      return data.history ?? [];
    },
  );

  ipcMain.handle(IPC_CHANNELS.ADAPTER_LIST, async (): Promise<GameAdapterDefinition[]> => {
    const data = await fetchBackendJson<{ adapters?: GameAdapterDefinition[] }>('/api/adapters');
    return data.adapters ?? [];
  });

  ipcMain.handle(
    IPC_CHANNELS.ADAPTER_RESOLVE,
    async (_event, req: AdapterResolveRequest): Promise<GameAdapterDefinition> => {
      return fetchBackendJson<GameAdapterDefinition>('/api/adapters/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.SUPERVISION_STATE, async (): Promise<SupervisionState> => {
    return fetchBackendJson<SupervisionState>('/api/supervision/state');
  });

  ipcMain.handle(
    IPC_CHANNELS.SUPERVISION_SET_PERMISSION,
    async (_event, level: SupervisionPermissionLevel): Promise<SupervisionState> => {
      return fetchBackendJson<SupervisionState>('/api/supervision/permission', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionLevel: level }),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SUPERVISION_UPDATE_POLICY,
    async (_event, policy: Partial<SupervisionSafetyPolicy>): Promise<SupervisionState> => {
      return fetchBackendJson<SupervisionState>('/api/supervision/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.SUPERVISION_PAUSE_AI, async (): Promise<SupervisionState> => {
    return fetchBackendJson<SupervisionState>('/api/supervision/pause-ai', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.SUPERVISION_RESUME_AI, async (): Promise<SupervisionState> => {
    return fetchBackendJson<SupervisionState>('/api/supervision/resume-ai', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.SUPERVISION_TAKEOVER, async (): Promise<SupervisionState> => {
    return fetchBackendJson<SupervisionState>('/api/supervision/takeover', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.SUPERVISION_RETURN_AI, async (): Promise<SupervisionState> => {
    return fetchBackendJson<SupervisionState>('/api/supervision/return-ai', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.SUPERVISION_EMERGENCY_STOP, async (): Promise<SupervisionState> => {
    return fetchBackendJson<SupervisionState>('/api/supervision/emergency-stop', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.SUPERVISION_RESET_EMERGENCY, async (): Promise<SupervisionState> => {
    return fetchBackendJson<SupervisionState>('/api/supervision/reset-emergency', { method: 'POST' });
  });

  ipcMain.handle(
    IPC_CHANNELS.SUPERVISION_QUEUE,
    async (_event, limit = 25): Promise<SupervisionQueueItem[]> => {
      const safeLimit = typeof limit === 'number' ? limit : 25;
      const data = await fetchBackendJson<{ items?: SupervisionQueueItem[] }>(
        `/api/supervision/queue?limit=${safeLimit}`,
      );
      return data.items ?? [];
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SUPERVISION_SUBMIT,
    async (_event, req: SupervisionSubmitRequest): Promise<SupervisionQueueItem> => {
      return fetchBackendJson<SupervisionQueueItem>('/api/supervision/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SUPERVISION_APPROVE,
    async (_event, id: number, note?: string): Promise<SupervisionQueueItem> => {
      return fetchBackendJson<SupervisionQueueItem>(`/api/supervision/queue/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SUPERVISION_REJECT,
    async (_event, id: number, note?: string): Promise<SupervisionQueueItem> => {
      return fetchBackendJson<SupervisionQueueItem>(`/api/supervision/queue/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SUPERVISION_AUDIT,
    async (_event, limit = 25): Promise<SupervisionAuditEntry[]> => {
      const safeLimit = typeof limit === 'number' ? limit : 25;
      const data = await fetchBackendJson<{ logs?: SupervisionAuditEntry[] }>(
        `/api/supervision/audit?limit=${safeLimit}`,
      );
      return data.logs ?? [];
    },
  );

  ipcMain.handle(IPC_CHANNELS.VOICE_STATUS, async (): Promise<VoiceServiceStatus> => {
    return fetchBackendJson<VoiceServiceStatus>('/api/voice/status');
  });

  ipcMain.handle(IPC_CHANNELS.VOICE_SETTINGS_GET, async (): Promise<VoiceSettings> => {
    return fetchBackendJson<VoiceSettings>('/api/voice/settings');
  });

  ipcMain.handle(
    IPC_CHANNELS.VOICE_SETTINGS_UPDATE,
    async (_event, partial: Partial<VoiceSettings>): Promise<VoiceSettings> => {
      return fetchBackendJson<VoiceSettings>('/api/voice/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.VOICE_PROFILES, async (): Promise<VoiceProfile[]> => {
    const data = await fetchBackendJson<{ profiles?: VoiceProfile[] }>('/api/voice/profiles');
    return data.profiles ?? [];
  });

  ipcMain.handle(
    IPC_CHANNELS.VOICE_SPEAK,
    async (_event, req: VoiceSpeakRequest): Promise<VoiceSpeechResult> => {
      return fetchBackendJson<VoiceSpeechResult>('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.VOICE_COMMENTARY,
    async (_event, req: VoiceCommentaryRequest): Promise<VoiceSpeechResult> => {
      return fetchBackendJson<VoiceSpeechResult>('/api/voice/commentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.VOICE_HISTORY,
    async (_event, limit = 20): Promise<VoiceSpeechResult[]> => {
      const safeLimit = typeof limit === 'number' ? limit : 20;
      const data = await fetchBackendJson<{ history?: VoiceSpeechResult[] }>(
        `/api/voice/history?limit=${safeLimit}`,
      );
      return data.history ?? [];
    },
  );

  ipcMain.handle(IPC_CHANNELS.STREAM_STATUS, async (): Promise<StreamingStatusResponse> => {
    return fetchBackendJson<StreamingStatusResponse>('/api/streaming/status');
  });

  ipcMain.handle(
    IPC_CHANNELS.STREAM_OBS_CONNECT,
    async (_event, config: { url: string; password?: string }): Promise<StreamingStatusResponse> => {
      return fetchBackendJson<StreamingStatusResponse>('/api/streaming/obs/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.STREAM_OBS_DISCONNECT, async (): Promise<StreamingStatusResponse> => {
    return fetchBackendJson<StreamingStatusResponse>('/api/streaming/obs/disconnect', {
      method: 'POST',
    });
  });

  ipcMain.handle(
    IPC_CHANNELS.STREAM_SET_SCENE,
    async (_event, sceneName: string): Promise<StreamingStatusResponse> => {
      return fetchBackendJson<StreamingStatusResponse>('/api/streaming/scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneName }),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.STREAM_TOGGLE_SOURCE,
    async (_event, sceneItemId: number, visible: boolean): Promise<StreamingStatusResponse> => {
      return fetchBackendJson<StreamingStatusResponse>('/api/streaming/source/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneItemId, visible }),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.STREAM_SET_MUTE,
    async (_event, inputName: string, muted: boolean): Promise<StreamingStatusResponse> => {
      return fetchBackendJson<StreamingStatusResponse>('/api/streaming/audio/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputName, muted }),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.STREAM_SAVE_CREDENTIAL,
    async (_event, req: SaveStreamCredentialRequest): Promise<StreamingStatusResponse> => {
      return fetchBackendJson<StreamingStatusResponse>('/api/streaming/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.STREAM_DELETE_CREDENTIAL,
    async (_event, platform: StreamPlatform): Promise<StreamingStatusResponse> => {
      return fetchBackendJson<StreamingStatusResponse>(`/api/streaming/credentials/${platform}`, {
        method: 'DELETE',
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.STREAM_START, async (): Promise<StreamingStatusResponse> => {
    return fetchBackendJson<StreamingStatusResponse>('/api/streaming/start', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.STREAM_STOP, async (): Promise<StreamingStatusResponse> => {
    return fetchBackendJson<StreamingStatusResponse>('/api/streaming/stop', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.STREAM_PREVIEW, async (): Promise<StreamingStatusResponse> => {
    return fetchBackendJson<StreamingStatusResponse>('/api/streaming/preview', { method: 'POST' });
  });

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_SUMMARY, async (): Promise<AnalyticsSummaryReport> => {
    return fetchBackendJson<AnalyticsSummaryReport>('/api/analytics/summary');
  });

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_THROTTLE_GET, async (): Promise<ThrottlingConfig> => {
    return fetchBackendJson<ThrottlingConfig>('/api/analytics/throttling');
  });

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_THROTTLE_UPDATE,
    async (_event, partial: Partial<ThrottlingConfig>): Promise<ThrottlingConfig> => {
      return fetchBackendJson<ThrottlingConfig>('/api/analytics/throttling', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_EXPORT,
    async (_event, format: 'json' | 'csv'): Promise<string> => {
      const response = await fetch(`${getBackendUrl()}/api/analytics/export?format=${format}`);
      if (!response.ok) {
        throw new Error(`Export error (${response.status})`);
      }
      return response.text();
    },
  );

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_DIAGNOSTICS, async (): Promise<PipelineDiagnosticsReport> => {
    return fetchBackendJson<PipelineDiagnosticsReport>('/api/adaptation/diagnostics');
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_STEAM_DIAGNOSTICS, async (): Promise<SteamScannerDiagnostics | null> => {
    return fetchBackendJson<SteamScannerDiagnostics | null>('/api/adaptation/steam/diagnostics');
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_PROFILES_LIST, async (): Promise<GameProfile[]> => {
    const data = await fetchBackendJson<{ profiles?: GameProfile[] }>('/api/adaptation/profiles');
    return data.profiles ?? [];
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_PROFILE_GET, async (_event, gameId: string) => {
    return fetchBackendJson<{ profile: GameProfile; validation: { valid: boolean; errors: string[]; warnings: string[] } }>(`/api/adaptation/profiles/${encodeURIComponent(gameId)}`);
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_PROFILE_SAVE, async (_event, profile: GameProfile): Promise<GameProfile> => {
    const data = await fetchBackendJson<{ profile: GameProfile }>(`/api/adaptation/profiles/${encodeURIComponent(profile.gameId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    return data.profile;
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_PROFILE_RESET, async (_event, gameId: string): Promise<GameProfile> => {
    const data = await fetchBackendJson<{ profile: GameProfile }>(`/api/adaptation/profiles/${encodeURIComponent(gameId)}/reset`, {
      method: 'POST',
    });
    return data.profile;
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_PROFILE_IMPORT, async (_event, json: string): Promise<GameProfile> => {
    const data = await fetchBackendJson<{ profile: GameProfile }>('/api/adaptation/profiles/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json }),
    });
    return data.profile;
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_PROFILE_EXPORT, async (_event, gameId: string): Promise<string> => {
    const data = await fetchBackendJson<{ json: string }>(`/api/adaptation/profiles/${encodeURIComponent(gameId)}/export`);
    return data.json;
  });

  ipcMain.handle(
    IPC_CHANNELS.ADAPTATION_PROFILE_DUPLICATE,
    async (_event, sourceGameId: string, newGameId: string, newGameName: string): Promise<GameProfile> => {
      const data = await fetchBackendJson<{ profile: GameProfile }>(
        `/api/adaptation/profiles/${encodeURIComponent(sourceGameId)}/duplicate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newGameId, newGameName }),
        },
      );
      return data.profile;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ADAPTATION_PROFILE_DELETE,
    async (_event, gameId: string): Promise<{ deleted: boolean; gameId: string }> => {
      return fetchBackendJson<{ deleted: boolean; gameId: string }>(
        `/api/adaptation/profiles/${encodeURIComponent(gameId)}`,
        { method: 'DELETE' },
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ADAPTATION_PROFILE_HISTORY,
    async (_event, gameId: string, limit = 25): Promise<import('@ngegame/shared').GameProfileVersionRecord[]> => {
      const safeLimit = clampLimit(limit, 25, 100);
      const data = await fetchBackendJson<{ history?: import('@ngegame/shared').GameProfileVersionRecord[] }>(
        `/api/adaptation/profiles/${encodeURIComponent(gameId)}/history?limit=${safeLimit}`,
      );
      return data.history ?? [];
    },
  );

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_BRAIN_CYCLE, async (_event, req: { gameId: string; windowTitle?: string; dryRun?: boolean; goalOverride?: string }): Promise<GameBrainCycleResult> => {
    return fetchBackendJson<GameBrainCycleResult>('/api/adaptation/brain/cycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_MEMORY_LIST, async (_event, gameId: string, limit = 30): Promise<GameMemoryRecord[]> => {
    const safeLimit = clampLimit(limit, 30, 100);
    const data = await fetchBackendJson<{ memories?: GameMemoryRecord[] }>(`/api/adaptation/memory/${encodeURIComponent(gameId)}?limit=${safeLimit}`);
    return data.memories ?? [];
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_MEMORY_CLEAR, async (_event, gameId: string): Promise<number> => {
    const data = await fetchBackendJson<{ deleted: number }>(`/api/adaptation/memory/${encodeURIComponent(gameId)}`, { method: 'DELETE' });
    return data.deleted;
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_CALIBRATION_GET, async (_event, gameId: string): Promise<CalibrationSessionState> => {
    return fetchBackendJson<CalibrationSessionState>(`/api/adaptation/calibration/${encodeURIComponent(gameId)}`);
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_CALIBRATION_STEP, async (_event, gameId: string, step: number): Promise<CalibrationSessionState> => {
    const validStep = assertPositiveInt(step, 'step');
    return fetchBackendJson<CalibrationSessionState>(`/api/adaptation/calibration/${encodeURIComponent(gameId)}/step/${validStep}`, {
      method: 'POST',
    });
  });

  ipcMain.handle(IPC_CHANNELS.ADAPTATION_STARDEW_CAPS, async (_event, level: StardewCapabilityLevel = 1) => {
    return fetchBackendJson<{ currentLevel: StardewCapabilityLevel; levels: Record<number, { title: string; capabilities: string[]; smapiNote?: string }> }>(`/api/adaptation/stardew/capabilities?level=${level}`);
  });
}

async function createMainWindow(): Promise<void> {
  const preloadPath = path.resolve(__dirname, '..', 'dist-preload', 'preload.js');
  const iconPath = path.resolve(__dirname, '..', 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 920,
    minHeight: 620,
    title: 'Overthinker-Ngegame',
    icon: iconPath,
    backgroundColor: '#0a0e09',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith(RENDERER_DEV_URL) || url.startsWith('file://');
    if (!allowed) {
      event.preventDefault();
    }
  });

  if (IS_DEV) {
    await mainWindow.loadURL(RENDERER_DEV_URL);
  } else {
    const rendererIndex = path.resolve(__dirname, '..', '..', 'renderer', 'dist', 'index.html');
    await mainWindow.loadFile(rendererIndex);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  if (!IS_DEV) {
    activeBackendPort = await resolveAvailablePort(DEFAULT_BACKEND_PORT);
    startEmbeddedBackendIfPackaged();
  }
  registerIpcHandlers();
  if (!IS_DEV) {
    await waitForBackendReady();
  }
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  if (embeddedBackend) {
    embeddedBackend.kill();
    embeddedBackend = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
