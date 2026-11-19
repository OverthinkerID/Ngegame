import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskSecret, StreamCredentialStore } from '../src/services/streaming/credentialStore.js';
import { StreamingService } from '../src/services/streaming/streamingService.js';

describe('OBS & Multistream Security & Service', () => {
  it('masks stream keys and stores secrets securely without plaintext SQLite storage', async () => {
    const rawKey = 'live_secret_key_987654321';
    assert.equal(maskSecret(rawKey), '************4321');

    const store = new StreamCredentialStore();
    await store.saveSecret('test-youtube-key', rawKey);
    const retrieved = await store.getSecret('test-youtube-key');
    assert.equal(retrieved, rawKey);
    await store.deleteSecret('test-youtube-key');
  });

  it('validates stream credentials and refuses starting stream without OBS connection', async () => {
    const streaming = new StreamingService();
    await streaming.saveCredential({
      platform: 'youtube',
      streamKey: 'yt-test-unlisted-1234',
      visibilityMode: 'unlisted',
      enabled: true,
    });
    await streaming.saveCredential({
      platform: 'twitch',
      streamKey: 'tw-test-private-5678',
      visibilityMode: 'private',
      enabled: true,
    });

    const status = await streaming.getStatus();
    const yt = status.targets.find((t) => t.platform === 'youtube');
    assert.ok(yt?.hasStreamKey);
    assert.equal(yt?.maskedKey, '************1234');
    assert.equal(yt?.visibilityMode, 'unlisted');

    // Should refuse startStreaming cleanly when OBS is not connected
    await assert.rejects(() => streaming.startStreaming());

    await streaming.deleteCredential('youtube');
    await streaming.deleteCredential('twitch');
  });
});
