<div align="center">
  <img src="apps/desktop/assets/icon.svg" alt="Overthinker-Ngegame Logo" width="64" />
  <h1>Changelog — Overthinker-Ngegame</h1>
  <p><a href="README.md">&larr; Kembali ke README</a> &bull; <a href="RELEASE.md">Panduan Rilis</a></p>
</div>

Seluruh perubahan penting pada proyek **Overthinker-Ngegame** dicatat dalam berkas ini.

## [0.1.0] - 2026-11-19 (Initial Public Testing Pre-Release Candidate)

### Ditambahkan
- **Fase 1–12**: Fondasi monorepo TypeScript, Dashboard Desktop, Integrasi Steam lokal, Game Capture &amp; Vision Engine (Mac/Windows), AI Brain Engine (Ollama &amp; OpenAI fallback), Game Controller modular dengan allowlist, Sistem Adaptor Game (7 genre + Universal + Stardew Valley), Human Supervision (L1/L2/L3 + Emergency Stop), AI Voice Studio (**VoxCPM 2.0** Bahasa Indonesia), Integrasi OBS WebSocket v5 &amp; Multistream (Credential Manager), Analitik &amp; Auto-Throttling, serta Backup/Recovery dan konfigurasi `electron-builder.yml`.
- **Fase 12A &amp; 12B (Audit &amp; Hardening)**: Pembatasan CORS localhost, security headers, redaksi rahasia &amp; rotasi log, indeks Prisma SQLite + WAL/`busy_timeout`, `BackupService` dinamis via `DATABASE_URL` + `PRAGMA integrity_check`, validasi IPC &amp; navigasi Electron, serta unit test hardening.
- **Fase 12C &amp; 12D (UI/UX Studio Redesign)**: Sistem tema **Dark Mode** (`#0B0D12`) &amp; **Light Mode** (`#F4F6FA`), 11 halaman termasuk **Monitor Sistem** dan **Riwayat Sesi** berbasis SQLite nyata, Global Safety Controls &amp; Notification Center di Topbar, `AppSelect`, `ConfirmDialog`, `PerformanceChart`, serta logo resmi NGEGAME, Steam, OBS Studio, YouTube, dan Twitch.
- **Fase 12E (Repository &amp; Release Prep)**: Pembaruan `README.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/assets/screenshots/`, pengecualian dev DB/env di `electron-builder.yml`, serta SHA256 checksum &amp; pengujian wajib pada `.github/workflows/release.yml`.

### Diperbaiki
- Perbaikan urutan build `@ngegame/shared` sebelum `typecheck` dan eksekusi test backend sekuensial (`--test-concurrency=1`) agar GitHub Actions CI lulus pada **Ubuntu Latest** dan **Windows Latest**.
- Penambahan `PYTHON_WORKER_PATH` dari `app.asar.unpacked` pada mode packaged Electron di `apps/desktop/src/main.ts`.
