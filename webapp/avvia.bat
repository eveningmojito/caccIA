@echo off
REM Avvia il server della Caccia al Tesoro (Windows)
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Errore: Node.js non trovato. Scaricalo da https://nodejs.org
    pause
    exit /b 1
)

echo Avvio Caccia al Tesoro...
node server.js
pause
