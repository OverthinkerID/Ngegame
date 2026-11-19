export type StreamPlatform = 'youtube' | 'twitch';

export interface ObsConnectionConfig {
  url: string;
  passwordConfigured: boolean;
}

export interface ObsSceneItem {
  sceneName: string;
  isCurrent: boolean;
}

export interface ObsSourceItem {
  sceneItemId: number;
  sourceName: string;
  visible: boolean;
}

export interface ObsAudioInput {
  inputName: string;
  muted: boolean;
  volumeDb: number;
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
}

export interface StreamingStatusResponse {
  obsConnected: boolean;
  obsUrl: string;
  currentScene: string | null;
  scenes: ObsSceneItem[];
  sources: ObsSourceItem[];
  audioInputs: ObsAudioInput[];
  health: StreamHealthMetrics;
  targets: MultistreamTarget[];
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
