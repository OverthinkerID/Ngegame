import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getPrismaClient, disconnectDatabase } from '../src/db/prisma.js';
import { PersistenceService } from '../src/services/persistence/persistenceService.js';
import { UserDataStorageService } from '../src/services/persistence/userDataStorage.js';
import { VoiceStudioService } from '../src/services/voice/voiceService.js';

const tempUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'ngegame-p17-12-'));
process.env.NGEGAME_USER_DATA = tempUserData;

test.after(async () => {
  await disconnectDatabase();
  fs.rmSync(tempUserData, { recursive: true, force: true });
});

test('Phase 17.12 Persistence: UserProfile, Theme, VoiceSample, and Backup/Restore round-trip', async () => {
  const storage = new UserDataStorageService(tempUserData);
  const persistence = new PersistenceService(storage);
  const voice = new VoiceStudioService(undefined, storage);

  // 1. User Profile persistence
  const createdProfile = await persistence.createUserProfile({
    displayName: 'Test Creator 17.12',
    handle: '@creator1712',
    bio: 'Testing persistent user profile',
    activate: true,
  });
  const profiles = await persistence.listUserProfiles();
  assert.ok(profiles.some((p) => p.id === createdProfile.id && p.isActive));

  // 2. Theme persistence
  const theme = await persistence.updateThemeSettings({
    mode: 'custom',
    accentColor: '#ff5500',
    primaryColor: '#ff5500',
    secondaryColor: '#22c55e',
    backgroundColor: '#101418',
  });
  assert.equal(theme.mode, 'custom');
  assert.equal(theme.accentColor, '#ff5500');
  const reloadedTheme = await persistence.getThemeSettings();
  assert.equal(reloadedTheme.accentColor, '#ff5500');

  // 3. Voice Sample physical file + DB metadata
  const fakeWavBase64 = Buffer.from('RIFFdemo-wav-bytes').toString('base64');
  const sample = await voice.saveSample({
    name: 'Sample Uji',
    language: 'id-ID',
    durationSeconds: 3.2,
    audioBase64: `data:audio/wav;base64,${fakeWavBase64}`,
    fileName: 'uji.wav',
  });
  assert.ok(sample.assetId);
  assert.ok(sample.audioUrl.includes(sample.assetId));

  const readBack = await storage.readAssetBuffer(sample.assetId);
  assert.ok(readBack !== null);
  assert.equal(readBack.buffer.toString('utf8'), 'RIFFdemo-wav-bytes');

  // 4. Voice settings persistence
  await voice.updateSettings({ speed: 1.2, volume: 70 });
  const voice2 = new VoiceStudioService(undefined, storage);
  const loadedSettings = await voice2.getSettings();
  assert.equal(loadedSettings.speed, 1.2);
  assert.equal(loadedSettings.volume, 70);

  // 5. Runtime navigation state persistence
  await persistence.setRuntimeState('activePage', 'voice');
  const stateMap = await persistence.getRuntimeStateMap();
  assert.equal(stateMap.activePage, 'voice');

  // 6. Export & Import Backup
  const backup = await persistence.exportFullBackup();
  assert.equal(backup.appName, 'Overthinker-Ngegame');
  assert.ok(backup.userProfiles.some((p) => p.id === createdProfile.id));

  const prisma = getPrismaClient();
  await prisma.userProfile.delete({ where: { id: createdProfile.id } });
  const importRes = await persistence.importFullBackup(backup);
  assert.ok(importRes.restoredProfiles >= 1);

  const afterRestore = await persistence.listUserProfiles();
  assert.ok(afterRestore.some((p) => p.id === createdProfile.id));

  // Cleanup test sample
  await voice.deleteSample(sample.id);
});
