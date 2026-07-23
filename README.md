# wrapper-scionos

ScioNos command-line wrapper for RouterLab-backed Claude Code, Claude Desktop, and Codex CLI.

[Lire en français](./README.fr.md)

## Requirements

- Node.js ^22.13.0 or >=23.5.0.
- A service-scoped RouterLab token.
- Claude Code for Claude Code launches.
- Codex CLI >=0.144.1 for Codex launches.
- Windows, macOS, or claude-desktop-debian on Linux for Claude Desktop profiles.

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
    ROUTERLAB_BASE_URL
    ROUTERLAB_LLM_BASE_URL
    WRAPPER_SCIONOS_ROUTERLAB_TOKEN
    WRAPPER_SCIONOS_LLM_TOKEN
    WRAPPER_SCIONOS_ROUTERLAB_BASE_URL
    WRAPPER_SCIONOS_LLM_BASE_URL

ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL remain accepted during 4.x and emit one deprecation warning on stderr. A custom `*_BASE_URL` keeps its path prefix: `/gateway` followed by a Responses request becomes `/gateway/v1/responses`; a trailing `/v1` is deduplicated. Only HTTP(S) bases are accepted.

Secure storage reads both wrapper-scionos and the legacy claude-scionos namespace; logout deletes both. On Linux, the file fallback creates directories as `0700` and verifies token files as `0600`, failing closed if those permissions cannot be guaranteed.

auth login uses a masked prompt. The --token option works with all clients, including auth test and strategies. Their token order is --token, service environment variable, then secure storage. Claude Code warns when an environment token masks an available stored token but preserves that order for compatibility. Codex intentionally keeps its special order of --token, secure storage, then environment. A token passed on the command line may remain visible in shell history and process inspection.

## Claude Code

Claude Code is launched through a loopback proxy. Wrapper-owned credentials and model mappings are injected only into the child process; unknown arguments after -- are forwarded to Claude Code. CLI detection gives each `claude --version` candidate five seconds before trying the next executable.

    wrapper-scionos claude-code --service routerlab --strategy aws -- -p "Summarize this repository"

For `--service llm`, the `claude` strategy is active and maps Opus to `claude-opus-4-8`, Sonnet to `claude-sonnet-5`, and Haiku to `claude-haiku-4-5-20251001`. Claude Code subagents use `claude-sonnet-5` for every LLM strategy.

Claude Code validates the selected service base as HTTP(S) before resolving or sending a token. Environment-provided base URL overrides are printed on stderr, and legacy `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL` values remain accepted with their 4.x deprecation warning.

An HTTP 401/403 from model discovery stops the launch before the local proxy or Claude child starts. The error identifies the token source without exposing it and prints service-specific `auth status`, `auth test`, and `auth login` commands. Network, timeout, invalid-response, and other non-authentication discovery failures remain warnings; the user may continue with unverified model availability.

The proxy has no total generation timeout and closes its upstream request if the client disconnects. Cleanup starts as soon as the proxy is created, waits up to two seconds for normal shutdown, then force-closes lingering local connections.

## Claude Desktop

The recommended mode is the authenticated local mapping proxy. Direct profile application remains compatible throughout 4.x but is deprecated and scheduled for removal in 5.0:

    wrapper-scionos claude-desktop apply --service routerlab --dry-run
    wrapper-scionos claude-desktop apply --service routerlab --yes

Recommended local mapped proxy:

    wrapper-scionos claude-desktop apply-proxy --service llm --yes
    wrapper-scionos claude-desktop proxy --service llm

`claude-desktop apply` persists the RouterLab token in clear text inside the Desktop profile and emits one explicit warning per process. On Linux/macOS, every credential-bearing JSON is verified as `0600` and its configuration directory as `0700`; failure is fatal. `apply-proxy` stores only a local random credential in that profile and is the normal mode.

apply-proxy resolves the RouterLab token and starts listening before it writes the profile. A missing token, cancellation, occupied port, or profile-write failure leaves the previous profile intact and closes any newly opened listener. It writes a random 32-byte base64url credential and versioned wrapperScionos metadata atomically. A later proxy command with no explicit profile options restores the stored service, strategy list, loopback host, and port. Divergent explicit options are refused until the profile is rewritten with apply-proxy --yes or the proxy command is repeated with --yes. Legacy profiles recover host/port from inferenceGatewayBaseUrl, use the CLI-selected service with a warning, and gain v4 metadata on the next application. A 3.x scionos-local credential is replaced automatically before listening.

From the interactive menu, Start Local Mapping uses the service shown in the banner. A missing profile is created immediately, an equivalent healthy profile is reused without rotating its local credential, and replacement of a different, direct, legacy, or unhealthy profile requires confirmation. The stored host and port are preserved unless explicitly overridden; changing services refreshes the service-specific mapping catalog.

The selected service base URL is validated before a token is resolved, a listener opens, or a profile changes. Generated profiles allow Cowork egress only to their exact gateway hostname. `claude-desktop status` keeps the existing fields and also reports `profileExists`, `applied`, `healthy`, and stable `issues` codes without exposing credentials.

The proxy binds only to loopback. Every GET/POST route, including /v1/models, requires the profile credential. Browser origins are rejected by default. An exact HTTP(S) origin can be allowed with repeatable --allow-origin; only a matching CORS OPTIONS preflight may return 204 without authentication, and it exposes no data. Wildcard CORS is never emitted.

Requests are limited to 64 MiB both before and after decompression. Identity, gzip, deflate, and Brotli bodies are accepted; zstd is accepted when the active Node runtime exposes it, otherwise HTTP 415 unsupported_content_encoding is returned. Invalid JSON returns HTTP 400. Header receipt is limited to 30 seconds and body receipt to 120 seconds. Long generations have no total timeout.

When the proxy was started from the interactive menu, Ctrl+C stops it and returns to the Claude Desktop submenu without leaving a failure exit code. For the direct `claude-desktop proxy` command, Ctrl+C terminates with exit code 130; SIGTERM terminates with 143 in both modes.

## Codex CLI

The default Codex path is the session-local proxy:

    wrapper-scionos codex launch --service routerlab
    wrapper-scionos codex launch --service llm

The Codex catalogs are restricted to these models, in menu order:

- `routerlab`: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-v4-pro`, `kimi-k2.7-code`, `glm-5.2`.
- `llm`: `gpt-5.6-sol`, `gpt-5.6-luna`, `gpt-5.6-terra`, `kimi-k3`, `grok-4.5`, `MiniMax-M3`.

Before resolving a token or opening the proxy, Codex validates the selected service endpoint as HTTP(S) and validates an explicit `--token`. An HTTP 401/403 from model discovery stops the launch with service-specific `auth status`, `auth test`, and `auth login` guidance. If discovery succeeds, the requested or default model must be present in the verified Codex-compatible service catalog; otherwise the wrapper lists the available models and refuses to launch. Network, timeout, invalid-response, and other non-authentication discovery failures remain warnings and use the conservative local catalog.

For diagnostics only, --direct bypasses the proxy:

    wrapper-scionos codex launch --service llm --direct

The wrapper passes provider, model, base URL, wire API, temporary catalog, and `web_search="disabled"` overrides for the Codex session. The search override is never written to the user's Codex configuration. The wrapper does not override the user's sandbox, approval policy, reasoning effort, MCP configuration, features, hooks, or authentication files. Like cc-switch's native Responses profile, the catalog does not advertise the freeform `apply_patch` tool; file edits use `shell_command`, which native gateways accept. Hosted web search is disabled by the explicit session override rather than inferred from catalog metadata.

In proxy mode, outgoing Responses requests are rewritten with `store: false` and have their top-level `metadata` field removed for upstream compatibility. This rewrite is limited to Codex Responses traffic and does not affect Claude. In direct mode the wrapper does not rewrite the body; Codex CLI 0.144.6 itself sends `store: false` to non-Azure custom Responses providers. These request fields are not contractual guarantees about the upstream provider's retention policy.

When Codex is selected from the interactive menu, a startup failure or non-zero Codex exit reports the error and returns to the main menu. A normal Codex exit closes the wrapper. Direct `codex launch` commands preserve the Codex process exit code.

The temporary model catalog is generated from normalized upstream metadata, and explicit verified RouterLab values take precedence. When only model IDs are available, known models intentionally use conservative cc-switch-derived context profiles: GPT-5.6 at 372,000 tokens, DeepSeek V4 Pro and MiniMax M3 at 1,000,000, Kimi K2.7 Code at 262,144, GLM-5.2 at 200,000, Kimi K3 at 1,048,576, and Grok 4.5 at 500,000. These fallback values are RouterLab compatibility assumptions, not claims about each provider's public maximum. Unknown IDs retain the conservative 128k, text-only, sequential fallback. Codex receives 95% of each context window as its effective budget. Catalog files older than 24 hours are removed at startup and the active catalog is removed when Codex exits.

Every RouterLab and RouterLab LLM model is sent unchanged to the native `/v1/responses` endpoint with `wire_api="responses"`, for streaming and non-streaming requests. RouterLab provides model-level Responses compatibility; the wrapper performs no protocol translation. It retains local authentication, upstream token replacement, `store: false`, temporary catalogs, and contextual 401/403 diagnostics. Relayed compressed responses keep their encoding and length, while intercepted compressed errors are decoded safely before normalization.

codex template prints a non-persistent template. codex restore exists only to recover a configuration written by an older wrapper release.

## 4.x compatibility

The following remain accepted throughout 4.x and warn once per process on stderr:

- --proxy
- --transport proxy or --transport direct
- ANTHROPIC_AUTH_TOKEN
- ANTHROPIC_BASE_URL
- --list-strategies (use strategies)
- auth change (use auth login)
- claude-desktop apply (use claude-desktop apply-proxy)

Prefer the default proxy, --direct for diagnostics, and the RouterLab environment names above. See [Migrating from 3.x](./docs/migration-4.0.md).

## Development and release checks

    npm test
    npm run test:codex-real
    npm run test:coverage
    npm run test:entry-modes
    npm audit
    npm pack --dry-run

`npm run test:entry-modes` packs the current working tree into a temporary tarball, installs it in an isolated prefix, then opens and exits the interactive menu through `wrapper-scionos`, `wrapper-scionos --service llm`, `npx wrapper-scionos`, and `npx wrapper-scionos --service llm`. It does not require a global installation or a previously published npm version.

`npm test` also performs isolated end-to-end Claude Code, Claude Desktop, and Codex launches for `routerlab` and `llm`. Fake client executables and local upstreams verify menu selection, service propagation, child-only credential injection, local-to-upstream token replacement, authentication failures, model availability, proxy cleanup, and Windows npm shim forwarding without contacting RouterLab production endpoints. `npm run test:codex-real` is an opt-in smoke test that runs the installed Codex CLI against a loopback-only fake Responses server with temporary config and catalog files; it never contacts RouterLab. Coverage gates remain 85% for lines/functions and 80% for branches.

For an unpublished build, create a local tarball with `npm pack` and test it with `npx --yes --package ./wrapper-scionos-4.2.0.tgz wrapper-scionos`. Published-user instructions remain `npm install -g wrapper-scionos` or `npx wrapper-scionos`.

Architecture details are in [docs/architecture-notes.md](./docs/architecture-notes.md).
