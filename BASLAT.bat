@echo off
title Mavi MC Bot - Yonetim Paneli
echo.
echo ==== Mavi MC Bot ====
echo.
cd /d "%~dp0"

if not exist "node_modules" (
  echo [1/3] Paketler kuruluyor... (ilk calistirma - biraz surebilir)
  call npm install
  if errorlevel 1 (
    echo.
    echo HATA: npm install basarisiz. Node.js 20+ kurulu mu?
    pause
    exit /b 1
  )
)

echo [2/3] Build...
call npm run build
if errorlevel 1 (
  echo HATA: build basarisiz.
  pause
  exit /b 1
)

echo [3/3] Baslatiliyor -> http://localhost:3000
start "" http://localhost:3000
call npm start
pause
