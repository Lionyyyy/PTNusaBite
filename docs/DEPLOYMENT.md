# Deployment — URL publik (gratis)

Analogi singkat: aplikasi ini seperti **restoran** (Render menjalankan "dapur"/kode) dan **gudang arsip** (Aiven menyimpan "buku catatan"/database MySQL). Keduanya terpisah supaya data tidak hilang walau dapur tutup sementara.

| Komponen | Layanan yang disarankan | Kenapa |
|---|---|---|
| Aplikasi web (Node.js) | [Render](https://render.com/docs/free) — Free web service | Gratis; tersambung langsung ke GitHub; HTTPS otomatis. Catatan: tidur setelah 15 menit tanpa pengunjung, bangun ±1 menit saat dibuka. |
| Database MySQL | [Aiven for MySQL](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier) — Free plan | MySQL 8 asli, 1 GB, tanpa batas waktu. Catatan: layanan yang lama tidak dipakai bisa dimatikan Aiven (bisa dinyalakan lagi). |

> ⚠️ Jangan memakai **Render Postgres/disk gratis** untuk data: database gratis Render kedaluwarsa 30 hari dan disk web service gratis terhapus saat restart. Aplikasi ini tidak menyimpan apa pun di disk; semua data ada di MySQL.

## Langkah 1 — Buat database MySQL di Aiven (±10 menit)

1. Buka <https://console.aiven.io/signup> dan daftar (bisa memakai akun Google/GitHub).
2. Klik **Create service** → pilih **MySQL** → pilih plan **Free** → region terdekat (mis. Singapore bila tersedia) → **Create service**.
3. Tunggu status **Running** (beberapa menit).
4. Di halaman **Overview** layanan, bagian **Connection information**:
   - Salin **Service URI** — bentuknya `mysql://avnadmin:PASSWORD@mysql-xxxx.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED`.
   - Klik **CA certificate → Download/Show** dan salin seluruh isinya (diawali `-----BEGIN CERTIFICATE-----`).
5. Simpan kedua nilai itu di catatan sementara. **Jangan** dimasukkan ke repositori.

Sumber: [Aiven TLS/SSL certificates](https://aiven.io/docs/platform/concepts/tls-ssl-certificates), [Get started with Aiven for MySQL](https://help.aiven.io/en/articles/2820646-getting-started-with-aiven-for-mysql).

## Langkah 2 — Deploy aplikasi di Render (±10 menit)

1. Buka <https://dashboard.render.com/register> dan daftar dengan **GitHub** (akun yang punya akses ke repositori [`Lionyyyy/PTNusaBite`](https://github.com/Lionyyyy/PTNusaBite)).
2. Klik **New + → Blueprint** → pilih repositori `PTNusaBite` → pilih branch `main`.
3. Render membaca file [`render.yaml`](../render.yaml) dan meminta nilai rahasia:
   - `DATABASE_URL` = **Service URI** dari Aiven.
   - `DB_SSL_CA` = isi **CA certificate** dari Aiven (tempel apa adanya, termasuk baris BEGIN/END).
   - `MASTER_ADMIN_INITIAL_PASSWORD` = boleh dikosongkan bila peran Master Admin tidak dipakai (lihat bagian paling bawah).
   - `SESSION_SECRET` dibuat otomatis oleh Render.
4. Klik **Apply / Deploy**. Tunggu log menampilkan `NusaBite ERP berjalan di …`.
5. Pada deploy pertama aplikasi otomatis **membuat tabel dan mengisi baseline seed** (log: `Tabel belum ada: membuat skema dan baseline seed…`).
6. Buka URL `https://nusabite-erp-xxxx.onrender.com` → login `owner.demo` / `demo1234`.

> **Layanan Render sudah ada dan dulu dibuat manual (bukan lewat Blueprint)?** Tidak perlu membuat ulang. Buka layanan itu → **Settings → Build & Deploy → Repository**, pastikan menunjuk ke `Lionyyyy/PTNusaBite` branch `main`; lalu cocokkan **Build Command** `npm ci --omit=dev`, **Start Command** `npm start`, **Health Check Path** `/healthz`, dan isi tab **Environment** sesuai tabel "Variabel lingkungan" di bawah.

Sumber: [Render Blueprint YAML Reference](https://render.com/docs/blueprint-spec), [Health Checks](https://render.com/docs/health-checks), [Setting Your Node.js Version](https://render.com/docs/node-version) (repositori memakai `.node-version` = 22.22.0).

## Langkah 3 — Verifikasi setelah deploy (wajib sebelum dikirim ke dosen)

| Cek | Cara | Hasil yang benar |
|---|---|---|
| Kesehatan | buka `/healthz` | `{"ok":true}` |
| Data baseline | login owner → Inventory → Stock | Total 773 unit, valuasi Rp5.422.000 |
| Persisten | buat Quotation, tekan refresh, logout/login | Quotation tetap ada |
| Peran | login `sales.demo`, buka `/accounting/entries` | 403 + tercatat di Audit |
| Reset | Owner → Settings → Reset ke baseline | Data kembali ke baseline. Tombol tidak muncul bila akun Master Admin sudah dibuat (lihat bagian paling bawah) |

## Variabel lingkungan

| Variabel | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | ya (cloud) | URI MySQL. Alternatif: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. |
| `DB_SSL` | ya untuk Aiven | `true` mengaktifkan TLS. |
| `DB_SSL_CA` | disarankan | Sertifikat CA agar sertifikat server diverifikasi. Tanpa ini koneksi tetap terenkripsi tetapi tidak diverifikasi. |
| `SESSION_SECRET` | ya | Teks acak panjang untuk menandatangani cookie sesi. |
| `NODE_ENV` | ya | `production` (cookie `Secure`, pesan error disembunyikan). |
| `DEMO_PASSWORD` | tidak | Password semua akun uji pada seed (default `demo1234`). |
| `ALLOW_RESET` | tidak | `true` agar Owner dapat memulihkan baseline untuk pengujian; set `false` bila tidak diinginkan. |
| `MASTER_ADMIN_INITIAL_PASSWORD` | tidak | Kata sandi awal akun `master.admin` (12 karakter – 72 byte). Hanya dibaca bila belum ada akun Master Admin. |

## Alternatif

- **Lokal dengan Docker**: `docker compose up --build` lalu buka <http://localhost:3000>. [`Dockerfile`](../Dockerfile) dan [`docker-compose.yml`](../docker-compose.yml) ada di akar repositori; diuji 2026-11-11 (aplikasi + MySQL 8.4, baseline 773 unit / Rp5.422.000).
- **TiDB Cloud Starter** (kompatibel MySQL) bisa dipakai sebagai pengganti Aiven; uji dulu karena TiDB tidak 100% identik dengan MySQL. Sumber: [TiDB Cloud cluster tiers](https://docs.pingcap.com/tidbcloud/select-cluster-tier).

## Masalah umum

| Gejala | Penyebab | Solusi |
|---|---|---|
| Log `Database belum dapat dihubungi … ENOTFOUND …aivencloud.com` | Layanan Aiven masih **Building / Setting up vm** sehingga nama host belum terdaftar di DNS, atau URI salah ketik | Tunggu status Aiven **Running** (biasanya beberapa menit). Aplikasi mencoba ulang otomatis dan pulih sendiri; halaman menampilkan "Database sedang disiapkan" (HTTP 503) sementara itu. Bila status sudah Running tetapi masih ENOTFOUND, salin ulang Service URI. |
| Log `ECONNREFUSED` / `ETIMEDOUT` / `Access denied` | Port, password, atau layanan dimatikan | Salin ulang Service URI; nyalakan layanan Aiven bila *Powered off*. |
| `self signed certificate` / TLS error | CA tidak cocok | Tempel ulang CA certificate di `DB_SSL_CA` tanpa spasi tambahan. |
| Login selalu kembali ke halaman login di lokal dengan `NODE_ENV=production` | Cookie `Secure` hanya dikirim lewat HTTPS | Di lokal jangan set `NODE_ENV=production`, atau akses lewat HTTPS. |
| Halaman lambat dibuka pertama kali | Render free sedang tidur | Tunggu ±1 menit; buka URL sebelum demo. |

## Master Admin dan Audit

Untuk mengaktifkan kedua peran di deployment yang sudah ada, tambahkan
`MASTER_ADMIN_INITIAL_PASSWORD` di **Render → service NusaBite → Environment**
sebelum deploy cabang yang memuat fitur. Pakai kata sandi unik minimal 12 karakter
dan maksimal 72 byte. Saat aplikasi mulai, migrasi menambah struktur hak akses
pada database lama tanpa reset. Akun pertama dibuat dengan username
`master.admin`. Setelah login berhasil, variabel kata sandi awal dapat dihapus.
Mengubah variabel sesudah akun dibuat tidak mengganti kata sandi akun.

1. Masuk sebagai `master.admin`, buka **Master Admin → User & Account Security**,
   lalu buat akun dengan peran **Audit** dan kata sandi unik.
2. Masuk dengan akun Audit dan buka **Audit → Audit Review** untuk melihat
   transaksi, indikasi selisih, dan membuat laporan audit. Hitung fisik stok
   disimpan sebagai pembanding di laporan.
3. Gunakan **Role & Permission Management** untuk menetapkan akses peran khusus.
   Persetujuan diskon di atas batas dan revisi pesanan tetap mengikuti aturan
   Owner. Delete tersedia untuk master data yang boleh dihapus. Transaksi
   menggunakan tindakan pembatalan sesuai aturan modul.

Setelah Master Admin dibuat, reset baseline dari web dinonaktifkan untuk
melindungi akun dan riwayat. Gunakan perintah reset yang sudah ada hanya pada
database demo atau pengujian yang memang boleh dihapus.
