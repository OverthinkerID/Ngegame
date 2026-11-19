import type {
  DummyActionQueueItem,
  DummyAdapterItem,
  DummyGameItem,
  DummySessionItem,
  NavItem,
} from '../types/dashboard.js';

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dasbor', description: 'Ringkasan status sistem dan kontrol inti aplikasi' },
  { id: 'library', label: 'Pustaka Steam', description: 'Pemindaian direktori Steam lokal dan peluncuran game' },
  { id: 'ai-control', label: 'Kendali AI', description: 'Konfigurasi penalaran AI, izin L1–L3, dan antrean aksi' },
  { id: 'vision', label: 'Monitor Visi', description: 'Pengambilan layar, deteksi jendela aktif, dan pembacaan OCR' },
  { id: 'adapters', label: 'Adaptor Game', description: 'Registri profil genre dan aturan aksi per game' },
  { id: 'streaming', label: 'Siaran OBS', description: 'Koneksi OBS WebSocket v5 dan multistream YouTube / Twitch' },
  { id: 'voice', label: 'Studio Suara', description: 'Sintesis suara komentar Bahasa Indonesia via VoxCPM 2.0' },
  { id: 'history', label: 'Riwayat Sesi', description: 'Arsip sesi bermain dan log sistem SQLite' },
  { id: 'analytics', label: 'Analitik', description: 'Pemantauan CPU, RAM, latensi AI, dan ekspor metrik' },
  { id: 'settings', label: 'Pengaturan', description: 'Tema tampilan, identitas aplikasi, dan detail runtime' },
];

export const DUMMY_GAMES: DummyGameItem[] = [
  {
    id: 'game-1',
    steamAppId: 413150,
    title: 'Stardew Valley',
    genre: 'Simulation / RPG',
    compatibility: 'verified',
    adapterName: 'Simulation Adapter',
    lastPlayed: '2 jam lalu',
  },
  {
    id: 'game-2',
    steamAppId: 105600,
    title: 'Terraria',
    genre: 'Survival / Platformer',
    compatibility: 'verified',
    adapterName: 'Survival Adapter',
    lastPlayed: 'Kemarin',
  },
  {
    id: 'game-3',
    steamAppId: 294100,
    title: 'RimWorld',
    genre: 'Strategy',
    compatibility: 'experimental',
    adapterName: 'Strategy Adapter',
    lastPlayed: '3 hari lalu',
  },
  {
    id: 'game-4',
    steamAppId: 646570,
    title: 'Slay the Spire',
    genre: 'Strategy / Card',
    compatibility: 'verified',
    adapterName: 'Universal Adapter',
    lastPlayed: '1 minggu lalu',
  },
];

export const DUMMY_ACTION_QUEUE: DummyActionQueueItem[] = [
  {
    id: 'act-101',
    action: 'MOVE_TO_WAYPOINT',
    target: 'Pelican Town Square',
    confidence: 0.94,
    permissionLevel: 'L1',
    status: 'approved',
    timestamp: '15:52:10',
  },
  {
    id: 'act-102',
    action: 'INTERACT_NPC',
    target: 'Pierre General Store',
    confidence: 0.87,
    permissionLevel: 'L2',
    status: 'pending',
    timestamp: '15:52:24',
  },
  {
    id: 'act-103',
    action: 'PURCHASE_SEEDS',
    target: 'Cauliflower Seeds x10',
    confidence: 0.79,
    permissionLevel: 'L2',
    status: 'pending',
    timestamp: '15:52:31',
  },
];

export const DUMMY_ADAPTERS: DummyAdapterItem[] = [
  { id: 'ad-fps', name: 'Adaptor FPS', genre: 'FPS', status: 'planned', objectivesCount: 6, description: 'Pelacakan bidikan, pembacaan amunisi HUD, dan navigasi taktis.' },
  { id: 'ad-rpg', name: 'Adaptor RPG', genre: 'RPG', status: 'planned', objectivesCount: 8, description: 'Pembacaan daftar misi OCR, pilihan dialog, dan aturan inventaris.' },
  { id: 'ad-surv', name: 'Adaptor Survival', genre: 'Survival', status: 'planned', objectivesCount: 7, description: 'Pemantauan bar kesehatan/lapar dan pengumpulan sumber daya.' },
  { id: 'ad-sim', name: 'Adaptor Simulasi', genre: 'Simulation', status: 'ready', objectivesCount: 5, description: 'Pengelolaan rutinitas harian dan interaksi objek sekitar.' },
  { id: 'ad-strat', name: 'Adaptor Strategi', genre: 'Strategy', status: 'planned', objectivesCount: 9, description: 'Pemantauan peta mini, ekonomi sumber daya, dan antrean unit.' },
  { id: 'ad-race', name: 'Adaptor Balap', genre: 'Racing', status: 'planned', objectivesCount: 4, description: 'Pembacaan speedometer OCR, batas lintasan, dan bantu kemudi.' },
  { id: 'ad-plat', name: 'Adaptor Platformer', genre: 'Platformer', status: 'planned', objectivesCount: 5, description: 'Pengaturan waktu lompat, deteksi rintangan, dan titik simpan.' },
  { id: 'ad-univ', name: 'Adaptor Universal', genre: 'Universal', status: 'ready', objectivesCount: 3, description: 'Profil cadangan aman untuk game tanpa adaptor khusus.' },
];

export const DUMMY_SESSIONS: DummySessionItem[] = [
  {
    id: 'ses-01',
    gameTitle: 'Stardew Valley',
    duration: '01:42:18',
    aiActions: 312,
    streamPlatform: 'YouTube + Twitch',
    status: 'completed',
    date: '2026-11-18 20:15',
  },
  {
    id: 'ses-02',
    gameTitle: 'Slay the Spire',
    duration: '00:54:05',
    aiActions: 128,
    streamPlatform: 'YouTube Private',
    status: 'completed',
    date: '2026-11-17 21:00',
  },
  {
    id: 'ses-03',
    gameTitle: 'Terraria',
    duration: '00:23:41',
    aiActions: 64,
    streamPlatform: 'Uji Lokal',
    status: 'aborted',
    date: '2026-11-16 19:30',
  },
];
