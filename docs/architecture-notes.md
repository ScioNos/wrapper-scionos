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
- `claude-desktop.js`: writes a direct Claude Desktop 3P profile on Windows/macOS
- `codex.js`: generates and applies provider-scoped Codex config

Shared modules stay independent:

- `src/routerlab`: services, strategies, model validation
- `src/security`: secure token storage
- `src/platform`: local tool and OS detection
- `src/cli`: command parsing and command dispatch

## Claude Desktop Rules

Claude Desktop is a separate target from Claude Code.

Claude Desktop 3P configuration lives under:

- Windows: `%LOCALAPPDATA%\Claude` and `%LOCALAPPDATA%\Claude-3p`
- macOS: `~/Library/Application Support/Claude` and `~/Library/Application Support/Claude-3p`

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

Codex support should preserve user login material.

Provider switching should edit `~/.codex/config.toml` atomically and avoid overwriting ChatGPT
OAuth state stored in `~/.codex/auth.json`.

## Initial Structure

```text
index.js
src/
  apps/
    claude-code.js
    claude-desktop.js
    codex.js
  cli/
    args.js
    main.js
  platform/
    detect.js
  routerlab/
    models.js
    services.js
    strategies.js
  security/
    token-store.js
tests/
```

## Next Steps

1. Add local proxy/mapping mode for Claude Desktop routes such as `claude-gpt-*`,
   `claude-deepseek-*`, `claude-kimi-*`, and `claude-glm-*`.
2. Add import helpers for existing ScioNos wrapper configurations.
3. Add release packaging after the CLI surface stabilizes.
