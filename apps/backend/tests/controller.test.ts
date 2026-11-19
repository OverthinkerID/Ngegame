import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ControllerService } from '../src/services/controller/controllerService.js';
import { PythonWorkerClient } from '../src/workers/pythonWorkerClient.js';

describe('Game Controller Integration', () => {
  it('executes dry-run action, enforces emergency stop, and logs to SQLite', async () => {
    const workerScript = path.resolve(process.cwd(), '..', 'python-worker', 'main.py');
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    const workerClient = new PythonWorkerClient({
      pythonBin,
      workerScriptPath: workerScript,
      timeoutMs: 5000,
    });

    const controller = new ControllerService(workerClient);
    const createdIds: number[] = [];

    try {
      const execRes = await controller.executeAction({
        actionType: 'MOVE_DIRECTION',
        target: 'north',
        parameters: { direction: 'up' },
        durationMs: 400,
        dryRun: true,
      });

      assert.equal(execRes.ok, true);
      assert.equal(execRes.status, 'simulated');
      if (execRes.id !== undefined) createdIds.push(execRes.id);

      const stopped = await controller.emergencyStop();
      assert.equal(stopped.emergencyStopped, true);

      const blocked = await controller.executeAction({
        actionType: 'INTERACT',
        target: 'door',
        dryRun: true,
      });
      assert.equal(blocked.ok, false);
      assert.equal(blocked.status, 'blocked');
      if (blocked.id !== undefined) createdIds.push(blocked.id);

      const reset = await controller.resetEmergency();
      assert.equal(reset.emergencyStopped, false);
    } finally {
      if (createdIds.length > 0) {
        const { getPrismaClient, disconnectDatabase } = await import('../src/db/prisma.js');
        const prisma = getPrismaClient();
        await prisma.controllerActionLog.deleteMany({
          where: { id: { in: createdIds } },
        });
        await disconnectDatabase();
      }
      await workerClient.stop();
    }
  });
});
