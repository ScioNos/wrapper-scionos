# Architecture Notes

## Boundaries

The package is split into client adapters under src/apps, CLI parsing and commands under src/cli, transport and process code under src/platform, RouterLab normalization under src/routerlab, and service-scoped credential storage under src/security.

The command registry and common option definitions are the source for parser behavior, generated help, and CLI tests. Interactive navigation is driven by one route registry with explicit parents, a shared home action, and breadcrumbs; command handlers do not own menu loops. Each command/action owns an allowlist of options and positional arguments. Usage errors are separated from runtime failures with exit codes 2 and 1. Machine output is a single success/error envelope; interactive launchers reject JSON.

## Local transport security

All HTTP listeners are loopback-only. A proxy credential is generated from 32 random bytes and must authenticate every route. Claude Desktop stores that credential in its managed profile; legacy scionos-local profiles are replaced atomically. On Linux/macOS, configuration directories are verified as 0700 and every credential-bearing JSON as 0600. Linux token persistence requires Secret Service: plaintext legacy token files are detected but never read, and a verified Secret Service write precedes their deletion. Profile writes occur only after the token is resolved and the listener is active; failure closes the listener and preserves the previous profile. Profiles and status output redact credentials.

Production service destinations are constants: `routerlab` is `https://api.routerlab.ch` and `llm` is `https://llm-api.routerlab.ch`. User URL variables are detected only to emit an ignored-value warning; they never affect routing. Gateway profiles derive their Cowork egress allowlist from the fixed service hostname or from the wrapper-generated loopback URL; wildcard egress is not written.

No CORS origin is allowed by default. Exact origins are opt-in and wildcard responses are forbidden. A matching OPTIONS preflight is answered before authentication with 204 and no resource data; every GET/POST route remains authenticated.

Request bodies are capped at 64 MiB in compressed and decompressed form. Identity, gzip, deflate, and Brotli are decoded into buffers; zstd is conditional on the Node runtime. Rewritten requests drop content-encoding and content-length. Unsupported encodings return 415, malformed compression or JSON returns 400, headers have 30 seconds and bodies 120 seconds to arrive. Generations have no total timeout. Client disconnects abort upstream work.

## Claude Code lifecycle

Claude Code uses the service selected before entering the interactive menu. The default service is `routerlab`; `--service llm` carries the LLM service, token namespace, endpoint, strategy catalog, and model environment through the same launch path. Executable discovery runs `claude --version` with a five-second limit per candidate and continues to the next candidate after a failure or timeout. Version 2.1.220 is the minimum supported release; absence, an unparseable version, or an older version is fatal before credential resolution or network access.

The LLM `claude` strategy is launchable when discovery reports `claude-opus-4-8`, `claude-sonnet-5`, and `claude-haiku-4-5-20251001`. All LLM Claude Code strategies force `CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-5`; service-scoped environment construction prevents that policy from changing the `routerlab` subagent model.

Service bases are fixed before credential use. `ANTHROPIC_BASE_URL` and service-specific base URL variables are ignored with a credential-free warning. `ANTHROPIC_AUTH_TOKEN` remains a deprecated input-token fallback. Claude Code preserves environment-before-storage token precedence and emits a credential-free warning when both token sources are present. `--token` is rejected for Claude Code before launch because process command lines are externally observable.

Model discovery occurs before proxy startup through a direct HTTP(S) transport that does not consult environment proxy variables. Every failure is fatal, including 3xx, 401/403, network, timeout, malformed response, server failure, an empty catalog, or an empty intersection with the service's authorized Claude Code models. Authentication failures report the service, token source, and matching auth recovery commands without including the token.

After strategy selection, the wrapper creates a loopback proxy with a random local credential and injects that credential, the proxy URL, and the selected model mapping only into the Claude child environment. All raw RouterLab token variables and Anthropic routing, provider, authentication, custom-header, and model-selection overrides are removed case-insensitively. `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1` prevents settings-file environment entries from replacing the managed provider, while unrelated environment needed by native tools, MCP, certificates, and networking is retained. Loopback entries are merged into both `NO_PROXY` spellings.

The proxy replaces local authentication with the service-scoped RouterLab token and enforces the verified service-wide model intersection on Messages, token-counting, and batch requests. Native `/model`, resume, and subagent selection may use any model inside that intersection. Missing, malformed, and denied model requests fail locally without upstream traffic; no model is silently substituted. Cleanup begins immediately after proxy creation, runs exactly once for child success, startup errors, and signals, waits two seconds for normal closure, then force-closes lingering connections. A cleanup failure is attached to, but never masks, an earlier child failure.

### Claude Code experimental-beta compatibility

Claude Code children always receive `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`. This is an official Claude Code gateway-compatibility control, not a wrapper-defined capability or instruction. Anthropic documents that it removes Anthropic-specific `anthropic-beta` request headers and beta tool-schema fields such as `defer_loading` and `eager_input_streaming`, while preserving standard tool fields including `name`, `description`, `input_schema`, and `cache_control`.

RouterLab exposes the Claude Messages protocol across Anthropic and non-Anthropic routed models. Keeping provider-specific experimental fields out of that common protocol avoids upstream HTTP 400 failures when a selected gateway or model does not implement them. This is a deliberate, fail-conservative interoperability decision. It does not inject a system prompt, modify user instructions, add tools, or grant Claude Code a capability.

The tradeoff is explicit: Anthropic documents that this flag disables MCP tool search and causes all MCP tools to load upfront, even when `ENABLE_TOOL_SEARCH` is set. It also prevents use of the stripped beta fields. Consequently, this variable must not be described as behavior-neutral. It is an accepted reduction of experimental behavior at the RouterLab model-transport boundary. Remove it only after RouterLab offers equivalent per-route beta capability negotiation and compatibility has been verified across every allowed model.

References:

- [Claude Code environment variables — `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`](https://code.claude.com/docs/en/env-vars)
- [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- [RouterLab API documentation](https://routerlab.ch/docs)

## Codex lifecycle

Codex CLI 0.144.1 or newer is invoked through the resolved executable or Windows shim. The same invocation builder is used for version detection and interactive launch.

Codex always connects directly to the fixed service `/v1` endpoint. There is no Codex proxy, local gateway credential, or generated model catalog. Codex presence/version is checked once before token resolution and model discovery. An explicit token is validated before any network request. User endpoint variables are ignored with warnings.

`GET /v1/models` is used only to intersect returned identifiers with the service allowlist. Every discovery failure is fatal, including 401/403, network errors, timeouts, malformed JSON, server failures, and an empty intersection. Explicit model identifiers require an exact match. Interactive launch selects among the intersection; non-interactive launch without a model requires `gpt-5.6-sol`.

Runtime overrides contain exactly six values: `model_provider`, `model`, provider `name`, provider `base_url`, `wire_api="responses"`, and `env_key="OPENAI_API_KEY"`. The RouterLab token is passed unchanged through that child-only environment variable. User sandbox, approvals, instructions, context, reasoning effort, modalities, tools, search, truncation, priorities, features, MCP settings, hooks, auth files, and other active policy remain native to Codex. npm-style Windows command shims preserve quoted TOML overrides through their `%*` forwarding layer.

Forwarded Codex arguments are validated before CLI detection, token resolution, or network access. Provider/model overrides, alternate local providers, configuration profiles, and remote app-server transports are rejected; route-neutral native arguments remain byte-for-byte unchanged. Model discovery uses manual redirect handling and treats every 3xx response as fatal so the service token is never forwarded to another origin.

The RouterLab destination invariant is scoped to model traffic configured by the wrapper: `GET /v1/models` discovery and Responses inference requests for the selected provider. It is not a process-wide network sandbox. Independent network activity owned by the official Codex binary or its user-configured native integrations—such as update checks, MCP, tools, and search—remains outside the wrapper transport boundary and is neither disabled nor modified.

`codex status` and `codex restore` retain detection and cleanup for persistent configuration and catalog files created by older releases. The current launch path writes neither. A known backup may be restored automatically, but a current `config.toml` without that backup is never deleted; legacy wrapper detection then reports `manualCleanupRequired`. The dedicated legacy model catalog remains independently removable.

An interactive non-zero Codex exit or startup exception is reported and returns to the main menu without retaining the child exit code. A successful interactive session closes the wrapper, while direct launches preserve the Codex exit code.

## Native Responses transport

Codex receives `wire_api="responses"` and calls the fixed RouterLab `/v1` endpoint directly. The wrapper neither observes nor transforms Responses requests or errors. RouterLab owns model-specific compatibility, authorization, retention, and any model change made through Codex after startup.

## Model catalog

The current Codex path has no model catalog. LiteLLM metadata may remain useful inside RouterLab, but the wrapper consumes only exact model identifiers from `/v1/models` for pre-launch availability. It never converts metadata into Codex context, instructions, reasoning, modality, tool, or search configuration.

## Credential storage

Preferred token environment variables use RouterLab names. `ANTHROPIC_AUTH_TOKEN` is a deprecated token fallback. All user-provided base URL variables are ignored with one stderr warning per variable per process.

Interactive login is masked. Auth dry-runs never prompt or mutate. auth test and strategies resolve command token, environment, then storage; Codex deliberately resolves command token, storage, then environment. macOS Keychain storage sends the secret on stdin. Logout removes both wrapper-scionos and claude-scionos entries on Windows, macOS, and Linux.

Claude Desktop _meta.json owns a schema-versioned wrapperScionos block with mode, service, strategy/strategies, and base URL. Direct profile mode is deprecated for 4.x and stores the RouterLab token in clear text; proxy mode is recommended and stores only the local credential. Proxy startup restores those values when no explicit profile option is supplied. Profile and metadata writes share atomic rollback; legacy profiles recover loopback host and port from inferenceGatewayBaseUrl.

Interactive Desktop startup computes a create/reuse/replace plan. The banner-selected service is authoritative, healthy equivalent profiles are reused, and replacement requires confirmation. SIGINT from an interactive proxy closes it and returns to the Desktop route with exit code 0; direct proxy SIGINT remains 130 and SIGTERM remains 143. Status preserves its compatibility fields while exposing applied/healthy state and stable issue codes for invalid profile, metadata, credential, or gateway state.
