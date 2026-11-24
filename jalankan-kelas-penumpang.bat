@echo off
REM ============================================================
REM  Jalankan test KELAS PENUMPANG
REM   Isi: daftar, form, tambah/ubah/nonaktif/hapus. Dampak: form Kapal langkah 3, Alokasi Keberangkatan.
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
echo [2/3] Menjalankan test KELAS PENUMPANG...
call npx playwright test --project=ui "UI.kelas-penumpang"

echo.
echo [3/3] Selesai. Membuka laporan...
if exist "hasil\laporan-terbaru.html" (
  start "" "hasil\laporan-terbaru.html"
) else (
  call npx playwright show-report
)
pause
