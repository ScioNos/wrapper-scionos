# Architecture Notes

## Boundaries

The package is split into client adapters under src/apps, CLI parsing and commands under src/cli, transport and process code under src/platform, RouterLab normalization under src/routerlab, and service-scoped credential storage under src/security.

The command registry and common option definitions are the source for parser behavior, generated help, and CLI tests. Interactive navigation is driven by one route registry with explicit parents, a shared home action, and breadcrumbs; command handlers do not own menu loops. Each command/action owns an allowlist of options and positional arguments. Usage errors are separated from runtime failures with exit codes 2 and 1. Machine output is a single success/error envelope; interactive launchers reject JSON.

## Local transport security

All HTTP listeners are loopback-only. A proxy credential is generated from 32 random bytes and must authenticate every route. Claude Desktop stores that credential in its managed profile; legacy scionos-local profiles are replaced atomically. On Linux/macOS, configuration directories are verified as 0700 and every credential-bearing JSON as 0600. Profile writes occur only after the token is resolved and the listener is active; failure closes the listener and preserves the previous profile. Profiles and status output redact credentials.

Service base URLs are resolved and validated as absolute HTTP(S) URLs before credential resolution, listener creation, or profile mutation. Gateway profiles derive their Cowork egress allowlist from the validated gateway hostname; wildcard egress is not written.

No CORS origin is allowed by default. Exact origins are opt-in and wildcard responses are forbidden. A matching OPTIONS preflight is answered before authentication with 204 and no resource data; every GET/POST route remains authenticated.

Request bodies are capped at 64 MiB in compressed and decompressed form. Identity, gzip, deflate, and Brotli are decoded into buffers; zstd is conditional on the Node runtime. Rewritten requests drop content-encoding and content-length. Unsupported encodings return 415, malformed compression or JSON returns 400, headers have 30 seconds and bodies 120 seconds to arrive. Generations have no total timeout. Client disconnects abort upstream work.

## Claude Code lifecycle

Claude Code uses the service selected before entering the interactive menu. The default service is `routerlab`; `--service llm` carries the LLM service, token namespace, endpoint, strategy catalog, and model environment through the same launch path. Executable discovery runs `claude --version` with a five-second limit per candidate and continues to the next candidate after a failure or timeout.

The LLM `claude` strategy is launchable when discovery reports `claude-opus-4-8`, `claude-sonnet-5`, and `claude-haiku-4-5-20251001`. All LLM Claude Code strategies force `CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-5`; service-scoped environment construction prevents that policy from changing the `routerlab` subagent model.

Service bases are resolved with source metadata and validated as HTTP(S) before credential use. Service-specific environment values are preferred, while `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` remain deprecated 4.x fallbacks. Claude Code preserves environment-before-storage token precedence and emits a credential-free warning when both are present. Endpoint overrides are also disclosed on stderr.

Model discovery occurs before proxy startup. A 401/403 is fatal and reports the service, token source, and matching auth recovery commands without including the token. Network, timeout, malformed-response, and non-authentication server failures retain the existing unverified-availability fallback.

After strategy selection, the wrapper creates a loopback proxy with a random local credential and injects that credential, the proxy URL, and the selected model mapping only into the Claude child environment. The proxy replaces local authentication with the service-scoped RouterLab token. Cleanup begins immediately after proxy creation, runs for child success, startup errors, and signals, waits two seconds for normal closure, then force-closes lingering connections.

## Codex lifecycle

Codex CLI 0.144.1 or newer is invoked through the resolved executable or Windows shim. The same invocation builder is used for version detection and interactive launch.

The default path is a session-local Responses proxy. The direct path is diagnostic only. Codex presence/version is checked once before token resolution, network discovery, proxy startup, or catalog creation. The resolved service base is validated as HTTP(S), and an explicit token is validated before any network request. Environment endpoint overrides are disclosed without exposing credentials.

Model-discovery 401/403 responses are fatal and provide service-scoped auth recovery commands. A successful discovery must contain the selected model in the wrapper-supported Codex catalog; the runtime catalog is restricted to the compatible models verified by the service. Network, timeout, malformed-response, and non-authentication server failures retain the conservative static-catalog fallback.

Runtime overrides are limited to provider identity, base URL, model, wire API, token environment key, temporary model catalog, and the session-only `web_search="disabled"` compatibility guard. User sandbox, approvals, reasoning effort, features, MCP settings, hooks, auth files, and other active policy remain untouched. The native Responses catalog omits freeform custom tools; edits use `shell_command`. Hosted search is disabled by the top-level session override because `supports_search_tool` is not the hosted-search gate. npm-style Windows command shims preserve quoted TOML overrides through their `%*` forwarding layer.

Cleanup surrounds the entire token/network/proxy/catalog/argument/child lifecycle with nullable resources. The active catalog and proxy are removed after normal exit, creation failure, launch error, SIGINT, or SIGTERM. Catalogs older than 24 hours are removed before a new one is created.

An interactive non-zero Codex exit or startup exception is reported and returns to the main menu without retaining the child exit code. A successful interactive session closes the wrapper, while direct launches preserve the Codex exit code.

## Native Responses transport

Every model exposed by the RouterLab and RouterLab LLM services is forwarded to `/v1/responses` without semantic conversion, for both streaming and non-streaming requests. Codex receives `wire_api="responses"`. RouterLab owns the model-specific compatibility contract; no protocol-conversion fallback or model classification remains in the wrapper.

The proxy authenticates its local client, replaces the local credential with the service-scoped upstream token, and forces `store: false` in rewritten Responses JSON. Direct mode performs no wrapper rewrite; Codex CLI 0.144.6 sends `store: false` for non-Azure custom Responses providers, without defining the upstream retention policy. Only rewritten request bodies lose `content-encoding` and `content-length`; true hop-by-hop headers and every header named by `Connection` are removed in both directions. Unmodified upstream responses retain `Content-Encoding` and `Content-Length`. Intercepted gzip, deflate, Brotli, or zstd errors are decoded with the decompressed-size limit before Responses-compatible normalization and contextual 401/403 diagnostics.

Custom HTTP(S) service bases retain their pathname. Appending `/v1/responses` to `/gateway` yields `/gateway/v1/responses`; a base already ending in `/v1` is deduplicated. Client query strings are retained.

## Model catalog

RouterLab model metadata is normalized into context, modalities, reasoning, parallel function-call, freeform, hosted-tool, and search capabilities. Presence flags distinguish explicit values from normalizer defaults so an ID-only response can use the known-model manifest. The wrapper never clones an arbitrary Codex models_cache.json entry.

Known-model context fallbacks intentionally mirror cc-switch's conservative Codex presets: GPT-5.6 uses 372,000 tokens; DeepSeek V4 Pro and MiniMax M3 use 1,000,000; Kimi K2.7 Code uses 262,144; GLM-5.2 uses 200,000; Kimi K3 uses 1,048,576; and Grok 4.5 uses 500,000. They are RouterLab compatibility assumptions rather than provider-public maxima, and explicit verified RouterLab metadata wins. Unknown models retain the conservative 128k text-only sequential fallback. Catalog windows use a 95% effective budget. DeepSeek V4 Pro and GLM-5.2 are text-only; GPT-5.6, Kimi K2.7 Code, Kimi K3, Grok 4.5, and MiniMax M3 expose image input. GPT-5.6, Grok 4.5, and MiniMax M3 enable parallel tool calls in the static manifest.

The native profile deliberately omits `apply_patch_tool_type`, `web_search_tool_type`, `tools`, and `model_messages`, matching cc-switch's compatibility strategy for Responses gateways that reject Codex custom tools. `shell_type="shell_command"` remains available for edits, `supports_search_tool` remains false, and the independent hosted-search path is disabled with the temporary top-level `web_search="disabled"` override.

## Credential storage

Preferred service environment variables use RouterLab names. Anthropic token and base URL names are 4.x compatibility fallbacks with one stderr warning per process.

Interactive login is masked. Auth dry-runs never prompt or mutate. auth test and strategies resolve command token, environment, then storage; Codex deliberately resolves command token, storage, then environment. macOS Keychain storage sends the secret on stdin. Logout removes both wrapper-scionos and claude-scionos entries on Windows, macOS, and Linux.

Claude Desktop _meta.json owns a schema-versioned wrapperScionos block with mode, service, strategy/strategies, and base URL. Direct profile mode is deprecated for 4.x and stores the RouterLab token in clear text; proxy mode is recommended and stores only the local credential. Proxy startup restores those values when no explicit profile option is supplied. Profile and metadata writes share atomic rollback; legacy profiles recover loopback host and port from inferenceGatewayBaseUrl.

Interactive Desktop startup computes a create/reuse/replace plan. The banner-selected service is authoritative, healthy equivalent profiles are reused, and replacement requires confirmation. SIGINT from an interactive proxy closes it and returns to the Desktop route with exit code 0; direct proxy SIGINT remains 130 and SIGTERM remains 143. Status preserves its compatibility fields while exposing applied/healthy state and stable issue codes for invalid profile, metadata, credential, or gateway state.
