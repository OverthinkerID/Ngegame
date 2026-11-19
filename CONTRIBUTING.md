# Panduan Kontribusi — Overthinker-Ngegame

Dokumen ini menjelaskan alur kerja Git, standar kode, dan pemeriksaan keamanan sebelum mengirimkan perubahan ke repository **Overthinker-Ngegame**.

## Strategi Branch

- `main`: Branch stabil untuk rilis produksi dan tag versi.
- `develop`: Branch integrasi pengembangan aktif antar fase.
- `feature/<nama-fase-atau-fitur>`: Branch pengembangan fitur baru dari `develop` (contoh: `feature/fase-12a-windows-test`).

## Alur Kerja Pull Request

1. Buat branch baru dari `develop`:
   ```bash
   git checkout develop
   git checkout -b feature/nama-fitur
   ```
2. Pastikan seluruh pemeriksaan lulus sebelum commit:
   ```bash
   npm run typecheck
   npm run build
   npm test
   ```
3. Gunakan pesan commit yang jelas dan terstruktur (contoh: `feat(ui): tambah modal detail game`, `fix(desktop): perbaiki handler ipc`).
4. Pastikan tidak ada file sensitif (`.env`, `*.db`, API key, stream key, password) yang ikut ter-stage (`git status` dan `git diff --cached`).
5. Buka Pull Request menuju `develop` dan tunggu seluruh pemeriksaan GitHub Actions CI lulus sebelum merge.

## Aturan Keamanan

- Jangan pernah menyertakan API key OpenAI, stream key YouTube/Twitch, atau kata sandi OBS di dalam kode sumber maupun commit Git.
- Kredensial siaran harus selalu disimpan melalui `StreamCredentialStore` (Windows Credential Manager / macOS Keychain).
