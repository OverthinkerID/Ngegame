import fs from 'node:fs';
import path from 'node:path';
import type {
  RuntimeCompatibilityReport,
  UpdateChannel,
  UpdateDownloadEntry,
  UpdateHistoryEntry,
  UpdatePreferences,
  UpdateRecoveryLogEntry,
} from '@ngegame/shared';
import { getPrismaClient } from '../../db/prisma.js';
import type { PythonWorkerClient } from '../../workers/pythonWorkerClient.js';

export interface BackendUpdateStatusPayload {
  currentVersion: string;
  preferences: UpdatePreferences & { channel: UpdateChannel; lastCheckedAt: string | null };
  latestHistory: UpdateHistoryEntry | null;
  activeDownload: UpdateDownloadEntry | null;
  compatibility: RuntimeCompatibilityReport;
  recoveryLogsCount: number;
}

function resolvePackageVersion(): string {
  const candidates = [
    path.resolve(process.cwd(), 'package.json'),
    path.resolve(process.cwd(), '../../package.json'),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: string };
        if (typeof raw.version === 'string' && raw.version.trim()) {
          return raw.version.trim();
        }
      }
    } catch {
      // Ignore and try next candidate
    }
  }
  return '0.1.0';
}

export class UpdateService {
  private readonly currentVersion: string;

  constructor(private readonly workerClient?: PythonWorkerClient) {
    this.currentVersion = resolvePackageVersion();
  }

  public async getPreferences(): Promise<
    UpdatePreferences & { channel: UpdateChannel; lastCheckedAt: string | null }
  > {
    const prisma = getPrismaClient();
    const row = await prisma.updatePreferences.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        autoCheck: true,
        autoDownload: false,
        requireInstallConfirmation: true,
        checkFrequency: 'startup',
        allowPrerelease: false,
        channel: 'stable',
      },
    });
    const channel: UpdateChannel = row.allowPrerelease || row.channel === 'beta' ? 'beta' : 'stable';
    return {
      autoCheck: row.autoCheck,
      autoDownload: row.autoDownload,
      requireInstallConfirmation: row.requireInstallConfirmation,
      checkFrequency: row.checkFrequency as UpdatePreferences['checkFrequency'],
      allowPrerelease: row.allowPrerelease,
      channel,
      lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    };
  }

  public async updatePreferences(
    partial: Partial<UpdatePreferences>,
  ): Promise<UpdatePreferences & { channel: UpdateChannel; lastCheckedAt: string | null }> {
    const prisma = getPrismaClient();
    const current = await this.getPreferences();

    let allowPrerelease =
      partial.allowPrerelease !== undefined ? partial.allowPrerelease : current.allowPrerelease;
    let channel: UpdateChannel = partial.channel ?? current.channel;
    if (partial.channel !== undefined) {
      allowPrerelease = partial.channel === 'beta';
    } else if (partial.allowPrerelease !== undefined) {
      channel = partial.allowPrerelease ? 'beta' : 'stable';
    }

    const updated = await prisma.updatePreferences.upsert({
      where: { id: 1 },
      update: {
        autoCheck: partial.autoCheck ?? current.autoCheck,
        autoDownload: partial.autoDownload ?? current.autoDownload,
        requireInstallConfirmation:
          partial.requireInstallConfirmation ?? current.requireInstallConfirmation,
        checkFrequency: partial.checkFrequency ?? current.checkFrequency,
        allowPrerelease,
        channel,
      },
      create: {
        id: 1,
        autoCheck: partial.autoCheck ?? current.autoCheck,
        autoDownload: partial.autoDownload ?? current.autoDownload,
        requireInstallConfirmation:
          partial.requireInstallConfirmation ?? current.requireInstallConfirmation,
        checkFrequency: partial.checkFrequency ?? current.checkFrequency,
        allowPrerelease,
        channel,
      },
    });

    return {
      autoCheck: updated.autoCheck,
      autoDownload: updated.autoDownload,
      requireInstallConfirmation: updated.requireInstallConfirmation,
      checkFrequency: updated.checkFrequency as UpdatePreferences['checkFrequency'],
      allowPrerelease: updated.allowPrerelease,
      channel: updated.allowPrerelease ? 'beta' : 'stable',
      lastCheckedAt: updated.lastCheckedAt ? updated.lastCheckedAt.toISOString() : null,
    };
  }

  public async markChecked(): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.updatePreferences.upsert({
      where: { id: 1 },
      update: { lastCheckedAt: new Date() },
      create: {
        id: 1,
        lastCheckedAt: new Date(),
      },
    });
  }

  public async checkRuntimeCompatibility(): Promise<RuntimeCompatibilityReport> {
    const checkedAt = new Date().toISOString();
    const issues: string[] = [];
    let databaseReadable = false;
    let prismaSchemaValid = false;

    try {
      const prisma = getPrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      databaseReadable = true;
      await prisma.updateHistory.count();
      prismaSchemaValid = true;
    } catch (err) {
      issues.push(
        `Database/Prisma tidak siap: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let pythonWorkerAvailable = false;
    let pythonVersion: string | null = null;
    if (this.workerClient) {
      try {
        const health = await this.workerClient.checkHealth();
        pythonWorkerAvailable = health.status === 'healthy';
        pythonVersion = health.message ?? null;
        if (!pythonWorkerAvailable) {
          issues.push(`Python AI Worker status ${health.status}: ${health.message ?? ''}`);
        }
      } catch (err) {
        issues.push(
          `Python AI Worker tidak dapat dihubungi: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      pythonWorkerAvailable = true;
    }

    return {
      ok: databaseReadable && prismaSchemaValid && pythonWorkerAvailable,
      checkedAt,
      prismaSchemaValid,
      databaseReadable,
      pythonWorkerAvailable,
      pythonVersion,
      issues,
    };
  }

  public async listHistory(limit = 20): Promise<UpdateHistoryEntry[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.updateHistory.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)),
    });
    return rows.map((row) => ({
      id: row.id,
      fromVersion: row.fromVersion,
      toVersion: row.toVersion,
      channel: (row.channel === 'beta' ? 'beta' : 'stable') as UpdateChannel,
      status: row.status,
      releaseNotes: row.releaseNotes,
      releaseDate: row.releaseDate,
      packageSize: row.packageSize,
      backupPath: row.backupPath,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    }));
  }

  public async recordHistory(input: {
    fromVersion?: string;
    toVersion: string;
    channel?: UpdateChannel;
    status: string;
    releaseNotes?: string | null;
    releaseDate?: string | null;
    packageSize?: number;
    backupPath?: string | null;
    errorMessage?: string | null;
    completed?: boolean;
  }): Promise<UpdateHistoryEntry> {
    const prisma = getPrismaClient();
    const row = await prisma.updateHistory.create({
      data: {
        fromVersion: input.fromVersion ?? this.currentVersion,
        toVersion: input.toVersion,
        channel: input.channel ?? 'stable',
        status: input.status,
        releaseNotes: input.releaseNotes ?? null,
        releaseDate: input.releaseDate ?? null,
        packageSize: input.packageSize ?? 0,
        backupPath: input.backupPath ?? null,
        errorMessage: input.errorMessage ?? null,
        completedAt: input.completed ? new Date() : null,
      },
    });
    return {
      id: row.id,
      fromVersion: row.fromVersion,
      toVersion: row.toVersion,
      channel: (row.channel === 'beta' ? 'beta' : 'stable') as UpdateChannel,
      status: row.status,
      releaseNotes: row.releaseNotes,
      releaseDate: row.releaseDate,
      packageSize: row.packageSize,
      backupPath: row.backupPath,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    };
  }

  public async startOrUpdateDownload(input: {
    version: string;
    channel?: UpdateChannel;
    status: string;
    totalBytes?: number;
    downloadedBytes?: number;
    percent?: number;
    bytesPerSecond?: number;
    errorMessage?: string | null;
  }): Promise<UpdateDownloadEntry> {
    const prisma = getPrismaClient();
    const existing = await prisma.updateDownload.findFirst({
      where: { version: input.version },
      orderBy: { startedAt: 'desc' },
    });

    const row = existing
      ? await prisma.updateDownload.update({
          where: { id: existing.id },
          data: {
            status: input.status,
            channel: input.channel ?? existing.channel,
            totalBytes: input.totalBytes ?? existing.totalBytes,
            downloadedBytes: input.downloadedBytes ?? existing.downloadedBytes,
            percent: input.percent ?? existing.percent,
            bytesPerSecond: input.bytesPerSecond ?? existing.bytesPerSecond,
            errorMessage: input.errorMessage !== undefined ? input.errorMessage : existing.errorMessage,
          },
        })
      : await prisma.updateDownload.create({
          data: {
            version: input.version,
            channel: input.channel ?? 'stable',
            status: input.status,
            totalBytes: input.totalBytes ?? 0,
            downloadedBytes: input.downloadedBytes ?? 0,
            percent: input.percent ?? 0,
            bytesPerSecond: input.bytesPerSecond ?? 0,
            errorMessage: input.errorMessage ?? null,
          },
        });

    return {
      id: row.id,
      version: row.version,
      channel: (row.channel === 'beta' ? 'beta' : 'stable') as UpdateChannel,
      status: row.status,
      totalBytes: row.totalBytes,
      downloadedBytes: row.downloadedBytes,
      percent: row.percent,
      bytesPerSecond: row.bytesPerSecond,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public async cancelActiveDownload(version?: string): Promise<UpdateDownloadEntry | null> {
    const prisma = getPrismaClient();
    const active = await prisma.updateDownload.findFirst({
      where: version ? { version, status: 'downloading' } : { status: 'downloading' },
      orderBy: { updatedAt: 'desc' },
    });
    if (!active) {
      return null;
    }
    const row = await prisma.updateDownload.update({
      where: { id: active.id },
      data: {
        status: 'cancelled',
        bytesPerSecond: 0,
        errorMessage: 'Unduhan dibatalkan oleh pengguna.',
      },
    });
    return {
      id: row.id,
      version: row.version,
      channel: (row.channel === 'beta' ? 'beta' : 'stable') as UpdateChannel,
      status: row.status,
      totalBytes: row.totalBytes,
      downloadedBytes: row.downloadedBytes,
      percent: row.percent,
      bytesPerSecond: row.bytesPerSecond,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public async listRecoveryLogs(limit = 20): Promise<UpdateRecoveryLogEntry[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.updateRecoveryLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)),
    });
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      action: row.action,
      backupPath: row.backupPath,
      success: row.success,
      details: row.details,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  public async recordRecoveryLog(input: {
    version?: string;
    action: string;
    backupPath?: string | null;
    success?: boolean;
    details: string;
  }): Promise<UpdateRecoveryLogEntry> {
    const prisma = getPrismaClient();
    const row = await prisma.updateRecoveryLog.create({
      data: {
        version: input.version ?? this.currentVersion,
        action: input.action,
        backupPath: input.backupPath ?? null,
        success: input.success ?? true,
        details: input.details,
      },
    });
    return {
      id: row.id,
      version: row.version,
      action: row.action,
      backupPath: row.backupPath,
      success: row.success,
      details: row.details,
      createdAt: row.createdAt.toISOString(),
    };
  }

  public async getStatus(): Promise<BackendUpdateStatusPayload> {
    const prisma = getPrismaClient();
    const [preferences, history, activeDownloadRow, compatibility, recoveryLogsCount] =
      await Promise.all([
        this.getPreferences(),
        this.listHistory(1),
        prisma.updateDownload.findFirst({ orderBy: { updatedAt: 'desc' } }),
        this.checkRuntimeCompatibility(),
        prisma.updateRecoveryLog.count(),
      ]);

    const activeDownload: UpdateDownloadEntry | null = activeDownloadRow
      ? {
          id: activeDownloadRow.id,
          version: activeDownloadRow.version,
          channel: (activeDownloadRow.channel === 'beta' ? 'beta' : 'stable') as UpdateChannel,
          status: activeDownloadRow.status,
          totalBytes: activeDownloadRow.totalBytes,
          downloadedBytes: activeDownloadRow.downloadedBytes,
          percent: activeDownloadRow.percent,
          bytesPerSecond: activeDownloadRow.bytesPerSecond,
          errorMessage: activeDownloadRow.errorMessage,
          startedAt: activeDownloadRow.startedAt.toISOString(),
          updatedAt: activeDownloadRow.updatedAt.toISOString(),
        }
      : null;

    return {
      currentVersion: this.currentVersion,
      preferences,
      latestHistory: history[0] ?? null,
      activeDownload,
      compatibility,
      recoveryLogsCount,
    };
  }
}
