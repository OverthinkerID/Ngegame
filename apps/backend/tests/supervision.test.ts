import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ControllerService } from '../src/services/controller/controllerService.js';
import { SupervisionService } from '../src/services/supervision/supervisionService.js';
import { PythonWorkerClient } from '../src/workers/pythonWorkerClient.js';

describe('Human Supervision System', () => {
  it('tests L1 auto-execute, L2 approve/reject, L3 human-only, takeover, and emergency stop', async () => {
    const workerScript = path.resolve(process.cwd(), '..', 'python-worker', 'main.py');
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    const workerClient = new PythonWorkerClient({
      pythonBin,
      workerScriptPath: workerScript,
      timeoutMs: 5000,
    });

    const controller = new ControllerService(workerClient);
    const supervision = new SupervisionService(controller);
    const createdQueueIds: number[] = [];

    try {
      // 1. L2 Approval Required -> submit -> approve -> executed
      await supervision.setPermissionLevel('L2');
      const l2Pending = await supervision.submitAction({
        actionType: 'INTERACT',
        target: 'NPC Pierre',
        confidence: 0.9,
        dryRun: true,
      });
      createdQueueIds.push(l2Pending.id);
      assert.equal(l2Pending.status, 'pending');

      const l2Approved = await supervision.approveAction(l2Pending.id, 'Disetujui uji');
      assert.equal(l2Approved.status, 'executed');

      // 2. L2 Reject
      const l2ToReject = await supervision.submitAction({
        actionType: 'PAUSE_MENU',
        target: 'menu',
        confidence: 0.8,
        dryRun: true,
      });
      createdQueueIds.push(l2ToReject.id);
      const l2Rejected = await supervision.rejectAction(l2ToReject.id, 'Tidak perlu');
      assert.equal(l2Rejected.status, 'rejected');

      // 3. L1 Auto Execute
      await supervision.setPermissionLevel('L1');
      const l1Auto = await supervision.submitAction({
        actionType: 'MOVE_DIRECTION',
        target: 'north',
        parameters: { direction: 'up' },
        confidence: 0.95,
        dryRun: true,
      });
      createdQueueIds.push(l1Auto.id);
      assert.equal(l1Auto.status, 'executed');

      // 4. Human Takeover blocks AI & Return Control restores AI
      const takeoverState = await supervision.takeOverControl();
      assert.equal(takeoverState.controlOwner, 'human');
      assert.equal(takeoverState.aiPaused, true);

      const blockedDuringTakeover = await supervision.submitAction({
        actionType: 'INTERACT',
        target: 'door',
        confidence: 0.99,
        dryRun: true,
      });
      createdQueueIds.push(blockedDuringTakeover.id);
      assert.equal(blockedDuringTakeover.status, 'blocked');

      const returned = await supervision.returnControlToAI();
      assert.equal(returned.controlOwner, 'ai');
      assert.equal(returned.aiPaused, false);

      // 5. L3 Human Only blocks returning control to AI
      await supervision.setPermissionLevel('L3');
      await assert.rejects(() => supervision.returnControlToAI());

      // 6. Emergency Stop blocks all without closing game or OBS
      await supervision.setPermissionLevel('L2');
      const emState = await supervision.emergencyStop();
      assert.equal(emState.emergencyStopped, true);
      assert.equal(emState.obsAffectedByEmergency, false);
      assert.equal(emState.gameClosedByEmergency, false);

      await supervision.resetEmergency();
    } finally {
      const { getPrismaClient, disconnectDatabase } = await import('../src/db/prisma.js');
      const prisma = getPrismaClient();
      if (createdQueueIds.length > 0) {
        await prisma.supervisionQueueItem.deleteMany({
          where: { id: { in: createdQueueIds } },
        });
      }
      await disconnectDatabase();
      await workerClient.stop();
    }
  });
});
