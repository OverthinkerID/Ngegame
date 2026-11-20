import type { GameProfile, StardewCapabilityLevel } from '@ngegame/shared';

export const STARDEW_CAPABILITY_LEVELS: Record<
  StardewCapabilityLevel,
  { title: string; capabilities: string[]; smapiNote?: string }
> = {
  1: {
    title: 'Level 1 — Screen Recognition',
    capabilities: [
      'Mengenali title screen, gameplay, pause menu, inventory, dan dialog',
      'Mengekstrak teks HUD dasar dan skor kepercayaan observasi',
    ],
  },
  2: {
    title: 'Level 2 — Basic Movement',
    capabilities: [
      'Bergerak 4 arah (W/A/S/D) dengan durasi tekan aman',
      'Berhenti dan melepas seluruh tombol tanpa input macet',
    ],
  },
  3: {
    title: 'Level 3 — Object Interaction',
    capabilities: [
      'Mendeteksi objek terdekat yang dapat berinteraksi',
      'Melakukan interaksi aman (E / klik kanan) dengan verifikasi fokus',
    ],
  },
  4: {
    title: 'Level 4 — Farming',
    capabilities: [
      'Mengenali petak kebun dan tanaman yang membutuhkan air atau siap panen',
      'Menyiram, menanam, dan memanen secara tersupervisi',
    ],
  },
  5: {
    title: 'Level 5 — Inventory & Tools',
    capabilities: [
      'Memilih alat pada toolbar (slot 1–5)',
      'Membuka inventory dan menyimpan hasil panen ke peti',
    ],
  },
  6: {
    title: 'Level 6 — Daily Planning',
    capabilities: [
      'Membaca jam dalam game dan memantau persentase energi karakter',
      'Berhenti otomatis saat energi hampir habis atau mendekati tengah malam',
    ],
  },
  7: {
    title: 'Level 7 — Advanced Gameplay & Optional SMAPI',
    capabilities: [
      'Menjalankan tugas harian multi-langkah dengan persetujuan semi-otomatis',
    ],
    smapiNote:
      'Opsional masa depan: integrasi SMAPI read-only dapat dipertimbangkan setelah seluruh 7 level stabil, tanpa injeksi kode atau modifikasi save pengguna.',
  },
};

export const STARDEW_VALLEY_PROFILE: GameProfile = {
  gameId: 'stardew-valley',
  gameName: 'Stardew Valley',
  platform: 'all',
  executablePath: null,
  installationPath: null,
  genre: 'Simulation',
  cameraPerspective: 'top_down',
  gameEngine: 'MonoGame / XNA',
  resolution: { width: 1280, height: 720 },
  controlScheme: 'keyboard_mouse',
  inputMapping: [
    {
      actionType: 'MOVE_DIRECTION',
      keyboard: 'w/a/s/d',
      holdDurationMs: 300,
      cooldownMs: 120,
      requiresFocus: true,
      notes: 'Gerak 4 arah karakter di peta',
    },
    {
      actionType: 'INTERACT',
      keyboard: 'e',
      mouse: 'right_click',
      holdDurationMs: 150,
      cooldownMs: 250,
      requiresFocus: true,
      notes: 'Buka inventori / interaksi objek',
    },
    {
      actionType: 'USE_ITEM',
      keyboard: '1-5',
      mouse: 'left_click',
      holdDurationMs: 180,
      cooldownMs: 300,
      requiresFocus: true,
      notes: 'Pilih alat toolbar & gunakan di petak kebun',
    },
    {
      actionType: 'SELECT_OPTION',
      keyboard: 'enter',
      holdDurationMs: 120,
      cooldownMs: 250,
      requiresFocus: true,
      notes: 'Konfirmasi dialog atau menu',
    },
    {
      actionType: 'PAUSE_MENU',
      keyboard: 'escape',
      holdDurationMs: 120,
      cooldownMs: 500,
      requiresFocus: true,
      notes: 'Buka atau tutup menu jeda',
    },
  ],
  visionProfile: {
    targetIntervalMs: 900,
    motionThreshold: 0.05,
    enableOcr: true,
    screenStates: ['title_screen', 'gameplay', 'pause_menu', 'inventory', 'dialogue'],
    objectDetectors: ['crops', 'farm_tiles', 'water_source', 'shipping_bin', 'npc'],
  },
  uiProfile: {
    regions: [
      {
        id: 'clock_day_gold',
        label: 'Jam, Hari & Emas',
        xPercent: 80,
        yPercent: 2,
        widthPercent: 18,
        heightPercent: 22,
        purpose: 'clock',
      },
      {
        id: 'energy_health_bar',
        label: 'Bar Energi & Kesehatan',
        xPercent: 93,
        yPercent: 72,
        widthPercent: 5,
        heightPercent: 24,
        purpose: 'hud_bar',
      },
      {
        id: 'toolbar_hotbar',
        label: 'Toolbar Alat (1-5)',
        xPercent: 25,
        yPercent: 88,
        widthPercent: 50,
        heightPercent: 10,
        purpose: 'inventory',
      },
      {
        id: 'dialogue_box',
        label: 'Kotak Dialog',
        xPercent: 15,
        yPercent: 68,
        widthPercent: 70,
        heightPercent: 26,
        purpose: 'dialog',
      },
    ],
  },
  mechanicsProfile: {
    enabledMechanics: [
      'movement',
      'navigation',
      'interaction',
      'inventory',
      'resource_management',
      'dialogue',
      'time_management',
    ],
  },
  objectiveProfile: {
    primaryGoal: 'Kelola kebun secara aman di bawah pengawasan manusia',
    dailyTasks: [
      'Periksa jam dan bar energi sebelum beraktivitas',
      'Siram petak tanaman yang kering di pagi hari',
      'Kembali ke rumah sebelum pukul 00:00',
    ],
  },
  difficultyProfile: {
    level: 'casual',
    maxActionsPerMinute: 24,
  },
  aiStrategy: {
    preferredProvider: 'ollama',
    rules: [
      'Selalu verifikasi layar berada pada state gameplay sebelum mengirim gerak.',
      'Jangan pernah menahan tombol gerak lebih dari maxHoldDurationMs.',
      'Jika confidence < minConfidence, ajukan ke antrean persetujuan atau pilih OBSERVE_ONLY.',
    ],
    recoveryOnFailure: 'Lepas semua tombol, ambil ulang screenshot, dan tunggu konfirmasi supervisor.',
  },
  memoryConfiguration: {
    shortTermLimit: 20,
    longTermEnabled: true,
    trackFailedActions: true,
  },
  safetyConfiguration: {
    minConfidence: 0.78,
    requireFocus: true,
    maxHoldDurationMs: 1200,
    allowAutoExecute: false,
    dryRunByDefault: true,
  },
  adapterType: 'stardew_valley',
  profileVersion: 1,
  isBuiltin: true,
  stardewLevel: 1,
  calibrationStatus: {
    completedSteps: [],
    lastCalibratedAt: null,
  },
};

export const UNIVERSAL_GAME_PROFILE: GameProfile = {
  gameId: 'universal-default',
  gameName: 'Universal Game Profile',
  platform: 'all',
  executablePath: null,
  installationPath: null,
  genre: 'Universal',
  cameraPerspective: 'third_person',
  gameEngine: 'Generic',
  resolution: { width: 1280, height: 720 },
  controlScheme: 'keyboard_mouse',
  inputMapping: [
    {
      actionType: 'MOVE_DIRECTION',
      keyboard: 'w/a/s/d',
      holdDurationMs: 250,
      cooldownMs: 200,
      requiresFocus: true,
    },
    {
      actionType: 'INTERACT',
      keyboard: 'e',
      holdDurationMs: 150,
      cooldownMs: 300,
      requiresFocus: true,
    },
    {
      actionType: 'PAUSE_MENU',
      keyboard: 'escape',
      holdDurationMs: 120,
      cooldownMs: 500,
      requiresFocus: true,
    },
  ],
  visionProfile: {
    targetIntervalMs: 1000,
    motionThreshold: 0.05,
    enableOcr: true,
    screenStates: ['title_screen', 'gameplay', 'pause_menu'],
    objectDetectors: ['hud', 'text'],
  },
  uiProfile: {
    regions: [
      {
        id: 'primary_viewport',
        label: 'Layar Utama',
        xPercent: 0,
        yPercent: 0,
        widthPercent: 100,
        heightPercent: 100,
        purpose: 'viewport',
      },
    ],
  },
  mechanicsProfile: {
    enabledMechanics: ['movement', 'interaction'],
  },
  objectiveProfile: {
    primaryGoal: 'Observasi aman dan aksi dasar tersupervisi',
    dailyTasks: ['Amati state layar dan pastikan jendela game fokus'],
  },
  difficultyProfile: {
    level: 'casual',
    maxActionsPerMinute: 15,
  },
  aiStrategy: {
    preferredProvider: 'ollama',
    rules: ['Utamakan OBSERVE_ONLY saat scene tidak dikenali.'],
    recoveryOnFailure: 'Hentikan input dan minta tinjauan supervisor.',
  },
  memoryConfiguration: {
    shortTermLimit: 15,
    longTermEnabled: true,
    trackFailedActions: true,
  },
  safetyConfiguration: {
    minConfidence: 0.85,
    requireFocus: true,
    maxHoldDurationMs: 800,
    allowAutoExecute: false,
    dryRunByDefault: true,
  },
  adapterType: 'universal',
  profileVersion: 1,
  isBuiltin: true,
  calibrationStatus: {
    completedSteps: [],
    lastCalibratedAt: null,
  },
};

export const BUILTIN_GAME_PROFILES: GameProfile[] = [
  STARDEW_VALLEY_PROFILE,
  UNIVERSAL_GAME_PROFILE,
];
