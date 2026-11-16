#!/usr/bin/env bash
# VORTEX Commander seedbox.io installer; run as normal guzzler user.
# Isolated from existing Desktop Commander, Transmission and Plex.
set -euo pipefail
umask 077
ACTION=status
if (( $# > 0 )); then ACTION="$1"; fi
DEVICE_ID=seedbox-io
NODE_VERSION=22.23.3
UPSTREAM_SHA=0d67f39aef13ce8253e9a2b7a376e9799a465d22
KIT_SHA=4ba8eab0fb44761fe5a32e3f280e89676f5efe34
ROOT="$HOME/vortex-seedbox-kit"
DEST="$HOME/remote-mcp-agent"
NODE="$ROOT/node/bin/node"
BACKEND="$HOME/.local/share/vortex-commander/backend"
CONFIG="$HOME/.config/remote-mcp/device.json"
if [[ "$(id -u)" -eq 0 ]]; then echo 'REFUS: ne pas utiliser root'; exit 2; fi
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'Systeme ou architecture non supporte'; exit 2
fi
download() { curl --fail --location --silent --show-error --retry 2 --connect-timeout 10 --max-time 120 "$1" -o "$2"; }
case "$ACTION" in
  status)
    echo "Machine : $(hostname); compte : $(id -un); OS : $(uname -s) $(uname -m)"
    if command -v node >/dev/null 2>&1; then echo "Node systeme : $(node --version)"; else echo 'Node systeme : absent'; fi
    if [[ -x "$NODE" ]]; then echo "Node VORTEX : $("$NODE" --version)"; else echo 'Node VORTEX : absent'; fi
    [[ -f "$DEST/agent/agent.js" ]] && echo 'Agent : present' || echo 'Agent : absent'
    [[ -f "$CONFIG" ]] && echo 'Appairage : present' || echo 'Appairage : absent'
    for cmd in curl tar sha256sum tmux crontab; do
      if command -v "$cmd" >/dev/null 2>&1; then echo "$cmd : disponible"; else echo "$cmd : absent"; fi
    done
    if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
      echo 'systemd utilisateur : disponible'
    else
      echo 'systemd utilisateur : indisponible'
    fi
    ;;
  prepare)
    if [[ -e "$DEST" || -e "$ROOT" ]]; then
      echo 'Installation deja presente ou partielle; aucun fichier ne sera ecrase.'
      exit 3
    fi
    for util in curl tar sha256sum; do command -v "$util" >/dev/null || { echo "Manquant : $util"; exit 4; }; done
    STAGE="$(mktemp -d "$HOME/.vortex-stage.XXXXXXXX")"
    trap 'rm -rf -- "$STAGE"' EXIT
    mkdir -p "$STAGE/node" "$STAGE/kit" "$STAGE/agent"
    archive="node-v$NODE_VERSION-linux-x64.tar.xz"
    download "https://nodejs.org/dist/v$NODE_VERSION/$archive" "$STAGE/node.tar.xz"
    download "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" "$STAGE/checksums"
    grep -F "  $archive" "$STAGE/checksums" | sed "s@$archive@node.tar.xz@" > "$STAGE/check-node"
    ( cd "$STAGE" && sha256sum -c check-node )
    tar -xJf "$STAGE/node.tar.xz" -C "$STAGE/node" --strip-components=1
    download "https://codeload.github.com/andyching168/SelfHostDesktopMCP/tar.gz/$UPSTREAM_SHA" "$STAGE/upstream.tar.gz"
    tar -xzf "$STAGE/upstream.tar.gz" -C "$STAGE/agent" --strip-components=1
    for file in patch-upstream.mjs configure-backend.mjs; do
      download "https://raw.githubusercontent.com/GUZZLER13/mcp-n8n-tools/$KIT_SHA/vortex-commander/$file" "$STAGE/kit/$file"
    done
    "$STAGE/node/bin/node" "$STAGE/kit/patch-upstream.mjs" "$STAGE/agent"
    export PATH="$STAGE/node/bin:$PATH"
    ( cd "$STAGE/agent" && npm ci --ignore-scripts --no-audit --no-fund && npm test )
    mkdir -p "$BACKEND"
    npm install --prefix "$BACKEND" --ignore-scripts --no-audit --no-fund --save-exact '@wonderwhy-er/desktop-commander@0.3.3'
    npm pkg set --prefix "$BACKEND" overrides.node-forge=1.4.3 overrides.exceljs.uuid=11.1.1
    npm install --prefix "$BACKEND" --ignore-scripts --no-audit --no-fund
    mkdir -p "$ROOT"
    mv "$STAGE/node" "$ROOT/node"
    mv "$STAGE/kit" "$ROOT/kit"
    mv "$STAGE/agent" "$DEST"
    echo 'SEEDBOX_PREPARED : pas de connexion active; services existants intacts.'
    ;;
  pair)
    [[ -x "$NODE" && -f "$DEST/agent/agent.js" ]] || { echo 'Preparation requise'; exit 5; }
    [[ ! -f "$CONFIG" ]] || { echo 'Appareil deja associe; refus ecrasement'; exit 5; }
    ( cd "$DEST" && "$NODE" agent/agent.js pair https://mcp.guzzler-bot.cloud --device-id "$DEVICE_ID" &&
      "$NODE" agent/configure-backend.mjs )
    echo 'SEEDBOX_PAIRED'
    ;;
  run)
    [[ -x "$NODE" && -f "$CONFIG" ]] || { echo 'Appairage requis'; exit 5; }
    cd "$DEST"
    exec "$NODE" agent/agent.js
    ;;
  *)
    echo "Usage: bash $0 {status|prepare|pair|run}"
    exit 2
    ;;
esac
