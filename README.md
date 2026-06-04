# wrapper-scionos

Extensible ScioNos CLI wrapper for RouterLab-backed coding assistants.

Current version: `2.0.0`.

This release targets Claude Code, Claude Desktop, and Codex CLI without coupling every client
integration into one large module.

_[Lire en français](./README.fr.md)_

## Requirements

- Node.js 22 or later
- Claude Code installed if you want to launch Claude Code through the wrapper
- A RouterLab token
- Windows, macOS, or the `claude-desktop-debian` Linux port for Claude Desktop 3P profile configuration

## Quick Start

From the project folder:

```powershell
cd D:\Serveurs\Projet_ScioNos\Wrapper-ScioNos
npm install
node index.js
```

`node index.js` opens an interactive menu with:

- Claude Code
- Claude Desktop
- Codex CLI
- Auth
- Doctor

## Commands

```powershell
node index.js
node index.js --service llm
node index.js claude-code --strategy aws -- -p "Summarize this repo"
node index.js auth login
node index.js auth status --service llm
node index.js auth test --service llm
node index.js doctor
node index.js strategies --service routerlab
node index.js claude-desktop status
node index.js claude-desktop apply --service llm --strategy claude --dry-run
node index.js claude-desktop apply --service llm --strategy claude --yes
node index.js claude-desktop apply-proxy --service routerlab --strategy claude-gpt --yes
node index.js claude-desktop proxy --service routerlab
node index.js claude-desktop proxy --service llm
node index.js codex template --service routerlab
node index.js codex apply --service routerlab --model gpt-5.3-codex --yes
node index.js codex apply --service routerlab --yes
```

When installed globally, use `wrapper-scionos` or `scionos` instead of `node index.js`.

## RouterLab services

- `routerlab`: `https://api.routerlab.ch`
- `llm`: `https://llm-api.routerlab.ch`

Tokens are service-scoped. New tokens are stored under `wrapper-scionos`; existing
`claude-scionos` secure token files or keychain entries are also read as a migration fallback.

## Claude Code

Launch directly through RouterLab:

```powershell
node index.js claude-code --service routerlab --strategy aws
```

With Claude Code arguments:

```powershell
node index.js claude-code --strategy aws -- -p "Summarize this project"
```

RouterLab LLM-specific strategies include:

```powershell
node index.js claude-code --service llm --strategy claude-MiniMax-M3
node index.js claude-code --service llm --strategy claude-qwen3.7-max
```

`claude-MiniMax-M3` is shown as `MiniMax-M3 beta` in the guided menu.
`claude-qwen3.7-max` is shown as `qwen3.7-max`. The strategy uses
`claude-qwen3.7-max` for Opus, Sonnet, and Haiku, with `claude-qwen3.6-flash`
for subagents.

Strategies with fixed subagent mappings ignore `--subagent-model`: `claude-gpt-special`
keeps `claude-gpt-5.4-mini-sp`, `claude-MiniMax-M3` keeps `claude-MiniMax-M3`, and
`claude-qwen3.7-max` keeps `claude-qwen3.6-flash`.

The wrapper always configures:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`

Claude Code launches also receive temporary child-process environment:

- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`

Strategy mappings can also configure:

- `ANTHROPIC_DEFAULT_OPUS_MODEL`
- `ANTHROPIC_DEFAULT_SONNET_MODEL`
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- `CLAUDE_CODE_SUBAGENT_MODEL`

Unknown CLI arguments are forwarded to Claude Code.

## Claude Desktop

The wrapper supports:

- Windows: `%LOCALAPPDATA%\Claude` and `%LOCALAPPDATA%\Claude-3p`
- macOS: `~/Library/Application Support/Claude` and `~/Library/Application Support/Claude-3p`
- Linux with `claude-desktop-debian`: `${XDG_CONFIG_HOME:-~/.config}/Claude` and `${XDG_CONFIG_HOME:-~/.config}/Claude-3p`

Restore official Claude Desktop mode:

```powershell
node index.js claude-desktop restore-official --yes
```

Direct profile configuration:

```powershell
node index.js claude-desktop apply --service routerlab --yes
```

For strategies that Claude Desktop hides from the model menu, use local proxy mode:

```powershell
node index.js claude-desktop apply-proxy --service routerlab --strategy claude-gpt --yes
node index.js claude-desktop proxy --service routerlab
```

The proxy terminal must stay open while Claude Desktop uses mapped models.

With `claude-desktop apply` and no strategy, Claude Desktop reads the model catalog from
RouterLab directly. Some non-Claude-family model ids can be hidden by Claude Desktop even when
RouterLab returns them.

Local proxy mode exposes Desktop-safe model ids, then forwards requests to the real RouterLab
strategy models. The default RouterLab Desktop catalog is ordered as:

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

For `--service llm`, the Desktop local mapping mirrors the Claude Code LLM strategies: Claude,
OpenAI GPT, OpenAI GPT special price, DeepSeek, MiniMax, Qwen, and GLM. Display names remove the
RouterLab `claude-` routing prefix where helpful, for example `gpt-5.5`, `deepseek-v4-pro`,
`qwen3.7-max`, and `glm-5.1`.

`claude-desktop apply` is dry-run by default. Pass `--yes` to write files.
`claude-desktop apply-proxy` writes a profile pointing to `http://127.0.0.1:15721`.
`claude-desktop proxy` must stay running while Claude Desktop uses mapped routes.

The 1M context flag is applied per upstream model. Haiku, Kimi, GLM, GPT mini, and GPT special
mini routes do not get 1M variants, while GPT 5.4 and GPT 5.5 do.

## Codex CLI

The wrapper includes a Codex CLI config template generator:

```powershell
node index.js codex template --service routerlab
```

It can also write `~/.codex/config.toml`:

```powershell
node index.js codex apply --service routerlab --dry-run
node index.js codex apply --service routerlab --model gpt-5.3-codex --yes
node index.js codex apply --service routerlab --yes
```

RouterLab Codex CLI models are offered in this order:

```text
gpt-5.5
gpt-5.4
gpt-5.3-codex
gpt-5.4-mini
minimax-m2.7
glm-5.1
```

`codex apply` is dry-run by default. It writes `config.toml` atomically when `--yes` is passed
and leaves `auth.json` untouched so existing Codex login state is preserved. When Codex has a
local `models_cache.json`, the wrapper also writes `wrapper-scionos-model-catalog.json` and points
`model_catalog_json` at it so Codex CLI can see the RouterLab model catalog after restart.

## Development

```powershell
npm test
node index.js doctor
```

See `docs/architecture-notes.md` for the current architecture notes.
