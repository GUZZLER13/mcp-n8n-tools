# VORTEX Commander — reprise depuis un PC Windows

Cette fiche est préparée pour le jour où l'accès SSH au VPS sera disponible.
**Ne pas lancer l'installation sur plusieurs machines en même temps.**

## Etape 1 : diagnostic du PC (sans modification)

1. Ouvrir GitHub : https://github.com/GUZZLER13/mcp-n8n-tools/tree/vortex-commander-hardening/vortex-commander
2. Récupérer le dépôt en ZIP ou le cloner avec la commande ci-dessous.
3. Dans PowerShell, **non administrateur**, entrer dans le dossier `vortex-commander` et exécuter le diagnostic.

    git clone --branch vortex-commander-hardening --single-branch https://github.com/GUZZLER13/mcp-n8n-tools.git
    cd mcp-n8n-tools/vortex-commander
    powershell -NoProfile -File .\preflight-windows.ps1

Le diagnostic affiche seulement les versions et prérequis. Ne jamais publier de clés,
mots de passe ou jetons d'appairage.

### Diagnostic simplifié depuis Windows

Le même dossier inclut `pc-assistant.ps1`, qui peut vérifier les prérequis
localement ou sur un appareil joignable en SSH, **sans installation distante** :

    powershell -NoProfile -File .\pc-assistant.ps1 -Action Local
    powershell -NoProfile -File .\pc-assistant.ps1 -Action AuditVps -SshTarget MON_ALIAS_SSH
    powershell -NoProfile -File .\pc-assistant.ps1 -Action AuditSeedbox -SshTarget MON_ALIAS_SEEDBOX
    powershell -NoProfile -File .\pc-assistant.ps1 -Action AuditNas -SshTarget MON_ALIAS_NAS

Remplacer les alias par les noms SSH **déjà configurés** sur ce PC ; ne pas
inventer d'identifiants et ne jamais les publier dans un dépôt.
Pour la seedbox, une connexion SSH existante suffit à diagnostiquer le compte,
sans perturber Transmission. Pour le PC d'Enzo, lancer `-Action Local`
directement dans sa session Windows lorsqu'elle sera disponible.

## Etape 2 : accès SSH au VPS

Depuis un PowerShell sur le PC, vérifier **seulement** la disponibilité de
l'accès SSH déjà configuré sur ce PC. Utiliser la clé et l'utilisateur
habituellement autorisés, sans inventer un nom de compte.

    ssh -V

Pour lancer le diagnostic VPS après authentification :

    git clone --branch vortex-commander-hardening --single-branch https://github.com/GUZZLER13/mcp-n8n-tools.git
    cd mcp-n8n-tools/vortex-commander
    bash preflight.sh

Si le dépôt existe déjà, ne pas l'écraser. Lire les messages et s'arrêter
en cas de dossier existant, service inconnu ou port occupé.

## Etape 3 : mise en route VPS, sur validation des résultats

Depuis le compte Linux **non-root** du VPS :

    bash prepare.sh

Inspecter la sortie des tests et les changements prévus avant de lancer
l'activation. Ce dossier ne doit pas être fusionné avec les fichiers de RACINES,
ATLAS, VORTEX Arcade ou VPS Bridge.

Puis, seulement après vérification du port et des services :

    VORTEX_CONFIRM_ACTIVATION=OUI bash activate-local.sh
    bash verify.sh

**Ne pas modifier Caddy immédiatement.** Sauvegarder et examiner le
Caddyfile actif, puis remplacer uniquement le routage de
`mcp.guzzler-bot.cloud` après contrôle HTTPS/OAuth.

## Etape 4 : ChatGPT

Sur ChatGPT Web, connecter le serveur MCP (après activation HTTPS) :
`https://mcp.guzzler-bot.cloud/mcp`

Faire les tests dans cet ordre : `devices_list`, lecture d'un fichier de test,
écriture dans un dossier de test, `start_process` avec `pwd`.
Un test réussi dans GitHub Actions **ne prouve pas** que les écritures sont
autorisées depuis notre conversation ChatGPT Plus.

## Etape 5 : les quatre agents supplémentaires

| Machine | Device ID attendu | Script |
|---|---|---|
| PC NAS | `pc-nas` | `linux-agent.sh` si Linux confirmé |
| Seedbox.io | `seedbox-io` | `linux-agent.sh` (agent direct en priorité) |
| STEF-PC | `stef-pc` | `windows-agent.ps1` |
| PC d'Enzo | `enzo-laptop` | `windows-agent.ps1` |

Sur chaque appareil, diagnostiquer, préparer, ouvrir la fenêtre d'appairage
sur le VPS, appairer **uniquement la machine concernée**, puis tester les
opérations dans un dossier de test. Les appareils déjà équipés de l'ancien
Desktop Commander ne doivent pas être désinstallés avant validation.

## Confirmation finale

- Les cinq appareils apparaissent avec les identifiants prévus.
- Les fichiers et processus sont utilisables dans les chemins autorisés.
- Les refus d'accès aux secrets et au système root sont vérifiés.
- Les sites web existants et Transmission sont toujours disponibles.
- La reconnexion après déconnexion est vérifiée.
- L'ancien VPS Bridge est désactivé uniquement après une bascule réussie.

**Retour arrière VPS :** `bash stop-local.sh`, puis restauration du Caddyfile
sauvegardé, validation Caddy et rechargement contrôlé si le domaine avait été
basculé. Ne jamais supprimer les données, secrets ni répertoires en production.
