# Panduan Membuat Game Adapter Baru

Arsitektur **Game Adapter System** pada Overthinker-Ngegame bersifat *plugin-based* sehingga Anda dapat menambahkan dukungan game baru tanpa mengubah kode inti **AI Brain Engine**.

## Struktur Wajib Adapter (`GameAdapterDefinition`)

Setiap adapter mengimplementasikan interface `GameAdapterDefinition` dari `@ngegame/shared`:

1. **`metadata`**: `id` unik, `name`, `version`, `author`, `genre`, dan `description`.
2. **`gameIdentification`**: daftar `steamAppIds` dan `windowTitlePatterns` untuk pencocokan otomatis.
3. **`controlMapping`**: pemetaan `AIActionType` ke tombol/durasi standar.
4. **`screenLayout`**: koordinat persentase (`xPercent`, `yPercent`, `widthPercent`, `heightPercent`) untuk wilayah HUD, OCR, minimap, atau inventori.
5. **`objectiveDefinition`**: daftar target prioritas game.
6. **`actionLibrary`**: daftar `AIActionType` yang diizinkan pada game tersebut.
7. **`strategyRules`**: aturan strategi yang disuntikkan ke prompt AI Brain saat adapter aktif.
8. **`visionConfig`**: `targetIntervalMs`, `motionThreshold`, dan `enableOcr`.
9. **`compatibilityStatus`**: `'verified'`, `'experimental'`, atau `'planned'`.

## Cara Mendaftarkan Adapter Baru

1. Buat definisi adapter di file baru (misalnya `apps/backend/src/services/adapters/custom/myGameAdapter.ts`).
2. Daftarkan ke `AdapterRegistry` melalui `registry.register(MY_GAME_ADAPTER)` atau tambahkan ke daftar bawaan di `builtinAdapters.ts`.
3. `AdapterRegistry.resolve()` akan otomatis memilih adapter Anda berdasarkan `steamAppId`, `windowTitle`, atau `genre`, dengan `universal-adapter` sebagai fallback.
