import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnvConfig, validateEnvConfig } from '../src/config/env.js';
import { disconnectDatabase } from '../src/db/prisma.js';
import { BackupService } from '../src/services/system/backupService.js';
import { redactSensitiveData } from '../src/utils/logger.js';

describe('Foundation Hardening & Security', () => {
  it('redacts sensitive keys and secret token patterns in logger metadata', () => {
    const redacted = redactSensitiveData({
      streamKey: 'live_secret_1234567890',
      password: 'my-obs-password',
      nested: {
        apiKey: 'sk-test-abcdef1234567890',
        safeField: 'Stardew Valley',
      },
    }) as Record<string, unknown>;

    assert.equal(redacted.streamKey, '[REDACTED]');
    assert.equal(redacted.password, '[REDACTED]');
    const nested = redacted.nested as Record<string, unknown>;
    assert.equal(nested.apiKey, '[REDACTED]');
    assert.equal(nested.safeField, 'Stardew Valley');
  });

  it('validates environment config and SQLite database integrity', async () => {
    const config = loadEnvConfig();
    const valid = validateEnvConfig(config);
    assert.equal(valid.valid, true);

    const invalid = validateEnvConfig({ ...config, databaseUrl: 'postgresql://localhost/db' });
    assert.equal(invalid.valid, false);

    const backup = new BackupService();
    try {
      const integrity = await backup.checkIntegrity();
      assert.equal(integrity.ok, true);
    } finally {
      await disconnectDatabase();
    }
  });
});
