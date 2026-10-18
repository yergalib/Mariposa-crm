@echo off
setlocal
title MARIPOSA - final acceptance, max 16 calls, total USD 6
set "evaluationPowerShell=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
if not exist "%evaluationPowerShell%" (
  echo PowerShell runtime missing. No evaluation started.
  pause
  exit /b 2
)
if /I "%~1"=="--check" (
  "%evaluationPowerShell%" -NoProfile -File "%~dp0assistant-close-live.ps1" -CheckOnly
  exit /b
)
"%evaluationPowerShell%" -NoProfile -File "%~dp0assistant-close-live.ps1"
pause
