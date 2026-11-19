# Arsitektur Sistem — Overthinker-Ngegame

**Overthinker-Ngegame** menggunakan arsitektur monorepo modular berbasis TypeScript dengan pemisahan ketat antara antarmuka desktop, layanan backend, worker Python, dan paket kontrak tipe bersama.

## Struktur Monorepo

```text
Overthinker-Ngegame/
├── apps/
│   ├── backend/          # Express REST API, WebSocket (/ws), Prisma SQLite, Security & Services
│   ├── desktop/          # Electron Main Process, Preload IPC bridge, embedded backend bootstrap
│   ├── python-worker/    # Subprocess Python (NDJSON stdin/stdout) untuk Vision & Game Controller
│   └── renderer/         # React + Vite + Tailwind CSS v4 (Dark/Light Studio UI)
├── packages/
│   └── shared/           # Kontrak IPC, tipe TypeScript, dan skema error bersama
├── docs/                 # Panduan pengguna, instalasi, dan pembuatan adaptor game
└── .github/workflows/    # GitHub Actions CI & Release workflows
```

## Alur Komunikasi Antar Proses

1. **Renderer (`@ngegame/renderer`)**: Berkomunikasi melalui `window.ngegameAPI` (`contextBridge` di `preload.ts`) ketika berjalan di Electron, atau melalui HTTP/WebSocket lokal saat mode browser dev.
2. **Electron Main (`@ngegame/desktop`)**: Mendaftarkan handler IPC (`ipcMain.handle`) dan meneruskannya ke backend `http://localhost:47800`. Pada build produksi (`app.isPackaged`), Electron otomatis menjalankan backend tertanam melalui `utilityProcess.fork`.
3. **Backend (`@ngegame/backend`)**:
   - Menyediakan endpoint REST (`/api/health`, `/api/steam/*`, `/api/vision/*`, `/api/ai/*`, `/api/controller/*`, `/api/adapters/*`, `/api/supervision/*`, `/api/voice/*`, `/api/streaming/*`, `/api/analytics/*`, `/api/system/*`) dan WebSocket (`/ws`).
   - Menyimpan state operasional dan audit log ke **SQLite** via **Prisma**.
   - Menyimpan rahasia stream key secara aman di **Windows Credential Manager** / **macOS Keychain** (dengan cadangan terenkripsi AES-256-GCM) melalui `StreamCredentialStore`.
4. **Python Worker (`apps/python-worker`)**: Berjalan terisolasi dengan protokol **NDJSON** (`stdin`/`stdout`), menangani tangkapan layar lintas platform (`mss` / `screencapture` fallback), analisis OpenCV/OCR, serta eksekusi kontroler game yang dibatasi allowlist dan durasi aman.
