# VORTEX Commander — Chrome dédié aux archives (déploiement progressif)

**Périmètre :** une fonctionnalité native de la passerelle MCP existante, pas un second VORTEX ni un service web supplémentaire. Code source : `vortex-commander/patch-upstream.mjs`. La configuration opt-in ne modifie pas le navigateur personnel.

## Choix techniques (17 novembre 2026)

- **Chrome DevTools MCP uniquement**, version `1.13.0` fixée, pas de `@latest`. Pas de template Playwright dans la console VORTEX.
- Par défaut, le navigateur est **éphémère** (`--isolated`).
- L'option console `persistent: true` démarre Chrome avec `--user-data-dir=<HOME>/.local/share/vortex-commander/chrome-profile`. Chaque compte OS et appareil dispose ainsi d'un profil distinct ; celui-ci conserve localement des cookies et des sessions que les sites n'ont pas révoqués.
- `autoConnect` n'est plus proposé, afin d'éviter de rattacher par erreur l'agent aux comptes du navigateur personnel.
- Les outils d'évaluation JavaScript et d'upload restent désactivés par défaut. L'accès direct au répertoire de profil est également bloqué par la politique de l'agent. **Ce blocage de chemins ne constitue pas une sandbox face à un outil terminal autorisé** ; les permissions OS, les autorisations MCP et un compte OS dédié restent indispensables.
- Aucun identifiant, cookie, mot de passe, token ou profil navigateur ne va dans GitHub, dans les journaux ou dans une conversation.

Sources : [Chrome DevTools — configuration](https://developer.chrome.com/docs/devtools/agents/get-started/configuration/) ; [Chrome DevTools MCP — releases](https://github.com/ChromeDevTools/chrome-devtools-mcp/releases).

## Première connexion humaine

1. Choisir une machine autorisée dotée de Chrome et d'une session graphique, de préférence un **compte OS dédié**. Éviter le navigateur personnel et ne pas utiliser le VPS en tant que navigateur grand public sans nécessité.
2. Valider d'abord les tests GitHub et mettre à jour l'agent concerné de manière contrôlée, avec retour arrière possible. La passerelle peut continuer à servir les autres appareils.
3. Dans la console d'administration VORTEX déjà existante, sélectionner l'appareil, ajouter **Chrome DevTools**, choisir `persistent: true` et `headless: false`. Ne pas activer `autoConnect` ni de commandes personnalisées.
4. Lors du premier accès au site, **l'utilisateur se connect lui-même** via le gestionnaire Bitwarden et valide MFA/CAPTCHA le cas échéant. Bitwarden n'a pas besoin de communiquer ses secrets à ChatGPT. Le remplissage d'un identifiant dans le navigateur et l'existence de cookies de connexion ne garantissent pas à eux seuls qu'aucune donnée ne puisse être lue par l'agent.
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
