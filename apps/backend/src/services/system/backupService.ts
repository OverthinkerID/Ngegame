import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError, ErrorCode } from '@ngegame/shared';
import { recordSystemLog } from '../../db/prisma.js';

export interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export class BackupService {
  private readonly dbPath: string;
  private readonly backupDir: string;

  constructor(dbPath?: string, backupDir?: string) {
    this.dbPath =
      dbPath ?? path.resolve(process.cwd(), 'prisma', 'dev.db');
    this.backupDir =
      backupDir ?? path.resolve(process.cwd(), 'backups');
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
