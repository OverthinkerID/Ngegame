export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'cancelled'
  | 'error';

export type UpdateCheckFrequency = 'startup' | 'daily' | 'weekly' | 'manual';

export type UpdateChannel = 'stable' | 'beta';

export interface UpdatePreferences {
  autoCheck: boolean;
  autoDownload: boolean;
  requireInstallConfirmation: boolean;
  checkFrequency: UpdateCheckFrequency;
  allowPrerelease: boolean;
  channel?: UpdateChannel;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface RuntimeCompatibilityReport {
  ok: boolean;
  checkedAt: string;
  prismaSchemaValid: boolean;
  databaseReadable: boolean;
  pythonWorkerAvailable: boolean;
  pythonVersion: string | null;
  issues: string[];
}

export interface UpdateState {
  currentVersion: string;
  latestVersion: string | null;
  status: UpdateStatus;
  updateAvailable: boolean;
  releaseNotes: string | null;
  releaseDate: string | null;
  packageSizeBytes?: number | null;
  channel?: UpdateChannel;
  progress: UpdateProgress | null;
  lastCheckedAt: string | null;
  lastBackupPath: string | null;
  activeTasksBlocking: boolean;
  activeTasksReason: string | null;
  isPackaged: boolean;
  error: string | null;
  preferences: UpdatePreferences;
  compatibility?: RuntimeCompatibilityReport | null;
}

export interface UpdateInstallOptions {
  confirmed?: boolean;
  stopActiveTasks?: boolean;
}

export interface UpdateHistoryEntry {
  id: number;
  fromVersion: string;
  toVersion: string;
  channel: UpdateChannel;
  status: string;
  releaseNotes: string | null;
  releaseDate: string | null;
  packageSize: number;
  backupPath: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface UpdateDownloadEntry {
  id: number;
  version: string;
  channel: UpdateChannel;
  status: string;
  totalBytes: number;
  downloadedBytes: number;
  percent: number;
  bytesPerSecond: number;
  errorMessage: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface UpdateRecoveryLogEntry {
  id: number;
  version: string;
  action: string;
  backupPath: string | null;
  success: boolean;
  details: string;
  createdAt: string;
}
