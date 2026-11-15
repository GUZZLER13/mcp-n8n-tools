# VORTEX Commander — SelfHostDesktopMCP

## Projet

Remplacement auto-hébergé de Remote Desktop Commander : une passerelle HTTPS
avec OAuth sur le VPS Hetzner et des agents Desktop Commander sur cinq appareils.
Nous conservons les fonctions fichiers, terminal, processus, recherche et
édition, avec comptes OS non privilégiés.

Sources utilisées :
- Passerelle : https://github.com/andyching168/SelfHostDesktopMCP
- Commit fixe : 0d67f39aef13ce8253e9a2b7a376e9799a465d22
- Moteur : @wonderwhy-er/desktop-commander@0.3.3
- Branche de travail : vortex-commander-hardening

## État réel

Les scripts et tests sont en cours de validation GitHub. La passerelle et les
agents NE SONT PAS encore installés par cette conversation sur les appareils.
L'ancien VPS Bridge reste en place tant que la connexion OAuth et les outils
d'écriture depuis ChatGPT n'ont pas été vérifiés.

Le quota de Remote Desktop Commander est atteint et le plugin n8n ne répond
pas : aucun accès shell de remplacement au VPS n'est disponible ici.

## Ordre de déploiement

1. Télécharger ce dossier depuis la branche vortex-commander-hardening.
2. Exécuter preflight.sh en lecture seule depuis le VPS non-root.
3. Inspecter prepare.sh, puis préparer la copie du serveur sur le VPS.
4. Exécuter activate-local.sh uniquement après validation de ses prérequis.
5. Exécuter verify.sh. Le port 8765 reste sur 127.0.0.1.
6. Vérifier l'ancien Caddyfile et sauvegarder la configuration avant toute
   bascule du domaine mcp.guzzler-bot.cloud. Utiliser Caddyfile.example
   seulement après adaptation aux routes déjà présentes et validation Caddy.
7. Associer le nouveau serveur MCP dans ChatGPT Web avec OAuth, puis tester
   l'accès en lecture et en écriture depuis ChatGPT classique.
8. Appairer NAS, seedbox et PC, puis tester chaque machine.
9. Désactiver l'ancien VPS Bridge uniquement après tests complets.

## VPS Hetzner, sous le compte normal

Depuis le dossier vortex-commander :

    bash preflight.sh
    bash prepare.sh

La préparation clone et vérifie une version fixe, applique nos correctifs
VORTEX et exécute des tests. Aucun serveur n'est démarré à cette étape.

Après revue des résultats (demande une confirmation explicite) :

    VORTEX_CONFIRM_ACTIVATION=OUI bash activate-local.sh
    bash verify.sh

L'activation crée deux services utilisateur systemd sur la boucle locale.
Ne PAS exécuter en root, ne PAS changer le firewall, ne PAS publier le port
8765. L'owner token reste dans un fichier privé sur le VPS.

## NAS et seedbox

Récupérer le même dossier vortex-commander sur l'appareil.
Utiliser linux-agent.sh en compte non-root et seulement après tests de la
passerelle. La seedbox avait déjà un agent Remote Desktop Commander en ligne
sur dsb39911.seedbox.io, mais le nouveau backend et ses droits sont à tester.

    bash linux-agent.sh status
    bash linux-agent.sh prepare
    # Après ouverture manuelle de l'appairage côté VPS :
    bash linux-agent.sh pair nas
    bash linux-agent.sh run

Sur la seedbox remplacer nas par seedbox-io.
Ne pas installer de service persistant non autorisé par l'hébergeur.
Voir seedbox.md.

## PC Windows

Sur chaque PC non administrateur, lire windows.md :

    .\windows-agent.ps1 -Action Status
    .\windows-agent.ps1 -Action Prepare

Ne pas appairer avant OAuth validé côté VPS.

## Sécurité et limites

- Le serveur reste lié à localhost jusqu'à activation contrôlée de Caddy.
- Aucun secret ni token ne doit apparaître dans GitHub, les logs ou le chat.
- Les restrictions de commandes du projet ne sont PAS une sandbox.
- Aucun accès root ou privilège Administrateur automatique.
- Docker/Transmission/Plex restent limités aux permissions OS et à celles
  accordées à chaque agent.
- Les tests CI ne garantissent pas la compatibilité réelle des cinq appareils.
- Le plugin MCP de test prouve la communication simple avec ChatGPT, pas encore
  les autorisations d'écriture et de terminal de notre futur connecteur.
