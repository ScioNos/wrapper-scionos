# wrapper-scioNos

[![npm version](https://img.shields.io/npm/v/wrapper-scionos?logo=npm&label=npm)](https://www.npmjs.com/package/wrapper-scionos)
[![GitHub release](https://img.shields.io/github/v/release/ScioNos/wrapper-scionos?display_name=tag&sort=semver&label=release)](https://github.com/ScioNos/wrapper-scionos/releases)
[![Node.js](https://img.shields.io/badge/node-%5E22.13.0%20%7C%7C%20%3E%3D23.5.0-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

One launcher for five tools: Claude Code CLI, Claude Cowork, Claude Desktop, Codex CLI and OpenCode CLI — routed through the selected RouterLab service.

## Why wrapper-scioNos?

Keep your preferred coding client and choose a RouterLab model family for your work. The wrapper handles service authentication and routing; each native client keeps its own tools and sessions.

```bash
# Select the AWS Claude family
npx wrapper-scionos claude-code --service routerlab --strategy aws
```

**Current release: `7.3.0`**

[Français](./README.fr.md) · [Deutsch](./README.de.md) · [Changelog](./CHANGELOG.md)

## At a glance

| Client | Integration | Model selection |
| --- | --- | --- |
| Claude Code | Authenticated loopback proxy | Strategy and verified sub-agent |
| Claude Desktop | Local mapping proxy and managed profile | Desktop routes |
| Claude Cowork | Through the Claude Desktop integration | Shared Desktop routes |
| Codex CLI | Direct Responses endpoint | RouterLab family, then native `/model` catalogue |
| OpenCode CLI | Authenticated OpenAI-compatible loopback proxy | Family, then exact model |

The service is selected once, before the menu opens, and remains fixed for the session. The wrapper validates the service token, discovers the current catalogue, and fails closed when no authorized model is available.

## Requirements

- Node.js `^22.13.0` or `>=23.5.0`.
- A token for the selected RouterLab service.
- Claude Code `>=2.1.220`; RouterLab Claude Native requires `>=2.1.293` and AWS Claude requires `>=2.1.284`. Release checks use `2.1.296`.
- Codex CLI `>=0.144.1` for Codex launches.
- OpenCode `>=1.18.30`; Windows checks validate `opencode-ai@1.18.30` and `@opencode/cli@2.0.27`.
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

The product name is **wrapper-scioNos**. Its npm package and primary command are `wrapper-scionos`; the installed package also exposes `scionos` as an equivalent command.

For `--service llm`, the wrapper displays this neutral notice because the service catalogue may vary:

```text
ℹ LLM service active — available models may vary
```

The notice is not displayed for `routerlab`.

## Interactive menu

The home menu provides the same entry points on every platform:

```text
1. Claude Code
2. Claude Desktop / Cowork
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

Arguments after `--` are passed to the native client for launch commands (`claude-code`, `codex launch`, and `opencode`). Other commands reject passthrough arguments. The wrapper stops parsing at the boundary for commands that support it. Invalid commands or options return code `2`; runtime failures return `1`; interrupted prompts return `130`.

## Services and authentication

| Service | Production endpoint | Recommended token variables |
| --- | --- | --- |
| `routerlab` | `https://api.routerlab.ch` | `ROUTERLAB_API_KEY`, `WRAPPER_SCIONOS_ROUTERLAB_TOKEN` |
| `llm` | `https://llm-api.routerlab.ch` | `ROUTERLAB_LLM_API_KEY`, `WRAPPER_SCIONOS_LLM_TOKEN` |

`ANTHROPIC_AUTH_TOKEN` remains accepted as a deprecated fallback. Tokens are read from service-specific secure storage or a masked prompt. The wrapper never exposes a token in menus or diagnostic output.

Production destinations are fixed. User-provided `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, `WRAPPER_SCIONOS_*_BASE_URL` and `ANTHROPIC_BASE_URL` values are ignored with a warning; they cannot redirect production traffic.

On Linux, persistent secure storage requires `secret-tool` and an available Secret Service. The legacy `claude-scionos` secure-storage namespace is read during migration, and logout removes both namespaces.

For commands that accept an explicit token, prefer `--token-stdin` to read it from a pipe. It cannot be combined with `--token`, which now emits a warning because command arguments and shell history can expose the secret. Claude Code uses masked `auth login`, environment variables, or secure storage instead.

## Model routing

The wrapper uses the intersection of the service allowlist and the verified `GET /v1/models` response. Models that are not discovered or authorized are hidden or rejected. There is no silent fallback, and an empty intersection blocks the launch.

### Claude Code strategies — `llm`

| Strategy | Fable | Haiku | Sonnet | Opus |
| --- | --- | --- | --- | --- |
| `claude` | `claude-fable-5` | `claude-haiku-4-5` | `claude-sonnet-5` | `claude-opus-5` |
| `claude-gpt` | `gpt-6-astra` | `gpt-5.6-luna` | `gpt-5.6-terra` | `gpt-5.6-sol` |
| `divers` | `deepseek-v4.1-flash` | `gemini-3.8-flash` | `glm-5.3` | `glm-5.3-flash` |

The `llm` sub-agent picker also supports `claude-haiku-4-5`, `aws-claude-haiku-4-5`, `gpt-5.6-luna`, `deepseek-v4.1-flash` and `glm-5.3-flash` when discovered and authorized.

For `routerlab`, Claude Code offers Claude Native, AWS Claude, OpenAI GPT, Open Source and Trial strategies. Claude Native uses `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`, with Haiku 5.5 as its default subagent. This strategy requires Claude Code `>=2.1.293`; CI validates with `2.1.296`. OpenAI GPT uses `gpt-6-astra` for Fable, `gpt-6.1-sol` for Opus and Sonnet, and `gpt-6-luna` for Haiku and the default subagent. Open Source includes `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`, `hy4-preview`, `kimi-k3`, `minimax-m3` and `qwen3.8-max`; its default role mapping uses DeepSeek for Fable, GLM Flash for Haiku, GLM for Sonnet, Qwen for Opus and Kimi for subagents. Trial includes `deepseek-v4.1-flash-trial`, `glm-5.3-flash-trial`, `qwen3.8-flash-trial`, `gpt-6-luna-trial` and `MiniMax-M3-trial`; Claude Code fixes its subagent to `deepseek-v4.1-flash-trial`.

AWS Claude uses `aws-claude-opus-5-5`, `aws-claude-sonnet-5-5` and `aws-claude-haiku-4-5`. Its default subagent remains AWS Haiku 4.5. This strategy requires Claude Code `>=2.1.284`.

### Codex CLI

Codex is launched directly against the selected RouterLab Responses endpoint:

```bash
wrapper-scionos codex launch --service routerlab
wrapper-scionos codex launch --service llm
```

On `routerlab`, interactive launch first selects **OpenAI GPT-6**, **Open Source**, or **Trial**, then opens Codex with that family's temporary verified catalogue. The native `/model` selector changes models within the selected family. Preferred family defaults are `gpt-6.1-sol`, `deepseek-v4.1-flash`, and `deepseek-v4.1-flash-trial`; if a family’s preferred model is unavailable, interactive mode requires an explicit choice from its available models, even when only one remains. Non-interactive mode fails with instructions to provide `--model <id>`. An explicit unavailable model always fails.

Without a selected family, the RouterLab launch default is **`gpt-6.1-sol`**. The RouterLab LLM default remains **`gpt-5.6-sol`**, and its home-menu entry opens Codex directly. Explicit models and these service defaults must be discovered and authorized. Use `--strategy claude-gpt|open-source|trial` to select a RouterLab family from the command line, or `--model` for an exact model.

| Service | Allowlist |
| --- | --- |
| `routerlab` | `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`, `hy4-preview`, `kimi-k3`, `minimax-m3`, `qwen3.8-max`, `deepseek-v4.1-flash-trial`, `glm-5.3-flash-trial`, `qwen3.8-flash-trial`, `gpt-6-luna-trial`, `MiniMax-M3-trial` |
| `llm` | `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gemini-3.8-flash`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash` |

The catalogue is written to a temporary startup file, contains no credentials, and is deleted after the child process exits. The removed `--direct`, `--proxy` and `--transport` options are no longer supported because direct access is now the only Codex transport.

### OpenCode CLI

```bash
wrapper-scionos opencode --service llm
wrapper-scionos opencode --service llm --strategy divers --model glm-5.3
wrapper-scionos opencode --service llm --model gpt-6-astra -- run "Summarize this repository"
wrapper-scionos opencode --service routerlab --strategy trial --model deepseek-v4.1-flash-trial
```

Interactive launch selects a family and then an exact discovered model. RouterLab OpenCode shares the Claude Native, AWS Claude, OpenAI GPT, Open Source and Trial model families; its no-prompt default is `gpt-6.1-sol`. RouterLab LLM defaults to `gpt-5.6-sol`. Trial uses `deepseek-v4.1-flash-trial` for Claude Code's fixed subagent; OpenCode treats it as an ordinary selectable model. The wrapper creates an authenticated loopback proxy and injects `OPENCODE_CONFIG_CONTENT` only into the child process; it never writes an `opencode.json` file or stores the RouterLab token in OpenCode configuration.

Update an npm installation with OpenCode's native updater:

```bash
opencode upgrade --method npm # 1.x
# 2.x: opencode upgrade --help
```

## Proxy response deadlines

Claude Code, OpenCode, Desktop and Cowork share these environment settings, read when the proxy starts. Values are integer milliseconds; invalid values prevent startup.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WRAPPER_SCIONOS_PROXY_FIRST_RESPONSE_TIMEOUT_MS` | `120000` | Wait from upstream dispatch to the first body bytes; headers alone do not reset it |
| `WRAPPER_SCIONOS_PROXY_STREAM_IDLE_TIMEOUT_MS` | `120000` | Maximum gap between body chunks; reset by every chunk |
| `WRAPPER_SCIONOS_PROXY_STREAM_TOTAL_TIMEOUT_MS` | `0` | Total duration after the first body chunk; zero disables the cap |

First-response and inactivity limits must be positive. An active stream can exceed 120 seconds by default. Client disconnects abort upstream work. Before a response is sent, expiry returns HTTP 504; during a response it closes the stream rather than appending a JSON error. Timers and upstream streams are cleaned on every exit.

Inbound client headers still have 30 seconds and the complete request body 120 seconds to arrive, with a 64 MiB limit in compressed and decompressed form. These fixed inbound limits are separate from upstream response deadlines. Codex uses its native direct transport and does not use these proxy settings.

## Persistent profiles and secrets

Desktop and Cowork share one managed Desktop profile and proxy. Applying it persistently writes the gateway URL, random local credential, model routes and Cowork egress host to the Claude-3p profile and its `_meta.json`; stopping the proxy leaves that profile applied. Restart the proxy to use it again, or run `wrapper-scionos claude-desktop restore --yes` to restore the official profile. Status and dry-run preview the state. Profile/proxy tests do not prove operation inside the Desktop or Cowork application.

At rest, saved service tokens use Windows DPAPI, macOS Keychain or Linux Secret Service. Linux requires `secret-tool`; there is no plaintext storage fallback. On macOS, new entries use native Security APIs through `osascript`, with the secret on stdin and interactive access disabled. Existing entries that trust `security` retain their access rules and use that executable for reading and updates; updates receive a hex-encoded value through a single stdin batch command. Each system operation is limited to 15 seconds, and every write is verified by reading it back. Real macOS checks passed for new entries, UTF-8 updates, both older namespaces and deletion; see the validation record.

In memory, the wrapper holds the service token while it runs. Claude Code and OpenCode receive only a local proxy credential through their child environment; Desktop stores that local credential in its profile. Codex receives the service token in its child `OPENAI_API_KEY` environment. Environments are available to the child and can be inspected by sufficiently privileged processes; secure storage protects tokens at rest. Prefer a masked login or `--token-stdin` over inline `--token`.

## Verified compatibility

On Windows with Node 24.19.0, Claude Code 2.1.296 passed 13 routing scenarios; Codex 0.144.1 and 0.157.0 passed Responses streaming and native model/list; OpenCode 1.18.30 and 2.0.27 passed exact model, HTTP path, authentication, streaming and a native read-tool cycle against simulated providers. OpenCode 2 uses native `--standalone` so its private server receives the ephemeral proxy configuration. Its shared background service is incompatible with this per-launch integration.

[GitHub CI passed all 37 jobs](https://github.com/ScioNos/wrapper-scionos/actions/runs/38377724549), including these Claude/OpenCode versions and Codex 0.144.1 on Windows, macOS and Linux, plus real Keychain checks on macOS. The exact Node configurations and runner versions are recorded in the validation report.

A discovered and authorized model is eligible for selection; it is not evidence of live inference or tool compatibility for that RouterLab model. Production RouterLab inference and Desktop/Cowork application runs remain untested. Prices, savings, hosting location and subscription terms require separate RouterLab evidence. See the [7.3.0 validation record](./docs/release-7.3.0-validation.md) for scope and remaining application checks.

## Client security model

- Claude Code and OpenCode use authenticated loopback proxies with process-local credentials.
- Claude Desktop stores only a random local credential in its managed profile; the service token stays in the wrapper and its selected token source.
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
npm run test:keychain-real # macOS
npm audit
npm pack --dry-run
```

`npm run release:check` runs unit tests, coverage, entry modes, all three real clients, the Keychain check, audit and package inspection. Keychain is skipped outside macOS; that skip does not certify the macOS release gate.

The real-client smoke tests use loopback-only fake services and do not contact RouterLab. Coverage thresholds are 85% for lines/functions and 80% for branches. For a local unpublished package:

```bash
npm pack
npx --yes --package ./wrapper-scionos-7.3.0.tgz wrapper-scionos
```

## License

MIT © ScioNos
