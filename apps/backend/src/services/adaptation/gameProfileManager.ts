import {
  AppError,
  ErrorCode,
  type GameProfile,
  type GameProfileVersionRecord,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { BUILTIN_GAME_PROFILES } from './builtinProfiles.js';

const CURRENT_SCHEMA_VERSION = 1;

export interface ProfileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateGameProfile(profile: GameProfile): ProfileValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!profile.gameId || !/^[a-z0-9-]+$/i.test(profile.gameId)) {
    errors.push('gameId harus berupa slug alfanumerik/strip yang valid.');
  }
  if (!profile.gameName?.trim()) {
    errors.push('gameName wajib diisi.');
  }
  if (!profile.resolution || profile.resolution.width <= 0 || profile.resolution.height <= 0) {
    errors.push('resolution width dan height harus lebih besar dari 0.');
  }
  if (profile.safetyConfiguration.maxHoldDurationMs > 2000) {
    errors.push('maxHoldDurationMs tidak boleh melebihi 2000ms demi keamanan.');
  }
  if (
    profile.safetyConfiguration.minConfidence < 0.5 ||
    profile.safetyConfiguration.minConfidence > 1
  ) {
    errors.push('minConfidence harus berada di rentang 0.50 hingga 1.00.');
  }

  const seenKeys = new Set<string>();
  for (const binding of profile.inputMapping) {
    if (binding.keyboard) {
      const k = binding.keyboard.toLowerCase();
      if (seenKeys.has(k)) {
        warnings.push(`Konflik tombol keyboard '${binding.keyboard}' terdeteksi pada inputMapping.`);
      }
      seenKeys.add(k);
    }
  }

  if (!profile.executablePath) {
    warnings.push('executablePath belum terisi — jalankan Kalibrasi atau Pindai Steam.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function migrateProfileVersion(raw: GameProfile): GameProfile {
  if (!raw.profileVersion || raw.profileVersion < CURRENT_SCHEMA_VERSION) {
    return {
      ...raw,
      profileVersion: CURRENT_SCHEMA_VERSION,
    };
  }
  return raw;
}

export class GameProfileManager {
  private async recordVersionSnapshot(
    profile: GameProfile,
    changeSummary: string,
    author: 'human' | 'system' | 'ai' = 'human',
  ): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.gameProfileVersion.create({
      data: {
        gameId: profile.gameId,
        profileVersion: profile.profileVersion,
        changeSummary,
        author,
        profileJson: JSON.stringify(profile),
      },
    });
  }

  public async ensureBuiltinProfiles(): Promise<void> {
    const prisma = getPrismaClient();
    for (const builtin of BUILTIN_GAME_PROFILES) {
      const existing = await prisma.gameProfileRecord.findUnique({
        where: { gameId: builtin.gameId },
      });
      if (!existing) {
        await prisma.gameProfileRecord.create({
          data: {
            gameId: builtin.gameId,
            gameName: builtin.gameName,
            platform: builtin.platform,
            genre: builtin.genre,
            adapterType: builtin.adapterType,
            profileVersion: builtin.profileVersion,
            isBuiltin: true,
            profileJson: JSON.stringify(builtin),
          },
        });
        await this.recordVersionSnapshot(builtin, 'Inisialisasi profil bawaan', 'system');
      } else {
        const versionCount = await prisma.gameProfileVersion.count({
          where: { gameId: builtin.gameId },
        });
        if (versionCount === 0) {
          const parsed = migrateProfileVersion(JSON.parse(existing.profileJson) as GameProfile);
          await this.recordVersionSnapshot(
            { ...parsed, profileVersion: existing.profileVersion },
            'Migrasi snapshot awal profil bawaan',
            'system',
          );
        }
      }
    }
  }

  public async listProfiles(): Promise<GameProfile[]> {
    await this.ensureBuiltinProfiles();
    const prisma = getPrismaClient();
    const rows = await prisma.gameProfileRecord.findMany({
      orderBy: [{ isBuiltin: 'desc' }, { gameName: 'asc' }],
    });
    return rows.map((row) => {
      const parsed = migrateProfileVersion(JSON.parse(row.profileJson) as GameProfile);
      return {
        ...parsed,
        isBuiltin: row.isBuiltin,
        profileVersion: row.profileVersion,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  public async getProfile(gameId: string): Promise<GameProfile> {
    await this.ensureBuiltinProfiles();
    const prisma = getPrismaClient();
    const row = await prisma.gameProfileRecord.findUnique({ where: { gameId } });
    if (!row) {
      throw new AppError(`Game profile '${gameId}' tidak ditemukan`, ErrorCode.NOT_FOUND, 404);
    }
    const parsed = migrateProfileVersion(JSON.parse(row.profileJson) as GameProfile);
    return {
      ...parsed,
      isBuiltin: row.isBuiltin,
      profileVersion: row.profileVersion,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public async saveProfile(
    profile: GameProfile,
    changeSummary = 'Pembaruan konfigurasi profil',
    author: 'human' | 'system' | 'ai' = 'human',
  ): Promise<GameProfile> {
    const validation = validateGameProfile(profile);
    if (!validation.valid) {
      throw new AppError(validation.errors.join(' '), ErrorCode.VALIDATION_ERROR, 400);
    }

    const prisma = getPrismaClient();
    const existing = await prisma.gameProfileRecord.findUnique({
      where: { gameId: profile.gameId },
    });
    const nextVersion = existing ? existing.profileVersion + 1 : 1;
    const normalized: GameProfile = {
      ...profile,
      isBuiltin: existing ? existing.isBuiltin : Boolean(profile.isBuiltin),
      profileVersion: nextVersion,
      updatedAt: new Date().toISOString(),
    };

    await prisma.gameProfileRecord.upsert({
      where: { gameId: normalized.gameId },
      create: {
        gameId: normalized.gameId,
        gameName: normalized.gameName,
        platform: normalized.platform,
        genre: normalized.genre,
        adapterType: normalized.adapterType,
        profileVersion: nextVersion,
        isBuiltin: Boolean(normalized.isBuiltin),
        profileJson: JSON.stringify(normalized),
      },
      update: {
        gameName: normalized.gameName,
        platform: normalized.platform,
        genre: normalized.genre,
        adapterType: normalized.adapterType,
        profileVersion: nextVersion,
        profileJson: JSON.stringify(normalized),
      },
    });

    await this.recordVersionSnapshot(normalized, changeSummary, author);
    await recordSystemLog(
      'info',
      'adaptation',
      `Game profile '${normalized.gameId}' disimpan (v${nextVersion})`,
    );
    return normalized;
  }

  public async duplicateProfile(
    sourceGameId: string,
    newGameId: string,
    newGameName: string,
  ): Promise<GameProfile> {
    const source = await this.getProfile(sourceGameId);
    const prisma = getPrismaClient();
    const existing = await prisma.gameProfileRecord.findUnique({ where: { gameId: newGameId } });
    if (existing) {
      throw new AppError(
        `Game profile '${newGameId}' sudah ada. Gunakan gameId lain.`,
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    const duplicated: GameProfile = {
      ...source,
      gameId: newGameId,
      gameName: newGameName.trim() || `${source.gameName} (Salinan)`,
      isBuiltin: false,
      adapterType: source.adapterType === 'stardew_valley' ? 'custom' : source.adapterType,
      profileVersion: 1,
      calibrationStatus: { completedSteps: [], lastCalibratedAt: null },
    };
    return this.saveProfile(duplicated, `Diduplikasi dari '${sourceGameId}'`, 'human');
  }

  public async deleteProfile(gameId: string): Promise<{ deleted: boolean; gameId: string }> {
    const prisma = getPrismaClient();
    const row = await prisma.gameProfileRecord.findUnique({ where: { gameId } });
    if (!row) {
      throw new AppError(`Game profile '${gameId}' tidak ditemukan`, ErrorCode.NOT_FOUND, 404);
    }
    if (row.isBuiltin) {
      throw new AppError(
        `Profil bawaan '${gameId}' tidak boleh dihapus. Gunakan Reset ke bawaan.`,
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }
    await prisma.gameProfileVersion.deleteMany({ where: { gameId } });
    await prisma.gameMemoryEntry.deleteMany({ where: { gameId } });
    await prisma.gameProfileRecord.delete({ where: { gameId } });
    await recordSystemLog('info', 'adaptation', `Game profile '${gameId}' dihapus`);
    return { deleted: true, gameId };
  }

  public async getProfileHistory(gameId: string, limit = 25): Promise<GameProfileVersionRecord[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.gameProfileVersion.findMany({
      where: { gameId },
      orderBy: [{ profileVersion: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((row) => ({
      id: row.id,
      gameId: row.gameId,
      profileVersion: row.profileVersion,
      changeSummary: row.changeSummary,
      author: row.author,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  public async resetProfile(gameId: string): Promise<GameProfile> {
    const builtin = BUILTIN_GAME_PROFILES.find((p) => p.gameId === gameId);
    if (!builtin) {
      throw new AppError(
        `Profil '${gameId}' bukan profil bawaan sehingga tidak dapat direset ke bawaan.`,
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }
    const prisma = getPrismaClient();
    await prisma.gameProfileRecord.update({
      where: { gameId },
      data: {
        gameName: builtin.gameName,
        platform: builtin.platform,
        genre: builtin.genre,
        adapterType: builtin.adapterType,
        profileVersion: 1,
        profileJson: JSON.stringify(builtin),
        calibrationJson: '{}',
      },
    });
    await this.recordVersionSnapshot(builtin, 'Reset ke konfigurasi bawaan', 'human');
    await recordSystemLog('info', 'adaptation', `Game profile '${gameId}' direset ke bawaan`);
    return builtin;
  }

  public async importProfile(rawJson: string): Promise<GameProfile> {
    let parsed: GameProfile;
    try {
      parsed = JSON.parse(rawJson) as GameProfile;
    } catch {
      throw new AppError('Format JSON profil game tidak valid.', ErrorCode.VALIDATION_ERROR, 400);
    }
    return this.saveProfile({ ...parsed, isBuiltin: false }, 'Impor profil dari JSON', 'human');
  }

  public async exportProfile(gameId: string): Promise<string> {
    const profile = await this.getProfile(gameId);
    return JSON.stringify(profile, null, 2);
  }

  public async getDiagnostics(gameId: string): Promise<ProfileValidationResult> {
    const profile = await this.getProfile(gameId);
    return validateGameProfile(profile);
  }
}
