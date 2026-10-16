@echo off
setlocal
title MARIPOSA - 24 dialogues, total USD 5
set "evaluationPowerShell=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
if not exist "%evaluationPowerShell%" (
  echo PowerShell runtime missing. No evaluation started.
  pause
  exit /b 2
)
if /I "%~1"=="--check" (
  "%evaluationPowerShell%" -NoProfile -File "%~dp0assistant-evaluation.ps1" -CheckOnly
  exit /b
)
"%evaluationPowerShell%" -NoProfile -File "%~dp0assistant-evaluation.ps1"
pause
