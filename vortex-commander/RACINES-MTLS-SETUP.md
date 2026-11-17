# RACINES ↔ VORTEX : liaison permanente mTLS, sans jeton utilisateur

**État : code en revue sur les PR RACINES n° 62 et VORTEX n° 5. Non déployé.**
Cette liaison ne doit PAS être activée avant les tests de restauration des sauvegardes,
la séparation des droits de la machine VORTEX et les tests d'intégration mTLS.

## Fonctionnement choisi

1. La base généalogique reste dans PostgreSQL RACINES. Il n'existe aucune base miroir sur le NAS.
2. RACINES expose un **deuxième port TLS strictement local** sur le VPS
   (`127.0.0.1:4591`, configurable), désactivé par défaut et jamais publié par Caddy.
3. Le client VORTEX et le serveur RACINES disposent chacun de leur **certificat machine**
   émis par une autorité privée locale. RACINES valide le certificat du client et son
   empreinte ; VORTEX valide le certificat du serveur et le CA privé. Les clés ne quittent
   pas le VPS, elles ne figurent ni dans ChatGPT ni dans GitHub.
4. Le serveur autorise exclusivement une **liste statique explicite de familles**.
   Chaque lecture s'exécute via le propriétaire familial vérifié et le contrôle RLS
   RACINES existant, sans jamais autoriser un changement d'arbre.
5. L'agent VORTEX expose trois outils : `racines_list_families`,
   `racines_find_people` et `racines_get_research_dossier`.
   Pas de `racines_write` ni de passerelle SQL.
6. Un membre de la famille n'a **aucune manipulation de jeton à effectuer**.
   La liaison machine est établie une fois par l'administrateur, avec renouvellement
   et révocation prévus. Elle ne nécessite pas d'autorisation répétée pour lire.

## Paramètres côté RACINES

Les variables suivantes sont décrites dans `server/.env.example` :

```ini
RACINES_VORTEX_MTLS_ENABLED=false
RACINES_VORTEX_PORT=4591
RACINES_VORTEX_FAMILY_IDS=
RACINES_VORTEX_CA_FILE=
RACINES_VORTEX_CERT_FILE=
RACINES_VORTEX_KEY_FILE=
RACINES_VORTEX_CLIENT_SHA256=
```

Ne pas activer en production avec des champs manquants. Le serveur refuse de
démarrer la partie mTLS lorsque les certificats, l'empreinte ou les identifiants
de famille sont invalides. La liste de familles peut être modifiée pour
révoquer l'accès à une branche, puis rechargée lors d'un redémarrage contrôlé.

## Paramètres privés côté VORTEX

Le fichier local `~/.config/vortex-commander/racines-mtls.json`, **0600**,
n'est pas versionné. Sa structure sans valeurs secrètes est :

```json
{
  "servername": "racines-vortex.internal",
  "port": 4591,
  "ca": "/chemin/prive/ca.pem",
  "cert": "/chemin/prive/vortex-client.pem",
  "key": "/chemin/prive/vortex-client.key"
}
```

Le client accepte uniquement `127.0.0.1`, avec vérification du nom du serveur,
du certificat serveur et du CA. Les chemins configurés doivent être absolus,
les fichiers protégés par des permissions de lecture propriétaires. Les
certificats sont un **mécanisme technique**, pas un mot de passe demandé à la
famille.

Ne jamais inclure le certificat privé ou son chemin réel dans un outil MCP, une
réponse ChatGPT, un journal de diagnostic ou un commit.

## Préparation des certificats (phase opérationnelle ultérieure)

- Créer une CA privée et deux certificats distincts : serveur (SAN DNS
  `racines-vortex.internal`, usage serverAuth) et client VORTEX (clientAuth).
- Utiliser des durées limitées, vérifier leur date d'expiration et prévoir
  rotation automatique avec alerte **avant** expiration. Ne pas installer une
  CA auto-signée dans les magasins de confiance globaux des appareils.
- Installer les clés dans un emplacement **privé** du VPS, accessible seulement
  aux identités de service requises (répertoires 0700, fichiers 0600).
- Utiliser une **identité OS dédiée** pour l'agent RACINES, isolée des outils
  terminal/navigateur génériques. Les simples règles de chemins de Desktop
  Commander ne constituent pas une sandbox ; ne pas utiliser le compte root.
- Vérifier que le conteneur RACINES en mode réseau hôte voit uniquement les
  chemins explicitement montés et que le listener mTLS est lié à loopback.
- Tester sans certificat, avec certificat inconnu et avec certificat valide.
  Seul le client autorisé doit lire la liste des familles.

## Attention : isolation des permissions

Le tunnel TLS protège l'accès réseau, mais **ne protège pas la clé client contre
un processus possédant les mêmes droits OS**. Il faut donc isoler le lecteur
RACINES des outils système génériques : autre utilisateur, permissions de
fichiers et activation d'un backend prédéfini (jamais commande libre). Ne pas
activer ce backend dans l'agent administratif existant tant que cette
séparation n'a pas été vérifiée.

Les pages Web et archives peuvent contenir des instructions hostiles : leur
contenu reste une donnée non fiable. Il ne doit pas autoriser des actions
sur les machines ou des mises à jour de filiations.

## Agent VORTEX de lecture : séparation obligatoire

Le backend `racines` est **refusé dans l'agent VORTEX généraliste**. Il ne peut
être démarré que sur Linux, en mode `VORTEX_RACINES_READER_ONLY=true`, par le
compte système non privilégié nommé `vortex-racines`.

Cet agent doit disposer de son **propre appareil appairé à la passerelle** et
d'une configuration privée distincte. Dans ce mode, l'agent **ne lance pas
Desktop Commander** et ignore les autres backends demandés par la console,
y compris Chrome ou une commande personnalisée. Le compte `vortex-racines`
ne doit pas appartenir aux groupes sudo, docker ou administrateurs, ni avoir
accès aux clés du serveur ou aux sessions humaines.

L'activation exige donc une installation explicite et contrôlée de ce service
séparé ; définir simplement la variable sur l'agent administratif ne permet
pas de démarrer le lecteur. Les certificats client restent lisibles uniquement
par ce compte, avec possibilité de rotation et révocation. **Rien de cela n'est
déployé à ce stade.**

## Recette obligatoire

1. Tests SQL authentification et RLS synthétiques verts.
2. Tests réels de handshake TLS : pas de certificat = refus ; certificat non
   reconnu = refus ; certificat autorisé = accès.
3. Lecture `racines_list_families` depuis l'agent séparé ; seules les
   familles configurées sont visibles.
4. Recherche d'une personne fictive puis lecture de son dossier, avec même
   version que l'API familiale.
5. Refus de toutes les écritures, de tout accès inter-familles, des documents
   bruts R2 et des chemins d'API non déclarés.
6. Test d'expiration et de rotation certificat sans divulgation des secrets.
7. Sauvegarde PostgreSQL + R2, restauration isolée vérifiée et rollback
   documenté avant mise en production.

**Rappel :** il n'y a pas de besoin de Chrome sur le VPS pour cet accès
interne. Chrome DevTools reste destiné au NAS pour les sites Web et archives.
