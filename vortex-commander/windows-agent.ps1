# VORTEX Commander non-admin Windows agent.
# Run after inspecting this file, using an ordinary PowerShell session.
param(
    [ValidateSet('Status','Prepare','Pair','Run','Autostart','RemoveAutostart')]
    [string]$Action = 'Status',
    [string]$DeviceId = $env:COMPUTERNAME.ToLowerInvariant()
)
$ErrorActionPreference = 'Stop'
$Pin = '0d67f39aef13ce8253e9a2b7a376e9799a465d22'
$Gateway = 'https://mcp.guzzler-bot.cloud'
$Dest = Join-Path $HOME 'remote-mcp-agent'
$Backend = Join-Path $env:LOCALAPPDATA 'VortexCommander\backend'
$Config = Join-Path $HOME '.config\remote-mcp\device.json'
$Overlay = Join-Path $PSScriptRoot 'patch-upstream.mjs'
$Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
if ($Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Do not run the agent as Administrator.'
}
$Node = (Get-Command node.exe -ErrorAction Stop).Source
$Ver = (& $Node -p 'process.versions.node').Trim()
if ([version]$Ver -lt [version]'22.13.0') {
    throw 'Node >=22.13 required.'
}
switch ($Action) {
    Status {
        Write-Host "Machine=$env:COMPUTERNAME, Node=$Ver"
        Write-Host "Sources=$([IO.File]::Exists((Join-Path $Dest 'agent\agent.js')))"
        Write-Host "Paired=$([IO.File]::Exists($Config))"
    }
    Prepare {
        if (Test-Path $Dest) { throw "Already exists, refusing overwrite: $Dest" }
        & git.exe clone https://github.com/andyching168/SelfHostDesktopMCP.git $Dest
        if ($LASTEXITCODE -ne 0) { throw 'Git clone failed' }
        Push-Location $Dest
        try {
            & git.exe checkout --detach $Pin
            if ($LASTEXITCODE -ne 0) { throw 'Git checkout failed' }
            if ((& git.exe rev-parse HEAD).Trim() -ne $Pin) { throw 'Unexpected upstream SHA' }
            & $Node $Overlay $Dest
            if ($LASTEXITCODE -ne 0) { throw 'VORTEX overlay failed' }
            & npm.cmd ci --ignore-scripts --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
        } finally { Pop-Location }
        & npm.cmd install --prefix $Backend --ignore-scripts --no-audit --no-fund --save-exact '@wonderwhy-er/desktop-commander@0.3.3'
        if ($LASTEXITCODE -ne 0) { throw 'Pinned backend installation failed' }
        Write-Host 'Agent prepared. No connection or autostart enabled.'
    }
    Pair {
        if (-not (Test-Path (Join-Path $Dest 'agent\agent.js'))) {
            throw 'Prepare the agent first.'
        }
        Push-Location $Dest
        try {
            & $Node 'agent/agent.js' pair $Gateway --device-id $DeviceId
            if ($LASTEXITCODE -ne 0) { throw 'Pairing failed or expired' }
            & $Node 'agent/configure-backend.mjs'
            if ($LASTEXITCODE -ne 0) { throw 'Pinned backend configuration failed' }
        } finally { Pop-Location }
        Write-Host 'Paired, credentials held only on this PC.'
    }
    Run {
        if (-not (Test-Path $Config)) { throw 'Pair first' }
        Push-Location $Dest
        try { & $Node 'agent/agent.js' }
        finally { Pop-Location }
    }

    Autostart {
        if (-not (Test-Path $Config)) { throw 'Pair and test Run first' }
        $Startup = [Environment]::GetFolderPath('Startup')
        $Target = Join-Path $Startup 'VORTEX Commander.cmd'
        $AgentScript = Join-Path $Dest 'agent\agent.js'
        if (-not (Test-Path $AgentScript)) { throw 'Agent missing' }
        $Content = '@echo off' + [Environment]::NewLine +
            'start "" /min "' + $Node + '" "' + $AgentScript + '"' +
            [Environment]::NewLine
        [IO.File]::WriteAllText($Target, $Content, [Text.UTF8Encoding]::new($false))
        Write-Host 'User-level startup configured. Run RemoveAutostart to undo.'
    }
    RemoveAutostart {
        $Target = Join-Path ([Environment]::GetFolderPath('Startup')) 'VORTEX Commander.cmd'
        if (Test-Path $Target) { Remove-Item -LiteralPath $Target }
        Write-Host 'User-level startup shortcut removed.'
    }
}
