# Architecture Notes

This project starts from a narrow goal: provide a clean ScioNos CLI wrapper for
RouterLab-backed coding assistants, then grow through explicit app adapters.

## Core Scope

Keep shared behavior in small modules:

- RouterLab service targets: `https://api.routerlab.ch` and `https://llm-api.routerlab.ch`
- service-scoped token storage
- `/v1/models` validation before strategy availability decisions
- Claude Code environment mapping through:
  - `ANTHROPIC_BASE_URL`
  - `ANTHROPIC_AUTH_TOKEN`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
  - `CLAUDE_CODE_SUBAGENT_MODEL`
- `doctor`, `auth`, and strategy listing workflows
- compatibility mode where regular Claude Code arguments are forwarded

## App Boundaries

Each supported client gets its own adapter under `src/apps`.

Current adapters:

- `claude-code.js`: launches Claude Code with RouterLab environment variables
- `claude-desktop.js`: writes a direct Claude Desktop 3P profile on Windows/macOS/Linux
- `codex.js`: launches Codex with runtime provider overrides and generates non-persistent config templates

Shared modules stay independent:

- `src/routerlab`: services, strategies, shared model metadata, model validation
- `src/security`: secure token storage
- `src/platform`: local tool detection, OS detection, process launching
- `src/cli`: command parsing, command registry, and per-command handlers

## Claude Desktop Rules

Claude Desktop is a separate target from Claude Code.

Claude Desktop 3P configuration lives under:

- Windows: `%LOCALAPPDATA%\Claude` and `%LOCALAPPDATA%\Claude-3p`
- macOS: `~/Library/Application Support/Claude` and `~/Library/Application Support/Claude-3p`
- Linux (`claude-desktop-debian`): `${XDG_CONFIG_HOME:-~/.config}/Claude` and `${XDG_CONFIG_HOME:-~/.config}/Claude-3p`

3P profiles use:

- `deploymentMode = "3p"`
- `configLibrary/_meta.json`
- a stable profile JSON containing `inferenceGatewayBaseUrl`, bearer auth, and optional `inferenceModels`

Direct mode can let Claude Desktop read the RouterLab catalog. Claude Desktop may still hide
model ids that do not look like recognized Claude families.

Local proxy mode exposes valid Desktop route ids and forwards requests to the selected RouterLab
strategy models. This is needed for routes such as `claude-gpt-*` that can be hidden in the
Desktop menu.

## Codex Rules

Codex CLI support should preserve user login material.

The default Codex CLI launch path should be non-destructive: pass runtime `-c` overrides and the
selected RouterLab token through the child process environment instead of rewriting
`~/.codex/config.toml`.

When Codex needs the RouterLab model list, generate a temporary `model_catalog_json` file under the
system temp directory and pass it with a runtime `-c` override. Remove that file after the Codex
process exits.

The wrapper no longer offers persistent provider switching because rewriting
`~/.codex/config.toml` can overwrite unrelated Codex settings. Restore support remains only as a
recovery path for users who previously wrote a wrapper-generated config.

## Initial Structure

```text
index.js
src/
  apps/
    claude-code.js
    claude-desktop-proxy.js
    claude-desktop.js
    codex.js
  cli/
    args.js
    commands/
    main.js
  platform/
    detect.js
    process.js
  routerlab/
    models.js
    services.js
    strategies.js
    strategy-models.js
  security/
    token-store.js
tests/
  claude-code.test.js
  claude-desktop.test.js
  cli.test.js
  codex.test.js
  proxy.test.js
  routerlab.test.js
```

## Next Steps

1. Add import helpers for existing ScioNos wrapper configurations.
2. Add release packaging after the CLI surface stabilizes.
