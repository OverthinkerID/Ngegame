# Panduan Rilis &amp; Versioning — Overthinker-Ngegame

## Semantic Versioning

Proyek ini mengikuti standar **Semantic Versioning (`MAJOR.MINOR.PATCH`)**:

- `0.x.x`: Tahap pengembangan aktif dan *Initial Public Testing Pre-release* (kandidat saat ini: **`v0.1.0`**).
- `1.0.0`: Rilis stabil pertama setelah pengujian instalasi penuh di Windows selesai.

## Status Platform Distribusi

- **Windows (`nsis` x64)**: Target distribusi utama melalui GitHub Releases (`Overthinker-Ngegame-Setup-<version>-x64.exe` + `SHA256SUMS.txt`).
- **macOS (`dmg`, `zip`)**: Konfigurasi tersedia di `electron-builder.yml`, namun belum diverifikasi melalui build/instalasi rilis penuh.

## Membuat Paket Installer Windows (`.exe`) Secara Lokal

Jalankan di mesin **Windows**:

```powershell
npm ci
npm run build -w @ngegame/shared
npm run db:generate
$env:DATABASE_URL="file:./dev.db"; npm run db:push
npm run typecheck
npm run build
npm test
npm install --no-save electron-builder
npm run dist:win
```

Hasil installer akan dibuat di folder `release/` dengan format nama `Overthinker-Ngegame-Setup-<version>-x64.exe`.

## Alur Rilis Kandidat `v0.1.0` (Pre-Release)

1. Pastikan branch `main` sudah menerima merge dari `develop` dan seluruh CI (`Ubuntu Latest` &amp; `Windows Latest`) lulus.
2. Pastikan versi `0.1.0` konsisten di seluruh `package.json` workspace, `CHANGELOG.md`, dan `RELEASE.md`.
3. Buat tag versi setelah disetujui:
   ```bash
   git tag -a v0.1.0 -m "Pre-release v0.1.0"
   git push origin v0.1.0
   ```
4. Workflow `.github/workflows/release.yml` akan menjalankan `typecheck`, `build`, `npm test`, mengemas installer Windows NSIS, membuat `SHA256SUMS.txt`, dan mengunggahnya sebagai **Draft Pre-Release** di GitHub Releases untuk ditinjau sebelum dipublikasikan.
