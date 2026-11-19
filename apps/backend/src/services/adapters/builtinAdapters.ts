import type { GameAdapterDefinition } from '@ngegame/shared';

export const UNIVERSAL_ADAPTER: GameAdapterDefinition = {
  metadata: {
    id: 'universal-adapter',
    name: 'Universal Fallback Adapter',
    version: '1.0.0',
    author: 'Overthinker-Ngegame',
    genre: 'Universal',
    description: 'Adapter fallback untuk game tanpa profil khusus.',
  },
  gameIdentification: {
    steamAppIds: [],
    windowTitlePatterns: ['*'],
  },
  controlMapping: [
    { actionType: 'MOVE_DIRECTION', key: 'w/a/s/d', defaultDurationMs: 300, notes: 'Gerak dasar 4 arah' },
    { actionType: 'INTERACT', key: 'e', defaultDurationMs: 150, notes: 'Interaksi objek umum' },
    { actionType: 'PAUSE_MENU', key: 'escape', defaultDurationMs: 120, notes: 'Buka menu jeda' },
  ],
  screenLayout: [
    { name: 'primary_viewport', xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100, purpose: 'viewport' },
  ],
  objectiveDefinition: [
    { id: 'univ-obs', title: 'Observasi Aman', priority: 'high', description: 'Pantau state layar dan hindari input berisiko.' },
  ],
  actionLibrary: ['OBSERVE_ONLY', 'WAIT', 'MOVE_DIRECTION', 'INTERACT', 'PAUSE_MENU'],
  strategyRules: [
    'Gunakan OBSERVE_ONLY jika scene belum dikenali.',
    'Batasi durasi input <= 500ms saat eksplorasi awal.',
  ],
  visionConfig: { targetIntervalMs: 1000, motionThreshold: 0.05, enableOcr: true },
  compatibilityStatus: 'verified',
};

export const GENRE_BASE_ADAPTERS: GameAdapterDefinition[] = [
  {
    metadata: {
      id: 'genre-fps',
      name: 'FPS Genre Adapter',
      version: '1.0.0',
      author: 'Overthinker-Ngegame',
      genre: 'FPS',
      description: 'Template adapter untuk game First-Person Shooter single-player.',
    },
    gameIdentification: { steamAppIds: [], windowTitlePatterns: [] },
    controlMapping: [
      { actionType: 'MOVE_DIRECTION', key: 'w/a/s/d', defaultDurationMs: 250, notes: 'Strafe dan gerak taktis' },
      { actionType: 'LOOK_AT', key: 'mouse', defaultDurationMs: 150, notes: 'Arahkan pandangan' },
      { actionType: 'USE_ITEM', key: '1', defaultDurationMs: 120, notes: 'Pilih senjata/item' },
    ],
    screenLayout: [
      { name: 'health_ammo_hud', xPercent: 2, yPercent: 85, widthPercent: 25, heightPercent: 12, purpose: 'hud_bar' },
      { name: 'minimap', xPercent: 2, yPercent: 2, widthPercent: 18, heightPercent: 18, purpose: 'minimap' },
    ],
    objectiveDefinition: [
      { id: 'fps-survive', title: 'Pertahankan HP & Amunisi', priority: 'high', description: 'Pantau bar HP dan reload saat aman.' },
    ],
    actionLibrary: ['OBSERVE_ONLY', 'MOVE_DIRECTION', 'LOOK_AT', 'USE_ITEM', 'PAUSE_MENU'],
    strategyRules: ['Utamakan posisi berlindung saat HP di bawah 40%.'],
    visionConfig: { targetIntervalMs: 500, motionThreshold: 0.1, enableOcr: true },
    compatibilityStatus: 'planned',
  },
  {
    metadata: {
      id: 'genre-rpg',
      name: 'RPG Genre Adapter',
      version: '1.0.0',
      author: 'Overthinker-Ngegame',
      genre: 'RPG',
      description: 'Template adapter untuk Role-Playing Game dengan fokus dialog dan quest.',
    },
    gameIdentification: { steamAppIds: [], windowTitlePatterns: [] },
    controlMapping: [
      { actionType: 'INTERACT', key: 'e', defaultDurationMs: 150, notes: 'Bicara NPC / buka peti' },
      { actionType: 'SELECT_OPTION', key: 'enter', defaultDurationMs: 120, notes: 'Pilih opsi dialog' },
      { actionType: 'MOVE_DIRECTION', key: 'w/a/s/d', defaultDurationMs: 350, notes: 'Eksplorasi area' },
    ],
    screenLayout: [
      { name: 'dialog_box', xPercent: 10, yPercent: 70, widthPercent: 80, heightPercent: 25, purpose: 'ocr' },
      { name: 'quest_tracker', xPercent: 75, yPercent: 10, widthPercent: 22, heightPercent: 25, purpose: 'ocr' },
    ],
    objectiveDefinition: [
      { id: 'rpg-quest', title: 'Ikuti Quest Utama', priority: 'high', description: 'Baca teks dialog/quest melalui OCR sebelum memilih aksi.' },
    ],
    actionLibrary: ['OBSERVE_ONLY', 'WAIT', 'MOVE_DIRECTION', 'INTERACT', 'SELECT_OPTION', 'USE_ITEM'],
    strategyRules: ['Selalu baca kotak dialog via OCR sebelum menekan SELECT_OPTION.'],
    visionConfig: { targetIntervalMs: 800, motionThreshold: 0.04, enableOcr: true },
    compatibilityStatus: 'planned',
  },
  {
    metadata: {
      id: 'genre-survival',
      name: 'Survival Genre Adapter',
      version: '1.0.0',
      author: 'Overthinker-Ngegame',
      genre: 'Survival',
      description: 'Template adapter untuk game survival & crafting.',
    },
    gameIdentification: { steamAppIds: [105600], windowTitlePatterns: ['Terraria'] },
    controlMapping: [
      { actionType: 'MOVE_DIRECTION', key: 'w/a/s/d', defaultDurationMs: 300, notes: 'Navigasi bioma' },
      { actionType: 'USE_ITEM', key: '1-5', defaultDurationMs: 180, notes: 'Gunakan alat/senjata hotbar' },
      { actionType: 'INTERACT', key: 'e', defaultDurationMs: 150, notes: 'Crafting / ambil item' },
    ],
    screenLayout: [
      { name: 'vitals_hud', xPercent: 78, yPercent: 2, widthPercent: 20, heightPercent: 15, purpose: 'hud_bar' },
      { name: 'hotbar', xPercent: 25, yPercent: 88, widthPercent: 50, heightPercent: 10, purpose: 'inventory' },
    ],
    objectiveDefinition: [
      { id: 'surv-gather', title: 'Kumpulkan Resource Dasar', priority: 'high', description: 'Jaga kesehatan dan kumpulkan material dasar.' },
    ],
    actionLibrary: ['OBSERVE_ONLY', 'MOVE_DIRECTION', 'INTERACT', 'USE_ITEM', 'PAUSE_MENU'],
    strategyRules: ['Prioritaskan pemulihan HP/stamina saat malam hari atau kondisi kritis.'],
    visionConfig: { targetIntervalMs: 750, motionThreshold: 0.06, enableOcr: true },
    compatibilityStatus: 'experimental',
  },
  {
    metadata: {
      id: 'genre-simulation',
      name: 'Simulation Genre Adapter',
      version: '1.0.0',
      author: 'Overthinker-Ngegame',
      genre: 'Simulation',
      description: 'Template adapter untuk game simulasi manajemen & rutinitas.',
    },
    gameIdentification: { steamAppIds: [], windowTitlePatterns: [] },
    controlMapping: [
      { actionType: 'MOVE_DIRECTION', key: 'w/a/s/d', defaultDurationMs: 300, notes: 'Pindah area' },
      { actionType: 'INTERACT', key: 'e', defaultDurationMs: 150, notes: 'Interaksi objek simulasi' },
      { actionType: 'SELECT_OPTION', key: 'enter', defaultDurationMs: 120, notes: 'Konfirmasi menu' },
    ],
    screenLayout: [
      { name: 'clock_status', xPercent: 78, yPercent: 2, widthPercent: 20, heightPercent: 18, purpose: 'ocr' },
    ],
    objectiveDefinition: [
      { id: 'sim-routine', title: 'Jalankan Rutinitas Harian', priority: 'high', description: 'Kelola waktu dan energi secara efisien.' },
    ],
    actionLibrary: ['OBSERVE_ONLY', 'WAIT', 'MOVE_DIRECTION', 'INTERACT', 'SELECT_OPTION', 'USE_ITEM'],
    strategyRules: ['Hindari kehabisan energi; kembali ke base sebelum larut malam.'],
    visionConfig: { targetIntervalMs: 1000, motionThreshold: 0.04, enableOcr: true },
    compatibilityStatus: 'experimental',
  },
  {
    metadata: {
      id: 'genre-strategy',
      name: 'Strategy Genre Adapter',
      version: '1.0.0',
      author: 'Overthinker-Ngegame',
      genre: 'Strategy',
      description: 'Template adapter untuk game strategi & manajemen koloni/kartu.',
    },
    gameIdentification: { steamAppIds: [646570, 294100], windowTitlePatterns: ['Slay the Spire', 'RimWorld'] },
    controlMapping: [
      { actionType: 'SELECT_OPTION', key: 'enter', defaultDurationMs: 150, notes: 'Pilih unit/kartu' },
      { actionType: 'PAUSE_MENU', key: 'space', defaultDurationMs: 100, notes: 'Jeda taktis' },
    ],
    screenLayout: [
      { name: 'resource_bar', xPercent: 2, yPercent: 2, widthPercent: 60, heightPercent: 8, purpose: 'ocr' },
    ],
    objectiveDefinition: [
      { id: 'strat-eco', title: 'Optimasi Ekonomi & Giliran', priority: 'high', description: 'Analisis opsi sebelum konfirmasi aksi.' },
    ],
    actionLibrary: ['OBSERVE_ONLY', 'WAIT', 'SELECT_OPTION', 'PAUSE_MENU'],
    strategyRules: ['Gunakan jeda taktis saat situasi kompleks untuk memberi waktu AI Brain berpikir.'],
    visionConfig: { targetIntervalMs: 1200, motionThreshold: 0.03, enableOcr: true },
    compatibilityStatus: 'experimental',
  },
  {
    metadata: {
      id: 'genre-racing',
      name: 'Racing Genre Adapter',
      version: '1.0.0',
      author: 'Overthinker-Ngegame',
      genre: 'Racing',
      description: 'Template adapter untuk game balapan dengan koreksi arah cepat.',
    },
    gameIdentification: { steamAppIds: [], windowTitlePatterns: [] },
    controlMapping: [
      { actionType: 'MOVE_DIRECTION', key: 'w/a/s/d', defaultDurationMs: 150, notes: 'Gas, rem, dan belok singkat' },
    ],
    screenLayout: [
      { name: 'speedometer', xPercent: 78, yPercent: 78, widthPercent: 20, heightPercent: 18, purpose: 'ocr' },
    ],
    objectiveDefinition: [
      { id: 'race-track', title: 'Pertahankan Jalur Lintasan', priority: 'high', description: 'Gunakan durasi kemudi singkat agar tidak oversteer.' },
    ],
    actionLibrary: ['OBSERVE_ONLY', 'MOVE_DIRECTION', 'PAUSE_MENU'],
    strategyRules: ['Batasi durasi input belok <= 200ms.'],
    visionConfig: { targetIntervalMs: 350, motionThreshold: 0.12, enableOcr: false },
    compatibilityStatus: 'planned',
  },
  {
    metadata: {
      id: 'genre-platformer',
      name: 'Platformer Genre Adapter',
      version: '1.0.0',
      author: 'Overthinker-Ngegame',
      genre: 'Platformer',
      description: 'Template adapter untuk game platformer 2D/3D.',
    },
    gameIdentification: { steamAppIds: [], windowTitlePatterns: [] },
    controlMapping: [
      { actionType: 'MOVE_DIRECTION', key: 'a/d', defaultDurationMs: 220, notes: 'Gerak horizontal' },
      { actionType: 'INTERACT', key: 'space', defaultDurationMs: 180, notes: 'Lompat' },
    ],
    screenLayout: [
      { name: 'player_viewport', xPercent: 15, yPercent: 15, widthPercent: 70, heightPercent: 70, purpose: 'viewport' },
    ],
    objectiveDefinition: [
      { id: 'plat-check', title: 'Capai Checkpoint Berikutnya', priority: 'high', description: 'Hindari hazard dan ukur jarak lompatan.' },
    ],
    actionLibrary: ['OBSERVE_ONLY', 'MOVE_DIRECTION', 'INTERACT', 'PAUSE_MENU'],
    strategyRules: ['Berhenti sejenak sebelum platform bergerak.'],
    visionConfig: { targetIntervalMs: 450, motionThreshold: 0.09, enableOcr: false },
    compatibilityStatus: 'planned',
  },
];

export const STARDEW_VALLEY_ADAPTER: GameAdapterDefinition = {
  metadata: {
    id: 'stardew-valley-poc',
    name: 'Stardew Valley (Proof of Concept)',
    version: '1.0.0',
    author: 'Overthinker-Ngegame',
    genre: 'Simulation',
    description:
      'Adapter nyata proof-of-concept untuk game single-player Stardew Valley (Steam AppID 413150).',
  },
  gameIdentification: {
    steamAppIds: [413150],
    windowTitlePatterns: ['Stardew Valley'],
  },
  controlMapping: [
    { actionType: 'MOVE_DIRECTION', key: 'w/a/s/d', defaultDurationMs: 300, notes: 'Gerak karakter di peta' },
    { actionType: 'INTERACT', key: 'e', defaultDurationMs: 150, notes: 'Buka inventori / interaksi' },
    { actionType: 'USE_ITEM', key: '1-5', defaultDurationMs: 180, notes: 'Pilih & pakai alat dari toolbar' },
    { actionType: 'SELECT_OPTION', key: 'enter', defaultDurationMs: 120, notes: 'Konfirmasi dialog / toko' },
    { actionType: 'PAUSE_MENU', key: 'escape', defaultDurationMs: 120, notes: 'Menu jeda' },
  ],
  screenLayout: [
    { name: 'clock_day_gold', xPercent: 80, yPercent: 2, widthPercent: 18, heightPercent: 22, purpose: 'ocr' },
    { name: 'energy_health_bar', xPercent: 93, yPercent: 72, widthPercent: 5, heightPercent: 24, purpose: 'hud_bar' },
    { name: 'toolbar_hotbar', xPercent: 25, yPercent: 88, widthPercent: 50, heightPercent: 10, purpose: 'inventory' },
  ],
  objectiveDefinition: [
    { id: 'sv-water', title: 'Siram Tanaman Harian', priority: 'high', description: 'Periksa petak kebun dan siram tanaman di pagi hari.' },
    { id: 'sv-energy', title: 'Jaga Energi > 20%', priority: 'high', description: 'Hentikan aktivitas berat jika bar energi hampir habis.' },
    { id: 'sv-sleep', title: 'Kembali Tidur Sebelum 00:00', priority: 'medium', description: 'Pantau jam di pojok kanan atas agar karakter tidak pingsan.' },
  ],
  actionLibrary: [
    'OBSERVE_ONLY',
    'WAIT',
    'MOVE_DIRECTION',
    'INTERACT',
    'USE_ITEM',
    'SELECT_OPTION',
    'NAVIGATE_WAYPOINT',
    'PAUSE_MENU',
  ],
  strategyRules: [
    'Selalu cek jam dan energi di HUD sebelum memulai tugas baru.',
    'Gunakan slot hotbar 1-5 sesuai jenis pekerjaan (Watering Can, Hoe, Scythe).',
    'Saat berbicara dengan NPC atau berbelanja di Pierre, tunggu konfirmasi OCR sebelum SELECT_OPTION.',
  ],
  visionConfig: {
    targetIntervalMs: 900,
    motionThreshold: 0.05,
    enableOcr: true,
  },
  compatibilityStatus: 'verified',
};
