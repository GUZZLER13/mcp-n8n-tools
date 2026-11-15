#!/usr/bin/env bash
set -euo pipefail
echo "=== VORTEX Commander preflight (lecture seule) ==="
printf "Non-root: "; if [[ "$(id -u)" -ne 0 ]]; then echo OK; else echo NON; fi
uname -s -m
for t in node npm git curl systemctl ss caddy; do
  if command -v "$t" >/dev/null 2>&1; then echo "$t: installe"; else echo "$t: absent"; fi
done
if command -v node >/dev/null 2>&1; then
  node --version
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' \
    && echo "Node >=22.13: OK" || echo "Node >=22.13: NON"
fi
if command -v ss >/dev/null 2>&1; then
  if ss -H -ltn '( sport = :8765 )' | grep -q .; then echo "Port 8765: OCCUPE"; else echo "Port 8765: libre"; fi
fi
for d in "$HOME/remote-mcp" "$HOME/vps-bridge"; do
  if [[ -e "$d" ]]; then echo "Existe: $d"; else echo "Absent: $d"; fi
done
echo "Aucun service ni fichier modifie."
