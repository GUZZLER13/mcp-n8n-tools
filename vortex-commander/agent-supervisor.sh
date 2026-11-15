#!/usr/bin/env bash
# Optional user-only supervision after pairing on NAS or seedbox.
# systemd user services when permitted, tmux fallback otherwise.
set -euo pipefail
ACTION="status"
if [[ $# -ge 1 ]]; then ACTION="$1"; fi
MODE="systemd"
if [[ $# -ge 2 ]]; then MODE="$2"; fi
DEST="$HOME/remote-mcp-agent"
UNIT="$HOME/.config/systemd/user/vortex-commander-agent.service"
NAME="vortex-commander"
NODE="$(command -v node || true)"
if [[ "$(id -u)" -eq 0 ]]; then echo "Root interdit"; exit 1; fi
if [[ ! -f "$HOME/.config/remote-mcp/device.json" ]]; then
  echo "Agent non appareille. Faire linux-agent.sh pair avant supervision."; exit 2
fi
if [[ ! -f "$DEST/agent/agent.js" || -z "$NODE" ]]; then
  echo "Agent ou Node.js introuvable"; exit 3
fi
if [[ -e "$HOME/remote-mcp/gateway/server.js" ]]; then
  echo "Ce script est reserve au NAS et a la seedbox, pas au serveur de passerelle."; exit 4
fi
case "$ACTION:$MODE" in
  start:systemd)
    command -v systemctl >/dev/null 2>&1 || { echo "systemctl absent"; exit 5; }
    systemctl --user show-environment >/dev/null || { echo "systemd utilisateur indisponible"; exit 5; }
    umask 077
    mkdir -p "$(dirname "$UNIT")"
    if [[ -e "$UNIT" ]]; then echo "Service existant : stop pour verifier avant de l'ecraser"; exit 6; fi
    {
      echo "[Unit]"
      echo "Description=VORTEX Commander non-privileged device agent"
      echo "After=network-online.target"
      echo "[Service]"
      echo "Type=simple"
      printf "WorkingDirectory=%s\n" "$DEST"
      printf "ExecStart=%s %s/agent/agent.js\n" "$NODE" "$DEST"
      echo "Restart=always"
      echo "RestartSec=10"
      echo "[Install]"
      echo "WantedBy=default.target"
    } > "$UNIT"
    systemctl --user daemon-reload
    systemctl --user enable --now vortex-commander-agent.service
    echo "User agent systemd enabled. To revert: bash agent-supervisor.sh stop systemd"
    ;;
  stop:systemd)
    systemctl --user disable --now vortex-commander-agent.service
    echo "Agent systemd disabled (configuration kept)."
    ;;
  status:systemd)
    systemctl --user is-enabled vortex-commander-agent.service 2>/dev/null || true
    systemctl --user is-active vortex-commander-agent.service 2>/dev/null || true
    ;;
  start:tmux)
    command -v tmux >/dev/null 2>&1 || { echo "tmux absent"; exit 5; }
    if tmux has-session -t "$NAME" 2>/dev/null; then
      echo "tmux session already exists: $NAME"; exit 6
    fi
    tmux new-session -d -s "$NAME" "\"$NODE\" \"$DEST/agent/agent.js\""
    echo "Agent running under tmux. May NOT survive an OS reboot."
    ;;
  stop:tmux)
    tmux kill-session -t "$NAME"
    echo "Only VORTEX tmux session stopped."
    ;;
  status:tmux)
    tmux has-session -t "$NAME" && echo "Agent tmux session: active" || echo "Agent tmux session: inactive"
    ;;
  *)
    echo "Usage: bash agent-supervisor.sh {status|start|stop} {systemd|tmux}"
    exit 2
    ;;
esac
