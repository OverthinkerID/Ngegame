import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assessGameCompatibility } from '../src/services/steam/compatibility.js';
import { SteamManager } from '../src/services/steam/steamManager.js';
import { parseVdf } from '../src/services/steam/vdfParser.js';

describe('Steam Integration', () => {
  it('parses Valve VDF and ACF files cleanly', () => {
    const sampleAcf = `
"AppState"
{
  "appid"    "413150"
  "name"     "Stardew Valley"
  "installdir" "Stardew Valley"
  "SizeOnDisk" "654321000"
}
`;
    const parsed = parseVdf(sampleAcf);
    const appState = parsed.AppState as Record<string, string>;
    assert.equal(appState.appid, '413150');
    assert.equal(appState.name, 'Stardew Valley');
    assert.equal(appState.installdir, 'Stardew Valley');
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

  it('detects Steam installation, scans manifests, and persists metadata to SQLite', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngegame-steam-test-'));
    const steamAppsDir = path.join(tmpDir, 'steamapps');
    const stardewDir = path.join(steamAppsDir, 'common', 'Stardew Valley');

    try {
      await fs.mkdir(stardewDir, { recursive: true });
      if (process.platform === 'darwin') {
        await fs.mkdir(path.join(stardewDir, 'Stardew Valley.app'), { recursive: true });
      } else if (process.platform === 'win32') {
        await fs.writeFile(path.join(stardewDir, 'Stardew Valley.exe'), '');
      } else {
        const binPath = path.join(stardewDir, 'StardewValley');
        await fs.writeFile(binPath, '#!/bin/sh\n');
        await fs.chmod(binPath, 0o755);
      }

      const vdfContent = `
"libraryfolders"
{
  "0"
  {
    "path" "${tmpDir.replace(/\\/g, '\\\\')}"
  }
}
`;
      await fs.writeFile(path.join(steamAppsDir, 'libraryfolders.vdf'), vdfContent);

      const acfContent = `
"AppState"
{
  "appid" "413150"
  "name" "Stardew Valley"
  "installdir" "Stardew Valley"
  "SizeOnDisk" "524288000"
}
`;
      await fs.writeFile(path.join(steamAppsDir, 'appmanifest_413150.acf'), acfContent);

      const manager = new SteamManager({ steamPath: tmpDir });
      const scanResult = await manager.scanLibrary();

      assert.equal(scanResult.installation.installed, true);
      assert.equal(scanResult.installation.steamPath, tmpDir);
      assert.ok(scanResult.games.some((g) => g.appId === 413150));

      const stardew = scanResult.games.find((g) => g.appId === 413150);
      assert.ok(stardew);
      assert.equal(stardew.compatibility, 'verified');
      assert.ok(stardew.executablePath !== null);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
