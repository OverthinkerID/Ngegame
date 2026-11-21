import type {
  DummyActionQueueItem,
  DummyAdapterItem,
  DummyGameItem,
  DummySessionItem,
  NavItem,
} from '../types/dashboard.js';

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dasbor', description: 'Ringkasan status sistem dan kendali inti aplikasi' },
  { id: 'library', label: 'Pustaka Game', description: 'Pemindaian direktori Steam lokal dan peluncuran game' },
  { id: 'ai-control', label: 'Kendali AI', description: 'Konfigurasi penalaran AI, izin L1–L3, dan antrean aksi' },
  { id: 'vision', label: 'Monitor Visi', description: 'Pengambilan layar, deteksi jendela aktif, dan pembacaan OCR' },
  { id: 'adapters', label: 'Adaptor Game', description: 'Registri profil genre dan aturan aksi per game' },
  { id: 'adaptation-studio', label: 'Adaptation Studio', description: 'Profil game, kalibrasi 11 langkah, AI Game Brain, & diagnostik 12-tahap' },
  { id: 'streaming', label: 'Studio Siaran', description: 'Koneksi OBS WebSocket v5 dan multistream YouTube / Twitch' },
  { id: 'stream-intelligence', label: 'AI Stream Intelligence', description: 'Event gameplay real-time, komentar AI, suara, chat, scene OBS, highlight, & ringkasan sesi' },
  { id: 'voice', label: 'Studio Suara AI', description: 'Sintesis suara komentar Bahasa Indonesia via VoxCPM 2.0' },
  { id: 'analytics', label: 'Analitik', description: 'Statistik performa AI, siaran, dan ekspor laporan' },
  { id: 'history', label: 'Riwayat Sesi', description: 'Arsip aktivitas sesi, pencarian log SQLite, dan ekspor' },
  { id: 'system-monitor', label: 'Monitor Sistem', description: 'Kesehatan CPU, GPU, RAM, basis data, worker, dan backend' },
  { id: 'settings', label: 'Pengaturan', description: 'Tema tampilan, konfigurasi layanan, keamanan, dan tentang aplikasi' },
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
];

export const DUMMY_ACTION_QUEUE: DummyActionQueueItem[] = [];
export const DUMMY_ADAPTERS: DummyAdapterItem[] = [];
export const DUMMY_SESSIONS: DummySessionItem[] = [];
