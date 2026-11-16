@echo off
title PhasmoSense Companion Overlay
cd /d "%~dp0"

:: Ensure path includes standard node/git if present
if exist "C:\Program Files\nodejs" set "PATH=C:\Program Files\nodejs;%PATH%"
set "ELECTRON_RUN_AS_NODE="

:: Locate Python Runtime (Bundled or Virtualenv)
set "PY_EXE="
if exist "%~dp0backend\runtime\python.exe" (
    set "PY_EXE=%~dp0backend\runtime\python.exe"
) else if exist "%~dp0backend\.venv\Scripts\python.exe" (
    set "PY_EXE=%~dp0backend\.venv\Scripts\python.exe"
)

:: [Step 1] Check for updates via Delta Updater (fast 2s timeout check)
if not "%PY_EXE%"=="" (
    echo ========================================================
    echo   PhasmoSense - Checking for Updates...
    echo ========================================================
    "%PY_EXE%" "%~dp0backend\updater.py"
    echo.
)

:: [Step 2] Verify Dependencies or Run Installer
set "ELECTRON_EXE="
if exist "%~dp0overlay\electron-bin\electron.exe" (
    set "ELECTRON_EXE=%~dp0overlay\electron-bin\electron.exe"
) else if exist "%~dp0overlay\node_modules\electron\dist\electron.exe" (
    set "ELECTRON_EXE=%~dp0overlay\node_modules\electron\dist\electron.exe"
)

if "%ELECTRON_EXE%"=="" (
    if exist "%~dp0install-and-run.bat" (
        call "%~dp0install-and-run.bat"
        exit /b 0
    ) else (
        echo [ERROR] Electron executable not found!
        pause
        exit /b 1
    )
)

if "%PY_EXE%"=="" (
    if exist "%~dp0install-and-run.bat" (
        call "%~dp0install-and-run.bat"
        exit /b 0
    ) else (
        echo [ERROR] Python environment not found!
        pause
        exit /b 1
    )
)

echo ========================================================
echo   PhasmoSense - Anti-Cheat-Safe Overlay ^& Ghost Solver
echo ========================================================
echo.
echo Launching Electron Overlay ^& Background Engines...
start "" "%ELECTRON_EXE%" "%~dp0overlay"
echo.
echo Overlay is active!
echo   - Alt+Q: Toggle Interactive Discord-style HUD
echo   - Alt+Z: Undo last auto-detection
echo   - Alt+S: Start/Stop 180s Smudge Incense Timer
echo   - Alt+M: Toggle Audio Footstep Recording
echo   - Alt+V: Toggle Screen CV / OCR Capture
echo   - Alt+B: Tap Ghost BPM manually
echo   - Alt+R: Reset Match
timeout /t 3 >nul
