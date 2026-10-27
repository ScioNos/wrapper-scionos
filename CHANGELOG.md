# Changelog

All notable changes to this project will be documented in this file.

## 8.0.0-beta.1 - 2026-10-27

### Changed

- Made the active interface language visible in the console header and added `L`/Home language selection for English, French and German in both menus. Changes apply to the current session and launch prompts without changing the selected service, models or direct-command defaults. The AWS family label uses `💸 Claude via AWS`.
- Added the structured terminal console with persistent service/token context, Home, Launch, Desktop applications, Account & access, and Diagnostics. Navigation uses a sidebar from 100 columns, a top row below that, and a linear fallback for small, incompatible, or redirected terminals.
- Interactive Claude Code, Codex and OpenCode sessions return home after success, failure or interruption. Direct commands retain their output and exit-code contracts. The terminal is released before native execution and restored afterward.
- Added paginated keyboard controls, English/French/German text, explicit recovery for unavailable saved choices, and background local inspection without repeated network polling.
- Separated launch preparation from execution. Prepared capabilities expose public catalogue data; execution refreshes credentials and discovery before creating resources or spawning clients.
- Desktop proxy sessions remain active while navigating. The console supports start, stop, model-family editing, configured routes and confirmed official-mode restoration. Stopping or exiting preserves the applied profile; only console-owned proxies are stopped.

### Added

- Clickable terminal navigation, tool/model selectors, checkboxes, confirmations and language control, with wheel scrolling and clickable pagination. Keyboard controls remain available, including over SSH; `SCIONOS_MOUSE=0` disables capture. Mouse reporting is removed before native execution and restored on return. Windows OS input reads are stopped while clients run and the duplicated input handle closes only on final shutdown, avoiding stolen keys and pending Q-only exits.
- Six separate Home entries retaining shortcuts 1–4 and adding 5 for Claude Cowork and 6 for Codex App. Claude Desktop/Cowork retain their shared profile; Codex App has independent actions, status and per-service preferences.
- `codex-app status|launch|restore` (default status), preview-only dry runs and explicit `--yes` activation/recovery. Windows package-identity and macOS bundle detection validate the embedded engine; Linux reports unsupported. Codex App uses direct Responses with a verified family catalogue and durable secure-store command authentication.
- TOML 1.0 AST-directed text patches preserve unrelated settings, MCP configuration, comments, BOM and line endings. Dated backup, private write-ahead recovery journal, owner lock, optimistic concurrency checks and atomic writes protect the shared configuration. Shutdown restores the owned group together, preserving unrelated edits and refusing conflicting personal changes. Abrupt-stop recovery requires explicit restoration.
- Interactive App exit offers graceful close, leave-open restoration or cancellation, without forced application termination. SIGTERM and noninteractive exit restore while leaving the app open. Runtime helpers and catalogues remain available to open apps after restoration.
- Embedded-engine integration check against an isolated home and loopback Responses provider, covering native catalogue loading, secure-store auth without RouterLab environment variables, tool execution and a follow-up turn. No production configuration is activated by this test.
- Optional per-service/client launch preferences in `~/.wrapper-scionos/ui-state.json`, written atomically only after successful process creation. No tokens, journals or validation state are persisted; unreadable or unwritable preferences do not block the console.
- Regression coverage for keyboard navigation, resizing, preferences, preparation/execution, unavailable models, proxy ownership, interruption and terminal cleanup. Historical 7.3.0 cross-platform results remain separate from the 8.0.0 validation record.

## 7.3.0 - 2026-10-13

### Fixed

- Replaced the shared proxy's 120-second total request cap with independent first-body-byte and resettable inactivity deadlines (both 120 seconds by default). Total streaming duration is unlimited by default and explicitly configurable. Claude Code, OpenCode, and the shared Desktop/Cowork proxy use the same settings; Codex remains direct.
- Removed Codex's silent first-model substitution when a selected family's preferred model is missing. Interactive launches require a choice, including for a single available model; non-interactive launches require `--model`. Explicit unavailable models still fail. Every explicitly selected family limits the temporary native catalogue.
- Replaced macOS `security add-generic-password -w` prompting with stdin-only writes, bounded operations and write/read verification. New entries use the native Security helper; existing security-owned entries retain their ACLs and use hex stdin batch updates. Real macOS tests passed for native UTF-8 round trips, current/legacy entries, updates and deletion. The old stdin command returned success but failed its value round trip on the runner.
- OpenCode 2 uses its native private `--standalone` server to consume per-launch proxy configuration. The 2.0.27 shared-service failure was reproduced before any upstream request; 1.18.30 and 2.0.27 checks passed on Windows, macOS and Linux, including streaming and a real read-tool cycle. Test workspaces use canonical paths and matching PWD/INIT_CWD to preserve native directory permissions.
- Bounded process-tree termination, test subprocesses and interruption tests. Cleanup preserves original failures, attempts every resource cleanup, verifies recursive targets and retries temporary Windows locks. Redirected timeout checks wait for a writing grandchild before starting their deadline; startup has its own bound.
- Preserved client failures when Codex catalogue or OpenCode proxy cleanup also fails.

### Documentation and validation

- Updated English, French and German documentation for persistent Desktop/Cowork profiles, model selection, token storage/transmission, proxy settings, tested client versions and the difference between discovery and inference validation.
- Removed unsubstantiated price/savings claims from current documentation and AWS selection labels.
- Validated Windows/macOS/Linux CI: all 37 jobs passed across supported Node boundary versions and configured release lines, including minimum/recent OpenCode, real macOS Keychain and retained security/coverage assertions.
- Added a release validation record, compatibility matrix and scoped factual claims for the future article. Release references: [v7.3.0](https://github.com/ScioNos/wrapper-scionos/releases/tag/v7.3.0) and [npm 7.3.0](https://www.npmjs.com/package/wrapper-scionos/v/7.3.0). Desktop/Cowork application checks remain outside the validated scope.

## 7.2.0 - 2026-10-12

### Changed

- Aligned RouterLab Codex with the shared OpenAI GPT and Trial catalogues: `gpt-6.1-sol` is the GPT and launch default, and `deepseek-v4.1-flash-trial` is the Trial family default.
- Updated the RouterLab Trial strategy to DeepSeek V4.1 Flash Trial, GLM 5.3 Flash Trial, Qwen 3.8 Flash Trial, GPT 6 Luna Trial, and MiniMax M3 Trial. Its fixed subagent now uses `deepseek-v4.1-flash-trial`.
- Updated RouterLab OpenAI GPT to `gpt-6-astra` (Fable), `gpt-6.1-sol` (Opus and Sonnet), and `gpt-6-luna` (Haiku and default subagent). RouterLab OpenCode uses `gpt-6.1-sol` as its default to match this shared catalogue.
- Updated RouterLab AWS Claude to `aws-claude-opus-5-5` and `aws-claude-sonnet-5-5`, retaining `aws-claude-haiku-4-5` for Haiku and the default subagent. The AWS strategy requires Claude Code 2.1.284 or newer.
- Updated RouterLab Claude Native to Sonnet 5.5 (`claude-sonnet-5-5`) and Haiku 5.5 (`claude-haiku-5-5`), including the default Claude Code subagent and model-discovery requirements. Fable 5.1 and Opus 5.5 remain the Native models.
- Claude Native requires Claude Code 2.1.293 or newer; CI validates with Claude Code 2.1.296.
- RouterLab Codex prompts for OpenAI GPT-6, Open Source, or Trial before launch. Its native `/model` selector is limited to the selected family's verified models.
- Updated the AWS Claude menu discount to 40% and renamed the Desktop entry to `Claude Desktop / Cowork`.

### Fixed

- Fixed Codex launches through modern npm-generated Windows command shims: quoted runtime overrides are now forwarded directly to the Node entry point without shell expansion.
- Aligned regression tests with the updated service catalogues, default Codex model, Trial strategy, and Claude model mappings.
- Hardened local proxy authentication, loopback binding, supported upstream paths, request timeouts, and model-discovery response limits.
- Serialized Claude Desktop profile mutations and improved rollback and secure-storage failure reporting.
- Excluded test files from coverage explicitly so Node 22 and Node 24 enforce thresholds against shipped code.
- Corrected Markdown formatting, translated documentation, generated CLI option descriptions, and current Codex family-selection instructions.

### Added

- Added `--token-stdin` for commands that accept a token; inline `--token` now emits a warning about process listings and shell history.
- Added real OpenCode integration checks to CI and the release verification command.

## 7.1.0 - 2026-09-25

### Added

- Added grouped RouterLab Codex model catalogues: OpenAI GPT (`gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`), Open Source (`deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`, `hy4-preview`, `kimi-k3`, `minimax-m3`, `qwen3.8-max`), and Trial (`deepseek-v4.1-trial`, `gemini-3.8-flash-trial`, `glm-5.3-flash-trial`, `MiniMax-M3-trial`, `qwen3.8-max-trial`).
- Added the RouterLab Trial strategy to Claude Code and OpenCode. Claude Code maps Trial models to Fable, Haiku, Sonnet, and Opus and fixes the subagent to `deepseek-v4.1-flash`.

### Changed

- Updated Claude Code RouterLab Native to `claude-fable-5-1` and `claude-opus-5-5`; aligned its OpenAI GPT and Open Source strategies with the new RouterLab model catalogues.
- Set the RouterLab Codex no-prompt default to `gpt-6-sol`; OpenCode and RouterLab LLM keep `gpt-5.6-sol`.

## 7.0.0 - 2026-09-13

### Breaking Changes

- Rebuilt the interactive wrapper around a single main menu with explicit numeric keys, consistent back/quit controls, and service selection fixed for the whole session.
- Codex no longer shows a wrapper family/model menu when launched from the home screen; it starts Codex directly with the verified temporary catalog so the native `/model` selector controls model choice.
- Removed the obsolete Codex routing flags `--direct`, `--proxy`, and `--transport` from the supported interface.
- Replaced outdated model identifiers and strategies with the current service-scoped catalogues. Existing scripts selecting removed models or old strategy names must be updated.

### Added

- Added OpenCode CLI routing through the RouterLab service selected by `--service`, with verified model discovery, model selection, and loopback proxy isolation.
- Added wrapper interface localization for English, French, and German through `--lang`/`--language` or `SCIONOS_LANG`/`SCIONOS_LANGUAGE`.
- Added the current RouterLab and RouterLab LLM model catalogues, including `gpt-6-astra`, `deepseek-v4.1-flash`, `gemini-3.8-flash`, `glm-5.3`, and `glm-5.3-flash` where authorized by the service.
- Added a neutral LLM availability notice and compact submenu keyboard help.

### Changed

- Claude Code RouterLab Native now uses `claude-fable-5.1`; RouterLab LLM Native keeps `claude-fable-5` and exposes the `claude`, `claude-gpt`, and `divers` strategies.
- Codex and OpenCode use `gpt-5.6-sol` as their no-prompt default when it is discovered and authorized; no model is silently substituted.
- Claude Code forces `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=0` for the child process and no longer forces `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`.
- Updated tests and documentation for the service-scoped model intersections, native client behavior, keyboard controls, and multilingual menus.

## 6.0.2 - 2026-09-09

### Fixed

- Removed `deepseek-v4-flash-0731` from the Claude Code subagent choices for the default `routerlab` service because its upstream route rejects Claude Code tool schemas. The RouterLab LLM service and the main-model DeepSeek strategies remain unchanged.

## 6.0.1 - 2026-09-09

### Fixed

- Fixed explicit Claude Code subagent model selection for the default `routerlab` service. A selected model such as `deepseek-v4-flash-0731` is now passed to the Claude Code child instead of being replaced by the strategy default.
- Preserved the existing selected-subagent behavior for `--service llm` and documented the corrected service-scoped behavior.

## 6.0.0 - 2026-08-27

### Breaking Changes

- Removed `glm-5.2` from the default RouterLab Claude Code, Claude Desktop, and Codex catalogues. Scripts selecting the former `glm-5.2` strategy or model must select a replacement.
- Removed `glm-5.2`, `deepseek-v4-pro-0813`, `deepseek-v4-flash-0731`, and `grok-4.6` from the RouterLab LLM main-model catalogues for Claude Code, Claude Desktop, and Codex. `deepseek-v4-flash-0731` remains available as a Claude Code subagent model.

### Added

- Added the RouterLab LLM `glm-5.3` strategy as the second Claude Code choice, routing Opus and Sonnet to `glm-5.3` and Haiku/subagents to `glm-5.3-flash`. Both models are also available in Claude Desktop and Codex, and `glm-5.3-flash` is available in the Claude Code subagent picker.
- Added `qwen3.8-max`, `glm-5.3-flash`, `grok-4.6`, and `gemini-3.7-flash` to the default RouterLab Claude Code and Codex catalogues. The Claude Desktop RouterLab catalogue mirrors the same additions.
- Added explicit Codex runtime catalog metadata for `glm-5.3`, `glm-5.3-flash`, `qwen3.8-max`, `grok-4.6`, and `gemini-3.7-flash`.

### Fixed

- Marked `kimi-k3` as supporting its documented 1,048,576-token context.
- Preserved Claude Code's 1M mode and normalized compatible decorated requests such as `kimi-k3[1m]` to the RouterLab identifier `kimi-k3` before forwarding. Batch requests are normalized consistently.

## 5.3.0 - 2026-08-21

### Added

- Added `kimi-k3` model strategy to RouterLab LLM (`--service llm`) for Claude Code (`--strategy kimi-k3`), Claude Desktop proxy routing (`claude-kim3`), and Codex CLI allowlist.

## 5.2.0 - 2026-08-18

### Added

- Added `grok-4.6` model strategy to RouterLab LLM (`--service llm`) and exposed it in the Claude Desktop routing catalog as `claude-rok4.6` and in Codex CLI allowlist.
- Added combined `deepseek` (DeepSeek V4) strategy across both services (`routerlab` and `llm`), mapping Opus and Sonnet to `deepseek-v4-pro-0813`, and Haiku/subagents to `deepseek-v4-flash-0731`.
- Added `kimi-k3` and `deepseek-v4-pro-0813` to default `routerlab` service for Claude Code, Claude Desktop (`claude-kim3`, `claude-deev4-pro-0813`), and Codex CLI allowlist.
- Added interactive and CLI subagent model selection (`--subagent-model <id>`) to the default `routerlab` service (`claude-haiku-4-5`, `aws-claude-haiku-4-5`, `deepseek-v4-flash-0731`, `gpt-5.6-luna`), matching the behavior of `--service llm`.

### Changed

- Updated default Claude Native Haiku model identifier from `claude-haiku-4-5-20251001` to `claude-haiku-4-5` across all strategy environments and Desktop routes.
- Removed deprecated `grok-4.5` model.

## 5.1.0 - 2026-08-09

### Changed

- Refreshed the Codex catalogues. RouterLab now offers `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-v4-flash-0731`, `kimi-k3`, `glm-5.2`, and `minimax-m3`; RouterLab LLM additionally offers `qwen3.8-max` and `grok-4.5`.
- Updated Claude Code routes: RouterLab AWS now uses `aws-claude-opus-5`, `aws-claude-sonnet-5`, and `aws-claude-haiku-4-5`; its DeepSeek and Kimi routes now use `deepseek-v4-flash-0731` and `kimi-k3`.
- Updated the RouterLab LLM Claude strategy to map Custom and Haiku to `claude-fable-5`, Opus to `claude-opus-5`, and Sonnet to `claude-sonnet-5`. It now supports explicit subagent selection among `claude-haiku-4-5`, `deepseek-v4-flash-0731`, and `gpt-5.6-luna`.
- Aligned the Claude Desktop RouterLab catalogue with the current Claude Code routes.
- Replaced the LLM availability warning with the softer `MODEL AVAILABILITY — AVAILABLE MODELS MAY VARY` notice.
- Upgraded `chalk` from 5.6.2 to 6.0.0. The project already requires Node.js 22.13 or newer, which satisfies Chalk 6's Node.js 22 minimum.

## 5.0.0 - 2026-07-28

### Breaking Changes

- Codex now connects directly to the fixed RouterLab Responses endpoint; the wrapper-managed Codex proxy, local gateway credential, and `--direct`/`--proxy`/`--transport` flags are removed.
- Claude Desktop is proxy-only; direct profiles that persisted RouterLab credentials are refused and require explicit replacement or official restoration.
- Every Codex model-discovery failure, including an empty authorized intersection, prevents launch. There is no discovery or model fallback.

### Codex

- Added a temporary, service-scoped Codex model catalog so `/model` displays only the currently discovered and allowlisted RouterLab models. The catalog is loaded at startup, remains available for the session, and is deleted when Codex exits.
- Codex launch supplies seven runtime overrides: provider, selected model, temporary catalog path, provider name, fixed base URL, Responses wire API, and the child-only `OPENAI_API_KEY` source. It never modifies `~/.codex/config.toml` or Codex authentication files.
- Catalog entries use normalized `/v1/models` metadata for display names, context, reasoning, modalities, instructions, parallel tools, and search support. Conservative values fill missing metadata fields only; they do not bypass failed discovery.
- The RouterLab LLM Codex list is now `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `grok-4.5`, and `MiniMax-M3`; `kimi-k3` was removed.
- Added `minimax-m3` to the RouterLab Codex model allowlist.

### Claude Code and Desktop

- Claude Code and Claude Desktop fail closed on model discovery, enforce verified model intersections locally, sanitize child credentials and routing, and reject redirect or provider-bypass paths.
- RouterLab LLM Claude Native maps Opus to `claude-opus-5`, Sonnet to `claude-sonnet-5`, Haiku to `claude-haiku-4-5`, and all LLM subagents to `claude-haiku-4-5`.
- Aligned the RouterLab Claude Desktop catalogue with Claude Code: four Claude Native models plus AWS, GPT, DeepSeek, Kimi, GLM, and `minimax-m3` routes.
- Corrected the RouterLab Claude Code Kimi strategy to use the exact `kimi-k2.7-code` model identifier.
- Corrected Claude Code token-recovery guidance so it no longer recommends the unsupported `--token` option.

### Security and Release

- Production RouterLab destinations are immutable, local listeners are authenticated loopback-only services, and Linux persistence requires Secret Service.
- Replaced the former do-not-use LLM alert with a limited-availability notice: `ROUTERLAB LLM — SOME FEATURES MAY BE LIMITED`.
- Hardened CI with read-only permissions, immutable current GitHub Action revisions, and cancellation of superseded runs.
- Added both real Claude Code and minimum-version Codex CLI smoke tests to the release gate and cross-platform CI.
- Removed obsolete 4.x migration and internal archive documents from the published package.

## [5.0.0-alpha.1] - 2026-07-25

### Breaking Changes

#### Codex Integration Refactoring

- **BREAKING**: Removed the Codex proxy, local gateway credential, temporary `model_catalog_json`, and all wrapper-generated behavioral metadata.
- **BREAKING**: Removed Codex `--direct`, `--proxy`, and `--transport`; Codex now always connects directly to the selected official RouterLab `/v1` endpoint.
- **BREAKING**: User-provided service base URL variables are ignored with a warning. Production destinations are fixed to `https://api.routerlab.ch` and `https://llm-api.routerlab.ch`.
- LLM service model list: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `kimi-k3`, `grok-4.5`, `MiniMax-M3` (6 models).
- **BREAKING**: All `/v1/models` discovery failures and empty allowlist intersections now prevent Codex launch; there is no fallback catalog or silent model substitution.

### Changed

- `/v1/models` is used only to intersect exact identifiers with the service-scoped Codex allowlist.
- Codex runtime injection is limited to six native routing settings; the RouterLab token is passed unchanged as child-only `OPENAI_API_KEY`.
- Interactive launch selects among currently available allowlisted models, while `--no-prompt` without a model requires `gpt-5.6-sol`.
- RouterLab service model list unchanged (6 models).
- Context, instructions, reasoning, modalities, tools, search, truncation, priorities, sandbox, approvals, MCP, hooks, and auth behavior are left to native Codex.
- Claude Code and Claude Desktop retain their dedicated local proxies and internally generated `ANTHROPIC_BASE_URL`.
- Release checks no longer execute the full unit suite twice; coverage uses normal Node test isolation and the real Codex check remains explicit.

### Migration

See [docs/migration-5.0-codex.md](docs/migration-5.0-codex.md) for detailed migration guide.

## 4.2.1 - 2026-07-23

### Fixed

- Removed the top-level Responses request `metadata` field in the Codex session proxy to support upstream providers that reject this standard field. The rewrite is limited to proxied Codex `/responses` requests; Claude traffic and direct Codex transport remain unchanged.

## 4.2.0 - 2026-07-21

### Added

- Added an opt-in real-Codex smoke test that runs the installed CLI against an isolated loopback Responses server and validates the generated catalog, tool profile, reasoning, parallel calls, and `store: false` without contacting RouterLab.

### Changed

- Updated the Codex `routerlab` and `llm` catalogs to their requested six-model menus, with `gpt-5.6-sol` as the default for both services.
- Kept the conservative cc-switch-derived Codex context and modality fallbacks, while aligning reasoning levels and GPT-5.6 parallel-tool support with Codex 0.144.6 and official provider documentation.
- Switched generated Codex catalogs to cc-switch's native Responses tool profile: file edits use `shell_command`, freeform `apply_patch` and inherited model-message declarations remain omitted, and hosted `web_search` is disabled with a temporary session override.
- Re-enabled the RouterLab LLM Claude Code `claude` strategy with `claude-opus-4-8`, `claude-sonnet-5`, and `claude-haiku-4-5-20251001`, and moved every LLM Claude Code subagent mapping to `claude-sonnet-5`.

## 4.1.0 - 2026-07-16

### Added

- End-to-end Claude Code launch coverage for the interactive `routerlab` and `llm` entry modes, using an isolated fake Claude CLI and local upstream so tests never contact production services.
- End-to-end Codex CLI launch coverage for both interactive services, including npm-style Windows shim forwarding, service-scoped catalogs, local credential replacement, `store: false`, cleanup, and pre-launch failures.
- Regression coverage for rejected credentials, legacy Anthropic environment variables, invalid service URLs, explicit token validation, unavailable model discovery, executable detection timeouts, and bounded proxy shutdown.
- End-to-end Claude Desktop menu coverage for both services, including profile metadata, authenticated model discovery, upstream token replacement, model routing, and interactive proxy shutdown.
- Claude Desktop status health fields for applied state, profile validity, metadata validity, gateway credentials, and gateway URL diagnostics.

### Changed

- Claude Code now validates HTTP(S) service endpoints before token use, reports environment-provided endpoint overrides, and warns when an environment token takes precedence over a stored service token without printing either credential.
- RouterLab `/v1/models` authorization failures now stop Claude Code before proxy or child-process startup and include service-specific `auth status`, `auth test`, and `auth login` guidance. Non-authentication discovery failures remain warnings and allow a launch with unverified availability.
- Claude CLI version detection is limited to five seconds per executable candidate. Claude Code proxy cleanup now surrounds the full proxy/child lifecycle and force-closes lingering connections after a two-second grace period.
- Codex now validates HTTP(S) service endpoints and explicit tokens before network or proxy startup, stops on model-discovery authorization failures, and rejects a selected model that is absent from a verified service catalog. Non-authentication discovery failures retain the conservative catalog fallback.
- Interactive Codex failures now report their exit or startup error and return to the main menu, while direct `codex launch` commands preserve the Codex child exit code.
- Claude Desktop validates service endpoints before token resolution, listener startup, or profile writes. Generated profiles now restrict Cowork egress to the exact gateway hostname instead of a wildcard.
- Interactive Start Local Mapping reuses an equivalent profile without rotating its credential and asks before replacing a different, legacy, direct, or unhealthy profile. The service selected at wrapper startup remains authoritative.
- Ctrl+C now stops an interactively launched Claude Desktop proxy and returns to the Desktop menu with a successful exit state; direct proxy commands retain exit code 130.

### Fixed

- Made branding assertions independent of ANSI color and terminal hyperlink sequences, including coverage runs with forced color output.
- Prevented invalid or non-HTTP(S) RouterLab base URLs from creating a listener or mutating Claude Desktop configuration.
- Prevented an interactive Claude Desktop proxy stop from leaving process exit code 130 while continuing to display menus.
- Preserved quoted TOML overrides through npm-style Windows `.cmd` shims instead of stripping the quotes before Codex receives them.
- Made coverage checks compatible with the documented Node.js 22.13 minimum while retaining single-process coverage on runtimes that support it.
- Made the four entry-mode smoke tests install and execute the current package tarball in isolation instead of requiring a global installation or resolving a previously published npm version.

## 4.0.0 - 2026-07-11

### Added

- Interactive cross-platform smoke coverage for the four documented global/npx entry modes, including Windows npm shim resolution.
- Native `/v1/responses` transport for every RouterLab and RouterLab LLM model, in streaming and non-streaming modes, with no protocol-conversion fallback.
- Dynamic normalized model capabilities with a conservative 128k text-only fallback.
- Random per-profile Claude Desktop proxy credentials, authenticated model catalog, exact-origin CORS allowlists, request limits, abort propagation, and automatic legacy-secret migration.
- Node.js and Codex CLI minimum-version checks, stale catalog cleanup, 3.x migration guide, and cross-platform release workflow.
- Stable one-document JSON output, per-command CLI validation, versioned Claude Desktop mapping metadata, compressed request decoding, and the scionos binary alias.
- Strict Linux/macOS 0700 configuration directories and verified 0600 credential JSON/token files, plus fail-closed atomic rollback.

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- Restored the Codex proxy as the default transport and retained --direct for diagnostics.
- Preserved active Codex sandbox, approval, reasoning, feature, MCP, hook, authentication, and web-search policy; search capability is exposed only from explicit model metadata.
- Made --token effective for Claude Code and masked interactive login.
- Sent macOS Keychain secrets by stdin and made logout remove current and legacy namespaces on all platforms.
- Centralized CLI command and option metadata, accepted global options before or after commands, and restricted authenticated HTTP listeners to loopback with credentials protected on disk.
- Restored stored Claude Desktop service, strategies, host, and port on proxy restart; exact allowed CORS preflights are handled before auth while all GET/POST routes remain authenticated.
- Preserved compressed passthrough response encoding/length, decoded intercepted compressed errors within the 64 MiB limit, and accepted gzip, deflate, Brotli, and conditional zstd request bodies.
- Made auth test and strategies honor --token before environment/storage and made Auth dry-run non-mutating.
- Fixed Windows npm `.cmd` argument quoting so Codex TOML overrides retain quotes without leaking caret characters.
- Fixed the RouterLab LLM Claude Code subagent identifier from sonnet-4-6 to claude-sonnet-4-6; RouterLab keeps aws-claude-haiku-4-5-20251001, and the interactive/CLI override remains removed.
- Marked the RouterLab LLM Claude strategy as maintenance-only so it remains visible but cannot be selected.
- Removed the `claude-` prefix from non-Claude RouterLab LLM upstream model ids such as `gpt-5.5`, `glm-5.2`, `qwen3.7-max`, `MiniMax-M3`, and `deepseek-v4-pro`.
- Replaced the RouterLab Codex CLI catalog with `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-v4-pro`, `kimi-k2.7-code`, and `glm-5.2`; `gpt-5.6-sol` is now the default.
- Updated RouterLab Claude Code routing to force Claude Fable 5, Sonnet 5, and Opus 4.8 for the default strategy; RouterLab uses GPT 5.6 Sol/Terra/Luna, while LLM OpenAI uses Sol Pro/Sol/Terra Pro; and single-model DeepSeek V4 Pro, GLM 5.2, and Kimi K2.7 strategies.
- Reordered the LLM Codex catalogue to GPT 5.6 Sol Pro, Terra Pro, Sol, Terra, GLM 5.2, Qwen 3.7 Max, and MiniMax M3; removed GPT 5.5 and obsolete API-unavailable notices.

### Deprecated

- --proxy, --transport, --list-strategies, auth change, claude-desktop apply, ANTHROPIC_AUTH_TOKEN, and ANTHROPIC_BASE_URL remain accepted during 4.x with one warning per process on stderr. Direct Desktop mode stores its RouterLab token in clear text and is removable in 5.0; apply-proxy is recommended.

## 3.2.2 - 2026-07-07

### Fixed

- Improved Codex upstream 401/403 diagnostics for RouterLab Responses requests, including service, model, upstream URL, and token-source guidance.
- Enriched RouterLab `/v1/responses` authorization errors so failures from `https://api.routerlab.ch` are no longer reported as opaque local proxy failures.

## 3.2.1 - 2026-07-07

### Added

- Added RouterLab-specific environment variables for tokens and base URLs: `ROUTERLAB_API_KEY`, `ROUTERLAB_LLM_API_KEY`, `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, plus explicit `WRAPPER_SCIONOS_*` aliases.

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- Kept `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` as legacy fallbacks while preferring RouterLab-specific environment variables.
- Changed Codex token resolution to prefer the wrapper-stored service token over legacy environment tokens, avoiding stale `ANTHROPIC_AUTH_TOKEN` values during proxied Codex launches.
- Improved Auth and Doctor diagnostics to show token source and environment key information.

## 3.2.0 - 2026-06-23

### Added

- Expanded Codex compatibility to `glm-5.2`, `qwen3.7-max`, `MiniMax-M3`, `deepseek-v4-pro`, `deepseek-v4-flash`, `kimi-k2.7-code`, and `glm-5.1`.
- Added normalized streaming lifecycle, usage propagation, error handling, and Codex-compatible reasoning options for those models.

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- Changed `codex launch` to use the wrapper-managed local proxy by default, matching the Claude Code launch flow.
- Kept `--direct` and `--transport direct|proxy` as compatibility/debug paths while removing `--transport proxy` from normal user guidance.
- Package version promoted from `3.1.2` to `3.2.0`.

## 3.1.2 - 2026-06-21

### Fixed

- Added required Codex model catalog fallback fields so fresh Debian installs without `models_cache.json` can parse the RouterLab catalog.

## 3.1.1 - 2026-06-21

### Fixed

- Made Codex CLI launches always generate a temporary RouterLab model catalog, even when the local Codex `models_cache.json` file does not exist.
- Changed the interactive Auth menu to use the service selected by `--service` instead of prompting for the service before every action.
- Added a Linux token-file fallback when Secret Service/`secret-tool` is unavailable.

## 3.1.0 - 2026-06-17

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- Changed Codex CLI launches to connect directly to RouterLab by default with runtime `-c` provider overrides and `OPENAI_API_KEY`.
- Kept the v3 Codex proxy path as an explicit `--transport proxy` fallback.
- Updated the RouterLab LLM strategy catalog to remove OpenAI GPT special price, replace `glm-5.1` with `glm-5.2`, and route GLM through `claude-glm-5.2`.
- Reordered RouterLab LLM strategies as Claude, OpenAI GPT, GLM 5.2, Qwen 3.7 Max, MiniMax M3, and DeepSeek V4.
- Made all RouterLab LLM strategies accept `--subagent-model`, including Qwen 3.7 Max and MiniMax M3.
- Curated the RouterLab LLM Codex model catalog to `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `glm-5.2`, `qwen3.7-max`, `MiniMax-M3`, and `deepseek-v4-pro`.
- Renamed the Claude DeepSeek strategy to `deepseek-v4` and replaced `Kimi K2.6` with `kimi-k2.7-code`.

## 3.0.0 - 2026-06-13

### Added

- Added a shared long-running local LLM proxy for RouterLab-backed clients.
- Added resilient stream forwarding for Claude Code, Claude Desktop proxy mode, and Codex CLI launches.

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- Claude Code and Codex CLI launches now route through the local long-running proxy before RouterLab.
- Claude Desktop proxy mode now reuses the shared long-running proxy transport.
- Long LLM generations and irregular agent/subagent streams are handled without crashing on Undici body timeouts.
- Package version promoted from `2.5.0` to `3.0.0`.

### Removed

- Removed `claude-fable-5` from RouterLab and RouterLab LLM strategy catalogs.

## 2.5.0 - 2026-06-10

### Added

- Added a runtime Codex CLI model catalog for `codex launch`, derived from non-Claude Claude Code strategy routes.
- Added shared RouterLab model metadata used by both Codex CLI catalogs and Claude Desktop mappings.

### Removed

- Removed the `codex apply` user-facing flow because persistent rewrites of Codex `config.toml` can overwrite unrelated user settings.
- Removed the interactive Codex CLI submenu; selecting Codex CLI from the main menu now launches Codex directly.

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- Changed `applyCodexConfig` into a compatibility preview path that no longer writes persistent Codex files.
- Changed Windows Codex launching to call `codex` through PATH, matching the user terminal and avoiding absolute npm shim path issues.
- Changed Codex runtime provider overrides to use dotted `-c` keys so Codex parses `model_providers.custom` as a provider struct.
- Split CLI handlers into per-command modules behind a small command registry.
- Split the monolithic test file into domain-focused test files.
- Package version promoted from `2.2.0` to `2.5.0`.

## 2.2.0 - 2026-06-09

### Added

- Added non-destructive `codex launch` to start Codex CLI with runtime `-c` overrides instead of rewriting `~/.codex/config.toml`.
- Added an Advanced Codex CLI submenu for persistent config, restore, and template actions.

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- Made the interactive Codex CLI menu default to safe launch, with persistent `Apply Config` moved under Advanced.
- Codex runtime launch now uses `workspace-write` sandboxing and `on-request` approvals for the child process.
- Removed blank separator rows from interactive select menus.
- Package version promoted from `2.1.0` to `2.2.0`.

## 2.1.0 - 2026-06-08

### Added

- Added Codex CLI config restore flow with safe `config.toml.wrapper-scionos-backup` rollback.
- Added optional launch of the official `codex` CLI after applying wrapper config from the interactive menu.
- Added Codex CLI detection to `doctor` output.
- Added RouterLab LLM-specific Codex model catalog: `MiniMax-M3`, `deepseek-v4-pro`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`, `qwen3.7-max`, and `glm-5.1`.

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- Simplified the Codex CLI interactive menu by removing `Choose Default Model`.
- Codex custom provider config now uses `env_key = "OPENAI_API_KEY"` instead of Codex OpenAI/ChatGPT auth, while preserving `auth.json`.
- Codex launches from the wrapper now pass the selected RouterLab service token as `OPENAI_API_KEY` to the child process.
- Windows Codex CLI detection now prefers launchable `.cmd`, `.bat`, and `.exe` shims.
- Package version promoted from `2.0.0` to `2.1.0`.

### Fixed

- Fixed Codex launch on Windows when `where codex` returns the non-launchable npm shim before `codex.cmd`.
- Fixed Codex RouterLab LLM requests using the wrong ChatGPT OAuth token and model catalog.

## 2.0.0 - 2026-06-04

### Added

- Added Claude Desktop 3P profile support on Linux through the `claude-desktop-debian` config layout.
- Added a main-menu compatibility line for Windows, macOS, and Linux via `aaddrick/claude-desktop-debian`.
- Expanded Claude Desktop local mapping for RouterLab LLM to mirror the Claude Code LLM strategies: Claude, GPT, GPT special, DeepSeek, MiniMax, Qwen, and GLM.

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- `claude-desktop proxy --service llm` and `claude-desktop apply-proxy --service llm` now use the same full Desktop LLM mapping as the interactive Start Local Mapping flow when no explicit `--strategy` is provided.
- Claude Desktop LLM model route ids now use Desktop-safe aliases with clean display labels, such as `gpt-5.5`, `deepseek-v4-pro`, `MiniMax-M3`, `qwen3.7-max`, and `glm-5.1`.
- RouterLab LLM native Claude mapping now uses `claude-opus-4-8`, `claude-sonnet-4-6`, and `claude-haiku-4-5-20251001`.
- 1M context variants are enabled for DeepSeek, MiniMax, and Qwen Desktop routes.
- Package version promoted from `1.1.2` to `2.0.0`.

## 1.1.2 - 2026-06-03

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- RouterLab LLM Claude Code strategy `claude-qwen3.7-max` is now shown as `qwen3.7-max` in guided launch displays.
- Claude Code launches now receive temporary child-process environment `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`.
- Package version promoted from `1.1.1` to `1.1.2`.

## 1.1.1 - 2026-06-03

### Fixed

- Fixed subagent overrides for RouterLab LLM fixed-subagent strategies: `claude-gpt-special`, `claude-MiniMax-M3`, and `claude-qwen3.7-max` now keep their strategy-defined subagent model even when `--subagent-model` is provided.

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- Package version promoted from `1.1.0` to `1.1.1`.

## 1.1.0 - 2026-06-03

### Added

- RouterLab LLM Claude Code strategy `claude-MiniMax-M3`, shown as `MiniMax-M3 beta`.
- RouterLab LLM Claude Code strategy `claude-qwen3.7-max`, with `claude-qwen3.6-flash` for subagents.

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- RouterLab LLM Claude strategy now launches Claude Code in native mode without forcing default model environment variables.
- RouterLab LLM MiniMax strategy now uses only `claude-MiniMax-M3`; the previous `minimax-m2.7` strategy name is no longer accepted.
- Package version promoted from `1.0.0` to `1.1.0`.

## 1.0.0 - 2026-06-01

### Added

- Codex CLI interactive menu with Apply Config, Choose Default Model, Print Template, Status, and Back actions.
- RouterLab Codex CLI model catalog ordered as `gpt-5.5`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.4-mini`, `minimax-m2.7`, and `glm-5.1`.
- `--model` option for `codex apply`, allowing explicit Codex CLI default model selection.
- Codex CLI `model_catalog_json` generation via `wrapper-scionos-model-catalog.json` when a local Codex `models_cache.json` is available.

### Changed

- Rebuilt interactive navigation around one route registry with consistent back-to-home actions, breadcrumbs, and centralized action dispatch.

- Main menu entry renamed from `Codex` to `Codex CLI`.
- Package version promoted from `0.9.0-beta.1` to `1.0.0`.

## 0.9.0-beta.1 - 2026-06-01

### Added

- `codex apply` command to write Codex `config.toml` atomically while preserving `auth.json`.
- Main interactive menu banner branded as `ScioNos Wrapper`.
- Claude Code guided launch screens now use the wrapper-branded layout for strategy and subagent choices.
- Runtime dependencies on `@inquirer/prompts` and `chalk` for a richer interactive CLI.
- Claude Code strategy picker now verifies model availability and shows the same green/red status dots and launcher labels as the existing guided flow.
- Main menu now uses keyboard navigation, spaced options, and the same colored prompt style as the guided Claude Code flow.
- Claude Desktop interactive menu simplified to Start Local Mapping, Restore Official Mode, Status, and Back; Start Local Mapping now configures the selected local profile before starting the proxy.
- Desktop Start Local Mapping now uses the service selected at launch (`routerlab` by default or `--service llm`) instead of prompting again.
- Removed the non-beta `deepseek-v4` strategy from interactive strategy lists.
- Launching with wrapper-only options such as `--service llm` now opens the main menu instead of jumping directly into Claude Code.
- Claude Desktop local mapping for the default RouterLab service now exposes a multi-model catalog instead of asking for one strategy: Claude Native, AWS, GPT, Kimi, and GLM.
- Claude Desktop local mapping for RouterLab LLM now exposes a focused catalog: Claude, OpenAI GPT, OpenAI GPT special price, and GLM.
- Claude Desktop model ids and labels are normalized for GPT, GPT special, Kimi, GLM, Claude Native, and AWS routes, with 1M context disabled for Haiku, Kimi, GLM, and GPT mini variants.

## 0.9.0-beta.0 - 2026-06-01

### Added

- Initial beta release of `wrapper-scionos`.
- Interactive CLI menu opened by `node index.js`.
- RouterLab service support for:
  - `https://api.routerlab.ch`
  - `https://llm-api.routerlab.ch`
- Service-scoped secure token storage.
- Migration-compatible token lookup for existing `claude-scionos` tokens.
- Claude Code launcher with RouterLab strategy environment mapping.
- Strategy support for RouterLab routes such as AWS Claude, GPT, DeepSeek, Kimi, GLM, MiniMax.
- `doctor` command for local setup diagnostics.
- `strategies` command for route inspection.
- Claude Desktop direct 3P profile writer for Windows and macOS.
- Claude Desktop official-mode restore command.
- Claude Desktop local proxy mode for strategy-specific model catalogs.
- Claude Desktop per-model 1M context flag handling.
- Codex config template generator.
- English and French README files.

### Notes

- This is a beta release. CLI behavior and configuration formats may still change.
- Claude Desktop proxy mode must stay running while Claude Desktop uses mapped models.
- Automatic Codex config writing is not included yet.
