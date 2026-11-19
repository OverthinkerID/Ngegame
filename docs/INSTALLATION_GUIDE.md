# Panduan Instalasi — Overthinker-Ngegame

Panduan ini mencakup instalasi untuk **pengguna akhir (Windows x64)** maupun **pengembang (Windows & macOS)**.

## 1. Instalasi Pengguna Akhir (Windows x64)

1. Unduh berkas installer `Overthinker-Ngegame-Setup-0.1.0-x64.exe` dan `SHA256SUMS.txt` dari menu **GitHub Releases** (atau dari tab **Actions → Artifact `windows-nsis-installer`**).
2. Verifikasi integritas berkas melalui PowerShell sebelum menjalankan installer:
   ```powershell
   Get-FileHash .\Overthinker-Ngegame-Setup-0.1.0-x64.exe -Algorithm SHA256
   Get-Content .\SHA256SUMS.txt
   ```
   Pastikan nilai hash cocok sebelum melanjutkan.
3. Klik dua kali berkas `.exe`, pilih folder instalasi pada wizard NSIS, dan selesaikan pemasangan.
4. *(Opsional untuk fitur penuh)* Pasang **OBS Studio 28+** (aktifkan WebSocket Server di port `4455`), **Steam Client**, dan **Ollama** untuk penalaran AI lokal.

> **Catatan macOS:** Target `dmg` dan `zip` sudah dikonfigurasi di `electron-builder.yml`, namun paket rilis macOS belum diverifikasi melalui pengujian installer penuh.

## 2. Instalasi Mode Pengembang (Source)

### Prasyarat
- **Node.js** `>= 20.x` (rekomendasi **22 LTS**) dan **npm** `>= 10.x`
- **Python** `>= 3.11` (`python3` di macOS/Linux, `python` di Windows)
- **Git**

### Langkah Setup (macOS / Linux)
```bash
npm ci
npm run build -w @ngegame/shared
npm run db:generate
DATABASE_URL="file:./dev.db" npm run db:push
npm run dev
```

*(Jika binary Electron belum terpasang otomatis pada versi npm tertentu, jalankan `node node_modules/electron/install.js`.)*

### Langkah Setup (Windows PowerShell)
```powershell
npm ci
npm run build -w @ngegame/shared
npm run db:generate
$env:DATABASE_URL="file:./dev.db"; npm run db:push
npm run dev
```

### Dependensi Python Worker (Opsional untuk Visi & OCR Penuh)
```bash
pip install -r apps/python-worker/requirements.txt
```

## 3. Build Installer Produksi Secara Lokal

```bash
npm install --no-save electron-builder
npm run build -w @ngegame/shared
npm run typecheck
npm run build

# Jalankan di mesin Windows untuk menghasilkan NSIS .exe di folder release/
npm run dist:win

# Jalankan di mesin macOS untuk menghasilkan DMG/ZIP di folder release/
npm run dist:mac
```
