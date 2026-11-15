#!/usr/bin/env bash
# Starts only the new loopback gateway and VPS agent; does not touch Caddy.
set -euo pipefail
[[ "$(id -u)" -ne 0 ]] || { echo "Execution root interdite"; exit 1; }
[[ "${VORTEX_CONFIRM_ACTIVATION:-}" == OUI ]] || {
  echo "Confirmation requise: VORTEX_CONFIRM_ACTIVATION=OUI bash activate-local.sh"; exit 2;
}
[[ -f "$HOME/remote-mcp/gateway/server.js" ]] || { echo "Executer prepare.sh d'abord"; exit 3; }
command -v node >/dev/null 2>&1 || { echo "Node absent"; exit 4; }
node -e 'let [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' || {
  echo "Node >=22.13 necessaire"; exit 4
}
if command -v ss >/dev/null 2>&1 && ss -H -ltn '( sport = :8765 )' | grep -q .; then
  echo "Port 8765 deja occupe"; exit 5
fi
cd "$HOME/remote-mcp"
PUBLIC_URL=https://mcp.guzzler-bot.cloud BIND_HOST=127.0.0.1 \
  DEVICE_ID=vps-hetzner bash deploy/install-linux.sh
echo "Gateway et agent VPS en cours de demarrage sur localhost uniquement."
echo "Controler verify.sh puis proceder a l'audit Caddy/OAuth avant toute exposition."
