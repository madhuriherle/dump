@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title ATMS_Launcher

REM Close the previous launcher window (if any) now that this one is taking
REM over, so old windows don't pile up when launched multiple times (e.g.
REM autostart + manual double-click). Each run tags its own window with a
REM unique title and records it; the next run kills whatever title it finds.
set titlefile=%~dp0.launcher.title
if exist "%titlefile%" (
    set /p oldtitle=<"%titlefile%"
    if defined oldtitle taskkill /FI "WINDOWTITLE eq !oldtitle!" /F >nul 2>&1
)
set mytitle=ATMS_Launcher_%RANDOM%%RANDOM%
title !mytitle!
echo !mytitle!>"%titlefile%"

echo ========================================
echo  Anegudde Inventory System - Starting
echo ========================================

echo.
echo Waiting for network connection (WiFi/Ethernet)...
set waitcount=0
:waitnet
set lanip=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" ^| findstr /v "169.254"') do (
    if not defined lanip set lanip=%%a
)
if defined lanip goto networkready
set /a waitcount+=1
if %waitcount% GEQ 45 (
    echo WARNING: No network detected after 90 seconds - continuing anyway.
    goto networkready
)
ping -n 3 127.0.0.1 >nul
goto waitnet
:networkready
if defined lanip (
    for /f "tokens=* delims= " %%a in ("!lanip!") do set lanip=%%a
    echo Network connected. LAN IP: !lanip!
) else (
    echo Network not detected - only localhost will be reachable.
)

REM Guard against two copies of this script racing each other (e.g. the
REM Startup-folder auto-launch and a manual double-click landing at the
REM same time) - mkdir is atomic, so only one instance can win the lock.
REM A lock older than 60s is assumed to be from a crashed run and is
REM cleared rather than blocking forever.
set lockdir=%~dp0.launch.lock
set lockwait=0
:trylock
mkdir "%lockdir%" 2>nul
if not errorlevel 1 goto lockacquired
for /f %%a in ('powershell -NoProfile -Command "if (Test-Path '%lockdir%') { $age=((Get-Date) - (Get-Item '%lockdir%').CreationTime).TotalSeconds; if ($age -gt 60) {1} else {0} } else {1}"') do set stale=%%a
if "%stale%"=="1" (
    rmdir "%lockdir%" >nul 2>&1
    goto trylock
)
set /a lockwait+=1
if %lockwait% GEQ 30 (
    echo Another instance appears stuck starting up - proceeding anyway.
    rmdir "%lockdir%" >nul 2>&1
    goto trylock
)
ping -n 2 127.0.0.1 >nul
goto trylock
:lockacquired

echo.
echo Stopping any existing instances...

REM Layer 1: kill by the exact PID recorded from the previous run - fast
REM and precise, no blanket killing of every node/python process on the
REM machine.
if exist ".backend.pid" (
    set /p oldbackendpid=<".backend.pid"
    if defined oldbackendpid taskkill /PID !oldbackendpid! /T /F >nul 2>&1
    del ".backend.pid" >nul 2>&1
)
if exist ".frontend.pid" (
    set /p oldfrontendpid=<".frontend.pid"
    if defined oldfrontendpid taskkill /PID !oldfrontendpid! /T /F >nul 2>&1
    del ".frontend.pid" >nul 2>&1
)

REM Layer 2: catch anything still squatting on our ports (first run before
REM PID files existed, or an instance started outside this script).
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :2508 ^| findstr LISTENING 2^>nul') do taskkill /PID %%p /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :2509 ^| findstr LISTENING 2^>nul') do taskkill /PID %%p /F >nul 2>&1

echo.
echo Starting Backend and Frontend...

cd /d "%~dp0backend"
for /f %%i in ('powershell -NoProfile -Command "(Start-Process cmd -ArgumentList '/c python -m uvicorn app.main:app --host 0.0.0.0 --port 2509 --reload' -WindowStyle Hidden -PassThru).Id"') do set backendpid=%%i
echo !backendpid!>"%~dp0.backend.pid"

cd /d "%~dp0frontend"
for /f %%i in ('powershell -NoProfile -Command "(Start-Process cmd -ArgumentList '/c npm run dev' -WindowStyle Hidden -PassThru).Id"') do set frontendpid=%%i
echo !frontendpid!>"%~dp0.frontend.pid"

rmdir "%lockdir%" >nul 2>&1

echo.
echo Both started in background!
echo Open browser (this PC):     http://localhost:2508
if defined lanip echo Open browser (other devices): http://!lanip!:2508
echo.
pause
