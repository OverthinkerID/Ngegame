import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AssetCategory, StoredAssetRecord } from '@ngegame/shared';
import { getPrismaClient } from '../../db/prisma.js';

const CATEGORY_DIR_MAP: Record<AssetCategory, string> = {
  voice_sample: 'voice/samples',
  voice_output: 'voice/outputs',
  voice_model: 'voice/models',
  artwork: 'artwork',
  vision_snapshot: 'vision/snapshots',
  export: 'exports',
  backup: 'backups',
};

export function resolveUserDataDir(): string {
  const explicit = process.env.NGEGAME_USER_DATA?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Overthinker-Ngegame');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Overthinker-Ngegame');
  }
  return path.join(home, '.local', 'share', 'Overthinker-Ngegame');
}

function sanitizeFilename(raw: string): string {
  const base = path.basename(raw || 'file.bin').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return base.slice(0, 96) || 'file.bin';
}

function toPosixRelative(segments: string[]): string {
  return segments.join('/').replace(/\\/g, '/');
}

function mapAssetRow(row: {
  id: string;
  category: string;
  originalName: string;
  storedName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): StoredAssetRecord {
  return {
    id: row.id,
    category: row.category as AssetCategory,
    originalName: row.originalName,
    storedName: row.storedName,
    relativePath: row.relativePath,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksumSha256: row.checksumSha256,
    entityType: row.entityType,
    entityId: row.entityId,
    url: `/api/persistence/assets/${encodeURIComponent(row.id)}/content`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class UserDataStorageService {
  private readonly baseDir: string;

  constructor(baseDir = resolveUserDataDir()) {
    this.baseDir = path.resolve(baseDir);
    this.ensureDirectories();
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  public getCategoryDir(category: AssetCategory): string {
    return path.join(this.baseDir, ...CATEGORY_DIR_MAP[category].split('/'));
  }

  public ensureDirectories(): void {
    fs.mkdirSync(this.baseDir, { recursive: true });
    for (const category of Object.keys(CATEGORY_DIR_MAP) as AssetCategory[]) {
      fs.mkdirSync(this.getCategoryDir(category), { recursive: true });
    }
  }

  public resolveSafeAbsolutePath(relativePath: string): string {
    const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolved = path.resolve(this.baseDir, ...cleaned.split('/'));
    const normalizedBase = this.baseDir.endsWith(path.sep) ? this.baseDir : `${this.baseDir}${path.sep}`;
    if (resolved !== this.baseDir && !resolved.startsWith(normalizedBase)) {
      throw new Error('Invalid asset path outside userData directory');
    }
    return resolved;
  }

  public async saveBuffer(input: {
    category: AssetCategory;
    originalName: string;
    buffer: Buffer;
    mimeType: string;
    entityType?: string | null;
    entityId?: string | null;
    id?: string;
  }): Promise<StoredAssetRecord> {
    this.ensureDirectories();
    const id = input.id ?? crypto.randomUUID();
    const safeName = sanitizeFilename(input.originalName);
    const storedName = `${id}-${safeName}`;
    const categoryRel = CATEGORY_DIR_MAP[input.category];
    const relativePath = toPosixRelative([categoryRel, storedName]);
    const absPath = this.resolveSafeAbsolutePath(relativePath);
    const tmpPath = `${absPath}.tmp`;

    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(tmpPath, input.buffer);
    fs.renameSync(tmpPath, absPath);

    const checksumSha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');
    const prisma = getPrismaClient();
    const created = await prisma.storedAsset.create({
      data: {
        id,
        category: input.category,
        originalName: input.originalName,
        storedName,
        relativePath,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.byteLength,
        checksumSha256,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
    return mapAssetRow(created);
  }

  public async getAsset(id: string): Promise<StoredAssetRecord | null> {
    const prisma = getPrismaClient();
    const row = await prisma.storedAsset.findUnique({ where: { id } });
    return row ? mapAssetRow(row) : null;
  }

  public async readAssetBuffer(id: string): Promise<{ asset: StoredAssetRecord; buffer: Buffer } | null> {
    const asset = await this.getAsset(id);
    if (!asset) return null;
    const absPath = this.resolveSafeAbsolutePath(asset.relativePath);
    if (!fs.existsSync(absPath)) {
      return null;
    }
    return { asset, buffer: fs.readFileSync(absPath) };
  }

  public async deleteAsset(id: string): Promise<boolean> {
    const prisma = getPrismaClient();
    const row = await prisma.storedAsset.findUnique({ where: { id } });
    if (!row) return false;
    try {
      const absPath = this.resolveSafeAbsolutePath(row.relativePath);
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
    } catch {
      // Abaikan jika file sudah terhapus di disk
    }
    await prisma.storedAsset.delete({ where: { id } }).catch(() => undefined);
    return true;
  }

  public async cleanupCategoryRetention(
    category: AssetCategory,
    keepCount: number,
    protectedAssetIds: string[] = [],
  ): Promise<number> {
    const prisma = getPrismaClient();
    const rows = await prisma.storedAsset.findMany({
      where: { category },
      orderBy: { createdAt: 'desc' },
    });
    const protectedSet = new Set(protectedAssetIds.filter(Boolean));
    const toDelete = rows
      .filter((row, idx) => idx >= keepCount && !protectedSet.has(row.id));

    let deleted = 0;
    for (const row of toDelete) {
      if (await this.deleteAsset(row.id)) {
        deleted += 1;
      }
    }
    return deleted;
  }
}
