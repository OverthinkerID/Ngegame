<div align="center">
  <img src="apps/desktop/assets/icon.svg" alt="Overthinker-Ngegame Logo" width="64" />
  <h1>Panduan Pengembangan Lokal — Overthinker-Ngegame</h1>
  <p><a href="README.md">&larr; Kembali ke README</a> &bull; <a href="CONTRIBUTING.md">Panduan Kontribusi</a> &bull; <a href="docs/WINDOWS_GEMINI_CLI_GUIDE.md">Panduan Windows + Gemini CLI</a></p>
</div>

## Prasyarat Sistem

- **Node.js** `>= 20.x` (disarankan **22 LTS**) dan **npm** `>= 10.x`
- **Python** `>= 3.11` (`python3` di macOS/Linux, `python` di Windows)
- **Git**

## Setup Awal

### macOS / Linux
```bash
npm ci
# Jika binary Electron belum terpasang otomatis:
node node_modules/electron/install.js

npm run build -w @ngegame/shared
npm run db:generate
DATABASE_URL="file:./dev.db" npm run db:push
npm run dev
```

### Windows (PowerShell)
```powershell
npm ci
npm run build -w @ngegame/shared
npm run db:generate
$env:DATABASE_URL="file:./dev.db"; npm run db:push
npm run dev
```

## Konfigurasi Environment Lokal

Buat berkas konfigurasi environment lokal di root proyek (pastikan tidak pernah di-commit ke Git):

```ini
NODE_ENV=development
LOG_LEVEL=info
BACKEND_HOST=localhost
BACKEND_PORT=47800
RENDERER_PORT=5173
DATABASE_URL="file:./dev.db"
PYTHON_BIN=python3
PYTHON_WORKER_TIMEOUT_MS=5000
OLLAMA_BASE_URL=http://localhost:11434
VOXCPM_BASE_URL=http://localhost:8000
OBS_WEBSOCKET_URL=ws://localhost:4455
```

## Layanan Eksternal Opsional

| Layanan | Alamat Default | Kegunaan |
| :--- | :--- | :--- |
| **Ollama** | `http://localhost:11434` | Penalaran AI lokal tanpa biaya API cloud. |
| **VoxCPM 2.0** | `http://localhost:8000` | Sintesis suara narator Bahasa Indonesia. |
| **OBS Studio** | `ws://localhost:4455` | Kendali adegan dan siaran melalui OBS WebSocket v5. |
| **Python Vision** | `apps/python-worker/requirements.txt` | Akselerasi `mss`, OpenCV, Tesseract OCR, dan Pillow. |

## Pemeriksaan Tipe, Build, & Pengujian

Selalu jalankan rangkaian verifikasi berikut sebelum melakukan commit:

```bash
npm run typecheck
npm run build
npm test
```

> **Catatan CI:** Pengujian backend (`@ngegame/backend`) dijalankan dengan `--test-concurrency=1` dan SQLite `WAL` + `PRAGMA busy_timeout = 5000` agar konsisten di Ubuntu dan Windows.
