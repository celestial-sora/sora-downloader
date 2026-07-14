@echo off
title Sora Downloader Launcher
echo ==============================================
echo        Starting Sora Downloader...
echo ==============================================
echo.

:: Open local browser after 3 seconds in a separate process
echo [1/2] Preparing browser redirection to http://localhost:3000...
start /b cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:3000"

:: Start Next.js development server in foreground
echo [2/2] Launching Next.js development server...
echo.
npm run dev
