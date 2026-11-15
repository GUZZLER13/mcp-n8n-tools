#!/usr/bin/env bash
# Prepare pinned upstream with VORTEX overlay; does not start anything.
set -euo pipefail
PIN=0d67f39aef13ce8253e9a2b7a376e9799a465d22
DEST="$HOME/remote-mcp"
[[ "$(id -u)" -ne 0 ]] || { echo "Pas de root"; exit 1; }
for t in git node npm; do
  command -v "$t" >/dev/null 2>&1 || { echo "Manquant: $t"; exit 1; }
done
node -e 'let [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || { echo "Node >=22.13 requis"; exit 1; }
[[ ! -e "$DEST" ]] || { echo "$DEST existe deja: ne rien ecraser"; exit 2; }
if command -v ss >/dev/null 2>&1 && ss -H -ltn '( sport = :8765 )' | grep -q .; then
  echo "Port 8765 utilise : aucune installation"; exit 3
fi
umask 077
TMP="$(mktemp -d "$HOME/.vc-stage.XXXXXXXX")"
cleanup() { [[ ! -d "$TMP" ]] || rm -rf -- "$TMP"; }
trap cleanup EXIT
git clone --quiet https://github.com/andyching168/SelfHostDesktopMCP.git "$TMP/upstream"
cd "$TMP/upstream"
git checkout --quiet --detach "$PIN"
[[ "$(git rev-parse HEAD)" == "$PIN" ]] || { echo "Commit inattendu"; exit 4; }
# Separate source checkout prevents a remote install script from being executed.
git clone --quiet --depth 1 --branch vortex-commander-hardening \
  https://github.com/GUZZLER13/mcp-n8n-tools.git "$TMP/kit"
node "$TMP/kit/vortex-commander/patch-upstream.mjs" "$TMP/upstream"
npm ci --ignore-scripts --no-audit --no-fund
npm test
mv "$TMP/upstream" "$DEST"
echo "Sources preparees et tests passes dans $DEST."
echo "Aucun service, domaine ou ancien bridge modifie."
