import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AutoUpdateManager, backupDatabaseFile, compareSemver, DEFAULT_UPDATE_PREFERENCES, restoreDatabaseFile, shouldRunAutoCheck, } from '../src/updater/autoUpdateManager.js';
class MockAutoUpdater extends EventEmitter {
    autoDownload = false;
    autoInstallOnAppQuit = false;
    allowPrerelease = false;
    feedUrl = null;
    quitAndInstallCalls = 0;
    setFeedURL(options) {
        this.feedUrl = options;
    }
    async checkForUpdates() {
        this.emit('checking-for-update');
    }
    async downloadUpdate() {
        this.emit('download-progress', {
            percent: 55.4,
            bytesPerSecond: 1024 * 512,
            transferred: 5500,
            total: 10000,
        });
    }
    quitAndInstall() {
        this.quitAndInstallCalls += 1;
    }
}
describe('Auto Update System (electron-updater, safety, DB preservation)', () => {
    it('compares semver versions including prerelease tags accurately', () => {
        assert.equal(compareSemver('0.2.0', '0.1.0'), 1);
        assert.equal(compareSemver('0.1.0', '0.1.0'), 0);
        assert.equal(compareSemver('0.1.0', '0.2.0'), -1);
        assert.equal(compareSemver('1.0.0', '1.0.0-beta.1'), 1);
        assert.equal(compareSemver('v1.2.3', '1.2.2'), 1);
    });
    it('enforces default preferences and check frequency scheduling', () => {
        assert.equal(DEFAULT_UPDATE_PREFERENCES.autoCheck, true);
        assert.equal(DEFAULT_UPDATE_PREFERENCES.autoDownload, false);
        assert.equal(DEFAULT_UPDATE_PREFERENCES.requireInstallConfirmation, true);
        assert.equal(DEFAULT_UPDATE_PREFERENCES.allowPrerelease, false);
        assert.equal(shouldRunAutoCheck(DEFAULT_UPDATE_PREFERENCES, null), true);
        assert.equal(shouldRunAutoCheck({ ...DEFAULT_UPDATE_PREFERENCES, autoCheck: false }, null), false);
        const now = Date.now();
        assert.equal(shouldRunAutoCheck({ ...DEFAULT_UPDATE_PREFERENCES, checkFrequency: 'daily' }, new Date(now - 3600_000).toISOString(), now), false);
        assert.equal(shouldRunAutoCheck({ ...DEFAULT_UPDATE_PREFERENCES, checkFrequency: 'daily' }, new Date(now - 25 * 3600_000).toISOString(), now), true);
    });
    it('handles update-available, no-update, download progress, download failure, and signature failure', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngegame-updater-'));
        try {
            const mockUpdater = new MockAutoUpdater();
            const manager = new AutoUpdateManager({
                currentVersion: '0.1.0',
                userDataDir: tmpDir,
                isPackaged: true,
                autoUpdater: mockUpdater,
            });
            assert.deepEqual(mockUpdater.feedUrl, {
                provider: 'github',
                owner: 'OverthinkerID',
                repo: 'Ngegame',
            });
            // Update available
            await manager.checkForUpdates();
            mockUpdater.emit('update-available', {
                version: '0.2.0',
                releaseNotes: '<p>Perbaikan OBS & AI</p>',
                releaseDate: '2026-11-21T00:00:00Z',
            });
            let state = manager.getState();
            assert.equal(state.status, 'available');
            assert.equal(state.updateAvailable, true);
            assert.equal(state.latestVersion, '0.2.0');
            assert.equal(state.releaseNotes, 'Perbaikan OBS & AI');
            // Download progress & downloaded
            await manager.downloadUpdate();
            state = manager.getState();
            assert.equal(state.status, 'downloading');
            assert.equal(state.progress?.percent, 55.4);
            mockUpdater.emit('update-downloaded', { version: '0.2.0' });
            state = manager.getState();
            assert.equal(state.status, 'downloaded');
            assert.equal(state.progress?.percent, 100);
            // No update
            mockUpdater.emit('update-not-available', { version: '0.2.0' });
            state = manager.getState();
            assert.equal(state.status, 'not-available');
            assert.equal(state.updateAvailable, false);
            // Download / signature failure
            mockUpdater.emit('error', new Error('Code signature verification failed'));
            state = manager.getState();
            assert.equal(state.status, 'error');
            assert.match(state.error ?? '', /signature/i);
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
    it('guards active AI/streaming tasks, requires confirmation, backs up & restores SQLite DB, and triggers quitAndInstall', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngegame-updater-db-'));
        try {
            const dbPath = path.join(tmpDir, 'ngegame.db');
            fs.writeFileSync(dbPath, 'SQLITE_USER_DATA_V1', 'utf8');
            const mockUpdater = new MockAutoUpdater();
            let tasksActive = true;
            let stopCalled = false;
            const manager = new AutoUpdateManager({
                currentVersion: '0.1.0',
                userDataDir: tmpDir,
                isPackaged: true,
                autoUpdater: mockUpdater,
                checkActiveTasks: async () => ({
                    blocking: tasksActive,
                    reason: tasksActive ? 'Siaran langsung OBS sedang aktif' : null,
                }),
                stopActiveTasks: async () => {
                    stopCalled = true;
                    tasksActive = false;
                },
            });
            // Requires explicit confirmation
            await assert.rejects(() => manager.installUpdate({ confirmed: false }));
            // Blocked when active tasks exist and stopActiveTasks is false
            const blocked = await manager.installUpdate({ confirmed: true, stopActiveTasks: false });
            assert.equal(blocked.activeTasksBlocking, true);
            assert.equal(mockUpdater.quitAndInstallCalls, 0);
            // Stops active tasks safely, backs up SQLite DB, and installs
            const installed = await manager.installUpdate({ confirmed: true, stopActiveTasks: true });
            assert.equal(stopCalled, true);
            assert.equal(installed.status, 'installing');
            assert.ok(installed.lastBackupPath && fs.existsSync(installed.lastBackupPath));
            assert.equal(mockUpdater.quitAndInstallCalls, 1);
            // Recovery: restore database if update/migration corrupted DB
            fs.writeFileSync(dbPath, 'CORRUPTED_DB', 'utf8');
            const restored = restoreDatabaseFile(installed.lastBackupPath, dbPath);
            assert.equal(restored, true);
            assert.equal(fs.readFileSync(dbPath, 'utf8'), 'SQLITE_USER_DATA_V1');
            // Direct helper retention check
            const directBackup = backupDatabaseFile(dbPath, path.join(tmpDir, 'backups'), '0.1.0');
            assert.ok(directBackup && fs.existsSync(directBackup));
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=updater.test.js.map