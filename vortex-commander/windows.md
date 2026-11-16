# VORTEX Commander — STEF-PC et ENZO-LAPTOP

La suite originale SelfHostDesktopMCP échoue sous Windows (verrous SQLite,
contrôles de chemins sensibles et hypothèses de permissions Unix).
La branche vortex-commander-hardening applique des correctifs ciblés et vérifie
le démarrage réel du moteur Desktop Commander local en CI. Elle n'a pas encore
été testée sur tes vrais PC.

## Préparer (sans terminal administrateur)

Pré-requis : Node.js >= 22.13, Git, npm, et une copie du dossier
vortex-commander de la branche vortex-commander-hardening.
Dans PowerShell ouvert dans ce dossier :

    .\windows-agent.ps1 -Action Status
    .\windows-agent.ps1 -Action Prepare

La préparation ne démarre aucun service et n'ouvre aucun port. Elle clone un
commit fixe de SelfHostDesktopMCP et installe Desktop Commander 0.3.3
sans exécuter les scripts npm de post-installation.

## Associer (après activation et vérification de la passerelle VPS)

Ouvrir la fenêtre d'appairage sur le VPS dans un terminal privé :

    cd ~/remote-mcp
    node gateway/admin.js pair

Sur STEF-PC (non-admin) :

    .\windows-agent.ps1 -Action Pair -DeviceId stef-pc
    .\windows-agent.ps1 -Action Run

Sur ENZO-LAPTOP remplacer stef-pc par enzo-laptop.
Les jetons sont conservés localement, pas dans GitHub ni dans ChatGPT.

## Tests requis sur les PC

- L'appareil apparaît avec son identifiant dans devices_list.
- read_file, list_directory, edit_block et write_file fonctionnent uniquement
  dans des dossiers de tests autorisés.
- start_process fonctionne pour des commandes non dangereuses.
- Les chemins de secrets et dossiers SSH ne sont pas accessibles.
- L'agent se reconnecte après veille/réouverture de la session.
- L'agent tourne avec les droits ordinaires du compte Windows.

Démarrage automatique FACULTATIF : seulement APRES avoir valide Run sur le vrai PC.
Le script cree un raccourci utilisateur dans le dossier de demarrage, sans admin,
qui lance windows-watchdog.ps1. Ce superviseur relance automatiquement le
nouvel agent apres une sortie inattendue (pause de 15 s), et l'agent gere
lui-meme la reconnexion reseau apres veille ou coupure Internet. Le superviseur
s'arrete si l'appareil est revoque. Il ne gere jamais l'ancien Desktop Commander :

    .\windows-agent.ps1 -Action Autostart

Pour le retirer :

    .\windows-agent.ps1 -Action RemoveAutostart

Le lancement a lieu lors de l'ouverture de session Windows. Il n'est pas
equivalent a un service systeme disponible avant connexion.
Ne pas desactiver les protections Windows.
