@echo off
taskkill /FI "WINDOWTITLE eq ATMS_Launcher" /T /F >nul 2>&1
title ATMS_Launcher

echo ========================================
echo  Anegudde Inventory System - Starting
echo ========================================

echo.
echo Waiting for network connection (WiFi/Ethernet)...
set waitcount=0
:waitnet
ipconfig | findstr /c:"IPv4 Address" | findstr /v "169.254" >nul
if not errorlevel 1 goto networkready
set /a waitcount+=1
if %waitcount% GEQ 45 (
    echo WARNING: No network detected after 90 seconds - continuing anyway.
    goto networkready
)
timeout /t 2 /nobreak >nul
goto waitnet
:networkready
echo Network connected.

echo.
echo Stopping any existing instances...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :2508 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :2509 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo.
echo Starting Backend and Frontend...

cd /d "%~dp0backend"
start /b cmd /c "python -m uvicorn app.main:app --host 0.0.0.0 --port 2509 --reload"

cd /d "%~dp0frontend"
start /b cmd /c "npm run dev -- --host 0.0.0.0 --port 2508"

echo.
echo Both started in background!
echo Open browser: http://localhost:2508
echo.
echo Press Ctrl+C to stop both services.
pause
