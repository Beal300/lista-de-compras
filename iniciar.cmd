@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js LTS e abra novamente este arquivo.
  pause
  exit /b 1
)
if not exist dist-server\index.js (
  echo Execute npm install e npm run build antes de iniciar.
  pause
  exit /b 1
)
call npm run setup
if errorlevel 1 (
  pause
  exit /b 1
)
call npm start
pause
