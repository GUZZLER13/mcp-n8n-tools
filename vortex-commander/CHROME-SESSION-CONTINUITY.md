# Continuité des sessions Chrome

## Résultats observés

Le 17 novembre 2026, le Chrome NAS a réussi la navigation et les captures sur Racines. Le clic depuis la vitrine vers la démonstration a aussi réussi. Une ouverture ponctuelle de la fiche publique Geneanet de Lorenzo DOYA a présenté une vérification humaine Cloudflare. Le parcours a été suspendu à cet écran.

TinyFetch a renvoyé bot_blocked pour la même URL. Aucun résultat TinyAgent stealth n’est disponible pour cette comparaison.

## Enseignements des documentations

TinyFish annonce un runtime lite et un runtime stealth modifié pour réduire la détection. La documentation mentionne aussi des limites sur les CAPTCHA. Les détails de réalisation du moteur sont insuffisants pour en reproduire la capacité à partir de ces seules pages. [Browser Profiles](https://docs.tinyfish.ai/key-concepts/browser-profiles)

TinyProfiles sauvegarde cookies et stockage de session. Une connexion peut néanmoins expirer ou exiger une nouvelle validation. Cette continuité est une amélioration reproductible dans VORTEX avec un profil local dédié. [TinyProfiles](https://docs.tinyfish.ai/key-concepts/tinyprofile)

Le viewer TinyFish décrit un flux intégré en lecture seule. La prise en main humaine doit être traitée comme une fonctionnalité distincte et testée dans la même session. [Live Browser Preview](https://docs.tinyfish.ai/live-preview)

Cloudflare indique que les navigateurs automatisés ne sont pas pris en charge pour résoudre les challenges de production. Les modifications d’empreinte et certaines extensions peuvent perturber ces contrôles. Le succès reste à mesurer pour chaque site et environnement. [Navigateurs pris en charge](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/)

Chrome DevTools MCP fournit isolated pour un profil temporaire et userDataDir pour choisir un profil. Chrome Headless partage le moteur du Chrome avec interface. Ces options ne garantissent pas un accès à un site protégé. [Configuration](https://developer.chrome.com/docs/devtools/agents/get-started/configuration/), [Headless](https://developer.chrome.com/docs/automation-and-testing/headless)

## Changement préparé

Le backend NAS accepte persistent=true lorsque VORTEX_BROWSER_PERSISTENT=true est présent dans l’environnement local de l’agent. Il conserve le profil éphémère par défaut. Le profil persistant se trouve sous le home du compte navigateur, dans .local/share/vortex-commander/chrome-profile. Chaque dossier de ce chemin doit appartenir au compte et être privé. Les liens symboliques et permissions partagées provoquent un refus. Les fichiers de session existants sont réutilisés.

Les tests couvrent la réutilisation de données fictives et le refus de dossiers partagés ou redirigés. Un test avec deux instances successives de Chromium vérifie la conservation d’un cookie fictif sur un serveur local isolé. Le service déployé reste sur sa configuration éphémère tant que la nouvelle révision et les deux options n’ont pas été installées.

## Suite de livraison

Valider la CI, préparer une mise à jour avec retour arrière du seul agent navigateur, puis vérifier la continuité réelle après redémarrage du service. Ajouter le viewer authentifié et le relais humain dans le même onglet. Conserver une cadence adaptée par site, traiter les limitations et éviter les répétitions de requêtes déjà bloquées. Mesurer les latences des outils existants pendant ces opérations.
