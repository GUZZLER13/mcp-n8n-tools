# VORTEX Commander — agent direct sur seedbox.io

## État vérifié

L'ancien agent **Remote Desktop Commander** était installé et **en ligne**
sur `dsb39911.seedbox.io` lors du contrôle effectué dans ChatGPT.
C'est une preuve d'accès distant existant, **pas une preuve** que la nouvelle
passerelle, ses dépendances Node et ses connexions WSS fonctionnent déjà.

**Décision : tenter d'abord l'agent direct sur la seedbox**, en respectant
les permissions réelles du compte et les conditions de l'hébergeur.
SSH/SFTP via le VPS reste uniquement une solution de repli.

## Avant d'installer

1. Installer et vérifier le nouveau serveur MCP sur le VPS.
2. Vérifier l'authentification et les restrictions de commandes du nouveau serveur.
3. Sur la seedbox, faire le diagnostic **non destructif**
   `bash seedbox-preflight.sh` depuis le compte utilisateur habituel.
4. Vérifier Node.js >=22.13, npm/npx et les permissions de processus persistants.
5. Ne pas arrêter ni désinstaller l'ancien agent avant que le nouveau soit validé.

Le binaire Desktop Commander local utilisé par SelfHostDesktopMCP est lancé
via `npx -y @wonderwhy-er/desktop-commander@latest`.
Le composant agent est fourni par le dépôt SelfHostDesktopMCP.

## Appairage (après validation du serveur)

Côté passerelle VPS, ouvrir une fenêtre d'appairage **dans un terminal privé** :

```bash
cd ~/remote-mcp
node gateway/admin.js pair
```

Côté seedbox, depuis une copie approuvée des sources et avec Node compatible :

```bash
node agent/agent.js pair https://mcp.guzzler-bot.cloud --device-id seedbox-io
node agent/agent.js
```

L'appairage exige une validation explicite sur le VPS.
Ne pas publier les codes d'appairage, clés ni jetons dans GitHub ou ChatGPT.

**Ne pas lancer l'agent sous root** ; utiliser le compte qui servait déjà
à Desktop Commander et conserver les restrictions des chemins sensibles.
Pour garder l'agent en ligne, réutiliser uniquement un mécanisme de
supervision **autorisé par seedbox.io** ; ne pas supposer la présence de
systemd ou la possibilité d'installer un démon système.

## Tests sur la seedbox

1. `devices_list` signale `seedbox-io` en ligne.
2. `list_directory` sur un dossier de test permis.
3. `read_file` sur un fichier de test.
4. `start_process` pour `pwd`, `df -h` et l'état de Transmission
   sans afficher d'identifiants.
5. `write_file` uniquement dans un répertoire de test, avec validation.
6. Contrôler la reconnexion après arrêt propre de l'agent.
7. Vérifier que les fichiers secrets ne peuvent pas être lus.
8. Vérifier la non-régression du service Transmission et des transferts.

## Repli, uniquement si installation directe interdite

Via le VPS, un backend SSH/SFTP dédié peut fournir les opérations permises
par le compte seedbox. Le simple accès SSH ne crée **pas automatiquement**
un appareil séparé dans SelfHostDesktopMCP.

## Limites

Les politiques de filtrage de commandes du projet ne sont pas une sandbox.
Les comptes et permissions OS constituent la première frontière de sécurité.
Les fonctions d'écriture depuis ChatGPT doivent encore être testées.
