@echo off
REM ============================================================
REM  Jalankan SEMUA test Master data (Pelabuhan, Rute & Jadwal, Golongan Kendaraan, Kapal, Kelas & Kategori Penumpang, Kategori Barang & Hewan, Perusahaan, Cabang)
REM  1) Login ulang otomatis -> sesi baru disimpan ke auth.json
REM  2) Test read-only, lalu test ubah data (dengan pembersihan otomatis)
REM  3) Buka laporan
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
echo [2/3] Menjalankan test Master data (Pelabuhan, Rute ^& Jadwal, Golongan Kendaraan, Kapal, Kelas ^& Kategori Penumpang, Kategori Barang ^& Hewan, Perusahaan, Cabang)...
call npx playwright test --project=ui pelabuhan rute golongan "UI.kapal" "UI.kelas-penumpang" "UI.kategori-penumpang" "UI.kategori-barang" "UI.perusahaan" "UI.cabang"

echo.
echo [3/3] Selesai. Membuka laporan...
if exist "hasil\laporan-terbaru.html" (
  start "" "hasil\laporan-terbaru.html"
) else (
  call npx playwright show-report
)
pause