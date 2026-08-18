# wrapper-scionos

ScioNos command-line wrapper for RouterLab-backed Claude Code, Claude Desktop, and Codex CLI.

[Lire en français](./README.fr.md)

## Requirements

- Node.js ^22.13.0 or >=23.5.0.
- A service-scoped RouterLab token.
- Claude Code >=2.1.220 for Claude Code launches.
- Codex CLI >=0.144.1 for Codex launches.
- Windows, macOS, or claude-desktop-debian on Linux for Claude Desktop profiles.

> **Limited availability:** some `--service llm` features may be limited. The wrapper displays `ROUTERLAB LLM — SOME FEATURES MAY BE LIMITED` before commands that use this service.

## Install and entry modes

Without a global install:

    npx wrapper-scionos
    npx wrapper-scionos --service llm

With a global install:

    npm install -g wrapper-scionos
    wrapper-scionos
    wrapper-scionos --service llm

All four entry modes open the same interactive menu. The selected service is shown in the banner. The installed package also exposes scionos as an exact binary alias for wrapper-scionos.

On Windows, PowerShell may resolve the generated `wrapper-scionos.ps1` or `npx.ps1` shim while Command Prompt resolves the corresponding `.cmd` shim; both are created by npm and are supported. On Linux and macOS, npm creates executable shell shims. The release smoke test exercises the four commands above on all three operating systems.

## Main commands

    wrapper-scionos claude-code --service routerlab --strategy aws
    wrapper-scionos claude-code --service llm --strategy glm-5.2
    wrapper-scionos auth login --service routerlab
    wrapper-scionos auth logout --service routerlab
    wrapper-scionos auth status --service llm
    wrapper-scionos doctor --service llm
    wrapper-scionos strategies --service routerlab
    wrapper-scionos claude-desktop apply-proxy --service llm --yes
    wrapper-scionos claude-desktop proxy --service llm
    wrapper-scionos codex launch --service llm
    wrapper-scionos codex template --service llm
    wrapper-scionos codex status
    wrapper-scionos codex restore --yes

Run wrapper-scionos --help for the authoritative command and option list. The displayed version is read from package.json.

Global options are accepted before or after the command: `wrapper-scionos --service llm doctor` and `wrapper-scionos doctor --service llm` are equivalent. Parsing stops at the first unknown argument and never examines arguments after `--`, preserving Claude Code passthrough.

Options are validated per command and action; unknown actions, irrelevant options, and extra positional arguments exit with code 2. --no-prompt and --json require an explicit command. Human-readable output is the default. Non-interactive commands accept --json and emit exactly one stable document: {"ok":true,"command":"...","data":{...}} on success or {"ok":false,"error":{"code":"...","message":"..."}} on failure. JSON is rejected for the menu, Claude Code, codex launch, and claude-desktop proxy.

Exit codes are 0 for success and previews, 1 for runtime/upstream failures, 2 for invalid usage, and 130 for an interrupted prompt. Auth login and logout honor --dry-run without prompting or changing secure storage; explicit login/logout remain mutating without requiring --yes.

## Authentication and services

Service endpoints:

- routerlab: https://api.routerlab.ch
- llm: https://llm-api.routerlab.ch

Preferred environment variables:

    ROUTERLAB_API_KEY
    ROUTERLAB_LLM_API_KEY
    WRAPPER_SCIONOS_ROUTERLAB_TOKEN
    WRAPPER_SCIONOS_LLM_TOKEN

`ANTHROPIC_AUTH_TOKEN` remains a deprecated token fallback. User-provided `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, `WRAPPER_SCIONOS_*_BASE_URL`, and `ANTHROPIC_BASE_URL` values are ignored with a warning; they never change the production destination.

Secure storage reads both wrapper-scionos and the legacy claude-scionos namespace; logout deletes both. Linux persistence requires `secret-tool` and an available Secret Service. Legacy plaintext token files are reported as requiring migration but are never read; a successful, verified `auth login` migrates them to Secret Service before deleting them.

auth login uses a masked prompt. The --token option remains available to supported commands such as auth test, strategies, Codex, and Claude Desktop, but Claude Code launches reject it because command lines are visible in shell history and process inspection. Claude Code token order is the service environment variable followed by secure storage or the masked prompt. Codex intentionally keeps its special order of --token, secure storage, then environment.

## Claude Code

Claude Code 2.1.220 or newer is launched through a loopback proxy. Wrapper-owned credentials and model mappings are injected only into the child process; unknown arguments after -- are forwarded to Claude Code. CLI detection gives each `claude --version` candidate five seconds before trying the next executable, and an unsupported or unparseable version fails before token resolution or network access.

    wrapper-scionos claude-code --service routerlab --strategy aws -- -p "Summarize this repository"

For both services (`routerlab` and `llm`), Claude Code allows selecting a subagent model at launch (or via `--subagent-model <id>`) from verified lightweight models (`claude-haiku-4-5`, `aws-claude-haiku-4-5`, `deepseek-v4-flash-0731`, `gpt-5.6-luna`). For `--service llm`, the `claude` strategy maps Custom and Haiku to `claude-fable-5`, Opus to `claude-opus-5`, and Sonnet to `claude-sonnet-5`. The LLM strategy catalogue is `claude`, `claude-gpt`, `qwen3.8-max`, `minimax-m3`, `grok-4.6`, `glm-5.2`, and `deepseek` (Opus & Sonnet => `deepseek-v4-pro-0813`, Haiku => `deepseek-v4-flash-0731`).

Claude Code always targets the official service through its dedicated loopback proxy. The wrapper generates the child-only `ANTHROPIC_BASE_URL`; a user-provided value is ignored. Legacy `ANTHROPIC_AUTH_TOKEN` remains accepted as an input token source with its deprecation warning, but the raw token and every RouterLab token variable are removed from the child environment. Claude receives only a random, process-local proxy credential. Provider, endpoint, authentication, header, and model-routing variables are sanitized; unrelated native tool, MCP, certificate, and network variables remain inherited. Loopback is merged into `NO_PROXY`/`no_proxy`.

The child also receives `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`. This official Claude Code variable strips Anthropic-specific `anthropic-beta` request headers and beta tool-schema fields that some gateways or routed models do not support. It adds no prompt, instruction, or tool. Anthropic documents the tradeoff: MCP tool search is disabled and all MCP tools are loaded upfront. This setting is an intentional RouterLab compatibility exception; see [Architecture Notes](./docs/architecture-notes.md#claude-code-experimental-beta-compatibility).

Every model-discovery failure stops the launch before the local proxy or Claude child starts, including authentication, redirect, network, timeout, invalid-response, server, empty-catalog, and empty-authorized-intersection failures. Discovery uses a direct transport to the fixed service endpoint. The proxy accepts only the intersection of the service's authorized Claude Code models and the verified RouterLab catalog. Native `/model`, resume, and subagent choices remain usable inside that intersection; any other model is rejected locally with HTTP 403 and is never forwarded.

The proxy has no total generation timeout and closes its upstream request if the client disconnects. Cleanup starts as soon as the proxy is created, waits up to two seconds for normal shutdown, then force-closes lingering local connections.

## Claude Desktop

Claude Desktop is supported only through the authenticated local mapping proxy. The former direct profile command has been removed because it persisted the RouterLab token in the Desktop profile:

    wrapper-scionos claude-desktop apply-proxy --service llm --yes
    wrapper-scionos claude-desktop proxy --service llm

`apply-proxy` stores only a random 32-byte local credential in the profile; the RouterLab token remains in its secure source. Before applying a profile and before every proxy start, the wrapper discovers `/v1/models` directly on the fixed RouterLab endpoint and exposes only the intersection with the configured Desktop routes. Discovery, authentication, redirect, timeout, invalid JSON, empty catalogue, and empty-intersection failures are fail-closed and cause no profile mutation. For `--service routerlab`, the Desktop catalogue mirrors the RouterLab Claude Code strategies. Claude Native exposes `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, and `claude-haiku-4-5`; the remaining routes cover AWS Claude, GPT 5.6, `deepseek-v4-pro-0813`, `deepseek-v4-flash-0731`, `kimi-k3`, `glm-5.2`, and `minimax-m3`. Only models returned by RouterLab discovery are displayed.

Profiles use `wrapperScionos` metadata schema v2 with the fixed service, strategies, loopback origin, and verified routes, but never a RouterLab token. A valid v1 proxy profile is migrated after redetection while retaining its random local credential. A direct, unmanaged, or metadata-less profile requires explicit replacement with `apply-proxy --yes` or restoration of the official profile; an old direct token is never reused.

From the interactive menu, Start Local Mapping uses the service displayed in the banner. A missing profile is created directly, a healthy equivalent profile is reused without rotating its local credential, and replacement of a differing, direct, legacy, or invalid profile asks for confirmation. The stored host and port are preserved unless explicitly overridden; switching services reloads the service-specific catalog.

The selected service base URL is validated before token resolution, listener binding, or profile mutation. Generated profiles authorize Cowork egress only to their gateway exact hostname. `claude-desktop status` preserves existing fields and adds `profileExists`, `applied`, `healthy`, and stable `issues` codes without exposing credentials.

The proxy listens on exact loopback hosts only (`localhost`, `::1`, or a valid `127.0.0.0/8` IPv4) and an explicit port between 1 and 65535. It permits Messages API operations only: model listing, message creation, token counting, and batch create/list/retrieve/cancel/results/delete. Unsupported paths, methods, and unmapped models fail locally; a mixed invalid batch is rejected entirely before any upstream call. Browser origins are rejected by default.

Requests are limited to 64 MiB before and after decompression. Identity, gzip, deflate, and Brotli bodies are accepted; zstd is accepted when supported by the active Node runtime, otherwise returning HTTP 415 unsupported_content_encoding. Invalid JSON returns HTTP 400. Header reception is limited to 30 seconds and body transmission to 120 seconds. Long generations have no overall timeout.

When the proxy is started from the interactive menu, Ctrl+C stops it and returns to the Claude Desktop submenu without preserving an exit code. For the direct `claude-desktop proxy` command, Ctrl+C exits with 130; SIGTERM exits with 143 in both modes.

## Codex CLI

Codex connects directly to the selected RouterLab Responses endpoint:

    wrapper-scionos codex launch --service routerlab
    wrapper-scionos codex launch --service llm

The wrapper allowlists these initial models:

- `routerlab`: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-v4-pro-0813`, `deepseek-v4-flash-0731`, `kimi-k3`, `glm-5.2`, `minimax-m3`.
- `llm`: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `qwen3.8-max`, `minimax-m3`, `grok-4.6`, `glm-5.2`, `deepseek-v4-pro-0813`, `deepseek-v4-flash-0731`.

Before launch, `GET /v1/models` is used only to intersect this allowlist with the identifiers currently available on RouterLab. An explicit `--model` must match an available identifier exactly; there is no substitution. Interactive launch asks among the intersection and automatically selects it when only one model remains. `--no-prompt` without `--model` requires `gpt-5.6-sol` to be available.

Every discovery failure is fail-closed: network errors, timeouts, invalid JSON, HTTP 401/403, server errors, and an empty intersection all prevent Codex from starting. The `--direct`, `--proxy`, and `--transport` options have been removed because direct access is now the only Codex transport.

At launch, the session receives seven Codex configuration overrides: `model_provider`, `model`, `model_catalog_json`, provider `name`, provider `base_url`, `wire_api="responses"`, and `env_key="OPENAI_API_KEY"`. The RouterLab token is passed unchanged to the Codex child through `OPENAI_API_KEY`. Native arguments after `--` are forwarded unchanged except for options that can replace wrapper-validated routing or model selection: `-c`/`--config`, `-m`/`--model`, `--oss`, `--local-provider`, `-p`/`--profile`, `--remote`, and `--remote-auth-token-env`. Use the wrapper `--model` option before `--` to select an allowed RouterLab model.

After successful discovery, the wrapper writes a temporary startup catalog containing only the intersection of the discovered models and the models allowed for the selected service, in their configured order. RouterLab metadata is normalized for Codex; conservative values are used when optional fields are missing. Discovery failure has no fallback: the launch stops instead of exposing a stale catalog. The resulting list is what Codex displays in `/model`.

The catalog contains no credential, remains available only while the Codex child process is running, and is deleted after both successful and failed launches. The wrapper never writes `config.toml`, `auth.json`, sandbox or approval settings, MCP settings, profiles, or other Codex preferences.

Production destinations are fixed: `routerlab` uses `https://api.routerlab.ch/v1` and `llm` uses `https://llm-api.routerlab.ch/v1`. User-provided `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, `WRAPPER_SCIONOS_*_BASE_URL`, and `ANTHROPIC_BASE_URL` values are ignored with a warning. Token variables remain supported.

### Scope of the RouterLab-only guarantee

The RouterLab-only guarantee applies exclusively to model discovery and inference traffic configured by the wrapper: model listing and Responses requests for the selected provider. It does not restrict independent network features of the official Codex binary, including update checks, MCP, tools, search, or other native integrations configured by the user. The wrapper does not disable, replace, or enrich those native features.

When Codex is selected from the interactive menu, a startup failure or non-zero Codex exit reports the error and returns to the main menu. A normal Codex exit closes the wrapper. Direct `codex launch` commands preserve the Codex process exit code.

`codex template` previews the six provider and model routing settings. The ephemeral `model_catalog_json` path is created only by `codex launch`, after model discovery. `codex status` and `codex restore` remain available only to inspect and remove configuration or catalog files created by older wrapper releases. A legacy backup is restored automatically; without one, `config.toml` is always preserved and manual cleanup is reported. Current runtime state is cleaned automatically.

## 4.x compatibility

The following legacy items still warn once per process on stderr:

- ANTHROPIC_AUTH_TOKEN
- --list-strategies (use strategies)
- auth change (use auth login)

`claude-desktop apply` is no longer a compatibility alias and fails with migration guidance to `apply-proxy`.

All user-provided base URL variables, including `ANTHROPIC_BASE_URL`, are ignored. See [Codex migration for 5.0](./docs/migration-5.0-codex.md).

## Development and release checks

    npm test
    npm run test:coverage
    npm run test:entry-modes
    npm run test:claude-real
    npm run test:codex-real
    npm audit
    npm pack --dry-run

`npm run test:entry-modes` packs the current working tree into a temporary tarball, installs it in an isolated prefix, then opens and exits the interactive menu through `wrapper-scionos`, `wrapper-scionos --service llm`, `npx wrapper-scionos`, and `npx wrapper-scionos --service llm`. It does not require a global installation or a previously published npm version.

`npm test` uses internal dependency injection for local fixtures; production URL variables cannot redirect the wrapper. `npm run test:claude-real` validates the installed Claude Code CLI against hostile local settings. `npm run test:codex-real` validates a real non-interactive Codex request against a local Responses endpoint and checks through `app-server` that `model/list` exposes the temporary catalog in the expected order with the selected model active. Both smoke tests use loopback-only fake services and never contact RouterLab. Coverage gates remain 85% for lines/functions and 80% for branches.

For an unpublished build, create a local tarball with `npm pack` and test it with `npx --yes --package ./wrapper-scionos-5.2.0.tgz wrapper-scionos`. Published-user instructions remain `npm install -g wrapper-scionos` or `npx wrapper-scionos`.

Architecture details are in [docs/architecture-notes.md](./docs/architecture-notes.md).
