import type {
  AnalyticsSummaryReport,
  ResourceMetricsSnapshot,
  ThrottlingConfig,
} from './analytics.js';
import type {
  AdapterResolveRequest,
  GameAdapterDefinition,
} from './adapter.js';
import type {
  AIBrainConfig,
  AIBrainDecisionResult,
  AIBrainThinkRequest,
  AIProviderHealth,
} from './ai.js';
import type {
  ControllerExecuteRequest,
  ControllerExecutionResult,
  ControllerState,
} from './controller.js';
import type { SystemHealthResponse, SystemLogEntry } from './health.js';
import type {
  SteamGameRecord,
  SteamInstallationStatus,
  SteamLaunchResult,
  SteamScanResult,
  SteamStopResult,
} from './steam.js';
import type {
  ObsConnectionConfig,
  SaveStreamCredentialRequest,
  StreamingStatusResponse,
  StreamPlatform,
} from './streaming.js';
import type {
  SupervisionAuditEntry,
  SupervisionPermissionLevel,
  SupervisionQueueItem,
  SupervisionSafetyPolicy,
  SupervisionState,
  SupervisionSubmitRequest,
} from './supervision.js';
import type {
  DetectedWindow,
  VisionAnalysisResult,
  VisionMonitorStatus,
} from './vision.js';
import type {
  VoiceCommentaryRequest,
  VoiceProfile,
  VoiceServiceStatus,
  VoiceSettings,
  VoiceSpeakRequest,
  VoiceSpeechResult,
} from './voice.js';
import type { WorkerResponse } from './worker.js';

export type { ResourceMetricsSnapshot };

export const IPC_CHANNELS = {
  APP_GET_INFO: 'app:get-info',
  APP_OPEN_EXTERNAL: 'app:open-external',
  BACKEND_HEALTH: 'backend:health',
  BACKEND_LOGS: 'backend:logs',
  WORKER_PING: 'worker:ping',
  STEAM_STATUS: 'steam:status',
  STEAM_LIST_GAMES: 'steam:list-games',
  STEAM_SCAN: 'steam:scan',
  STEAM_LAUNCH: 'steam:launch',
  STEAM_STOP: 'steam:stop',
  VISION_STATUS: 'vision:status',
  VISION_WINDOWS: 'vision:windows',
  VISION_CAPTURE_ONCE: 'vision:capture-once',
  VISION_START: 'vision:start',
  VISION_STOP: 'vision:stop',
  VISION_HISTORY: 'vision:history',
  AI_GET_CONFIG: 'ai:get-config',
  AI_UPDATE_CONFIG: 'ai:update-config',
  AI_PROVIDERS_HEALTH: 'ai:providers-health',
  AI_THINK: 'ai:think',
  AI_HISTORY: 'ai:history',
  CONTROLLER_STATUS: 'controller:status',
  CONTROLLER_EXECUTE: 'controller:execute',
  CONTROLLER_PAUSE: 'controller:pause',
  CONTROLLER_RESUME: 'controller:resume',
  CONTROLLER_RELEASE_ALL: 'controller:release-all',
  CONTROLLER_EMERGENCY_STOP: 'controller:emergency-stop',
  CONTROLLER_RESET_EMERGENCY: 'controller:reset-emergency',
  CONTROLLER_HISTORY: 'controller:history',
  ADAPTER_LIST: 'adapter:list',
  ADAPTER_RESOLVE: 'adapter:resolve',
  SUPERVISION_STATE: 'supervision:state',
  SUPERVISION_SET_PERMISSION: 'supervision:set-permission',
  SUPERVISION_UPDATE_POLICY: 'supervision:update-policy',
  SUPERVISION_PAUSE_AI: 'supervision:pause-ai',
  SUPERVISION_RESUME_AI: 'supervision:resume-ai',
  SUPERVISION_TAKEOVER: 'supervision:takeover',
  SUPERVISION_RETURN_AI: 'supervision:return-ai',
  SUPERVISION_EMERGENCY_STOP: 'supervision:emergency-stop',
  SUPERVISION_RESET_EMERGENCY: 'supervision:reset-emergency',
  SUPERVISION_QUEUE: 'supervision:queue',
  SUPERVISION_SUBMIT: 'supervision:submit',
  SUPERVISION_APPROVE: 'supervision:approve',
  SUPERVISION_REJECT: 'supervision:reject',
  SUPERVISION_AUDIT: 'supervision:audit',
  VOICE_STATUS: 'voice:status',
  VOICE_SETTINGS_GET: 'voice:settings-get',
  VOICE_SETTINGS_UPDATE: 'voice:settings-update',
  VOICE_PROFILES: 'voice:profiles',
  VOICE_SPEAK: 'voice:speak',
  VOICE_COMMENTARY: 'voice:commentary',
  VOICE_HISTORY: 'voice:history',
  STREAM_STATUS: 'stream:status',
  STREAM_OBS_CONNECT: 'stream:obs-connect',
  STREAM_OBS_DISCONNECT: 'stream:obs-disconnect',
  STREAM_SET_SCENE: 'stream:set-scene',
  STREAM_TOGGLE_SOURCE: 'stream:toggle-source',
  STREAM_SET_MUTE: 'stream:set-mute',
  STREAM_SAVE_CREDENTIAL: 'stream:save-credential',
  STREAM_DELETE_CREDENTIAL: 'stream:delete-credential',
  STREAM_START: 'stream:start',
  STREAM_STOP: 'stream:stop',
  STREAM_PREVIEW: 'stream:preview',
  ANALYTICS_SUMMARY: 'analytics:summary',
  ANALYTICS_THROTTLE_GET: 'analytics:throttle-get',
  ANALYTICS_THROTTLE_UPDATE: 'analytics:throttle-update',
  ANALYTICS_EXPORT: 'analytics:export',
} as const;

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  electronVersion: string;
  nodeVersion: string;
  backendUrl: string;
}

export interface NgegameBridgeAPI {
  getAppInfo: () => Promise<AppInfo>;
  openExternalUrl: (url: string) => Promise<void>;
  getBackendHealth: () => Promise<SystemHealthResponse>;
  getRecentLogs: (limit?: number) => Promise<SystemLogEntry[]>;
  pingPythonWorker: () => Promise<WorkerResponse>;
  getSteamStatus: () => Promise<SteamInstallationStatus>;
  listSteamGames: () => Promise<SteamGameRecord[]>;
  scanSteamLibrary: () => Promise<SteamScanResult>;
  launchSteamGame: (appId: number) => Promise<SteamLaunchResult>;
  stopSteamGame: (appId: number) => Promise<SteamStopResult>;
  getVisionStatus: () => Promise<VisionMonitorStatus>;
  listVisionWindows: () => Promise<DetectedWindow[]>;
  captureVisionOnce: (options?: { windowTitle?: string; sourcePath?: string }) => Promise<VisionAnalysisResult>;
  startVisionMonitor: (options?: { windowTitle?: string; baseIntervalMs?: number }) => Promise<VisionMonitorStatus>;
  stopVisionMonitor: () => Promise<VisionMonitorStatus>;
  getVisionHistory: (limit?: number) => Promise<VisionAnalysisResult[]>;
  getAIConfig: () => Promise<AIBrainConfig>;
  updateAIConfig: (partial: Partial<AIBrainConfig>) => Promise<AIBrainConfig>;
  getAIProvidersHealth: () => Promise<AIProviderHealth>;
  runAIThink: (request: AIBrainThinkRequest) => Promise<AIBrainDecisionResult>;
  getAIHistory: (limit?: number) => Promise<AIBrainDecisionResult[]>;
  getControllerStatus: () => Promise<ControllerState>;
  executeControllerAction: (req: ControllerExecuteRequest) => Promise<ControllerExecutionResult>;
  pauseController: () => Promise<ControllerState>;
  resumeController: () => Promise<ControllerState>;
  releaseAllKeys: () => Promise<ControllerState>;
  emergencyStopController: () => Promise<ControllerState>;
  resetEmergencyStop: () => Promise<ControllerState>;
  getControllerHistory: (limit?: number) => Promise<ControllerExecutionResult[]>;
  listAdapters: () => Promise<GameAdapterDefinition[]>;
  resolveAdapter: (req: AdapterResolveRequest) => Promise<GameAdapterDefinition>;
  getSupervisionState: () => Promise<SupervisionState>;
  setSupervisionPermission: (level: SupervisionPermissionLevel) => Promise<SupervisionState>;
  updateSupervisionPolicy: (policy: Partial<SupervisionSafetyPolicy>) => Promise<SupervisionState>;
  pauseAI: () => Promise<SupervisionState>;
  resumeAI: () => Promise<SupervisionState>;
  takeOverControl: () => Promise<SupervisionState>;
  returnControlToAI: () => Promise<SupervisionState>;
  supervisionEmergencyStop: () => Promise<SupervisionState>;
  supervisionResetEmergency: () => Promise<SupervisionState>;
  getSupervisionQueue: (limit?: number) => Promise<SupervisionQueueItem[]>;
  submitSupervisionAction: (req: SupervisionSubmitRequest) => Promise<SupervisionQueueItem>;
  approveSupervisionAction: (id: number, note?: string) => Promise<SupervisionQueueItem>;
  rejectSupervisionAction: (id: number, note?: string) => Promise<SupervisionQueueItem>;
  getSupervisionAudit: (limit?: number) => Promise<SupervisionAuditEntry[]>;
  getVoiceStatus: () => Promise<VoiceServiceStatus>;
  getVoiceSettings: () => Promise<VoiceSettings>;
  updateVoiceSettings: (partial: Partial<VoiceSettings>) => Promise<VoiceSettings>;
  listVoiceProfiles: () => Promise<VoiceProfile[]>;
  speakVoiceText: (req: VoiceSpeakRequest) => Promise<VoiceSpeechResult>;
  generateVoiceCommentary: (req: VoiceCommentaryRequest) => Promise<VoiceSpeechResult>;
  getVoiceHistory: (limit?: number) => Promise<VoiceSpeechResult[]>;
  getStreamingStatus: () => Promise<StreamingStatusResponse>;
  connectObs: (config: { url: string; password?: string }) => Promise<StreamingStatusResponse>;
  disconnectObs: () => Promise<StreamingStatusResponse>;
  setObsScene: (sceneName: string) => Promise<StreamingStatusResponse>;
  toggleObsSource: (sceneItemId: number, visible: boolean) => Promise<StreamingStatusResponse>;
  setObsAudioMute: (inputName: string, muted: boolean) => Promise<StreamingStatusResponse>;
  saveStreamCredential: (req: SaveStreamCredentialRequest) => Promise<StreamingStatusResponse>;
  deleteStreamCredential: (platform: StreamPlatform) => Promise<StreamingStatusResponse>;
  startStreaming: () => Promise<StreamingStatusResponse>;
  stopStreaming: () => Promise<StreamingStatusResponse>;
  captureObsPreview: () => Promise<StreamingStatusResponse>;
  getObsConfig?: () => Promise<ObsConnectionConfig>;
  getAnalyticsSummary: () => Promise<AnalyticsSummaryReport>;
  getThrottlingConfig: () => Promise<ThrottlingConfig>;
  updateThrottlingConfig: (partial: Partial<ThrottlingConfig>) => Promise<ThrottlingConfig>;
  exportAnalyticsReport: (format: 'json' | 'csv') => Promise<string>;
}
