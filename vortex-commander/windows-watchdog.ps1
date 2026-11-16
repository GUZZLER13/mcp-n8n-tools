# VORTEX Commander - Windows user-level watchdog.
# Launched at user logon by a dedicated Startup shortcut, not as Administrator.
# Restarts a crashed agent; the agent itself reconnects after network loss/sleep.
# No changes to the legacy Remote Desktop Commander or other applications.
$ErrorActionPreference = 'Stop'
$Dest = Join-Path $HOME 'remote-mcp-agent'
$Agent = Join-Path $Dest 'agent\agent.js'
$PairConfig = Join-Path $HOME '.config\remote-mcp\device.json'
$NodeCmd = Get-Command node.exe -ErrorAction Stop
$Node = $NodeCmd.Source

if (-not (Test-Path -LiteralPath $Agent -PathType Leaf)) { throw 'VORTEX agent not installed.' }
if (-not (Test-Path -LiteralPath $PairConfig -PathType Leaf)) { throw 'VORTEX device not paired.' }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'VORTEX agent must not run as Administrator.'
}

$MutexName = 'Local\VortexCommanderAgent-' + (($env:USERNAME + '-' + $env:USERDOMAIN) -replace '[^A-Za-z0-9_-]', '_')
$Mutex = [Threading.Mutex]::new($false, $MutexName)
$HasLock = $false
try {
    try {
        $HasLock = $Mutex.WaitOne(0)
    } catch [Threading.AbandonedMutexException] {
        $HasLock = $true
    }
    # Do not start a duplicate watchdog at every logon.
    if (-not $HasLock) { return }

    while ($true) {
        $ExitCode = 1
        try {
            Push-Location -LiteralPath $Dest
            try {
                & $Node $Agent *> $null
                $ExitCode = $LASTEXITCODE
            } finally {
                Pop-Location
            }
        } catch {
            # Retry on transient failures. No paths, outputs, credentials or
            # other potentially sensitive data are written to logs.
            $ExitCode = 1
        }

        # Exit code 3 means intentionally revoked on the gateway.
        # Never reconnect an agent that an owner explicitly revoked.
        if ($ExitCode -eq 3) { break }
        Start-Sleep -Seconds 15
    }
} finally {
    if ($HasLock) { $Mutex.ReleaseMutex() }
    $Mutex.Dispose()
}
