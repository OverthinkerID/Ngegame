import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { resolveUserDataDir } from '../services/persistence/userDataStorage.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('db-schema-sync');

interface ColumnSpec {
  name: string;
  sqlType: string;
}

const REQUIRED_COLUMNS: Record<string, ColumnSpec[]> = {
  SteamGame: [
    { name: 'platform', sqlType: "TEXT NOT NULL DEFAULT 'steam'" },
    { name: 'installed', sqlType: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'detectionSource', sqlType: "TEXT NOT NULL DEFAULT 'steam_vdf'" },
    { name: 'artworkAssetId', sqlType: 'TEXT' },
    { name: 'artworkUrl', sqlType: 'TEXT' },
    { name: 'lastSeenAt', sqlType: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  VoiceProfile: [
    { name: 'description', sqlType: "TEXT NOT NULL DEFAULT ''" },
    { name: 'modelSettingsJson', sqlType: "TEXT NOT NULL DEFAULT '{}'" },
    { name: 'defaultSampleId', sqlType: 'TEXT' },
  ],
};

const CREATE_TABLES_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS "StoredAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "checksumSha256" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "StoredAsset_category_createdAt_idx" ON "StoredAsset"("category", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "StoredAsset_entityType_entityId_idx" ON "StoredAsset"("entityType", "entityId");`,

  `CREATE TABLE IF NOT EXISTS "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "handle" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "avatarAssetId" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'id',
    "defaultGameId" TEXT,
    "defaultVoiceProfileId" TEXT,
    "isActive" INTEGER NOT NULL DEFAULT 0,
    "preferencesJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "UserProfile_isActive_idx" ON "UserProfile"("isActive");`,

  `CREATE TABLE IF NOT EXISTS "ThemeSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "mode" TEXT NOT NULL DEFAULT 'dark',
    "accentColor" TEXT NOT NULL DEFAULT '#39c5bb',
    "primaryColor" TEXT NOT NULL DEFAULT '#39c5bb',
    "secondaryColor" TEXT NOT NULL DEFAULT '#6366f1',
    "backgroundColor" TEXT NOT NULL DEFAULT '#0a0e09',
    "customThemeName" TEXT NOT NULL DEFAULT 'Overthinker Olive',
    "fontPreference" TEXT NOT NULL DEFAULT 'system',
    "uiPreferencesJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "VoiceSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'id',
    "durationSeconds" REAL NOT NULL DEFAULT 0,
    "voiceProfileId" TEXT,
    "assetId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL DEFAULT '',
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "VoiceSample_voiceProfileId_idx" ON "VoiceSample"("voiceProfileId");`,
  `CREATE INDEX IF NOT EXISTS "VoiceSample_createdAt_idx" ON "VoiceSample"("createdAt");`,

  `CREATE TABLE IF NOT EXISTS "VoiceCloneJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceSampleId" TEXT,
    "voiceProfileId" TEXT,
    "text" TEXT NOT NULL,
    "emotion" TEXT NOT NULL DEFAULT 'neutral',
    "modelProvider" TEXT NOT NULL DEFAULT 'voxcpm2',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "outputAssetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "errorMessage" TEXT,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "VoiceCloneJob_voiceProfileId_createdAt_idx" ON "VoiceCloneJob"("voiceProfileId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "VoiceCloneJob_createdAt_idx" ON "VoiceCloneJob"("createdAt");`,

  `CREATE TABLE IF NOT EXISTS "VisionSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT,
    "captureSource" TEXT NOT NULL DEFAULT 'Primary Display',
    "targetWindow" TEXT NOT NULL DEFAULT 'Primary Display',
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "samplingIntervalMs" INTEGER NOT NULL DEFAULT 1000,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "overlayEnabled" INTEGER NOT NULL DEFAULT 1,
    "lastCaptureAt" DATETIME,
    "lastSnapshotAssetId" TEXT,
    "lastAnalysisJson" TEXT NOT NULL DEFAULT '{}',
    "captureConfigJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "VisionSession_updatedAt_idx" ON "VisionSession"("updatedAt");`,

  `CREATE TABLE IF NOT EXISTS "AppRuntimeState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "valueJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
];

function resolveSqliteFilePath(): string | null {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('file:')) return null;
  const rawPath = url.slice(5);
  if (!rawPath || rawPath === ':memory:') return null;
  return path.resolve(rawPath);
}

function createPreMigrationBackup(): void {
  const dbPath = resolveSqliteFilePath();
  if (!dbPath || !fs.existsSync(dbPath)) return;
  try {
    const backupsDir = path.join(resolveUserDataDir(), 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(backupsDir, `pre-migration-${stamp}.db`);
    fs.copyFileSync(dbPath, target);
    logger.info('Created pre-migration SQLite backup', { target });
  } catch (err) {
    logger.warn('Failed to create pre-migration backup', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function ensurePersistenceSchema(prisma: PrismaClient): Promise<void> {
  try {
    let backedUp = false;

    for (const [tableName, columns] of Object.entries(REQUIRED_COLUMNS)) {
      const tableExists = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}';`,
      );
      if (tableExists.length === 0) continue;

      const existingCols = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        `PRAGMA table_info("${tableName}");`,
      );
      const colNames = new Set(existingCols.map((c) => c.name));
      for (const col of columns) {
        if (!colNames.has(col.name)) {
          if (!backedUp) {
            createPreMigrationBackup();
            backedUp = true;
          }
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${col.sqlType};`,
          );
          logger.info(`Added missing column ${tableName}.${col.name}`);
        }
      }
    }

    for (const stmt of CREATE_TABLES_SQL) {
      await prisma.$executeRawUnsafe(stmt);
    }
  } catch (err) {
    logger.warn('Schema sync encountered a warning', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
