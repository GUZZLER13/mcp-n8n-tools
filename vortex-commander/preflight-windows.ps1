# Read-only Windows preflight for VORTEX Commander.
# No installation, no configuration edits, no printing of private keys/tokens.
$ErrorActionPreference = 'Continue'
Write-Output '=== VORTEX Commander: diagnostic Windows ==='
Write-Output ("Machine: " + $env:COMPUTERNAME)
Write-Output ("Windows: " + [Environment]::OSVersion.VersionString)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$admin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Output ("Terminal administrateur: " + $(if ($admin) { "OUI - ouvrir un terminal normal pour installer l'agent" } else { "NON - OK" }))
foreach ($program in @('node.exe','npm.cmd','git.exe','ssh.exe','powershell.exe')) {
    $command = Get-Command $program -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        Write-Output ($program + ': absent')
    } else {
        Write-Output ($program + ': present')
    }
}
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($null -ne $node) {
    $version = (& $node.Source -p 'process.versions.node' 2>$null)
    Write-Output ('Node.js: ' + $version)
    try {
        if ([version]$version -ge [version]'22.13.0') {
            Write-Output 'Node.js compatible: OUI'
        } else {
            Write-Output 'Node.js compatible: NON (22.13.0 minimum)'
        }
    } catch {
        Write-Output 'Node.js compatible: version non reconnue'
    }
}
$agent = Join-Path $HOME 'remote-mcp-agent\agent\agent.js'
$config = Join-Path $HOME '.config\remote-mcp\device.json'
Write-Output ('Agent deja present: ' + (Test-Path $agent))
Write-Output ('Configuration appairage presente: ' + (Test-Path $config))
Write-Output ('Connexion au VPS: NON testee (ce diagnostic est local uniquement)')
Write-Output 'Fin. Aucun fichier ni parametre modifie; aucun secret affiche.'
