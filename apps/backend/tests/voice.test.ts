import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateIndonesianCommentary } from '../src/services/voice/commentaryGenerator.js';
import { VoiceStudioService } from '../src/services/voice/voiceService.js';

describe('AI Voice Studio (VoxCPM 2.0 & Indonesian Commentary)', () => {
  it('generates natural Indonesian gaming commentary for events', () => {
    const highlight = generateIndonesianCommentary(
      {
        eventType: 'HIGH_MOTION',
        gameTitle: 'Stardew Valley',
        details: 'Karakter memasuki area tambang',
      },
      'ekspresif',
    );
    assert.equal(highlight.emotion, 'excited');
    assert.ok(highlight.text.includes('Stardew Valley'));

    const danger = generateIndonesianCommentary(
      {
        eventType: 'LOW_HP',
        gameTitle: 'Terraria',
        details: 'HP tersisa 15%',
      },
      'taktis',
    );
    assert.equal(danger.emotion, 'tense');
    assert.ok(danger.text.includes('Terraria'));
  });

  it('isolates VoxCPM 2.0 connection failure and enforces commentary cooldown', async () => {
    const voice = new VoiceStudioService();
    voice.updateSettings({
      voxcpmBaseUrl: 'http://localhost:59998', // unreachable port to test isolated fallback
      minCooldownSeconds: 10,
      speed: 1.1,
      volume: 90,
    });

    const createdIds: number[] = [];
    try {
      const first = await voice.speak({
        text: 'Halo semuanya, kita mulai petualangan di Stardew Valley!',
        emotion: 'excited',
        playAudio: false,
      });

      assert.equal(first.ok, true);
      assert.equal(first.fallbackUsed, true);
      assert.equal(first.status, 'spoken');
      if (first.id !== undefined) createdIds.push(first.id);

      // Immediate second commentary should respect cooldown anti-spam
      const skipped = await voice.generateAndSpeakCommentary({
        eventType: 'SCENE_TRANSITION',
        gameTitle: 'Stardew Valley',
        details: 'Masuk toko Pierre',
      });
      assert.equal(skipped.status, 'skipped_cooldown');
    } finally {
      if (createdIds.length > 0) {
        const { getPrismaClient, disconnectDatabase } = await import('../src/db/prisma.js');
        const prisma = getPrismaClient();
        await prisma.voiceSpeechLog.deleteMany({ where: { id: { in: createdIds } } });
        await disconnectDatabase();
      }
    }
  });
});
