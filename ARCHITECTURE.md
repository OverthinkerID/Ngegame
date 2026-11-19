# Arsitektur Sistem — Overthinker-Ngegame

**Overthinker-Ngegame** menggunakan arsitektur monorepo modular berbasis TypeScript dengan pemisahan ketat antara shell desktop Electron, antarmuka React, backend Node.js, database SQLite/Prisma, dan worker Python.

## Struktur Monorepo

| Workspace / Direktori | Paket | Tanggung Jawab Utama |
| :--- | :--- | :--- |
| `apps/desktop` | `@ngegame/desktop` | Main process Electron, preload `contextBridge`, penjaga navigasi/izin, IPC handler tervalidasi, dan bootstrap backend tertanam (`utilityProcess.fork`). |
| `apps/renderer` | `@ngegame/renderer` | Antarmuka React 19 + Vite + Tailwind CSS v4 (11 halaman Studio UI, Dark/Light Mode, kontrol keamanan global). |
| `apps/backend` | `@ngegame/backend` | Express REST API, WebSocket (`/ws`), Prisma ORM + SQLite (`WAL` mode), logging teredaksi, backup/restore, serta orkestrasi layanan Steam, Vision, AI, Voice, dan OBS. |
| `apps/python-worker` | `apps/python-worker` | Subprocess Python terisolasi via protokol **NDJSON** (`stdin`/`stdout`) untuk tangkapan layar lintas platform, OpenCV/OCR, dan eksekusi kontroler game ber-allowlist. |
| `packages/shared` | `@ngegame/shared` | Kontrak tipe TypeScript, definisi adapter game, dan skema error bersama. |
| `docs` | — | Dokumentasi API ([API.md](docs/API.md)), skema database ([DATABASE.md](docs/DATABASE.md)), panduan pengguna, instalasi, dan adaptor. |

## Alur Komunikasi Antar Proses

```text
[React Renderer] <--- contextBridge (window.ngegameAPI) ---> [Electron Main Process]
       |                                                               |
       +------------------ REST & WebSocket (/ws) ---------------------+
                                                                       |
                                                                       v
                                                        [Node.js Backend (:47800)]
                                                          ├── Prisma / SQLite (WAL)
                                                          ├── OS Keychain / Credential Manager
                                                          └── NDJSON IPC ---> [Python Worker]
```

## Batasan Keamanan & Stabilitas

- **Electron Sandbox & Navigation Guards**: `setWindowOpenHandler` menolak jendela eksternal tak dikenal, `will-navigate` membatasi navigasi, `setPermissionRequestHandler` memblokir izin perangkat yang tidak diperlukan, dan payload IPC divalidasi.
- **Backend Isolation**: CORS dibatasi hanya untuk `localhost`, loopback, dan `file://`, ukuran body JSON dibatasi (`2 MB`), serta header keamanan HTTP diterapkan pada seluruh respons.
- **Credential Storage**: Kunci siaran YouTube Live dan Twitch disimpan melalui **Windows Credential Manager** / **macOS Keychain** (dengan fallback terenkripsi AES-256-GCM) via `StreamCredentialStore`.
- **Graceful Shutdown**: Saat aplikasi ditutup, backend menghentikan monitor visi (`visionService.stopMonitor()`) dan melepaskan seluruh input kontroler (`controllerService.releaseAll()`).
