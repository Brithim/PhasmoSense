@echo off
title PhasmoSense - Auto-Installer & Launcher
cd /d "%~dp0"

echo ====================================================================
echo   PhasmoSense - One-Click Setup & Launcher (16:9 / 21:9 / 32:9)
echo ====================================================================
echo.

:: 1. Ensure Node.js is installed
if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo [Setup] Node.js not found. Installing Node.js LTS via winget...
        winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

:: 2. Locate or Install Python 3.12
set "SYS_PY="
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "SYS_PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if "%SYS_PY%"=="" if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "SYS_PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if "%SYS_PY%"=="" if exist "C:\Program Files\Python312\python.exe" set "SYS_PY=C:\Program Files\Python312\python.exe"

if "%SYS_PY%"=="" (
    echo [Setup] Python 3.12 not found. Installing Python 3.12 via winget...
    winget install --id Python.Python.3.12 --exact --silent --accept-package-agreements --accept-source-agreements
    if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
        set "SYS_PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    ) else (
        set "SYS_PY=python"
    )
)

:: 3. Verify or Create Python Virtual Environment
"%~dp0backend\.venv\Scripts\python.exe" -c "import fastapi, cv2, mss, rapidocr_onnxruntime" >nul 2>nul
if errorlevel 1 (
    echo [Setup] Configuring Python Computer Vision & Audio DSP environment...
    if exist "%~dp0backend\.venv" rmdir /s /q "%~dp0backend\.venv"
    "%SYS_PY%" -m venv "%~dp0backend\.venv"
    "%~dp0backend\.venv\Scripts\python.exe" -m pip install --upgrade pip
    "%~dp0backend\.venv\Scripts\pip.exe" install -r "%~dp0backend\requirements.txt"
)

:: 4. Verify or Install Overlay Node Modules & Unpack Electron Binary via Python
cd /d "%~dp0overlay"
if not exist "%~dp0overlay\node_modules\electron" (
    echo [Setup] Installing Overlay UI packages...
    call "C:\Program Files\nodejs\npm.cmd" install
)

if not exist "%~dp0overlay\node_modules\electron\dist\electron.exe" (
    echo [Setup] Unpacking Electron desktop overlay runtime...
    "%~dp0backend\.venv\Scripts\python.exe" "%~dp0backend\setup_electron.py"
)

if not exist "%~dp0overlay\dist\index.html" (
    echo [Setup] Building production Overlay UI...
    call "C:\Program Files\nodejs\npm.cmd" run build
)

:: 5. Launch PhasmoSense
echo.
echo [Ready] Launching PhasmoSense Overlay & Sidecar...
set "ELECTRON_RUN_AS_NODE="
start "" "%~dp0overlay\node_modules\electron\dist\electron.exe" "%~dp0overlay"
echo.
echo ====================================================================
echo   PhasmoSense is now running!
echo   - Automatically adapts to 16:9, 21:9 Ultrawide, and 32:9 monitors
echo   - Press Alt+Q in-game to toggle the Full Interactive Overlay
echo ====================================================================
timeout /t 4 >nul
