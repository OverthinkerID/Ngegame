import fs from 'node:fs';
import path from 'node:path';
export const DEFAULT_UPDATE_PREFERENCES = {
    autoCheck: true,
    autoDownload: false,
    requireInstallConfirmation: true,
    checkFrequency: 'startup',
    allowPrerelease: false,
    channel: 'stable',
};
export function compareSemver(a, b) {
    const cleanA = a.trim().replace(/^v/i, '');
    const cleanB = b.trim().replace(/^v/i, '');
    const [coreA = '0.0.0', preA = ''] = cleanA.split('-', 2);
    const [coreB = '0.0.0', preB = ''] = cleanB.split('-', 2);
    const partsA = coreA.split('.').map((n) => Number.parseInt(n, 10) || 0);
    const partsB = coreB.split('.').map((n) => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i += 1) {
        const va = partsA[i] ?? 0;
        const vb = partsB[i] ?? 0;
        if (va > vb)
            return 1;
        if (va < vb)
            return -1;
    }
    if (!preA && preB)
        return 1;
    if (preA && !preB)
        return -1;
    if (preA === preB)
        return 0;
    return preA > preB ? 1 : -1;
}
export function shouldRunAutoCheck(prefs, lastCheckedAt, nowMs = Date.now()) {
    if (!prefs.autoCheck || prefs.checkFrequency === 'manual') {
        return false;
    }
    if (!lastCheckedAt) {
        return true;
    }
    const lastMs = Date.parse(lastCheckedAt);
    if (!Number.isFinite(lastMs)) {
        return true;
    }
    if (prefs.checkFrequency === 'startup') {
        return true;
    }
    const elapsedMs = nowMs - lastMs;
    if (prefs.checkFrequency === 'daily') {
        return elapsedMs >= 24 * 60 * 60 * 1000;
    }
    if (prefs.checkFrequency === 'weekly') {
        return elapsedMs >= 7 * 24 * 60 * 60 * 1000;
    }
    return false;
}
export function formatReleaseNotes(raw) {
    if (!raw)
        return null;
    if (typeof raw === 'string') {
        return raw.replace(/<[^>]+>/g, '').trim() || null;
    }
    if (Array.isArray(raw)) {
        const lines = raw
            .map((entry) => {
            if (typeof entry === 'string')
                return entry.replace(/<[^>]+>/g, '').trim();
            if (entry && typeof entry === 'object') {
                const rec = entry;
                const note = typeof rec.note === 'string' ? rec.note.replace(/<[^>]+>/g, '').trim() : '';
                return rec.version ? `${rec.version}: ${note}` : note;
            }
            return '';
        })
            .filter(Boolean);
        return lines.length > 0 ? lines.join('\n\n') : null;
    }
    return null;
}
export function backupDatabaseFile(dbPath, backupDir, versionTag) {
    if (!fs.existsSync(dbPath)) {
        return null;
    }
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeVersion = versionTag.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = path.join(backupDir, `ngegame-pre-update-${safeVersion}-${stamp}.db`);
    fs.copyFileSync(dbPath, destPath);
    try {
        const files = fs
            .readdirSync(backupDir)
            .filter((f) => f.startsWith('ngegame-pre-update-') && f.endsWith('.db'))
            .sort()
            .reverse();
        for (const oldFile of files.slice(5)) {
            fs.unlinkSync(path.join(backupDir, oldFile));
        }
    }
    catch {
        // Non-fatal retention cleanup
    }
    return destPath;
}
export function restoreDatabaseFile(backupPath, dbPath) {
    if (!backupPath || !fs.existsSync(backupPath)) {
        return false;
    }
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.copyFileSync(backupPath, dbPath);
    return true;
}
export class AutoUpdateManager {
    userDataDir;
    prefsPath;
    dbPath;
    backupDir;
    isPackaged;
    updater;
    onStateChanged;
    checkActiveTasks;
    stopActiveTasksFn;
    log;
    activeCancelHandle = null;
    state;
    constructor(options) {
        this.userDataDir = options.userDataDir;
        this.prefsPath = path.join(this.userDataDir, 'updater-preferences.json');
        this.dbPath = path.join(this.userDataDir, 'ngegame.db');
        this.backupDir = path.join(this.userDataDir, 'backups');
        this.isPackaged = options.isPackaged;
        this.updater = options.autoUpdater ?? null;
        this.onStateChanged = options.onStateChanged;
        this.checkActiveTasks = options.checkActiveTasks;
        this.stopActiveTasksFn = options.stopActiveTasks;
        this.log = options.log ?? (() => undefined);
        const preferences = this.loadPreferences();
        const channel = preferences.allowPrerelease ? 'beta' : 'stable';
        this.state = {
            currentVersion: options.currentVersion,
            latestVersion: null,
            status: 'idle',
            updateAvailable: false,
            releaseNotes: null,
            releaseDate: null,
            packageSizeBytes: null,
            channel,
            progress: null,
            lastCheckedAt: null,
            lastBackupPath: null,
            activeTasksBlocking: false,
            activeTasksReason: null,
            isPackaged: options.isPackaged,
            error: null,
            preferences: { ...preferences, channel },
        };
        if (this.updater) {
            this.wireUpdaterEvents();
            this.applyPreferencesToUpdater();
        }
    }
    loadPreferences() {
        try {
            if (fs.existsSync(this.prefsPath)) {
                const raw = JSON.parse(fs.readFileSync(this.prefsPath, 'utf8'));
                const merged = {
                    ...DEFAULT_UPDATE_PREFERENCES,
                    ...raw,
                };
                merged.channel = merged.allowPrerelease ? 'beta' : 'stable';
                return merged;
            }
        }
        catch {
            // Fallback to defaults
        }
        return { ...DEFAULT_UPDATE_PREFERENCES };
    }
    savePreferences(prefs) {
        try {
            fs.mkdirSync(this.userDataDir, { recursive: true });
            fs.writeFileSync(this.prefsPath, JSON.stringify(prefs, null, 2), 'utf8');
        }
        catch (err) {
            this.log(`Gagal menyimpan preferensi update: ${String(err)}`);
        }
    }
    applyPreferencesToUpdater() {
        if (!this.updater)
            return;
        this.updater.autoDownload = this.state.preferences.autoDownload;
        this.updater.allowPrerelease = this.state.preferences.allowPrerelease;
        this.updater.autoInstallOnAppQuit = !this.state.preferences.requireInstallConfirmation;
        this.updater.setFeedURL({
            provider: 'github',
            owner: 'OverthinkerID',
            repo: 'Ngegame',
        });
    }
    emitState() {
        this.onStateChanged?.({ ...this.state });
    }
    wireUpdaterEvents() {
        if (!this.updater)
            return;
        this.updater.on('checking-for-update', () => {
            this.state = {
                ...this.state,
                status: 'checking',
                error: null,
                lastCheckedAt: new Date().toISOString(),
            };
            this.emitState();
        });
        this.updater.on('update-available', (infoRaw) => {
            const info = (infoRaw ?? {});
            const latestVersion = typeof info.version === 'string' ? info.version : null;
            const isNewer = latestVersion
                ? compareSemver(latestVersion, this.state.currentVersion) > 0
                : true;
            const firstFileSize = Array.isArray(info.files) && typeof info.files[0]?.size === 'number'
                ? info.files[0].size
                : null;
            this.state = {
                ...this.state,
                status: isNewer ? 'available' : 'not-available',
                updateAvailable: isNewer,
                latestVersion,
                releaseNotes: formatReleaseNotes(info.releaseNotes),
                releaseDate: typeof info.releaseDate === 'string' ? info.releaseDate : null,
                packageSizeBytes: firstFileSize,
                error: null,
            };
            this.emitState();
        });
        this.updater.on('update-not-available', (infoRaw) => {
            const info = (infoRaw ?? {});
            this.state = {
                ...this.state,
                status: 'not-available',
                updateAvailable: false,
                latestVersion: typeof info.version === 'string' ? info.version : this.state.currentVersion,
                releaseDate: typeof info.releaseDate === 'string' ? info.releaseDate : null,
                packageSizeBytes: null,
                progress: null,
                error: null,
            };
            this.emitState();
        });
        this.updater.on('download-progress', (progRaw) => {
            const p = (progRaw ?? {});
            this.state = {
                ...this.state,
                status: 'downloading',
                packageSizeBytes: Number(p.total ?? this.state.packageSizeBytes ?? 0) || this.state.packageSizeBytes || null,
                progress: {
                    percent: Number((p.percent ?? 0).toFixed(1)),
                    bytesPerSecond: Number(p.bytesPerSecond ?? 0),
                    transferred: Number(p.transferred ?? 0),
                    total: Number(p.total ?? 0),
                },
                error: null,
            };
            this.emitState();
        });
        this.updater.on('update-downloaded', (infoRaw) => {
            const info = (infoRaw ?? {});
            this.activeCancelHandle = null;
            this.state = {
                ...this.state,
                status: 'downloaded',
                updateAvailable: true,
                latestVersion: typeof info.version === 'string' ? info.version : this.state.latestVersion,
                releaseNotes: formatReleaseNotes(info.releaseNotes) ?? this.state.releaseNotes,
                releaseDate: typeof info.releaseDate === 'string' ? info.releaseDate : this.state.releaseDate,
                progress: {
                    percent: 100,
                    bytesPerSecond: 0,
                    transferred: this.state.progress?.total ?? 0,
                    total: this.state.progress?.total ?? 0,
                },
                error: null,
            };
            this.emitState();
        });
        this.updater.on('error', (errRaw) => {
            this.activeCancelHandle = null;
            const msg = errRaw instanceof Error ? errRaw.message : String(errRaw ?? 'Update error');
            this.state = {
                ...this.state,
                status: 'error',
                error: msg,
            };
            this.log(`[updater] Error: ${msg}`);
            this.emitState();
        });
    }
    getState() {
        return { ...this.state };
    }
    getPreferences() {
        return { ...this.state.preferences };
    }
    updatePreferences(partial) {
        let allowPrerelease = partial.allowPrerelease !== undefined
            ? partial.allowPrerelease
            : this.state.preferences.allowPrerelease;
        let channel = partial.channel ?? this.state.preferences.channel ?? 'stable';
        if (partial.channel !== undefined) {
            allowPrerelease = partial.channel === 'beta';
        }
        else if (partial.allowPrerelease !== undefined) {
            channel = partial.allowPrerelease ? 'beta' : 'stable';
        }
        const next = {
            ...this.state.preferences,
            ...partial,
            allowPrerelease,
            channel,
        };
        this.state = { ...this.state, preferences: next, channel };
        this.savePreferences(next);
        this.applyPreferencesToUpdater();
        this.emitState();
        return { ...next };
    }
    async maybeCheckOnStartup() {
        if (!this.isPackaged) {
            return;
        }
        if (shouldRunAutoCheck(this.state.preferences, this.state.lastCheckedAt)) {
            await this.checkForUpdates();
        }
    }
    async checkForUpdates() {
        this.state = {
            ...this.state,
            lastCheckedAt: new Date().toISOString(),
            error: null,
        };
        if (!this.isPackaged || !this.updater) {
            this.state = {
                ...this.state,
                status: 'not-available',
                updateAvailable: false,
                latestVersion: this.state.currentVersion,
                error: this.isPackaged
                    ? 'electron-updater belum diinisialisasi.'
                    : 'Mode pengembangan (unpackaged): pemeriksaan rilis GitHub aktif pada aplikasi terinstal.',
            };
            this.emitState();
            return this.getState();
        }
        try {
            this.state.status = 'checking';
            this.emitState();
            await this.updater.checkForUpdates();
        }
        catch (err) {
            this.state = {
                ...this.state,
                status: 'error',
                error: err instanceof Error ? err.message : String(err),
            };
            this.emitState();
        }
        return this.getState();
    }
    async downloadUpdate() {
        if (!this.isPackaged || !this.updater) {
            this.state = {
                ...this.state,
                status: 'error',
                error: 'Unduhan update hanya tersedia pada aplikasi hasil build/instalasi.',
            };
            this.emitState();
            return this.getState();
        }
        try {
            let cancelled = false;
            const cancelToken = {
                cancelled: false,
                cancel: () => {
                    cancelled = true;
                    cancelToken.cancelled = true;
                },
            };
            this.activeCancelHandle = cancelToken;
            this.state = {
                ...this.state,
                status: 'downloading',
                error: null,
            };
            this.emitState();
            await this.updater.downloadUpdate(cancelToken);
            if (cancelled) {
                this.state = {
                    ...this.state,
                    status: 'cancelled',
                    progress: null,
                    error: 'Unduhan dibatalkan oleh pengguna.',
                };
                this.emitState();
            }
        }
        catch (err) {
            if (this.state.status === 'cancelled') {
                return this.getState();
            }
            this.state = {
                ...this.state,
                status: 'error',
                error: err instanceof Error ? err.message : String(err),
            };
            this.emitState();
        }
        finally {
            this.activeCancelHandle = null;
        }
        return this.getState();
    }
    cancelDownload() {
        if (this.activeCancelHandle) {
            this.activeCancelHandle.cancel();
            this.activeCancelHandle = null;
        }
        if (this.state.status === 'downloading') {
            this.state = {
                ...this.state,
                status: 'cancelled',
                progress: null,
                error: 'Unduhan dibatalkan oleh pengguna.',
            };
            this.emitState();
        }
        return this.getState();
    }
    async retryDownload() {
        if (this.state.status === 'error' || this.state.status === 'cancelled') {
            this.state = {
                ...this.state,
                status: this.state.updateAvailable ? 'available' : 'idle',
                error: null,
                progress: null,
            };
            this.emitState();
        }
        return this.downloadUpdate();
    }
    backupDatabase() {
        const backupPath = backupDatabaseFile(this.dbPath, this.backupDir, this.state.currentVersion);
        this.state = { ...this.state, lastBackupPath: backupPath };
        this.emitState();
        return backupPath;
    }
    restoreDatabase(backupPath) {
        return restoreDatabaseFile(backupPath, this.dbPath);
    }
    async installUpdate(options = {}) {
        if (this.state.preferences.requireInstallConfirmation && !options.confirmed) {
            throw new Error('Konfirmasi pengguna diperlukan sebelum memasang update dan me-restart aplikasi.');
        }
        if (this.checkActiveTasks) {
            const guard = await this.checkActiveTasks();
            if (guard.blocking && !options.stopActiveTasks) {
                this.state = {
                    ...this.state,
                    activeTasksBlocking: true,
                    activeTasksReason: guard.reason,
                };
                this.emitState();
                return this.getState();
            }
            if (guard.blocking && options.stopActiveTasks && this.stopActiveTasksFn) {
                await this.stopActiveTasksFn();
            }
        }
        this.state = {
            ...this.state,
            activeTasksBlocking: false,
            activeTasksReason: null,
            status: 'installing',
            error: null,
        };
        this.backupDatabase();
        this.emitState();
        if (this.isPackaged && this.updater && this.state.status === 'installing') {
            this.updater.quitAndInstall(false, true);
        }
        return this.getState();
    }
}
//# sourceMappingURL=autoUpdateManager.js.map