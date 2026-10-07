@echo off
title RTX5 - Expo Dev Server
echo.
echo ============================================
echo   RTX5 - Starting Expo Go QR Connection...
echo ============================================
echo.
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "PATH=%LOCALAPPDATA%\Android\Sdk\platform-tools;%PATH%"
cd /d "%~dp0rtx5-app"
if "%~1"=="" (
  node scripts\android\start-dev-client-usb.js --go --tunnel
) else (
  node scripts\android\start-dev-client-usb.js --go %*
)
pause
