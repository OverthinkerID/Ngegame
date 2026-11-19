# Overthinker-Ngegame

Aplikasi desktop AI gaming streamer dan control center untuk **Windows** dan **macOS**, dibangun menggunakan **Electron**, **React**, **TypeScript**, **Node.js**, **Python**, **SQLite**, dan **Prisma**.

Versi pengembangan saat ini: **`0.1.0`** (Fase 1–12 & Redesign UI/UX selesai; bersiap untuk **Fase 12A** pengujian penuh di Windows).

## Fitur Utama

- **Desktop Control Center (Dark & Light Mode)**: Antarmuka React + Vite + Tailwind CSS v4 dengan CSS variables, navigasi sidebar responsif, dropdown kustom bertema aplikasi, dan global status bar.
- **Steam Manager**: Pemindaian library Steam lokal (`appmanifest_*.acf`), pengecekan kompatibilitas, dan peluncuran/penghentian game aman.
- **Game Capture & Vision Engine**: Pengambilan layar lintas platform (macOS/Windows) + analisis OpenCV/OCR melalui Python Worker NDJSON.
- **AI Brain & Human Supervision**: Dukungan Ollama lokal & OpenAI cloud dengan tingkat izin **L1/L2/L3**, antrean persetujuan, pengambilalihan kontrol manusia, dan **Emergency Stop**.
- **AI Voice Studio (VoxCPM 2.0)**: Sintesis suara narator Bahasa Indonesia non-blocking dengan fallback lokal.
- **OBS Studio & Multistream**: Koneksi OBS WebSocket v5, pratinjau adegan, mixer audio, serta penyimpanan kunci siaran YouTube & Twitch aman di Windows Credential Manager / macOS Keychain.
- **Analitik & Sistem**: Pemantauan CPU/RAM/GPU, auto-throttling, ekspor CSV/JSON, serta backup & crash recovery.

## Dokumentasi Lengkap

- [Arsitektur Sistem](ARCHITECTURE.md)
- [Panduan Pengembangan Lokal](DEVELOPMENT.md)
- [Panduan Kontribusi & Branching](CONTRIBUTING.md)
- [Panduan Rilis & Installer Windows](RELEASE.md)
- [Changelog](CHANGELOG.md)
- [Panduan Pengguna](docs/USER_GUIDE.md)
- [Panduan Instalasi](docs/INSTALLATION_GUIDE.md)
- [Membuat Game Adapter Baru](docs/CREATING_GAME_ADAPTER.md)

## Memulai Cepat

```bash
npm install
npm run db:generate
DATABASE_URL="file:./dev.db" npm run db:push
npm run build -w @ngegame/shared
npm run dev
```

## Verifikasi

```bash
npm run typecheck
npm run build
npm test
```
