#!/usr/bin/env bash
# Opt-in user-level operations profile. Not a root grant.
set -euo pipefail
if [[ "$(id -u)" -eq 0 ]]; then echo "Ne pas executer en root"; exit 1; fi
profile="$(cd "$(dirname "$0")" && pwd)/policy-vps-admin-user.json"
target_dir="$HOME/.config/remote-mcp"
target="$target_dir/policy.json"
if [[ ! -f "$profile" ]]; then echo "Profil introuvable"; exit 2; fi
if [[ -e "$target" || -L "$target" ]]; then
  echo "Politique existante : $target. Ne sera pas ecrasee."
  exit 3
fi
umask 077
mkdir -p "$target_dir"
chmod 700 "$target_dir"
install -m 600 "$profile" "$target"
# Desktop Commander has an independent command allow/block list. Do not
# overwrite it if it already belongs to another installation.
dc_dir="$HOME/.claude-server-commander"
dc_cfg="$dc_dir/config.json"
if [[ -e "$dc_cfg" || -L "$dc_cfg" ]]; then
  echo "Desktop Commander: configuration existante, NON modifiee : $dc_cfg"
  echo "Verifier blockedCommands/allowedDirectories manuellement avant de conclure a un acces etendu."
else
  command -v node >/dev/null 2>&1 || { echo "Node.js absent pour parametrer Desktop Commander"; exit 4; }
  mkdir -p "$dc_dir"
  chmod 700 "$dc_dir"
  node --input-type=module - "$dc_cfg" <<'NODE'
import fs from 'node:fs';
const dest = process.argv[2];
const config = {
  telemetryEnabled: false,
  allowedDirectories: [],
  blockedCommands: ['sudo','su','doas','passwd','visudo','runas']
};
fs.writeFileSync(dest, JSON.stringify(config, null, 2) + '\n', { flag:'wx', mode:0o600 });
console.log('Desktop Commander: commandes normales autorisees pour le compte local ; escalation refusee.');
NODE
fi

echo "Profil administratif utilisateur installe (droits de $(id -un), pas root)."
echo "Aucun service redemarre. La politique sera lue au demarrage de l'agent."
echo "L'agent ne doit pas etre connecte publiquement avant audit HTTPS et OAuth."
