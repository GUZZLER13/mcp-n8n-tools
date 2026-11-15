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
echo "Profil administratif utilisateur installe (droits de $(id -un), pas root)."
echo "Aucun service redemarre. La politique sera lue au demarrage de l'agent."
echo "L'agent ne doit pas etre connecte publiquement avant audit HTTPS et OAuth."
