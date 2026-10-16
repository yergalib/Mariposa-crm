param([switch]$CheckOnly, [switch]$Resume, [switch]$ResumeAfter401)
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
        $info.ArgumentList.Add((Join-Path $PSScriptRoot 'assistant-small-smoke.cjs'))
        $info.ArgumentList.Add($mode)
        if ($ResumeAfter401) { $info.ArgumentList.Add('--resume-after401') }
        elseif ($Resume) { $info.ArgumentList.Add('--resume') }
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
        $Host.UI.RawUI.WindowTitle = 'MARIPOSA AI smoke - USD 0.25'
        if ($ResumeAfter401) {
            Write-Host 'Same USD 0.25 approval: both earlier attempts remain reserved, USD 0.0369512.'
            Write-Host 'Remaining authorization USD 0.2130488. At most 8 new calls / 2 turns.'
            Write-Host 'Starting at attempt 3. Maximum aggregate reserve USD 0.184756.'
        } elseif ($Resume) {
            Write-Host 'Same USD 0.25 approval: previous USD 0.0184756 remains fully reserved.'
            Write-Host 'Remaining budget USD 0.2315244; this continuation allows 2 turns / 8 new calls.'
            Write-Host 'Total reserve including first attempt cannot exceed USD 0.1662804.'
        } else {
            Write-Host 'Approved synthetic smoke: 3 turns, at most 12 provider calls including reviews.'
            Write-Host 'Total authorization USD 0.25; conservative token reserve USD 0.2217072.'
        }
        Write-Host 'No automatic retries, real CRM, token-count endpoint, deployment or saved key.'
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
        if (!$child.WaitForExit(610000)) { throw 'Timeout' }
        if ($child.ExitCode -ne 0 -or $err.Result.Length -ne 0) {
            try {
                $diagnostic = $out.Result | ConvertFrom-Json
                if ($diagnostic.status -eq 'STOPPED' -and $diagnostic.code -in @('AUTHENTICATION_REJECTED','HTTP_REJECTED','RUN_FAILED','LOCAL_FAILURE')) { $safeReason = $diagnostic.code }
            } catch { }
            throw 'Stopped'
        }
        $report = $out.Result | ConvertFrom-Json
        if ($report.status -ne 'LIVE_COMPLETED' -or $report.attempts -lt 1 -or $report.attempts -gt 12 -or $report.reservedTokenUsd -gt 0.25) { throw 'Result contract' }
        Write-Host ('LIVE_COMPLETED: {0} provider calls. Final reviewed replies saved in local evidence.' -f [int]$report.attempts)
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
