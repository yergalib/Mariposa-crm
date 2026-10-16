param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$child = $null; $secret = $null; $bstr = [IntPtr]::Zero; $resultCode = 2
try {
    if ($PSVersionTable.PSVersion.Major -lt 7 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'Runtime' }
    foreach ($scope in @('HKLM:', 'HKCU:')) {
        foreach ($vendor in @('Microsoft\Windows\PowerShell', 'Microsoft\PowerShellCore')) {
            $policyPath = "$scope\Software\Policies\$vendor\Transcription"
            if (Test-Path -LiteralPath $policyPath) {
                $policy = Get-ItemProperty -LiteralPath $policyPath
                if ($policy.PSObject.Properties.Name -contains 'EnableTranscripting' -and $policy.EnableTranscripting -eq 1) { throw 'Managed transcription' }
            }
        }
    }
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
        return $info
    }
    $child = [System.Diagnostics.Process]::Start((New-PrivateStart '--check'))
    $child.StandardInput.Close(); $out = $child.StandardOutput.ReadToEndAsync(); $err = $child.StandardError.ReadToEndAsync()
    if (!$child.WaitForExit(15000)) { throw 'Readiness timeout' }
    if ($child.ExitCode -ne 0 -or $out.Result.Trim() -ne 'READY' -or $err.Result.Length -ne 0) { throw 'Readiness refused' }
    $child.Dispose(); $child = $null
    if ($CheckOnly) { Write-Host 'READY: no secret read, no HTTP calls.'; $resultCode = 0 }
    else {
        if ([Console]::IsInputRedirected -or $Host.Name -ne 'ConsoleHost') { throw 'Private console required' }
        $Host.UI.RawUI.WindowTitle = 'MARIPOSA AI smoke - USD 0.25'
        Write-Host 'Approved synthetic smoke: 3 turns, at most 12 provider calls including reviews.'
        Write-Host 'Total authorization USD 0.25; conservative token reserve USD 0.2217072.'
        Write-Host 'No retries, real CRM, token-count endpoint, deployment or saved key.'
        Write-Host 'Paste only here. Enter starts the approved run; close this window to cancel.'
        $secret = Read-Host 'Paste API key (hidden)' -AsSecureString
        if ($secret.Length -lt 23 -or $secret.Length -gt 503) { throw 'Key length' }
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        # Validate all bytes before starting child or writing any secret byte.
        for ($offset = 0; $offset -lt $secret.Length; $offset++) {
            $code = [Runtime.InteropServices.Marshal]::ReadInt16($bstr, $offset * 2)
            if ($code -lt 33 -or $code -gt 126) { throw 'Key character' }
        }
        $child = [System.Diagnostics.Process]::Start((New-PrivateStart '--live'))
        $out = $child.StandardOutput.ReadToEndAsync(); $err = $child.StandardError.ReadToEndAsync()
        for ($offset = 0; $offset -lt $secret.Length; $offset++) { $child.StandardInput.BaseStream.WriteByte([byte][Runtime.InteropServices.Marshal]::ReadInt16($bstr, $offset * 2)) }
        $child.StandardInput.BaseStream.Flush(); $child.StandardInput.Close()
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr); $bstr = [IntPtr]::Zero
        $secret.Dispose(); $secret = $null; $code = 0
        if (!$child.WaitForExit(610000)) { throw 'Timeout' }
        if ($child.ExitCode -ne 0 -or $err.Result.Length -ne 0) { throw 'Stopped' }
        $report = $out.Result | ConvertFrom-Json
        if ($report.status -ne 'LIVE_COMPLETED' -or $report.attempts -lt 1 -or $report.attempts -gt 12 -or $report.reservedTokenUsd -gt 0.25) { throw 'Result contract' }
        Write-Host ('LIVE_COMPLETED: {0} provider calls. Final reviewed replies saved in local evidence.' -f [int]$report.attempts)
        $resultCode = 0
    }
} catch { Write-Host 'STOPPED safely. No automatic retry. Do not paste a key in chat.' }
finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ($null -ne $secret) { $secret.Dispose() }
    if ($null -ne $child) { if (!$child.HasExited) { $child.Kill($true) }; $child.Dispose() }
    $out = $null; $err = $null
}
if (!$CheckOnly -and ![Console]::IsInputRedirected) { Read-Host 'Press Enter to close' | Out-Null }
exit $resultCode
