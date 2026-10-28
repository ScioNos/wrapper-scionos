# wrapper-scioNos

[![version npm](https://img.shields.io/npm/v/wrapper-scionos?logo=npm&label=npm)](https://www.npmjs.com/package/wrapper-scionos)
[![release GitHub](https://img.shields.io/github/v/release/ScioNos/wrapper-scionos?display_name=tag&sort=semver&label=release)](https://github.com/ScioNos/wrapper-scionos/releases)
[![Node.js](https://img.shields.io/badge/node-24.x-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Licence](https://img.shields.io/badge/licence-MIT-blue.svg)](./LICENSE)

Un lanceur unique pour six outils : Claude Code, Claude Desktop, Codex CLI, OpenCode CLI, Claude Cowork et Codex App, routés via le service RouterLab sélectionné.

## Pourquoi wrapper-scioNos ?

Conservez votre client de programmation préféré et choisissez une famille de modèles RouterLab pour votre travail. Le wrapper gère l’authentification du service et le routage ; chaque client natif conserve ses outils et ses sessions.

```bash
# Choisir la famille AWS Claude
npx wrapper-scionos claude-code --service routerlab --strategy aws
```

**Bêta : [`8.0.0-beta.1`](https://github.com/ScioNos/wrapper-scionos/releases/tag/v8.0.0-beta.1) — Console structurée.**

Dernière version stable : [Notes de release v7.3.0](https://github.com/ScioNos/wrapper-scionos/releases/tag/v7.3.0) · [npm 7.3.0](https://www.npmjs.com/package/wrapper-scionos/v/7.3.0). Le paquet bêta est téléchargeable dans les fichiers de la préversion GitHub.

[English](./README.md) · [Deutsch](./README.de.md) · [Journal des changements](./CHANGELOG.md)

## En bref

| Client | Intégration | Sélection des modèles |
| --- | --- | --- |
| Claude Code | Proxy loopback authentifié | Stratégie et sous-agent vérifié |
| Claude Desktop | Proxy de mapping local et profil géré | Routes Desktop |
| Claude Cowork | Via l’intégration Claude Desktop | Routes Desktop partagées |
| Codex CLI | Endpoint Responses direct | Famille RouterLab puis catalogue natif `/model` |
| OpenCode CLI | Proxy loopback OpenAI-compatible | Famille puis modèle exact |
| Codex App | Endpoint Responses direct, configuration temporaire restaurée | Famille et modèle du catalogue Codex vérifié |

Le service est sélectionné une seule fois, avant l’ouverture du menu, puis reste fixe pendant la session. Le wrapper valide le token, découvre le catalogue courant et bloque le lancement lorsqu’aucun modèle autorisé n’est disponible.

## Prérequis

- Node.js `24.x`.
- Un token pour le service RouterLab sélectionné.
- Claude Code `>=2.1.220` ; Claude Native RouterLab exige `>=2.1.293` et Claude via AWS `>=2.1.284`. Les vérifications de release utilisent `2.1.296`.
- Codex CLI `>=0.144.1` pour les lancements Codex.
- Codex App sous Windows ou macOS, avec moteur embarqué `>=0.164.0` ; Linux non pris en charge. Validation locale avec l’application `26.1021.3705.0` et le moteur `0.164.0-alpha.11.1`.
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

## Console structurée

La console comprend **Accueil**, **Lancement**, **Applications desktop**, **Connexion et accès** et **Diagnostic**. À partir de 100 colonnes, la navigation est latérale ; entre 60 et 99 colonnes, elle apparaît en haut. Les fenêtres de moins de 60 colonnes ou de 18 lignes, les terminaux `TERM=dumb` et les sorties redirigées utilisent le menu linéaire.

```powershell
npm start -- --lang fr
# Sous PowerShell, si npm.ps1 absorbe les arguments :
npm.cmd start -- --lang fr
# Lancement direct équivalent :
node index.js --lang fr
```

L’accueil affiche les outils détectés et distingue **token enregistré** et **accès vérifié**. La détection locale s’effectue en arrière-plan ; aucun contrôle réseau n’est répété pendant la navigation. L’accès et les modèles sont revérifiés avant chaque lancement. Un récapitulatif paginé présente la configuration complète avant confirmation du lancement.

| Saisie | Action |
| --- | --- |
| Clic gauche | Activer un outil, un onglet, un choix, une case ou un bouton |
| Molette / `[‹]` et `[›]` | Parcourir les listes et changer de page |
| `L` ou langue dans l’en-tête | Choisir français, anglais ou allemand |
| `Tab` | Passer de la navigation au contenu |
| `↑` / `↓` | Parcourir les choix disponibles, avec pagination |
| `Entrée` | Confirmer le choix sélectionné |
| `Espace` | Cocher une préférence ou une famille Desktop |
| `1`, `2`, `3`, `4`, `5`, `6` à l’accueil | Claude Code, Claude Desktop, Codex CLI, OpenCode CLI, Claude Cowork, Codex App |
| `Q` ou `0` | Quitter la console |
| `Échap` | Annuler un sélecteur ou revenir à l’accueil |
| `Ctrl+C` | Quitter la console (`130`) ; dans un client, interrompre la session puis revenir à l’accueil |

La souris est activée automatiquement dans les terminaux compatibles, y compris par SSH vers un VPS si le terminal local transmet les événements souris. Le clavier reste disponible à tout moment. Définissez `SCIONOS_MOUSE=0` pour désactiver la souris et retrouver la sélection de texte habituelle du terminal. Les terminaux `TERM=dumb` et `TERM=linux` n’activent pas la souris.

La console libère le terminal et désactive sa capture souris pendant l’exécution du client natif, puis revient à l’accueil après sa fermeture, son échec ou son interruption. Les commandes directes conservent leurs codes de sortie. Le menu linéaire conserve ses saisies numériques et textuelles habituelles.

La case **Retenir cette configuration**, activée par défaut, mémorise les choix après le démarrage effectif du client dans `~/.wrapper-scionos/ui-state.json`, séparément pour chaque service et client. Ce fichier ne contient ni token, ni journal, ni état de validation. Une sélection mémorisée indisponible demande un remplacement explicite. Décocher la case conserve la configuration mémorisée précédente.

L’écran Applications desktop distingue le profil partagé Claude Desktop / Cowork du proxy démarré par cette console. Le proxy reste actif pendant la navigation. Son arrêt conserve le profil ; restaurer le mode officiel retire ce profil après confirmation. Les profils regroupant plusieurs familles sont conservés. Quitter la console arrête ses propres proxies. Codex App dispose de ses propres actions et états.

### Codex App et protection du TOML

Enregistrez d’abord le token dans **Connexion et accès** ou avec `node index.js auth login --service routerlab`. Choisissez ensuite **6 — Codex App**, sa famille, son modèle et confirmez le récapitulatif. La console reste navigable pendant l’utilisation de l’application. Si elle était déjà ouverte, redémarrez-la vous-même pour charger la nouvelle connexion.

```bash
node index.js codex-app status --json
node index.js codex-app launch --service routerlab --strategy claude-gpt --model gpt-6.1-sol --dry-run --no-prompt --json
node index.js codex-app launch --service routerlab --strategy claude-gpt --model gpt-6.1-sol --yes --no-prompt
# La commande reste active. Ctrl+C déclenche la restauration.
node index.js codex-app restore --dry-run --json
node index.js codex-app restore --yes
```

`codex-app` sans action affiche l’état. `launch --dry-run` ne crée aucun fichier et n’ouvre pas l’application ; le contrôle d’accès et la découverte des modèles nécessitent une connexion. En commande directe, `--yes` est obligatoire sans dialogue. `restore` sans `--yes` affiche seulement un aperçu. `launch --json` exige `--dry-run` ; les autres commandes gardent leur enveloppe JSON habituelle.

Seuls `model`, `model_provider`, `model_catalog_json` et le fournisseur réservé `scionos_routerlab` ou `scionos_llm` sont modifiés. Les commentaires, l’ordre, les serveurs MCP, le BOM UTF-8, les fins de ligne et les autres réglages restent préservés. Un fournisseur réservé préexistant non possédé est refusé. La première activation crée une sauvegarde datée et un journal privé dans `~/.wrapper-scionos/codex-app/`, avec verrou et écritures atomiques contrôlant les modifications concurrentes. Un TOML invalide est refusé.

À la sortie interactive, choisissez de demander la fermeture normale de l’application puis restaurer, de restaurer en la laissant ouverte, ou d’annuler la sortie. Aucune fermeture forcée n’est utilisée. `SIGTERM` et les sorties sans dialogue restaurent sans fermer l’application. Une application restée ouverte peut conserver la connexion chargée jusqu’à son prochain redémarrage.

La restauration concerne tout l’ensemble géré : si vous en modifiez une partie pendant la session, le fichier actuel est conservé et le conflit est signalé. Les modifications personnelles sans rapport sont gardées. Après un arrêt brutal, consultez l’état puis lancez explicitement `codex-app restore --dry-run` et `codex-app restore --yes`, ou utilisez Applications desktop. La sauvegarde complète ne remplace jamais aveuglément votre fichier.

Le token reste dans le stockage sécurisé existant. Un assistant autonome installé dans le répertoire ScioNos le lit depuis le processus de l’application, sans dépendre des variables RouterLab du terminal. Le TOML, le catalogue, le journal et les préférences ne contiennent aucun token. L’assistant et le catalogue restent disponibles si une application ouverte peut encore les utiliser. Les préférences de Codex App restent séparées de Codex CLI, par service. La connexion utilise Responses directement ; la méthode d’authentification est documentée pour l’application Windows par [OpenAI](https://learn.chatgpt.com/docs/enterprise/connect-to-a-gateway#configure-the-windows-app). Le contrôle natif local utilise un `CODEX_HOME` temporaire ; une activation sur votre véritable configuration se fait explicitement depuis la console ou avec `launch --yes`.

### Langue de l’interface

La langue active apparaît dans l’en-tête. Appuyez sur **L**, ou choisissez **Language / Langue / Sprache** à l’accueil, pour passer entre **English**, **Français** et **Deutsch** pendant la session. Le changement ne modifie pas le service ni les modèles sélectionnés. Le sélecteur de famille conserve les libellés du catalogue, dont **💸 Claude via AWS**.

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

Sans famille sélectionnée, le défaut RouterLab est **`gpt-6.1-sol`**. Le service `llm` conserve **`gpt-5.6-sol`** la console prépare désormais sa famille et son modèle ; le menu linéaire conserve son lancement direct. Les modèles explicites et ces défauts de service doivent être découverts et autorisés. Utilisez `--strategy claude-gpt|open-source|trial` pour choisir une famille RouterLab en ligne de commande, ou `--model` pour un modèle exact.

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

Ces résultats historiques concernent la 7.3.0. Voir le [bilan de développement 8.0.0](./docs/release-8.0.0-validation.md) pour les vérifications de cette branche.

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
npx --yes --package ./wrapper-scionos-8.0.0-beta.1.tgz wrapper-scionos
```

## Licence

MIT © ScioNos
