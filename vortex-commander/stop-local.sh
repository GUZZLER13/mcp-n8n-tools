#!/usr/bin/env bash
set -euo pipefail
[[ "$(id -u)" -ne 0 ]] || { echo "Execution root interdite"; exit 1; }
systemctl --user stop remote-mcp-agent remote-mcp-gateway
echo "Nouveaux services arretes; aucun ancien bridge ni Caddyfile modifie."
