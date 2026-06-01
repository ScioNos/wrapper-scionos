# wrapper-scionos

Wrapper CLI ScioNos extensible pour les assistants de développement connectés à RouterLab.

Version actuelle : `0.9.0-beta.1`.

Cette bêta cible d’abord Claude Code et Claude Desktop. Le projet prépare aussi une base pour
Codex, sans mélanger toutes les intégrations dans un seul gros module.

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
- Auth
- Strategies
- Doctor
- Codex

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

Le wrapper configure notamment :

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`
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

## Codex

La bêta inclut un générateur de template de configuration Codex :

```powershell
node index.js codex template --service routerlab
```

Elle peut aussi écrire `~/.codex/config.toml` :

```powershell
node index.js codex apply --service routerlab --dry-run
node index.js codex apply --service routerlab --yes
```

`codex apply` est en dry-run par défaut. Avec `--yes`, la commande écrit `config.toml`
atomiquement et ne modifie pas `auth.json`, afin de préserver l’état de connexion Codex existant.

## Développement

```powershell
npm test
node index.js doctor
```

## Statut bêta

Cette version est destinée aux tests internes et aux premiers retours. Les commandes et formats de
configuration peuvent encore évoluer avant la version stable.
