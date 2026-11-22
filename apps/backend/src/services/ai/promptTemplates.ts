import {
  ALLOWED_AI_ACTIONS,
  type AIBrainThinkRequest,
  type GameGenreTemplate,
} from '@ngegame/shared';

const GENRE_GUIDELINES: Record<GameGenreTemplate, string> = {
  FPS: 'Fokus pada kesadaran posisi, manajemen amunisi/HP dari HUD, dan pergerakan taktis aman. Jangan lakukan tindakan impulsif saat layar gelap/loading.',
  RPG: 'Prioritaskan pembacaan dialog/quest dari OCR, interaksi NPC yang relevan, manajemen stamina/HP, dan eksplorasi terstruktur.',
  Survival: 'Pantau indikator lapar, kesehatan, dan bahaya lingkungan. Prioritaskan pengumpulan resource dasar dan perlindungan diri.',
  Simulation: 'Optimalkan rutinitas harian, manajemen energi/waktu, serta interaksi objek atau toko secara berurutan.',
  Strategy: 'Evaluasi ekonomi resource, status unit/koloni, dan prioritaskan keputusan jangka menengah dibanding aksi mikro berisiko.',
  Racing: 'Fokus pada kecepatan, posisi lintasan, dan koreksi arah halus dengan durasi input singkat.',
  Platformer: 'Perhatikan timing lompatan, posisi hazard, dan progres ke checkpoint berikutnya.',
  Universal: 'Analisis kondisi layar secara umum, utamakan observasi aman ketika state tidak pasti, dan rencanakan langkah kecil yang terukur.',
};

export function buildSystemPrompt(genre: GameGenreTemplate): string {
  return [
    'Anda adalah AI Brain Engine untuk Overthinker-Ngegame (asisten gaming single-player dengan pengawasan manusia).',
    `Genre aktif: ${genre}. Panduan: ${GENRE_GUIDELINES[genre]}`,
    `Tindakan yang diizinkan HANYA: ${ALLOWED_AI_ACTIONS.join(', ')}.`,
    'ATURAN KETAT:',
    '1. Jangan pernah mengusulkan tindakan di luar daftar tindakan yang diizinkan.',
    '2. Untuk aksi MOVE_DIRECTION, WAJIB isi parameters dengan {"direction":"right"|"left"|"up"|"down"} dan durationMs antara 150-600.',
    '3. Output WAJIB berupa JSON valid dengan struktur:',
    '{"gameStateSummary":"...","strategyPlan":"...","reasoning":"...","confidence":0.0-1.0,"actions":[{"actionType":"...","target":"...","parameters":{},"durationMs":300,"confidence":0.0-1.0,"rationale":"..."}]}',
    '4. Semua rencana tindakan hanya berstatus planned_only (tidak dieksekusi langsung).',
  ].join('\n');
}

export function buildUserPrompt(
  request: AIBrainThinkRequest,
  recentMemory: string[],
): string {
  const memoryBlock =
    recentMemory.length > 0
      ? `Memori Sesi Terbaru:\n${recentMemory.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : 'Memori Sesi Terbaru: (belum ada)';

  return [
    `Game: ${request.gameTitle ?? request.visionState.windowTitle}`,
    `Objektif Saat Ini: ${request.objective ?? 'Observasi dan lanjutkan gameplay dengan aman'}`,
    `State Vision: scene=${request.visionState.sceneLabel}, motion=${request.visionState.motionScore}, brightness=${request.visionState.brightness}`,
    `OCR Text: ${request.visionState.ocrText || '(kosong)'}`,
    `HUD Summary: ${(request.visionState.hudSummary ?? []).join(' | ') || '(tidak ada)'}`,
    memoryBlock,
  ].join('\n');
}
