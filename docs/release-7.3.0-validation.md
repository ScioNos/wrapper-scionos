# Validation de wrapper-scioNos 7.3.0

Validation du 13 octobre 2026, à partir de `7.2.0`, commit `c2d64c77be5092fdd74e9d3246ac4b631cac8e45`. Les validations techniques de la version 7.3.0 sont réussies : [exécution GitHub Actions 38377724549](https://github.com/ScioNos/wrapper-scionos/actions/runs/38377724549), **37 jobs réussis, zéro échec**, sur le commit de code `df40a014447007171cf6b235a5aae7ddb12fa955`. La branche de validation est `codex/release-7.3.0-validation` ; le code testé est conservé pour la release, avec des ajouts de documentation. Aucun article n’a été rédigé.

La publication 7.3.0 sur npm et GitHub a été autorisée le 13 octobre 2026. Références de version : [release GitHub v7.3.0](https://github.com/ScioNos/wrapper-scionos/releases/tag/v7.3.0), [paquet npm 7.3.0](https://www.npmjs.com/package/wrapper-scionos/v/7.3.0) et [branche principale](https://github.com/ScioNos/wrapper-scionos/tree/main).

## Corrections vérifiées

| Problème | Résultat | Preuve dans le dépôt |
| --- | --- | --- |
| Flux actif interrompu après 120 s | Première réponse et inactivité séparées, remise à zéro par morceau, durée totale désactivée par défaut | `tests/proxy-timeouts.test.js` avance l’horloge de 476 s sur un vrai flux HTTP loopback ; cas d’inactivité, première réponse absente, plafond explicite et annulation |
| Codex remplace un préféré manquant | Choix interactif obligatoire, même avec un seul modèle ; erreur hors TTY ou avec `--no-prompt` demandant `--model` | `tests/codex-launch.test.js` ; aucun lancement en cas de modèle explicite absent |
| Catalogue Codex trop large | Toute famille explicitement choisie limite le catalogue temporaire et model/list ; RouterLab infère aussi la famille d’un modèle explicite | Tests de catalogue, sélection et vrai client |
| Keychain stdin potentiellement interactif | Ancienne commande : sortie zéro mais relecture différente ; nouvelle écriture sur stdin, relecture et limite de 15 s ; accès aux anciennes entrées conservé | `tests/keychain-real.integration.mjs` réussi sur le vrai Keychain macOS, nouveaux comptes et deux espaces historiques |
| OpenCode récent expire avant inférence | Serveur privé natif pour OpenCode 2, conservant l’environnement du lancement | OpenCode 2.0.27 réussit en `--standalone` ; échec du service partagé avant toute requête au fournisseur |
| Nettoyage masque une erreur ou bloque | Erreur originale préservée, ressources nettoyées indépendamment, arrêt des arbres, attente bornée, chemins vérifiés et tentatives sur verrous Windows | `tests/test-lifecycle.test.js`, tests Codex/OpenCode et interruption avec sortie redirigée ; délai déclenché après la première écriture du petit-fils, démarrage borné séparément |

Les destinations de production fixes, authentification loopback, restrictions de modèles, limites de corps et assertions de sécurité sont conservées. Les en-têtes entrants restent limités à 30 s et le corps client à 120 s ; ces limites ne plafonnent pas la durée d’un flux de réponse actif.

## Validations locales

Environnement : Windows x64, Node 24.19.0 et exécutable officiel isolé Node 22.13.0, npm 11.7.0. Tous les appels d’inférence visent des serveurs loopback fictifs avec des clés fictives. Les installations et l’audit npm utilisent le registre ; aucune inférence de production RouterLab n’a été exécutée.

| Commande ou contrôle | Résultat local |
| --- | --- |
| `npm test` | Réussi sur le code final : 229 tests réussis sur 230, zéro échec, un test conditionnel ignoré |
| `npm run test:coverage` | Réussi sur le code final : 92,03 % lignes, 91,69 % fonctions, 83,45 % branches ; seuils de 85/85/80 % conservés |
| Node 22.13.0 : tests et couverture | Réussis sur le code final : 92,03 % lignes, 91,69 % fonctions, 83,35 % branches |
| `npm run test:entry-modes` | Réussi : commandes installées et npx, services routerlab et llm, menu puis sortie ; paquet 7.3.0 construit et installé temporairement |
| `npm run test:claude-real` | Réussi, 13 scénarios avec Claude Code 2.1.296 |
| `npm run test:codex-real` | Réussi avec Codex 0.144.1 et 0.157.0 |
| `npm run test:opencode-real` | Réussi avec OpenCode 1.18.30 et 2.0.27, streaming et cycle natif read |
| Interruptions SIGINT/SIGTERM avec sortie redirigée | Réussies ; fin bornée et codes 130/143 |
| Arbre de processus parent/petit-fils avec sortie redirigée | Réussi ; le petit-fils cesse d’écrire après annulation |
| `npm audit` | Réussi, zéro vulnérabilité signalée le 13 octobre 2026 |
| `npm pack --dry-run` | Réussi ; version 7.3.0, sources/documents inclus, tests et dossiers de travail exclus |
| Test Keychain réel | Réussi sur les runners macOS, dont un job indépendant ; ignoré sur l’hôte Windows |
| CI Windows/macOS/Linux | Réussie : 18 jobs généraux, 18 jobs OpenCode et un job Keychain indépendant |

Les sorties détaillées et le récapitulatif `ci-7.3.0-results.json` sont conservés localement dans `.codex-tmp/` et exclus du paquet. L’archive finale est `.codex-tmp/wrapper-scionos-7.3.0.tgz` ; elle accompagne la release GitHub et sert à la publication npm. Les diagnostics CI sont archivés pendant 14 jours. La validation et la release GitHub utilisent `gh` avec le compte ScioNos ; npm utilise le propriétaire `scionos`. Les runners de validation sont les runners standards du dépôt public.

## Résultats CI

Les 18 jobs généraux croisent les trois systèmes avec Node `22.13.0`, `22`, `23.5.0`, `24`, `25` et `26`. Ils exécutent tests unitaires avec sortie redirigée, couverture, entry modes, vrais clients Claude/Codex, audit, inspection du paquet et lancement du paquet installé/npx. Les six jobs macOS exécutent aussi Keychain réel. Les 18 jobs OpenCode croisent les trois systèmes, Node `22.13.0`/`24`/`26` et les deux clients `1.18.30`/`2.0.27`. Les versions Node non épinglées désignent les versions résolues par setup-node dans cette exécution, pas toutes les versions d’une ligne.

| Runner relevé | Node du job `24` | Couverture lignes / fonctions / branches | Statut |
| --- | --- | --- | --- |
| Windows Server 2025, 10.0.26100, x64 | 24.21.0 | 92,05 / 91,69 / 83,51 % | Réussi |
| macOS 26.6.2, 25G83, arm64 | 24.20.0 | 92,24 / 91,69 / 83,55 % | Réussi, Keychain réel inclus |
| Ubuntu 24.04.5 LTS, x64 | 24.21.0 | 92,02 / 91,53 / 83,37 % | Réussi |

Les seuils de couverture et les assertions de sécurité passent dans les 18 configurations générales. Toutes les inférences des vrais clients utilisent des fournisseurs et des clés fictifs.

## Matrice outil version fonctionnalité statut

« Réussi simulé » signifie un vrai binaire client et un fournisseur HTTP fictif, sans preuve de compatibilité d’un modèle de production. « Unitaire » signifie des composants/adaptateurs avec injections. « À exécuter » ne doit pas être présenté comme un résultat réussi.

| Outil ou composant | Version | Fonctionnalité | Plateforme | Statut |
| --- | --- | --- | --- | --- |
| Claude Code | 2.1.296 | 13 mappings Native, AWS, GPT, Trial et LLM Divers ; auth locale, streaming, paramètres hostiles refusés | Windows/macOS/Linux | Réussi simulé, CI |
| Claude Code | 2.1.296 | Cycles d’outils, reprise de sessions, MCP et politiques de sandbox/approbation en exécution complète | Toutes | À exécuter ; conservation des paramètres couverte par les tests d’adaptateur |
| Codex | 0.144.1 | Catalogue temporaire, model/list, modèle exact, Responses SSE et auth directe fictive | Windows/macOS/Linux | Réussi simulé, CI |
| Codex | 0.157.0 | Mêmes contrôles | Windows | Réussi simulé |
| Codex | Versions précédentes | Minimum 0.144.1 ; versions plus anciennes refusées | Toutes | Politique unitaire |
| OpenCode | 1.18.30 | `/v1/chat/completions`, auth locale/amont, modèle gpt-6-astra, SSE, appel read et retour outil | Windows/macOS/Linux | Réussi simulé, CI |
| OpenCode | 2.0.27 | Mêmes contrôles avec serveur natif privé `--standalone` | Windows/macOS/Linux | Réussi simulé, CI |
| OpenCode | 2.0.27 | Service partagé persistant avec configuration proxy temporaire | Windows | Incompatible avec l’intégration par lancement ; échec reproduit avant toute inférence |
| OpenCode | <1.18.30 ou version non analysable | Diagnostic de version et refus du lancement | Toutes | Politique unitaire ; aucune compatibilité ancienne annoncée |
| Desktop et Cowork | Version applicative non testée | Profil commun, mapping, CORS, authentification, requêtes, rollback et nettoyage du proxy | Windows/macOS/Linux en CI, profils temporaires simulés | Unitaire |
| Desktop et Cowork | Version applicative non testée | Application réelle, outils Cowork et egress réseau effectif | Windows/macOS/Linux selon disponibilité | À exécuter |
| Proxies Claude Code/OpenCode/Desktop/Cowork | 7.3.0 | Délais séparés, flux actif >120 s, inactivité, plafond explicite, déconnexion et nettoyage | Windows/macOS/Linux, matrice Node générale | Réussi HTTP avec horloge contrôlée, CI |
| Keychain | macOS 26.6.2 arm64 | Écriture native, mise à jour UTF-8, relecture, anciennes entrées créées par security et suppression de comptes temporaires propres au test | macOS, six configurations Node et job indépendant | Réussi réel |
| CI générale | Node 22.13.0, 22, 23.5.0, 24, 25, 26 | Tests, couverture, paquet, Claude/Codex, Keychain sur macOS | Windows/macOS/Linux | 18/18 réussis |
| CI OpenCode | Node 22.13.0, 24, 26 ; clients 1.18.30/2.0.27 | Auth, HTTP, modèle, streaming, outil | Windows/macOS/Linux | 18/18 réussis |

Les versions futures ou intermédiaires acceptées par les seuils de détection ne sont pas implicitement validées. Les identifiants du catalogue dépassent le petit ensemble utilisé dans les essais de protocole.

## Diagnostic OpenCode 2

Le binaire récent installé est `@opencode/cli@2.0.27`, tandis que le minimum testé est `opencode-ai@1.18.30`. L’instrumentation a observé zéro requête au fournisseur lors du lancement v2 avec service partagé. Le client démarrait `serve --service` ; sous le bac à sable local ce processus échouait sur `chdir` avec EPERM, et hors bac à sable le port géré `127.0.0.1:49374` était déjà occupé. Ces erreurs précèdent le protocole de streaming du simulateur. Aucun service personnel existant n’a été arrêté pour libérer ce port.

L’aide du binaire décrit `run --standalone` comme un serveur privé. Avec ce mode, les requêtes arrivent immédiatement au proxy ; texte SSE, appel read, retour de l’outil et réponse finale passent sur les deux versions. Le drapeau doit suivre `run` pour cette commande ; le placer avant le sous-programme produit une erreur de parsing. Le wrapper l’ajoute pour OpenCode 2 au bon niveau et conserve les paramètres natifs de permissions, sessions et MCP. Les transports `--server`, `--attach` et les sous-commandes serveur ne peuvent pas remplacer le routage contrôlé par le wrapper.

La première CI a aussi révélé deux problèmes du test 1.18.30 : un `PWD` hérité du dépôt faisait classer le fichier temporaire comme un répertoire externe, puis l’alias macOS `/var` contre `/private/var` produisait le même décalage. Le test utilise désormais le chemin canonique du workspace et des `PWD`/`INIT_CWD` cohérents. Aucune permission native n’a été assouplie pour faire passer le cycle read.

## Stockage macOS et limites restantes

Le [code Apple de security](https://github.com/apple-oss-distributions/Security/blob/main/SecurityTool/macOS/keychain_add.c) utilise deux appels getpass lorsque `-w` est fourni sans valeur. Sur macOS 26.6.2 avec stdin redirigé, la commande termine avec le code zéro, mais la valeur relue ne correspond pas au token fictif envoyé. Le test réel conserve uniquement le statut et ce booléen de comparaison, sans afficher la valeur.

Les nouvelles entrées utilisent les API natives file-based [SecKeychainFindGenericPassword](https://developer.apple.com/documentation/security/seckeychainfindgenericpassword(_:_:_:_:_:_:_:_:)), SecKeychainAddGenericPassword, SecKeychainItemModifyAttributesAndData et SecKeychainItemDelete via JXA, avec interaction interdite et buffers UTF-8. La CI a imposé des références natives nil explicites et la gestion des objets par le pont JXA ; les premières variantes SecItem ont été abandonnées après leurs erreurs de paramètres réelles.

Les anciennes entrées créées par `security` ont des ACL différentes : leur lecture et leur mise à jour conservent cet exécutable déjà autorisé. Les mises à jour utilisent `security -i` avec `-X` et une valeur hexadécimale sur stdin, sans secret dans argv et sans élargir les ACL. La limite de ligne de 4096 octets du [lecteur Apple](https://github.com/apple-oss-distributions/Security/blob/main/SecurityTool/macOS/security.c) est contrôlée avant toute écriture de compatibilité ; une valeur trop longue provoque une erreur explicite. Chaque opération système est bornée à 15 s, chaque écriture est relue et aucun fallback en clair n’existe.

Les comptes UUID `wrapper-scionos-test-*` sont distincts des identifiants RouterLab de l’utilisateur. Le test crée et supprime les nouvelles entrées et les entrées historiques dans `wrapper-scionos` et `claude-scionos`. Il réussit dans les six configurations macOS et le job indépendant. Cette preuve couvre le runner macOS arm64 cité, pas toutes les versions ou architectures macOS. Le Keychain doit être disponible et autorisé pour l’exécutable concerné.

Pour annoncer le fonctionnement applicatif Desktop/Cowork, il reste à lancer leurs applications réelles avec un profil temporaire dédié et un fournisseur fictif ; les tests de fichiers/proxy ne suffisent pas. Les cycles complets MCP, reprise de sessions et politiques natives restent limités aux assertions d’adaptateur indiquées dans la matrice. Ces limites doivent rester explicites dans le futur article.

## Affirmations utilisables dans le futur article

| Affirmation permise | Portée et preuve |
| --- | --- |
| Un lanceur propose cinq outils : Claude Code, Desktop, Cowork, Codex et OpenCode | Menu et adaptateurs ; Desktop/Cowork partagent une intégration |
| Le wrapper découvre le catalogue et intersecte les modèles avec une liste autorisée | Tests de découverte, erreurs et allowlists ; aucune preuve d’inférence de tous les modèles |
| Codex respecte le modèle explicite et demande un choix si le préféré manque | Régressions interactives/non interactives et catalogue limité à la famille |
| Un flux proxy actif peut dépasser 120 secondes sans plafond total par défaut | Régression HTTP déterministe avec 476 secondes virtuelles et remise à zéro par morceau |
| Les trois clients CLI ont été essayés avec des services fictifs sur Windows, macOS et Linux | Versions et fonctionnalités exactes de la matrice et exécution CI réussie |
| Le paquet 7.3.0 peut être construit et lancé | Entry modes, audit, inspection et lancement du paquet dans les 18 jobs généraux ; archive finale locale |
| Les tokens enregistrés passent par les protections natives au repos | DPAPI/Secret Service existants ; écriture, mise à jour, compatibilité et suppression Keychain vérifiées sur le runner macOS cité |
| Les paramètres natifs sont conservés par les adaptateurs | Assertions de transmission ; ne pas annoncer une certification de tous les MCP, outils, sessions ou politiques |

Les tarifs, pourcentages d’économie, gratuité, prix d’abonnement, conditions de résiliation, localisation des serveurs et traitement des données nécessitent des sources RouterLab indépendantes, datées et adaptées au service concerné. Les tests du wrapper ne prouvent aucune de ces affirmations. Les anciennes notes tarifaires du changelog restent historiques et ne constituent pas une preuve tarifaire actuelle.
