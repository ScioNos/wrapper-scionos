# Architecture Notes

## Boundaries

The package is split into client adapters under src/apps, CLI parsing and commands under src/cli, transport and process code under src/platform, RouterLab normalization under src/routerlab, and service-scoped credential storage under src/security.

The command registry and common option definitions are the source for parser behavior, generated help, and CLI tests. Interactive navigation is driven by one route registry with explicit parents, a shared home action, and breadcrumbs; command handlers do not own menu loops. Each command/action owns an allowlist of options and positional arguments. Usage errors are separated from runtime failures with exit codes 2 and 1. Machine output is a single success/error envelope; interactive launchers reject JSON.

The wrapper UI supports English, French, and German through `--lang`/`--language` or `SCIONOS_LANG`/`SCIONOS_LANGUAGE`, with English as the compatibility default. Localization covers the wrapper menus, route prompts, service notice, and keyboard help; native client output remains under the control of the launched client. The full help line is used on the home route and a compact line on submenus. The LLM service alone displays a neutral availability notice because its model catalog can vary; `routerlab` does not display that notice.

## Local transport security

All HTTP listeners are loopback-only. A proxy credential is generated from 32 random bytes and must authenticate every route. Claude Desktop stores that credential in its managed profile; legacy scionos-local profiles are replaced atomically. On Linux/macOS, configuration directories are verified as 0700 and every credential-bearing JSON as 0600. Linux token persistence requires Secret Service: plaintext legacy token files are detected but never read, and a verified Secret Service write precedes their deletion. Profile writes occur only after the token is resolved and the listener is active; failure closes the listener and preserves the previous profile. Profiles and status output redact credentials.

Production service destinations are constants: `routerlab` is `https://api.routerlab.ch` and `llm` is `https://llm-api.routerlab.ch`. User URL variables are detected only to emit an ignored-value warning; they never affect routing. Gateway profiles derive their Cowork egress allowlist from the fixed service hostname or from the wrapper-generated loopback URL; wildcard egress is not written.

No CORS origin is allowed by default. Exact origins are opt-in and wildcard responses are forbidden. A matching OPTIONS preflight is answered before authentication with 204 and no resource data; every GET/POST route remains authenticated.

Request bodies are capped at 64 MiB in compressed and decompressed form. Identity, gzip, deflate, and Brotli are decoded into buffers; zstd is conditional on the Node runtime. Rewritten requests drop content-encoding and content-length. Unsupported encodings return 415, malformed compression or JSON returns 400, headers have 30 seconds and bodies 120 seconds to arrive. Generations have no total timeout. Client disconnects abort upstream work.

## Claude Code lifecycle

Claude Code uses the service selected before entering the interactive menu. The default service is `routerlab`; `--service llm` carries the LLM service, token namespace, endpoint, strategy catalog, and model environment through the same launch path. Executable discovery runs `claude --version` with a five-second limit per candidate and continues to the next candidate after a failure or timeout. Version 2.1.220 is the minimum supported release; absence, an unparseable version, or an older version is fatal before credential resolution or network access.

The native RouterLab Claude strategy is launchable when discovery reports `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5`, and `claude-haiku-4-5`; it maps those models to Fable, Opus, Sonnet, and Haiku and uses `claude-haiku-4-5` as its default subagent. The RouterLab `claude-gpt` strategy requires `gpt-6-astra`, `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol`; it maps Fable, Haiku, Sonnet, and Opus to those models and uses `gpt-5.6-luna` as its default subagent. RouterLab's `open-source` strategy requires `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`, `hy4-preview`, `kimi-k3`, `minimax-m3`, and `qwen3.8-max`; it maps DeepSeek, GLM Flash, GLM, Qwen, and Kimi to Fable, Haiku, Sonnet, Opus, and the subagent respectively. RouterLab Trial requires `deepseek-v4.1-trial`, `gemini-3.8-flash-trial`, `glm-5.3-flash-trial`, `MiniMax-M3-trial`, `qwen3.8-max-trial`, and `deepseek-v4.1-flash`; it maps the Trial models to Fable, Haiku, Sonnet, and Opus and fixes its subagent to `deepseek-v4.1-flash`, with no subagent override. The LLM `claude` strategy is launchable when discovery reports `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, and `claude-haiku-4-5`. The LLM `claude-gpt` strategy maps Fable, Haiku, Sonnet, and Opus to `gpt-6-astra`, `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol`; `divers` maps those roles to `deepseek-v4.1-flash`, `gemini-3.8-flash`, `glm-5.3`, and `glm-5.3-flash`. An explicitly selected and verified `--subagent-model` replaces the strategy default for the launched Claude Code child when that strategy allows an override.

Service bases are fixed before credential use. `ANTHROPIC_BASE_URL` and service-specific base URL variables are ignored with a credential-free warning. `ANTHROPIC_AUTH_TOKEN` remains a deprecated input-token fallback. Claude Code preserves environment-before-storage token precedence and emits a credential-free warning when both token sources are present. `--token` is rejected for Claude Code before launch because process command lines are externally observable.

Model discovery occurs before proxy startup through a direct HTTP(S) transport that does not consult environment proxy variables. Every failure is fatal, including 3xx, 401/403, network, timeout, malformed response, server failure, an empty catalog, or an empty intersection with the service's authorized Claude Code models. Authentication failures report the service, token source, and matching auth recovery commands without including the token.

After strategy selection, the wrapper creates a loopback proxy with a random local credential and injects that credential, the proxy URL, and the selected model mapping only into the Claude child environment. All raw RouterLab token variables and Anthropic routing, provider, authentication, custom-header, and model-selection overrides are removed case-insensitively. `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1` prevents settings-file environment entries from replacing the managed provider, while unrelated environment needed by native tools, MCP, certificates, and networking is retained. Loopback entries are merged into both `NO_PROXY` spellings.

The proxy replaces local authentication with the service-scoped RouterLab token and enforces the verified service-wide model intersection on Messages, token-counting, and batch requests. Native `/model`, resume, and subagent selection may use any model inside that intersection. Missing, malformed, and denied model requests fail locally without upstream traffic; no model is silently substituted. Cleanup begins immediately after proxy creation, runs exactly once for child success, startup errors, and signals, waits two seconds for normal closure, then force-closes lingering connections. A cleanup failure is attached to, but never masks, an earlier child failure.

### Claude Code gateway model discovery

Claude Code children receive `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=0`. The wrapper performs model discovery directly against the fixed service endpoint, intersects the verified catalogue with the service-authorized model set, and enforces that same set in the local proxy. Keeping Claude Code's own gateway discovery disabled prevents an upstream catalogue from replacing the wrapper-controlled model view.

The wrapper does not force `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`; Claude Code therefore retains its normal protocol features and beta compatibility behavior. The local proxy remains responsible for rejecting models outside the verified intersection.

The tradeoff is explicit: Anthropic documents that this flag disables MCP tool search and causes all MCP tools to load upfront, even when `ENABLE_TOOL_SEARCH` is set. It also prevents use of the stripped beta fields. Consequently, this variable must not be described as behavior-neutral. It is an accepted reduction of experimental behavior at the RouterLab model-transport boundary. Remove it only after RouterLab offers equivalent per-route beta capability negotiation and compatibility has been verified across every allowed model.

References:

- [Claude Code gateway model discovery](https://code.claude.com/docs/en/llm-gateway)
- [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- [RouterLab API documentation](https://routerlab.ch/docs)

## OpenCode lifecycle

OpenCode 1.18.30 is the supported npm-installed legacy CLI path (`opencode-ai`). Detection runs `opencode --version` with isolated temporary XDG configuration, data, and cache directories so a malformed user configuration cannot make version discovery create or reuse a directory. The normal child launch preserves the user's native OpenCode environment and settings while injecting only the wrapper's per-process configuration content.

The wrapper resolves the selected service and token before directly discovering `GET /v1/models` at the selected service's fixed `/v1` endpoint. The discovered identifiers are intersected with the service's authorized model set, and an optional strategy narrows that intersection again. Explicit `--model` values require an exact match; interactive selection and the no-prompt default operate only on the verified intersection. RouterLab OpenCode uses the Claude Native, AWS Claude, OpenAI GPT, Open Source, and Trial families and defaults to `gpt-5.6-sol`, as does RouterLab LLM. Trial includes `deepseek-v4.1-flash` for Claude Code's fixed subagent, but OpenCode presents it as a normal selectable model. Discovery, authentication, network, malformed-response, and empty-intersection failures are fatal.

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

`GET /v1/models` is used only to intersect returned identifiers with the service allowlist. Every discovery failure is fatal, including 401/403, network errors, timeouts, malformed JSON, server failures, and an empty intersection. From the interactive home menu, Codex is launched directly and its native `/model` selector consumes the temporary verified catalog; explicit `--strategy` launches may still constrain the catalog to a family. Explicit model identifiers require an exact match. Launches without a model start on `gpt-6-sol` for RouterLab or `gpt-5.6-sol` for RouterLab LLM; the service-specific default must be available.

Runtime overrides contain exactly seven values: `model_provider`, `model`, `model_catalog_json`, provider `name`, provider `base_url`, `wire_api="responses"`, and `env_key="OPENAI_API_KEY"`. The RouterLab token is passed unchanged through that child-only environment variable. User sandbox, approvals, MCP settings, hooks, auth files, and other active policy remain native to Codex. npm-style Windows command shims preserve quoted TOML overrides through their `%*` forwarding layer.

Forwarded Codex arguments are validated before CLI detection, token resolution, or network access. Provider/model overrides, alternate local providers, configuration profiles, and remote app-server transports are rejected; route-neutral native arguments remain byte-for-byte unchanged. Model discovery uses manual redirect handling and treats every 3xx response as fatal so the service token is never forwarded to another origin.

The RouterLab destination invariant is scoped to model traffic configured by the wrapper: `GET /v1/models` discovery and Responses inference requests for the selected provider. It is not a process-wide network sandbox. Independent network activity owned by the official Codex binary or its user-configured native integrations—such as update checks, MCP, tools, and search—remains outside the wrapper transport boundary and is neither disabled nor modified.

`codex status` and `codex restore` retain detection and cleanup for persistent configuration and catalog files created by older releases. The current launch path never writes persistent Codex configuration. It creates only a per-launch catalog in the operating system's temporary directory and removes it after the child exits or startup fails. A known backup may be restored automatically, but a current `config.toml` without that backup is never deleted; legacy wrapper detection then reports `manualCleanupRequired`. The dedicated legacy model catalog remains independently removable.

An interactive non-zero Codex exit or startup exception is reported and returns to the main menu without retaining the child exit code. A successful interactive session closes the wrapper, while direct launches preserve the Codex exit code.

## Native Responses transport

Codex receives `wire_api="responses"` and calls the fixed RouterLab `/v1` endpoint directly. The wrapper neither observes nor transforms Responses requests or errors. RouterLab owns model-specific compatibility, authorization, retention, and any model change made through Codex after startup.

## Model catalog

After successful discovery, the wrapper generates a per-launch Codex catalog containing only the ordered intersection between exact `/v1/models` identifiers and the selected service allowlist. The RouterLab default, `gpt-6-sol`, or the RouterLab LLM default, `gpt-5.6-sol`, is passed as the launch model. An explicitly selected model replaces it. Codex `app-server` exposes the catalog through `model/list`, which feeds the native interactive `/model` selector.

RouterLab metadata is normalized into the Codex fields used for display name, description, context window, input modalities, reasoning levels, parallel tool support, web search, and related capability hints. When optional metadata is absent, the wrapper uses conservative values rather than inventing provider-specific capabilities. These defaults are metadata fallbacks only: there is no fallback model or fallback catalog when discovery fails.

The catalog is written with owner-only permissions where supported, contains no credential, and stays present only while the Codex child process is alive. Cleanup runs after successful exit, non-zero exit, and launch exceptions. `config.toml`, `auth.json`, sandbox policy, approvals, MCP configuration, profiles, and other persistent Codex settings are never modified by the current launch path.

## Credential storage

Preferred token environment variables use RouterLab names. `ANTHROPIC_AUTH_TOKEN` is a deprecated token fallback. All user-provided base URL variables are ignored with one stderr warning per variable per process.

Interactive login is masked. Auth dry-runs never prompt or mutate. auth test and strategies resolve command token, environment, then storage; Codex deliberately resolves command token, storage, then environment. macOS Keychain storage sends the secret on stdin. Logout removes both wrapper-scionos and claude-scionos entries on Windows, macOS, and Linux.

Claude Desktop _meta.json owns a schema-versioned wrapperScionos block with mode, service, strategy/strategies, and base URL. Direct profile mode was removed in 5.0 because it stored the RouterLab token in clear text. Only authenticated local proxy profiles are supported, and they store only the random local credential. Proxy startup restores those values when no explicit profile option is supplied. Profile and metadata writes share atomic rollback; legacy proxy profiles recover loopback host and port from inferenceGatewayBaseUrl.

Interactive Desktop startup computes a create/reuse/replace plan. The banner-selected service is authoritative, healthy equivalent profiles are reused, and replacement requires confirmation. SIGINT from an interactive proxy closes it and returns to the Desktop route with exit code 0; direct proxy SIGINT remains 130 and SIGTERM remains 143. Status preserves its compatibility fields while exposing applied/healthy state and stable issue codes for invalid profile, metadata, credential, or gateway state.
