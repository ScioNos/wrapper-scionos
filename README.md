# wrapper-scionos

[![npm version](https://img.shields.io/npm/v/wrapper-scionos?logo=npm&label=npm)](https://www.npmjs.com/package/wrapper-scionos)
[![GitHub release](https://img.shields.io/github/v/release/ScioNos/wrapper-scionos?display_name=tag&sort=semver&label=release)](https://github.com/ScioNos/wrapper-scionos/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

One launcher for Claude Code, Claude Desktop, Codex CLI and OpenCode — routed through the selected RouterLab service.

**Current release: `7.0.0`**

[Français](./README.fr.md) · [Deutsch](./README.de.md) · [Changelog](./CHANGELOG.md)

## At a glance

| Client | Integration | Model selection |
| --- | --- | --- |
| Claude Code | Authenticated loopback proxy | Strategy and verified sub-agent |
| Claude Desktop | Local mapping proxy and managed profile | Desktop routes |
| Codex CLI | Direct Responses endpoint | Native `/model` catalogue |
| OpenCode CLI | Authenticated OpenAI-compatible loopback proxy | Family, then exact model |

The service is selected once, before the menu opens, and remains fixed for the session. The wrapper validates the service token, discovers the current catalogue, and fails closed when no authorized model is available.

## Requirements

- Node.js `^22.13.0` or `>=23.5.0`.
- A token for the selected RouterLab service.
- Claude Code `>=2.1.220` for Claude Code launches.
- Codex CLI `>=0.144.1` for Codex launches.
- OpenCode `>=1.18.30` for OpenCode launches.
- Windows, macOS, or `claude-desktop-debian` on Linux for Claude Desktop profiles.

## Quick start

Run without a global installation:

```bash
npx wrapper-scionos
npx wrapper-scionos --service llm
```

Or install globally:

```bash
npm install -g wrapper-scionos
wrapper-scionos --service routerlab
```

The installed package exposes both `wrapper-scionos` and `scionos` as equivalent commands.

For `--service llm`, the wrapper displays this neutral notice because the free service catalogue may vary:

```text
ℹ LLM service active — available models may vary
```

The notice is not displayed for `routerlab`.

## Interactive menu

The home menu provides the same entry points on every platform:

```text
1. Claude Code
2. Claude Desktop
3. Codex CLI
4. OpenCode CLI
5. Account & access
6. Tools & diagnostics
0. Exit
```

| Input | Action |
| --- | --- |
| `↑` / `↓` | Move through the choices, with wraparound |
| `Enter` | Confirm the highlighted choice |
| A number | Select the displayed shortcut |
| Label, value or model ID | Select a matching choice |
| `0`, `b`, `back` | Go back; `0` exits from the home menu |
| `q`, `quit`, `exit` | Quit the wrapper from any menu |
| `Esc` | Go back, or quit from the home menu |
| `Ctrl+C` | Interrupt with exit code `130` |

The full keyboard help is shown on the home menu and a compact version is used in submenus. Once a native client starts, its keyboard input and output remain entirely native to that client.

### Interface language

The wrapper defaults to English. Use one of the following languages:

```bash
wrapper-scionos --lang en
wrapper-scionos --lang fr
wrapper-scionos --lang de
```

`--language` is an alias for `--lang`. The same setting can be provided through `SCIONOS_LANG` or `SCIONOS_LANGUAGE`. This localizes wrapper menus and prompts; it does not translate native client output.

## Main commands

```bash
# Clients
wrapper-scionos claude-code --service routerlab --strategy aws
wrapper-scionos claude-code --service llm --strategy divers
wrapper-scionos claude-desktop apply-proxy --service llm --yes
wrapper-scionos claude-desktop proxy --service llm
wrapper-scionos codex launch --service llm
wrapper-scionos opencode --service llm --model gpt-6-astra -- run "Summarize this repository"

# Authentication and diagnostics
wrapper-scionos auth login --service routerlab
wrapper-scionos auth status --service llm
wrapper-scionos auth logout --service routerlab
wrapper-scionos doctor --service llm
wrapper-scionos strategies --service routerlab
```

Run `wrapper-scionos --help` for the authoritative command and option reference. Global options work before or after a command:

```bash
wrapper-scionos --service llm doctor
wrapper-scionos doctor --service llm
```

Arguments after `--` are passed to the native client. The wrapper stops parsing at that boundary, preserving native passthrough. Invalid commands or options return code `2`; runtime failures return `1`; interrupted prompts return `130`.

## Services and authentication

| Service | Production endpoint | Recommended token variables |
| --- | --- | --- |
| `routerlab` | `https://api.routerlab.ch` | `ROUTERLAB_API_KEY`, `WRAPPER_SCIONOS_ROUTERLAB_TOKEN` |
| `llm` | `https://llm-api.routerlab.ch` | `ROUTERLAB_LLM_API_KEY`, `WRAPPER_SCIONOS_LLM_TOKEN` |

`ANTHROPIC_AUTH_TOKEN` remains accepted as a deprecated fallback. Tokens are read from service-specific secure storage or a masked prompt. The wrapper never exposes a token in menus or diagnostic output.

Production destinations are fixed. User-provided `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, `WRAPPER_SCIONOS_*_BASE_URL` and `ANTHROPIC_BASE_URL` values are ignored with a warning; they cannot redirect production traffic.

On Linux, persistent secure storage requires `secret-tool` and an available Secret Service. The legacy `claude-scionos` secure-storage namespace is read during migration, and logout removes both namespaces.

## Model routing

The wrapper uses the intersection of the service allowlist and the verified `GET /v1/models` response. Models that are not discovered or authorized are hidden or rejected. There is no silent fallback, and an empty intersection blocks the launch.

### Claude Code strategies — `llm`

| Strategy | Fable | Haiku | Sonnet | Opus |
| --- | --- | --- | --- | --- |
| `claude` | `claude-fable-5` | `claude-haiku-4-5` | `claude-sonnet-5` | `claude-opus-5` |
| `claude-gpt` | `gpt-6-astra` | `gpt-5.6-luna` | `gpt-5.6-terra` | `gpt-5.6-sol` |
| `divers` | `deepseek-v4.1-flash` | `gemini-3.8-flash` | `glm-5.3` | `glm-5.3-flash` |

The `llm` sub-agent picker also supports `claude-haiku-4-5`, `aws-claude-haiku-4-5`, `gpt-5.6-luna`, `deepseek-v4.1-flash` and `glm-5.3-flash` when discovered and authorized.

For `routerlab`, the main strategy families are Claude, AWS Claude, OpenAI GPT and Open Source. Claude Native uses `claude-fable-5.1`; the GPT mapping is Fable `gpt-6-astra`, Haiku `gpt-5.6-luna`, Sonnet `gpt-5.6-terra` and Opus `gpt-5.6-sol`.

### Codex CLI

Codex is launched directly against the selected RouterLab Responses endpoint:

```bash
wrapper-scionos codex launch --service routerlab
wrapper-scionos codex launch --service llm
```

The default model is **`gpt-5.6-sol`**. It must be both discovered and authorized; the wrapper never substitutes another model. From the home menu, Codex opens directly and its native `/model` selector displays the temporary verified catalogue.

| Service | Allowlist |
| --- | --- |
| `routerlab` | `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-v4.1-flash`, `kimi-k3`, `qwen3.8-max`, `glm-5.3`, `glm-5.3-flash` |
| `llm` | `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gemini-3.8-flash`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash` |

The catalogue is written to a temporary startup file, contains no credentials, and is deleted after the child process exits. The removed `--direct`, `--proxy` and `--transport` options are no longer supported because direct access is now the only Codex transport.

### OpenCode CLI

```bash
wrapper-scionos opencode --service llm
wrapper-scionos opencode --service llm --strategy divers --model glm-5.3
wrapper-scionos opencode --service llm --model gpt-6-astra -- run "Summarize this repository"
```

Interactive launch selects a family and then an exact model. The no-prompt default is `gpt-5.6-sol`, provided that discovery authorizes it. The wrapper creates an authenticated loopback proxy and injects `OPENCODE_CONFIG_CONTENT` only into the child process; it never writes an `opencode.json` file or stores the RouterLab token in OpenCode configuration.

Update an npm installation with OpenCode's native updater:

```bash
opencode upgrade --method npm
```

## Client security model

- Claude Code and OpenCode use authenticated loopback proxies with process-local credentials.
- Claude Desktop stores only a random local credential in its managed profile; the RouterLab token remains in secure storage.
- Codex receives the service token through its native `OPENAI_API_KEY` environment variable and uses a temporary verified model catalogue.
- Model discovery runs before proxy creation or client launch and fails closed on authentication, network, invalid-response, server, empty-catalogue or empty-intersection errors.
- User-controlled provider and base-URL overrides cannot change the production RouterLab destination.
- Native tools, MCP, sessions, updates and other client features remain native to the selected client unless explicitly restricted by that client.

Detailed implementation notes are available in [docs/architecture-notes.md](./docs/architecture-notes.md). The Codex migration history is documented in [docs/migration-5.0-codex.md](./docs/migration-5.0-codex.md).

## Development and release checks

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

The real-client smoke tests use loopback-only fake services and do not contact RouterLab. Coverage thresholds are 85% for lines/functions and 80% for branches. For a local unpublished package:

```bash
npm pack
npx --yes --package ./wrapper-scionos-7.0.0.tgz wrapper-scionos
```

## License

MIT © ScioNos
