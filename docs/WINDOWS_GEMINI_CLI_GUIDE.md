<div align="center">
  <img src="../apps/desktop/assets/icon.svg" alt="Overthinker-Ngegame Logo" width="64" />
  <h1>Panduan Pengembangan di Windows dengan Gemini CLI &amp; GitHub</h1>
  <p><a href="../README.md">&larr; Kembali ke README</a> &bull; <a href="../DEVELOPMENT.md">Pengembangan Lokal</a> &bull; <a href="../CONTRIBUTING.md">Kontribusi</a></p>
</div>

Panduan ini menjelaskan langkah-langkah melanjutkan pengembangan **Overthinker-Ngegame** di komputer **Windows** menggunakan **Gemini CLI** dan **GitHub** setelah rilis `v0.1.0`.

## 1. Prasyarat di Windows

Pastikan perangkat Windows sudah terpasang:
- **Git for Windows** (termasuk Git Bash / integrasi PowerShell)
- **Node.js 22 LTS** dan **npm**
- **Python 3.11** (centang *Add Python to PATH* saat instalasi)
- **Gemini CLI** (instal secara global melalui PowerShell):
  ```powershell
  npm install -g @google/gemini-cli
  ```

## 2. Clone Repositori & Masuk ke Branch `develop`

Buka **PowerShell** atau **Windows Terminal** di folder kerja pilihan Anda, salin URL clone repositori `OverthinkerID/Ngegame` dari tombol **Code** di GitHub, lalu jalankan:

```powershell
git clone <URL-repositori-Ngegame>
cd Ngegame
git checkout develop
git pull origin develop
```

*(Saat pertama kali `git push`, Git Credential Manager di Windows akan meminta login akun GitHub `OverthinkerID` via browser atau Personal Access Token.)*

## 3. Setup Awal Proyek di Windows

Jalankan satu kali setelah `git clone`:

```powershell
npm ci
npm run build -w @ngegame/shared
npm run db:generate
$env:DATABASE_URL="file:./dev.db"; npm run db:push
```

*(Opsional untuk fitur penuh Vision/OCR di Python Worker)*:
```powershell
pip install -r apps/python-worker/requirements.txt
```

Untuk menjalankan aplikasi mode pengembangan secara lokal di Windows:
```powershell
npm run dev
```

## 4. Menjalankan Gemini CLI di Folder Proyek

Masuk ke direktori root repositori `Ngegame`, lalu jalankan perintah `gemini`:

```powershell
cd Ngegame
gemini
```

Ikuti proses autentikasi saat pertama kali dibuka. Setelah aktif, Gemini CLI otomatis bekerja di dalam konteks repositori `Ngegame` dan dapat membaca, mengedit, serta menjalankan perintah pengujian secara langsung.

## 5. Alur Kerja Edit, Uji, & Push ke GitHub

Agar kode tetap rapi dan sinkron antara **Mac** dan **Windows**, gunakan alur berikut setiap kali melakukan perubahan:

1. **Tarik pembaruan terbaru terlebih dahulu:**
   ```powershell
   git checkout develop
   git pull origin develop
   ```
2. **Buat branch fitur baru:**
   ```powershell
   git checkout -b feature/nama-perubahan
   ```
3. **Edit kode bersama Gemini CLI**, lalu jalankan verifikasi wajib sebelum commit:
   ```powershell
   npm run build -w @ngegame/shared
   npm run typecheck
   npm run build
   npm test
   ```
4. **Commit dan push ke GitHub:**
   ```powershell
   git status
   git add <file-yang-diubah>
   git commit -m "feat(scope): deskripsi singkat perubahan"
   git push -u origin feature/nama-perubahan
   ```
5. **Merge ke `develop` / `main`:**
   - Buka Pull Request di GitHub dari `feature/nama-perubahan` ke `develop` dan pastikan GitHub Actions CI (`Ubuntu Latest` & `Windows Latest`) lulus.
   - Jika sudah siap membuat rilis installer Windows versi berikutnya, merge `develop` ke `main` lalu buat tag baru (misalnya `v0.1.1`):
     ```powershell
     git checkout main
     git pull origin main
     git tag -a v0.1.1 -m "Release v0.1.1"
     git push origin v0.1.1
     ```

## 6. Catatan Penting Saat Beralih Antara Mac dan Windows

- Selalu jalankan `git pull origin develop` sebelum mulai mengedit di komputer mana pun.
- Jangan pernah meng-commit berkas rahasia lokal, database `*.db*`, atau folder `release/`.
- Jika ingin langsung menguji build installer Windows `.exe` di PC Windows secara lokal:
  ```powershell
  npm install --no-save electron-builder
  npm run dist:win
  ```
  Hasil installer akan muncul di folder lokal `release/`.
