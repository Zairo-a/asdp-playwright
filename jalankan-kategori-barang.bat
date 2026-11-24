@echo off
REM ============================================================
REM  Jalankan test KATEGORI BARANG ^& HEWAN
REM   Isi: daftar, form, aturan curah/go-show, tambah/ubah/nonaktif/hapus. Dampak: form Kapal langkah 5, Keberangkatan (Barang & Hewan), web.
REM  1) Login ulang otomatis -> sesi baru disimpan ke auth.json
REM  2) Test read-only, lalu test ubah data QA (dengan pembersihan otomatis)
REM  3) Buka laporan
REM  JANGAN login CMS di Chrome selama test berjalan (1 akun = 1 sesi).
REM ============================================================
cd /d "%~dp0"
set ALLOW_WRITE=1

echo.
echo [1/3] Login ulang untuk menyegarkan sesi (auth.json)...
call npx playwright test --project=ui keberangkatan-login-ubah -g "KL-02" --reporter=line
if errorlevel 1 (
  echo [!] Login ulang gagal. Cek QA_CMS_USER / QA_CMS_PASS di .env, atau koneksi ke server dev.
  pause
  exit /b 1
)

echo.
echo [2/3] Menjalankan test KATEGORI BARANG ^& HEWAN...
call npx playwright test --project=ui "UI.kategori-barang"

echo.
echo [3/3] Selesai. Membuka laporan...
if exist "hasil\laporan-terbaru.html" (
  start "" "hasil\laporan-terbaru.html"
) else (
  call npx playwright show-report
)
pause
