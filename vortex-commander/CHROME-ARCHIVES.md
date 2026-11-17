# VORTEX Commander — navigateur universel Chrome (déploiement progressif)

**Périmètre :** une fonctionnalité native de la passerelle MCP existante utilisable pour **tous les sites web autorisés** (archives, démarches, portails, QA, support, applications personnelles), pas un second VORTEX ni un service web supplémentaire. Code source : `vortex-commander/patch-upstream.mjs`. La configuration opt-in ne modifie pas le navigateur personnel.

## Ce que le navigateur pourra faire

- **Rechercher** sur les sites web, utiliser les filtres et ouvrir les résultats.
- **Compléter des démarches autorisées** : se connecter avec une session existante, remplir des formulaires, consulter leurs résultats. Toujours obtenir un accord explicite avant une soumission ayant des effets (achats, modifications de compte, suppression, publication, envoi).
- **Aider au développement** : reproduire des erreurs visuelles, inspecter le DOM, réaliser des captures et documenter les régressions (l'évaluation de JavaScript arbitraire reste désactivée par défaut).
- **Assister RACINES** : naviguer dans les archives, récupérer les références et notes de provenance ; l'enregistrement des résultats dans RACINES reste à raccorder et à tester.
- **Accompagner la famille** : chaque appareil dispose de son propre profil dédié et de droits explicites ; ne pas réutiliser les identifiants personnels d'un autre membre.

### Navigation fiable et non intrusive

Les appels Chrome DevTools sont sérialisés dans l'agent pour éviter deux manipulations de page simultanées. Un espacement minimal de **2,5 secondes entre le début de deux navigations** évite les rafales accidentelles. Ce n'est ni une garantie de non-détection ni une limite globale du trafic chargé par les pages ; les règles de chaque site peuvent exiger plus de retenue. Aucune rotation d'IP, falsification d'empreinte, résolution automatisée de CAPTCHA ou modification furtive du navigateur n'est incluse.

**Parcours utilisateur idéal :** demander une mission, vérifier le site et les autorisations, naviguer, sauvegarder URL/captures/notes selon le contexte, s'interrompre sur les obstacles et demander votre intervention. Le *journal de missions par site*, les *points de reprise persistants* et une *interface de suivi dans VORTEX* sont des évolutions proposées et **ne sont pas encore implémentées** dans cette PR.

## Choix techniques (17 novembre 2026)

- **Chrome DevTools MCP uniquement**, version `1.13.0` fixée, pas de `@latest`. Pas de template Playwright dans la console VORTEX.
- Par défaut, le navigateur est **éphémère** (`--isolated`).
- L'option console `persistent: true` démarre Chrome avec `--user-data-dir=<HOME>/.local/share/vortex-commander/chrome-profile`. Chaque compte OS et appareil dispose ainsi d'un profil distinct ; celui-ci conserve localement des cookies et des sessions que les sites n'ont pas révoqués.
- `autoConnect` n'est plus proposé, afin d'éviter de rattacher par erreur l'agent aux comptes du navigateur personnel.
- Les outils d'évaluation JavaScript et d'upload restent désactivés par défaut. En complément, le serveur démarre avec les options de réduction d'exposition (`--no-javascript-evaluation`, `--redact-network-headers`, `--no-usage-statistics`, `--no-performance-crux`). L'accès direct au répertoire de profil est également bloqué par la politique de l'agent. **Ce blocage de chemins ne constitue pas une sandbox face à un outil terminal autorisé** ; les permissions OS, les autorisations MCP et un compte OS dédié restent indispensables.
- Aucun identifiant, cookie, mot de passe, token ou profil navigateur ne va dans GitHub, dans les journaux ou dans une conversation.

Sources : [Chrome DevTools — configuration](https://developer.chrome.com/docs/devtools/agents/get-started/configuration/) ; [Chrome DevTools MCP — releases](https://github.com/ChromeDevTools/chrome-devtools-mcp/releases).

## Première connexion humaine (pour les sites qui nécessitent un compte)

1. Choisir une machine autorisée dotée de Chrome et d'une session graphique, de préférence un **compte OS dédié**. Éviter le navigateur personnel et ne pas utiliser le VPS en tant que navigateur grand public sans nécessité.
2. Valider d'abord les tests GitHub et mettre à jour l'agent concerné de manière contrôlée, avec retour arrière possible. La passerelle peut continuer à servir les autres appareils.
3. Dans la console d'administration VORTEX déjà existante, sélectionner l'appareil, ajouter **Chrome DevTools**, choisir `persistent: true` et `headless: false`. Ne pas activer `autoConnect` ni de commandes personnalisées.
4. Lors du premier accès au site, **mettre l'automatisation en pause et laisser l'utilisateur effectuer la connexion** dans la fenêtre du navigateur dédié ; utiliser Bitwarden **localement** pour retrouver le secret et valider MFA/CAPTCHA. L'extension Bitwarden n'est pas garantie dans le Chrome lancé par l'outil (les extensions peuvent être désactivées) : ne pas présumer du remplissage automatique ni transmettre le secret à ChatGPT. Les données saisies et les cookies sont techniquement accessibles au navigateur et potentiellement à l'agent ; d'où le besoin d'une session de confiance et de permissions limitées.
5. Ensuite, dans une session ChatGPT autorisée, appeler `tools_list` puis les outils `chrome_*` via `tool_call` sur le bon `device_id`. Ne démarrer qu'un navigateur géré sur ce profil à la fois.
6. Si l'authentification expire ou si l'accès est contesté, demander une reconnexion manuelle. **Ne jamais récupérer des mots de passe depuis Bitwarden, les cookies ou le stockage du navigateur pour les afficher dans la conversation.**

### Limiter les blocages

- Commencer par les API publiques, les liens pérennes, les catalogues et IIIF si proposés.
- Vérifier les conditions de consultation, `robots.txt` et les règles propres à chaque site.
- Une tâche active par site ; recherches ciblées, cache des pages déjà vues, aucun téléchargement répété.
- Réduire le débit et respecter explicitement `Retry-After`; stopper en cas de **429**, **403**, challenge anti-robot, CAPTCHA ou refus d'accès, sans rotation d'IP ou de comptes destinée à contourner ce refus.
- Conserver dans RACINES la référence, cote, vue, URL, date de consultation, personne et statut de preuve. Ne pas créer d'identité ni de document fictif.
- Garder la possibilité d'arrêter et de reprendre une recherche interrompue, sans relancer immédiatement les requêtes qui ont déclenché un blocage.

## Recette et activation

- Contrôle de syntaxe et tests `test-chrome-backend.mjs` sur le **checkout temporaire upstream patché** en CI (Linux et Windows).
- Puis vérification manuelle sur un appareil de test : Chrome démarre, le profil temporaire est isolé, le profil persistant est distinct du Chrome personnel et survit au redémarrage ; `autoConnect` indisponible ; aucune donnée sensible dans les logs.
- Tester la révocation MCP et un arrêt propre ; observer CPU, mémoire, consommation disque et fermeture du navigateur.
- **Ne pas activer en production sans ces contrôles.** Aucune modification des secrets Bitwarden ni de la configuration personnelle Chrome n'est requise au stade GitHub.
- Retour arrière : désactiver le backend Chrome dans la console, restaurer la version précédente de l'agent ; ne pas effacer automatiquement le profil persistant (il contient des sessions). En cas d'abandon, supprimer le profil manuellement sur l'appareil concerné après déconnexion des sites.

**Limitations :** la sécurité de Chrome DevTools dépend du degré de confiance accordé à l'agent. Un outil de navigation peut accéder aux pages et parfois à des informations de session ; l'isolement du profil réduit l'exposition, il ne la supprime pas. Les sites peuvent expirer les sessions ou bloquer l'automatisation malgré un navigateur normal.


## Audit NAS réel — 17 novembre 2026 (sans installation)

Le contrôle a été réalisé par VORTEX Commander sur `pc-nas`, avec la commande en lecture seule `sh vortex-commander/nas-chrome-preflight.sh` (script ajouté dans cette PR). Ce diagnostic **n'installe rien**, ne touche ni à SQLite VORTEX ni aux profils du navigateur.

| Point vérifié | Résultat |
| --- | --- |
| Machine | `pc-nas`, en ligne |
| Système | Debian GNU/Linux 13 (trixie), x86_64 |
| Compte de l'agent actuel | `stef`, HOME `/var/lib/vortex-commander-nas` en permissions 0700 |
| Node / npm | `v22.23.3` / `10.9.9` |
| Chrome / Chromium dans le PATH | Absents |
| Chromium proposé par les dépôts Debian | `156.0.8078.79-1~deb13u1` (candidat observé, **non installé**) |
| Mémoire disponible au contrôle | Environ 10,3 Gio |
| Espace disque système libre | Environ 25,5 Gio |
| Session graphique | Aucune, ni X11 ni Wayland détecté |
| Espaces de noms utilisateur | Autorisés (`unprivileged_userns_clone=1`), mais cela ne prouve pas que la sandbox Chrome fonctionnera |
| Outils VORTEX actifs sur le NAS | Backend `desktop-commander` seul ; aucun `chrome_*` |
| Sauvegarde/restauration de la vraie base VORTEX | **Non vérifiée dans cet audit : déploiement interdit par STATE-PRESERVATION-GATE.md** |

### Écarts techniques à lever avant activation

1. **Séparation des privilèges** : l'agent actuel tourne sous le compte `stef` et expose aussi les outils de commande. Le simple blocage des chemins du profil dans `agent/policy.js` n'empêche pas un outil terminal exécuté sous le même compte de lire les sessions. La cible est un **compte système navigateur sans privilège** et un agent/browser MCP séparé ne recevant aucun outil d'administration ; le serveur VORTEX et ses cinq appareils existants restent conservés. Ne pas activer les sessions authentifiées sur l'agent administrateur actuel.
2. **Navigateur Debian** : installer Chromium depuis un dépôt approuvé ou Chrome depuis une source officielle une fois la sauvegarde vérifiée. Si Chromium est retenu, la commande Chrome DevTools MCP doit explicitement pointer vers l'exécutable (`--executablePath=/usr/bin/chromium`), option à introduire et tester de manière contrôlée dans le backend, sans permettre de commandes ou chemins arbitraires. Référence : [configuration officielle](https://developer.chrome.com/docs/devtools/agents/get-started/configuration/).
3. **Absence d'interface graphique** : le NAS peut commencer en `headless: true` pour les consultations publiques ; une connexion humaine (Bitwarden/MFA) ne peut pas se faire dans une fenêtre locale tant qu'une interface graphique sécurisée et supervisée n'est pas prévue. Ne jamais transférer les cookies du Chrome personnel ni contourner les authentifications.
4. **Sandbox** : jamais de `--no-sandbox` en solution de facilité, aucun port DevTools ouvert sur Internet ou Tailscale ; valider la sandbox Chromium/Chrome sous le compte dédié.
5. **Conservation** : obtenir la sauvegarde SQLite réelle chiffrée et sa restauration isolée par le canal opérateur autorisé, sans contourner la politique d'accès, **avant installation ou activation**.

### Recette après levée du blocage

- Vérifier l'identité OS du processus Chrome et des outils MCP, l'absence de shell et d'accès aux secrets chez l'agent navigateur ; contrôler la séparation des permissions.
- Démarrer une session jetable `--isolated --headless` sur une page publique autorisée ; vérifier navigation, captures, arrêt, consommation de ressources et absence de données sensibles dans les journaux.
- Tester une session persistante **dans le seul profil dédié**, fermeture puis redémarrage, sans impact sur les outils existants.
- Surveiller les machines et les appels par appareil dans VORTEX Dashboard, sans confondre le nouveau compte navigateur et `pc-nas`.
- Préserver la possibilité de désactiver uniquement le backend Chrome et de revenir à la version antérieure de l'agent, sans effacer automatiquement ses profils.

**État à l'issue de l'audit :** préparation et diagnostic seulement ; aucun navigateur installé, aucune modification du service NAS, aucune preuve de déploiement Chrome en production.

## Démarrage accéléré et isolé du navigateur NAS (branche, non déployé)

Le mode `VORTEX_BROWSER_ONLY=true` est réservé à un **agent séparé** tournant sous le compte Linux non privilégié `vortex-browser`. Il refuse de démarrer sous un autre compte (ou sous root), ne démarre pas Desktop Commander et accepte exclusivement le backend Chrome autorisé. Aucun accès aux outils `racines_*` n'y est ajouté.

Pour éviter toute installation npm **au moment d'une demande ChatGPT**, le mode isolé lance directement le JavaScript de `chrome-devtools-mcp@1.13.0` avec `process.execPath`. Le runtime doit être préinstallé hors connexion utilisateur, à un chemin fixe, avec une propriété et des permissions vérifiables :

- Racine du logiciel, détenue par root : `/opt/vortex-browser-mcp/` (0755, pas de droits d'écriture pour groupe/autres).
- Paquet : `/opt/vortex-browser-mcp/node_modules/chrome-devtools-mcp/`.
- Entrée : `out/Default/gen/src/bin/chrome-devtools-mcp.js`.
- Exécutable Node de l'agent : **Node >=22.13**, détenu par root, non modifiable par le compte navigateur, idéalement `/opt/vortex-browser-mcp/bin/node`.
- Données de navigation **séparées du code** : home privé `/var/lib/vortex-browser` (0700), profil persistant facultatif dans ce home uniquement.

**Constat vérifié sur le NAS :** le Node système `/usr/bin/node` est v20.19.2, satisfaisant le moteur de Chrome DevTools MCP 1.13.0 mais **insuffisant pour l'agent VORTEX upstream (Node >=22.13)**. Un Node v22.23.3 est présent dans `/opt/vortex-commander-nas/bin/node`, actuellement détenu par l'utilisateur `enzo` (mode 0755). Pour la séparation effective, le navigateur doit disposer d'une **copie ou installation Node 22 indépendante, contrôlée et détenue par root**, sans modifier le runtime ni l'agent NAS existants. L'empreinte SHA-256 observée du Node v22 sur le NAS était `fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48` ; revérifier sa provenance et son empreinte avant provisionnement, particulièrement si le binaire a été mis à jour.

Le code de résolution Chrome impose que le paquet soit présent **et exactement en version 1.13.0**. Il refuse également les composants du chemin d'exécution qui ne sont pas détenus par root ou qui sont modifiables par le groupe ou les autres utilisateurs. Aucun téléchargement `npx` de secours n'est effectué dans ce mode.

### Provisionnement opérateur après validation complète des sauvegardes

**Ne pas exécuter ces commandes avant la validation de `STATE-PRESERVATION-GATE.md`, incluant la sauvegarde réelle chiffrée, sa copie indépendante et sa restauration isolée.** Elles sont à effectuer uniquement depuis une session système privilégiée habilitée, jamais depuis une page Web ou un outil Chrome.

1. Installer Chromium depuis le dépôt Debian approuvé et préparer un compte Linux `vortex-browser` sans privilège, avec home privé `/var/lib/vortex-browser`. Préserver le compte `stef`, les services et les agents déjà enregistrés.
2. Provisionner et vérifier une installation Node 22 détenue par root, distincte du Node partagé déjà utilisé par l'agent NAS. Vérifier propriétaire, permissions, version et empreinte.
3. Installer une seule fois `chrome-devtools-mcp@1.13.0` via le gestionnaire de paquets sur `/opt/vortex-browser-mcp`, **sans scripts de cycle de vie**, sans alias `@latest`, puis vérifier la version et rendre tout l'arbre logiciel root-owned et non inscriptible par le compte `vortex-browser`. Ne jamais copier des mots de passe, cookies, secrets ou fichiers de profil personnels.
4. Installer l'agent VORTEX patché dans un emplacement protégé, sous une configuration et une identité d'appairage **distinctes** de l'agent NAS actuel. Démarrer sous `vortex-browser` avec `VORTEX_BROWSER_ONLY=true` et le Node 22 dédié ; vérifier qu'aucun outil shell ou fichier n'est exposé.
5. Commencer avec `headless: true`, `debianChromium: true`, `persistent: false`. Tester uniquement des pages publiques. Le support des sessions authentifiées et leur connexion humaine fera l'objet de contrôles supplémentaires.
6. Consigner les résultats, l'utilisation mémoire/CPU et les temps de démarrage, ainsi que la méthode de désactivation du **nouvel agent uniquement**. Ne pas remplacer `pc-nas` ni effacer son état.
7. Ne pas traiter les deux agents NAS comme deux machines physiques dans le Dashboard : les outils et les métriques doivent rester attribués à l'identité d'agent correcte, avec regroupement de présentation explicitement documenté.

**Sécurité résiduelle :** le compte OS dédié supprime le partage direct des permissions administrateur. Il ne remplace pas une séparation des autorisations *côté passerelle et côté client* : les contenus Web non fiables ne doivent pas pouvoir déclencher automatiquement des outils d'administration par injection d'instructions. Avant les sessions authentifiées, vérifier les restrictions d'accès, l'origine des actions et les demandes de validation humaine.

Mesurer ensuite le premier démarrage (à froid), le démarrage avec backend préinstallé (à chaud) et le temps des navigations réelles. L'optimisation élimine les téléchargements et démarrages inutiles, **sans promettre un temps de réponse instantané pour les sites externes**.
