# wrapper-scionos

Extensible ScioNos CLI wrapper for RouterLab-backed coding assistants.

Current version: `0.9.0-beta.0`.

This beta targets Claude Code and Claude Desktop first. It also prepares a small Codex foundation
without coupling every client integration into one large module.

_[Lire en français](./README.fr.md)_

## Requirements

- Node.js 22 or later
- Claude Code installed if you want to launch Claude Code through the wrapper
- A RouterLab token
- Windows or macOS for Claude Desktop 3P profile configuration

## Quick Start

From the project folder:

```powershell
cd D:\Serveurs\Projet_ScioNos\Wrapper-ScioNos
node index.js
```

`node index.js` opens an interactive menu with:

- Claude Code
- Claude Desktop
- Auth
- Strategies
- Doctor
- Codex

## Commands

```powershell
node index.js
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
node index.js claude-desktop proxy --service routerlab --strategy claude-gpt
node index.js codex template --service routerlab
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

The wrapper configures:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_DEFAULT_OPUS_MODEL`
- `ANTHROPIC_DEFAULT_SONNET_MODEL`
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- `CLAUDE_CODE_SUBAGENT_MODEL`

Unknown CLI arguments are forwarded to Claude Code.

## Claude Desktop

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
node index.js claude-desktop proxy --service routerlab --strategy claude-gpt
```

The proxy terminal must stay open while Claude Desktop uses mapped models.

With `claude-desktop apply` and no strategy, Claude Desktop reads the model catalog from
RouterLab directly. Some non-Claude-family model ids can be hidden by Claude Desktop even when
RouterLab returns them.

Local proxy mode exposes valid Desktop route ids, then forwards requests to the real RouterLab
strategy models:

```text
claude-haiku-4-5  -> claude-gpt-5.4-mini
claude-sonnet-4-6 -> claude-gpt-5.4
claude-opus-4-8   -> claude-gpt-5.5
```

`claude-desktop apply` is dry-run by default. Pass `--yes` to write files.
`claude-desktop apply-proxy` writes a profile pointing to `http://127.0.0.1:15721`.
`claude-desktop proxy` must stay running while Claude Desktop uses mapped routes.

The 1M context flag is applied per upstream model. For example, `claude-gpt-5.4-mini` does not
get a 1M variant, while `claude-gpt-5.4` and `claude-gpt-5.5` do.

## Codex

The beta includes a Codex config template generator:

```powershell
node index.js codex template --service routerlab
```

Automatic Codex config writing is planned for a later iteration.

## Development

```powershell
npm test
node index.js doctor
```

See `docs/architecture-notes.md` for the current architecture notes.

## Beta Status

This version is intended for internal testing and early feedback. Commands and configuration
formats may still change before the stable release.
