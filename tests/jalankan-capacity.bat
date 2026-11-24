@echo off
cd /d "%~dp0"
set ALLOW_WRITE=1
echo Menjalankan semua test Capacity. Jangan ditutup sampai selesai...
echo.
call npx playwright test capacity
echo.
echo Selesai. Membuka laporan...
start "" "hasil\laporan-terbaru.html"
pause