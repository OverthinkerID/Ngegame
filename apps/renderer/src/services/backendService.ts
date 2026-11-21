import type {
  AdapterResolveRequest,
  AIBrainConfig,
  AIBrainDecisionResult,
  AIBrainThinkRequest,
  AIProviderHealth,
  AnalyticsSummaryReport,
  AppInfo,
  CalibrationSessionState,
  ControllerExecuteRequest,
  ControllerExecutionResult,
  ControllerState,
  DetectedWindow,
  GameAdapterDefinition,
  GameBrainCycleResult,
  GameMemoryRecord,
  GameProfile,
  PipelineDiagnosticsReport,
  SaveStreamCredentialRequest,
  StardewCapabilityLevel,
  SteamGameRecord,
  SteamInstallationStatus,
  SteamLaunchResult,
  SteamScanResult,
  SteamScannerDiagnostics,
  SteamStopResult,
  StreamingStatusResponse,
  StreamPlatform,
  SupervisionAuditEntry,
  SupervisionPermissionLevel,
  SupervisionQueueItem,
  SupervisionSafetyPolicy,
  SupervisionState,
  SupervisionSubmitRequest,
  SystemHealthResponse,
  SystemLogEntry,
  ThrottlingConfig,
  VisionAnalysisResult,
  VisionMonitorStatus,
  VoiceCommentaryRequest,
  VoiceProfile,
  VoiceServiceStatus,
  VoiceSettings,
  VoiceSpeakRequest,
  VoiceSpeechResult,
  WorkerResponse,
} from '@ngegame/shared';

const LOOPBACK_HOST = '127.0.0.1';
const BACKEND_BASE = `http://${LOOPBACK_HOST}:47800`;
export const BACKEND_WS_URL = `ws://${LOOPBACK_HOST}:47800/ws`;

async function requestJson<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_BASE}${endpoint}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend HTTP ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export const backendService = {
  isElectron(): boolean {
    return Boolean(window.ngegameAPI);
  },

  async getAppInfo(): Promise<AppInfo | null> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getAppInfo();
    }
    return null;
  },

  async openExternalUrl(url: string): Promise<void> {
    if (window.ngegameAPI) {
      await window.ngegameAPI.openExternalUrl(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  async getHealth(): Promise<SystemHealthResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getBackendHealth();
    }
    return requestJson<SystemHealthResponse>('/api/health');
  },

  async getRecentLogs(limit = 15): Promise<SystemLogEntry[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getRecentLogs(limit);
    }
    const data = await requestJson<{ logs?: SystemLogEntry[] }>(`/api/logs?limit=${limit}`);
    return data.logs ?? [];
  },

  async pingWorker(): Promise<WorkerResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.pingPythonWorker();
    }
    return requestJson<WorkerResponse>('/api/worker/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ping-from-dashboard' }),
    });
  },

  async getSteamStatus(): Promise<SteamInstallationStatus> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getSteamStatus();
    }
    return requestJson<SteamInstallationStatus>('/api/steam/status');
  },

  async listSteamGames(): Promise<SteamGameRecord[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.listSteamGames();
    }
    const data = await requestJson<{ games?: SteamGameRecord[] }>('/api/steam/games');
    return data.games ?? [];
  },

  async scanSteamLibrary(): Promise<SteamScanResult> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.scanSteamLibrary();
    }
    return requestJson<SteamScanResult>('/api/steam/scan', { method: 'POST' });
  },

  async launchSteamGame(appId: number): Promise<SteamLaunchResult> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.launchSteamGame(appId);
    }
    return requestJson<SteamLaunchResult>(`/api/steam/games/${appId}/launch`, {
      method: 'POST',
    });
  },

  async stopSteamGame(appId: number): Promise<SteamStopResult> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.stopSteamGame(appId);
    }
    return requestJson<SteamStopResult>(`/api/steam/games/${appId}/stop`, {
      method: 'POST',
    });
  },

  async getManualSteamLibraries(): Promise<string[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getManualSteamLibraries();
    }
    const data = await requestJson<{ paths?: string[] }>('/api/steam/libraries/manual');
    return data.paths ?? [];
  },

  async addManualSteamLibrary(libraryPath: string): Promise<string[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.addManualSteamLibrary(libraryPath);
    }
    const data = await requestJson<{ paths?: string[] }>('/api/steam/libraries/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryPath }),
    });
    return data.paths ?? [];
  },

  async removeManualSteamLibrary(libraryPath: string): Promise<string[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.removeManualSteamLibrary(libraryPath);
    }
    const data = await requestJson<{ paths?: string[] }>('/api/steam/libraries/manual', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryPath }),
    });
    return data.paths ?? [];
  },

  async getVisionStatus(): Promise<VisionMonitorStatus> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getVisionStatus();
    }
    return requestJson<VisionMonitorStatus>('/api/vision/status');
  },

  async listVisionWindows(): Promise<DetectedWindow[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.listVisionWindows();
    }
    const data = await requestJson<{ windows?: DetectedWindow[] }>('/api/vision/windows');
    return data.windows ?? [];
  },

  async captureVisionOnce(options?: {
    windowTitle?: string;
    sourcePath?: string;
  }): Promise<VisionAnalysisResult> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.captureVisionOnce(options);
    }
    return requestJson<VisionAnalysisResult>('/api/vision/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options ?? {}),
    });
  },

  async startVisionMonitor(options?: {
    windowTitle?: string;
    baseIntervalMs?: number;
  }): Promise<VisionMonitorStatus> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.startVisionMonitor(options);
    }
    return requestJson<VisionMonitorStatus>('/api/vision/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options ?? {}),
    });
  },

  async stopVisionMonitor(): Promise<VisionMonitorStatus> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.stopVisionMonitor();
    }
    return requestJson<VisionMonitorStatus>('/api/vision/stop', { method: 'POST' });
  },

  async getVisionHistory(limit = 15): Promise<VisionAnalysisResult[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getVisionHistory(limit);
    }
    const data = await requestJson<{ history?: VisionAnalysisResult[] }>(
      `/api/vision/history?limit=${limit}`,
    );
    return data.history ?? [];
  },

  async getAIConfig(): Promise<AIBrainConfig> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getAIConfig();
    }
    return requestJson<AIBrainConfig>('/api/ai/config');
  },

  async updateAIConfig(partial: Partial<AIBrainConfig>): Promise<AIBrainConfig> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.updateAIConfig(partial);
    }
    return requestJson<AIBrainConfig>('/api/ai/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
  },

  async getAIProvidersHealth(): Promise<AIProviderHealth> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getAIProvidersHealth();
    }
    return requestJson<AIProviderHealth>('/api/ai/providers/health');
  },

  async runAIThink(request: AIBrainThinkRequest): Promise<AIBrainDecisionResult> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.runAIThink(request);
    }
    return requestJson<AIBrainDecisionResult>('/api/ai/think', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  },

  async getAIHistory(limit = 15): Promise<AIBrainDecisionResult[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getAIHistory(limit);
    }
    const data = await requestJson<{ history?: AIBrainDecisionResult[] }>(
      `/api/ai/history?limit=${limit}`,
    );
    return data.history ?? [];
  },

  async getControllerStatus(): Promise<ControllerState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getControllerStatus();
    }
    return requestJson<ControllerState>('/api/controller/status');
  },

  async executeControllerAction(
    req: ControllerExecuteRequest,
  ): Promise<ControllerExecutionResult> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.executeControllerAction(req);
    }
    return requestJson<ControllerExecutionResult>('/api/controller/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  },

  async pauseController(): Promise<ControllerState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.pauseController();
    }
    return requestJson<ControllerState>('/api/controller/pause', { method: 'POST' });
  },

  async resumeController(): Promise<ControllerState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.resumeController();
    }
    return requestJson<ControllerState>('/api/controller/resume', { method: 'POST' });
  },

  async releaseAllKeys(): Promise<ControllerState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.releaseAllKeys();
    }
    return requestJson<ControllerState>('/api/controller/release-all', { method: 'POST' });
  },

  async emergencyStopController(): Promise<ControllerState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.emergencyStopController();
    }
    return requestJson<ControllerState>('/api/controller/emergency-stop', { method: 'POST' });
  },

  async resetEmergencyStop(): Promise<ControllerState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.resetEmergencyStop();
    }
    return requestJson<ControllerState>('/api/controller/reset-emergency', { method: 'POST' });
  },

  async getControllerHistory(limit = 20): Promise<ControllerExecutionResult[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getControllerHistory(limit);
    }
    const data = await requestJson<{ history?: ControllerExecutionResult[] }>(
      `/api/controller/history?limit=${limit}`,
    );
    return data.history ?? [];
  },

  async listAdapters(): Promise<GameAdapterDefinition[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.listAdapters();
    }
    const data = await requestJson<{ adapters?: GameAdapterDefinition[] }>('/api/adapters');
    return data.adapters ?? [];
  },

  async resolveAdapter(req: AdapterResolveRequest): Promise<GameAdapterDefinition> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.resolveAdapter(req);
    }
    return requestJson<GameAdapterDefinition>('/api/adapters/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  },

  async getSupervisionState(): Promise<SupervisionState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getSupervisionState();
    }
    return requestJson<SupervisionState>('/api/supervision/state');
  },

  async setSupervisionPermission(
    level: SupervisionPermissionLevel,
  ): Promise<SupervisionState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.setSupervisionPermission(level);
    }
    return requestJson<SupervisionState>('/api/supervision/permission', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissionLevel: level }),
    });
  },

  async updateSupervisionPolicy(
    policy: Partial<SupervisionSafetyPolicy>,
  ): Promise<SupervisionState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.updateSupervisionPolicy(policy);
    }
    return requestJson<SupervisionState>('/api/supervision/policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(policy),
    });
  },

  async pauseAI(): Promise<SupervisionState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.pauseAI();
    }
    return requestJson<SupervisionState>('/api/supervision/pause-ai', { method: 'POST' });
  },

  async resumeAI(): Promise<SupervisionState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.resumeAI();
    }
    return requestJson<SupervisionState>('/api/supervision/resume-ai', { method: 'POST' });
  },

  async takeOverControl(): Promise<SupervisionState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.takeOverControl();
    }
    return requestJson<SupervisionState>('/api/supervision/takeover', { method: 'POST' });
  },

  async returnControlToAI(): Promise<SupervisionState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.returnControlToAI();
    }
    return requestJson<SupervisionState>('/api/supervision/return-ai', { method: 'POST' });
  },

  async supervisionEmergencyStop(): Promise<SupervisionState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.supervisionEmergencyStop();
    }
    return requestJson<SupervisionState>('/api/supervision/emergency-stop', { method: 'POST' });
  },

  async supervisionResetEmergency(): Promise<SupervisionState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.supervisionResetEmergency();
    }
    return requestJson<SupervisionState>('/api/supervision/reset-emergency', { method: 'POST' });
  },

  async getSupervisionQueue(limit = 25): Promise<SupervisionQueueItem[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getSupervisionQueue(limit);
    }
    const data = await requestJson<{ items?: SupervisionQueueItem[] }>(
      `/api/supervision/queue?limit=${limit}`,
    );
    return data.items ?? [];
  },

  async submitSupervisionAction(
    req: SupervisionSubmitRequest,
  ): Promise<SupervisionQueueItem> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.submitSupervisionAction(req);
    }
    return requestJson<SupervisionQueueItem>('/api/supervision/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  },

  async approveSupervisionAction(
    id: number,
    note?: string,
  ): Promise<SupervisionQueueItem> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.approveSupervisionAction(id, note);
    }
    return requestJson<SupervisionQueueItem>(`/api/supervision/queue/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
  },

  async rejectSupervisionAction(
    id: number,
    note?: string,
  ): Promise<SupervisionQueueItem> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.rejectSupervisionAction(id, note);
    }
    return requestJson<SupervisionQueueItem>(`/api/supervision/queue/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
  },

  async getSupervisionAudit(limit = 25): Promise<SupervisionAuditEntry[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getSupervisionAudit(limit);
    }
    const data = await requestJson<{ logs?: SupervisionAuditEntry[] }>(
      `/api/supervision/audit?limit=${limit}`,
    );
    return data.logs ?? [];
  },

  async getVoiceStatus(): Promise<VoiceServiceStatus> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getVoiceStatus();
    }
    return requestJson<VoiceServiceStatus>('/api/voice/status');
  },

  async getVoiceSettings(): Promise<VoiceSettings> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getVoiceSettings();
    }
    return requestJson<VoiceSettings>('/api/voice/settings');
  },

  async updateVoiceSettings(partial: Partial<VoiceSettings>): Promise<VoiceSettings> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.updateVoiceSettings(partial);
    }
    return requestJson<VoiceSettings>('/api/voice/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
  },

  async listVoiceProfiles(): Promise<VoiceProfile[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.listVoiceProfiles();
    }
    const data = await requestJson<{ profiles?: VoiceProfile[] }>('/api/voice/profiles');
    return data.profiles ?? [];
  },

  async speakVoiceText(req: VoiceSpeakRequest): Promise<VoiceSpeechResult> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.speakVoiceText(req);
    }
    return requestJson<VoiceSpeechResult>('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  },

  async generateVoiceCommentary(
    req: VoiceCommentaryRequest,
  ): Promise<VoiceSpeechResult> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.generateVoiceCommentary(req);
    }
    return requestJson<VoiceSpeechResult>('/api/voice/commentary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  },

  async getVoiceHistory(limit = 20): Promise<VoiceSpeechResult[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getVoiceHistory(limit);
    }
    const data = await requestJson<{ history?: VoiceSpeechResult[] }>(
      `/api/voice/history?limit=${limit}`,
    );
    return data.history ?? [];
  },

  async getStreamingStatus(): Promise<StreamingStatusResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getStreamingStatus();
    }
    return requestJson<StreamingStatusResponse>('/api/streaming/status');
  },

  async connectObs(config: { url: string; password?: string }): Promise<StreamingStatusResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.connectObs(config);
    }
    return requestJson<StreamingStatusResponse>('/api/streaming/obs/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  },

  async disconnectObs(): Promise<StreamingStatusResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.disconnectObs();
    }
    return requestJson<StreamingStatusResponse>('/api/streaming/obs/disconnect', {
      method: 'POST',
    });
  },

  async setObsScene(sceneName: string): Promise<StreamingStatusResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.setObsScene(sceneName);
    }
    return requestJson<StreamingStatusResponse>('/api/streaming/scene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneName }),
    });
  },

  async toggleObsSource(sceneItemId: number, visible: boolean): Promise<StreamingStatusResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.toggleObsSource(sceneItemId, visible);
    }
    return requestJson<StreamingStatusResponse>('/api/streaming/source/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneItemId, visible }),
    });
  },

  async setObsAudioMute(inputName: string, muted: boolean): Promise<StreamingStatusResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.setObsAudioMute(inputName, muted);
    }
    return requestJson<StreamingStatusResponse>('/api/streaming/audio/mute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputName, muted }),
    });
  },

  async saveStreamCredential(
    req: SaveStreamCredentialRequest,
  ): Promise<StreamingStatusResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.saveStreamCredential(req);
    }
    return requestJson<StreamingStatusResponse>('/api/streaming/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  },

  async deleteStreamCredential(platform: StreamPlatform): Promise<StreamingStatusResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.deleteStreamCredential(platform);
    }
    return requestJson<StreamingStatusResponse>(`/api/streaming/credentials/${platform}`, {
      method: 'DELETE',
    });
  },

  async startStreaming(): Promise<StreamingStatusResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.startStreaming();
    }
    return requestJson<StreamingStatusResponse>('/api/streaming/start', { method: 'POST' });
  },

  async stopStreaming(): Promise<StreamingStatusResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.stopStreaming();
    }
    return requestJson<StreamingStatusResponse>('/api/streaming/stop', { method: 'POST' });
  },

  async captureObsPreview(): Promise<StreamingStatusResponse> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.captureObsPreview();
    }
    return requestJson<StreamingStatusResponse>('/api/streaming/preview', { method: 'POST' });
  },

  async getAnalyticsSummary(): Promise<AnalyticsSummaryReport> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getAnalyticsSummary();
    }
    return requestJson<AnalyticsSummaryReport>('/api/analytics/summary');
  },

  async getThrottlingConfig(): Promise<ThrottlingConfig> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getThrottlingConfig();
    }
    return requestJson<ThrottlingConfig>('/api/analytics/throttling');
  },

  async updateThrottlingConfig(partial: Partial<ThrottlingConfig>): Promise<ThrottlingConfig> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.updateThrottlingConfig(partial);
    }
    return requestJson<ThrottlingConfig>('/api/analytics/throttling', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
  },

  async exportAnalyticsReport(format: 'json' | 'csv'): Promise<string> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.exportAnalyticsReport(format);
    }
    const res = await fetch(`${BACKEND_BASE}/api/analytics/export?format=${format}`);
    if (!res.ok) {
      throw new Error(`Export HTTP ${res.status}`);
    }
    return res.text();
  },

  async getAdaptationDiagnostics(): Promise<PipelineDiagnosticsReport> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getAdaptationDiagnostics();
    }
    return requestJson<PipelineDiagnosticsReport>('/api/adaptation/diagnostics');
  },

  async getSteamDiagnostics(): Promise<SteamScannerDiagnostics | null> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getSteamDiagnostics();
    }
    return requestJson<SteamScannerDiagnostics | null>('/api/adaptation/steam/diagnostics');
  },

  async listGameProfiles(): Promise<GameProfile[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.listGameProfiles();
    }
    const data = await requestJson<{ profiles?: GameProfile[] }>('/api/adaptation/profiles');
    return data.profiles ?? [];
  },

  async getGameProfile(gameId: string): Promise<{ profile: GameProfile; validation: { valid: boolean; errors: string[]; warnings: string[] } }> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getGameProfile(gameId);
    }
    return requestJson<{ profile: GameProfile; validation: { valid: boolean; errors: string[]; warnings: string[] } }>(`/api/adaptation/profiles/${encodeURIComponent(gameId)}`);
  },

  async saveGameProfile(profile: GameProfile): Promise<GameProfile> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.saveGameProfile(profile);
    }
    const data = await requestJson<{ profile: GameProfile }>(`/api/adaptation/profiles/${encodeURIComponent(profile.gameId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    return data.profile;
  },

  async resetGameProfile(gameId: string): Promise<GameProfile> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.resetGameProfile(gameId);
    }
    const data = await requestJson<{ profile: GameProfile }>(`/api/adaptation/profiles/${encodeURIComponent(gameId)}/reset`, {
      method: 'POST',
    });
    return data.profile;
  },

  async importGameProfile(json: string): Promise<GameProfile> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.importGameProfile(json);
    }
    const data = await requestJson<{ profile: GameProfile }>('/api/adaptation/profiles/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json }),
    });
    return data.profile;
  },

  async exportGameProfile(gameId: string): Promise<string> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.exportGameProfile(gameId);
    }
    const data = await requestJson<{ json: string }>(`/api/adaptation/profiles/${encodeURIComponent(gameId)}/export`);
    return data.json;
  },

  async duplicateGameProfile(sourceGameId: string, newGameId: string, newGameName: string): Promise<GameProfile> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.duplicateGameProfile(sourceGameId, newGameId, newGameName);
    }
    const data = await requestJson<{ profile: GameProfile }>(
      `/api/adaptation/profiles/${encodeURIComponent(sourceGameId)}/duplicate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newGameId, newGameName }),
      },
    );
    return data.profile;
  },

  async deleteGameProfile(gameId: string): Promise<{ deleted: boolean; gameId: string }> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.deleteGameProfile(gameId);
    }
    return requestJson<{ deleted: boolean; gameId: string }>(
      `/api/adaptation/profiles/${encodeURIComponent(gameId)}`,
      { method: 'DELETE' },
    );
  },

  async getGameProfileHistory(gameId: string, limit = 25): Promise<import('@ngegame/shared').GameProfileVersionRecord[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getGameProfileHistory(gameId, limit);
    }
    const data = await requestJson<{ history?: import('@ngegame/shared').GameProfileVersionRecord[] }>(
      `/api/adaptation/profiles/${encodeURIComponent(gameId)}/history?limit=${limit}`,
    );
    return data.history ?? [];
  },

  async runGameBrainCycle(req: { gameId: string; windowTitle?: string; dryRun?: boolean; goalOverride?: string }): Promise<GameBrainCycleResult> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.runGameBrainCycle(req);
    }
    return requestJson<GameBrainCycleResult>('/api/adaptation/brain/cycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  },

  async listGameMemories(gameId: string, limit = 30): Promise<GameMemoryRecord[]> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.listGameMemories(gameId, limit);
    }
    const data = await requestJson<{ memories?: GameMemoryRecord[] }>(`/api/adaptation/memory/${encodeURIComponent(gameId)}?limit=${limit}`);
    return data.memories ?? [];
  },

  async clearGameMemories(gameId: string): Promise<number> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.clearGameMemories(gameId);
    }
    const data = await requestJson<{ deleted: number }>(`/api/adaptation/memory/${encodeURIComponent(gameId)}`, {
      method: 'DELETE',
    });
    return data.deleted;
  },

  async getCalibrationState(gameId: string): Promise<CalibrationSessionState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getCalibrationState(gameId);
    }
    return requestJson<CalibrationSessionState>(`/api/adaptation/calibration/${encodeURIComponent(gameId)}`);
  },

  async runCalibrationStep(gameId: string, step: number): Promise<CalibrationSessionState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.runCalibrationStep(gameId, step);
    }
    return requestJson<CalibrationSessionState>(`/api/adaptation/calibration/${encodeURIComponent(gameId)}/step/${step}`, {
      method: 'POST',
    });
  },

  async getStardewCapabilities(level: StardewCapabilityLevel = 1) {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getStardewCapabilities(level);
    }
    return requestJson<{ currentLevel: StardewCapabilityLevel; levels: Record<number, { title: string; capabilities: string[]; smapiNote?: string }> }>(`/api/adaptation/stardew/capabilities?level=${level}`);
  },

  async getRuntimeStatus(): Promise<{
    phase: string;
    activeSession: {
      id: string;
      title: string;
      status: string;
      totalActions: number;
      totalDecisions: number;
    } | null;
    activeGameId: string | null;
    activeGameName: string | null;
    currentTask: string | null;
    gameState: string;
    aiProviderHealth: AIProviderHealth | null;
    controllerStatus: ControllerState | null;
    supervisionState: SupervisionState | null;
    lastError: string | null;
    updatedAt: string;
  }> {
    return requestJson('/api/runtime/status');
  },

  async startRuntimeSession(req: { gameId: string; windowTitle?: string; goal?: string }) {
    return requestJson('/api/runtime/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  },

  async stopRuntimeSession(reason?: string) {
    return requestJson('/api/runtime/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
  },

  async recoverRuntimeSessions() {
    return requestJson('/api/runtime/recover', { method: 'POST' });
  },

  async detectObs(): Promise<import('@ngegame/shared').ObsDetectionResult> {
    return requestJson('/api/streaming/obs/detect');
  },

  async reconnectObs(): Promise<StreamingStatusResponse> {
    return requestJson('/api/streaming/obs/reconnect', { method: 'POST' });
  },

  async setObsAudioVolume(inputName: string, volumeDb: number): Promise<StreamingStatusResponse> {
    return requestJson('/api/streaming/audio/volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputName, volumeDb }),
    });
  },

  async startObsRecording(): Promise<StreamingStatusResponse> {
    return requestJson('/api/streaming/recording/start', { method: 'POST' });
  },

  async stopObsRecording(): Promise<StreamingStatusResponse> {
    return requestJson('/api/streaming/recording/stop', { method: 'POST' });
  },

  async toggleObsRecordingPause(): Promise<StreamingStatusResponse> {
    return requestJson('/api/streaming/recording/pause', { method: 'POST' });
  },

  async emergencyStopStreaming(): Promise<StreamingStatusResponse> {
    return requestJson('/api/streaming/emergency-stop', { method: 'POST' });
  },

  async configureYouTubeOAuth(input: {
    clientId: string;
    authEndpoint?: string;
    redirectUri?: string;
    allowManage?: boolean;
  }): Promise<import('@ngegame/shared').YouTubeAccountStatus> {
    return requestJson('/api/streaming/youtube/oauth/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  },

  async getYouTubeOAuthUrl(): Promise<{ url: string; state: string; scopes: string[] }> {
    return requestJson('/api/streaming/youtube/oauth/url');
  },

  async refreshYouTube(): Promise<import('@ngegame/shared').YouTubeAccountStatus> {
    return requestJson('/api/streaming/youtube/refresh', { method: 'POST' });
  },

  async disconnectYouTube(): Promise<import('@ngegame/shared').YouTubeAccountStatus> {
    return requestJson('/api/streaming/youtube/disconnect', { method: 'POST' });
  },

  async configureTwitchOAuth(input: {
    clientId: string;
    authEndpoint?: string;
    redirectUri?: string;
    allowManage?: boolean;
  }): Promise<import('@ngegame/shared').TwitchAccountStatus> {
    return requestJson('/api/streaming/twitch/oauth/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  },

  async getTwitchOAuthUrl(): Promise<{ url: string; state: string; scopes: string[] }> {
    return requestJson('/api/streaming/twitch/oauth/url');
  },

  async refreshTwitch(): Promise<import('@ngegame/shared').TwitchAccountStatus> {
    return requestJson('/api/streaming/twitch/refresh', { method: 'POST' });
  },

  async disconnectTwitch(): Promise<import('@ngegame/shared').TwitchAccountStatus> {
    return requestJson('/api/streaming/twitch/disconnect', { method: 'POST' });
  },

  async updateStreamNarrationConfig(
    partial: Partial<import('@ngegame/shared').NarrationConfig>,
  ): Promise<import('@ngegame/shared').NarrationStatusResponse> {
    return requestJson('/api/streaming/narration/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
  },

  async enqueueStreamNarration(input: {
    text: string;
    emotion?: import('@ngegame/shared').VoiceEmotion;
    urgent?: boolean;
  }): Promise<import('@ngegame/shared').NarrationStatusResponse> {
    return requestJson('/api/streaming/narration/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  },

  async triggerAutoStreamNarration(): Promise<import('@ngegame/shared').NarrationStatusResponse> {
    return requestJson('/api/streaming/narration/auto', { method: 'POST' });
  },

  async interruptStreamNarration(): Promise<import('@ngegame/shared').NarrationStatusResponse> {
    return requestJson('/api/streaming/narration/interrupt', { method: 'POST' });
  },

  async analyzeStreamAssistant(): Promise<import('@ngegame/shared').StreamAssistantStatusResponse> {
    return requestJson('/api/streaming/assistant/analyze', { method: 'POST' });
  },

  async sendStreamAssistantCommand(
    command: string,
  ): Promise<{ reply: string; status: import('@ngegame/shared').StreamAssistantStatusResponse }> {
    return requestJson('/api/streaming/assistant/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
  },

  async approveStreamSuggestion(
    id: string,
  ): Promise<import('@ngegame/shared').StreamAssistantStatusResponse> {
    return requestJson(`/api/streaming/assistant/suggestions/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    });
  },

  async rejectStreamSuggestion(
    id: string,
  ): Promise<import('@ngegame/shared').StreamAssistantStatusResponse> {
    return requestJson(`/api/streaming/assistant/suggestions/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
    });
  },

  async getStreamingAnalytics(): Promise<{
    samples: import('@ngegame/shared').StreamAnalyticsSampleItem[];
    sessions: import('@ngegame/shared').StreamSessionHistoryItem[];
  }> {
    return requestJson('/api/streaming/analytics');
  },

  async getUpdaterState(): Promise<import('@ngegame/shared').UpdateState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.getUpdaterState();
    }
    const info = await this.getAppInfo().catch(() => null);
    return {
      currentVersion: info?.version ?? '0.1.0',
      latestVersion: null,
      status: 'idle',
      updateAvailable: false,
      releaseNotes: null,
      releaseDate: null,
      progress: null,
      lastCheckedAt: null,
      lastBackupPath: null,
      activeTasksBlocking: false,
      activeTasksReason: null,
      isPackaged: false,
      error: 'Pemeriksaan update tersedia pada aplikasi desktop Electron.',
      preferences: {
        autoCheck: true,
        autoDownload: false,
        requireInstallConfirmation: true,
        checkFrequency: 'startup',
        allowPrerelease: false,
      },
    };
  },

  async checkForUpdates(): Promise<import('@ngegame/shared').UpdateState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.checkForUpdates();
    }
    return this.getUpdaterState();
  },

  async downloadUpdate(): Promise<import('@ngegame/shared').UpdateState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.downloadUpdate();
    }
    return this.getUpdaterState();
  },

  async installUpdate(
    options?: import('@ngegame/shared').UpdateInstallOptions,
  ): Promise<import('@ngegame/shared').UpdateState> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.installUpdate(options);
    }
    return this.getUpdaterState();
  },

  async updateUpdatePreferences(
    partial: Partial<import('@ngegame/shared').UpdatePreferences>,
  ): Promise<import('@ngegame/shared').UpdatePreferences> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.updateUpdatePreferences(partial);
    }
    return {
      autoCheck: true,
      autoDownload: false,
      requireInstallConfirmation: true,
      checkFrequency: 'startup',
      allowPrerelease: false,
      ...partial,
    };
  },

  async backupUserDatabase(): Promise<{ backupPath: string | null }> {
    if (window.ngegameAPI) {
      return window.ngegameAPI.backupUserDatabase();
    }
    return { backupPath: null };
  },

  onUpdaterStateChanged(
    listener: (state: import('@ngegame/shared').UpdateState) => void,
  ): () => void {
    if (window.ngegameAPI?.onUpdaterStateChanged) {
      return window.ngegameAPI.onUpdaterStateChanged(listener);
    }
    return () => undefined;
  },
};
