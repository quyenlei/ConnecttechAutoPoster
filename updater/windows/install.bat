@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
set CAP_EXIT=%errorlevel%
if not defined CAP_UPDATER_TEST pause
exit /b %CAP_EXIT%
