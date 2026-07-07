# wrapper-scionos

Extensible ScioNos CLI wrapper for RouterLab-backed coding assistants.

Current version: `3.2.1`.

This release targets Claude Code, Claude Desktop, and Codex CLI without coupling every client
integration into one large module.

_[Lire en français](./README.fr.md)_

## Requirements

- Node.js 22 or later
- Claude Code installed if you want to launch Claude Code through the wrapper
- A RouterLab token
- Windows, macOS, or the `claude-desktop-debian` Linux port for Claude Desktop 3P profile configuration

## Quick Start

Without a global install:

```powershell
npx wrapper-scionos@latest
```

Or with a global install:

```powershell
npm install -g wrapper-scionos
wrapper-scionos
```

`wrapper-scionos` opens an interactive menu with:

- Claude Code
- Claude Desktop
- Codex CLI
- Auth
- Doctor

## Commands

```powershell
wrapper-scionos
wrapper-scionos --service llm
wrapper-scionos claude-code --strategy aws -- -p "Summarize this repo"
wrapper-scionos auth login
wrapper-scionos auth status --service llm
wrapper-scionos auth test --service llm
wrapper-scionos doctor
wrapper-scionos strategies --service routerlab
wrapper-scionos claude-desktop status
wrapper-scionos claude-desktop apply --service llm --strategy claude --dry-run
wrapper-scionos claude-desktop apply --service llm --strategy claude --yes
wrapper-scionos claude-desktop apply-proxy --service routerlab --strategy claude-gpt --yes
wrapper-scionos claude-desktop proxy --service routerlab
wrapper-scionos claude-desktop proxy --service llm
wrapper-scionos codex launch --service routerlab
wrapper-scionos codex launch --service llm
wrapper-scionos codex template --service routerlab
wrapper-scionos codex restore --yes
```

If you do not want to install the package globally, replace `wrapper-scionos` with
`npx wrapper-scionos@latest` in the examples.

## RouterLab services

- `routerlab`: `https://api.routerlab.ch`
- `llm`: `https://llm-api.routerlab.ch`

Tokens are service-scoped. New tokens are stored under `wrapper-scionos`; existing
`claude-scionos` secure token files or keychain entries are also read as a migration fallback.
On Linux, the wrapper uses Secret Service through `secret-tool` when available and falls back to a
user-only `0600` token file when `secret-tool` is missing or unavailable.

Supported user-facing environment variables:

```text
ROUTERLAB_API_KEY              Token for --service routerlab
ROUTERLAB_LLM_API_KEY          Token for --service llm
ROUTERLAB_BASE_URL             API URL for --service routerlab
ROUTERLAB_LLM_BASE_URL         API URL for --service llm
WRAPPER_SCIONOS_ROUTERLAB_TOKEN      Explicit wrapper token alias
WRAPPER_SCIONOS_LLM_TOKEN            Explicit wrapper token alias
WRAPPER_SCIONOS_ROUTERLAB_BASE_URL   Explicit wrapper URL alias
WRAPPER_SCIONOS_LLM_BASE_URL         Explicit wrapper URL alias
```

`ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` are still read as legacy fallbacks so existing
installations keep working, but the RouterLab names are preferred.

## Claude Code

Launch through the wrapper's local resilient proxy to RouterLab:

```powershell
wrapper-scionos claude-code --service routerlab --strategy aws
```

With Claude Code arguments:

```powershell
wrapper-scionos claude-code --strategy aws -- -p "Summarize this project"
```

RouterLab LLM-specific strategies include:

```powershell
wrapper-scionos claude-code --service llm --strategy glm-5.2
wrapper-scionos claude-code --service llm --strategy claude-qwen3.7-max
wrapper-scionos claude-code --service llm --strategy claude-MiniMax-M3
wrapper-scionos claude-code --service llm --strategy deepseek-v4
```

In the `--service llm` menu, the order is Claude, OpenAI GPT, `glm-5.2`, `qwen3.7-max`,
`MiniMax-M3`, then `deepseek-v4`.

`claude-MiniMax-M3` is shown as `MiniMax-M3` in the guided menu.
`claude-qwen3.7-max` is shown as `qwen3.7-max`. The strategy uses
`claude-qwen3.7-max` for Opus, Sonnet, and Haiku, with `claude-qwen3.6-flash`
for subagents.

All LLM strategies accept `--subagent-model`. With `Strategy default`, `claude-MiniMax-M3`
keeps `claude-MiniMax-M3`, `claude-qwen3.7-max` keeps `claude-qwen3.6-flash`, `glm-5.2`
keeps `claude-glm-5.2`, and `deepseek-v4` keeps `claude-deepseek-v4-flash`.

The wrapper starts a local long-running proxy for Claude Code launches and configures:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`

These names are still required inside the Claude Code child process. As a wrapper user, prefer the
RouterLab variables above or `wrapper-scionos auth login`; the wrapper translates them to the
Anthropic variables expected by Claude Code and forwards to RouterLab through the local proxy.

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
wrapper-scionos claude-desktop restore-official --yes
```

Direct profile configuration:

```powershell
wrapper-scionos claude-desktop apply --service routerlab --yes
```

For strategies that Claude Desktop hides from the model menu, use local proxy mode:

```powershell
wrapper-scionos claude-desktop apply-proxy --service routerlab --strategy claude-gpt --yes
wrapper-scionos claude-desktop proxy --service routerlab
```

The proxy terminal must stay open while Claude Desktop uses mapped models. This mode uses the same
long-running proxy infrastructure that Claude Code and Codex use internally.

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
kimi-k2.7-code
glm-5.1
```

For `--service llm`, the Desktop local mapping mirrors the Claude Code LLM strategies: Claude,
OpenAI GPT, GLM, Qwen, MiniMax, and DeepSeek. Display names remove the
RouterLab `claude-` routing prefix where helpful, for example `gpt-5.5`, `deepseek-v4-pro`,
`qwen3.7-max`, and `glm-5.2`.

`claude-desktop apply` is dry-run by default. Pass `--yes` to write files.
`claude-desktop apply-proxy` writes a profile pointing to `http://127.0.0.1:15721`.
`claude-desktop proxy` must stay running while Claude Desktop uses mapped routes.

The 1M context flag is applied per upstream model. Haiku, Kimi, GLM, and GPT mini routes do not
get 1M variants, while GPT 5.4 and GPT 5.5 do.

## Codex CLI

Launch the official Codex CLI through the wrapper-managed local proxy for the current session without rewriting
`~/.codex/config.toml`:

```powershell
wrapper-scionos codex launch --service routerlab
wrapper-scionos codex launch --service llm
```

`codex launch` starts Codex with the RouterLab model catalog for the selected service. For scripted
launches, pass `--model <value>` to choose the initial model; otherwise the service default is used.

For debugging only, `--direct` bypasses the local proxy and points Codex straight at RouterLab.

The wrapper also includes a Codex CLI config template generator:

```powershell
wrapper-scionos codex template --service routerlab
```

If you previously used an older wrapper version to persistently rewrite Codex config, you can
restore the saved backup:

```powershell
wrapper-scionos codex restore --yes
```

RouterLab Codex CLI models are offered in this order:

```text
gpt-5.5
gpt-5.4
gpt-5.4-mini
deepseek-v4-pro
deepseek-v4-flash
kimi-k2.7-code
glm-5.1
```

RouterLab LLM Codex CLI models are offered in this order:

```text
gpt-5.5
gpt-5.4
gpt-5.4-mini
glm-5.2
qwen3.7-max
MiniMax-M3
deepseek-v4-pro
```

`codex launch` is non-destructive by default: it starts the official `codex` binary with runtime
`-c` overrides for `model_providers.custom.base_url` and passes the selected RouterLab token through
a local `OPENAI_API_KEY` to the child process; the proxy swaps it for the selected RouterLab token upstream. It does not rewrite `config.toml` and does not touch
`auth.json`. The wrapper writes a temporary RouterLab model catalog under the system temp directory
for the duration of the Codex process, then removes it.

The persistent `codex apply` flow was removed because replacing the user's Codex `config.toml`
can overwrite unrelated Codex settings such as MCP, hooks, features, and sandbox preferences.
`codex restore --yes` remains available only as a recovery command: it restores
`config.toml.wrapper-scionos-backup` when present; if no backup exists, it only removes a config
that clearly looks like a wrapper-generated RouterLab config.

## Development

```powershell
npm test
node index.js doctor
```

See `docs/architecture-notes.md` for the current architecture notes.
