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
