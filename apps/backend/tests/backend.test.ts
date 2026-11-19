import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEnvConfig } from '../src/config/env.js';
import { PythonWorkerClient } from '../src/workers/pythonWorkerClient.js';

describe('@ngegame/backend', () => {
  it('loads default environment configuration', () => {
    const config = loadEnvConfig();
    assert.equal(config.host, '127.0.0.1');
    assert.equal(typeof config.port, 'number');
    assert.ok(config.port > 0);
  });

  it('communicates with Python Worker via NDJSON', async () => {
    const workerScript = path.resolve(
      process.cwd(),
      '..',
      'python-worker',
      'main.py',
    );
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    const client = new PythonWorkerClient({
      pythonBin,
      workerScriptPath: workerScript,
      timeoutMs: 5000,
    });

    try {
      const pingRes = await client.sendCommand('ping', { message: 'backend-test' });
      assert.equal(pingRes.ok, true);
      assert.equal(pingRes.data?.pong, true);
      assert.equal(pingRes.data?.echo, 'backend-test');

      const healthRes = await client.checkHealth();
      assert.equal(healthRes.status, 'healthy');
    } finally {
      await client.stop();
    }
  });
});
