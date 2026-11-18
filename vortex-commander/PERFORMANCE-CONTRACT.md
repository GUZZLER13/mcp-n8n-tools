# VORTEX Commander — contrat de performance de bout en bout

**Objectif familial (17 novembre 2026) :** chaque demande via VORTEX doit suivre le chemin le plus direct, avec une réponse rapide, fiable et vérifiable. « Instantané » est un objectif d'expérience, **pas** une promesse de temps nul : réseaux, permissions, démarrages et sites externes introduisent des délais incompressibles.

Ce contrat concerne **toutes les machines et tous les outils** (VPS, NAS, Windows, seedbox, navigateur), pas seulement RACINES ou Chrome.

## Règles d'exécution

1. **Réutiliser les connexions et les processus déjà actifs.** Pas de nouveau pairage, rafraîchissement OAuth ou démarrage de passerelle pour chaque demande. Une reconnexion authentifiée est nécessaire en cas de session expirée.
2. **Routage direct.** Quand la machine cible est connue, renseigner systématiquement `device_id` ; éviter `device_select` et `devices_list` superflus. Si le schéma d'un outil est déjà connu et inchangé, appeler directement l'outil plutôt que de répéter `tools_list`.
3. **Regrouper les opérations indépendantes.** L'outil expérimental `quick_checks` permet jusqu'à quatre contrôles prédéfinis, en lecture seule, sur **un appareil explicitement désigné** ; il ne remplace ni les commandes arbitraires ni les validations requises. Séparer les appareils, enregistrer les erreurs par appareil.
4. **Paralléliser avec discernement.** Faire en parallèle les consultations indépendantes (fichiers, appareils), mais sérialiser les mutations concurrentes sur un même état ou la navigation simultanée dans une même page Chrome.
5. **Ne pas retélécharger ni redémarrer à chaque appel.** Installer les dépendances épinglées hors du chemin critique, préparer le backend pendant une phase de déploiement contrôlée. Le serveur Chrome DevTools MCP et le navigateur peuvent rester actifs entre des appels. Ne jamais lancer `@latest` au moment d'une demande utilisateur.
6. **Réduire les lectures et calculs inutiles.** Lire seulement les plages nécessaires ; pagination, déduplication et métadonnées ciblées. Cache court autorisé uniquement pour des valeurs explicitement périssables et non sensibles, avec invalidation sur changement de connexion, de droits ou de configuration. Ne jamais cacher les autorisations ni supposer qu'un historique incomplet est vide.
7. **Réponse progressive pendant les tâches longues.** Accuser réception avec un résultat vérifié puis fournir les étapes suivantes ; ne pas annoncer l'exécution en arrière-plan sans véritable planificateur.
8. **Respecter les sites et les systèmes.** Les navigations Chrome sont séquencées et limitées à des intervalles raisonnables ; les ralentissements imposés par les sites, les réponses 429/403 et les CAPTCHA priment sur la vitesse. Pas de désactivation de sandbox, d'authentification ou de permissions pour accélérer.
9. **Métriques sans secrets.** Mesurer pour chaque couple `device_id` / outil : nombre d'appels, succès/erreurs, latence p50/p95, périodes 7 jours et mois courant. Différencier temps réseau, file d'attente, exécution et téléchargement si les données existent ; ne pas afficher de métrique inventée.
10. **Non-régression avant déploiement.** Mesurer avant/après, comparer la correction fonctionnelle, les ressources et le taux d'échec. Revenir à la version précédente si une optimisation dégrade la fiabilité. Le protocole de sauvegarde/restauration VORTEX reste un préalable absolu.

## Premier point de référence, hors production

Neuf appels à l'intégration VORTEX depuis ChatGPT (3 appels par opération, **observations non représentatives d'un p95 statistique**) :

| Opération | Durées constatées (ms) |
| --- | --- |
| `devices_list` | 440, 2069, 420 |
| `tools_list(device_id=pc-nas)` | 842, 1227, 1356 |
| `tools_list(device_id=vps-hetzner)` | 1320, 1062, 1143 |

Ces mesures incluent l'aller-retour de l'intégration vers la passerelle ; elles ne prouvent **ni une lenteur de l'agent ni une lenteur de Chrome**. Aucun seuil de production n'est validé sur neuf échantillons.

Pour mesurer le réseau local VPS et ses appareils, utiliser l'outil existant `benchmark-latency.mjs` avec la session autorisée et la sortie JSON. Cette mesure exclut volontairement le traitement ChatGPT et l'Internet public. Les tests de smoke GitHub valident les contrats ; ils ne mesurent pas à eux seuls les latences du véritable NAS.

## Cibles de conception à valider par mesure

- Les listes de machines et d'outils doivent rester servies depuis l'état **en mémoire de la passerelle** lorsque cet état est frais ; ne pas interroger chaque agent à la demande.
- Pour la navigation Chrome, **un backend initialisé et un navigateur déjà démarré** pendant les missions, avec profil isolé et ressources limitées ; ni `npm install` ni téléchargements sur chaque clic.
- Un outil rapide ne doit pas attendre la file Chrome, une tâche bloquée sur un autre appareil ou une opération longue sans rapport.
- Les durées et erreurs doivent apparaître dans le Dashboard avec leur machine et leur outil, sans confusion entre appels et missions.

## Statut réel

Le banc de mesure, le routage `device_id`, le stockage des outils dans les connexions actives, la sérialisation des appels Chrome et le lot `quick_checks` font partie de la branche existante. **Cela ne signifie pas qu'ils sont tous déployés ni que les objectifs de latence sont atteints.** Ne fusionner ou activer aucun nouveau module avant validation de `STATE-PRESERVATION-GATE.md`, tests CI, essais de performance et retour arrière.
