# Windows — installation à valider

SelfHostDesktopMCP ne fournit pas d'installateur automatique de service Windows dans sa version auditée.

1. Installer Node.js >=22.13 et Git sur chaque PC.
2. Cloner le projet upstream sur le PC et vérifier l'installation.
3. Appairer le PC à la passerelle **après** activation HTTPS et OAuth sur le VPS.
4. Tester une lecture de dossier non sensible et un terminal inoffensif.
5. Vérifier le lancement de Desktop Commander stdio Windows : la commande `npx` du projet peut exiger une adaptation pour Windows (ne pas supposer que cela fonctionne).
6. Installer ensuite seulement un démarrage automatique sous un compte Windows limité.

Ne pas désactiver la sécurité de Windows ni exécuter l'agent en administrateur. 
Ne pas stocker de clé API, token propriétaire ou secret dans GitHub.
