@echo off
REM ============================================================
REM  Jalankan SEMUA test UI Keberangkatan & Alokasi
REM  1) Login ulang otomatis -> sesi baru disimpan ke auth.json
REM     (butuh QA_CMS_USER dan QA_CMS_PASS di .env)
REM  2) Jalankan semua test keberangkatan (termasuk ubah data + restore)
REM  3) Buka laporan
REM ============================================================
cd /d "%~dp0"
set ALLOW_WRITE=1

echo.
echo [1/3] Login ulang untuk menyegarkan sesi (auth.json)...
call npx playwright test --project=ui keberangkatan-login-ubah -g "KL-02" --reporter=line
if errorlevel 1 (
  echo [!] Login ulang gagal. Cek QA_CMS_USER / QA_CMS_PASS di .env, atau koneksi ke server dev.
)

if not exist auth.json (
  echo [!] auth.json belum ada dan login otomatis tidak berhasil. Login manual dulu:
  echo     npx playwright codegen --save-storage=auth.json https://dev.core-next.asdp.garudakreasi.com
  pause
  exit /b 1
)

echo.
echo [2/3] Menjalankan semua test Keberangkatan ^& Alokasi...
call npx playwright test --project=ui keberangkatan template-alokasi

echo.
echo [3/3] Selesai. Membuka laporan...
if exist "hasil\laporan-terbaru.html" (
  start "" "hasil\laporan-terbaru.html"
) else (
  call npx playwright show-report
)
pause