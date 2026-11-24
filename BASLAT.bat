@echo off
setlocal enableextensions
title Mavi Bot - Yonetim Paneli
echo.
echo ==== Mavi Bot ====
echo.

rem --- Windows kabuk ortamini garanti altina al (cmd.exe ENOENT hatasini onler) ---
if not defined ComSpec set "ComSpec=%SystemRoot%\System32\cmd.exe"
set "PATH=%PATH%;%SystemRoot%\System32;%SystemRoot%"

cd /d "%~dp0"

rem --- Calisma-zamani paketleri kurulu mu? (sadece mineflayer vb, build araci YOK) ---
if not exist "node_modules\mineflayer\package.json" (
  echo [1/2] Gerekli paketler kuruluyor... (ilk calistirma, 1-2 dk surebilir)
  echo.
  call npm install --omit=dev --no-audit --no-fund
  echo.
  if not exist "node_modules\mineflayer\package.json" (
    echo ============================================================
    echo  KURULUM TAMAMLANAMADI
    echo ------------------------------------------------------------
    echo  Lutfen sunlari sirayla dene:
    echo   1^) Acik Mavi Bot / siyah pencereleri KAPAT.
    echo   2^) Bu klasordeki "node_modules" klasorunu SIL.
    echo   3^) Klasoru BOSLUKSUZ bir yola tasi, ornek: C:\MaviBot
    echo      ^(simdiki yolda bosluk/parantez var: "%~dp0"^)
    echo   4^) BASLAT.bat'a tekrar cift tikla.
    echo  Node.js 20 veya 22 LTS kurulu olmali: https://nodejs.org
    echo ============================================================
    echo.
    pause
    exit /b 1
  )
)

echo [2/2] Baslatiliyor -^> http://localhost:3000
echo  ^(Kapatmak icin bu pencereyi kapat^)
echo.
start "" http://localhost:3000
node backend\dist\server.js

echo.
echo Sunucu durdu. Bir hata olduysa yukaridaki mesaja bak.
pause
