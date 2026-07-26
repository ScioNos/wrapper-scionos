# Migrating from wrapper-scionos 3.x to 4.0

> Historical 4.x guide. Its Codex proxy and transport-option guidance does not describe 5.0; see [migration-5.0-codex.md](./migration-5.0-codex.md).

## Before upgrading

Install Node.js ^22.13.0 or >=23.5.0. Codex users must install Codex CLI 0.144.1 or newer.

    npm install -g wrapper-scionos@4

## Entry commands

The existing global and npx entry commands are unchanged. Global options may appear before or after the command: `wrapper-scionos --service llm doctor` and `wrapper-scionos doctor --service llm` are equivalent. The proxy is now the default Codex transport. Use --direct only to diagnose a proxy-specific problem.

## Deprecated compatibility

These inputs still work throughout 4.x but warn once on stderr:

- --proxy;
- --transport proxy or direct;
- ANTHROPIC_AUTH_TOKEN;
- ANTHROPIC_BASE_URL;
- --list-strategies (use strategies);
- auth change (use auth login);
- claude-desktop apply (removed in 5.0; use apply-proxy).

Move to the RouterLab environment variables documented in the README. Replace --transport direct with --direct and remove redundant proxy flags.

## Claude Desktop migration

A 3.x local mapping may contain the shared scionos-local secret. In 5.0, Claude Desktop is proxy-only: `claude-desktop apply` is refused because direct profiles persist the RouterLab token. Use `apply-proxy --yes`; the direct token is never reused.

You can migrate explicitly before starting the proxy:

    wrapper-scionos claude-desktop apply-proxy --service routerlab --yes

The standalone proxy refuses to start if no wrapper-managed profile exists. Schema-v2 profiles persist the fixed service, strategies, canonical loopback origin, and verified model routes without the RouterLab token. A valid v1 proxy profile is migrated after live model rediscovery while retaining its random local credential. Direct, unmanaged, or metadata-less profiles require explicit replacement or official restoration.

The RouterLab token is resolved and the listener starts before any profile change. A missing token, cancellation, occupied port, or failed profile write leaves the old profile unchanged; a newly opened listener is closed on write failure. On Linux/macOS, credential directories and JSON files are verified as `0700` and `0600`, including rollback results; failure is closed.

All GET/POST routes require authentication and browser origins are denied unless explicitly allowed. Only an exact-origin CORS OPTIONS preflight may return 204 without a token; it returns no resource data. Compressed request bodies support gzip, deflate, Brotli, and runtime-conditional zstd with 64 MiB limits before and after decoding.

## Codex behavior changes

Codex launch no longer forces workspace-write, on-request approvals, high reasoning, or a persistent storage option. Your active Codex policy remains authoritative except for hosted search: each RouterLab session receives the temporary `web_search="disabled"` compatibility override, without modifying the user's `config.toml`.

Proxy mode rewrites Responses requests with `store: false`. Direct mode performs no wrapper rewrite; Codex CLI 0.144.6 itself sends `store: false` to non-Azure custom Responses providers. Neither statement defines RouterLab's contractual retention policy.

The catalog no longer copies the local Codex cache. Missing RouterLab metadata yields a conservative 128k text-only entry. Temporary catalogs older than 24 hours are purged automatically.

All RouterLab and RouterLab LLM models now use native `/v1/responses` with `wire_api="responses"`, for streaming and non-streaming requests. RouterLab provides the functional model compatibility; the wrapper no longer classifies models or performs protocol translation. It still forces `store: false`, replaces local authentication with the upstream token, and supplies temporary catalogs and contextual errors. Custom HTTP(S) `*_BASE_URL` path prefixes are retained and a trailing `/v1` is deduplicated.

## Tokens

The --token option now reaches Claude Code, auth test, and strategies. For the latter two it overrides environment and storage; Codex keeps storage ahead of environment unless --token is supplied. Avoid it on shared machines because command lines can be recorded. auth login uses a masked prompt, auth login/logout --dry-run never mutates, and auth logout deletes both current and legacy namespaces.

Linux file fallback writes verify `0700` directories and `0600` token files and fail closed when that cannot be guaranteed.

The installed scionos command is an alias of wrapper-scionos. Non-interactive --json emits a single stable envelope. Exit codes are 0 success/preview, 1 runtime, 2 usage, and 130 interruption.
