# Changelog

All notable changes to this project will be documented in this file.

## 4.0.0 - 2026-07-11

### Added

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
