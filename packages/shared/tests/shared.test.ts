import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, ErrorCode, IPC_CHANNELS } from '../dist/index.js';

describe('@ngegame/shared', () => {
  it('creates AppError with structured JSON serialization', () => {
    const err = new AppError('Worker timeout', ErrorCode.WORKER_TIMEOUT, 504, {
      timeoutMs: 5000,
    });

    assert.equal(err.name, 'AppError');
    assert.equal(err.code, ErrorCode.WORKER_TIMEOUT);
    assert.equal(err.statusCode, 504);

    const json = err.toJSON();
    assert.deepEqual(json, {
      name: 'AppError',
      message: 'Worker timeout',
      code: ErrorCode.WORKER_TIMEOUT,
      statusCode: 504,
      details: { timeoutMs: 5000 },
    });
  });

  it('exposes expected IPC channel constants', () => {
    assert.equal(IPC_CHANNELS.APP_GET_INFO, 'app:get-info');
    assert.equal(IPC_CHANNELS.BACKEND_HEALTH, 'backend:health');
    assert.equal(IPC_CHANNELS.WORKER_PING, 'worker:ping');
  });
});
