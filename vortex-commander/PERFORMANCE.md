# VORTEX Commander — performances et mesures

Ce document concerne la passerelle familiale et les agents `vps-hetzner`, `stef-pc`, `pc-nas`, `seedbox-io`. Il ne constitue pas une preuve de gain de performance avant mesures comparatives.

## Banc de mesure, sans modification des services

Depuis une **session SSH locale autorisée sur le VPS**, avec le compte propriétaire de la passerelle (pas root) :

Pour tester la branche isolément, utiliser un checkout séparé, **sans remplacer le kit actuellement déployé** :

```bash
git clone --quiet --single-branch --branch vortex-performance-20261116 \
  https://github.com/GUZZLER13/mcp-n8n-tools.git "$HOME/vortex-perf-review"
node "$HOME/vortex-perf-review/vortex-commander/benchmark-latency.mjs" --samples=10
```

**Important :** le test lit localement le secret administratif existant, sans l'afficher ni le transmettre. Ne jamais l'exécuter via un agent distant dont la politique bloque les secrets ; ne jamais le copier dans ChatGPT, GitHub ou des logs. Ce test doit être lancé par l'administrateur local ou par une tâche locale explicitement approuvée.

Par défaut le script mesure uniquement `/health`, `devices_list` et `tools_list`. Ajouter `--exec` pour mesurer en plus un simple `whoami` sur chaque machine ; cette opération démarre un processus sans privilèges supplémentaires et mesure l'accusé de réception, **pas** l'achèvement du processus. `--json` fournit un résumé exploitable plus tard par un tableau de bord. Nombre d'échantillons autorisé : 2 à 30.

## Mesurer correctement

1. Relever une base de référence avec 10 à 20 échantillons, en gardant la même version du logiciel, la même machine et les mêmes options.
2. Répéter les mesures en période calme. Relever la médiane, le p95 et les erreurs ; distinguer une connexion fraîche d'une connexion réutilisée.
3. Modifier **une seule variable à la fois**, puis comparer avant/après avec la même procédure.
4. Tester systématiquement les chemins d'erreur, la reconnexion, la révocation et les restrictions de fichiers et commandes.
5. N'activer une modification en production qu'après tests et procédure de retour arrière.

Le banc local exclut le temps de raisonnement de ChatGPT, la latence de l'interface, les liens Internet publics et les travaux GitHub Actions. Il ne faut pas interpréter ces temps comme la durée complète d'une réponse ChatGPT.

## Optimisations à appliquer dans l'ordre des mesures

- **Éviter les appels redondants** : choisir `device_id` directement, utiliser la liste d'outils conservée pendant la session et ne pas redécouvrir systématiquement les schémas inchangés.
- **Réduire la quantité de données** : `read_multiple_files` pour des fichiers distincts, `edit_block` pour une petite modification, recherche ciblée avant la lecture d'un gros répertoire ; limiter les sorties de commandes.
- **Paralléliser uniquement les tâches indépendantes** : vérifications en lecture seule de plusieurs appareils ; garder les modifications dépendantes dans leur ordre.
- **Réutiliser les sessions existantes** plutôt que créer un processus par ligne lorsque des commandes forment une séquence interactive.
- **Optimiser la passerelle seulement après mesure** : détecter précisément les délais du relais et du démarrage de processus avant d'introduire un cache ou un traitement par lots qui modifierait les règles d'accès.

Le code actuel possède déjà une connexion longue durée agent/passerelle, le routage d'outils et un journal d'audit avec durée par appel. Ne pas ajouter de cache des permissions, ni court-circuiter l'audit ou l'autorisation pour gagner quelques millisecondes.

## Critères de réussite

La vitesse doit progresser de manière reproductible sur la médiane et/ou le p95, sans hausse des erreurs, sans perte de fonctionnalité et sans régression de sécurité. Les services Plex, Transmission, MergerFS, les sites web et l'ancien Desktop Commander restent hors périmètre.

**État au 16/11/2026 :** script de mesure ajouté sur une branche de revue, aucun gain en production revendiqué. Le test par redémarrage réel des machines reste distinct de la mesure de latence.
