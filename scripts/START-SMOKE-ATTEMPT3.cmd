@echo off
setlocal
title MARIPOSA - Attempt 3, same USD 0.25 budget
set "smokePowerShell=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
if not exist "%smokePowerShell%" (
  echo PowerShell runtime missing. Nothing started.
  pause
  exit /b 2
)
if /I "%~1"=="--check" (
  "%smokePowerShell%" -NoProfile -File "%~dp0assistant-small-smoke.ps1" -ResumeAfter401 -CheckOnly
  exit /b
)
echo Previous reserve USD 0.0369512 is preserved. No automatic retries.
"%smokePowerShell%" -NoProfile -File "%~dp0assistant-small-smoke.ps1" -ResumeAfter401
pause
