export const PAGES_BASE_URL = ['https:/', 'overthinkerid.github.io', 'Ngegame'].join('/') + '/';

export const GUIDE_URLS = {
  home: PAGES_BASE_URL,
  obs: `${PAGES_BASE_URL}#panduan-obs`,
  steam: `${PAGES_BASE_URL}#panduan-steam`,
  macos: `${PAGES_BASE_URL}#panduan-macos`,
  ai: `${PAGES_BASE_URL}#panduan-ai`,
  voice: `${PAGES_BASE_URL}#panduan-suara`,
  download: `${PAGES_BASE_URL}#unduhan`,
} as const;

export interface FriendlyErrorInfo {
  message: string;
  guideUrl?: string;
  guideLabel?: string;
}

export function parseFriendlyError(err: unknown, fallback = 'Terjadi kendala pada layanan.'): FriendlyErrorInfo {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : fallback;
  const cleaned = raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/i, '').trim();

  let extracted = cleaned;
  const jsonStart = cleaned.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(cleaned.slice(jsonStart)) as {
        error?: { message?: string };
        message?: string;
      };
      if (parsed?.error?.message) {
        extracted = parsed.error.message;
      } else if (parsed?.message) {
        extracted = parsed.message;
      }
    } catch {
      // Gunakan teks asli jika bukan JSON valid
    }
  }

  const lower = extracted.toLowerCase();

  if (lower.includes('stream key') || lower.includes('youtube') || lower.includes('twitch') || lower.includes('obs')) {
    return {
      message: `${extracted}. Simpan kunci siaran YouTube/Twitch atau hubungkan OBS WebSocket terlebih dahulu.`,
      guideUrl: GUIDE_URLS.obs,
      guideLabel: 'Panduan OBS & Siaran',
    };
  }

  if (lower.includes('steam')) {
    return {
      message: `${extracted}. Pastikan aplikasi Steam terpasang dan direktori pustaka sudah terdeteksi.`,
      guideUrl: GUIDE_URLS.steam,
      guideLabel: 'Panduan Steam',
    };
  }

  if (lower.includes('python') || lower.includes('worker')) {
    return {
      message: `${extracted}. Pastikan Python 3.11+ terpasang atau periksa konfigurasi Worker.`,
      guideUrl: GUIDE_URLS.macos,
      guideLabel: 'Panduan Sistem & Izin',
    };
  }

  if (lower.includes('ollama') || lower.includes('openai') || lower.includes('ai')) {
    return {
      message: `${extracted}. Periksa layanan Ollama lokal atau kunci API penyedia AI Anda.`,
      guideUrl: GUIDE_URLS.ai,
      guideLabel: 'Panduan AI Brain',
    };
  }

  if (lower.includes('voxcpm') || lower.includes('suara') || lower.includes('voice')) {
    return {
      message: `${extracted}. Layanan TTS akan memakai cadangan lokal jika server VoxCPM 2.0 belum aktif.`,
      guideUrl: GUIDE_URLS.voice,
      guideLabel: 'Panduan Suara AI',
    };
  }

  return {
    message: extracted || fallback,
    guideUrl: GUIDE_URLS.home,
    guideLabel: 'Buka Panduan',
  };
}
