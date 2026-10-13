# Architecture Notes

## Boundaries

The package is split into client adapters under src/apps, CLI parsing and commands under src/cli, transport and process code under src/platform, RouterLab normalization under src/routerlab, and service-scoped credential storage under src/security.

The command registry and common option definitions are the source for parser behavior, generated help, and CLI tests. Interactive navigation is driven by one route registry with explicit parents, a shared home action, and breadcrumbs; command handlers do not own menu loops. Each command/action owns an allowlist of options and positional arguments. Usage errors are separated from runtime failures with exit codes 2 and 1. Machine output is a single success/error envelope; interactive launchers reject JSON.

The wrapper UI supports English, French, and German through `--lang`/`--language` or `SCIONOS_LANG`/`SCIONOS_LANGUAGE`, with English as the compatibility default. Localization covers the wrapper menus, route prompts, service notice, and keyboard help; native client output remains under the control of the launched client. The full help line is used on the home route and a compact line on submenus. The LLM service alone displays a neutral availability notice because its model catalog can vary; `routerlab` does not display that notice.

The `strategies` command uses verified model availability when a token can be resolved. From an interactive invocation without a stored or environment token, it intentionally lists strategy definitions without availability checks; `--no-prompt` remains fail-closed when token resolution fails.

## Local transport security

All HTTP listeners are loopback-only. A proxy credential is generated from 32 random bytes and must authenticate every route. Claude Desktop stores that credential in its managed profile; legacy scionos-local profiles are replaced atomically. On Linux/macOS, configuration directories are verified as 0700 and every credential-bearing JSON as 0600. Linux token persistence requires Secret Service: plaintext legacy token files are detected but never read, and a verified Secret Service write precedes their deletion. Profile writes occur only after the token is resolved and the listener is active; failure closes the listener and preserves the previous profile. Profiles and status output redact credentials.

Production service destinations are constants: `routerlab` is `https://api.routerlab.ch` and `llm` is `https://llm-api.routerlab.ch`. User URL variables are detected only to emit an ignored-value warning; they never affect routing. Gateway profiles derive their Cowork egress allowlist from the fixed service hostname or from the wrapper-generated loopback URL; wildcard egress is not written.

No CORS origin is allowed by default. Exact origins are opt-in and wildcard responses are forbidden. A matching OPTIONS preflight is answered before authentication with 204 and no resource data; every GET/POST route remains authenticated.

Request bodies are capped at 64 MiB in compressed and decompressed form. Identity, gzip, deflate, and Brotli are decoded into buffers; zstd is conditional on the Node runtime. Rewritten requests drop content-encoding and content-length. Unsupported encodings return 415, malformed compression or JSON returns 400, headers have 30 seconds and bodies 120 seconds to arrive. The shared local LLM proxy separately waits up to 120 seconds for the first upstream body bytes and allows gaps of up to 120 seconds between chunks. Its total streaming duration is unlimited by default. `WRAPPER_SCIONOS_PROXY_FIRST_RESPONSE_TIMEOUT_MS`, `WRAPPER_SCIONOS_PROXY_STREAM_IDLE_TIMEOUT_MS`, and `WRAPPER_SCIONOS_PROXY_STREAM_TOTAL_TIMEOUT_MS` override these defaults in milliseconds (the last defaults to zero, disabled). The total stream clock starts with the first body chunk; headers alone do not satisfy first-response waiting. Mid-response timeout destroys the stream; before headers are sent it returns 504. All timers and abort listeners are removed on exit. Client disconnects abort upstream work.

## Claude Code lifecycle

Claude Code uses the service selected before entering the interactive menu. The default service is `routerlab`; `--service llm` carries the LLM service, token namespace, endpoint, strategy catalog, and model environment through the same launch path. Executable discovery runs `claude --version` with a five-second limit per candidate and continues to the next candidate after a failure or timeout. Version 2.1.220 is the minimum supported release; absence, an unparseable version, or an older version is fatal before credential resolution or network access.

The native RouterLab Claude strategy is launchable when discovery reports `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, and `claude-haiku-5-5`; it maps those models to Fable, Opus, Sonnet, and Haiku and uses `claude-haiku-5-5` as its default subagent. Native requires Claude Code 2.1.293 or newer, checked after strategy selection and before proxy or child startup; CI validates with 2.1.296. The RouterLab `claude-gpt` strategy requires exactly `gpt-6-astra`, `gpt-6.1-sol`, and `gpt-6-luna`; it maps Fable to Astra, Opus and Sonnet to Sol, and Haiku and the default subagent to Luna. RouterLab's `open-source` strategy requires `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`, `hy4-preview`, `kimi-k3`, `minimax-m3`, and `qwen3.8-max`; it maps DeepSeek, GLM Flash, GLM, Qwen, and Kimi to Fable, Haiku, Sonnet, Opus, and the subagent. RouterLab Trial requires `deepseek-v4.1-flash-trial`, `glm-5.3-flash-trial`, `qwen3.8-flash-trial`, `gpt-6-luna-trial`, and `MiniMax-M3-trial`; it maps Fable to DeepSeek, Haiku to GPT Luna, Sonnet to GLM, and Opus to Qwen and fixes its subagent to `deepseek-v4.1-flash-trial`. The LLM `claude` strategy is launchable when discovery reports `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, and `claude-haiku-4-5`. The LLM `claude-gpt` strategy maps Fable, Haiku, Sonnet, and Opus to `gpt-6-astra`, `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol`; `divers` maps those roles to `deepseek-v4.1-flash`, `gemini-3.8-flash`, `glm-5.3`, and `glm-5.3-flash`. Claude Code selects a verified subagent model from the service's supported list; `--subagent-model` can replace the strategy default when the strategy has no fixed subagent. The generic strategy-environment helpers retain a disabled override flag for compatibility; normal Claude Code launches use the separately validated subagent selection flow.

The RouterLab AWS strategy requires `aws-claude-opus-5-5`, `aws-claude-sonnet-5-5`, and `aws-claude-haiku-4-5`. It maps Opus and Sonnet to the AWS 5.5 routes and retains AWS Haiku 4.5 for Haiku and the default subagent. Claude Code 2.1.284 or newer is required before proxy or child startup.

Service bases are fixed before credential use. `ANTHROPIC_BASE_URL` and service-specific base URL variables are ignored with a credential-free warning. `ANTHROPIC_AUTH_TOKEN` remains a deprecated input-token fallback. Claude Code preserves environment-before-storage token precedence and emits a credential-free warning when both token sources are present. `--token` is rejected for Claude Code before launch because process command lines are externally observable.

Model discovery occurs before proxy startup through a direct HTTP(S) transport that does not consult environment proxy variables. Every failure is fatal, including 3xx, 401/403, network, timeout, malformed response, server failure, an empty catalog, or an empty intersection with the service's authorized Claude Code models. Authentication failures report the service, token source, and matching auth recovery commands without including the token.

After strategy selection, the wrapper creates a loopback proxy with a random local credential and injects that credential, the proxy URL, and the selected model mapping only into the Claude child environment. All raw RouterLab token variables and Anthropic routing, provider, authentication, custom-header, and model-selection overrides are removed case-insensitively. `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1` prevents settings-file environment entries from replacing the managed provider, while unrelated environment needed by native tools, MCP, certificates, and networking is retained. Loopback entries are merged into both `NO_PROXY` spellings.

The proxy replaces local authentication with the service-scoped RouterLab token and enforces the verified service-wide model intersection on Messages, token-counting, and batch requests. Native `/model`, resume, and subagent selection may use any model inside that intersection. Missing, malformed, and denied model requests fail locally without upstream traffic; no model is silently substituted. Cleanup begins immediately after proxy creation, runs exactly once for child success, startup errors, and signals, waits two seconds for normal closure, then force-closes lingering connections. A cleanup failure is attached to, but never masks, an earlier child failure.

### Claude Code gateway model discovery

Claude Code children receive `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=0`. The wrapper performs model discovery directly against the fixed service endpoint, intersects the verified catalogue with the service-authorized model set, and enforces that same set in the local proxy. Keeping Claude Code's own gateway discovery disabled prevents an upstream catalogue from replacing the wrapper-controlled model view.

The wrapper does not force `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`; Claude Code therefore retains its normal protocol features and beta compatibility behavior. The local proxy remains responsible for rejecting models outside the verified intersection.

References:

- [Claude Code gateway model discovery](https://code.claude.com/docs/en/llm-gateway)
- [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- [RouterLab API documentation](https://routerlab.ch/docs)

## OpenCode lifecycle

Windows validates `opencode-ai` 1.18.30 and `@opencode/cli` 2.0.27 with simulated Chat Completions and a real read-tool cycle. Detection requires a parseable version >=1.18.30 and runs `opencode --version` with isolated temporary XDG configuration, data, and cache directories so a malformed user configuration cannot make version discovery create or reuse a directory. OpenCode 2 launches with its native `--standalone` option on the root TUI or after `run`, because an existing background service cannot be relied on to consume the per-launch proxy environment. The normal child launch preserves the user's native OpenCode environment and settings while injecting only the wrapper's per-process configuration content.

The wrapper resolves the selected service and token before directly discovering `GET /v1/models` at the selected service's fixed `/v1` endpoint. The discovered identifiers are intersected with the service's authorized model set, and an optional strategy narrows that intersection again. Explicit `--model` values require an exact match; interactive selection and the no-prompt default operate only on the verified intersection. RouterLab OpenCode uses the Claude Native, AWS Claude, OpenAI GPT, Open Source, and Trial families and defaults to `gpt-6.1-sol`; RouterLab LLM retains its `gpt-5.6-sol` default. Trial uses `deepseek-v4.1-flash-trial` for Claude Code's fixed subagent, and OpenCode presents it as a normal selectable model. Discovery, authentication, network, malformed-response, and empty-intersection failures are fatal.

OpenCode is launched through a loopback proxy using the `@ai-sdk/openai-compatible` provider and `baseURL` ending in `/v1`. The proxy accepts OpenAI-compatible `/v1/chat/completions` and `/v1/responses` model traffic, replaces the local proxy credential with the service-scoped RouterLab token, strips the wrapper provider prefix from model identifiers, and rejects models outside the allowlist before upstream forwarding. The upstream RouterLab token is never placed in `OPENCODE_CONFIG_CONTENT` or the OpenCode child environment.

`OPENCODE_CONFIG_CONTENT` enables only the wrapper's `scionos` provider, selects the exact model, and describes the verified model set. It is not persisted as `opencode.json`; cleanup removes the loopback proxy and child-only credential after success, failure, or interruption. OpenCode's native TUI, `run`, sessions, tools, MCP, update checks, and other independent network behavior remain owned by the official binary. The wrapper blocks only native arguments that could replace its provider, model, or config (`-m`/`--model`, `--config`, `--config-dir`, and `--config-content`).

Updating the npm installation is native to OpenCode: `opencode upgrade --method npm` upgrades the global `opencode-ai` package without changing wrapper routing. The wrapper does not install or update OpenCode automatically.

References:

- [OpenCode providers](https://opencode.ai/docs/providers)
- [OpenCode configuration](https://dev.opencode.ai/docs/config/)
- [OpenCode CLI](https://dev.opencode.ai/docs/cli/)

## Codex lifecycle

Codex CLI 0.144.1 or newer is invoked through the resolved executable or Windows shim. The same invocation builder is used for version detection and interactive launch.

Codex always connects directly to the fixed service `/v1` endpoint. There is no Codex proxy or local gateway credential. Codex presence/version is checked once before token resolution and model discovery. An explicit token is validated before any network request. User endpoint variables are ignored with warnings.

`GET /v1/models` is used only to intersect returned identifiers with the service allowlist. Every discovery failure is fatal, including 401/403, network errors, timeouts, malformed JSON, server failures, and an empty intersection. RouterLab interactive launch first selects OpenAI GPT-6, Open Source, or Trial, then starts Codex with only that family's verified catalog. Preferred family defaults are `gpt-6.1-sol`, `deepseek-v4.1-flash`, and `deepseek-v4.1-flash-trial`; if the preferred model is absent, a TTY launch requires explicit model selection, including a singleton catalogue; a non-interactive launch fails with `--model <id>` guidance. Explicit models are never substituted. Explicit `--strategy` also selects a family. With no family or explicit model, RouterLab requires its `gpt-6.1-sol` service default. An explicit model must be available and restricts the RouterLab catalog to its family. RouterLab LLM's home-menu entry starts Codex directly with `gpt-5.6-sol`; command-line interactive launches retain family/model selection. Explicit models and service defaults require an exact discovered match.

Runtime overrides contain exactly seven values: `model_provider`, `model`, `model_catalog_json`, provider `name`, provider `base_url`, `wire_api="responses"`, and `env_key="OPENAI_API_KEY"`. The RouterLab token is passed unchanged through that child-only environment variable. User sandbox, approvals, MCP settings, hooks, auth files, and other active policy remain native to Codex. Legacy and modern npm-generated Windows command shims are resolved to their Node entry point and invoked directly, preserving quoted TOML overrides without shell expansion. Unknown `.cmd` and `.bat` shims retain the shell path but reject arguments containing quotes, percent signs, or line breaks.

Forwarded Codex arguments are validated before CLI detection, token resolution, or network access. Provider/model overrides, alternate local providers, configuration profiles, and remote app-server transports are rejected; route-neutral native arguments remain byte-for-byte unchanged. Model discovery uses manual redirect handling and treats every 3xx response as fatal so the service token is never forwarded to another origin.

The RouterLab destination invariant is scoped to model traffic configured by the wrapper: `GET /v1/models` discovery and Responses inference requests for the selected provider. It is not a process-wide network sandbox. Independent network activity owned by the official Codex binary or its user-configured native integrations—such as update checks, MCP, tools, and search—remains outside the wrapper transport boundary and is neither disabled nor modified.

`codex status` and `codex restore` retain detection and cleanup for persistent configuration and catalog files created by older releases. The current launch path never writes persistent Codex configuration. It creates only a per-launch catalog in the operating system's temporary directory and removes it after the child exits or startup fails. A known backup may be restored automatically, but a current `config.toml` without that backup is never deleted; legacy wrapper detection then reports `manualCleanupRequired`. The dedicated legacy model catalog remains independently removable.

An interactive non-zero Codex exit or startup exception is reported and returns to the main menu without retaining the child exit code. A successful interactive session closes the wrapper, while direct launches preserve the Codex exit code.

## Native Responses transport

Codex receives `wire_api="responses"` and calls the fixed RouterLab `/v1` endpoint directly. The wrapper neither observes nor transforms Responses requests or errors. RouterLab owns model-specific compatibility, authorization, retention, and any model change made through Codex after startup.

## Model catalog

After successful discovery, the wrapper generates a per-launch Codex catalog containing the ordered intersection between exact `/v1/models` identifiers and the selected service allowlist. RouterLab further restricts this catalog to the selected or inferred model family; An explicitly selected RouterLab LLM family is likewise restricted; without a family, RouterLab LLM retains its service-wide verified catalog. The launch model is the selected family model, an explicit model, or the service default (`gpt-6.1-sol` for RouterLab, `gpt-5.6-sol` for LLM). Codex `app-server` exposes the catalog through `model/list`, which feeds the native interactive `/model` selector.

RouterLab metadata is normalized into the Codex fields used for display name, description, context window, input modalities, reasoning levels, parallel tool support, web search, and related capability hints. When optional metadata is absent, the wrapper uses conservative values rather than inventing provider-specific capabilities. These defaults are metadata fallbacks only: there is no fallback model or fallback catalog when discovery fails.

The catalog is written with owner-only permissions where supported, contains no credential, and stays present only while the Codex child process is alive. Cleanup runs after successful exit, non-zero exit, and launch exceptions. `config.toml`, `auth.json`, sandbox policy, approvals, MCP configuration, profiles, and other persistent Codex settings are never modified by the current launch path.

## Credential storage

Preferred token environment variables use RouterLab names. `ANTHROPIC_AUTH_TOKEN` is a deprecated token fallback. All user-provided base URL variables are ignored with one stderr warning per variable per process.

Interactive login is masked. Auth dry-runs never prompt or mutate. auth test and strategies resolve command token, environment, then storage; Codex deliberately resolves command token, storage, then environment. macOS Keychain operations use `/usr/bin/osascript` with the native Security framework, JSON over stdin and no secret in argv. Interactive access is disabled; locked or unauthorized access fails. Writes are confirmed by a read before success, and errors report only an operation/status, never helper stdout/stderr. Each system storage operation is limited to 15 seconds with SIGKILL on expiry. The former `security add-generic-password -w` path is removed: [Apple’s implementation](https://github.com/apple-oss-distributions/Security/blob/main/SecurityTool/macOS/keychain_add.c) uses two getpass prompts instead of a reliable stdin storage interface. A dedicated macOS integration test uses a random temporary test account in both namespaces and must pass before publication. Logout removes both wrapper-scionos and claude-scionos entries on Windows, macOS, and Linux.

Commands that accept an explicit token also accept `--token-stdin`, which reads a piped token once, validates it, and refuses combination with `--token`. Inline `--token` remains supported for those commands with a deprecation warning because process arguments and shell history can expose it. Claude Code rejects both explicit token options; use masked `auth login` or a supported environment variable for that client.

Claude Desktop _meta.json owns a schema-versioned wrapperScionos block with mode, service, strategy/strategies, and base URL. Direct profile mode was removed in 5.0 because it stored the RouterLab token in clear text. Only authenticated local proxy profiles are supported, and they store only the random local credential. Proxy startup restores those values when no explicit profile option is supplied. Profile and metadata writes share atomic rollback; legacy proxy profiles recover loopback host and port from inferenceGatewayBaseUrl.

Interactive Desktop startup computes a create/reuse/replace plan. The banner-selected service is authoritative, healthy equivalent profiles are reused, and replacement requires confirmation. SIGINT from an interactive proxy closes it and returns to the Desktop route with exit code 0; direct proxy SIGINT remains 130 and SIGTERM remains 143. Status preserves its compatibility fields while exposing applied/healthy state and stable issue codes for invalid profile, metadata, credential, or gateway state.

## Release 7.3.0 validation

The [validation record](./release-7.3.0-validation.md) distinguishes Windows runs, CI preparation, profile/proxy tests and application tests. A discovered/allowlisted identifier is not a live-model compatibility result. Test inference uses fake credentials and loopback providers exclusively. Native policy settings are retained by the adapters; this is not an end-to-end validation of every native MCP, sandbox or session feature.
