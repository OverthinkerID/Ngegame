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

      // 6. Risk Assessment & High-Risk Destructive Action Gate even in L1
      const lowRisk = supervision.assessActionRisk('MOVE_DIRECTION', 'north', 'Jalan ke ladang', 0.95);
      assert.equal(lowRisk.riskLevel, 'low');
      assert.equal(lowRisk.requiresExplicitApproval, false);

      const medRisk = supervision.assessActionRisk('INTERACT', 'NPC Pierre', 'Bicara dengan NPC', 0.92);
      assert.equal(medRisk.riskLevel, 'medium');
      assert.equal(medRisk.requiresExplicitApproval, true);

      const highRisk = supervision.assessActionRisk('USE_ITEM', 'Shipping Bin', 'Sell all parsnips', 0.98);
      assert.equal(highRisk.riskLevel, 'high');
      assert.equal(highRisk.requiredApprovalLevel, 'L3');
      assert.equal(highRisk.requiresExplicitApproval, true);

      const lowConfRisk = supervision.assessActionRisk('MOVE_DIRECTION', 'south', 'Ragu posisi', 0.45);
      assert.equal(lowConfRisk.riskLevel, 'high');
      assert.equal(lowConfRisk.requiresExplicitApproval, true);

      await supervision.setPermissionLevel('L1');
      await supervision.returnControlToAI();
      const highRiskQueued = await supervision.submitAction({
        actionType: 'USE_ITEM',
        target: 'Trash Can',
        rationale: 'Buang item dari inventory',
        confidence: 0.99,
        dryRun: true,
      });
      createdQueueIds.push(highRiskQueued.id);
      assert.equal(highRiskQueued.status, 'pending');

      const approvedHighRisk = await supervision.approveAction(highRiskQueued.id, 'Manusia setuju buang');
      assert.equal(approvedHighRisk.status, 'executed');

      // 7. Stop Task cancels pending queue items & pauses AI
      await supervision.setPermissionLevel('L2');
      const pendingBeforeStop = await supervision.submitAction({
        actionType: 'INTERACT',
        target: 'Chest',
        confidence: 0.9,
        dryRun: true,
      });
      createdQueueIds.push(pendingBeforeStop.id);
      assert.equal(pendingBeforeStop.status, 'pending');

      const stoppedState = await supervision.stopTask();
      assert.equal(stoppedState.aiPaused, true);
      assert.equal(stoppedState.pendingCount, 0);

      const blockedAfterStop = await supervision.submitAction({
        actionType: 'MOVE_DIRECTION',
        target: 'east',
        confidence: 0.95,
        dryRun: true,
      });
      createdQueueIds.push(blockedAfterStop.id);
      assert.equal(blockedAfterStop.status, 'blocked');

      await supervision.resumeAI();

      // 8. Emergency Stop blocks all without closing game or OBS
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
