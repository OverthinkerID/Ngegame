import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameProfileManager } from '../src/services/adaptation/gameProfileManager.js';
import { HybridLearningService } from '../src/services/adaptation/hybridLearningService.js';

describe('Phase 12F.8 — Hybrid AI Learning Engine', () => {
  it('learns from experience & user feedback, creates proposals without mutating profile until human approval, and supports reset', async () => {
    const profileManager = new GameProfileManager();
    const learning = new HybridLearningService(profileManager);
    const gameId = 'stardew-valley';

    await profileManager.resetProfile(gameId);
    await learning.resetLearning(gameId);

    // 1 pengalaman tunggal tidak boleh langsung membuat proposal
    await learning.recordExperience(gameId, 'success', 'INTERACT:gameplay', { action: 'water' }, 0.88);
    await assert.rejects(() => learning.generateProposalFromExperience(gameId));

    // Tambahkan pengalaman kedua & koreksi pengguna
    await learning.recordExperience(gameId, 'failure', 'MOVE_DIRECTION:unknown', { reason: 'low_conf' }, 0.42);
    await learning.recordExperience(gameId, 'failure', 'INTERACT:unknown', { reason: 'no_focus' }, 0.45);
    await learning.submitUserFeedback(gameId, 'Selalu cek fokus sebelum menyiram tanaman', 'correction', 'water');

    const insights = await learning.getContextualInsights(gameId);
    assert.equal(insights.failedCount, 2);
    assert.equal(insights.successfulCount, 1);
    assert.equal(insights.feedbackCount, 1);

    // Buat proposal adaptasi (status pending, profil permanen BELUM berubah)
    const beforeProfile = await profileManager.getProfile(gameId);
    const proposal = await learning.generateProposalFromExperience(gameId);
    assert.equal(proposal.status, 'pending');

    const stillUnchanged = await profileManager.getProfile(gameId);
    assert.equal(stillUnchanged.profileVersion, beforeProfile.profileVersion);
    assert.equal(
      stillUnchanged.safetyConfiguration.minConfidence,
      beforeProfile.safetyConfiguration.minConfidence,
    );

    // Persetujuan manusia menerapkan perubahan dan mencatat versi profil baru
    const approved = await learning.approveProposal(proposal.id, 'Disetujui QA');
    assert.equal(approved.proposal.status, 'approved');
    assert.equal(approved.updatedProfile.profileVersion, beforeProfile.profileVersion + 1);
    assert.ok(
      approved.updatedProfile.safetyConfiguration.minConfidence >
        beforeProfile.safetyConfiguration.minConfidence,
    );

    // Uji penolakan proposal
    const proposal2 = await learning.generateProposalFromExperience(gameId);
    const rejected = await learning.rejectProposal(proposal2.id, 'Tidak perlu naikkan lagi');
    assert.equal(rejected.status, 'rejected');

    // Reset pembelajaran & kembalikan profil bawaan
    const resetRes = await learning.resetLearning(gameId);
    assert.ok(resetRes.deletedMemories >= 4);
    await profileManager.resetProfile(gameId);
  });
});
