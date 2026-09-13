# wrapper-scionos

[![version npm](https://img.shields.io/npm/v/wrapper-scionos?logo=npm&label=npm)](https://www.npmjs.com/package/wrapper-scionos)
[![release GitHub](https://img.shields.io/github/v/release/ScioNos/wrapper-scionos?display_name=tag&sort=semver&label=release)](https://github.com/ScioNos/wrapper-scionos/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Licence](https://img.shields.io/badge/licence-MIT-blue.svg)](./LICENSE)

Un lanceur unique pour Claude Code, Claude Desktop, Codex CLI et OpenCode, routés via le service RouterLab sélectionné.

**Version actuelle : `7.0.0`**

[English](./README.md) · [Deutsch](./README.de.md) · [Journal des changements](./CHANGELOG.md)

## En bref

| Client | Intégration | Sélection des modèles |
| --- | --- | --- |
| Claude Code | Proxy loopback authentifié | Stratégie et sous-agent vérifié |
| Claude Desktop | Proxy de mapping local et profil géré | Routes Desktop |
| Codex CLI | Endpoint Responses direct | Catalogue natif `/model` |
| OpenCode CLI | Proxy loopback OpenAI-compatible | Famille puis modèle exact |

Le service est sélectionné une seule fois, avant l’ouverture du menu, puis reste fixe pendant la session. Le wrapper valide le token, découvre le catalogue courant et bloque le lancement lorsqu’aucun modèle autorisé n’est disponible.

## Prérequis

- Node.js `^22.13.0` ou `>=23.5.0`.
- Un token pour le service RouterLab sélectionné.
- Claude Code `>=2.1.220` pour les lancements Claude Code.
- Codex CLI `>=0.144.1` pour les lancements Codex.
- OpenCode `>=1.18.30` pour les lancements OpenCode.
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

Le paquet installé expose `wrapper-scionos` et `scionos` comme commandes équivalentes.

Pour `--service llm`, le wrapper affiche ce message neutre, car le catalogue du service gratuit peut varier :

```text
ℹ Service LLM actif — les modèles disponibles peuvent varier
```

Ce message n’apparaît pas pour `routerlab`.

## Menu interactif

Le menu d’accueil est identique sur toutes les plateformes :

```text
1. Claude Code
2. Claude Desktop
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

Les arguments placés après `--` sont transmis au client natif. Le wrapper arrête son analyse à cette frontière. Une commande ou option invalide renvoie `2`, une erreur d’exécution `1` et une invite interrompue `130`.

## Services et authentification

| Service | Endpoint de production | Variables de token recommandées |
| --- | --- | --- |
| `routerlab` | `https://api.routerlab.ch` | `ROUTERLAB_API_KEY`, `WRAPPER_SCIONOS_ROUTERLAB_TOKEN` |
| `llm` | `https://llm-api.routerlab.ch` | `ROUTERLAB_LLM_API_KEY`, `WRAPPER_SCIONOS_LLM_TOKEN` |

`ANTHROPIC_AUTH_TOKEN` reste accepté comme fallback déprécié. Les tokens sont lus dans le stockage sécurisé propre au service ou via une invite masquée. Le wrapper n’affiche jamais de token dans les menus ou diagnostics.

Les destinations de production sont fixes. Les valeurs utilisateur de `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, `WRAPPER_SCIONOS_*_BASE_URL` et `ANTHROPIC_BASE_URL` sont ignorées avec un avertissement et ne peuvent pas rediriger le trafic.

## Routage des modèles

Le wrapper utilise l’intersection entre la liste autorisée du service et la réponse vérifiée de `GET /v1/models`. Les modèles non découverts ou non autorisés sont masqués ou refusés. Aucun fallback silencieux n’est appliqué ; une intersection vide bloque le lancement.

### Stratégies Claude Code — `llm`

| Stratégie | Fable | Haiku | Sonnet | Opus |
| --- | --- | --- | --- | --- |
| `claude` | `claude-fable-5` | `claude-haiku-4-5` | `claude-sonnet-5` | `claude-opus-5` |
| `claude-gpt` | `gpt-6-astra` | `gpt-5.6-luna` | `gpt-5.6-terra` | `gpt-5.6-sol` |
| `divers` | `deepseek-v4.1-flash` | `gemini-3.8-flash` | `glm-5.3` | `glm-5.3-flash` |

Le sélecteur de sous-agent `llm` prend aussi en charge `claude-haiku-4-5`, `aws-claude-haiku-4-5`, `gpt-5.6-luna`, `deepseek-v4.1-flash` et `glm-5.3-flash` lorsque ces modèles sont découverts et autorisés.

Pour `routerlab`, les familles principales sont Claude, AWS Claude, OpenAI GPT et Open Source. Claude Native utilise `claude-fable-5.1`. Le mapping GPT est Fable `gpt-6-astra`, Haiku `gpt-5.6-luna`, Sonnet `gpt-5.6-terra` et Opus `gpt-5.6-sol`.

### Codex CLI

Codex est lancé directement sur l’endpoint Responses RouterLab du service choisi :

```bash
wrapper-scionos codex launch --service routerlab
wrapper-scionos codex launch --service llm
```

Le modèle par défaut est **`gpt-5.6-sol`**. Il doit être à la fois découvert et autorisé ; le wrapper ne le remplace jamais silencieusement. Depuis le menu d’accueil, Codex est lancé directement et son sélecteur natif `/model` affiche le catalogue temporaire vérifié.

| Service | Liste autorisée |
| --- | --- |
| `routerlab` | `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-v4.1-flash`, `kimi-k3`, `qwen3.8-max`, `glm-5.3`, `glm-5.3-flash` |
| `llm` | `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gemini-3.8-flash`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash` |

Le catalogue est temporaire, ne contient aucun credential et est supprimé à la fin du processus enfant. Les options obsolètes `--direct`, `--proxy` et `--transport` ne sont plus prises en charge : l’accès direct est désormais le seul transport Codex.

### OpenCode CLI

```bash
wrapper-scionos opencode --service llm
wrapper-scionos opencode --service llm --strategy divers --model glm-5.3
wrapper-scionos opencode --service llm --model gpt-6-astra -- run "Résume ce dépôt"
```

En mode interactif, le wrapper demande une famille puis un modèle exact. Sans invite, le modèle par défaut est `gpt-5.6-sol`, s’il est découvert et autorisé. Le proxy loopback est authentifié et `OPENCODE_CONFIG_CONTENT` n’est injecté que dans le processus enfant ; aucun fichier `opencode.json` ni token RouterLab n’est écrit.

Pour mettre à jour une installation npm d’OpenCode :

```bash
opencode upgrade --method npm
```

## Garanties de sécurité

- Claude Code et OpenCode utilisent des proxies loopback authentifiés avec des credentials propres au processus.
- Claude Desktop ne conserve dans son profil qu’un credential local aléatoire ; le token RouterLab reste dans le stockage sécurisé.
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
npm audit
npm pack --dry-run
```

Les smoke tests des clients réels utilisent uniquement des faux services loopback et ne contactent jamais RouterLab. Les seuils de couverture sont de 85 % pour les lignes/fonctions et 80 % pour les branches.

Pour tester un paquet local non publié :

```bash
npm pack
npx --yes --package ./wrapper-scionos-7.0.0.tgz wrapper-scionos
```

## Licence

MIT © ScioNos
