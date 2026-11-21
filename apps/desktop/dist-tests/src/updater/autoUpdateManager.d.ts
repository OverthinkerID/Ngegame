import type { UpdateInstallOptions, UpdatePreferences, UpdateState } from '@ngegame/shared';
export declare const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences;
export declare function compareSemver(a: string, b: string): number;
export declare function shouldRunAutoCheck(prefs: UpdatePreferences, lastCheckedAt: string | null, nowMs?: number): boolean;
export declare function formatReleaseNotes(raw: unknown): string | null;
export declare function backupDatabaseFile(dbPath: string, backupDir: string, versionTag: string): string | null;
export declare function restoreDatabaseFile(backupPath: string, dbPath: string): boolean;
export interface AutoUpdaterLike {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    allowPrerelease: boolean;
    setFeedURL: (options: {
        provider: 'github';
        owner: string;
        repo: string;
    }) => void;
    checkForUpdates: () => Promise<unknown>;
    downloadUpdate: (cancellationToken?: any) => Promise<unknown>;
    quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
    on: (event: any, listener: (...args: any[]) => void) => unknown;
}
export interface ActiveTaskGuardResult {
    blocking: boolean;
    reason: string | null;
}
export interface AutoUpdateManagerOptions {
    currentVersion: string;
    userDataDir: string;
    isPackaged: boolean;
    autoUpdater?: AutoUpdaterLike;
    onStateChanged?: (state: UpdateState) => void;
    checkActiveTasks?: () => Promise<ActiveTaskGuardResult>;
    stopActiveTasks?: () => Promise<void>;
    log?: (message: string) => void;
}
export declare class AutoUpdateManager {
    private readonly userDataDir;
    private readonly prefsPath;
    private readonly dbPath;
    private readonly backupDir;
    private readonly isPackaged;
    private readonly updater;
    private readonly onStateChanged?;
    private readonly checkActiveTasks?;
    private readonly stopActiveTasksFn?;
    private readonly log;
    private activeCancelHandle;
    private state;
    constructor(options: AutoUpdateManagerOptions);
    private loadPreferences;
    private savePreferences;
    private applyPreferencesToUpdater;
    private emitState;
    private wireUpdaterEvents;
    getState(): UpdateState;
    getPreferences(): UpdatePreferences;
    updatePreferences(partial: Partial<UpdatePreferences>): UpdatePreferences;
    maybeCheckOnStartup(): Promise<void>;
    checkForUpdates(): Promise<UpdateState>;
    downloadUpdate(): Promise<UpdateState>;
    cancelDownload(): UpdateState;
    retryDownload(): Promise<UpdateState>;
    backupDatabase(): string | null;
    restoreDatabase(backupPath: string): boolean;
    installUpdate(options?: UpdateInstallOptions): Promise<UpdateState>;
}
//# sourceMappingURL=autoUpdateManager.d.ts.map