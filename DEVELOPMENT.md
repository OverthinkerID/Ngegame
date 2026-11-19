# Panduan Pengembangan Lokal — Overthinker-Ngegame

## Prasyarat Sistem

- **Node.js** `>= 20.x` dan **npm** `>= 10.x`
- **Python** `>= 3.9` (`python3` di macOS/Linux, `python` di Windows)
- **Git**

## Instalasi & Menjalankan di macOS

```bash
npm install
# Jika binary Electron belum terpasang pada npm v12+:
node node_modules/electron/install.js

npm run db:generate
DATABASE_URL="file:./dev.db" npm run db:push
npm run build -w @ngegame/shared
npm run dev
```

## Instalasi & Menjalankan di Windows (PowerShell)

```powershell
npm install
npm run db:generate
$env:DATABASE_URL="file:./dev.db"; npm run db:push
npm run build -w @ngegame/shared
npm run dev
```

## Referensi Environment Variables (`.env`)

Buat file `.env` secara lokal (jangan pernah di-commit ke Git):

```env
NODE_ENV=development
LOG_LEVEL=info
BACKEND_HOST=127.0.0.1
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

- **Ollama**: `http://localhost:11434` untuk penalaran AI lokal.
- **VoxCPM 2.0**: `http://localhost:8000` untuk sintesis suara Bahasa Indonesia.
- **OBS Studio (WebSocket v5)**: `ws://localhost:4455` untuk kontrol adegan dan multistream.
- **Python Vision Dependencies**: Pasang `apps/python-worker/requirements.txt` (`mss`, `opencv-python`, `pytesseract`, `Pillow`) untuk akselerasi tangkapan layar dan OCR.

## Perintah Verifikasi

```bash
npm run typecheck
npm run build
npm test
```
