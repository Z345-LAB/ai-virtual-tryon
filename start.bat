@echo off
chcp 65001 >nul
title Ciyuan Atelier - Local Server
cd /d "%~dp0"

echo ============================================
echo   Ciyuan Atelier / Local Server
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo Please install Node.js 18+ from https://nodejs.org
    echo After installing, run this file again.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -v') do echo [OK] Node.js %%v detected

if not exist "node_modules" (
    echo.
    echo [1/2] Installing dependencies, please wait...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. Try switching registry:
        echo     npm config set registry https://registry.npmmirror.com
        echo.
        pause
        exit /b 1
    )
) else (
    echo [OK] Dependencies already installed
)

echo.
echo [2/2] Starting server...
echo.
echo     Open this address in your browser:
echo     http://localhost:3000
echo.
echo     Keep this window open while using the site.
echo     Press Ctrl+C or close this window to stop.
echo.
call npm start

echo.
echo Server stopped.
pause
