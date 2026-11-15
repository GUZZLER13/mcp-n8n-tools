# VORTEX Commander — préparation SelfHostDesktopMCP

Branche de préparation **isolée**, sans changement dans `main`. Aucun déploiement sur le VPS n'a encore été effectué.

## Objectif

Remplacer VPS Bridge par [SelfHostDesktopMCP](https://github.com/andyching168/SelfHostDesktopMCP) et les agents open source Desktop Commander (VPS, NAS, deux PC et seedbox si autorisée).

## Sur le VPS, sous un compte Linux non-root

```bash
curl -fsSLo vc-preflight.sh https://raw.githubusercontent.com/GUZZLER13/mcp-n8n-tools/vortex-commander-bootstrap/vortex-commander/preflight.sh
bash vc-preflight.sh

curl -fsSLo vc-prepare.sh https://raw.githubusercontent.com/GUZZLER13/mcp-n8n-tools/vortex-commander-bootstrap/vortex-commander/prepare.sh
less vc-prepare.sh
bash vc-prepare.sh
```

Préparer ne démarre ni service ni port public et n'efface aucun ancien projet. Le script épingle le commit upstream `0d67f39aef13ce8253e9a2b7a376e9799a465d22`, installe les dépendances avec scripts npm désactivés, et lance les tests dans un dossier temporaire avant de déplacer les sources vers `~/remote-mcp`.

## Mise en route locale (après audit)

```bash
cd ~/remote-mcp
PUBLIC_URL=https://mcp.guzzler-bot.cloud BIND_HOST=127.0.0.1 DEVICE_ID=vps-hetzner bash deploy/install-linux.sh
curl -i http://127.0.0.1:8765/health
```

**Attention** : lancer l'installation seulement après avoir contrôlé qu'elle ne heurte pas un service existant sur le port 8765 et que les unités systemd utilisateur sont utilisables. Le domaine public et Caddy ne doivent pas être modifiés avant validation. Le jeton owner se trouve sur le VPS et ne doit jamais être publié.

La connexion MCP ChatGPT via OAuth, les outils d'écriture et la compatibilité Windows sont encore **à vérifier**. Le projet ne doit pas être lancé en root, ni servir de shell non protégé. L'ancien VPS Bridge ne sera arrêté qu'après validation réelle.

Documentation détaillée également dans le kit ZIP produit dans la discussion.
