import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UpdateService } from '../src/services/updates/updateService.js';

describe('Phase 17: Backend UpdateService & Runtime Compatibility', () => {
  it('handles status, check, preferences, history, download/cancel, compatibility, and recovery logs', async () => {
    const service = new UpdateService();

    const initialStatus = await service.getStatus();
    assert.ok(initialStatus.currentVersion);
    assert.equal(initialStatus.compatibility.databaseReadable, true);
    assert.equal(initialStatus.compatibility.prismaSchemaValid, true);

    await service.markChecked();
    const afterCheck = await service.getPreferences();
    assert.ok(afterCheck.lastCheckedAt);

    const betaPrefs = await service.updatePreferences({
      channel: 'beta',
      checkFrequency: 'daily',
    });
    assert.equal(betaPrefs.allowPrerelease, true);
    assert.equal(betaPrefs.channel, 'beta');
    assert.equal(betaPrefs.checkFrequency, 'daily');

    // Reset preferences back to safe defaults
    const safePrefs = await service.updatePreferences({
      autoCheck: true,
      autoDownload: false,
      requireInstallConfirmation: true,
      checkFrequency: 'startup',
      channel: 'stable',
    });
    assert.equal(safePrefs.allowPrerelease, false);
    assert.equal(safePrefs.channel, 'stable');

    const dl = await service.startOrUpdateDownload({
      version: '0.2.0',
      status: 'downloading',
      totalBytes: 50_000_000,
      downloadedBytes: 10_000_000,
      percent: 20,
    });
    assert.equal(dl.status, 'downloading');

    const cancelled = await service.cancelActiveDownload('0.2.0');
    assert.ok(cancelled);
    assert.equal(cancelled?.status, 'cancelled');

    const hist = await service.recordHistory({
      toVersion: '0.2.0',
      status: 'checked',
      channel: 'stable',
    });
    assert.equal(hist.toVersion, '0.2.0');

    const historyList = await service.listHistory(5);
    assert.ok(historyList.length >= 1);

    const recLog = await service.recordRecoveryLog({
      version: '0.1.0',
      action: 'pre_update_backup',
      success: true,
      details: 'Backup SQLite sebelum pembaruan uji',
    });
    assert.equal(recLog.action, 'pre_update_backup');

    const recoveryList = await service.listRecoveryLogs(5);
    assert.ok(recoveryList.length >= 1);

    const compat = await service.checkRuntimeCompatibility();
    assert.equal(compat.databaseReadable, true);
    assert.equal(compat.prismaSchemaValid, true);
  });
});
