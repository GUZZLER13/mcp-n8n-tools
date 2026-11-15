# VORTEX Commander — seedbox.io

Objectif : inclure la seedbox dans les cinq machines, avec les mêmes
opérations **autorisées** que via Desktop Commander : recherche de fichiers,
lecture/écriture, vérifications de Transmission et commandes shell.

## Ordre de préférence

### A. Agent direct (seulement si l'hébergeur l'autorise)

Conditions à confirmer **sur la seedbox** :
- Shell et processus persistants permis par le contrat seedbox.io.
- Node.js 22.13+ et espace utilisateur disponible.
- Sortie WebSocket TLS (WSS) vers le domaine de notre passerelle.
- Démarrage sans root, dans le compte autorisé, avec un superviseur permis.

Si une condition manque, ne pas essayer de contourner les restrictions du
prestataire. Ne pas installer de service systemd, Node global ou binaire sans
avoir vérifié les conditions d'hébergement.

### B. Repli SSH/SFTP via le VPS

La documentation seedbox.io prévoit notamment l'accès SFTP. Le VPS peut
donc devenir l'intermédiaire pour les opérations permises par le compte :

```text
ChatGPT -> VORTEX Commander (VPS) -> connexion SSH/SFTP -> seedbox.io
```

Les commandes SSH ne constituent pas automatiquement un cinquième `device_id`
dans SelfHostDesktopMCP : il faudra intégrer un backend SSH/SFTP explicite,
ou utiliser l'agent du VPS pour les commandes distantes autorisées.

Ne pas stocker de mot de passe dans les commandes ou dans Git.
Utiliser une clé dédiée sans privilège administrateur, vérifier la clé
d'hôte SSH et limiter les permissions aux répertoires nécessaires.
Interdire les opérations destructrices sans validation explicite.

## Tests d'acceptation (lecture seule d'abord)

1. Authentification SSH/SFTP sans mot de passe en clair dans le terminal.
2. Vérification du dossier courant et du stockage.
3. Lecture de fichiers non sensibles.
4. Inventaire de Transmission selon l'interface autorisée.
5. Modification d'un **fichier de test**, jamais un fichier de production.
6. Reconnexion et observation du statut hors ligne.
7. Vérification que la passerelle ne donne accès à aucun secret du VPS.

La seedbox fait partie de la cible même si elle utilise le mode SSH/SFTP
plutôt qu'un agent Node permanent.

Documentation SFTP/SSHFS : https://docs.seedbox.io/shared-storage/file-access/mount-service/
