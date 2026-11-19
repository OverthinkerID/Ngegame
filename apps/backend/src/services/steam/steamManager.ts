import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  AppError,
  ErrorCode,
  type SteamGameCompatibility,
  type SteamGameRecord,
  type SteamInstallationStatus,
  type SteamLaunchResult,
  type SteamScanResult,
  type SteamStopResult,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { Logger } from '../../utils/logger.js';
import { assessGameCompatibility } from './compatibility.js';
import { parseVdf, type VdfObject } from './vdfParser.js';

const execFileAsync = promisify(execFile);

interface RunningProcessInfo {
  pid: number;
  command: string;
}

const IGNORED_WIN_EXE_PATTERNS = [
  /unins\d*\.exe$/i,
  /crash/i,
  /redist/i,
  /dxsetup/i,
  /dotnet/i,
  /unitycrashhandler/i,
];

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export class SteamManager {
  private readonly logger: Logger;
  private readonly customSteamPath?: string;

  constructor(options?: { steamPath?: string; logger?: Logger }) {
    this.customSteamPath = options?.steamPath ?? process.env.STEAM_PATH;
    this.logger = options?.logger ?? new Logger('steam-manager');
  }

  private getCandidateSteamPaths(): string[] {
    const candidates: string[] = [];
    if (this.customSteamPath) {
      candidates.push(this.customSteamPath);
    }

    if (process.platform === 'darwin') {
      candidates.push(
        path.join(os.homedir(), 'Library', 'Application Support', 'Steam'),
        '/Applications/Steam.app',
      );
    } else if (process.platform === 'win32') {
      candidates.push(
        'C:\\Program Files (x86)\\Steam',
        'C:\\Program Files\\Steam',
      );
    } else {
      candidates.push(
        path.join(os.homedir(), '.local', 'share', 'Steam'),
        path.join(os.homedir(), '.steam', 'steam'),
      );
    }

    return candidates;
  }

  public async detectInstallation(): Promise<SteamInstallationStatus> {
    const checkedAt = new Date().toISOString();
    let foundSteamPath: string | null = null;

    for (const candidate of this.getCandidateSteamPaths()) {
      if (await pathExists(candidate)) {
        foundSteamPath = candidate;
        break;
      }
    }

    if (!foundSteamPath) {
      return {
        installed: false,
        steamPath: null,
        libraryPaths: [],
        platform: process.platform,
        checkedAt,
      };
    }

    const libraryPaths = await this.readLibraryFolders(foundSteamPath);
    return {
      installed: true,
      steamPath: foundSteamPath,
      libraryPaths,
      platform: process.platform,
      checkedAt,
    };
  }

  private async readLibraryFolders(steamPath: string): Promise<string[]> {
    const libraries = new Set<string>();
    const defaultSteamApps = path.join(steamPath, 'steamapps');
    if (await pathExists(defaultSteamApps)) {
      libraries.add(steamPath);
    }

    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
    if (!(await pathExists(vdfPath))) {
      return Array.from(libraries);
    }

    try {
      const raw = await fs.readFile(vdfPath, 'utf8');
      const parsed = parseVdf(raw);
      const root = (parsed.libraryfolders ?? parsed.LibraryFolders ?? parsed) as VdfObject;

      for (const value of Object.values(root)) {
        if (typeof value === 'object' && value !== null && typeof value.path === 'string') {
          const libPath = value.path.replace(/\\\\/g, '\\');
          if (await pathExists(path.join(libPath, 'steamapps'))) {
            libraries.add(libPath);
          }
        }
      }
    } catch (err) {
      this.logger.warn('Failed to parse libraryfolders.vdf', {
        vdfPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return Array.from(libraries);
  }

  public async detectExecutable(
    installPath: string,
    gameName: string,
  ): Promise<string | null> {
    if (!(await pathExists(installPath))) {
      return null;
    }

    try {
      const entries = await fs.readdir(installPath, { withFileTypes: true });
      const normalizedGameName = gameName.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (process.platform === 'darwin') {
        const appBundles = entries.filter(
          (entry) => entry.isDirectory() && entry.name.endsWith('.app'),
        );
        if (appBundles.length > 0) {
          const preferred =
            appBundles.find((b) =>
              b.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalizedGameName),
            ) ?? appBundles[0];
          if (preferred) {
            return path.join(installPath, preferred.name);
          }
        }
      }

      if (process.platform === 'win32') {
        const exeFiles = entries.filter(
          (entry) =>
            entry.isFile() &&
            entry.name.toLowerCase().endsWith('.exe') &&
            !IGNORED_WIN_EXE_PATTERNS.some((pat) => pat.test(entry.name)),
        );
        if (exeFiles.length > 0) {
          const preferred =
            exeFiles.find((f) =>
              f.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalizedGameName),
            ) ?? exeFiles[0];
          if (preferred) {
            return path.join(installPath, preferred.name);
          }
        }
      }

      // Fallback: check top-level files for executable bit on Unix
      if (process.platform !== 'win32') {
        for (const entry of entries) {
          if (entry.isFile() && !entry.name.includes('.')) {
            const full = path.join(installPath, entry.name);
            try {
              await fs.access(full, fs.constants.X_OK);
              return full;
            } catch {
              // ignore non-executable
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn('Failed to scan game executable directory', {
        installPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return null;
  }

  private async listRunningProcesses(): Promise<RunningProcessInfo[]> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH']);
        return stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
            const name = cols[0] ?? '';
            const pid = Number.parseInt(cols[1] ?? '', 10);
            return Number.isNaN(pid) ? null : { pid, command: name };
          })
          .filter((item): item is RunningProcessInfo => item !== null);
      }

      const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'pid=,comm=']);
      return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const match = /^(\d+)\s+(.+)$/.exec(line);
          if (!match) return null;
          const pid = Number.parseInt(match[1] ?? '', 10);
          const command = match[2] ?? '';
          return Number.isNaN(pid) ? null : { pid, command };
        })
        .filter((item): item is RunningProcessInfo => item !== null);
    } catch (err) {
      this.logger.warn('Failed to list running processes', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private matchRunningProcess(
    processes: RunningProcessInfo[],
    executablePath: string | null,
    installDir: string,
  ): RunningProcessInfo | null {
    if (!executablePath && !installDir) return null;

    const targetBase = executablePath
      ? path.basename(executablePath, path.extname(executablePath)).toLowerCase()
      : '';
    const dirToken = installDir.toLowerCase();

    for (const proc of processes) {
      const cmdLower = proc.command.toLowerCase();
      if (targetBase && cmdLower.includes(targetBase)) {
        return proc;
      }
      if (dirToken && cmdLower.includes(dirToken)) {
        return proc;
      }
    }

    return null;
  }

  public async scanLibrary(): Promise<SteamScanResult> {
    const installation = await this.detectInstallation();
    const scannedAt = new Date();
    const prisma = getPrismaClient();

    if (!installation.installed) {
      await recordSystemLog('info', 'steam', 'Steam installation not detected on this system');
      const existing = await this.listGames();
      return {
        installation,
        games: existing,
        scannedAt: scannedAt.toISOString(),
      };
    }

    const discoveredAppIds = new Set<number>();

    for (const libPath of installation.libraryPaths) {
      const steamAppsDir = path.join(libPath, 'steamapps');
      let files: string[] = [];
      try {
        files = await fs.readdir(steamAppsDir);
      } catch {
        continue;
      }

      const manifests = files.filter(
        (f) => f.startsWith('appmanifest_') && f.endsWith('.acf'),
      );

      for (const manifestFile of manifests) {
        const fullManifestPath = path.join(steamAppsDir, manifestFile);
        try {
          const raw = await fs.readFile(fullManifestPath, 'utf8');
          const parsed = parseVdf(raw);
          const appState = (parsed.AppState ?? parsed) as VdfObject;

          const appId = Number.parseInt(String(appState.appid ?? ''), 10);
          const name = typeof appState.name === 'string' ? appState.name : `App ${appId}`;
          const installDir =
            typeof appState.installdir === 'string' ? appState.installdir : '';
          const sizeOnDiskBytes = Number.parseInt(
            String(appState.SizeOnDisk ?? appState.BytesDownloaded ?? '0'),
            10,
          );

          if (Number.isNaN(appId) || !installDir) {
            continue;
          }

          discoveredAppIds.add(appId);
          const installPath = path.join(steamAppsDir, 'common', installDir);
          const executablePath = await this.detectExecutable(installPath, name);
          const compatibility = assessGameCompatibility(appId, executablePath !== null);

          await prisma.steamGame.upsert({
            where: { appId },
            create: {
              appId,
              name,
              installDir,
              installPath,
              executablePath,
              sizeOnDiskBytes: Number.isNaN(sizeOnDiskBytes) ? 0 : sizeOnDiskBytes,
              compatibility: compatibility.status,
              compatibilityReason: compatibility.reason,
              lastScannedAt: scannedAt,
            },
            update: {
              name,
              installDir,
              installPath,
              executablePath,
              sizeOnDiskBytes: Number.isNaN(sizeOnDiskBytes) ? 0 : sizeOnDiskBytes,
              compatibility: compatibility.status,
              compatibilityReason: compatibility.reason,
              lastScannedAt: scannedAt,
            },
          });
        } catch (err) {
          this.logger.warn('Failed to parse appmanifest', {
            file: fullManifestPath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    await recordSystemLog('info', 'steam', `Steam library scan completed (${discoveredAppIds.size} games found)`);

    const games = await this.listGames();
    return {
      installation,
      games,
      scannedAt: scannedAt.toISOString(),
    };
  }

  public async listGames(): Promise<SteamGameRecord[]> {
    const prisma = getPrismaClient();
    const [rows, processes] = await Promise.all([
      prisma.steamGame.findMany({
        orderBy: { name: 'asc' },
      }),
      this.listRunningProcesses(),
    ]);

    return rows.map((row) => {
      const running = this.matchRunningProcess(
        processes,
        row.executablePath,
        row.installDir,
      );
      return {
        appId: row.appId,
        name: row.name,
        installDir: row.installDir,
        installPath: row.installPath,
        executablePath: row.executablePath,
        sizeOnDiskBytes: row.sizeOnDiskBytes,
        compatibility: row.compatibility as SteamGameCompatibility,
        compatibilityReason: row.compatibilityReason,
        isRunning: running !== null,
        pid: running?.pid ?? null,
        lastScannedAt: row.lastScannedAt.toISOString(),
        lastLaunchedAt: row.lastLaunchedAt ? row.lastLaunchedAt.toISOString() : null,
      };
    });
  }

  public async launchGame(appId: number): Promise<SteamLaunchResult> {
    const prisma = getPrismaClient();
    const game = await prisma.steamGame.findUnique({ where: { appId } });

    if (!game) {
      throw new AppError(
        `Steam game with AppID ${appId} not found in local database`,
        ErrorCode.NOT_FOUND,
        404,
      );
    }

    if (game.compatibility === 'unsupported') {
      throw new AppError(
        `Game "${game.name}" tidak didukung untuk otomasi: ${game.compatibilityReason}`,
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    const steamUri = `steam://rungameid/${appId}`;
    try {
      if (process.platform === 'darwin') {
        await execFileAsync('open', [steamUri]);
      } else if (process.platform === 'win32') {
        await execFileAsync('cmd', ['/c', 'start', '', steamUri]);
      } else {
        await execFileAsync('xdg-open', [steamUri]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(
        `Gagal menjalankan ${game.name} melalui Steam launcher: ${msg}`,
        ErrorCode.UNKNOWN_ERROR,
        500,
      );
    }

    await prisma.steamGame.update({
      where: { appId },
      data: { lastLaunchedAt: new Date() },
    });

    await recordSystemLog('info', 'steam', `Launched game "${game.name}" (AppID ${appId}) via Steam URI`);

    return {
      ok: true,
      appId,
      method: 'steam-uri',
      message: `Perintah peluncuran dikirim ke Steam untuk ${game.name}`,
      pid: null,
    };
  }

  public async stopGame(appId: number): Promise<SteamStopResult> {
    const prisma = getPrismaClient();
    const game = await prisma.steamGame.findUnique({ where: { appId } });

    if (!game) {
      throw new AppError(
        `Steam game with AppID ${appId} not found`,
        ErrorCode.NOT_FOUND,
        404,
      );
    }

    const processes = await this.listRunningProcesses();
    const running = this.matchRunningProcess(
      processes,
      game.executablePath,
      game.installDir,
    );

    if (!running) {
      return {
        ok: true,
        appId,
        message: `${game.name} sedang tidak berjalan.`,
      };
    }

    try {
      if (process.platform === 'win32') {
        await execFileAsync('taskkill', ['/PID', String(running.pid)]);
      } else {
        process.kill(running.pid, 'SIGTERM');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(
        `Gagal menghentikan ${game.name} (PID ${running.pid}): ${msg}`,
        ErrorCode.UNKNOWN_ERROR,
        500,
      );
    }

    await recordSystemLog('info', 'steam', `Sent safe stop signal to "${game.name}" (PID ${running.pid})`);

    return {
      ok: true,
      appId,
      message: `Sinyal berhenti aman dikirim ke ${game.name} (PID ${running.pid}).`,
    };
  }
}
