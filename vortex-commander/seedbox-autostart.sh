#!/usr/bin/env bash
# Install VORTEX Commander as a persistent user-level systemd service on seedbox.io.
# Run manually from the authenticated guzzler shell, after stopping foreground 'run'.
# Does not alter Transmission, Plex, system packages or legacy Desktop Commander.
set -euo pipefail
umask 077

[[ "$(id -u)" -ne 0 ]] || { echo 'REFUS: ne pas executer sous root'; exit 2; }
[[ "$(id -un)" == guzzler ]] || { echo 'REFUS: compte guzzler attendu'; exit 2; }

ROOT="$HOME"
NODE="$ROOT/vortex-seedbox-kit/node/bin/node"
AGENT="$ROOT/remote-mcp-agent/agent/agent.js"
DEST="$ROOT/.config/systemd/user"
UNIT="$DEST/vortex-commander-seedbox.service"

[[ -x "$NODE" && -f "$AGENT" && -f "$ROOT/.config/remote-mcp/device.json" ]] || {
  echo "Agent non prepare/appaire, abandon sans changement"; exit 3;
}
systemctl --user show-environment >/dev/null || { echo "systemd utilisateur indisponible"; exit 4; }
[[ "$(loginctl show-user "$(id -un)" -p Linger --value)" == yes ]] || {
  echo "Linger non actif; le redemarrage apres reboot ne serait pas assure."; exit 4;
}
[[ ! -e "$UNIT" ]] || {
  echo "Service VORTEX deja present. Aucune modification automatique. Verifier: systemctl --user status vortex-commander-seedbox.service";
  exit 5;
}

mkdir -p "$DEST"
# noclobber: never overwrite an existing unit file.
set -C
cat > "$UNIT" <<'SERVICE'
[Unit]
Description=VORTEX Commander seedbox.io non-root agent
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/remote-mcp-agent
ExecStart=%h/vortex-seedbox-kit/node/bin/node %h/remote-mcp-agent/agent/agent.js
Restart=always
RestartSec=10
RestartPreventExitStatus=3
NoNewPrivileges=true
UMask=0077

[Install]
WantedBy=default.target
SERVICE
set +C

systemctl --user daemon-reload
systemctl --user enable --now vortex-commander-seedbox.service
echo '=== Etat de VORTEX seedbox ==='
systemctl --user is-enabled vortex-commander-seedbox.service
systemctl --user is-active vortex-commander-seedbox.service
systemctl --user show vortex-commander-seedbox.service -p Restart -p MainPID -p User --no-pager
loginctl show-user "$(id -un)" -p Linger
echo 'SEEDBOX_AUTOSTART_CONFIGURED'
