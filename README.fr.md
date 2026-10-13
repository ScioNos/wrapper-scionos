# wrapper-scioNos

[![version npm](https://img.shields.io/npm/v/wrapper-scionos?logo=npm&label=npm)](https://www.npmjs.com/package/wrapper-scionos)
[![release GitHub](https://img.shields.io/github/v/release/ScioNos/wrapper-scionos?display_name=tag&sort=semver&label=release)](https://github.com/ScioNos/wrapper-scionos/releases)
[![Node.js](https://img.shields.io/badge/node-%5E22.13.0%20%7C%7C%20%3E%3D23.5.0-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Licence](https://img.shields.io/badge/licence-MIT-blue.svg)](./LICENSE)

Un lanceur unique pour cinq outils : Claude Code CLI, Claude Cowork, Claude Desktop, Codex CLI et OpenCode CLI, routés via le service RouterLab sélectionné.

## Pourquoi wrapper-scioNos ?

Conservez votre client de programmation préféré et choisissez une famille de modèles RouterLab pour votre travail. Le wrapper gère l’authentification du service et le routage ; chaque client natif conserve ses outils et ses sessions.

```bash
# Choisir la famille AWS Claude
npx wrapper-scionos claude-code --service routerlab --strategy aws
```

**Version actuelle : `7.3.0`**

[Notes de release v7.3.0](https://github.com/ScioNos/wrapper-scionos/releases/tag/v7.3.0) · [npm 7.3.0](https://www.npmjs.com/package/wrapper-scionos/v/7.3.0)

[English](./README.md) · [Deutsch](./README.de.md) · [Journal des changements](./CHANGELOG.md)

## En bref

| Client | Intégration | Sélection des modèles |
| --- | --- | --- |
| Claude Code | Proxy loopback authentifié | Stratégie et sous-agent vérifié |
| Claude Desktop | Proxy de mapping local et profil géré | Routes Desktop |
| Claude Cowork | Via l’intégration Claude Desktop | Routes Desktop partagées |
| Codex CLI | Endpoint Responses direct | Famille RouterLab puis catalogue natif `/model` |
| OpenCode CLI | Proxy loopback OpenAI-compatible | Famille puis modèle exact |

Le service est sélectionné une seule fois, avant l’ouverture du menu, puis reste fixe pendant la session. Le wrapper valide le token, découvre le catalogue courant et bloque le lancement lorsqu’aucun modèle autorisé n’est disponible.

## Prérequis

- Node.js `^22.13.0` ou `>=23.5.0`.
- Un token pour le service RouterLab sélectionné.
- Claude Code `>=2.1.220` ; Claude Native RouterLab exige `>=2.1.293` et Claude via AWS `>=2.1.284`. Les vérifications de release utilisent `2.1.296`.
- Codex CLI `>=0.144.1` pour les lancements Codex.
- OpenCode `>=1.18.30` ; les tests Windows valident `opencode-ai@1.18.30` et `@opencode/cli@2.0.27`.
- Windows, macOS ou `claude-desktop-debian` sous Linux pour les profils Claude Desktop.

## Démarrage rapide

Sans installation globale :

```bash
npx wrapper-scionos
npx wrapper-scionos --service llm
```

Ou avec une installation globale :

```bash
npm install -g wrapper-scionos
wrapper-scionos --service routerlab
```

Le nom du produit est **wrapper-scioNos**. Son paquet npm et sa commande principale sont `wrapper-scionos` ; le paquet installé expose aussi `scionos` comme commande équivalente.

Pour `--service llm`, le wrapper affiche ce message neutre, car le catalogue du service peut varier :

```text
ℹ Service LLM actif — les modèles disponibles peuvent varier
```

Ce message n’apparaît pas pour `routerlab`.

## Menu interactif

Le menu d’accueil est identique sur toutes les plateformes :

```text
1. Claude Code
2. Claude Desktop / Cowork
3. Codex CLI
4. OpenCode CLI
5. Account & access
6. Tools & diagnostics
0. Exit
```

| Saisie | Action |
| --- | --- |
| `↑` / `↓` | Parcourir les choix avec boucle |
| `Entrée` | Confirmer le choix sélectionné |
| Un chiffre | Utiliser le raccourci affiché |
| Libellé, valeur ou identifiant | Sélectionner un choix correspondant |
| `0`, `b`, `back` | Revenir en arrière ; `0` quitte depuis l’accueil |
| `q`, `quit`, `exit` | Quitter le wrapper depuis n’importe quel menu |
| `Échap` | Revenir en arrière ou quitter depuis l’accueil |
| `Ctrl+C` | Interrompre avec le code `130` |

L’aide clavier complète apparaît à l’accueil ; les sous-menus utilisent une version courte. Dès qu’un client natif démarre, ses entrées clavier et sa sortie restent entièrement gérées par ce client.

### Langue de l’interface

L’interface du wrapper est en anglais par défaut. Les langues disponibles sont :

```bash
wrapper-scionos --lang en
wrapper-scionos --lang fr
wrapper-scionos --lang de
```

`--language` est un alias de `--lang`. La langue peut aussi être définie avec `SCIONOS_LANG` ou `SCIONOS_LANGUAGE`. Ce réglage traduit les menus et invites du wrapper, pas la sortie des clients natifs.

## Commandes principales

```bash
# Clients
wrapper-scionos claude-code --service routerlab --strategy aws
wrapper-scionos claude-code --service llm --strategy divers
wrapper-scionos claude-desktop apply-proxy --service llm --yes
wrapper-scionos claude-desktop proxy --service llm
wrapper-scionos codex launch --service llm
wrapper-scionos opencode --service llm --model gpt-6-astra -- run "Résume ce dépôt"

# Authentification et diagnostic
wrapper-scionos auth login --service routerlab
wrapper-scionos auth status --service llm
wrapper-scionos auth logout --service routerlab
wrapper-scionos doctor --service llm
wrapper-scionos strategies --service routerlab
```

Exécutez `wrapper-scionos --help` pour la référence complète des commandes et options. Les options globales fonctionnent avant ou après la commande :

```bash
wrapper-scionos --service llm doctor
wrapper-scionos doctor --service llm
```

Les arguments placés après `--` sont transmis au client natif pour les commandes de lancement (`claude-code`, `codex launch` et `opencode`). Les autres commandes refusent ces arguments. Le wrapper arrête son analyse à cette frontière uniquement pour les commandes qui l’acceptent. Une commande ou option invalide renvoie `2`, une erreur d’exécution `1` et une invite interrompue `130`.

## Services et authentification

| Service | Endpoint de production | Variables de token recommandées |
| --- | --- | --- |
| `routerlab` | `https://api.routerlab.ch` | `ROUTERLAB_API_KEY`, `WRAPPER_SCIONOS_ROUTERLAB_TOKEN` |
| `llm` | `https://llm-api.routerlab.ch` | `ROUTERLAB_LLM_API_KEY`, `WRAPPER_SCIONOS_LLM_TOKEN` |

`ANTHROPIC_AUTH_TOKEN` reste accepté comme fallback déprécié. Les tokens sont lus dans le stockage sécurisé propre au service ou via une invite masquée. Le wrapper n’affiche jamais de token dans les menus ou diagnostics.

Les destinations de production sont fixes. Les valeurs utilisateur de `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, `WRAPPER_SCIONOS_*_BASE_URL` et `ANTHROPIC_BASE_URL` sont ignorées avec un avertissement et ne peuvent pas rediriger le trafic.

Sous Linux, le stockage sécurisé persistant exige `secret-tool` et un service Secret Service disponible. L’ancien espace de stockage `claude-scionos` est lu pendant la migration ; la déconnexion supprime les entrées des deux espaces.

Pour les commandes qui acceptent un token explicite, privilégiez `--token-stdin` pour le lire depuis un pipe. Cette option ne peut pas être combinée avec `--token`, qui affiche désormais un avertissement car les arguments et l’historique du shell peuvent exposer le secret. Claude Code utilise plutôt `auth login` avec saisie masquée, les variables d’environnement ou le stockage sécurisé.

## Routage des modèles

Le wrapper utilise l’intersection entre la liste autorisée du service et la réponse vérifiée de `GET /v1/models`. Les modèles non découverts ou non autorisés sont masqués ou refusés. Aucun fallback silencieux n’est appliqué ; une intersection vide bloque le lancement.

### Stratégies Claude Code — `llm`

| Stratégie | Fable | Haiku | Sonnet | Opus |
| --- | --- | --- | --- | --- |
| `claude` | `claude-fable-5` | `claude-haiku-4-5` | `claude-sonnet-5` | `claude-opus-5` |
| `claude-gpt` | `gpt-6-astra` | `gpt-5.6-luna` | `gpt-5.6-terra` | `gpt-5.6-sol` |
| `divers` | `deepseek-v4.1-flash` | `gemini-3.8-flash` | `glm-5.3` | `glm-5.3-flash` |

Le sélecteur de sous-agent `llm` prend aussi en charge `claude-haiku-4-5`, `aws-claude-haiku-4-5`, `gpt-5.6-luna`, `deepseek-v4.1-flash` et `glm-5.3-flash` lorsque ces modèles sont découverts et autorisés.

Pour `routerlab`, les familles principales sont Claude, AWS Claude, OpenAI GPT, Open Source et Trial. Claude Native utilise `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5` et `claude-haiku-5-5`, avec Haiku 5.5 comme sous-agent par défaut. Cette stratégie exige Claude Code `>=2.1.293`; la CI vérifie la version `2.1.296`. OpenAI GPT utilise `gpt-6-astra` pour Fable, `gpt-6.1-sol` pour Opus et Sonnet, et `gpt-6-luna` pour Haiku et le sous-agent par défaut. Open Source comprend `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`, `hy4-preview`, `kimi-k3`, `minimax-m3` et `qwen3.8-max`. Trial comprend `deepseek-v4.1-flash-trial`, `glm-5.3-flash-trial`, `qwen3.8-flash-trial`, `gpt-6-luna-trial` et `MiniMax-M3-trial`; son sous-agent Claude Code est fixé à `deepseek-v4.1-flash-trial`.

Claude via AWS utilise `aws-claude-opus-5-5`, `aws-claude-sonnet-5-5` et `aws-claude-haiku-4-5`. Son sous-agent par défaut reste AWS Haiku 4.5. Cette stratégie exige Claude Code `>=2.1.284`.

### Codex CLI

Codex est lancé directement sur l’endpoint Responses RouterLab du service choisi :

```bash
wrapper-scionos codex launch --service routerlab
wrapper-scionos codex launch --service llm
```

Sur `routerlab`, le lancement interactif demande d’abord **OpenAI GPT-6**, **Open Source** ou **Trial**, puis ouvre Codex avec le catalogue temporaire vérifié de cette famille. Le sélecteur natif `/model` permet de changer de modèle dans la famille choisie. Les modèles préférés sont respectivement `gpt-6.1-sol`, `deepseek-v4.1-flash` et `deepseek-v4.1-flash-trial` ; si le modèle préféré manque, le mode interactif exige un choix explicite parmi les modèles disponibles, même s’il n’en reste qu’un. Le mode non interactif échoue et demande `--model <id>`. Un modèle explicite indisponible provoque toujours une erreur.

Sans famille sélectionnée, le défaut RouterLab est **`gpt-6.1-sol`**. Le service `llm` conserve **`gpt-5.6-sol`** et son entrée du menu d’accueil ouvre directement Codex. Les modèles explicites et ces défauts de service doivent être découverts et autorisés. Utilisez `--strategy claude-gpt|open-source|trial` pour choisir une famille RouterLab en ligne de commande, ou `--model` pour un modèle exact.

| Service | Liste autorisée |
| --- | --- |
| `routerlab` | `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`, `hy4-preview`, `kimi-k3`, `minimax-m3`, `qwen3.8-max`, `deepseek-v4.1-flash-trial`, `glm-5.3-flash-trial`, `qwen3.8-flash-trial`, `gpt-6-luna-trial`, `MiniMax-M3-trial` |
| `llm` | `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gemini-3.8-flash`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash` |

Le catalogue est temporaire, ne contient aucun credential et est supprimé à la fin du processus enfant. Les options obsolètes `--direct`, `--proxy` et `--transport` ne sont plus prises en charge : l’accès direct est désormais le seul transport Codex.

### OpenCode CLI

```bash
wrapper-scionos opencode --service llm
wrapper-scionos opencode --service llm --strategy divers --model glm-5.3
wrapper-scionos opencode --service llm --model gpt-6-astra -- run "Résume ce dépôt"
wrapper-scionos opencode --service routerlab --strategy trial --model deepseek-v4.1-flash-trial
```

En mode interactif, le wrapper demande une famille puis un modèle exact. OpenCode RouterLab partage les familles Claude Native, AWS Claude, OpenAI GPT, Open Source et Trial; son modèle par défaut est `gpt-6.1-sol`; le service `llm` conserve `gpt-5.6-sol`. Trial utilise `deepseek-v4.1-flash-trial` pour le sous-agent fixe de Claude Code; OpenCode le propose comme un modèle ordinaire. Le proxy loopback est authentifié et `OPENCODE_CONFIG_CONTENT` n’est injecté que dans le processus enfant ; aucun fichier `opencode.json` ni token RouterLab n’est écrit.

Pour mettre à jour une installation npm d’OpenCode :

```bash
opencode upgrade --method npm # 1.x
# 2.x: opencode upgrade --help
```

## Délais des réponses proxy

Claude Code, OpenCode, Desktop et Cowork partagent ces variables d’environnement, lues au démarrage du proxy. Les valeurs sont des entiers en millisecondes ; une valeur invalide bloque le démarrage.

| Variable | Défaut | Signification |
| --- | --- | --- |
| `WRAPPER_SCIONOS_PROXY_FIRST_RESPONSE_TIMEOUT_MS` | `120000` | De l’envoi amont aux premiers octets du corps ; les en-têtes seuls ne réinitialisent pas le délai |
| `WRAPPER_SCIONOS_PROXY_STREAM_IDLE_TIMEOUT_MS` | `120000` | Intervalle maximal entre morceaux du corps ; réinitialisé à chaque morceau |
| `WRAPPER_SCIONOS_PROXY_STREAM_TOTAL_TIMEOUT_MS` | `0` | Durée totale après le premier morceau ; zéro désactive le plafond |

Les délais de première réponse et d’inactivité doivent être positifs. Par défaut, un flux actif peut dépasser 120 secondes. La déconnexion du client annule la requête amont. Avant l’envoi d’une réponse, l’expiration renvoie HTTP 504 ; pendant une réponse, elle ferme le flux. Les timers et flux amont sont nettoyés à chaque sortie.

Les en-têtes de la requête cliente restent limités à 30 secondes et la réception du corps complet à 120 secondes, avec un maximum de 64 Mio sous forme compressée et décompressée. Ces limites entrantes fixes sont distinctes des délais de réponse amont. Codex utilise son transport natif direct et ne reçoit pas ces paramètres proxy.

## Profils persistants et secrets

Desktop et Cowork partagent un profil Desktop géré et son proxy. Son application écrit durablement l’URL du gateway, le credential local aléatoire, les routes de modèles et l’hôte de sortie Cowork dans le profil Claude-3p et son `_meta.json`. L’arrêt du proxy laisse ce profil appliqué. Redémarrez le proxy pour le réutiliser, ou exécutez `wrapper-scionos claude-desktop restore --yes` pour restaurer le profil officiel. Status et dry-run permettent d’examiner l’état. Les tests de profil/proxy ne valident pas une exécution dans l’application Desktop ou Cowork.

Au repos, les tokens enregistrés utilisent Windows DPAPI, macOS Keychain ou Linux Secret Service. Linux exige `secret-tool` ; aucun fallback en clair n’est utilisé. Sous macOS, les nouvelles entrées utilisent les API Security via `osascript`, avec le secret sur stdin et l’interaction désactivée. Les entrées existantes autorisant `security` conservent leurs règles d’accès et utilisent cet exécutable pour la lecture et les mises à jour ; une mise à jour transmet la valeur encodée en hexadécimal dans une seule commande sur stdin. Chaque opération système est limitée à 15 secondes et chaque écriture est vérifiée par relecture. Les essais macOS réels passent pour les nouvelles entrées, les mises à jour UTF-8, les deux anciens espaces et la suppression ; voir le bilan de validation.

Pendant son exécution, le wrapper détient le token du service en mémoire. Claude Code et OpenCode reçoivent uniquement un credential proxy local dans leur environnement enfant ; Desktop conserve ce credential local dans son profil. Codex reçoit le token du service via `OPENAI_API_KEY` dans son environnement enfant. Un environnement reste accessible à son processus et aux processus suffisamment privilégiés ; le stockage sécurisé protège les tokens au repos. Privilégiez la saisie masquée ou `--token-stdin` au token en argument.

## Compatibilité vérifiée

Sous Windows avec Node 24.19.0, Claude Code 2.1.296 passe 13 scénarios de routage ; Codex 0.144.1 et 0.157.0 passent le streaming Responses et model/list natif ; OpenCode 1.18.30 et 2.0.27 passent le modèle exact, les chemins HTTP, l’authentification, le streaming et un cycle natif de l’outil read contre des fournisseurs simulés. OpenCode 2 utilise son mode natif `--standalone` pour transmettre la configuration proxy temporaire à son serveur privé. Son service partagé persistant est incompatible avec cette intégration par lancement.

[Les 37 jobs GitHub CI ont réussi](https://github.com/ScioNos/wrapper-scionos/actions/runs/38377724549), avec ces versions de Claude/OpenCode et Codex 0.144.1 sur Windows, macOS et Linux, ainsi que Keychain réel sur macOS. Le bilan précise les configurations Node et les versions des runners.

Un modèle découvert et autorisé peut être sélectionné ; cela ne prouve pas son inférence réelle ni ses outils chez RouterLab. L’inférence RouterLab de production et les applications réelles Desktop/Cowork restent non testées. Les tarifs, économies, lieux d’hébergement et conditions d’abonnement exigent des preuves RouterLab séparées. Le [bilan 7.3.0](./docs/release-7.3.0-validation.md) précise la portée et les essais applicatifs restants.

## Garanties de sécurité

- Claude Code et OpenCode utilisent des proxies loopback authentifiés avec des credentials propres au processus.
- Claude Desktop ne conserve dans son profil qu’un credential local aléatoire ; le token du service reste dans le wrapper et sa source de token choisie.
- Codex reçoit le token du service via sa variable native `OPENAI_API_KEY` et utilise un catalogue temporaire vérifié.
- La découverte s’effectue avant la création d’un proxy ou le lancement d’un client et bloque sur toute erreur d’authentification, réseau, réponse, serveur, catalogue vide ou intersection vide.
- Les overrides de fournisseur et de base URL ne peuvent pas modifier la destination RouterLab de production.
- Les outils, MCP, sessions, mises à jour et autres fonctions natives restent gérés par le client choisi, sauf restriction explicite de celui-ci.

Les détails d’architecture sont disponibles dans [docs/architecture-notes.md](./docs/architecture-notes.md). L’historique de migration Codex est décrit dans [docs/migration-5.0-codex.md](./docs/migration-5.0-codex.md).

## Développement et vérifications de release

```bash
npm test
npm run test:coverage
npm run test:entry-modes
npm run test:claude-real
npm run test:codex-real
npm run test:opencode-real
npm run test:keychain-real # macOS
npm audit
npm pack --dry-run
```

`npm run release:check` enchaîne les tests unitaires, la couverture, les modes de lancement, les trois clients réels, Keychain, l’audit et le paquet. Keychain est ignoré hors macOS ; cette omission ne valide pas le prérequis macOS de la release.

Les smoke tests des clients réels utilisent uniquement des faux services loopback et ne contactent jamais RouterLab. Les seuils de couverture sont de 85 % pour les lignes/fonctions et 80 % pour les branches.

Pour tester un paquet local non publié :

```bash
npm pack
npx --yes --package ./wrapper-scionos-7.3.0.tgz wrapper-scionos
```

## Licence

MIT © ScioNos
