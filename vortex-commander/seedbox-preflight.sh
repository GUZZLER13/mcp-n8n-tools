#!/usr/bin/env bash
# Diagnostic seedbox.io en lecture seule, sans afficher de secrets.
set -euo pipefail
echo "=== VORTEX Commander / seedbox preflight ==="
printf 'Machine : '; hostname
printf 'Utilisateur non-root : '; [[ "$(id -u)" -ne 0 ]] && echo OUI || echo NON
printf 'Systeme : '; uname -s -m
for cmd in node npm npx git curl ssh sftp tmux screen; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf '%s : present\n' "$cmd"
  else
    printf '%s : absent\n' "$cmd"
  fi
done
if command -v node >/dev/null 2>&1; then
  printf 'Version Node.js : '; node --version
  node -e 'let [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||(major===22&&minor>=13)?0:1)' \
    && echo 'Node >=22.13 : compatible avec la version auditée' \
    || echo 'Node >=22.13 : NON (installation directe à adapter)'
fi
if command -v npm >/dev/null 2>&1; then
  printf 'Version npm : '; npm --version
fi
if command -v curl >/dev/null 2>&1; then
  code="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' https://mcp.guzzler-bot.cloud/health 2>/dev/null || true)"
  echo "Ancien domaine mcp.guzzler-bot.cloud /health : HTTP ${code:-indisponible}"
  echo '(Cette sonde ne prouve pas que la nouvelle passerelle est active.)'
fi
echo 'Aucune installation, aucun fichier modifié, aucun identifiant affiché.'
