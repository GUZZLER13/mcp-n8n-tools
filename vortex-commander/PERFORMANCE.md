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

## Lecture immédiate des durées existantes, sans identifiants

Les journaux de la passerelle contiennent déjà la durée des appels MCP (et leur statut), **sans les arguments des commandes**. Leur analyse peut être lancée depuis VORTEX, car elle ne lit aucun secret :

```bash
node "$HOME/vortex-perf-review/vortex-commander/benchmark-audit.mjs" --hours=24 --min-samples=5
```

Ajouter `--json` pour obtenir des agrégats exploitables par le futur tableau de bord. Les durées comprennent l'attente d'exécution des commandes : il ne faut pas assimiler une commande longue à de la latence réseau.

### Première mesure observée le 16 novembre 2026

Résumé des appels réussis enregistrés dans le journal de la passerelle sur les dernières 24 heures, sans harmoniser les commandes :

| Appareil | Outil | Échantillons | Médiane | p95 |
|---|---|---:|---:|---:|
| VPS | `write_file` | 25 | 25 ms | 37 ms |
| VPS | `edit_block` | 27 | 49 ms | 82 ms |
| VPS | `start_process` | 467 | 796 ms | 16 092 ms |
| STEF-PC | `start_process` | 46 | 827 ms | 4 750 ms |
| PC NAS | `start_process` | 8 | 122 ms | 263 ms |
| Seedbox | `start_process` | 14 | 119 ms | 1 065 ms |

Ces catégories mélangent des travaux de durées différentes et les échantillons sont inégaux. Elles **ne prouvent pas qu'un appareil est plus lent**. Elles suggèrent surtout une optimisation d'usage : privilégier les outils de fichiers directs et limiter les processus terminal inutiles. Pour comparer la vitesse des machines, il faut mesurer le **même `whoami`** sur chacune avec le banc local.

## Mesurer correctement

1. Relever une base de référence avec 10 à 20 échantillons, en gardant la même version du logiciel, la même machine et les mêmes options.
2. Répéter les mesures en période calme. Relever la médiane, le p95 et les erreurs ; distinguer une connexion fraîche d'une connexion réutilisée.
3. Modifier **une seule variable à la fois**, puis comparer avant/après avec la même procédure.
4. Tester systématiquement les chemins d'erreur, la reconnexion, la révocation et les restrictions de fichiers et commandes.
5. N'activer une modification en production qu'après tests et procédure de retour arrière.

Le banc local exclut le temps de raisonnement de ChatGPT, la latence de l'interface, les liens Internet publics et les travaux GitHub Actions. Il ne faut pas interpréter ces temps comme la durée complète d'une réponse ChatGPT.

## Optimisation du relais ajoutée à la PR n° 2 (non déployée)

L'adaptation de la version **épinglée** de SelfHostDesktopMCP (`patch-upstream.mjs`)
propose `quick_checks` via l'outil générique existant `tool_call`, sans ajouter
une définition à la liste stable des outils MCP. Il réduit les allers-retours HTTP
pour **1 à 4 contrôles indépendants** (sans ajouter de serveur ni processus
permanent). Exemple pour notre VPS :

```json
{
  "name": "tool_call",
  "arguments": {
    "name": "quick_checks",
    "device_id": "vps-hetzner",
    "arguments": {
      "checks": [
        { "type": "pwd" },
        { "type": "uptime" },
        { "type": "get_file_info", "path": "/home/stef/vortex-commander-kit/vortex-commander/README.md" }
      ]
    }
  }
}
```

Les seuls types acceptés sont `get_file_info`, `list_directory`, `whoami`,
`pwd` et `uptime`. Les trois derniers utilisent des commandes fixes, **jamais
un texte fourni par le client**. Aucun outil d'écriture n'est admissible. Toute
la liste est validée avant la première exécution ; les opérations sont ensuite
lancées en parallèle et **chacune traverse la politique habituelle de l'agent**,
avec sa propre entrée d'audit. Le récapitulatif final contient les statuts,
durées et **400 caractères maximum de résultat par vérification**, sans
transmettre de fichiers complets. Une vérification bloquée reste bloquée.

Cette optimisation réduit le nombre d'appels entre ChatGPT et la passerelle,
mais ne garantit pas que quatre opérations coûteuses sur le VPS se terminent
plus vite qu'une seule opération. Préférer un outil direct lorsqu'une seule
opération suffit ; `read_multiple_files` reste mieux adapté à plusieurs
lectures de fichiers.

### Chronométrage séparé, sans données sensibles

La passerelle reçoit désormais une durée de traitement calculée par l'agent.
Lorsque la variable d'environnement **`RMCP_TRACE_LATENCY=1`** est définie
sur la passerelle, ses journaux incluent uniquement :
- `relay_ms` : délai aller-retour passerelle → agent → passerelle ;
- `agent_ms` : politique de sécurité, traitement et attente du moteur local ;
- `transport_overhead_ms` : différence approximative des deux.

Aucun argument, contenu de fichier, sortie de commande ou jeton n'est enregistré
par ce traçage. Celui-ci est désactivé par défaut. Les durées de
`start_process` **incluent encore l'exécution de la commande** : elles ne
séparent pas le temps propre du shell de celui du moteur Desktop Commander.
Les différences d'horloge et d'arrondi rendent la dernière métrique indicative.

**Validation prévue :** les tests GitHub de la PR appliquent l'overlay sur
le commit épinglé, vérifient la syntaxe, exécutent les tests amont et un test
réel passerelle → agent. Ce test contrôle aussi les requêtes mal formées,
les commandes arbitraires interdites et les chemins sensibles refusés.
Aucun changement de production ou de configuration n'est automatique.


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
