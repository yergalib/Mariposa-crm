param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$child = $null; $secret = $null; $bstr = [IntPtr]::Zero; $resultCode = 2
$stage = 'RUNTIME'; $safeReason = 'LOCAL_FAILURE'
try {
    if ($PSVersionTable.PSVersion.Major -lt 7 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'Runtime' }
    $stage = 'TRANSCRIPTION_POLICY'
    foreach ($scope in @('HKLM:', 'HKCU:')) {
        foreach ($vendor in @('Microsoft\Windows\PowerShell', 'Microsoft\PowerShellCore')) {
            $policyPath = "$scope\Software\Policies\$vendor\Transcription"
            if (Test-Path -LiteralPath $policyPath) {
                $policy = Get-ItemProperty -LiteralPath $policyPath
                if ($policy.PSObject.Properties.Name -contains 'EnableTranscripting' -and $policy.EnableTranscripting -eq 1) { throw 'Managed transcription' }
            }
        }
    }
    $stage = 'SESSION_HISTORY'
    try { Stop-Transcript -ErrorAction Stop | Out-Null } catch { }
    if (Get-Module PSReadLine) { Set-PSReadLineOption -HistorySaveStyle SaveNothing; Clear-History }
    function New-PrivateStart([string]$mode) {
        $info = [System.Diagnostics.ProcessStartInfo]::new()
        $info.FileName = 'C:\Program Files\nodejs\node.exe'
        $info.WorkingDirectory = Split-Path -Parent $PSScriptRoot
        $info.UseShellExecute = $false; $info.CreateNoWindow = $true
        $info.RedirectStandardInput = $true; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
        $info.Environment.Clear()
        foreach ($name in @('SystemRoot', 'WINDIR', 'TEMP', 'TMP')) {
            $value = [Environment]::GetEnvironmentVariable($name)
            if ($value) { $info.Environment[$name] = $value }
        }
        $info.ArgumentList.Add((Join-Path $PSScriptRoot 'assistant-repeat-16.cjs'))
        $info.ArgumentList.Add($mode)
        return $info
    }
    $stage = 'READINESS_START'
    $child = [System.Diagnostics.Process]::Start((New-PrivateStart '--check'))
    $child.StandardInput.Close(); $out = $child.StandardOutput.ReadToEndAsync(); $err = $child.StandardError.ReadToEndAsync()
    $stage = 'READINESS_WAIT'
    if (!$child.WaitForExit(15000)) { throw 'Readiness timeout' }
    $stage = 'READINESS_CHECK'
    if ($child.ExitCode -ne 0 -or $out.Result.Trim() -ne 'READY' -or $err.Result.Length -ne 0) {
        try {
            $diagnostic = $out.Result | ConvertFrom-Json
            if ($diagnostic.status -eq 'STOPPED_BEFORE_KEY' -and $diagnostic.code -in @('RESUME_ALREADY_USED_OR_UNEXPECTED_HISTORY','LEDGER_MISMATCH','ISOLATION_OR_PRICE','APPROVAL_ALREADY_USED','READINESS_FAILED')) { $safeReason = $diagnostic.code }
        } catch { }
        throw 'Readiness refused'
    }
    $child.Dispose(); $child = $null
    if ($CheckOnly) { Write-Host 'READY: no secret read, no HTTP calls.'; $resultCode = 0 }
    else {
        $stage = 'PRIVATE_CONSOLE'
        if ([Console]::IsInputRedirected -or $Host.Name -ne 'ConsoleHost') { throw 'Private console required' }
        $Host.UI.RawUI.WindowTitle = 'MARIPOSA evaluation - TOTAL USD 5'
        Write-Host '16 synthetic two-turn dialogues. One key input for this entire session.'
        Write-Host 'TOTAL budget USD 5 includes all prior 136 calls / USD 2.5126816 reserved. Maximum aggregate reserve USD 4.8775584.'
        Write-Host 'At most 128 new calls, 32 turns, no automatic rechecks. Expires 2026-10-17 23:59:59 UTC+05.'
        Write-Host 'No automatic transport retries, real CRM, token-count endpoint, deployment or saved key.'
        Write-Host 'Paste only here. Enter starts the approved run; close this window to cancel.'
        $stage = 'HIDDEN_KEY_INPUT'
        $secret = Read-Host 'Paste API key (hidden)' -AsSecureString
        if ($secret.Length -lt 23 -or $secret.Length -gt 503) { throw 'Key length' }
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        # Validate all bytes before starting child or writing any secret byte.
        for ($offset = 0; $offset -lt $secret.Length; $offset++) {
            $code = [Runtime.InteropServices.Marshal]::ReadInt16($bstr, $offset * 2)
            if ($code -lt 33 -or $code -gt 126) { throw 'Key character' }
        }
        $stage = 'LIVE_CHILD'
        $child = [System.Diagnostics.Process]::Start((New-PrivateStart '--live'))
        $out = $child.StandardOutput.ReadToEndAsync(); $err = $child.StandardError.ReadToEndAsync()
        for ($offset = 0; $offset -lt $secret.Length; $offset++) { $child.StandardInput.BaseStream.WriteByte([byte][Runtime.InteropServices.Marshal]::ReadInt16($bstr, $offset * 2)) }
        $child.StandardInput.BaseStream.Flush(); $child.StandardInput.Close()
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr); $bstr = [IntPtr]::Zero
        $secret.Dispose(); $secret = $null; $code = 0
        if (!$child.WaitForExit(7230000)) { throw 'Timeout' }
        if ($child.ExitCode -ne 0 -or $err.Result.Length -ne 0) {
            try {
                $diagnostic = $out.Result | ConvertFrom-Json
                if ($diagnostic.status -eq 'STOPPED' -and $diagnostic.code -in @('AUTHENTICATION_REJECTED','HTTP_REJECTED','RUN_FAILED','LOCAL_FAILURE','EVALUATION_STOPPED')) { $safeReason = $diagnostic.code }
                if ($diagnostic.PSObject.Properties.Name -contains 'stopReason' -and $diagnostic.stopReason -in @('EVALUATION_TIMEOUT','EVALUATION_ABORTED','EVALUATION_TRANSPORT_ERROR','EVALUATION_RESPONSE_ERROR','EVALUATION_RESPONSE_INVALID','EVALUATION_RESPONSE_TOO_LARGE','HTTP_401','HTTP_429','HTTP_5XX','HTTP_ERROR','INCOMPLETE_OUTPUT','INVALID_USAGE','HTTP_OR_TRANSPORT_FAILURE','RESERVATION_FAILURE','SESSION_EXPIRED','CALL_OR_TURN_LIMIT','TURN_LIMIT','REQUEST_POLICY_LIMIT','BUDGET_LIMIT','LOCAL_RUN_FAILURE')) { $safeReason = $diagnostic.stopReason }
            } catch { }
            throw 'Stopped'
        }
        $report = $out.Result | ConvertFrom-Json
        $maxTotalCalls = 264
        if ($report.status -ne 'EVALUATION_COMPLETED' -or $report.totalCalls -lt 1 -or $report.totalCalls -gt $maxTotalCalls -or $report.reservedTokenUsd -gt 5) { throw 'Result contract' }
        Write-Host ('EVALUATION_COMPLETED: {0} provider calls. Exact replies and PASS/FAIL scorecard saved locally; semantic review still required.' -f [int]$report.totalCalls)
        Write-Host ('Task results: PASS={0}, FAIL={1}; other completed cases require semantic review.' -f [int]$report.passed, [int]$report.failed)
        $resultCode = 0
    }
} catch {
    Write-Host ([ordered]@{status='STOPPED';stage=$stage;code=$safeReason} | ConvertTo-Json -Compress)
    if ($safeReason -eq 'RESUME_ALREADY_USED_OR_UNEXPECTED_HISTORY') { Write-Host 'This one-time continuation has already been used. The existing budget ledger is preserved. Do not repeat or delete it.' }
    if ($safeReason -eq 'AUTHENTICATION_REJECTED') { Write-Host 'API returned HTTP 401 after key entry. Authentication was rejected. No automatic retry; do not paste the key in chat.' }
    Write-Host 'STOPPED safely. No automatic retry. Do not paste a key in chat.'
}
finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ($null -ne $secret) { $secret.Dispose() }
    if ($null -ne $child) { if (!$child.HasExited) { $child.Kill($true) }; $child.Dispose() }
    $out = $null; $err = $null
}
if (!$CheckOnly -and ![Console]::IsInputRedirected) { Read-Host 'Press Enter to close' | Out-Null }
exit $resultCode
