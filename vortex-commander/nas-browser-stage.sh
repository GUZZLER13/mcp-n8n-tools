#!/usr/bin/env bash
# Additive NAS browser preparation. Never starts an agent or changes VORTEX SQLite.
# Default is READ-ONLY. --apply requires a recent verified restore receipt and
# the operator's confirmation that an independent encrypted copy is retained.
set -euo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
SOURCE_NODE=/opt/vortex-commander-nas/bin/node
EXPECTED_NODE_SHA=fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48
PREFIX=/opt/vortex-browser-mcp
BROWSER_HOME=/var/lib/vortex-browser
fail() { printf 'STAGING_REFUSED: %s\n' "$1" >&2; exit 1; }
check_host() {
  [ "$(uname -s)" = Linux ] && [ "$(uname -m)" = x86_64 ] || fail 'Linux x86_64 required'
  [ -r /etc/os-release ] || fail 'OS identification unavailable'
  grep -qx 'ID=debian' /etc/os-release || fail 'Debian required'
  grep -Eq '^VERSION_ID="?13"?$' /etc/os-release || fail 'Debian 13 required'
  [ -x "$SOURCE_NODE" ] || fail 'Node 22 source missing'
  [ "$("$SOURCE_NODE" --version)" = v22.23.3 ] || fail 'Node 22 source version changed'
  [ "$(sha256sum "$SOURCE_NODE" | cut -d ' ' -f1)" = "$EXPECTED_NODE_SHA" ] ||
    fail 'Node 22 source fingerprint changed; review provenance'
  [ -x /usr/bin/node ] && [ -x /usr/bin/npm ] || fail 'Debian npm and Node required'
}
check_receipt() {
  local file=$1
  [ -f "$file" ] && [ ! -L "$file" ] || fail 'Restore receipt must be a regular file'
  [ "$(stat -c %u "$file")" -eq 0 ] || fail 'Restore receipt must be root-owned'
  [ "$(stat -c %a "$file")" = 600 ] || fail 'Restore receipt must have permissions 0600'
  /usr/bin/node - "$file" <<'NODE' || fail 'Restore receipt invalid, stale or incomplete'
const fs = require('node:fs');
let item;
try { item = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); }
catch { process.exit(1); }
const required = ['devices','client_tokens','sessions','settings','audit_logs',
  'device_backends','oauth_clients','oauth_tokens'];
const age = Date.now() - Date.parse(item.createdAt);
const okay = item.result === 'RESTORE_VERIFIED' && item.authenticated === true &&
  item.integrityCheck === 'ok' && item.sourceDbUnmodified === true &&
  Number.isFinite(age) && age >= 0 && age <= 86400000 &&
  item.tableCounts && item.tableCounts.devices > 0 &&
  required.every(key => Number.isSafeInteger(item.tableCounts[key]) && item.tableCounts[key] >= 0);
process.exit(okay ? 0 : 1);
NODE
}
check_host
mode=--check
if [ "$#" -gt 0 ]; then mode=$1; fi
case "$mode" in
  --check)
    [ "$#" -le 1 ] || fail 'Unexpected arguments'
    printf 'MODE=READ_ONLY\nNODE_22_SOURCE_VERIFIED=yes\n'
    if [ -x /usr/bin/chromium ]; then
      printf 'CHROMIUM=present\n'
    else
      printf 'CHROMIUM=absent\n'
    fi
    printf 'STATE_RESTORE=NOT_VERIFIED_BY_PREFLIGHT\nPRODUCTION_CHANGES=none\n'
    ;;
  --apply)
    [ "$#" -eq 4 ] && [ "$2" = --receipt ] &&
      [ "$4" = --independent-copy-confirmed ] ||
      fail 'Use --apply --receipt /private/restore-verified.json --independent-copy-confirmed'
    [ "$(id -u)" -eq 0 ] || fail 'Authorized root operator required'
    check_receipt "$3"
    [ "$(stat -c %u /opt)" -eq 0 ] || fail 'Root-owned /opt required'
    # If staging already exists, never run npm or chown over that tree.
    # Either recognize a fully trusted installation or fail closed.
    if [ -e "$PREFIX" ] || [ -L "$PREFIX" ]; then
      [ -d "$PREFIX" ] && [ ! -L "$PREFIX" ] && [ "$(stat -c %u "$PREFIX")" -eq 0 ] ||
        fail 'Existing browser prefix is not trusted'
      [ -x "$PREFIX/bin/node" ] && [ ! -L "$PREFIX/bin/node" ] &&
        [ "$(sha256sum "$PREFIX/bin/node" | cut -d ' ' -f1)" = "$EXPECTED_NODE_SHA" ] ||
        fail 'Existing staging has an unexpected or missing Node'
      manifest="$PREFIX/node_modules/chrome-devtools-mcp/package.json"
      cli="$PREFIX/node_modules/chrome-devtools-mcp/out/Default/gen/src/bin/chrome-devtools-mcp.js"
      [ -f "$manifest" ] && [ -f "$cli" ] && [ ! -L "$manifest" ] && [ ! -L "$cli" ] ||
        fail 'Existing staging lacks a complete pinned MCP package'
      [ -z "$(find "$PREFIX" -xdev \( -type l -o ! -uid 0 -o -perm /022 \) -print -quit)" ] ||
        fail 'Existing staging contains symlinks, non-root or writable files'
      /usr/bin/node -e "const fs=require('node:fs');if(JSON.parse(fs.readFileSync('$manifest','utf8')).version!=='1.13.0')process.exit(1)" ||
        fail 'Existing Chrome MCP has unexpected version'
      [ -x /usr/bin/chromium ] || fail 'Existing staging requires installed Chromium'
      id -u vortex-browser >/dev/null 2>&1 || fail 'Existing staging lacks its dedicated user'
      [ "$(id -u vortex-browser)" -ne 0 ] || fail 'Browser account cannot be root'
      [ "$(getent passwd vortex-browser | cut -d : -f6)" = "$BROWSER_HOME" ] ||
        fail 'Existing browser identity has unexpected home'
      [ -d "$BROWSER_HOME" ] && [ ! -L "$BROWSER_HOME" ] &&
        [ "$(stat -c %U "$BROWSER_HOME")" = vortex-browser ] &&
        [ "$(stat -c %a "$BROWSER_HOME")" = 700 ] ||
        fail 'Existing browser home is missing or unsafe'
      printf 'ALREADY_STAGED_NOT_ACTIVATED=yes\n'
      exit 0
    fi
    # Existing identities must be checked before any package changes.
    if id -u vortex-browser >/dev/null 2>&1; then
      [ "$(id -u vortex-browser)" -ne 0 ] || fail 'Browser account cannot be root'
      [ "$(getent passwd vortex-browser | cut -d : -f6)" = "$BROWSER_HOME" ] ||
        fail 'Existing browser account uses an unexpected home'
      if [ -e "$BROWSER_HOME" ]; then
        [ -d "$BROWSER_HOME" ] && [ ! -L "$BROWSER_HOME" ] &&
          [ "$(stat -c %U "$BROWSER_HOME")" = vortex-browser ] ||
          fail 'Browser home ownership mismatch'
      fi
    fi
    # Non-destructive to existing VORTEX services, devices and secrets.
    /usr/bin/apt-get install -y --no-install-recommends chromium
    if ! id -u vortex-browser >/dev/null 2>&1; then
      /usr/sbin/useradd --system --create-home --home-dir "$BROWSER_HOME" \
        --shell /usr/sbin/nologin --user-group vortex-browser
    fi
    [ "$(id -u vortex-browser)" -ne 0 ] || fail 'Browser account cannot be root'
    if [ -e "$BROWSER_HOME" ]; then
      [ -d "$BROWSER_HOME" ] && [ ! -L "$BROWSER_HOME" ] &&
        [ "$(stat -c %U "$BROWSER_HOME")" = vortex-browser ] ||
        fail 'Browser home ownership mismatch'
    fi
    install -d -m 0700 -o vortex-browser -g vortex-browser "$BROWSER_HOME"
    install -d -m 0755 -o root -g root "$PREFIX" "$PREFIX/bin"
    if [ ! -e "$PREFIX/bin/node" ]; then
      install -o root -g root -m 0755 "$SOURCE_NODE" "$PREFIX/bin/node"
    fi
    # Debian Node 20.19 + root-owned npm are used only to preinstall the
    # pinned Chrome MCP package. The VORTEX agent uses copied Node 22.
    /usr/bin/npm install --prefix "$PREFIX" --ignore-scripts --no-audit \
      --no-fund --no-bin-links --save-exact chrome-devtools-mcp@1.13.0
    /usr/bin/node -e "if (require('$PREFIX/node_modules/chrome-devtools-mcp/package.json').version !== '1.13.0') process.exit(1)"
    chown -R root:root "$PREFIX"
    chmod -R go-w "$PREFIX"
    [ -x /usr/bin/chromium ] || fail 'Chromium binary unavailable after installation'
    printf 'STAGED_NOT_ACTIVATED=yes\n'
    printf 'NEXT=review_isolated_agent_configuration_and_sandbox\n'
    ;;
  *) fail 'Only --check and verified --apply are supported' ;;
esac
