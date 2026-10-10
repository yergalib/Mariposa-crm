@echo off
"C:\Users\Ameliestore\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe" -NoLogo -NoProfile -File "%~dp0assistant-smoke-local.ps1" -SelfTest
echo.
echo Diagnostic only: fake key, no network. Report OFFLINE_PASS or the bracketed code.
pause
