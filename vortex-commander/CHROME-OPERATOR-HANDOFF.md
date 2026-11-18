# VORTEX Chrome — passage de relais à une session opérateur autorisée

**État contrôlé le 17 novembre 2026. Ce fichier ne vaut ni autorisation d'élévation de privilèges ni preuve de sauvegarde.**

## Ce qui est vraiment prêt

- PR [#5](https://github.com/GUZZLER13/mcp-n8n-tools/pull/5), branche `feature/vortex-browser-profiles-20261117`, encore **draft** et non fusionnée.
- Tests GitHub Linux, Windows et performances verts au commit `074c6fd6687c571c8fc9746395edbb1558fd5d3b`. Test avec **vrai navigateur** et page de boucle locale réussi.
- Archive CI `vortex-browser-agent-candidate`, à télécharger depuis [l'exécution de tests Linux](https://github.com/GUZZLER13/mcp-n8n-tools/actions/runs/44156162625) (conservation limitée ; ne pas utiliser une archive d'un autre commit sans revoir son contenu).
- VPS : `remote-mcp-gateway.service` et `remote-mcp-agent.service` **actifs** (contrôle utilisateur, lecture seule). Cinq appareils VORTEX enregistrés et connectés au dernier contrôle.
- `$HOME/vortex-backups` sur le VPS : dossier existant **775**, **aucun `*.vxb`** dans ce dossier au contrôle ; d'autres emplacements n'ont pas été évalués. Ne pas utiliser ce répertoire tel quel pour la nouvelle sauvegarde.
- Le `node` par défaut du compte de diagnostic VPS est en **v18.19.1**, inadapté à `node:sqlite` de notre sauvegarde. Sélectionner explicitement un binaire Node 22 compatible, détenu par un opérateur habilité ; ne jamais lancer le Node mutable d'un autre compte en root.
- NAS : Debian 13, namespaces utilisateur activés, Chromium absent, pas de répertoire `/opt/vortex-browser-mcp`, `/opt/vortex-browser-agent` ni `/var/lib/vortex-browser`.

## Étape 1 — sauvegarde VORTEX (VPS, session opérateur autorisée seulement)

1. Identifier **sans exporter de secrets** le chemin réel de la base SQLite de la passerelle et du Node 22 effectivement utilisé. La base est active avec WAL/SHM : **interdiction d'en copier seulement le fichier principal**. Ne pas utiliser VORTEX Commander ou GitHub Actions pour contourner une règle qui interdit l'accès direct à la base.
2. Créer un **nouveau** dossier privé 0700 dont tous les parents sont fiables (ne pas modifier le dossier partagé `~/vortex-backups` à l'aveugle). La clé AES-256 doit être générée **localement** dans un autre espace privé et ne jamais être envoyée dans ChatGPT, GitHub, la PR ou les journaux.
3. Depuis la révision du code revue, renseigner sur la machine les quatre chemins **absolus** `VORTEX_NODE`, `VORTEX_BACKUP_TOOL`, `VORTEX_STATE_DB`, `VORTEX_BACKUP_FILE`, ainsi que `VORTEX_BACKUP_KEY`. Vérifier le binaire Node (version >= 22.13 et module `node:sqlite` disponible), la propriété du script et les permissions des dossiers.
4. Utiliser l'outil déjà testé sur une base synthétique avec WAL actif :

   ```sh
   "$VORTEX_NODE" "$VORTEX_BACKUP_TOOL" snapshot \
     --db "$VORTEX_STATE_DB" \
     --out "$VORTEX_BACKUP_FILE" \
     --key-file "$VORTEX_BACKUP_KEY"
   ```

   Il doit afficher `BACKUP_CREATED` ; aucune mise hors service de la passerelle n'est requise par la sauvegarde SQLite en ligne. Ne pas relancer sur le même nom de fichier : l'outil refuse les écrasements.
5. Conserver **une seconde copie chiffrée indépendante du VPS**, la clé séparément, puis vérifier la **copie indépendante** dans un environnement isolé. Ne pas seulement vérifier le fichier original :

   ```sh
   "$VORTEX_NODE" "$VORTEX_BACKUP_TOOL" verify \
     --file "$VORTEX_INDEPENDENT_BACKUP_COPY" \
     --key-file "$VORTEX_BACKUP_KEY"
   ```

   Le résultat `RESTORE_VERIFIED` authentifie et réouvre temporairement le SQLite restauré, vérifie l'intégrité et les compteurs. Il ne remplace **pas** un essai de chargement de la passerelle isolée, la validation des identités et relations, ni la sauvegarde des configurations et données d'autres services (Dashboard, monitoring, Tailscale, etc.).
6. Vérifier et comparer l'inventaire avant/après, les paramètres de rétention, les outils et appareils. Ne pas considérer que `tableCounts.devices > 0` prouve la conservation intégrale. La sauvegarde indépendante et la restauration doivent être attestées par l'opérateur ; ne pas rédiger manuellement un faux `RESTORE_VERIFIED`.
7. Placer le compte rendu JSON réel de `verify` dans un fichier **root-owned 0600** sur le NAS uniquement pour le contrôle des scripts `--apply`, après vérification de la copie indépendante. Le reçu reste utilisable au maximum 24 h après la date de **création du snapshot** telle que contrôlée par le script. Il ne doit contenir ni identifiants ni secrets.

## Étape 2 — installation additive sur NAS, seulement après étape 1

1. Ouvrir une session locale ou distante **déjà autorisée** avec les privilèges nécessaires ; ne pas contourner la politique VORTEX qui a refusé l'exécution d'un script distant.
2. Copier et examiner les scripts de la PR au commit exact testé dans un emplacement root-owned, non inscriptible par les autres comptes. L'outil d'audit `audit-browser-agent-archive.mjs` et tous ses dossiers parents doivent être root-owned, non inscriptibles par le groupe ou les autres et sans lien symbolique.
3. Exécuter le précontrôle `nas-browser-stage.sh --check` dans cette session. Confirmer que sa sortie annonce `MODE=READ_ONLY`.
4. Après vérification du reçu et de la copie indépendante, l'opérateur peut lancer le mode `--apply` du script Chromium. Il installe Chromium et prépare `/opt/vortex-browser-mcp` et le compte dédié, **sans activer d'agent**.
5. Télécharger l'archive CI de la **bonne révision**, contrôler son digest de l'archive intérieure par rapport à celui imprimé dans le journal GitHub du build (le digest du ZIP GitHub est différent), la transférer comme fichier privé 0600 et faire vérifier son contenu par `audit-browser-agent-archive.mjs`. Ensuite, `nas-browser-agent-stage.sh --apply --bundle ... --sha256 ... --receipt ... --independent-copy-confirmed` prépare le code sans toucher aux anciens appareils.
6. Examiner en priorité la **sortie réseau** du nouvel utilisateur `vortex-browser` : son accès Internet pour les recherches ne doit pas équivaloir à un accès sans contrôle aux interfaces administratives du NAS, de Tailscale ou du VPS. La protection doit couvrir les redirections et DNS, pas uniquement les URL initiales.
7. Appairer séparément le nouvel appareil logique `pc-nas-browser` par la procédure officielle, en gardant sa clé et sa configuration `device.json` uniquement dans le dossier du compte dédié (0600). Le modèle systemd n'est **pas** auto-installé ni auto-activé. Paramètres Chrome autorisés : `debianChromium=true`, `headless=true`, `persistent=false`. Vérifier la sandbox Linux avant démarrage.
8. Test final depuis ChatGPT : découverte des outils `chrome_*`, navigation sur un site public non sensible, capture de page, contrôle réseau, absence de `upload_file` et `evaluate_script`, arrêt propre, puis vérification que les **24 outils originaux du NAS** et tous les appareils VORTEX fonctionnent toujours. Ne fusionner la PR qu'après validation et plan de retour arrière.

## Ce que ChatGPT peut / ne peut pas affirmer aujourd'hui

Les tests CI ont confirmé le comportement fonctionnel d'un navigateur isolé, **pas** la mise en service du NAS. Aucun reçu de sauvegarde réelle ni restauration opérationnelle n'a été obtenu via le connecteur. L'accès actuel refuse une exécution distante de script : respecter ce refus. **L'installation réelle nécessite l'étape opérateur**, et l'absence de compte rendu constitue un blocage, pas une permission implicite de la simuler.
