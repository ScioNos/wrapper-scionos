# Architecture Notes

## Boundaries

The package is split into client adapters under src/apps, CLI parsing and commands under src/cli, transport and process code under src/platform, RouterLab normalization under src/routerlab, and service-scoped credential storage under src/security.

The command registry and common option definitions are the source for parser behavior, generated help, and CLI tests. Interactive navigation is driven by one route registry with explicit parents, a shared home action, and breadcrumbs; command handlers do not own menu loops. Each command/action owns an allowlist of options and positional arguments. Usage errors are separated from runtime failures with exit codes 2 and 1. Machine output is a single success/error envelope; interactive launchers reject JSON.

## Local transport security

All HTTP listeners are loopback-only. A proxy credential is generated from 32 random bytes and must authenticate every route. Claude Desktop stores that credential in its managed profile; legacy scionos-local profiles are replaced atomically. On Linux/macOS, configuration directories are verified as 0700 and every credential-bearing JSON as 0600. Profile writes occur only after the token is resolved and the listener is active; failure closes the listener and preserves the previous profile. Profiles and status output redact credentials.

No CORS origin is allowed by default. Exact origins are opt-in and wildcard responses are forbidden. A matching OPTIONS preflight is answered before authentication with 204 and no resource data; every GET/POST route remains authenticated.

Request bodies are capped at 64 MiB in compressed and decompressed form. Identity, gzip, deflate, and Brotli are decoded into buffers; zstd is conditional on the Node runtime. Rewritten requests drop content-encoding and content-length. Unsupported encodings return 415, malformed compression or JSON returns 400, headers have 30 seconds and bodies 120 seconds to arrive. Generations have no total timeout. Client disconnects abort upstream work.

## Codex lifecycle

Codex CLI 0.144.1 or newer is invoked through the resolved executable or Windows shim. The same invocation builder is used for version detection and interactive launch.

The default path is a session-local Responses proxy. The direct path is diagnostic only. Codex presence/version is checked before token resolution, network discovery, proxy startup, or catalog creation. Runtime overrides are limited to provider identity, base URL, model, wire API, token environment key, and temporary model catalog. User sandbox, approvals, reasoning effort, features, MCP settings, hooks, auth files, web-search mode, and other active policy remain untouched. supports_search_tool is true only for explicit RouterLab model metadata.

Cleanup surrounds the entire token/network/proxy/catalog/argument/child lifecycle with nullable resources. The active catalog and proxy are removed after normal exit, creation failure, launch error, SIGINT, or SIGTERM. Catalogs older than 24 hours are removed before a new one is created.

## Native Responses transport

Every model exposed by the RouterLab and RouterLab LLM services is forwarded to `/v1/responses` without semantic conversion, for both streaming and non-streaming requests. Codex receives `wire_api="responses"`. RouterLab owns the model-specific compatibility contract; no protocol-conversion fallback or model classification remains in the wrapper.

The proxy authenticates its local client, replaces the local credential with the service-scoped upstream token, and forces `store: false` in rewritten Responses JSON. Only rewritten request bodies lose `content-encoding` and `content-length`; true hop-by-hop headers and every header named by `Connection` are removed in both directions. Unmodified upstream responses retain `Content-Encoding` and `Content-Length`. Intercepted gzip, deflate, Brotli, or zstd errors are decoded with the decompressed-size limit before Responses-compatible normalization and contextual 401/403 diagnostics.

Custom HTTP(S) service bases retain their pathname. Appending `/v1/responses` to `/gateway` yields `/gateway/v1/responses`; a base already ending in `/v1` is deduplicated. Client query strings are retained.

## Model catalog

RouterLab model metadata is normalized into context, modalities, reasoning, parallel function-call, freeform, hosted-tool, and search capabilities. The wrapper never clones an arbitrary Codex models_cache.json entry.

Missing or insufficient metadata uses a conservative manifest: 128k, text only, sequential function tools, medium reasoning, and no unverified vision, search, hosted tools, freeform, or parallel calls.

## Credential storage

Preferred service environment variables use RouterLab names. Anthropic token and base URL names are 4.x compatibility fallbacks with one stderr warning per process.

Interactive login is masked. Auth dry-runs never prompt or mutate. auth test and strategies resolve command token, environment, then storage; Codex deliberately resolves command token, storage, then environment. macOS Keychain storage sends the secret on stdin. Logout removes both wrapper-scionos and claude-scionos entries on Windows, macOS, and Linux.

Claude Desktop _meta.json owns a schema-versioned wrapperScionos block with mode, service, strategy/strategies, and base URL. Direct profile mode is deprecated for 4.x and stores the RouterLab token in clear text; proxy mode is recommended and stores only the local credential. Proxy startup restores those values when no explicit profile option is supplied. Profile and metadata writes share atomic rollback; legacy profiles recover loopback host and port from inferenceGatewayBaseUrl.
