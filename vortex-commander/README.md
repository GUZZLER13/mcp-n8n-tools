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


## Activer seulement apres preparation et audit

```bash
curl -fsSLo vc-activate.sh https://raw.githubusercontent.com/GUZZLER13/mcp-n8n-tools/vortex-commander-bootstrap/vortex-commander/activate-local.sh
less vc-activate.sh
VORTEX_CONFIRM_ACTIVATION=OUI bash vc-activate.sh
curl -fsSLo vc-verify.sh https://raw.githubusercontent.com/GUZZLER13/mcp-n8n-tools/vortex-commander-bootstrap/vortex-commander/verify.sh
bash vc-verify.sh
```

Le script de mise en route cree des services utilisateur et des secrets prives, mais n'installe pas le routage Caddy public.
Avant la bascule de l'ancien domaine, sauvegarder l'ancien Caddyfile et lire `Caddyfile.example`. Pour revenir en arriere sur les services nouvellement installes :

```bash
curl -fsSLo vc-stop.sh https://raw.githubusercontent.com/GUZZLER13/mcp-n8n-tools/vortex-commander-bootstrap/vortex-commander/stop-local.sh
bash vc-stop.sh
```

L'acces via ChatGPT Plus aux outils d'ecriture reste a valider par un test en conditions reelles. La compatibilite Windows et l'agent sur seedbox restent aussi a verifier.

## Mise en route locale (après audit)

```bash
cd ~/remote-mcp
PUBLIC_URL=https://mcp.guzzler-bot.cloud BIND_HOST=127.0.0.1 DEVICE_ID=vps-hetzner bash deploy/install-linux.sh
curl -i http://127.0.0.1:8765/health
```

**Attention** : lancer l'installation seulement après avoir contrôlé qu'elle ne heurte pas un service existant sur le port 8765 et que les unités systemd utilisateur sont utilisables. Le domaine public et Caddy ne doivent pas être modifiés avant validation. Le jeton owner se trouve sur le VPS et ne doit jamais être publié.

La connexion MCP ChatGPT via OAuth, les outils d'écriture et la compatibilité Windows sont encore **à vérifier**. Le projet ne doit pas être lancé en root, ni servir de shell non protégé. L'ancien VPS Bridge ne sera arrêté qu'après validation réelle.

Documentation détaillée également dans le kit ZIP produit dans la discussion.
