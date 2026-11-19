@echo off
:: FSP Dev Launcher (double-clickable)
:: Runs the full dev stack via PowerShell with execution policy bypass.
:: UTF-8 mode for Windows console output
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start-fsp-dev.ps1"
endlocal
