#!/usr/bin/env bash
set -euo pipefail
PIN=0d67f39aef13ce8253e9a2b7a376e9799a465d22
DEST="$HOME/remote-mcp"
[[ "$(id -u)" -ne 0 ]] || { echo "Pas de root"; exit 1; }
for t in git node npm; do command -v "$t" >/dev/null 2>&1 || { echo "Manquant: $t"; exit 1; }; done
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' || { echo "Node >=22.13 requis"; exit 1; }
[[ ! -e "$DEST" ]] || { echo "$DEST existe deja: arret"; exit 2; }
if command -v ss >/dev/null 2>&1 && ss -H -ltn '( sport = :8765 )' | grep -q .; then
  echo "Port 8765 utilise: arret"; exit 3
fi
umask 077
TMP="$(mktemp -d "$HOME/.vc-stage.XXXXXXXX")"
cleanup() { [[ ! -d "$TMP" ]] || rm -rf -- "$TMP"; }
trap cleanup EXIT
git clone --quiet https://github.com/andyching168/SelfHostDesktopMCP.git "$TMP/repo"
cd "$TMP/repo"
git checkout --quiet --detach "$PIN"
[[ "$(git rev-parse HEAD)" == "$PIN" ]] || { echo "Commit different: arret"; exit 4; }
npm ci --ignore-scripts --no-audit --no-fund
npm test
mv "$TMP/repo" "$DEST"
echo "Sources et tests prets dans $DEST. Aucun service actif; aucun Caddy modifie."
