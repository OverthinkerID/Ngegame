# Dokumentasi Basis Data SQLite (Prisma) — Overthinker-Ngegame

Skema sumber: `apps/backend/prisma/schema.prisma`

## Konfigurasi Reliabilitas

- **Mode Jurnal**: `PRAGMA journal_mode = WAL;`
- **Timeout Penguncian**: `PRAGMA busy_timeout = 5000;`
- **Lokasi Database**:
  - Development: `apps/backend/prisma/dev.db` (via `DATABASE_URL="file:./dev.db"`)
  - Packaged Production: `<userData>/ngegame.db` (dikelola otomatis oleh Electron `main.ts`)
- **Backup & Restore**: `BackupService` membaca `DATABASE_URL` secara dinamis, menyimpan salinan `.db` ke folder `backups/`, dan mendukung `PRAGMA integrity_check;` melalui `GET /api/system/integrity`.

## Daftar Tabel & Indeks

1. `AppSetting` (`key` PK) — Pengaturan key-value aplikasi.
2. `SystemLog` (Indeks: `createdAt`, `level + source`) — Log operasional sistem.
3. `SessionRecord` (Indeks: `status + startedAt`) — Catatan sesi bermain.
4. `SteamGame` (`appId` PK, Indeks: `compatibility`) — Metadata game Steam lokal.
5. `VisionCapture` (Indeks: `createdAt`) — Hasil analisis tangkapan layar & OCR.
6. `AIDecision` (Indeks: `createdAt`) — Rencana aksi AI, skor keyakinan, dan penggunaan token.
7. `ControllerActionLog` (Indeks: `createdAt`) — Audit eksekusi kontroler game.
8. `SupervisionQueueItem` (Indeks: `status + createdAt`) — Antrean persetujuan manusia (L1–L3).
9. `SupervisionAuditLog` (Indeks: `createdAt`) — Jejak pengambilalihan kontrol dan Emergency Stop.
10. `VoiceSpeechLog` (Indeks: `createdAt`) — Riwayat sintesis suara VoxCPM 2.0 / fallback lokal.
11. `StreamSessionLog` (Indeks: `startedAt`) — Catatan sesi siaran OBS & multistream.
12. `ResourceSnapshot` (Indeks: `createdAt`) — Sampel CPU, RAM, dan status auto-throttling.

*(Catatan keamanan: Stream key YouTube/Twitch **tidak pernah** disimpan di SQLite, melainkan di Windows Credential Manager / macOS Keychain.)*
