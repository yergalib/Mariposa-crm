@echo off
setlocal
title MARIPOSA - Resume existing USD 0.25 smoke
set "smokePowerShell=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
if not exist "%smokePowerShell%" (
  echo PowerShell runtime is missing. No test was started.
  pause
  exit /b 2
)
if /I "%~1"=="--check" (
  "%smokePowerShell%" -NoProfile -File "%~dp0assistant-small-smoke.ps1" -Resume -CheckOnly
  exit /b
)
echo Resuming the existing approval. Prior reserve USD 0.0184756 is preserved.
echo Enter the key only at the hidden prompt below. Closing the window cancels.
"%smokePowerShell%" -NoProfile -File "%~dp0assistant-small-smoke.ps1" -Resume
echo.
echo Window retained for you to read the result. No automatic repeat.
pause
