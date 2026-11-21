export type AssetCategory =
  | 'voice_sample'
  | 'voice_output'
  | 'voice_model'
  | 'artwork'
  | 'vision_snapshot'
  | 'export'
  | 'backup';

export interface StoredAssetRecord {
  id: string;
  category: AssetCategory;
  originalName: string;
  storedName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  entityType: string | null;
  entityId: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileRecord {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarAssetId: string | null;
  preferredLanguage: string;
  defaultGameId: string | null;
  defaultVoiceProfileId: string | null;
  isActive: boolean;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type ThemeMode = 'light' | 'dark' | 'custom';

export interface ThemeSettingsRecord {
  mode: ThemeMode;
  accentColor: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  customThemeName: string;
  fontPreference: string;
  uiPreferences: Record<string, unknown>;
  updatedAt: string;
}

export interface VoiceSampleRecord {
  id: string;
  name: string;
  language: string;
  durationSeconds: number;
  voiceProfileId: string | null;
  assetId: string;
  audioUrl: string;
  transcript: string;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceCloneJobRecord {
  id: string;
  sourceSampleId: string | null;
  voiceProfileId: string | null;
  text: string;
  emotion: string;
  modelProvider: string;
  config: Record<string, unknown>;
  outputAssetId: string | null;
  audioUrl: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  latencyMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface VisionSessionRecord {
  id: string;
  gameId: string | null;
  captureSource: string;
  targetWindow: string;
  width: number;
  height: number;
  samplingIntervalMs: number;
  status: 'idle' | 'active' | 'stopped' | 'error';
  overlayEnabled: boolean;
  lastCaptureAt: string | null;
  lastSnapshotAssetId: string | null;
  snapshotUrl: string | null;
  lastAnalysis: Record<string, unknown> | null;
  captureConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AppBackupPayload {
  schemaVersion: string;
  exportedAt: string;
  appName: string;
  userProfiles: UserProfileRecord[];
  themeSettings: ThemeSettingsRecord;
  appSettings: Array<{ key: string; value: string }>;
  voiceProfiles: unknown[];
  voiceSamples: VoiceSampleRecord[];
  adaptationProfiles: unknown[];
  steamGames: unknown[];
  runtimeState: Array<{ key: string; value: unknown }>;
}
