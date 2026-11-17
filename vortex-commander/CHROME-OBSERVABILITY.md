# Observer et contrôler VORTEX Chrome

## Choix de fonctionnement

Le service de visualisation fonctionne sur le NAS avec le compte navigateur dédié. Le dashboard accède à une API authentifiée via le VPS. Les actions Chrome utilisent la file du seul appareil `pc-nas-browser`. Les appels Desktop Commander poursuivent leur chemin habituel.

La première version affiche des captures JPEG actualisées à la demande du spectateur. Le navigateur du spectateur demande la capture suivante après réception de la précédente, à une fréquence maximale d’une par seconde. Il suspend les demandes quand la page devient invisible ou que la session est fermée. Une seule acquisition est partagée entre spectateurs simultanés. Le serveur renvoie les images avec `Cache-Control: no-store`, sans journaliser leur contenu. Aucune capture automatique en arrière-plan.

Le flux vidéo CDP reste une évolution à mesurer sur le NAS. Il exige un canal distinct avec authentification, contrôle des spectateurs, acquittement des images et arrêt lors de la déconnexion du dernier spectateur. Le port de débogage reste accessible uniquement au service local. Les contraintes CPU et mémoire seront appliquées à l’unité systemd dédiée.

## Composant développé

`browser-session.mjs` fournit une file séquentielle bornée, les états running/paused/stopped, un journal de 100 événements avec compteur des événements sortis de la fenêtre, un signal d’annulation et une acquisition de capture à la demande. Les événements contiennent le nom de l’opération et son résultat technique. Les arguments et réponses de Chrome restent hors du journal.

La pause suspend les actions en attente. Une action engagée termine avant la pause effective du navigateur. L’arrêt signale l’annulation au transport et rejette les actions en attente. Le raccord au transport devra réellement interrompre le processus Chrome lorsque son appel ne respecte pas le signal d’annulation. Un résultat MCP portant isError apparaît comme un échec. Une réussite technique doit encore être accompagnée d’une vérification fonctionnelle pour être présentée comme résultat vérifié.

Ce composant est testé localement sur des opérations simulées. L’overlay raccorde désormais les appels Chrome à sa file et expose status/pause/resume/stop sur le seul agent navigateur dédié. Les commandes de contrôle passent par le canal MCP existant. Les endpoints du dashboard, les délais d’expiration, la visualisation réelle et l’arrêt physique d’un appel déjà engagé restent à développer. Après stop, une nouvelle session exige actuellement le redémarrage du processus dédié.

## Raccordement à réaliser

1. L’agent navigateur applique les politiques existantes, puis transmet l’opération autorisée à la session. Il conserve le délai maximal du transport et la temporisation de navigation existante.
2. Le dashboard ouvre une session liée à l’utilisateur authentifié et à l’appareil navigateur. Le serveur vérifie cette attribution pour chaque lecture, capture et commande. Les commandes mutantes exigent la protection CSRF.
3. Le service publie un état compact comprenant objectif, durée, état et étapes. Le contenu des pages, captures et URL reste privé. Les URL affichées masquent les identifiants et paramètres sensibles.
4. La capture emprunte la même file Chrome que les actions pour éviter une capture concurrente avec une navigation. Un échec de capture laisse les commandes d’arrêt disponibles.
5. Les actions sensibles conservent leurs autorisations existantes. Le bouton du spectateur ne modifie aucune politique d’accès.
6. Ajouter une expiration de session, l’arrêt du transport et le nettoyage des ressources lors de l’expiration ou de l’arrêt humain. Limiter les abonnements et les corps des requêtes.

## Écran et réception

Sur PC, montrer la page au centre et les étapes dans une colonne latérale. Sur Pixel 8 Pro en portrait, placer la page au-dessus du journal et garder les commandes Pause/Reprendre/Arrêter accessibles. En paysage, utiliser la largeur pour la page. Afficher clairement une capture ancienne, une session déconnectée et un chargement en cours.

Vérifier une navigation réelle vers une page fictive, une capture après clic, le changement d’onglet, une erreur visible, la pause entre deux actions et l’arrêt pendant une action. Tester les refus interutilisateurs et les requêtes CSRF. Mesurer les latences p50/p95 des outils existants avec zéro, un et plusieurs spectateurs, comparer au relevé avant activation et appliquer le contrat PERFORMANCE-CONTRACT.md. Tester la désactivation du service de visualisation.

L’installation reste soumise à la sauvegarde réelle et à l’intervention décrites dans CHROME-OPERATOR-HANDOFF.md. Knowledge conserve sa PR indépendante.
