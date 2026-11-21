export type StreamPlatform = 'youtube' | 'twitch';

export interface ObsConnectionConfig {
  url: string;
  passwordConfigured: boolean;
}

export interface ObsDetectionResult {
  processRunning: boolean;
  portReachable: boolean;
  host: string;
  port: number;
  platform: string;
  detectedAt: string;
}

export interface ObsSceneItem {
  sceneName: string;
  isCurrent: boolean;
}

export interface ObsSourceItem {
  sceneItemId: number;
  sourceName: string;
  visible: boolean;
  inputKind?: string;
}

export interface ObsAudioInput {
  inputName: string;
  inputKind?: string;
  muted: boolean;
  volumeDb: number;
  volumeMul: number;
}

export interface ObsRecordingStatus {
  recording: boolean;
  paused: boolean;
  durationSeconds: number;
  bytes: number;
  outputPath: string | null;
}

export interface StreamHealthMetrics {
  streaming: boolean;
  reconnecting: boolean;
  durationSeconds: number;
  bitrateKbps: number;
  fps: number;
  droppedFrames: number;
  totalFrames: number;
  droppedPercent: number;
  congestion: number;
}

export interface MultistreamTarget {
  platform: StreamPlatform;
  enabled: boolean;
  rtmpUrl: string;
  hasStreamKey: boolean;
  maskedKey: string | null;
  visibilityMode: 'private' | 'unlisted' | 'public';
  status: 'ready' | 'streaming' | 'unconfigured' | 'error';
  bandwidthKbps?: number;
  reconnectCount?: number;
  lastError?: string | null;
}

export interface YouTubeBroadcastInfo {
  id: string;
  title: string;
  description: string;
  lifeCycleStatus: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
  scheduledStartTime?: string | null;
  actualStartTime?: string | null;
  liveChatId?: string | null;
  boundStreamId?: string | null;
  viewerCount?: number | null;
  streamHealthStatus?: string | null;
}

export interface StreamChatMessage {
  id: string;
  platform: StreamPlatform;
  author: string;
  message: string;
  publishedAt: string;
  isCommand?: boolean;
}

export interface YouTubeAccountStatus {
  configured: boolean;
  connected: boolean;
  channelTitle: string | null;
  channelId: string | null;
  scopes: string[];
  broadcast: YouTubeBroadcastInfo | null;
  chatMessages: StreamChatMessage[];
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface TwitchChannelInfo {
  broadcasterId: string;
  login: string;
  displayName: string;
  title: string;
  gameName: string;
  gameId: string;
  isLive: boolean;
  viewerCount: number;
  startedAt: string | null;
}

export interface TwitchAccountStatus {
  configured: boolean;
  connected: boolean;
  scopes: string[];
  channel: TwitchChannelInfo | null;
  ircConnected: boolean;
  eventSubConnected: boolean;
  chatMessages: StreamChatMessage[];
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface NarrationQueueItem {
  id: string;
  text: string;
  emotion: 'neutral' | 'excited' | 'tense' | 'humorous' | 'calm';
  source: 'manual' | 'auto-gameplay' | 'assistant' | 'chat-command';
  status: 'queued' | 'speaking' | 'completed' | 'interrupted' | 'failed';
  verifiedGameState?: string;
  createdAt: string;
}

export interface NarrationConfig {
  autoNarration: boolean;
  minCooldownSeconds: number;
  volume: number;
  routeToObs: boolean;
  obsAudioInputName: string;
  interruptOnUrgent: boolean;
}

export interface NarrationStatusResponse {
  speaking: boolean;
  config: NarrationConfig;
  queue: NarrationQueueItem[];
  history: NarrationQueueItem[];
  lastVerifiedGameState: string | null;
  lastError: string | null;
}

export interface StreamAssistantSuggestion {
  id: string;
  suggestionType: 'scene_switch' | 'commentary' | 'highlight' | 'chat_reply' | 'warning';
  title: string;
  message: string;
  suggestedScene?: string | null;
  confidence: number;
  requiresApproval: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  createdAt: string;
}

export interface StreamAssistantStatusResponse {
  active: boolean;
  lastSummary: string | null;
  importantEvents: string[];
  suggestions: StreamAssistantSuggestion[];
  lastAnalyzedAt: string | null;
}

export interface StreamAnalyticsSampleItem {
  id: number;
  sessionId: number | null;
  bitrateKbps: number;
  fps: number;
  droppedFrames: number;
  audioLevelDb: number;
  viewers: number;
  chatCount: number;
  createdAt: string;
}

export interface StreamSessionHistoryItem {
  id: number;
  platforms: string;
  visibility: string;
  title: string;
  avgBitrate: number;
  peakBitrate: number;
  avgFps: number;
  droppedFrames: number;
  durationSeconds: number;
  chatCount: number;
  narrationCount: number;
  peakViewers: number;
  status: string;
  startedAt: string;
  endedAt: string | null;
}

export interface CredentialVaultStatus {
  vaultBackend: 'os-credential-manager' | 'memory-encrypted';
  obsPasswordStored: boolean;
  youtubeOAuthConfigured: boolean;
  youtubeOAuthConnected: boolean;
  twitchOAuthConfigured: boolean;
  twitchOAuthConnected: boolean;
  youtubeStreamKeyMasked: string | null;
  twitchStreamKeyMasked: string | null;
  emergencyStopActive: boolean;
}

export interface StreamingStatusResponse {
  obsConnected: boolean;
  obsReconnecting: boolean;
  obsVersion: string | null;
  obsUrl: string;
  obsDetection: ObsDetectionResult | null;
  currentScene: string | null;
  scenes: ObsSceneItem[];
  sources: ObsSourceItem[];
  audioInputs: ObsAudioInput[];
  recording: ObsRecordingStatus;
  health: StreamHealthMetrics;
  targets: MultistreamTarget[];
  youtube: YouTubeAccountStatus;
  twitch: TwitchAccountStatus;
  narration: NarrationStatusResponse;
  assistant: StreamAssistantStatusResponse;
  vault: CredentialVaultStatus;
  previewImageBase64: string | null;
  lastError: string | null;
}

export interface SaveStreamCredentialRequest {
  platform: StreamPlatform;
  streamKey: string;
  rtmpUrl?: string;
  visibilityMode?: 'private' | 'unlisted' | 'public';
  enabled?: boolean;
}
