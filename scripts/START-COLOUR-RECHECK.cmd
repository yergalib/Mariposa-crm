@echo off
setlocal
title MARIPOSA - Colour recheck, same USD 0.25 budget
set "smokePowerShell=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
if not exist "%smokePowerShell%" (
  echo PowerShell runtime missing. Nothing started.
  pause
  exit /b 2
)
if /I "%~1"=="--check" (
  "%smokePowerShell%" -NoProfile -File "%~dp0assistant-small-smoke.ps1" -ColourRecheck -CheckOnly
  exit /b
)
echo Previous reserve USD 0.1662804 is preserved. No automatic retries.
"%smokePowerShell%" -NoProfile -File "%~dp0assistant-small-smoke.ps1" -ColourRecheck
pause
