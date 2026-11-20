import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assessGameCompatibility } from '../src/services/steam/compatibility.js';
import {
  LinuxSteamScanner,
  MacOSSteamScanner,
  WindowsSteamScanner,
} from '../src/services/steam/scanners.js';
import { SteamManager } from '../src/services/steam/steamManager.js';
import { parseVdf } from '../src/services/steam/vdfParser.js';

describe('Steam Integration (Phase 12F.2)', () => {
  it('parses Valve VDF and ACF files cleanly', () => {
    const sampleAcf = `
"AppState"
{
  "appid"    "413150"
  "name"     "Stardew Valley"
  "installdir" "Stardew Valley"
  "SizeOnDisk" "654321000"
  "StateFlags" "4"
}
`;
    const parsed = parseVdf(sampleAcf);
    const appState = parsed.AppState as Record<string, string>;
    assert.equal(appState.appid, '413150');
    assert.equal(appState.name, 'Stardew Valley');
    assert.equal(appState.installdir, 'Stardew Valley');
    assert.equal(appState.StateFlags, '4');
  });

  it('assesses game compatibility safely', () => {
    const verified = assessGameCompatibility(413150, true);
    assert.equal(verified.status, 'verified');

    const unsupported = assessGameCompatibility(730, true);
    assert.equal(unsupported.status, 'unsupported');

    const experimental = assessGameCompatibility(999999, true);
    assert.equal(experimental.status, 'experimental');

    const unknown = assessGameCompatibility(999999, false);
    assert.equal(unknown.status, 'unknown');
  });

  it('resolves Windows Registry, multi-drive paths, macOS, and Linux candidates cleanly', async () => {
    const winScanner = new WindowsSteamScanner(
      'E:\\CustomSteam',
      async () => 'D:\\Valve\\Steam',
    );
    const winResult = await winScanner.getCandidateSteamPaths();
    assert.equal(winResult.registryQueried, true);
    assert.equal(winResult.registrySteamPath, 'D:\\Valve\\Steam');
    assert.ok(winResult.candidates.includes('E:\\CustomSteam'));
    assert.ok(winResult.candidates.includes('D:\\Valve\\Steam'));
    assert.ok(winResult.candidates.includes('D:\\Steam'));
    assert.equal(
      winScanner.normalizeLibraryPath('F:\\\\SteamLibrary\\\\Games/'),
      'F:\\SteamLibrary\\Games\\',
    );

    const macScanner = new MacOSSteamScanner('/Volumes/External/Steam');
    const macResult = await macScanner.getCandidateSteamPaths();
    assert.equal(macResult.registryQueried, false);
    assert.ok(macResult.candidates.includes('/Volumes/External/Steam'));

    const linuxScanner = new LinuxSteamScanner();
    const linuxResult = await linuxScanner.getCandidateSteamPaths();
    assert.ok(linuxResult.candidates.length >= 3);
  });

  it('scans multiple Steam libraries, skips stale manifests, cleans uninstalled games, and supports manual library paths', async () => {
    const tmpMain = await fs.mkdtemp(path.join(os.tmpdir(), 'ngegame-steam-main-'));
    const tmpSecondary = await fs.mkdtemp(path.join(os.tmpdir(), 'ngegame-steam-lib2-'));
    const tmpManual = await fs.mkdtemp(path.join(os.tmpdir(), 'ngegame-steam-manual-'));

    const mainAppsDir = path.join(tmpMain, 'steamapps');
    const secAppsDir = path.join(tmpSecondary, 'steamapps');
    const manualAppsDir = path.join(tmpManual, 'steamapps');

    const stardewDir = path.join(mainAppsDir, 'common', 'Stardew Valley');
    const secGameDir = path.join(secAppsDir, 'common', 'Terraria');
    const manualGameDir = path.join(manualAppsDir, 'common', 'Hades');

    try {
      await fs.mkdir(stardewDir, { recursive: true });
      await fs.mkdir(secGameDir, { recursive: true });
      await fs.mkdir(manualGameDir, { recursive: true });

      const createDummyExec = async (dir: string, base: string) => {
        if (process.platform === 'darwin') {
          await fs.mkdir(path.join(dir, `${base}.app`), { recursive: true });
        } else if (process.platform === 'win32') {
          await fs.writeFile(path.join(dir, `${base}.exe`), '');
        } else {
          const binPath = path.join(dir, base);
          await fs.writeFile(binPath, '#!/bin/sh\n');
          await fs.chmod(binPath, 0o755);
        }
      };

      await createDummyExec(stardewDir, 'Stardew Valley');
      await createDummyExec(secGameDir, 'Terraria');
      await createDummyExec(manualGameDir, 'Hades');

      // libraryfolders.vdf menunjuk ke 2 library (utama + sekunder)
      const vdfContent = `
"libraryfolders"
{
  "0"
  {
    "path" "${tmpMain.replace(/\\/g, '\\\\')}"
  }
  "1"
  {
    "path" "${tmpSecondary.replace(/\\/g, '\\\\')}"
  }
}
`;
      await fs.writeFile(path.join(mainAppsDir, 'libraryfolders.vdf'), vdfContent);

      // Game valid di library utama
      await fs.writeFile(
        path.join(mainAppsDir, 'appmanifest_413150.acf'),
        `"AppState"\n{\n "appid" "413150"\n "name" "Stardew Valley"\n "installdir" "Stardew Valley"\n "SizeOnDisk" "524288000"\n "StateFlags" "4"\n}\n`,
      );

      // Manifest stale (direktori instalasi tidak ada)
      await fs.writeFile(
        path.join(mainAppsDir, 'appmanifest_999999.acf'),
        `"AppState"\n{\n "appid" "999999"\n "name" "Uninstalled Game"\n "installdir" "MissingFolder"\n "SizeOnDisk" "1000"\n "StateFlags" "4"\n}\n`,
      );

      // Game valid di library kedua
      await fs.writeFile(
        path.join(secAppsDir, 'appmanifest_105600.acf'),
        `"AppState"\n{\n "appid" "105600"\n "name" "Terraria"\n "installdir" "Terraria"\n "SizeOnDisk" "224288000"\n "StateFlags" "4"\n}\n`,
      );

      // Game di library manual
      await fs.writeFile(
        path.join(manualAppsDir, 'appmanifest_1145360.acf'),
        `"AppState"\n{\n "appid" "1145360"\n "name" "Hades"\n "installdir" "Hades"\n "SizeOnDisk" "924288000"\n "StateFlags" "4"\n}\n`,
      );

      const manager = new SteamManager({ steamPath: tmpMain });
      await manager.addManualLibraryPath(tmpManual);

      const scan1 = await manager.scanLibrary();
      assert.equal(scan1.installation.installed, true);
      assert.equal(scan1.installation.libraryPaths.length, 3);
      assert.ok(scan1.games.some((g) => g.appId === 413150));
      assert.ok(scan1.games.some((g) => g.appId === 105600));
      assert.ok(scan1.games.some((g) => g.appId === 1145360));
      assert.equal(scan1.games.some((g) => g.appId === 999999), false);

      // Tidak ada duplikasi AppID
      assert.equal(new Set(scan1.games.map((g) => g.appId)).size, scan1.games.length);

      const diag = manager.getDiagnostics();
      assert.ok(diag);
      assert.ok(diag.staleManifests.some((m) => m.appId === 999999));

      // Simulasikan uninstall Terraria (hapus manifest) -> rescan -> Terraria hilang dari SQLite
      await fs.rm(path.join(secAppsDir, 'appmanifest_105600.acf'));
      const scan2 = await manager.scanLibrary();
      assert.equal(scan2.games.some((g) => g.appId === 105600), false);
      assert.ok(scan2.games.some((g) => g.appId === 413150));

      await manager.removeManualLibraryPath(tmpManual);
    } finally {
      await fs.rm(tmpMain, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      await fs.rm(tmpSecondary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      await fs.rm(tmpManual, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
