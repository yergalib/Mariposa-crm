param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$smokeChild = $null
$smokeSecret = $null
$smokeBstr = [IntPtr]::Zero
$smokeExit = 2
$smokeStage = 'PS_RUNTIME'
try {
    if ($PSVersionTable.PSVersion.Major -lt 7 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'PowerShell 7 FullLanguage required' }
    $smokeStage = 'TRANSCRIPT_POLICY'
    # Never disable an enforced audit policy. Refuse before any key prompt instead.
    foreach ($scope in @('HKLM:', 'HKCU:')) {
        foreach ($vendor in @('Microsoft\Windows\PowerShell', 'Microsoft\PowerShellCore')) {
            $policyPath = "$scope\Software\Policies\$vendor\Transcription"
            if (Test-Path -LiteralPath $policyPath) {
                $policy = Get-ItemProperty -LiteralPath $policyPath
                if ($policy.PSObject.Properties.Name -contains 'EnableTranscripting' -and $policy.EnableTranscripting -eq 1) { throw 'Managed transcription enabled' }
            }
        }
    }
    $smokeStage = 'SESSION_HISTORY'
    try { Stop-Transcript -ErrorAction Stop | Out-Null } catch { }
    if (Get-Module PSReadLine) { Set-PSReadLineOption -HistorySaveStyle SaveNothing; Clear-History }
    $smokeStage = 'LOCAL_PATHS'
    $smokeRoot = Split-Path -Parent $PSScriptRoot
    $smokeRunner = Join-Path $PSScriptRoot 'assistant-smoke-local.cjs'
    $smokeNode = 'C:\Program Files\nodejs\node.exe'
    if (!(Test-Path -LiteralPath $smokeNode)) { throw 'Node missing' }
    function New-SmokeStartInfo([string]$mode) {
        $info = [System.Diagnostics.ProcessStartInfo]::new()
        $info.FileName = $smokeNode
        $info.WorkingDirectory = $smokeRoot
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        $info.RedirectStandardInput = $true
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true
        $info.Environment.Clear()
        foreach ($name in @('SystemRoot', 'WINDIR', 'TEMP', 'TMP')) {
            $value = [Environment]::GetEnvironmentVariable($name)
            if ($value) { $info.Environment[$name] = $value }
        }
        $info.ArgumentList.Add($smokeRunner)
        $info.ArgumentList.Add($mode)
        return $info
    }
    $smokeStage = 'NODE_CHECK_START'
    $smokeCheck = [System.Diagnostics.Process]::Start((New-SmokeStartInfo '--check'))
    $smokeCheck.StandardInput.Close()
    $checkOutput = $smokeCheck.StandardOutput.ReadToEndAsync()
    $checkError = $smokeCheck.StandardError.ReadToEndAsync()
    $smokeStage = 'NODE_CHECK_TIMEOUT'
    if (!$smokeCheck.WaitForExit(15000)) { $smokeCheck.Kill($true); throw 'Readiness timeout' }
    $checkExit = $smokeCheck.ExitCode
    $smokeCheck.Dispose()
    $smokeStage = 'NODE_CHECK_FAILED'
    if ($checkExit -ne 0 -or $checkOutput.Result.Trim() -ne 'READY' -or $checkError.Result.Length -ne 0) {
        try {
            $safeCheck = $checkOutput.Result | ConvertFrom-Json
            if ($safeCheck.status -eq 'STOPPED' -and $safeCheck.code -in @('PRICE_EXPIRED','APPROVAL_OR_SCOPE','LEDGER_DIRECTORY_ACCESS','NODE_VERSION','DEPENDENCY_LOAD')) { $smokeStage = $safeCheck.code }
        } catch { }
        throw 'Readiness refused'
    }
    if ($SelfTest) {
        $smokeStage = 'FAKE_INPUT'
        $smokeSecret = ConvertTo-SecureString 'MARIPOSA_FAKE_KEY_NO_NETWORK' -AsPlainText -Force
        $smokeMode = '--self-test'
    } else {
        $smokeStage = 'PRIVATE_CONSOLE'
        if ([Console]::IsInputRedirected -or $Host.Name -ne 'ConsoleHost') { throw 'Private user console required' }
        Write-Host 'MARIPOSA: one synthetic test, at most 3 generation attempts, no retries.'
        Write-Host 'Token ceiling USD 0.869715; no CRM, photos, deployment or customer data.'
        Write-Host 'Use a dedicated test project/key. Stop if account extras could exceed USD 1.'
        $smokeStage = 'USER_CONFIRMATION'
        $answer = Read-Host 'Type TEST if this is your dedicated test key and the total budget is acceptable; otherwise Enter'
        if ($answer -cne 'TEST') { $smokeStage = 'USER_CANCELLED'; throw 'Cancelled' }
        $smokeStage = 'HIDDEN_INPUT'
        $smokeSecret = Read-Host 'Paste test API key (hidden); press Enter' -AsSecureString
        $smokeStage = 'KEY_LENGTH'
        if ($smokeSecret.Length -lt 20 -or $smokeSecret.Length -gt 512) { throw 'Invalid length' }
        $smokeMode = '--live'
    }
    $smokeStage = 'NODE_RUN_START'
    $smokeChild = [System.Diagnostics.Process]::Start((New-SmokeStartInfo $smokeMode))
    $childOutput = $smokeChild.StandardOutput.ReadToEndAsync()
    $childError = $smokeChild.StandardError.ReadToEndAsync()
    $smokeStage = 'SECRET_PIPE'
    $smokeBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($smokeSecret)
    for ($offset = 0; $offset -lt $smokeSecret.Length; $offset++) {
        $code = [Runtime.InteropServices.Marshal]::ReadInt16($smokeBstr, $offset * 2)
        if ($code -lt 33 -or $code -gt 126) { $smokeStage = 'KEY_CHARACTER'; throw 'Invalid key character' }
        $smokeChild.StandardInput.BaseStream.WriteByte([byte]$code)
    }
    $smokeChild.StandardInput.BaseStream.Flush()
    $smokeChild.StandardInput.Close()
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($smokeBstr)
    $smokeBstr = [IntPtr]::Zero
    $smokeSecret.Dispose(); $smokeSecret = $null; $code = 0
    $smokeStage = 'RUN_TIMEOUT'
    if (!$smokeChild.WaitForExit(120000)) { $smokeChild.Kill($true); throw 'Timed out, no retry' }
    # Child diagnostics are never echoed. Only allow a fixed, non-secret status summary.
    $smokeStage = 'NODE_RUN_FAILED'
    if ($smokeChild.ExitCode -ne 0 -or $childError.Result.Length -ne 0) {
        try {
            $safeRun = $childOutput.Result | ConvertFrom-Json
            if ($safeRun.status -eq 'STOPPED' -and $safeRun.code -in @('LEDGER_RESERVE','SECRET_PIPE_INPUT','KEY_FORMAT','SCENARIO_RUN')) { $smokeStage = $safeRun.code }
        } catch { }
        throw 'Test stopped, no retry'
    }
    $smokeStage = 'RESULT_CONTRACT'
    $report = $childOutput.Result | ConvertFrom-Json
    if ($SelfTest -and $report.status -eq 'OFFLINE_PASS' -and $report.realHttpAttempts -eq 0 -and $report.syntheticAttempts -eq 3) {
        Write-Host 'OFFLINE_PASS: fake key pipe, 3 synthetic attempts, 0 HTTP calls.'
    } elseif (!$SelfTest -and $report.status -eq 'LIVE_COMPLETED' -and $report.attempts -ge 1 -and $report.attempts -le 3 -and $report.reservedTokenUsd -le 0.869715) {
        Write-Host ('LIVE_COMPLETED: attempts={0}, comparisons={1}. Revoke the test key now.' -f [int]$report.attempts, [int]$report.comparisons)
    } else { throw 'Invalid result' }
    $smokeExit = 0
} catch {
    Write-Host ('STOPPED safely [{0}]. No automatic retry. Do not paste a key in chat.' -f $smokeStage)
} finally {
    if ($smokeBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($smokeBstr) }
    if ($null -ne $smokeSecret) { $smokeSecret.Dispose() }
    if ($null -ne $smokeChild) { if (!$smokeChild.HasExited) { $smokeChild.Kill($true) }; $smokeChild.Dispose() }
    $childOutput = $null; $childError = $null
}
exit $smokeExit
