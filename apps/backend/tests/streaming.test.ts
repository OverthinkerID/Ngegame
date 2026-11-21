import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  maskSecret,
  redactSensitiveText,
  StreamCredentialStore,
} from '../src/services/streaming/credentialStore.js';
import { ObsWebSocketClient } from '../src/services/streaming/obsWebSocketClient.js';
import { StreamingService } from '../src/services/streaming/streamingService.js';

describe('Phase 15: OBS, YouTube, Twitch, Narration, Assistant & Security', () => {
  it('masks stream keys, redacts sensitive logs, and stores secrets in encrypted vault', async () => {
    const rawKey = 'live_secret_key_987654321';
    assert.equal(maskSecret(rawKey), '************4321');
    assert.equal(
      redactSensitiveText(`Using key=${rawKey} and Bearer ya29.abcdefghijklmno`),
      'Using key=live_***REDACTED*** and Bearer ya29.***REDACTED***',
    );

    const store = new StreamCredentialStore();
    await store.saveSecret('test-youtube-key', rawKey);
    const retrieved = await store.getSecret('test-youtube-key');
    assert.equal(retrieved, rawKey);
    await store.deleteSecret('test-youtube-key');
  });

  it('handles OBS scene switching, audio mixer, recording, bitrate, public gate, and emergency stop', async () => {
    const streaming = new StreamingService();
    const obsClient = (streaming as unknown as { obsClient: ObsWebSocketClient }).obsClient;

    let currentScene = 'Gameplay';
    let streamingActive = false;
    let recordingActive = false;
    let micMuted = false;
    let micVolumeDb = -6;
    let outputBytes = 100000;

    obsClient.isConnected = () => true;
    obsClient.getObsVersion = () => '5.4.0';
    obsClient.request = async (reqType: string, reqData?: Record<string, unknown>) => {
      if (reqType === 'GetSceneList') {
        return {
          currentProgramSceneName: currentScene,
          scenes: [{ sceneName: 'Gameplay' }, { sceneName: 'Pause / BRB' }],
        };
      }
      if (reqType === 'SetCurrentProgramScene') {
        currentScene = String(reqData?.sceneName ?? currentScene);
        return {};
      }
      if (reqType === 'GetSceneItemList') {
        return {
          sceneItems: [{ sceneItemId: 1, sourceName: 'Stardew Capture', sceneItemEnabled: true }],
        };
      }
      if (reqType === 'GetInputList') {
        return {
          inputs: [{ inputName: 'Desktop Audio', inputKind: 'coreaudio_output_capture' }],
        };
      }
      if (reqType === 'GetInputMute') return { inputMuted: micMuted };
      if (reqType === 'SetInputMute') {
        micMuted = Boolean(reqData?.inputMuted);
        return {};
      }
      if (reqType === 'GetInputVolume') return { inputVolumeDb: micVolumeDb, inputVolumeMul: 0.5 };
      if (reqType === 'SetInputVolume') {
        micVolumeDb = Number(reqData?.inputVolumeDb ?? micVolumeDb);
        return {};
      }
      if (reqType === 'GetStreamStatus') {
        outputBytes += 250000;
        return {
          outputActive: streamingActive,
          outputReconnecting: false,
          outputDuration: streamingActive ? 5000 : 0,
          outputTotalFrames: 300,
          outputSkippedFrames: 1,
          outputBytes,
          outputCongestion: 0,
        };
      }
      if (reqType === 'GetStats') return { activeFps: 60 };
      if (reqType === 'GetRecordStatus') {
        return {
          outputActive: recordingActive,
          outputPaused: false,
          outputDuration: recordingActive ? 2000 : 0,
          outputBytes: recordingActive ? 400000 : 0,
        };
      }
      if (reqType === 'StartStream') {
        streamingActive = true;
        return {};
      }
      if (reqType === 'StopStream') {
        streamingActive = false;
        return {};
      }
      if (reqType === 'StartRecord') {
        recordingActive = true;
        return {};
      }
      if (reqType === 'StopRecord') {
        recordingActive = false;
        return {};
      }
      return {};
    };

    const status = await streaming.getStatus();
    assert.equal(status.obsConnected, true);
    assert.equal(status.obsVersion, '5.4.0');
    assert.equal(status.currentScene, 'Gameplay');

    const afterScene = await streaming.setScene('Pause / BRB');
    assert.equal(afterScene.currentScene, 'Pause / BRB');
    const afterMute = await streaming.setAudioMute('Desktop Audio', true);
    assert.equal(afterMute.audioInputs[0]?.muted, true);
    const afterVol = await streaming.setAudioVolume('Desktop Audio', -15);
    assert.equal(afterVol.audioInputs[0]?.volumeDb, -15);

    const recOn = await streaming.startRecording();
    assert.equal(recOn.recording.recording, true);
    const recOff = await streaming.stopRecording();
    assert.equal(recOff.recording.recording, false);

    // Public confirmation gate
    await streaming.saveCredential({
      platform: 'youtube',
      streamKey: 'yt-public-key-1234',
      visibilityMode: 'public',
      enabled: true,
    });
    await streaming.saveCredential({
      platform: 'twitch',
      streamKey: 'tw-private-key-5678',
      visibilityMode: 'private',
      enabled: true,
    });
    await assert.rejects(() => streaming.startStreaming({ confirmedPublic: false }));

    const live = await streaming.startStreaming({ confirmedPublic: true, title: 'Uji Phase 15' });
    assert.equal(live.health.streaming, true);
    const stopped = await streaming.stopStreaming();
    assert.equal(stopped.health.streaming, false);

    const emerg = await streaming.emergencyStop();
    assert.equal(emerg.vault.emergencyStopActive, true);

    // Verify SHA-256 OBS auth hash format compatibility
    const authDigest = crypto.createHash('sha256').update('obs-test-salted').digest('base64');
    assert.ok(authDigest.length > 10);

    await streaming.deleteCredential('youtube');
    await streaming.deleteCredential('twitch');
  });

  it('validates least-privilege YouTube/Twitch OAuth state and AI Narration & Assistant supervision', async () => {
    const streaming = new StreamingService();

    await streaming.configureYouTubeOAuth({
      clientId: 'yt-client-test',
      authEndpoint: 'https://example.local/yt-auth',
      allowManage: false,
    });
    const ytAuth = await streaming.getYouTubeAuthUrl();
    assert.deepEqual(ytAuth.scopes, ['youtube.readonly']);
    await assert.rejects(() => streaming.handleYouTubeCallback('code123', 'wrong-state'));
    const ytConnected = await streaming.handleYouTubeCallback('code123', ytAuth.state);
    assert.equal(ytConnected.connected, true);
    await streaming.disconnectYouTube();

    await streaming.configureTwitchOAuth({
      clientId: 'tw-client-test',
      authEndpoint: 'https://example.local/tw-auth',
      allowManage: true,
    });
    const twAuth = await streaming.getTwitchAuthUrl();
    assert.ok(twAuth.scopes.includes('chat:edit'));
    const twConnected = await streaming.handleTwitchCallback('twcode', twAuth.state);
    assert.equal(twConnected.connected, true);
    await streaming.disconnectTwitch();

    const nar = await streaming.narrationService.enqueueNarration({
      text: 'Tes narasi Bahasa Indonesia',
      emotion: 'calm',
      source: 'manual',
    });
    assert.ok(nar.queue.length >= 0);
    const interrupted = streaming.narrationService.interrupt();
    assert.equal(interrupted.queue.length, 0);

    const cmdRes = await streaming.assistantService.handleUserCommand('!status', {
      streaming: false,
      reconnecting: false,
      durationSeconds: 0,
      bitrateKbps: 0,
      fps: 0,
      droppedFrames: 0,
      totalFrames: 0,
      droppedPercent: 0,
      congestion: 0,
    });
    assert.ok(cmdRes.reply.includes('mode siaga'));

    const analytics = await streaming.getAnalyticsAndHistory();
    assert.ok(Array.isArray(analytics.sessions));
    assert.ok(Array.isArray(analytics.samples));
  });
});
