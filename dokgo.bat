@echo off
REM ============================================================
REM  Pintasan membuka laporan test.
REM    dokgo        -> laporan Playwright (sama dengan: npx playwright show-report)
REM    dokgo bug    -> laporan bug (hasil\laporan-terbaru.html)
REM ============================================================
cd /d "%~dp0"

if /i "%~1"=="bug" (
  if exist "hasil\laporan-terbaru.html" (
    start "" "hasil\laporan-terbaru.html"
  ) else (
    echo [!] Belum ada hasil\laporan-terbaru.html. Jalankan test dulu.
  )
  goto :eof
)

call npx playwright show-report 