export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export type UpdateCheckFrequency = 'startup' | 'daily' | 'weekly' | 'manual';

export interface UpdatePreferences {
  autoCheck: boolean;
  autoDownload: boolean;
  requireInstallConfirmation: boolean;
  checkFrequency: UpdateCheckFrequency;
  allowPrerelease: boolean;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateState {
  currentVersion: string;
  latestVersion: string | null;
  status: UpdateStatus;
  updateAvailable: boolean;
  releaseNotes: string | null;
  releaseDate: string | null;
  progress: UpdateProgress | null;
  lastCheckedAt: string | null;
  lastBackupPath: string | null;
  activeTasksBlocking: boolean;
  activeTasksReason: string | null;
  isPackaged: boolean;
  error: string | null;
  preferences: UpdatePreferences;
}

export interface UpdateInstallOptions {
  confirmed?: boolean;
  stopActiveTasks?: boolean;
}
