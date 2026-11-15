#!/usr/bin/env bash
# User-level Linux agent for NAS or seedbox. Never installs root services.
set -euo pipefail
ACTION="status"
if [[ $# -ge 1 ]]; then ACTION="$1"; fi
DEVICE_ID="$(hostname -s | tr '[:upper:]' '[:lower:]')"
if [[ $# -ge 2 ]]; then DEVICE_ID="$2"; fi
GATEWAY="https://mcp.guzzler-bot.cloud"
PIN="0d67f39aef13ce8253e9a2b7a376e9799a465d22"
DEST="$HOME/remote-mcp-agent"
KIT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$HOME/.local/share/vortex-commander/backend"
if [[ "$(id -u)" -eq 0 ]]; then echo "Refus : ne pas executer en root"; exit 1; fi
if [[ "$ACTION" == "status" ]]; then
  echo "Device $DEVICE_ID"
  echo "Agent installed: $([[ -e "$DEST/agent/agent.js" ]] && echo yes || echo no)"
  echo "Paired: $([[ -e "$HOME/.config/remote-mcp/device.json" ]] && echo yes || echo no)"
  command -v node >/dev/null && node --version || true
  exit 0
fi
for t in node npm git; do command -v "$t" >/dev/null || { echo "Manquant: $t"; exit 1; }; done
node -e 'let [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' || {
  echo "Node >= 22.13 requis"; exit 1
}
case "$ACTION" in
  prepare)
    [[ ! -e "$DEST" ]] || { echo "$DEST existe: rien ne sera ecrase"; exit 2; }
    umask 077
    stage="$(mktemp -d "$HOME/.vc-agent.XXXXXXXX")"
    trap 'rm -rf -- "$stage"' EXIT
    git clone --quiet https://github.com/andyching168/SelfHostDesktopMCP.git "$stage/source"
    git -C "$stage/source" checkout -q --detach "$PIN"
    [[ "$(git -C "$stage/source" rev-parse HEAD)" == "$PIN" ]] || { echo "Commit inattendu"; exit 3; }
    node "$KIT/patch-upstream.mjs" "$stage/source"
    ( cd "$stage/source"; npm ci --ignore-scripts --no-audit --no-fund; npm test )
    npm install --prefix "$BACKEND" --ignore-scripts --no-audit --no-fund --save-exact '@wonderwhy-er/desktop-commander@0.3.3'
    mv "$stage/source" "$DEST"
    echo "Agent prepare pour $DEVICE_ID. Aucun service demarre."
    ;;
  pair)
    [[ -f "$DEST/agent/agent.js" ]] || { echo "Faire prepare d'abord"; exit 4; }
    ( cd "$DEST"; node agent/agent.js pair "$GATEWAY" --device-id "$DEVICE_ID";
      node agent/configure-backend.mjs )
    echo "Appairage effectue. Aucun secret ne doit etre transmis dans le chat."
    ;;
  run)
    [[ -f "$HOME/.config/remote-mcp/device.json" ]] || { echo "Faire pair d'abord"; exit 5; }
    cd "$DEST"
    exec node agent/agent.js
    ;;
  *)
    echo "Usage: bash linux-agent.sh {status|prepare|pair|run} [device-id]"
    exit 2
    ;;
esac
