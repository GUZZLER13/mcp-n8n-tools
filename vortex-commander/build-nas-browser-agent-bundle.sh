#!/usr/bin/env bash
# CI-only: create a self-contained, NON-ACTIVATED browser-only agent archive.
# Must run on an isolated build runner, never on the production VPS or NAS.
set -euo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin:"$PATH"
fail() { printf 'BROWSER_BUNDLE_REFUSED: %s\n' "$1" >&2; exit 1; }
[ "$#" -eq 2 ] || fail 'Usage: build-nas-browser-agent-bundle.sh PATCHED_UPSTREAM OUTPUT_ARCHIVE.tar.gz'
source_dir=$(realpath "$1")
archive=$2
[[ "$archive" = /* && "$archive" = *.tar.gz ]] || fail 'Archive path must be absolute and end .tar.gz'
[ ! -e "$archive" ] || fail 'Archive already exists; refusing to overwrite'
[ -d "$source_dir/.git" ] || fail 'Input must be a pinned upstream Git checkout'
pin=0d67f39aef13ce8253e9a2b7a376e9799a465d22
[ "$(git -C "$source_dir" rev-parse HEAD)" = "$pin" ] || fail 'Upstream commit is not pinned'
for file in agent/agent.js agent/backends.js agent/policy.js package.json package-lock.json; do
  [ -f "$source_dir/$file" ] && [ ! -L "$source_dir/$file" ] || fail "Missing or symlinked $file"
done
grep -Fq 'VORTEX_BROWSER_ONLY' "$source_dir/agent/agent.js" ||
  fail 'Browser-only agent patch absent'
grep -Fq 'requires headless isolated Debian Chromium' "$source_dir/agent/backends.js" ||
  fail 'NAS Chrome safety guard patch absent'
grep -Fq 'Pinned Chrome DevTools 1.13.0' "$source_dir/agent/backends.js" ||
  fail 'Pinned direct Chrome backend patch absent'
umask 077
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/agent"
for file in agent/agent.js agent/backends.js agent/policy.js package.json package-lock.json; do
  install -m 0644 "$source_dir/$file" "$work/$file"
done
node --check "$work/agent/agent.js"
node --check "$work/agent/backends.js"
node --check "$work/agent/policy.js"
npm ci --prefix "$work" --omit=dev --ignore-scripts --no-bin-links --no-audit --no-fund
[ -d "$work/node_modules/ws" ] && [ -d "$work/node_modules/@modelcontextprotocol/sdk" ] ||
  fail 'Required runtime dependencies missing'
[ -z "$(find "$work" -type l -print -quit)" ] || fail 'Archive contains symlinks'
tar --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner \
  -C "$work" -cf - agent package.json package-lock.json node_modules | gzip -n > "$archive"
sha256sum "$archive" > "$archive.sha256"
printf 'BROWSER_AGENT_BUNDLE_READY=%s\nSHA256_FILE=%s.sha256\nNO_SERVICE_STARTED=yes\n' "$archive" "$archive"
