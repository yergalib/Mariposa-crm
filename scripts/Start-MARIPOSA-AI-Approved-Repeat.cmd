@echo off
"C:\Users\Ameliestore\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe" -NoLogo -NoProfile -File "%~dp0assistant-smoke-local.ps1" -ApprovedRepeat
echo.
echo Result is saved. No automatic retry. Never paste your key in chat.
pause
