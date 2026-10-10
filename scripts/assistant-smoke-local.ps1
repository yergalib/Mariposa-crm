param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$smokeChild = $null
$smokeSecret = $null
$smokeBstr = [IntPtr]::Zero
$smokeExit = 2
try {
    if ($PSVersionTable.PSVersion.Major -lt 7 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'PowerShell 7 FullLanguage required' }
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
    try { Stop-Transcript -ErrorAction Stop | Out-Null } catch { }
    if (Get-Module PSReadLine) { Set-PSReadLineOption -HistorySaveStyle SaveNothing; Clear-History }
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
    $smokeCheck = [System.Diagnostics.Process]::Start((New-SmokeStartInfo '--check'))
    $smokeCheck.StandardInput.Close()
    $checkOutput = $smokeCheck.StandardOutput.ReadToEndAsync()
    $checkError = $smokeCheck.StandardError.ReadToEndAsync()
    if (!$smokeCheck.WaitForExit(15000)) { $smokeCheck.Kill($true); throw 'Readiness timeout' }
    $checkExit = $smokeCheck.ExitCode
    $smokeCheck.Dispose()
    if ($checkExit -ne 0 -or $checkOutput.Result.Trim() -ne 'READY' -or $checkError.Result.Length -ne 0) { throw 'Readiness refused: expired profile or used approval' }
    if ($SelfTest) {
        $smokeSecret = ConvertTo-SecureString 'MARIPOSA_FAKE_KEY_NO_NETWORK' -AsPlainText -Force
        $smokeMode = '--self-test'
    } else {
        if ([Console]::IsInputRedirected -or $Host.Name -ne 'ConsoleHost') { throw 'Private user console required' }
        Write-Host 'MARIPOSA: one synthetic test, at most 3 generation attempts, no retries.'
        Write-Host 'Token ceiling USD 0.869715; no CRM, photos, deployment or customer data.'
        Write-Host 'Use a dedicated test project/key. Stop if account extras could exceed USD 1.'
        $answer = Read-Host 'Type TEST if this is your dedicated test key and the total budget is acceptable; otherwise Enter'
        if ($answer -cne 'TEST') { throw 'Cancelled' }
        $smokeSecret = Read-Host 'Paste test API key (hidden); press Enter' -AsSecureString
        if ($smokeSecret.Length -lt 20 -or $smokeSecret.Length -gt 512) { throw 'Invalid length' }
        $smokeMode = '--live'
    }
    $smokeChild = [System.Diagnostics.Process]::Start((New-SmokeStartInfo $smokeMode))
    $childOutput = $smokeChild.StandardOutput.ReadToEndAsync()
    $childError = $smokeChild.StandardError.ReadToEndAsync()
    $smokeBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($smokeSecret)
    for ($offset = 0; $offset -lt $smokeSecret.Length; $offset++) {
        $code = [Runtime.InteropServices.Marshal]::ReadInt16($smokeBstr, $offset * 2)
        if ($code -lt 33 -or $code -gt 126) { throw 'Invalid key character' }
        $smokeChild.StandardInput.BaseStream.WriteByte([byte]$code)
    }
    $smokeChild.StandardInput.BaseStream.Flush()
    $smokeChild.StandardInput.Close()
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($smokeBstr)
    $smokeBstr = [IntPtr]::Zero
    $smokeSecret.Dispose(); $smokeSecret = $null; $code = 0
    if (!$smokeChild.WaitForExit(120000)) { $smokeChild.Kill($true); throw 'Timed out, no retry' }
    # Child diagnostics are never echoed. Only allow a fixed, non-secret status summary.
    if ($smokeChild.ExitCode -ne 0 -or $childError.Result.Length -ne 0) { throw 'Test stopped, no retry' }
    $report = $childOutput.Result | ConvertFrom-Json
    if ($SelfTest -and $report.status -eq 'OFFLINE_PASS' -and $report.realHttpAttempts -eq 0 -and $report.syntheticAttempts -eq 3) {
        Write-Host 'OFFLINE_PASS: fake key pipe, 3 synthetic attempts, 0 HTTP calls.'
    } elseif (!$SelfTest -and $report.status -eq 'LIVE_COMPLETED' -and $report.attempts -ge 1 -and $report.attempts -le 3 -and $report.reservedTokenUsd -le 0.869715) {
        Write-Host ('LIVE_COMPLETED: attempts={0}, comparisons={1}. Revoke the test key now.' -f [int]$report.attempts, [int]$report.comparisons)
    } else { throw 'Invalid result' }
    $smokeExit = 0
} catch {
    Write-Host 'STOPPED safely. No automatic retry. Do not paste a key in chat.'
} finally {
    if ($smokeBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($smokeBstr) }
    if ($null -ne $smokeSecret) { $smokeSecret.Dispose() }
    if ($null -ne $smokeChild) { if (!$smokeChild.HasExited) { $smokeChild.Kill($true) }; $smokeChild.Dispose() }
    $childOutput = $null; $childError = $null
}
exit $smokeExit
