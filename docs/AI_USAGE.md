# AI-Tool Usage Note — Group 04 · 24SI2 · FastFood

Handout Bagian 13 mengizinkan AI dalam metode *vibe coding* dengan syarat **semua alat dicatat** dan setiap anggota mampu menjelaskan bagiannya secara live. Catatan ini wajib dilengkapi oleh tiap anggota; baris yang sudah terisi hanya memuat hal yang dapat dibuktikan dari riwayat repositori.

> Catatan ini hanya berlaku untuk proyek ERP. Tugas **Audit Sistem Informasi (S4)** melarang AI generatif untuk laporan, diagram, slide, analisis, dan peer evaluation — jangan memakai alat di bawah untuk tugas tersebut.

## 1. Alat yang dipakai

| Alat | Dipakai oleh | Bagian yang dibantu | Cara verifikasi | Bukti (commit / PR) |
|---|---|---|---|---|
| Codex (nama author pada commit) | _isi_ | Pemulihan berkas runtime; peran Master Admin dan Audit | _isi_ | `f6d0bd4`, `4c6f15c` (PR [#1](https://github.com/Lionyyyy/PTNusaBite/pull/1)) |
| Claude Code (Anthropic) | _isi_ | README, `render.yaml`, `Dockerfile`, `docker-compose.yml`, pemindahan workflow ke `.github/workflows/`, periode payroll default Oktober 2026, regresi ulang T-01 … T-38 | Lint, `npm test`, 38 skenario UI, dan `docker compose up` dijalankan sebelum commit | commit pada cabang `claude/focused-sagan-2k475a` |
| _isi alat lain (mis. Antigravity)_ | _isi_ | _isi_ | _isi_ | _isi_ |

[DECISION_LOG.md](DECISION_LOG.md) berstatus "draf yang disiapkan bersama AI" dan menunggu persetujuan M1; catat alat yang dipakai untuk draf itu pada tabel di atas.

## 2. Cara tim meninjau keluaran AI

Isi dengan praktik yang benar-benar dijalankan, misalnya:

- [ ] Wireframe dan acceptance criteria (F-xx) diberikan ke alat sebelum meminta kode.
- [ ] Setiap fitur yang bekerja di-commit terpisah.
- [ ] `npm run lint` dan `npm test` dijalankan ulang setelah setiap perubahan.
- [ ] Logika (bukan hanya tampilan) dibaca dan dijelaskan ulang oleh pemilik modul.

## 3. Kasus UI tampak benar tetapi melanggar aturan

Bahan untuk Pertanyaan Refleksi 2 dan Defect Log. Isi hanya dengan kasus yang benar-benar terjadi.

| ID | Tanggal | Layar / Fitur | SR | Yang tampak benar di UI | Aturan yang dilanggar | Diagnosis | Perbaikan (commit / PR) | Uji regresi |
|---|---|---|---|---|---|---|---|---|
| AI-01 | 2026-11-11 | S-16 Payroll / F-19 | SR-12, SR-17 | Form Payroll terisi otomatis dan payslip berhasil dibuat | Periode simulasi handout adalah Oktober 2026, tetapi nilai awal form mengikuti bulan berjalan sehingga sejak November nomor menjadi `PAY/2026-11/E02`; T-32 tetap berstatus PASS | Nilai awal diambil dari tanggal server, sedangkan hari hadir pada dataset adalah fixture Oktober 2026 | `PAYROLL_PERIOD` di `src/policies.js`; T-32 mengisi periode secara eksplisit | T-31, T-32 |
| | | | | | | | | |
