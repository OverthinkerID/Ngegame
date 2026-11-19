# Panduan Rilis & Versioning — Overthinker-Ngegame

## Semantic Versioning

Proyek ini mengikuti standar **Semantic Versioning (`MAJOR.MINOR.PATCH`)**:

- `0.x.x`: Tahap pengembangan aktif dan pengujian fitur (saat ini `0.1.0`).
- `1.0.0`: Rilis stabil pertama setelah pengujian penuh di Windows dan macOS selesai.

## Membuat Paket Installer Windows (`.exe`)

Konfigurasi packaging tersedia di `electron-builder.yml` dengan target **NSIS (`x64`)**.

Jalankan di mesin **Windows**:

```powershell
npm install
npm run db:generate
npm run build
npm install -D electron-builder
npm run dist:win
```

Hasil installer akan dibuat di folder `release/` dengan format nama `Overthinker-Ngegame-Setup-<version>-x64.exe`.

## Checklist Rilis GitHub Releases

1. Pastikan branch `main` bersih dan seluruh pemeriksaan CI (`typecheck`, `build`, `test`) lulus.
2. Perbarui versi di `package.json` (root dan workspace terkait) serta catat perubahan di `CHANGELOG.md`.
3. Buat tag versi:
   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0"
   git push origin v0.1.0
   ```
4. Unggah installer `.exe` dan catatan rilis ke GitHub Releases (atau jalankan workflow `.github/workflows/release.yml` secara manual).
