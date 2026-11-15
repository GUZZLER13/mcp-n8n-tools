#!/usr/bin/env bash
# Active uniquement les services systemd utilisateur de la nouvelle passerelle.
set -euo pipefail
[[ "$(id -u)" -ne 0 ]] || { echo "Execution root interdite"; exit 1; }
[[ "${VORTEX_CONFIRM_ACTIVATION:-}" == OUI ]] || { echo "Utiliser: VORTEX_CONFIRM_ACTIVATION=OUI bash activate-local.sh"; exit 2; }
[[ -f "$HOME/remote-mcp/gateway/server.js" ]] || { echo "Preparer les sources d'abord"; exit 3; }
[[ -x /usr/bin/node ]] || { echo "Verifier le chemin de Node dans le template systemd"; exit 4; }
if command -v ss >/dev/null 2>&1 && ss -H -ltn '( sport = :8765 )' | grep -q .; then echo "Port 8765 occupe"; exit 5; fi
cd "$HOME/remote-mcp"
PUBLIC_URL=https://mcp.guzzler-bot.cloud BIND_HOST=127.0.0.1 DEVICE_ID=vps-hetzner bash deploy/install-linux.sh
echo "Passerelle demarree localement. Avant toute exposition publique: bash verify.sh et audit Caddy."
