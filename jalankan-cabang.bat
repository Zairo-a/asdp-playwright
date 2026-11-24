@echo off
REM ============================================================
REM  Jalankan test CABANG
REM   - API  : tests\branch-*.spec.ts (validasi server, data uji dibersihkan otomatis)
REM   - Layar: tests\UI\cabang*.spec.ts (daftar, form, tambah/ubah/nonaktif/hapus)
REM   Dampak: pilihan Perusahaan ^& Pelabuhan, Jumlah Cabang di Perusahaan, rute aktif, web Ferizy.
REM  1) Login ulang otomatis -> sesi baru disimpan ke auth.json
REM  2) Test API + test layar
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
echo [2/3] Menjalankan test CABANG (API + layar)...
call npx playwright test branch- "UI.cabang"

echo.
echo [3/3] Selesai. Membuka laporan...
if exist "hasil\laporan-terbaru.html" (
  start "" "hasil\laporan-terbaru.html"
) else (
  call npx playwright show-report
)
pause
