# wrapper-scionos

Wrapper CLI ScioNos extensible pour les assistants de développement connectés à RouterLab.

Version actuelle : `3.0.0`.

Cette version cible Claude Code, Claude Desktop et Codex CLI, sans mélanger toutes les intégrations
dans un seul gros module.

## Prérequis

- Node.js 22 ou plus récent
- Claude Code installé si tu veux lancer Claude Code via le wrapper
- Un token RouterLab
- Windows, macOS ou le port Linux `claude-desktop-debian` pour la configuration Claude Desktop 3P

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

Lancement via le proxy local résilient du wrapper vers RouterLab :

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

`claude-MiniMax-M3` s’affiche comme `MiniMax-M3 beta` dans le menu guidé.
`claude-qwen3.7-max` s’affiche comme `qwen3.7-max`. La stratégie utilise
`claude-qwen3.7-max` pour Opus, Sonnet et Haiku, avec `claude-qwen3.6-flash`
pour les sous-agents.

Les stratégies avec sous-agent fixe ignorent `--subagent-model` : `claude-gpt-special`
garde `claude-gpt-5.4-mini-sp`, `claude-MiniMax-M3` garde `claude-MiniMax-M3`, et
`claude-qwen3.7-max` garde `claude-qwen3.6-flash`.

Le wrapper démarre un proxy local long-running pour les lancements Claude Code et configure :

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`

`ANTHROPIC_BASE_URL` pointe vers le proxy local, puis le proxy relaie vers le service RouterLab
sélectionné avec le token RouterLab stocké. Cela évite les crashs de timeout body pendant les longues
pauses de thinking, d'outils et de sous-agents.

Les lancements Claude Code reçoivent aussi cet environnement temporaire, limité au
processus enfant :

- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`

Les mappings de stratégie peuvent aussi configurer :

- `ANTHROPIC_DEFAULT_OPUS_MODEL`
- `ANTHROPIC_DEFAULT_SONNET_MODEL`
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- `CLAUDE_CODE_SUBAGENT_MODEL`

## Claude Desktop

Le wrapper prend en charge :

- Windows : `%LOCALAPPDATA%\Claude` et `%LOCALAPPDATA%\Claude-3p`
- macOS : `~/Library/Application Support/Claude` et `~/Library/Application Support/Claude-3p`
- Linux avec `claude-desktop-debian` : `${XDG_CONFIG_HOME:-~/.config}/Claude` et `${XDG_CONFIG_HOME:-~/.config}/Claude-3p`

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

Le terminal du proxy doit rester ouvert pendant l’utilisation de Claude Desktop. Ce mode utilise le
même transport proxy long-running que les lancements Claude Code et Codex CLI.

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

Avec `--service llm`, le mapping Claude Desktop reprend les stratégies LLM de Claude Code :
Claude, OpenAI GPT, OpenAI GPT special price, DeepSeek, MiniMax, Qwen et GLM. Les
noms affichés retirent le préfixe de routage RouterLab `claude-` quand c’est utile, par exemple `gpt-5.5`,
`deepseek-v4-pro`, `qwen3.7-max` et `glm-5.1`.

Le support 1M est appliqué par modèle :

- Haiku, Kimi, GLM, GPT mini et GPT special mini : pas de variante 1M
- GPT 5.4 et GPT 5.5 : variante 1M

## Codex CLI

Lance le CLI officiel Codex via le proxy local résilient du wrapper vers RouterLab pour la session courante sans réécrire
`~/.codex/config.toml` :

```powershell
node index.js codex launch --service routerlab
node index.js codex launch --service llm
```

`codex launch` démarre Codex avec le catalogue RouterLab dérivé des stratégies Claude
Code. Pour les lancements scriptés, passe `--model <valeur>` pour choisir le modèle initial ; sinon
le modèle par défaut du service est utilisé.

Le wrapper inclut aussi un générateur de template de configuration Codex CLI :

```powershell
node index.js codex template --service routerlab
```

Si une ancienne version du wrapper a déjà réécrit la configuration Codex persistante, tu peux
restaurer la sauvegarde :

```powershell
node index.js codex restore --yes
```

Les modèles Codex CLI RouterLab sont proposés dans cet ordre :

```text
gpt-5.5
gpt-5.4
gpt-5.4-mini
deepseek-v4-pro
deepseek-v4-flash
kimi-k2.6
glm-5.1
```

Les modèles Codex CLI RouterLab LLM sont proposés dans cet ordre :

```text
gpt-5.5
gpt-5.4
gpt-5.4-mini
gpt-5.5-sp
gpt-5.4-mini-sp
deepseek-v4-pro
deepseek-v4-flash
MiniMax-M3
qwen3.7-max
qwen3.6-flash
glm-5.1
```

`codex launch` est non destructif par défaut : il démarre le binaire officiel `codex` avec des
overrides runtime `-c` pointant vers le proxy local et transmet uniquement un token local de proxy
via `OPENAI_API_KEY` au process enfant. Le proxy relaie ensuite les requêtes vers RouterLab avec le
token du service choisi. Il ne réécrit pas `config.toml` et ne touche pas à `auth.json`. Quand un
`models_cache.json` Codex local est disponible, le wrapper écrit un catalogue de modèles temporaire
dans le dossier temp système pendant l'exécution de Codex, puis le supprime.

Le flux persistant `codex apply` a été retiré, car remplacer le `config.toml` Codex de l’utilisateur
peut écraser des réglages sans lien avec RouterLab, comme MCP, les hooks, les features ou les
préférences de sandbox. `codex restore --yes` reste disponible uniquement comme commande de
récupération : elle restaure `config.toml.wrapper-scionos-backup` s’il existe ; sans sauvegarde, elle
ne supprime qu’une configuration qui ressemble clairement à une config RouterLab générée par le
wrapper.

## Développement

```powershell
npm test
node index.js doctor
```
