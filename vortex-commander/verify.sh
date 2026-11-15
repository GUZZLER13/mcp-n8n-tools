#!/usr/bin/env bash
set -euo pipefail
base=http://127.0.0.1:8765
health="$(curl --max-time 5 -sS -o /dev/null -w '%{http_code}' "$base/health" || true)"
mcp="$(curl --max-time 5 -sS -o /dev/null -w '%{http_code}' "$base/mcp" || true)"
echo "health=$health (attendu 200)"
echo "mcp sans OAuth=$mcp (attendu 401)"
[[ "$health" == 200 && "$mcp" == 401 ]] || exit 1
echo "Gateway locale OK; l'authentification OAuth et le routage vers un agent restent a verifier."
