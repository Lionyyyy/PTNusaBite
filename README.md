# NusaBite ERP — PT NusaBite Cepat Saji

Aplikasi web ERP untuk usaha makanan cepat saji fiktif di Pekanbaru (proyek kelompok Sistem Informasi, Group 04 · 24SI2). Aplikasi ini benar-benar berjalan dan menyimpan data secara permanen di MySQL, bukan prototipe visual.

| | |
|---|---|
| Repositori | <https://github.com/Lionyyyy/PTNusaBite> |
| URL publik | <https://nusabite-erp.onrender.com> (lihat [Status deployment](#status-deployment)) |
| Teknologi | Node.js 22 · Express 5 · EJS · MySQL 8 |
| Hosting | Aplikasi di [Render](https://render.com), database di [Aiven for MySQL](https://aiven.io/mysql) |
| Modul | Sales, CRM, Purchase, Inventory, Accounting, Invoicing, Employees (+ simulasi payroll dan Quick Counter) |

## Akun uji

Semua akun di bawah memakai kata sandi `demo1234` (dapat diganti lewat variabel `DEMO_PASSWORD`).

| Username | Peran | Aplikasi utama |
|---|---|---|
| `sales.demo` | Sales | Sales, CRM, Quick Counter |
| `warehouse.demo` | Warehouse | Inventory, Purchase |
| `finance.demo` | Finance | Accounting, Invoicing, Dashboard, Audit |
| `hr.demo` | HR | Employees, Payroll |
| `cashier.demo` | Cashier | Quick Counter |
| `owner.demo` | Owner | Semua modul, persetujuan diskon dan revisi |

Dua peran tambahan di luar enam peran wajib handout: **Master Admin** (`master.admin`, kelola akun dan hak akses) dan **Audit** (hanya-baca + laporan audit). Keduanya tidak ikut baseline seed; cara mengaktifkannya ada di [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#master-admin-dan-audit).

## Alur yang didukung

| Flow | Rangkaian dokumen |
|---|---|
| 1 — Order to Cash | Lead → Opportunity → Quotation → Sales Order → Delivery Order → Customer Invoice → Payment |
| 2 — Procure to Pay | RFQ → Purchase Order → Receipt (Accepted) → Vendor Bill → Payment |
| 3 — Quick Counter | Counter Order → Stock validation → Done Delivery → Customer Receipt → Cash / Ledger |
| 4 — Employees dan gaji | Employee → Attendance days → Payslip → Salary Journal → Bank Payment |
| 5 — Retur | Return Inspection → Return Stock Move → Credit Note → AR adjustment |

Aturan pemangku kepentingan SR-01 … SR-22 ditegakkan di server dan dipetakan ke kode, fitur, layar, dan tes di [docs/TRACEABILITY.md](docs/TRACEABILITY.md).

## Menjalankan di komputer sendiri

### Cara A — Docker (paling mudah)

Butuh [Docker Desktop](https://docs.docker.com/get-started/get-docker/).

```bash
docker compose up --build
```

Buka <http://localhost:3000>, lalu login `owner.demo` / `demo1234`. Tabel dan baseline seed dibuat otomatis saat pertama kali jalan.

Untuk berhenti dan menghapus data lokal:

```bash
docker compose down -v
```

### Cara B — Node.js + MySQL terpasang sendiri

Butuh [Node.js 22](https://nodejs.org/en/download) dan [MySQL 8](https://dev.mysql.com/downloads/mysql/).

1. Buat database dan pengguna (jalankan di klien MySQL sebagai root):

   ```sql
   CREATE DATABASE nusabite CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE nusabite_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'nusabite'@'localhost' IDENTIFIED BY 'nusabite';
   GRANT ALL ON nusabite.* TO 'nusabite'@'localhost';
   GRANT ALL ON nusabite_test.* TO 'nusabite'@'localhost';
   ```

2. Salin contoh konfigurasi, lalu sesuaikan bila perlu:

   ```bash
   cp .env.example .env
   ```

3. Pasang dependensi:

   ```bash
   npm ci
   ```

4. Isi baseline seed:

   ```bash
   npm run db:reset
   ```

5. Jalankan aplikasi:

   ```bash
   npm start
   ```

6. Buka <http://localhost:3000>.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm start` | Menjalankan server (port 3000) |
| `npm run dev` | Server dengan muat ulang otomatis saat file berubah |
| `npm run db:reset` | Membuat ulang tabel dan memulihkan baseline seed. **Menghapus semua data di database yang dituju.** |
| `npm test` | Tes lapisan layanan + constraint database (memakai database terpisah `nusabite_test`) |
| `npm run evidence` | Menjalankan T-01 … T-38 lewat UI (Playwright), menulis ulang screenshot dan `docs/TEST_RESULTS.md`. Server harus sedang berjalan. **Me-reset database aplikasi ke baseline berkali-kali — jangan diarahkan ke database produksi.** |
| `npm run lint` | Pemeriksaan gaya kode (ESLint) |

## Baseline seed

Data awal mengikuti Bagian 4 handout ("Dataset Realistis") dan didefinisikan di [`src/seed.js`](src/seed.js).

| Kontrol | Nilai baseline |
|---|---|
| Stok | 773 unit (WH-PKU 505 + OUTLET-SUD 268), valuasi Rp5.422.000 |
| Reservasi terbuka | S00007: 4 BRG-REG di OUTLET-SUD (On Hand 18, Reserved 4, Available 14) |
| Jurnal pembuka | Debit = kredit = Rp43.722.000 (kas Rp10.000.000, bank Rp25.000.000, AR Rp3.300.000, AP Rp1.500.000) |
| Dokumen yang sudah ada | L00007 (Lead, New), S00007 (Sales Order, Confirmed), PO00007 (Purchase Order) |
| Karyawan | E01 … E06, semuanya Active, 22 hari rencana / 22 hari hadir |
| Periode payroll | Oktober 2026 (`PAYROLL_PERIOD` di [`src/policies.js`](src/policies.js)) |

Catatan atas hal yang tidak tertulis di handout:

- **Penomoran dokumen.** Nomor 0001 … 0007 dianggap sudah dipakai sistem lama, sehingga dokumen baru pertama bernomor S00008, PO00008, WH/OUT/00008, WH/IN/00008, INV/2026/0008, BILL/2026/0008, dan RETURN/0008 — sesuai contoh pada wireframe handout.
- **Kontak `WALKIN`.** Pelanggan umum untuk Quick Counter Order (dibayar tunai saat itu juga); bukan bagian dari enam pelanggan dataset.
- **Lokasi virtual** (`VENDORS`, `CUSTOMERS`, `INV-ADJ`, `QC-REJECT`, `DAMAGED`) dipakai sebagai asal/tujuan stock move; stok fisik hanya ada di `WH-PKU` dan `OUTLET-SUD`.
- Asumsi data lain dicatat di [docs/DECISION_LOG.md](docs/DECISION_LOG.md#asumsi-data).

### Memulihkan baseline

Setiap tes T-xx dimulai dari baseline segar.

- **Dari web:** login `owner.demo` → **Settings → Reset ke baseline**. Tombol ini hilang bila `ALLOW_RESET=false` atau bila akun Master Admin sudah dibuat.
- **Dari terminal:** `npm run db:reset`. Perintah ini juga menghapus semua akun pengguna (termasuk Master Admin dan Audit), peran khusus, dan laporan audit; akun `master.admin` dibuat ulang saat aplikasi dinyalakan lagi selama `MASTER_ADMIN_INITIAL_PASSWORD` masih terpasang.

## Pengujian

- **Hasil T-01 … T-38:** [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) (expected, actual, pass/fail) dengan screenshot di [docs/evidence/](docs/evidence/).
- **Tes otomatis di GitHub:** [`.github/workflows/test.yml`](.github/workflows/test.yml) menjalankan lint, `npm test`, dan 38 skenario UI pada setiap Pull Request dan push ke `main`, memakai MySQL sementara milik runner (bukan database Aiven).

## Deployment

Langkah lengkap (Aiven + Render), variabel lingkungan, dan daftar masalah umum ada di [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Berkas [`render.yaml`](render.yaml) adalah Blueprint Render untuk layanan web.

### Status deployment

Diisi oleh M4 setelah menjalankan tabel "Langkah 3 — Verifikasi" di [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

| Tanggal verifikasi | Commit aktif di Render | `/healthz` | Baseline 773 unit / Rp5.422.000 | Data bertahan setelah refresh | Diverifikasi oleh |
|---|---|---|---|---|---|
| | | | | | |

## Dokumen penyerahan

| Item (Bagian 10 handout) | Berkas | Status |
|---|---|---|
| Cara menjalankan | README ini | Ada |
| Diagram arsitektur dan data | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Ada |
| Decision Log seluruh konflik | [docs/DECISION_LOG.md](docs/DECISION_LOG.md) | Ada — perlu ditinjau dan disetujui M1 |
| Hasil semua T (expected, actual, pass/fail, evidence) | [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md), [docs/evidence/](docs/evidence/) | Ada |
| Matriks SR → F → S → T | [docs/TRACEABILITY.md](docs/TRACEABILITY.md) | Ada |
| AI-tool usage note | [docs/AI_USAGE.md](docs/AI_USAGE.md) | Kerangka — wajib dilengkapi tiap anggota |
| Role Assignment Sheet | [docs/ROLE_ASSIGNMENT.md](docs/ROLE_ASSIGNMENT.md) | Nama dan NIM belum diisi |
| Team Agreement | [docs/TEAM_AGREEMENT.md](docs/TEAM_AGREEMENT.md) | Draf — belum ditandatangani |
| Kontribusi tiap anggota | [docs/CONTRIBUTIONS.md](docs/CONTRIBUTIONS.md) | Kerangka — wajib dilengkapi tiap anggota |
| Paket kerja per anggota | [docs/team/](docs/team/) | Baru tersedia untuk M3 dan M4 |
| Video demo dan presentasi | di luar repositori | Belum ada tautan |

Nama berkas penyerahan mengikuti pola `Group04_24SI2_FastFood_<ItemName>`.

## Peran dan perubahan ownership

Pembagian peran M1 … M4, kepemilikan modul, dan RACI ada di [docs/ROLE_ASSIGNMENT.md](docs/ROLE_ASSIGNMENT.md). Setiap perubahan ownership dicatat pada tabel "Perubahan ownership" di berkas yang sama.

## Struktur folder

```
src/        app.js, server.js, config.js, db.js, seed.js, schema.sql, policies.js
  lib/      hak akses, transaksi + audit, perhitungan PBJT, penomoran
  services/ aturan bisnis per modul (satu transaksi database per aksi)
  routes/   halaman per modul
views/      templat EJS (partials + pages)
public/     CSS dan JavaScript tampilan
test/       tes layanan dan ketahanan (race, regresi)
e2e/        skenario UI T-01 … T-38 + pengambil screenshot
docs/       dokumen penyerahan
```
