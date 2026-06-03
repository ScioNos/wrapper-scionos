# wrapper-scionos

Wrapper CLI ScioNos extensible pour les assistants de développement connectés à RouterLab.

Version actuelle : `1.1.0`.

Cette version cible Claude Code, Claude Desktop et Codex CLI, sans mélanger toutes les intégrations
dans un seul gros module.

## Prérequis

- Node.js 22 ou plus récent
- Claude Code installé si tu veux lancer Claude Code via le wrapper
- Un token RouterLab
- Windows ou macOS pour la configuration Claude Desktop 3P

## Démarrage

Depuis le dossier du projet :

```powershell
cd D:\Serveurs\Projet_ScioNos\Wrapper-ScioNos
npm install
node index.js
```

`node index.js` ouvre un menu interactif avec notamment :

- Claude Code
- Claude Desktop
- Codex CLI
- Auth
- Doctor

## Commandes utiles

```powershell
node index.js --help
node index.js --service llm
node index.js doctor
node index.js strategies --service routerlab
node index.js auth login
node index.js auth status
node index.js auth test
node index.js claude-desktop proxy --service routerlab
node index.js claude-desktop proxy --service llm
```

## Services RouterLab

- `routerlab` : `https://api.routerlab.ch`
- `llm` : `https://llm-api.routerlab.ch`

Les tokens sont stockés séparément par service.

Le wrapper lit aussi les tokens existants de `claude-scionos` comme compatibilité de migration,
mais les nouveaux tokens sont stockés sous `wrapper-scionos`.

## Claude Code

Lancement direct via RouterLab :

```powershell
node index.js claude-code --service routerlab --strategy aws
```

Avec des arguments Claude Code :

```powershell
node index.js claude-code --strategy aws -- -p "Résume ce projet"
```

Les stratégies spécifiques à RouterLab LLM incluent :

```powershell
node index.js claude-code --service llm --strategy claude-MiniMax-M3
node index.js claude-code --service llm --strategy claude-qwen3.7-max
```

`claude-MiniMax-M3` s’affiche comme `MiniMax-M3 beta` dans le menu guidé. La stratégie
`claude-qwen3.7-max` utilise `claude-qwen3.7-max` pour Opus, Sonnet et Haiku, avec
`claude-qwen3.6-flash` pour les sous-agents.

Le wrapper configure toujours :

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`

Les mappings de stratégie peuvent aussi configurer :

- `ANTHROPIC_DEFAULT_OPUS_MODEL`
- `ANTHROPIC_DEFAULT_SONNET_MODEL`
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- `CLAUDE_CODE_SUBAGENT_MODEL`

## Claude Desktop

Retour au mode officiel :

```powershell
node index.js claude-desktop restore-official --yes
```

Configuration directe :

```powershell
node index.js claude-desktop apply --service routerlab --yes
```

Pour les stratégies que Claude Desktop masque dans le menu, utilise le mode proxy local :

```powershell
node index.js claude-desktop apply-proxy --service routerlab --strategy claude-gpt --yes
node index.js claude-desktop proxy --service routerlab
```

Le terminal du proxy doit rester ouvert pendant l’utilisation de Claude Desktop.

Le proxy local expose des ids compatibles Claude Desktop, puis redirige vers les vrais modèles
RouterLab. Le catalogue Desktop RouterLab par défaut est ordonné ainsi :

```text
claude-opus-4-8
claude-sonnet-4-6
claude-haiku-4-5
aws-claude-opus-4-8
aws-claude-sonnet-4-6
aws-claude-haiku-4-5
gpt-5.5
gpt-5.4
gpt-5.4-mini
Kimi K2.6
glm-5.1
```

Avec `--service llm`, le mapping Claude Desktop expose Claude, OpenAI GPT, OpenAI GPT special
price et GLM. Les routes GPT special s’affichent comme `gpt-5.5-sp` et `gpt-5.4-mini-sp`.

Le support 1M est appliqué par modèle :

- Haiku, Kimi, GLM, GPT mini et GPT special mini : pas de variante 1M
- GPT 5.4 et GPT 5.5 : variante 1M

## Codex CLI

Le wrapper inclut un générateur de template de configuration Codex CLI :

```powershell
node index.js codex template --service routerlab
```

Elle peut aussi écrire `~/.codex/config.toml` :

```powershell
node index.js codex apply --service routerlab --dry-run
node index.js codex apply --service routerlab --model gpt-5.3-codex --yes
node index.js codex apply --service routerlab --yes
```

Les modèles Codex CLI RouterLab sont proposés dans cet ordre :

```text
gpt-5.5
gpt-5.4
gpt-5.3-codex
gpt-5.4-mini
minimax-m2.7
glm-5.1
```

`codex apply` est en dry-run par défaut. Avec `--yes`, la commande écrit `config.toml`
atomiquement et ne modifie pas `auth.json`, afin de préserver l’état de connexion Codex existant.
Quand Codex dispose d’un `models_cache.json` local, le wrapper écrit aussi
`wrapper-scionos-model-catalog.json` et pointe `model_catalog_json` dessus pour que Codex CLI voie
le catalogue RouterLab après redémarrage.

## Développement

```powershell
npm test
node index.js doctor
```
