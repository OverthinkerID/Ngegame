export type SteamGameCompatibility = 'verified' | 'experimental' | 'unsupported' | 'unknown';

export interface SteamInstallationStatus {
  installed: boolean;
  steamPath: string | null;
  libraryPaths: string[];
  platform: string;
  checkedAt: string;
}

export interface SteamGameRecord {
  appId: number;
  name: string;
  installDir: string;
  installPath: string;
  executablePath: string | null;
  sizeOnDiskBytes: number;
  compatibility: SteamGameCompatibility;
  compatibilityReason: string;
  isRunning: boolean;
  pid: number | null;
  lastScannedAt: string;
  lastLaunchedAt: string | null;
}

export interface SteamScanResult {
  installation: SteamInstallationStatus;
  games: SteamGameRecord[];
  scannedAt: string;
}

export interface SteamLaunchResult {
  ok: boolean;
  appId: number;
  method: 'steam-uri' | 'executable';
  message: string;
  pid: number | null;
}

export interface SteamStopResult {
  ok: boolean;
  appId: number;
  message: string;
}
