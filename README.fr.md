# wrapper-scionos

Wrapper CLI ScioNos extensible pour les assistants de développement connectés à RouterLab.

Version actuelle : `0.9.0-beta.0`.

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
node index.js doctor
node index.js strategies --service routerlab
node index.js auth login
node index.js auth status
node index.js auth test
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
node index.js claude-desktop proxy --service routerlab --strategy claude-gpt
```

Le terminal du proxy doit rester ouvert pendant l’utilisation de Claude Desktop.

Pour `claude-gpt`, le profil Desktop expose des routes Anthropic valides avec des noms affichés GPT :

```text
claude-haiku-4-5  -> claude-gpt-5.4-mini
claude-sonnet-4-6 -> claude-gpt-5.4
claude-opus-4-8   -> claude-gpt-5.5
```

Le support 1M est appliqué par modèle :

- `claude-gpt-5.4-mini` : pas de variante 1M
- `claude-gpt-5.4` : variante 1M
- `claude-gpt-5.5` : variante 1M

## Codex

La bêta inclut un générateur de template de configuration Codex :

```powershell
node index.js codex template --service routerlab
```

L’écriture automatique de la configuration Codex est prévue pour une prochaine itération.

## Développement

```powershell
npm test
node index.js doctor
```

## Statut bêta

Cette version est destinée aux tests internes et aux premiers retours. Les commandes et formats de
configuration peuvent encore évoluer avant la version stable.
