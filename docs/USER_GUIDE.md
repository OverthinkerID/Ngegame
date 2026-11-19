# Panduan Pengguna — Overthinker-Ngegame

Panduan ini menjelaskan seluruh menu pada antarmuka **Overthinker Premium AI Gaming Studio** (11 halaman sidebar, Dark/Light Mode, dan bilah kontrol keamanan global).

## Kontrol Global (Topbar & Status Bar)

- **Jeda AI / Takeover / Emergency Stop**: Tersedia di bilah atas pada setiap halaman untuk menjeda penalaran AI, mengambil alih kontrol penuh ke manusia, atau menghentikan seluruh input kontroler secara instan tanpa menutup game maupun OBS.
- **Indikator Platform & OBS**: Menampilkan OS aktif (`Windows` / `macOS`) serta status koneksi OBS WebSocket.
- **Notifikasi, Tema (Dark/Light), & Uji Worker**: Mengganti tema gelap/terang, memeriksa riwayat notifikasi, serta menguji respons Python Worker secara langsung.
- **Status Bar Bawah**: Menampilkan status **Backend**, **Worker**, **SQLite**, **OBS**, serta telemetri **CPU & RAM** real-time.

## Daftar Halaman Aplikasi

| Menu Sidebar | Fungsi Utama |
| :--- | :--- |
| **Dasbor** | Ringkasan studio: telemetri CPU/RAM/GPU, status AI & latensi, status Vision & FPS, sesi game aktif, status OBS/YouTube/Twitch, linimasa aktivitas AI, dan log sistem terbaru. |
| **Pustaka Game** | Memindai instalasi Steam lokal (`appmanifest_*.acf`), memeriksa kompatibilitas, serta meluncurkan atau menghentikan game dengan pencatatan sesi ke SQLite. |
| **Kendali AI** | Mengatur penyedia AI (**Ollama Lokal** / **OpenAI Cloud**), memilih tingkat izin (**L1 Eksekusi Otomatis**, **L2 Wajib Persetujuan**, **L3 Khusus Manusia**), meninjau antrean persetujuan, menjalankan simulasi uji AI, dan melihat audit log pengawasan manusia. |
| **Monitor Visi** | Memilih jendela game atau layar utama, menjalankan tangkapan layar tunggal atau pemantauan langsung (*live*), serta memantau scene, elemen HUD, OCR, dan skor pergerakan (*motion score*). |
| **Adaptor Game** | Mengelola dan menguji resolusi adaptor game (adaptor **Stardew Valley**, 7 templat genre, dan **Universal Adapter**) beserta daftar aksi yang diizinkan (*allowlist*). |
| **Studio Siaran** | Menghubungkan OBS Studio WebSocket v5 (`ws://localhost:4455`), melihat pratinjau adegan aktif, memulai/menghentikan siaran uji, serta menyimpan kunci siaran **YouTube Live** dan **Twitch** secara terenkripsi di Keychain / Credential Manager OS. |
| **Studio Suara AI** | Mengonfigurasi server **VoxCPM 2.0** Bahasa Indonesia (gaya suara, kecepatan, volume, jeda/cooldown), menguji sintesis narator, dan memantau cadangan lokal. |
| **Analitik** | Memantau metrik performa sesi, efisiensi AI, dan mengekspor laporan analitik ke format **CSV** atau **JSON**. |
| **Riwayat Sesi** | Menelusuri riwayat sesi bermain dan catatan aktivitas yang tersimpan nyata di database SQLite. |
| **Monitor Sistem** | Memantau penggunaan CPU, memori, perangkat GPU, kesehatan proses backend/worker, serta pengaturan *auto-throttling*. |
| **Pengaturan** | Mengelola konfigurasi aplikasi, tema tampilan, kredensial penyedia AI cloud, serta backup, restore, dan pemeriksaan integritas database SQLite (`PRAGMA integrity_check`). |
