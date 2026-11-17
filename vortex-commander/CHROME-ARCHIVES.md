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

## Démarrage accéléré du navigateur NAS (branche, non déployé)

Le mode `VORTEX_BROWSER_ONLY=true` est réservé à un **agent séparé** tournant sous le compte Linux non privilégié `vortex-browser`. Il refuse de démarrer sous un autre compte (ou root), ne démarre pas Desktop Commander et accepte exclusivement le backend Chrome autorisé. Aucun accès aux outils `racines_*` n'y est ajouté.

Pour éviter une résolution `npx` et un téléchargement npm au **démarrage** de ce backend, le mode isolé lance directement le JavaScript installé de `chrome-devtools-mcp@1.13.0` avec `process.execPath`. Il exige la présence et la version exacte du paquet dans le HOME du compte dédié :

- Racine : `~/.local/share/vortex-commander/chrome-backend/`
- Paquet : `node_modules/chrome-devtools-mcp/`
- Entrée : `out/Default/gen/src/bin/chrome-devtools-mcp.js`

**Provisionnement futur, uniquement après le contrôle de sauvegarde/restauration VORTEX et la création du compte dédié par un opérateur habilité :**

```sh
# À exécuter dans une session du compte vortex-browser, pas dans celle de l'agent actuel :
mkdir -p "$HOME/.local/share/vortex-commander/chrome-backend"
npm install --prefix "$HOME/.local/share/vortex-commander/chrome-backend" \
  --ignore-scripts --no-audit --no-fund --save-exact chrome-devtools-mcp@1.13.0
```

Le paquet est provisionné **une fois**, hors des requêtes ChatGPT ; ne jamais ajouter `npm install` dans la séquence d'une navigation. L'échec de la vérification du paquet empêche le backend de démarrer plutôt que d'utiliser `npx` ou `@latest` en secours. Réviser les chemins et refaire les tests si le paquet officiel change sa structure.

Après activation seulement : configurer le navigateur dédié `headless: true`, `debianChromium: true` pour utiliser le chemin fixe `/usr/bin/chromium`, `persistent: false` au départ. Les sessions authentifiées persistantes et leur interface de connexion humaine demandent un chantier ultérieur séparé.

Mesurer ensuite le démarrage froid, le redémarrage avec backend déjà installé et les navigations à chaud. La vitesse dépend toujours du site et du réseau ; l'objectif est de **supprimer les téléchargements et démarrages superflus**, pas d'affaiblir la protection des comptes.
