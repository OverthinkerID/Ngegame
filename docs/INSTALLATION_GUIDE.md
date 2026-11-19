# Panduan Instalasi & Rilis Overthinker-Ngegame

## Prasyarat Sistem

- **Node.js** >= 20.x dan **npm** >= 10.x
- **Python** >= 3.9 (`python3` di macOS, `python` di Windows)
- *(Opsional)* `pip install -r apps/python-worker/requirements.txt` untuk akselerasi `mss`, OpenCV, dan Tesseract OCR.
- *(Opsional)* **Ollama**, **VoxCPM 2.0**, dan **OBS Studio** (WebSocket v5 aktif di port `4455`).

## Instalasi & Menjalankan di macOS / Windows (Development)

```bash
npm install
npm run db:generate
DATABASE_URL="file:./dev.db" npm run db:push
npm run build -w @ngegame/shared
npm run dev
```

## Packaging Installer Produksi (Windows & macOS)

Konfigurasi installer tersedia di `electron-builder.yml`:

```bash
# Install electron-builder jika belum ada
npm install -D electron-builder

# Build installer Windows (.exe NSIS) — jalankan di mesin Windows
npm run dist:win

# Build installer macOS (.dmg / .zip) — jalankan di mesin macOS
npm run dist:mac
```
