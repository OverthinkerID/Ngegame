# Panduan Kontribusi — Overthinker-Ngegame

Dokumen ini menjelaskan alur kerja Git, standar kualitas kode, dan aturan keamanan sebelum mengirimkan perubahan ke repositori **Overthinker-Ngegame**.

## Strategi Branch

| Branch | Fungsi |
| :--- | :--- |
| `main` | Branch stabil untuk rilis produksi dan tag versi (`v*`). |
| `develop` | Branch integrasi pengembangan aktif antar fase. |
| `feature/<nama>` | Branch pengembangan fitur atau perbaikan baru dari `develop`. |
| `backup/<nama>` | Branch checkpoint sebelum perubahan besar atau migrasi. |

## Alur Kerja Pull Request

1. Buat branch baru dari `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/nama-fitur
   ```
2. Pastikan seluruh pemeriksaan lokal lulus sebelum melakukan commit:
   ```bash
   npm run build -w @ngegame/shared
   npm run typecheck
   npm run build
   npm test
   ```
3. Gunakan pesan commit berformat terstruktur (*Conventional Commits*), misalnya:
   - `feat(ui): tambah filter riwayat sesi`
   - `fix(desktop): perbaiki path python worker saat packaged`
   - `docs(readme): perbarui panduan instalasi`
4. Periksa `git status` dan `git diff --cached` untuk memastikan tidak ada berkas sensitif atau database lokal yang ikut ter-stage.
5. Buka Pull Request ke `develop` dan pastikan seluruh pemeriksaan GitHub Actions CI (**Ubuntu Latest** dan **Windows Latest**) berstatus lulus sebelum merge.

## Aturan Keamanan

- Jangan pernah menyertakan API key cloud LLM, stream key YouTube/Twitch, atau kata sandi OBS di dalam kode sumber maupun riwayat Git.
- Seluruh kredensial siaran wajib disimpan melalui `StreamCredentialStore` (*Windows Credential Manager* / *macOS Keychain*).
