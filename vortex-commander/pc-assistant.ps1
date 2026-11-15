# VORTEX Commander — one PowerShell entrypoint for read-only diagnostics.
# All actions are read-only. No remote installation, no password/key/token output.
param(
    [ValidateSet('Local','AuditVps','AuditSeedbox','AuditNas')]
    [string]$Action = 'Local',
    [string]$SshTarget = ''
)
$ErrorActionPreference = 'Stop'
$kit = $PSScriptRoot
if ($Action -eq 'Local') {
    & powershell.exe -NoProfile -File (Join-Path $kit 'preflight-windows.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Local diagnostic failed' }
    exit 0
}

if ([string]::IsNullOrWhiteSpace($SshTarget)) {
    throw 'Specify -SshTarget with your existing SSH account/host or SSH alias. Example: -SshTarget user@vps.example'
}
if ($SshTarget -notmatch '^[a-zA-Z0-9_.@-]+$' -or $SshTarget.StartsWith('-')) {
    throw 'Invalid SSH target. Use an existing SSH alias or user@hostname, without shell punctuation.'
}
$ssh = Get-Command ssh.exe -ErrorAction Stop
$file = switch ($Action) {
    'AuditVps' { 'preflight.sh' }
    'AuditSeedbox' { 'seedbox-preflight.sh' }
    'AuditNas' { 'linux-agent.sh' }
}
$source = Join-Path $kit $file
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw ('Missing checked-out diagnostic script: ' + $source)
}
Write-Output ('Launching read-only ' + $Action + ' diagnostic via existing SSH access.')
Write-Output 'The command will not install software or modify remote files.'
# Passing the local, reviewed script via SSH stdin avoids downloading and
# executing scripts from the Internet on the remote machine.
Get-Content -LiteralPath $source -Raw -Encoding UTF8 | & $ssh.Source '-T' $SshTarget 'bash -s'
if ($LASTEXITCODE -ne 0) {
    throw ('Remote SSH diagnostic failed with exit code ' + $LASTEXITCODE)
}
Write-Output ('Read-only ' + $Action + ' diagnostic completed.')
