#!/usr/bin/env bash
# Gated, additive staging of a reviewed browser-only VORTEX agent bundle.
# Never pairs a device, starts a service, or changes the VORTEX gateway.
set -euo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
PREFIX=/opt/vortex-browser-agent
NODE_BIN=/opt/vortex-browser-mcp/bin/node
NODE_SHA=fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48
fail() { printf 'BROWSER_AGENT_REFUSED: %s\n' "$1" >&2; exit 1; }

receipt_ok() {
  local file=$1
  [ -f "$file" ] && [ ! -L "$file" ] &&
    [ "$(stat -c %u "$file")" -eq 0 ] &&
    [ "$(stat -c %a "$file")" = 600 ] ||
      fail 'Recent private root-owned restore receipt required'
  if ! /usr/bin/node - "$file" <<'NODE'
const fs=require('node:fs');
let v;
try { v=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); }
catch { process.exit(1); }
const age=Date.now()-Date.parse(v.createdAt);
const keys=['devices','client_tokens','sessions','settings','audit_logs',
'device_backends','oauth_clients','oauth_tokens'];
const ok=v.result==='RESTORE_VERIFIED' &&
  v.authenticated===true && v.integrityCheck==='ok' &&
  v.sourceDbUnmodified===true && Number.isFinite(age) &&
  age>=0 && age<=86400000 && v.tableCounts?.devices>0 &&
  keys.every(k=>Number.isSafeInteger(v.tableCounts[k]) && v.tableCounts[k]>=0);
process.exit(ok ? 0 : 1);
NODE
  then
    fail 'Restore receipt failed validation'
  fi
}

trusted_node() {
  for component in /opt /opt/vortex-browser-mcp /opt/vortex-browser-mcp/bin "$NODE_BIN"; do
    [ ! -L "$component" ] &&
      [ "$(stat -c %u "$component")" -eq 0 ] &&
      [ -z "$(find "$component" -maxdepth 0 -perm /022 -print -quit)" ] ||
        fail 'Browser Node path must be trusted and root-owned'
  done
  [ -f "$NODE_BIN" ] && [ -x "$NODE_BIN" ] &&
    [ "$(sha256sum "$NODE_BIN" | cut -d ' ' -f1)" = "$NODE_SHA" ] ||
      fail 'Protected browser Node fingerprint mismatch'
  [ "$("$NODE_BIN" --version)" = v22.23.3 ] || fail 'Unexpected Node version'
}

mode=--check
if [ "$#" -gt 0 ]; then mode=$1; fi
case "$mode" in
  --check)
    [ "$#" -le 1 ] || fail 'Unexpected arguments'
    printf 'MODE=READ_ONLY\n'
    if [ -d "$PREFIX" ] && [ ! -L "$PREFIX" ]; then
      printf 'BROWSER_AGENT_CODE=present\n'
    else
      printf 'BROWSER_AGENT_CODE=not-staged\n'
    fi
    printf 'GATEWAY_CHANGES=none\n'
    ;;
  --apply)
    [ "$#" -eq 8 ] && [ "$2" = --bundle ] &&
      [ "$4" = --sha256 ] && [ "$6" = --receipt ] &&
      [ "$8" = --independent-copy-confirmed ] ||
      fail 'Usage: --apply --bundle ABS_PATH --sha256 SHA256 --receipt ABS_PATH --independent-copy-confirmed'
    [ "$(id -u)" -eq 0 ] || fail 'Authorized root operator required'
    receipt_ok "$7"
    trusted_node
    [ ! -e "$PREFIX" ] && [ ! -L "$PREFIX" ] ||
      fail 'An existing browser agent must not be overwritten'
    bundle=$3
    [[ "$bundle" = /* ]] && [ -f "$bundle" ] && [ ! -L "$bundle" ] &&
      [ "$(stat -c %u "$bundle")" -eq 0 ] &&
      [ -z "$(find "$bundle" -maxdepth 0 -perm /077 -print -quit)" ] ||
      fail 'Bundle must be a private root-owned regular file at an absolute path'
    [[ "$5" =~ ^[a-f0-9]{64}$ ]] || fail 'SHA256 must be lowercase hexadecimal'
    [ "$(sha256sum "$bundle" | cut -d ' ' -f1)" = "$5" ] ||
      fail 'Bundle checksum differs from independently reviewed CI artifact'
    [ "$(stat -c %s "$bundle")" -le 100000000 ] ||
      fail 'Browser agent archive exceeds expected size'
    stage=$(mktemp -d /opt/.vortex-browser-agent-stage.XXXXXXXX) ||
      fail 'Cannot create protected staging directory'
    cleanup() {
      if [[ "$stage" = /opt/.vortex-browser-agent-stage.* && -d "$stage" ]]; then
        rm -rf -- "$stage"
      fi
    }
    trap cleanup EXIT
    tar -tzf "$bundle" > "$stage/entries.txt" ||
      fail 'Could not list browser archive'
    for required in agent/agent.js agent/backends.js agent/policy.js package.json package-lock.json; do
      grep -Fxq "$required" "$stage/entries.txt" ||
        fail 'Browser archive is missing a required source file'
    done
    if ! /usr/bin/node - "$stage/entries.txt" <<'NODE'
const fs=require('node:fs');
const names=fs.readFileSync(process.argv[2],'utf8').split('\n').filter(Boolean);
if(names.length<5 || names.length>35000) process.exit(1);
for (const name of names) {
  if (!/^[a-zA-Z0-9@._/+~-]+$/.test(name)) process.exit(1);
  if (name.startsWith('/') || name.split('/').some(part=>part==='..'||part==='.')) process.exit(1);
  if (!/^(agent\/(agent\.js|backends\.js|policy\.js)?|node_modules\/|package\.json$|package-lock\.json$)/.test(name)) process.exit(1);
}
NODE
    then
      fail 'Browser archive contains unexpected paths'
    fi
    tar -tvzf "$bundle" > "$stage/types.txt" ||
      fail 'Could not inspect browser archive entry types'
    if ! /usr/bin/node - "$stage/types.txt" <<'NODE'
const fs=require('node:fs');
const lines=fs.readFileSync(process.argv[2],'utf8').split('\n').filter(Boolean);
if (lines.some(line=>!['-','d'].includes(line[0]))) process.exit(1);
NODE
    then
      fail 'Browser archive contains links or special files'
    fi
    mkdir -m 0700 "$stage/payload"
    tar --no-same-owner --no-same-permissions -xzf "$bundle" -C "$stage/payload" ||
      fail 'Could not extract trusted browser archive'
    [ -z "$(find "$stage/payload" -type l -print -quit)" ] ||
      fail 'Browser archive extracted unexpected symlinks'
    grep -Fq 'VORTEX_BROWSER_ONLY' "$stage/payload/agent/agent.js" &&
      grep -Fq 'requires headless isolated Debian Chromium' "$stage/payload/agent/backends.js" &&
      [ -d "$stage/payload/node_modules/ws" ] &&
      [ -d "$stage/payload/node_modules/@modelcontextprotocol/sdk" ] ||
      fail 'Browser-only guard or runtime dependencies absent'
    "$NODE_BIN" --check "$stage/payload/agent/agent.js"
    "$NODE_BIN" --check "$stage/payload/agent/backends.js"
    chown -R root:root "$stage/payload"
    chmod -R a+rX "$stage/payload"
    chmod -R go-w "$stage/payload"
    [ ! -e "$PREFIX" ] && [ ! -L "$PREFIX" ] ||
      fail 'An agent appeared during staging; refusing overwrite'
    mv -T "$stage/payload" "$PREFIX"
    printf 'BROWSER_AGENT_CODE_STAGED=yes\nNO_SERVICE_STARTED=yes\nNO_DEVICE_PAIRED=yes\n'
    ;;
  *) fail 'Only --check or gated --apply are supported' ;;
esac
