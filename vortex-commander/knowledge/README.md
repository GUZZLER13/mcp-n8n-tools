# VORTEX Knowledge — première version, Caddy d'abord

**Statut : développement en PR, non installé et non activé sur le VPS.** Cette version est une fonctionnalité du même VORTEX Commander (backend MCP `knowledge`, préfixe des outils `knowledge_`), pas une nouvelle passerelle ou une nouvelle application.

## Pourquoi ce module et dans quel ordre

- La priorité du chantier VORTEX reste **Chrome** : terminer son installation, sa connexion et les tests sur le NAS, après sauvegarde/restauration vérifiées. La branche Knowledge part de `vortex-commander-hardening` et devra être **réconciliée avec Chrome** après validation de la PR Chrome ; ne pas fusionner les deux overlays incompatibles par inadvertance.
- Caddy indique les domaines et services **configurés**, pas la santé d'un processus, ni le dépôt GitHub associé, ni le caractère « production ». Ne pas inventer de liens manquants.
- Phase 1 : `knowledge_list_domains` et `knowledge_inspect_domain` exposent seulement les hôtes, les chemins non secrets, le genre de route et les numéros de ports en boucle locale, avec la source et sa date. Les cibles externes et sockets sont masquées.
- Phase 2 ultérieure : recoupement en lecture seule avec systemd, Docker **sans exposer docker.sock**, GitHub, stockage NAS. Déductions et faits confirmés doivent porter des statuts différents et leur date d'observation. Les dépôts historiques ne sont pas automatiquement des applications en service.

## Performance non négociable

**Les nouvelles fonctions ne doivent jamais ralentir les outils VORTEX préexistants.** La première version respecte ce principe par conception :

1. Aucun inventaire n'est calculé au lancement de la passerelle, de l'agent ou de ChatGPT ; aucune tâche périodique n'est déclenchée.
2. Seule une requête `knowledge_*` peut lancer le parseur Caddy. La commande est asynchrone, utilise `nice -n 15` et s'arrête au bout de **3,5 s**. La sortie JSON est plafonnée à **4 Mio**.
3. Un cache en mémoire de **15 minutes** fait répondre les requêtes suivantes sans relancer Caddy. Plusieurs appels simultanés sont fusionnés en un seul scan.
4. Lorsqu'une information est périmée, l'ancienne donnée est renvoyée immédiatement, **explicitement marquée `stale`**, pendant la mise à jour. En cas d'échec, pas de boucle de retries (minimum 1 minute avant nouvelle tentative).
5. Le module est localement **désactivé par défaut**, avec opt-in `VORTEX_KNOWLEDGE_ENABLED=true`. Aucun droit root, commande arbitraire, shell fourni par une requête, lecture de base privée ou modification d'infrastructure n'est autorisé.
6. Tests : 1 000 lectures de cache ne doivent déclencher qu'une exécution du chargeur ; coalescence des demandes concurrentes, panne et backoff, absence de fuite de données depuis les configurations, test MCP réel. Ce sont des tests de code ; ils ne prouvent pas à eux seuls la latence de la passerelle active.

**Critère de déploiement futur** : mesurer avant/après les temps de réponse p50/p95 et les ressources CPU/RAM de l'agent VORTEX existant, avec des tests identiques et comparables. Si régression notable, laisser Knowledge désactivé. Aucune promesse chiffrée sans mesures réelles. Ne jamais brancher le scan Caddy au parcours d'une commande standard.

## Mise en service : pas maintenant

- Aucun secret du Caddyfile brut n'est exporté vers ChatGPT. Seule une projection de données autorisées est envoyée. Attention : même les domaines internes et les numéros de ports restent des **métadonnées privées**, accessibles uniquement aux utilisateurs authentifiés et autorisés de VORTEX.
- Une **session opérateur autorisée** devra installer le code testé au bon endroit sur le VPS, confirmer que l'utilisateur de l'agent a l'accès *en lecture* suffisant à Caddy, puis autoriser explicitement le backend `knowledge` sur **vps-hetzner uniquement**. Ne pas modifier la politique de sécurité pour contourner une erreur de permission.
- Il est interdit de modifier ou réappairer les appareils existants, d'écraser le SQLite actif, de fusionner la PR avant la sauvegarde/restauration indépendante ou d'activer ce module pendant que Chrome n'est pas terminé.
- Après activation future : vérifier la présence de `knowledge_list_domains` et `knowledge_inspect_domain`, comparer quelques domaines à la configuration adaptée de Caddy, contrôler les temps de réponse et l'absence d'impacts sur les 24 outils de chaque appareil.

## Observabilité Chrome : exigence distincte

TinyFish fournit des sessions de navigation visualisables ; cette fonctionnalité **n'est pas fournie automatiquement** par Chrome DevTools MCP. Le chantier Chrome doit prévoir une interface « voir l'agent travailler » (étapes, URL courante, captures ponctuelles, pauses et arrêt), puis éventuellement le streaming vidéo sécurisé, uniquement après tests de sécurité, confidentialité, bande passante et performance. Cela ne doit pas ralentir les autres commandes VORTEX.
