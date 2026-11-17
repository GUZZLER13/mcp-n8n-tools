# VORTEX Commander × RACINES — contrat d'intégration sécurisé

> Conception au 17 novembre 2026. **Aucune connexion VORTEX ↔ RACINES autonome n'est déployée.** Les routes nouvelles figurent dans la PR brouillon RACINES n° 62 et sont susceptibles de changer avant livraison. Ce document ne déclenche aucune installation et ne contient aucun secret.

## Décision d'architecture

- **Une seule source généalogique : PostgreSQL RACINES**, derrière l'API existante, avec les objets documentaires originaux stockés séparément dans R2 privé.
- **Une seule passerelle VORTEX** sur VPS, qui achemine les missions et contrôle les permissions.
- **NAS PC NAS** : Chrome DevTools isolé, recherche Web et, si nécessaire, traitement documentaire temporaire. **Pas de base généalogique miroir.**
- Le site `/arbres` est une interface, pas une seconde source. Les vues `/arbres/doya`, `/arbres/marty` et `/arbres/mirales` ne doivent pas créer des bases distinctes.
- Les documents, pages Web et contenus externes ne deviennent jamais des instructions d'administration VORTEX.

## Authentification et séparation des responsabilités

1. Les utilisateurs humains gardent leurs propres comptes et leur MFA. Bitwarden Password Manager fournit leurs identifiants dans une session humaine.
2. La lecture automatisée de RACINES nécessite **une identité technique ou une délégation explicite**, limitée aux familles autorisées. Les droits sont vérifiés côté API et PostgreSQL RLS, pas par le texte d'un prompt.
3. Dans un premier temps, fournir seulement des outils de lecture à l'agent : la création d'une mission n'implique pas le droit de modifier des données.
4. Chaque écriture est une autorisation distincte, limitée à la famille, à la personne et à la mission ; `clientId` évite les doublons. Les changements de filiation, d'identité ou de publication passent par le mécanisme humain de propositions.
5. Pas de mot de passe maître Bitwarden, secret d'API, clé R2, cookie, URL présignée ou contenu de stockage de session dans ChatGPT, GitHub, les journaux ou l'interface publique.
6. Toute identité technique dispose d'une révocation, d'une rotation et d'un historique d'usage. L'accès au coffre familial entier n'est pas nécessaire.
7. Si l'API ne peut pas établir qui a lancé une action et avec quelle permission, **refuser l'action**, plutôt que d'emprunter silencieusement la session personnelle d'un membre.

## Outils MCP prévus (contrat, non implémenté)

| Outil | Lecture / écriture | Garde-fous |
| --- | --- | --- |
| `racines_list_families` | Lecture | Seulement les familles explicitement autorisées |
| `racines_find_people` | Lecture | Recherche côté serveur, retour paginé, source et version |
| `racines_get_research_dossier` | Lecture | `familyId` + identifiant canonique ; réponse issue de l'API privée et sans URLs R2 signées |
| `racines_get_research_history` | Lecture | Pagination et provenance ; distinguer pistes et preuves validées |
| `racines_record_research` | Écriture contrôlée | Approbation de la mission et droit de contribuer ; clé idempotente ; URL sans secret |
| `racines_propose_person_update` | Proposition | Ne jamais modifier silencieusement identité, parenté, publication |
| `racines_check_source` | Lecture | Récupération documentaire via route contrôlée, empreinte et autorisation ; jamais accès R2 brut |

Les noms sont des conventions de projet, **pas** des outils actuellement disponibles. Le premier endpoint prévu est `GET /api/families/:fid/people/:pid/research-dossier`. Le journal `POST /api/families/:fid/people/:pid/research-entries` ne doit pas être rendu accessible au robot sans droits et consentement.

## Protection du navigateur NAS

- Compte OS dédié, profil persistant distinct, permissions de fichiers restrictives. Le stockage des cookies sur disque nécessite une protection équivalente à celle d'un secret.
- La connexion initiale se fait manuellement dans un affichage accessible aux utilisateurs autorisés. Le navigateur Chrome DevTools MCP n'est pas une garantie de prise en charge de l'extension Bitwarden.
- Ne pas exposer le protocole de débogage Chrome sur Internet, ni au réseau Tailscale sans authentification spécifique. Pas de Docker socket ni de comptes administrateurs dans le conteneur navigateur.
- Une page malveillante peut essayer d'influencer l'assistant. **Séparer** l'agent Web des outils terminal / administration VPS et NAS avec autorisations effectives sur la passerelle.
- Les sites qui imposent un CAPTCHA, une restriction ou un refus nécessitent une intervention humaine ; aucune technique de furtivité ou de contournement.
- Ne pas installer de Chrome sur le VPS de production tant que la solution NAS suffit.

## Mission durable et audit de chaque action

Chaque mission possède un ID non réutilisé, un auteur autorisé, un but, des étapes, des documents/liens d'origine, des actions proposées, des autorisations et un état : `pending`, `running`, `awaiting_human`, `blocked`, `done` ou `failed`. Les opérations d'écriture consignent le résultat, la version de fiche avant/après, la clé idempotente et la source consultée, sans publier les contenus privés.

En cas de panne réseau, de redémarrage NAS ou de perte de session, reprendre une étape sûre sans relancer des écritures déjà confirmées. Les missions archivées restent consultables dans RACINES, mais une mémoire de conversations non enregistrées ne doit jamais être présentée comme une donnée de la base.

## Preuves indispensables avant activation

- Authentification technique contrôlée, RLS par famille et refus inter-familles.
- Accès lecture seule opérationnel sur deux sessions distinctes et revocable sans redémarrer VORTEX.
- Test : ajouter une note depuis RACINES, puis la relire immédiatement via VORTEX ; réciproque pour un journal de recherche validé.
- Test d'injection par contenu de page Web : aucune commande serveur ni accès au coffre de secrets déclenché.
- Test de refus de suppression / modification généalogique sans validation humaine.
- Test d'expiration de cookies et de MFA avec reconnexion humaine.
- Vérifier le comportement en cas d'indisponibilité des objets R2 : ne pas confondre métadonnées et fichier récupérable.
- Sauvegarde indépendante PostgreSQL + R2 et **restauration isolée effectivement vérifiée** avant migration de l'ancien site.
- Test de confidentialité sur `/arbres` public, contrôles mobiles/desktop et rollback documenté.

## Déploiement recommandé

**Phase A — RACINES** : faire passer la PR n° 62, valider les migrations et preuves de sauvegardes ; ne pas publier de données privées.

**Phase B — VORTEX lecture** : implémenter l'API métier MCP et la délégation sécurisée, mesurer la latence réelle des dossiers. Déployer à un petit périmètre.

**Phase C — NAS** : activer Chrome dans un environnement isolé ; vérifier la connexion Bitwarden manuelle et la reprise de session.

**Phase D — Écritures** : activer une mission limitée et autorisée qui enregistre une recherche, déduplique les liens, puis propose des faits à valider.

**Phase E — Convergence** : nouveaux filtres d'arbre, inventaire exhaustif et recette comparée des anciens et nouveaux écrans. Désactiver l'ancien site **uniquement après** contrôle indépendant et possibilité de retour arrière.

Ce plan privilégie la simplicité : **pas de base parallèle, pas de droit universel, pas de navigateur chargé de gérer les mots de passe lui-même**.
