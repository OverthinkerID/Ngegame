import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SteamScannerDiagnostics } from '@ngegame/shared';

const execFileAsync = promisify(execFile);

export interface PlatformSteamScanner {
  readonly scannerName: SteamScannerDiagnostics['scannerName'];
  getCandidateSteamPaths(): Promise<{
    candidates: string[];
    registryQueried: boolean;
    registrySteamPath: string | null;
  }>;
  normalizeLibraryPath(rawPath: string): string;
}

async function queryWindowsRegistrySteamPath(): Promise<string | null> {
  const keys = [
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
    ['HKCU\\Software\\Valve\\Steam', 'SteamExe'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
    ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'],
  ] as const;

  for (const [regKey, valueName] of keys) {
    try {
      const { stdout } = await execFileAsync('reg', ['query', regKey, '/v', valueName], {
        timeout: 2500,
      });
      const match = new RegExp(`${valueName}\\s+REG_SZ\\s+(.+)$`, 'im').exec(stdout);
      if (match?.[1]) {
        let resolved = match[1].trim();
        if (resolved.toLowerCase().endsWith('.exe')) {
          resolved = path.dirname(resolved);
        }
        return resolved.replace(/\//g, '\\');
      }
    } catch {
      // Lanjutkan ke kunci registry berikutnya
    }
  }
  return null;
}

export class WindowsSteamScanner implements PlatformSteamScanner {
  public readonly scannerName = 'WindowsSteamScanner' as const;
  private readonly customSteamPath?: string;
  private readonly registryReader: () => Promise<string | null>;

  constructor(customSteamPath?: string, registryReader = queryWindowsRegistrySteamPath) {
    this.customSteamPath = customSteamPath;
    this.registryReader = registryReader;
  }

  public async getCandidateSteamPaths(): Promise<{
    candidates: string[];
    registryQueried: boolean;
    registrySteamPath: string | null;
  }> {
    const candidates = new Set<string>();
    if (this.customSteamPath) {
      candidates.add(this.customSteamPath);
    }

    const registrySteamPath = await this.registryReader();
    if (registrySteamPath) {
      candidates.add(registrySteamPath);
    }

    const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
    const localAppData = process.env.LOCALAPPDATA;

    candidates.add(path.win32.join(pf86, 'Steam'));
    candidates.add(path.win32.join(pf, 'Steam'));
    if (localAppData) {
      candidates.add(path.win32.join(localAppData, 'Steam'));
    }

    for (const drive of ['C', 'D', 'E', 'F', 'G']) {
      candidates.add(`${drive}:\\Steam`);
      candidates.add(`${drive}:\\Program Files (x86)\\Steam`);
      candidates.add(`${drive}:\\Games\\Steam`);
    }

    return {
      candidates: Array.from(candidates),
      registryQueried: true,
      registrySteamPath,
    };
  }

  public normalizeLibraryPath(rawPath: string): string {
    return rawPath.replace(/\\\\/g, '\\').replace(/\//g, '\\').trim();
  }
}

export class MacOSSteamScanner implements PlatformSteamScanner {
  public readonly scannerName = 'MacOSSteamScanner' as const;
  private readonly customSteamPath?: string;

  constructor(customSteamPath?: string) {
    this.customSteamPath = customSteamPath;
  }

  public async getCandidateSteamPaths(): Promise<{
    candidates: string[];
    registryQueried: boolean;
    registrySteamPath: string | null;
  }> {
    const candidates = new Set<string>();
    if (this.customSteamPath) {
      candidates.add(this.customSteamPath);
    }
    candidates.add(path.join(os.homedir(), 'Library', 'Application Support', 'Steam'));
    candidates.add('/Applications/Steam.app');

    // Periksa volume eksternal jika Steam library berada di SSD eksternal
    try {
      const volumes = await fs.readdir('/Volumes');
      for (const vol of volumes) {
        candidates.add(path.join('/Volumes', vol, 'Steam'));
        candidates.add(path.join('/Volumes', vol, 'SteamLibrary'));
      }
    } catch {
      // Abaikan jika /Volumes tidak terbaca
    }

    return {
      candidates: Array.from(candidates),
      registryQueried: false,
      registrySteamPath: null,
    };
  }

  public normalizeLibraryPath(rawPath: string): string {
    return rawPath.replace(/\\\\/g, '/').trim();
  }
}

export class LinuxSteamScanner implements PlatformSteamScanner {
  public readonly scannerName = 'LinuxSteamScanner' as const;
  private readonly customSteamPath?: string;

  constructor(customSteamPath?: string) {
    this.customSteamPath = customSteamPath;
  }

  public async getCandidateSteamPaths(): Promise<{
    candidates: string[];
    registryQueried: boolean;
    registrySteamPath: string | null;
  }> {
    const candidates = new Set<string>();
    if (this.customSteamPath) {
      candidates.add(this.customSteamPath);
    }
    candidates.add(path.join(os.homedir(), '.local', 'share', 'Steam'));
    candidates.add(path.join(os.homedir(), '.steam', 'steam'));
    candidates.add(
      path.join(os.homedir(), '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    );

    return {
      candidates: Array.from(candidates),
      registryQueried: false,
      registrySteamPath: null,
    };
  }

  public normalizeLibraryPath(rawPath: string): string {
    return rawPath.replace(/\\\\/g, '/').trim();
  }
}

export function createSteamScanner(
  platform = process.platform,
  customSteamPath?: string,
): PlatformSteamScanner {
  if (platform === 'win32') return new WindowsSteamScanner(customSteamPath);
  if (platform === 'darwin') return new MacOSSteamScanner(customSteamPath);
  return new LinuxSteamScanner(customSteamPath);
}
