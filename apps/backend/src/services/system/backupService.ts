import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError, ErrorCode } from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';

export interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

function resolveDatabasePathFromEnv(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./dev.db';
  if (raw.startsWith('file:')) {
    const filePart = raw.slice(5);
    if (path.isAbsolute(filePart)) {
      return filePart;
    }
    return path.resolve(process.cwd(), 'prisma', filePart);
  }
  return path.resolve(process.cwd(), 'prisma', 'dev.db');
}

export class BackupService {
  private readonly dbPath: string;
  private readonly backupDir: string;

  constructor(dbPath?: string, backupDir?: string) {
    this.dbPath = dbPath ?? resolveDatabasePathFromEnv();
    this.backupDir =
      backupDir ?? path.join(path.dirname(this.dbPath), 'backups');
  }

  public async checkIntegrity(): Promise<{ ok: boolean; result: string }> {
    const prisma = getPrismaClient();
    const rows = await prisma.$queryRawUnsafe<{ integrity_check?: string }[]>(
      'PRAGMA integrity_check;',
    );
    const result = rows[0]?.integrity_check ?? 'unknown';
    return {
      ok: result.toLowerCase() === 'ok',
      result,
    };
  }

  public async createBackup(): Promise<BackupEntry> {
    await fs.mkdir(this.backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ngegame-backup-${stamp}.db`;
    const dest = path.join(this.backupDir, filename);

    try {
      await fs.copyFile(this.dbPath, dest);
    } catch (err) {
      throw new AppError(
        `Failed to backup SQLite database: ${err instanceof Error ? err.message : String(err)}`,
        ErrorCode.DATABASE_ERROR,
        500,
      );
    }

    const stat = await fs.stat(dest);
    await recordSystemLog('info', 'backup', `Database backup created: ${filename}`);

    return {
      filename,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
    };
  }

  public async listBackups(): Promise<BackupEntry[]> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      const files = await fs.readdir(this.backupDir);
      const entries: BackupEntry[] = [];
      for (const file of files) {
        if (!file.endsWith('.db')) continue;
        const stat = await fs.stat(path.join(this.backupDir, file));
        entries.push({
          filename: file,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
        });
      }
      return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  public async restoreBackup(filename: string): Promise<{ ok: boolean; restoredFrom: string }> {
    const safeName = path.basename(filename);
    if (!safeName.endsWith('.db')) {
      throw new AppError('Invalid backup filename', ErrorCode.VALIDATION_ERROR, 400);
    }
    const src = path.join(this.backupDir, safeName);
    try {
      await fs.access(src);
      await fs.copyFile(src, this.dbPath);
    } catch (err) {
      throw new AppError(
        `Failed to restore backup '${safeName}': ${err instanceof Error ? err.message : String(err)}`,
        ErrorCode.NOT_FOUND,
        404,
      );
    }
    await recordSystemLog('warn', 'backup', `Database restored from: ${safeName}`);
    return { ok: true, restoredFrom: safeName };
  }
}
