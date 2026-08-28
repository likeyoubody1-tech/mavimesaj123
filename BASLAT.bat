@echo off
echo Mavi Mesaj baslatiliyor...
cd /d "%~dp0"
call npm run build --workspace=frontend
call npm run build --workspace=backend
echo.
echo http://localhost:3000 aciliyor...
start http://localhost:3000
call npm start --workspace=backend
pause
