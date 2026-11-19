# Panduan Membuat Game Adapter Baru — Overthinker-Ngegame

Arsitektur **Game Adapter System** pada Overthinker-Ngegame bersifat *plugin-based* sehingga dukungan game baru dapat ditambahkan tanpa mengubah kode inti **AI Brain Engine**.

## Properti Wajib `GameAdapterDefinition`

Setiap adaptor mengimplementasikan interface `GameAdapterDefinition` dari paket `@ngegame/shared`:

| Properti | Tipe / Isi | Keterangan |
| :--- | :--- | :--- |
| `metadata` | `id`, `name`, `version`, `author`, `genre`, `description` | Identitas unik dan deskripsi adaptor. |
| `gameIdentification` | `steamAppIds`, `windowTitlePatterns` | Pola pencocokan otomatis terhadap game yang sedang berjalan. |
| `controlMapping` | Peta `AIActionType` → tombol & durasi | Pemetaan aksi AI ke input aman yang dikenali game. |
| `screenLayout` | Koordinat persentase (`xPercent`, `yPercent`, `widthPercent`, `heightPercent`) | Area HUD, teks OCR, minimap, dan inventori pada layar. |
| `objectiveDefinition` | Daftar target prioritas | Tujuan permainan yang menjadi acuan penalaran AI. |
| `actionLibrary` | Daftar `AIActionType` | Daftar aksi yang diizinkan (*allowlist*) pada adaptor tersebut. |
| `strategyRules` | Daftar aturan teks | Aturan strategi yang disuntikkan ke prompt **AI Brain**. |
| `visionConfig` | `targetIntervalMs`, `motionThreshold`, `enableOcr` | Parameter frekuensi tangkapan layar dan OCR. |
| `compatibilityStatus` | `'verified' \| 'experimental' \| 'planned'` | Status kesiapan adaptor di UI **Adaptor Game**. |

## Langkah Mendaftarkan Adaptor Baru

1. Buat definisi adaptor di direktori backend, misalnya `apps/backend/src/services/adapters/custom/myGameAdapter.ts`.
2. Daftarkan adaptor ke `AdapterRegistry` melalui `registry.register(MY_GAME_ADAPTER)` atau tambahkan ke daftar bawaan di `builtinAdapters.ts`.
3. `AdapterRegistry.resolve()` akan otomatis memilih adaptor berdasarkan `steamAppId`, `windowTitle`, atau `genre`, dengan `universal-adapter` sebagai cadangan (*fallback*).
4. Uji resolusi dan daftar aksi adaptor baru melalui halaman **Adaptor Game** di aplikasi serta tambahkan unit test terkait sebelum melakukan commit.
