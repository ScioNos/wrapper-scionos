# Validation de wrapper-scioNos 7.3.0

Préparation du 13 octobre 2026, à partir de `7.2.0`, commit `c2d64c77be5092fdd74e9d3246ac4b631cac8e45`. Les corrections et le paquet 7.3.0 sont préparés localement. La publication reste conditionnée au test Keychain réel sur macOS et aux résultats de la CI multiplateforme. Aucun paquet npm, tag ou release GitHub n’a été publié et aucun article n’a été rédigé.

## Corrections vérifiées

| Problème | Résultat | Preuve dans le dépôt |
| --- | --- | --- |
| Flux actif interrompu après 120 s | Première réponse et inactivité séparées, remise à zéro par morceau, durée totale désactivée par défaut | `tests/proxy-timeouts.test.js` avance l’horloge de 476 s sur un vrai flux HTTP loopback ; cas d’inactivité, première réponse absente, plafond explicite et annulation |
| Codex remplace un préféré manquant | Choix interactif obligatoire, même avec un seul modèle ; erreur hors TTY ou avec `--no-prompt` demandant `--model` | `tests/codex-launch.test.js` ; aucun lancement en cas de modèle explicite absent |
| Catalogue Codex trop large | Toute famille explicitement choisie limite le catalogue temporaire et model/list ; RouterLab infère aussi la famille d’un modèle explicite | Tests de catalogue, sélection et vrai client |
| Keychain stdin potentiellement interactif | API Security native via JXA, stdin, aucun secret dans argv, refus d’interaction, relecture et limite de 15 s | Tests unitaires ; `tests/keychain-real.integration.mjs` prêt, résultat macOS en attente |
| OpenCode récent expire avant inférence | Serveur privé natif pour OpenCode 2, conservant l’environnement du lancement | OpenCode 2.0.27 réussit en `--standalone` ; échec du service partagé avant toute requête au fournisseur |
| Nettoyage masque une erreur ou bloque | Erreur originale préservée, ressources nettoyées indépendamment, arrêt des arbres, attente bornée, chemins vérifiés et tentatives sur verrous Windows | `tests/test-lifecycle.test.js`, tests Codex/OpenCode et interruption avec sortie redirigée |

Les destinations de production fixes, authentification loopback, restrictions de modèles, limites de corps et assertions de sécurité sont conservées. Les en-têtes entrants restent limités à 30 s et le corps client à 120 s ; ces limites ne plafonnent pas la durée d’un flux de réponse actif.

## Validations locales

Environnement : Windows x64, Node 24.19.0 et exécutable officiel isolé Node 22.13.0, npm 11.7.0. Tous les appels d’inférence visent des serveurs loopback fictifs avec des clés fictives. Les installations et l’audit npm utilisent le registre ; aucune inférence de production RouterLab n’a été exécutée.

| Commande ou contrôle | Résultat local |
| --- | --- |
| `npm test` | Réussi : 226 tests réussis, zéro échec, un test conditionnel ignoré |
| `npm run test:coverage` | Réussi : 92,00 % lignes, 91,69 % fonctions, 83,43 % branches ; seuils de 85/85/80 % conservés |
| Node 22.13.0 : tests et couverture | Réussis : 92,00 % lignes, 91,69 % fonctions, 83,54 % branches |
| `npm run test:entry-modes` | Réussi : commandes installées et npx, services routerlab et llm, menu puis sortie ; paquet 7.3.0 construit et installé temporairement |
| `npm run test:claude-real` | Réussi, 13 scénarios avec Claude Code 2.1.296 |
| `npm run test:codex-real` | Réussi avec Codex 0.144.1 et 0.157.0 |
| `npm run test:opencode-real` | Réussi avec OpenCode 1.18.30 et 2.0.27, streaming et cycle natif read |
| Interruptions SIGINT/SIGTERM avec sortie redirigée | Réussies ; fin bornée et codes 130/143 |
| Arbre de processus parent/petit-fils avec sortie redirigée | Réussi ; le petit-fils cesse d’écrire après annulation |
| `npm audit` | Réussi, zéro vulnérabilité signalée le 13 octobre 2026 |
| `npm pack --dry-run` | Réussi ; version 7.3.0, sources/documents inclus, tests et dossiers de travail exclus |
| Test Keychain réel | Non exécuté sur cet hôte Windows ; doit réussir sur macOS |
| CI Windows/macOS/Linux | Matrice préparée, pas de résultat distant revendiqué |

Les sorties détaillées de cette préparation sont conservées localement dans `.codex-tmp/` et exclues du paquet. L’archive construite est `.codex-tmp/wrapper-scionos-7.3.0.tgz`. Les diagnostics CI seront archivés pendant 14 jours. La validation distante est autorisée sur une branche GitHub dédiée, avec les runners standards du dépôt public. Les résultats macOS et multiplateformes seront consignés après leur exécution ; aucune publication npm, de tag ou de release GitHub n’est autorisée à cette étape.

## Matrice outil version fonctionnalité statut

« Réussi simulé » signifie un vrai binaire client et un fournisseur HTTP fictif, sans preuve de compatibilité d’un modèle de production. « Unitaire » signifie des composants/adaptateurs avec injections. « À exécuter » ne doit pas être présenté comme un résultat réussi.

| Outil ou composant | Version | Fonctionnalité | Plateforme | Statut |
| --- | --- | --- | --- | --- |
| Claude Code | 2.1.296 | 13 mappings Native, AWS, GPT, Trial et LLM Divers ; auth locale, streaming, paramètres hostiles refusés | Windows | Réussi simulé |
| Claude Code | 2.1.296 | Cycles d’outils, reprise de sessions, MCP et politiques de sandbox/approbation en exécution complète | Toutes | À exécuter ; conservation des paramètres couverte par les tests d’adaptateur |
| Codex | 0.144.1 | Catalogue temporaire, model/list, modèle exact, Responses SSE et auth directe fictive | Windows | Réussi simulé |
| Codex | 0.157.0 | Mêmes contrôles | Windows | Réussi simulé |
| Codex | Versions précédentes | Minimum 0.144.1 ; versions plus anciennes refusées | Toutes | Politique unitaire |
| OpenCode | 1.18.30 | `/v1/chat/completions`, auth locale/amont, modèle gpt-6-astra, SSE, appel read et retour outil | Windows | Réussi simulé |
| OpenCode | 2.0.27 | Mêmes contrôles avec serveur natif privé `--standalone` | Windows | Réussi simulé |
| OpenCode | 2.0.27 | Service partagé persistant avec configuration proxy temporaire | Windows | Incompatible avec l’intégration par lancement ; échec reproduit avant toute inférence |
| OpenCode | <1.18.30 ou version non analysable | Diagnostic de version et refus du lancement | Toutes | Politique unitaire ; aucune compatibilité ancienne annoncée |
| Desktop et Cowork | Version applicative non testée | Profil commun, mapping, CORS, authentification, requêtes, rollback et nettoyage du proxy | Windows, chemins macOS/Linux simulés | Unitaire |
| Desktop et Cowork | Version applicative non testée | Application réelle, outils Cowork et egress réseau effectif | Windows/macOS/Linux selon disponibilité | À exécuter |
| Proxies Claude Code/OpenCode/Desktop/Cowork | 7.3.0 | Délais séparés, flux actif >120 s, inactivité, plafond explicite, déconnexion et nettoyage | Windows, Node 22.13.0/24.19.0 | Réussi HTTP avec horloge contrôlée |
| Keychain | macOS local à déterminer | Écriture, mise à jour, relecture, ancienne entrée et suppression d’un compte temporaire propre au test | macOS | À exécuter ; bloque la validation de publication |
| CI générale | Node 22.13.0, 22, 23.5.0, 24, 25, 26 | Tests, couverture, paquet, Claude/Codex, Keychain sur macOS | Windows/macOS/Linux | Préparée |
| CI OpenCode | Node 22.13.0, 24, 26 ; clients 1.18.30/2.0.27 | Auth, HTTP, modèle, streaming, outil | Windows/macOS/Linux | Préparée |

Les versions futures ou intermédiaires acceptées par les seuils de détection ne sont pas implicitement validées. Les identifiants du catalogue dépassent le petit ensemble utilisé dans les essais de protocole.

## Diagnostic OpenCode 2

Le binaire récent installé est `@opencode/cli@2.0.27`, tandis que le minimum testé est `opencode-ai@1.18.30`. L’instrumentation a observé zéro requête au fournisseur lors du lancement v2 avec service partagé. Le client démarrait `serve --service` ; sous le bac à sable local ce processus échouait sur `chdir` avec EPERM, et hors bac à sable le port géré `127.0.0.1:49374` était déjà occupé. Ces erreurs précèdent le protocole de streaming du simulateur. Aucun service personnel existant n’a été arrêté pour libérer ce port.

L’aide du binaire décrit `run --standalone` comme un serveur privé. Avec ce mode, les requêtes arrivent immédiatement au proxy ; texte SSE, appel read, retour de l’outil et réponse finale passent sur les deux versions. Le drapeau doit suivre `run` pour cette commande ; le placer avant le sous-programme produit une erreur de parsing. Le wrapper l’ajoute pour OpenCode 2 au bon niveau et conserve les paramètres natifs de permissions, sessions et MCP. Les transports `--server`, `--attach` et les sous-commandes serveur ne peuvent pas remplacer le routage contrôlé par le wrapper.

## Stockage macOS et validation restante

Le [code Apple de security](https://github.com/apple-oss-distributions/Security/blob/main/SecurityTool/macOS/keychain_add.c) utilise deux appels getpass lorsque `-w` est fourni sans valeur. Cela justifie le retrait de cette interface pour une écriture sur stdin ; l’échec concret dépend du terminal et du macOS installé. Le test réel conserve un probe borné de l’ancienne commande et n’en conserve que le statut, puis vérifie le nouvel auxiliaire.

Le backend utilise [SecItemAdd](https://developer.apple.com/documentation/security/secitemadd(_:_:)), SecItemUpdate, SecItemCopyMatching et SecItemDelete, avec interaction interdite. L’entrée de test utilise un compte UUID `wrapper-scionos-test-*`, distinct des comptes RouterLab de l’utilisateur, dans les espaces `wrapper-scionos` et `claude-scionos`. Le Keychain doit être disponible et autorisé ; un refus doit produire une erreur explicite, sans fallback en clair. Le résultat natif de ce backend ne peut pas être certifié depuis Windows.

Avant publication, exécuter `npm run test:keychain-real` sur macOS, obtenir les résultats de la CI préparée et consigner les versions OS/clients. Pour annoncer le fonctionnement applicatif Desktop/Cowork, lancer leurs applications réelles avec un profil temporaire dédié et un fournisseur fictif ; les tests de fichiers/proxy ne suffisent pas.

## Affirmations utilisables dans le futur article

| Affirmation permise | Portée et preuve |
| --- | --- |
| Un lanceur propose cinq outils : Claude Code, Desktop, Cowork, Codex et OpenCode | Menu et adaptateurs ; Desktop/Cowork partagent une intégration |
| Le wrapper découvre le catalogue et intersecte les modèles avec une liste autorisée | Tests de découverte, erreurs et allowlists ; aucune preuve d’inférence de tous les modèles |
| Codex respecte le modèle explicite et demande un choix si le préféré manque | Régressions interactives/non interactives et catalogue limité à la famille |
| Un flux proxy actif peut dépasser 120 secondes sans plafond total par défaut | Régression HTTP déterministe avec 476 secondes virtuelles et remise à zéro par morceau |
| Les trois clients CLI ont été essayés avec des services fictifs | Versions et fonctionnalités exactes de la matrice, uniquement Windows |
| Le paquet 7.3.0 peut être construit et lancé localement | Entry modes, audit et inspection du paquet ; publication encore conditionnelle |
| Les tokens enregistrés passent par les protections natives au repos | DPAPI/Secret Service existants ; nouvelle écriture Keychain à confirmer sur macOS |
| Les paramètres natifs sont conservés par les adaptateurs | Assertions de transmission ; ne pas annoncer une certification de tous les MCP, outils, sessions ou politiques |

Les tarifs, pourcentages d’économie, gratuité, prix d’abonnement, conditions de résiliation, localisation des serveurs et traitement des données nécessitent des sources RouterLab indépendantes, datées et adaptées au service concerné. Les tests du wrapper ne prouvent aucune de ces affirmations. Les anciennes notes tarifaires du changelog restent historiques et ne constituent pas une preuve tarifaire actuelle.
