import type { SteamGameCompatibility } from '@ngegame/shared';

export interface CompatibilityAssessment {
  status: SteamGameCompatibility;
  reason: string;
}

const VERIFIED_SINGLEPLAYER_APPS: Record<number, string> = {
  413150: 'Single-player / co-op lokal yang aman untuk uji otomasi.',
  105600: 'Single-player sandbox yang mendukung kontrol standar.',
  646570: 'Turn-based single-player card strategy yang aman.',
  427520: 'Single-player automation/strategy dengan dukungan mod resmi.',
  294100: 'Single-player colony simulation yang aman untuk observasi.',
};

const UNSUPPORTED_ANTICHEAT_APPS: Record<number, string> = {
  730: 'Game kompetitif online dengan anti-cheat (VAC) — tidak didukung.',
  1172470: 'Game kompetitif online dengan Easy Anti-Cheat — tidak didukung.',
  578080: 'Game multiplayer online dengan anti-cheat — tidak didukung.',
  252490: 'Game multiplayer online dengan Easy Anti-Cheat — tidak didukung.',
};

export function assessGameCompatibility(
  appId: number,
  hasExecutable: boolean,
): CompatibilityAssessment {
  const verifiedReason = VERIFIED_SINGLEPLAYER_APPS[appId];
  if (verifiedReason) {
    return {
      status: 'verified',
      reason: verifiedReason,
    };
  }

  const unsupportedReason = UNSUPPORTED_ANTICHEAT_APPS[appId];
  if (unsupportedReason) {
    return {
      status: 'unsupported',
      reason: unsupportedReason,
    };
  }

  if (hasExecutable) {
    return {
      status: 'experimental',
      reason: 'Executable terdeteksi; belum terverifikasi khusus, gunakan pengawasan manual.',
    };
  }

  return {
    status: 'unknown',
    reason: 'Executable tidak ditemukan untuk platform saat ini.',
  };
}
