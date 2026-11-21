import type {
  AppBackupPayload,
  ThemeMode,
  ThemeSettingsRecord,
  UserProfileRecord,
} from '@ngegame/shared';
import { getPrismaClient } from '../../db/prisma.js';
import type { UserDataStorageService } from './userDataStorage.js';

const DEFAULT_THEME: Omit<ThemeSettingsRecord, 'updatedAt'> = {
  mode: 'dark',
  accentColor: '#39c5bb',
  primaryColor: '#39c5bb',
  secondaryColor: '#6366f1',
  backgroundColor: '#0a0e09',
  customThemeName: 'Overthinker Olive',
  fontPreference: 'system',
  uiPreferences: {},
};

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapUserProfile(row: {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarAssetId: string | null;
  preferredLanguage: string;
  defaultGameId: string | null;
  defaultVoiceProfileId: string | null;
  isActive: boolean;
  preferencesJson: string;
  createdAt: Date;
  updatedAt: Date;
}): UserProfileRecord {
  return {
    id: row.id,
    displayName: row.displayName,
    handle: row.handle,
    bio: row.bio,
    avatarAssetId: row.avatarAssetId,
    preferredLanguage: row.preferredLanguage,
    defaultGameId: row.defaultGameId,
    defaultVoiceProfileId: row.defaultVoiceProfileId,
    isActive: row.isActive,
    preferences: safeJsonParse<Record<string, unknown>>(row.preferencesJson, {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PersistenceService {
  private readonly storage: UserDataStorageService;

  constructor(storage: UserDataStorageService) {
    this.storage = storage;
  }

  public async ensureDefaultUserProfile(): Promise<UserProfileRecord> {
    const prisma = getPrismaClient();
    const existing = await prisma.userProfile.findMany({ orderBy: { createdAt: 'asc' } });
    if (existing.length === 0) {
      const created = await prisma.userProfile.create({
        data: {
          displayName: 'Overthinker Creator',
          handle: '@overthinker',
          bio: 'Profil utama kreator & AI gaming studio',
          preferredLanguage: 'id',
          isActive: true,
          preferencesJson: '{}',
        },
      });
      return mapUserProfile(created);
    }
    const active = existing.find((p) => p.isActive);
    if (active) return mapUserProfile(active);
    const first = existing[0]!;
    const updated = await prisma.userProfile.update({
      where: { id: first.id },
      data: { isActive: true },
    });
    return mapUserProfile(updated);
  }

  public async listUserProfiles(): Promise<UserProfileRecord[]> {
    await this.ensureDefaultUserProfile();
    const prisma = getPrismaClient();
    const rows = await prisma.userProfile.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(mapUserProfile);
  }

  public async getActiveUserProfile(): Promise<UserProfileRecord> {
    return this.ensureDefaultUserProfile();
  }

  public async createUserProfile(input: {
    displayName: string;
    handle?: string;
    bio?: string;
    preferredLanguage?: string;
    defaultGameId?: string | null;
    defaultVoiceProfileId?: string | null;
    preferences?: Record<string, unknown>;
    activate?: boolean;
  }): Promise<UserProfileRecord> {
    const prisma = getPrismaClient();
    if (input.activate) {
      await prisma.userProfile.updateMany({ data: { isActive: false } });
    }
    const created = await prisma.userProfile.create({
      data: {
        displayName: input.displayName.trim() || 'Profil Baru',
        handle: input.handle?.trim() ?? '',
        bio: input.bio?.trim() ?? '',
        preferredLanguage: input.preferredLanguage ?? 'id',
        defaultGameId: input.defaultGameId ?? null,
        defaultVoiceProfileId: input.defaultVoiceProfileId ?? null,
        isActive: Boolean(input.activate),
        preferencesJson: JSON.stringify(input.preferences ?? {}),
      },
    });
    return mapUserProfile(created);
  }

  public async updateUserProfile(
    id: string,
    patch: Partial<{
      displayName: string;
      handle: string;
      bio: string;
      avatarAssetId: string | null;
      preferredLanguage: string;
      defaultGameId: string | null;
      defaultVoiceProfileId: string | null;
      preferences: Record<string, unknown>;
    }>,
  ): Promise<UserProfileRecord> {
    const prisma = getPrismaClient();
    const current = await prisma.userProfile.findUniqueOrThrow({ where: { id } });
    const currentPrefs = safeJsonParse<Record<string, unknown>>(current.preferencesJson, {});
    const updated = await prisma.userProfile.update({
      where: { id },
      data: {
        ...(patch.displayName !== undefined ? { displayName: patch.displayName.trim() || current.displayName } : {}),
        ...(patch.handle !== undefined ? { handle: patch.handle } : {}),
        ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
        ...(patch.avatarAssetId !== undefined ? { avatarAssetId: patch.avatarAssetId } : {}),
        ...(patch.preferredLanguage !== undefined ? { preferredLanguage: patch.preferredLanguage } : {}),
        ...(patch.defaultGameId !== undefined ? { defaultGameId: patch.defaultGameId } : {}),
        ...(patch.defaultVoiceProfileId !== undefined ? { defaultVoiceProfileId: patch.defaultVoiceProfileId } : {}),
        ...(patch.preferences !== undefined
          ? { preferencesJson: JSON.stringify({ ...currentPrefs, ...patch.preferences }) }
          : {}),
      },
    });
    return mapUserProfile(updated);
  }

  public async setActiveUserProfile(id: string): Promise<UserProfileRecord> {
    const prisma = getPrismaClient();
    await prisma.userProfile.findUniqueOrThrow({ where: { id } });
    await prisma.userProfile.updateMany({ data: { isActive: false } });
    const updated = await prisma.userProfile.update({
      where: { id },
      data: { isActive: true },
    });
    return mapUserProfile(updated);
  }

  public async deleteUserProfile(id: string): Promise<boolean> {
    const prisma = getPrismaClient();
    const count = await prisma.userProfile.count();
    if (count <= 1) {
      throw new Error('Minimal harus ada satu profil pengguna aktif.');
    }
    const target = await prisma.userProfile.findUnique({ where: { id } });
    if (!target) return false;
    await prisma.userProfile.delete({ where: { id } });
    if (target.isActive) {
      await this.ensureDefaultUserProfile();
    }
    return true;
  }

  public async getThemeSettings(): Promise<ThemeSettingsRecord> {
    const prisma = getPrismaClient();
    const row = await prisma.themeSetting.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        mode: DEFAULT_THEME.mode,
        accentColor: DEFAULT_THEME.accentColor,
        primaryColor: DEFAULT_THEME.primaryColor,
        secondaryColor: DEFAULT_THEME.secondaryColor,
        backgroundColor: DEFAULT_THEME.backgroundColor,
        customThemeName: DEFAULT_THEME.customThemeName,
        fontPreference: DEFAULT_THEME.fontPreference,
        uiPreferencesJson: '{}',
      },
      update: {},
    });
    return {
      mode: (row.mode as ThemeMode) || 'dark',
      accentColor: row.accentColor,
      primaryColor: row.primaryColor,
      secondaryColor: row.secondaryColor,
      backgroundColor: row.backgroundColor,
      customThemeName: row.customThemeName,
      fontPreference: row.fontPreference,
      uiPreferences: safeJsonParse<Record<string, unknown>>(row.uiPreferencesJson, {}),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public async updateThemeSettings(
    patch: Partial<Omit<ThemeSettingsRecord, 'updatedAt'>>,
  ): Promise<ThemeSettingsRecord> {
    const current = await this.getThemeSettings();
    const prisma = getPrismaClient();
    const updated = await prisma.themeSetting.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        mode: patch.mode ?? current.mode,
        accentColor: patch.accentColor ?? current.accentColor,
        primaryColor: patch.primaryColor ?? patch.accentColor ?? current.primaryColor,
        secondaryColor: patch.secondaryColor ?? current.secondaryColor,
        backgroundColor: patch.backgroundColor ?? current.backgroundColor,
        customThemeName: patch.customThemeName ?? current.customThemeName,
        fontPreference: patch.fontPreference ?? current.fontPreference,
        uiPreferencesJson: JSON.stringify({
          ...current.uiPreferences,
          ...(patch.uiPreferences ?? {}),
        }),
      },
      update: {
        ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
        ...(patch.accentColor !== undefined ? { accentColor: patch.accentColor } : {}),
        ...(patch.primaryColor !== undefined ? { primaryColor: patch.primaryColor } : {}),
        ...(patch.secondaryColor !== undefined ? { secondaryColor: patch.secondaryColor } : {}),
        ...(patch.backgroundColor !== undefined ? { backgroundColor: patch.backgroundColor } : {}),
        ...(patch.customThemeName !== undefined ? { customThemeName: patch.customThemeName } : {}),
        ...(patch.fontPreference !== undefined ? { fontPreference: patch.fontPreference } : {}),
        ...(patch.uiPreferences !== undefined
          ? {
              uiPreferencesJson: JSON.stringify({
                ...current.uiPreferences,
                ...patch.uiPreferences,
              }),
            }
          : {}),
      },
    });
    return {
      mode: (updated.mode as ThemeMode) || 'dark',
      accentColor: updated.accentColor,
      primaryColor: updated.primaryColor,
      secondaryColor: updated.secondaryColor,
      backgroundColor: updated.backgroundColor,
      customThemeName: updated.customThemeName,
      fontPreference: updated.fontPreference,
      uiPreferences: safeJsonParse<Record<string, unknown>>(updated.uiPreferencesJson, {}),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  public async getRuntimeStateMap(): Promise<Record<string, unknown>> {
    const prisma = getPrismaClient();
    const rows = await prisma.appRuntimeState.findMany();
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      out[row.key] = safeJsonParse<unknown>(row.valueJson, null);
    }
    return out;
  }

  public async setRuntimeState(key: string, value: unknown): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.appRuntimeState.upsert({
      where: { key },
      create: { key, valueJson: JSON.stringify(value ?? null) },
      update: { valueJson: JSON.stringify(value ?? null) },
    });
  }

  public async getStorageOverview(): Promise<{
    userDataDir: string;
    assetCounts: Record<string, number>;
    totalBytes: number;
  }> {
    const prisma = getPrismaClient();
    const assets = await prisma.storedAsset.findMany({
      select: { category: true, sizeBytes: true },
    });
    const assetCounts: Record<string, number> = {};
    let totalBytes = 0;
    for (const item of assets) {
      assetCounts[item.category] = (assetCounts[item.category] ?? 0) + 1;
      totalBytes += item.sizeBytes;
    }
    return {
      userDataDir: this.storage.getBaseDir(),
      assetCounts,
      totalBytes,
    };
  }

  public async exportFullBackup(): Promise<AppBackupPayload> {
    const prisma = getPrismaClient();
    const [
      userProfiles,
      themeSettings,
      appSettings,
      voiceProfiles,
      voiceSamplesRows,
      adaptationProfiles,
      steamGames,
      runtimeRows,
    ] = await Promise.all([
      this.listUserProfiles(),
      this.getThemeSettings(),
      prisma.appSetting.findMany(),
      prisma.voiceProfile.findMany(),
      prisma.voiceSample.findMany(),
      prisma.gameProfileRecord.findMany(),
      prisma.steamGame.findMany(),
      prisma.appRuntimeState.findMany(),
    ]);

    const payload: AppBackupPayload = {
      schemaVersion: '17.12.1',
      exportedAt: new Date().toISOString(),
      appName: 'Overthinker-Ngegame',
      userProfiles,
      themeSettings,
      appSettings: appSettings.map((s) => ({ key: s.key, value: s.value })),
      voiceProfiles,
      voiceSamples: voiceSamplesRows.map((s) => ({
        id: s.id,
        name: s.name,
        language: s.language,
        durationSeconds: s.durationSeconds,
        voiceProfileId: s.voiceProfileId,
        assetId: s.assetId,
        audioUrl: `/api/persistence/assets/${encodeURIComponent(s.assetId)}/content`,
        transcript: s.transcript,
        recordedAt: s.recordedAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      adaptationProfiles,
      steamGames,
      runtimeState: runtimeRows.map((r) => ({
        key: r.key,
        value: safeJsonParse<unknown>(r.valueJson, null),
      })),
    };

    const buffer = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
    await this.storage.saveBuffer({
      category: 'backup',
      originalName: `ngegame-backup-${new Date().toISOString().slice(0, 10)}.json`,
      buffer,
      mimeType: 'application/json',
      entityType: 'backup',
      entityId: payload.exportedAt,
    });

    return payload;
  }

  public async importFullBackup(payload: Partial<AppBackupPayload>): Promise<{
    restoredProfiles: number;
    restoredSettings: number;
    restoredVoiceProfiles: number;
    restoredAdaptationProfiles: number;
    restoredGames: number;
  }> {
    const prisma = getPrismaClient();
    let restoredProfiles = 0;
    let restoredSettings = 0;
    let restoredVoiceProfiles = 0;
    let restoredAdaptationProfiles = 0;
    let restoredGames = 0;

    if (Array.isArray(payload.userProfiles) && payload.userProfiles.length > 0) {
      for (const profile of payload.userProfiles) {
        await prisma.userProfile.upsert({
          where: { id: profile.id },
          create: {
            id: profile.id,
            displayName: profile.displayName,
            handle: profile.handle ?? '',
            bio: profile.bio ?? '',
            avatarAssetId: profile.avatarAssetId ?? null,
            preferredLanguage: profile.preferredLanguage ?? 'id',
            defaultGameId: profile.defaultGameId ?? null,
            defaultVoiceProfileId: profile.defaultVoiceProfileId ?? null,
            isActive: Boolean(profile.isActive),
            preferencesJson: JSON.stringify(profile.preferences ?? {}),
          },
          update: {
            displayName: profile.displayName,
            handle: profile.handle ?? '',
            bio: profile.bio ?? '',
            preferredLanguage: profile.preferredLanguage ?? 'id',
            defaultGameId: profile.defaultGameId ?? null,
            defaultVoiceProfileId: profile.defaultVoiceProfileId ?? null,
            isActive: Boolean(profile.isActive),
            preferencesJson: JSON.stringify(profile.preferences ?? {}),
          },
        });
        restoredProfiles += 1;
      }
      await this.ensureDefaultUserProfile();
    }

    if (payload.themeSettings) {
      await this.updateThemeSettings(payload.themeSettings);
    }

    if (Array.isArray(payload.appSettings)) {
      for (const setting of payload.appSettings) {
        if (!setting?.key) continue;
        await prisma.appSetting.upsert({
          where: { key: setting.key },
          create: { key: setting.key, value: String(setting.value ?? '') },
          update: { value: String(setting.value ?? '') },
        });
        restoredSettings += 1;
      }
    }

    if (Array.isArray(payload.voiceProfiles)) {
      for (const vp of payload.voiceProfiles as Array<Record<string, unknown>>) {
        const id = typeof vp.id === 'string' ? vp.id : '';
        const name = typeof vp.name === 'string' ? vp.name : '';
        if (!id || !name) continue;
        await prisma.voiceProfile.upsert({
          where: { id },
          create: {
            id,
            name,
            description: String(vp.description ?? ''),
            engine: String(vp.engine ?? 'voxcpm2'),
            language: String(vp.language ?? 'id'),
            speed: Number(vp.speed ?? 1.0),
            pitch: Number(vp.pitch ?? 1.0),
            emotion: String(vp.emotion ?? 'neutral'),
            expressiveness: Number(vp.expressiveness ?? 0.7),
            modelSettingsJson: String(vp.modelSettingsJson ?? '{}'),
            defaultSampleId: typeof vp.defaultSampleId === 'string' ? vp.defaultSampleId : null,
            isDefault: Boolean(vp.isDefault),
          },
          update: {
            name,
            description: String(vp.description ?? ''),
            engine: String(vp.engine ?? 'voxcpm2'),
            language: String(vp.language ?? 'id'),
            speed: Number(vp.speed ?? 1.0),
            pitch: Number(vp.pitch ?? 1.0),
            emotion: String(vp.emotion ?? 'neutral'),
            expressiveness: Number(vp.expressiveness ?? 0.7),
            modelSettingsJson: String(vp.modelSettingsJson ?? '{}'),
            defaultSampleId: typeof vp.defaultSampleId === 'string' ? vp.defaultSampleId : null,
            isDefault: Boolean(vp.isDefault),
          },
        });
        restoredVoiceProfiles += 1;
      }
    }

    if (Array.isArray(payload.adaptationProfiles)) {
      for (const gp of payload.adaptationProfiles as Array<Record<string, unknown>>) {
        const gameId = typeof gp.gameId === 'string' ? gp.gameId : '';
        if (!gameId) continue;
        await prisma.gameProfileRecord.upsert({
          where: { gameId },
          create: {
            gameId,
            gameName: String(gp.gameName ?? gameId),
            platform: String(gp.platform ?? 'pc'),
            genre: String(gp.genre ?? 'custom'),
            adapterType: String(gp.adapterType ?? 'generic'),
            profileVersion: Number(gp.profileVersion ?? 1),
            isBuiltin: Boolean(gp.isBuiltin),
            profileJson: String(gp.profileJson ?? '{}'),
            calibrationJson: String(gp.calibrationJson ?? '{}'),
          },
          update: {
            gameName: String(gp.gameName ?? gameId),
            platform: String(gp.platform ?? 'pc'),
            genre: String(gp.genre ?? 'custom'),
            adapterType: String(gp.adapterType ?? 'generic'),
            profileVersion: Number(gp.profileVersion ?? 1),
            profileJson: String(gp.profileJson ?? '{}'),
            calibrationJson: String(gp.calibrationJson ?? '{}'),
          },
        });
        restoredAdaptationProfiles += 1;
      }
    }

    if (Array.isArray(payload.steamGames)) {
      for (const game of payload.steamGames as Array<Record<string, unknown>>) {
        const appId = Number(game.appId);
        if (!Number.isInteger(appId) || appId <= 0) continue;
        await prisma.steamGame.upsert({
          where: { appId },
          create: {
            appId,
            name: String(game.name ?? `App ${appId}`),
            installDir: String(game.installDir ?? ''),
            installPath: String(game.installPath ?? ''),
            executablePath: typeof game.executablePath === 'string' ? game.executablePath : null,
            sizeOnDiskBytes: Number(game.sizeOnDiskBytes ?? 0),
            platform: String(game.platform ?? 'steam'),
            installed: game.installed !== false,
            detectionSource: String(game.detectionSource ?? 'backup'),
            artworkUrl: typeof game.artworkUrl === 'string' ? game.artworkUrl : null,
            compatibility: String(game.compatibility ?? 'unknown'),
            compatibilityReason: String(game.compatibilityReason ?? ''),
          },
          update: {
            name: String(game.name ?? `App ${appId}`),
            installDir: String(game.installDir ?? ''),
            installPath: String(game.installPath ?? ''),
            executablePath: typeof game.executablePath === 'string' ? game.executablePath : null,
            sizeOnDiskBytes: Number(game.sizeOnDiskBytes ?? 0),
            platform: String(game.platform ?? 'steam'),
            installed: game.installed !== false,
            compatibility: String(game.compatibility ?? 'unknown'),
            compatibilityReason: String(game.compatibilityReason ?? ''),
          },
        });
        restoredGames += 1;
      }
    }

    if (Array.isArray(payload.runtimeState)) {
      for (const item of payload.runtimeState) {
        if (!item?.key) continue;
        await this.setRuntimeState(item.key, item.value);
      }
    }

    return {
      restoredProfiles,
      restoredSettings,
      restoredVoiceProfiles,
      restoredAdaptationProfiles,
      restoredGames,
    };
  }
}
