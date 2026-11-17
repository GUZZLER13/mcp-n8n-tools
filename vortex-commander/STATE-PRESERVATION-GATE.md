# VORTEX Commander — conservation intégrale de l'existant

**Statut : garde-fou obligatoire pour tout ajout de RACINES, Chrome/NAS, Bitwarden ou de nouveaux outils MCP.** Cette documentation ne constitue pas une sauvegarde. Aucun déploiement de la PR VORTEX n'est autorisé tant que les vérifications ci-dessous ne sont pas terminées.

## Principe non négociable

L'évolution VORTEX se fait **par ajout de fonctionnalités, jamais par recréation ou remise à zéro de la passerelle existante**. Ne pas supprimer, réinitialiser, réappairer ni écraser la base, les appareils, les autorisations, les paramètres, les comptes, les profils de connexion ou l'historique existants. Ne pas réinitialiser les jetons OAuth des utilisateurs dans le cadre d'un simple ajout de module.

Un historique absent de l'API visible ne doit pas être considéré comme vide. Les paramètres de rétention doivent rester identiques, sauf demande de modification explicite. Le terme « toutes les données » inclut **les données non exposées par la liste des appareils** et les données éventuellement conservées dans des systèmes externes (Dashboard, Tailscale, logs, monitoring). Vérifier ces systèmes séparément.

## Inventaire constaté le 17 novembre 2026 (lecture seule)

Passerelle VORTEX en service sur le VPS :
- 5 appareils enregistrés, dont 4 en ligne lors du contrôle : `vps-hetzner`, `pc-nas`, `stef-pc`, `seedbox-io` et `enzo-laptop` (hors ligne).
- Le catalogue actif expose `desktop-commander` (24 outils) sur chacun des 4 appareils en ligne testés.
- Les outils Chrome et `racines_*` n'apparaissent **pas encore** dans le catalogue actif : ils sont développés dans la branche, pas installés.
- Un magasin SQLite **actif** est présent sur le VPS, avec un fichier de base, un journal WAL et un fichier SHM. **Attention : ne jamais sauvegarder seulement le fichier .db à chaud.**
- L'accès direct au fichier de base est interdit par la politique de la passerelle. Cette protection a été respectée ; **aucune inspection du contenu ni sauvegarde cohérente de cette base n'a été effectuée dans cet audit**.

Ces chiffres sont des repères **partiels** et datés, **pas** une preuve de l'exhaustivité des comptes, sessions, habilitations, statistiques et historiques.

## Critères de blocage avant déploiement

- [ ] Inventaire autorisé complet des tables, des schémas et des volumes SQLite (sans révéler de contenus sensibles), y compris appareils, appairages, profils MCP, identités, OAuth/sessions, historiques et événements d'audit lorsqu'ils existent.
- [ ] Sauvegarde **cohérente à chaud** avec l'API de sauvegarde SQLite ou `VACUUM INTO` **sur une connexion autorisée**, et non une copie indépendante des fichiers `.db` et `.db-wal`. Respecter les politiques de sécurité de l'agent ; ne pas les contourner.
- [ ] Stockage chiffré de cette sauvegarde dans une destination distincte, permissions 0600/0700, clé distincte, aucune clé ni secret dans GitHub, ChatGPT ou les journaux.
- [ ] Test de restauration dans une passerelle **isolée**, sans appairer d'appareils existants ni démarrer un agent concurrent sur les vrais systèmes.
- [ ] Vérifier les comptes, appareils, outils, profils et nombres de lignes des tables avant/après restauration, avec les identifiants stables et la validité des relations. Contrôler aussi les paramètres de rétention et les historiques réellement disponibles.
- [ ] Export **sans secret** des paramètres d'exploitation et de l'inventaire des services (versions, configuration non sensible, unités, permissions, labels, routes et monitoring).
- [ ] Valider l'intégrité des configurations et du tableau de bord VORTEX, des connexions Tailscale et des éventuelles bases supplémentaires ; ne pas supposer qu'elles résident toutes dans SQLite.
- [ ] Avant toute installation, exiger une confirmation que la sauvegarde est récente, vérifiée et récupérable. Une sauvegarde PostgreSQL de RACINES ne sauvegarde **pas** VORTEX.
- [ ] Déploiement par changement de code et migration **additive/idempotente** ; conserver le schéma antérieur et tous ses enregistrements. Pas de `rm -rf` des répertoires d'état, `DROP TABLE`, `DELETE`, `TRUNCATE`, écrasement de SQLite ou suppression des profils existants.
- [ ] Test de non-régression de la passerelle en service, de la connexion et de l'exécution des 24 outils actuels **sans relancer d'actions destructives**, puis nouveaux outils RACINES en lecture seule.
- [ ] Stratégie de retour arrière permettant de restaurer la version précédente et sa base cohérente sans réappairage ni perte d'historique.
- [ ] Suivi en production puis accord humain explicite avant toute désactivation de l'ancienne passerelle ou interface.

## Règles spécifiques aux nouveaux modules

**RACINES** : ajouter un backend MCP dédié, strictement en lecture seule, dont l'identité de service et le certificat restent isolés. Ne pas transformer l'agent administrateur courant en lecteur de secrets généalogiques, ne pas déplacer la base VORTEX dans RACINES.

**NAS / Chrome DevTools** : nouvel environnement navigateur distinct ; aucun remplacement des outils existants ni changement des comptes machines. Sessions Chrome persistantes et identifiants Bitwarden ne font pas partie des sauvegardes publiques du Dashboard.

**Dashboard VORTEX** : préserver tous les appareils, métriques, préférences, fenêtres temporelles et historiques disponibles. Toute nouvelle carte doit être additive ; vérifier qu'une même métrique n'est pas attribuée par erreur à plusieurs appareils.

**OAuth et accès humains** : préserver les installations et sessions légitimes, ne pas les désactiver pour « repartir proprement ». En cas de rotation de clés requise par une faille, planifier une opération séparée avec inventaire, notification et contrôle des effets.

## Suite recommandée

1. **Ne pas fusionner la PR** VORTEX n° 5 pour le moment.
2. Effectuer la sauvegarde VORTEX par une opération locale **autorisée** sur le serveur, jamais par une commande contournant les chemins protégés.
3. Vérifier cette sauvegarde dans un environnement isolé et dresser les écarts avant/après.
4. Uniquement après ce résultat, installer le backend RACINES en lecture seule, puis Chrome sur NAS séparément.
5. Documenter le résultat, les nouveaux outils et la procédure de retour arrière dans la PR existante.

**Interdiction de conclure « toutes les données conservées » avant la preuve de sauvegarde/restauration complète du magasin VORTEX et le contrôle des autres stockages.**
