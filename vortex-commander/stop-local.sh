#!/usr/bin/env bash
# Disable only newly deployed user-level VORTEX gateway services.
# Leave Caddy, VPS Bridge, DNS, other projects, data and agent secrets intact.
set -euo pipefail
if [[ "$(id -u)" -eq 0 ]]; then echo "Execution root interdite"; exit 1; fi
systemctl --user disable --now remote-mcp-agent.service remote-mcp-gateway.service
echo "New VORTEX user services stopped AND disabled on next login/boot."
echo "Old VPS Bridge, Caddy and source files were not modified."
