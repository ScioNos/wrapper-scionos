# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 1.0.0 - 2026-06-01

### Added

- Codex CLI interactive menu with Apply Config, Choose Default Model, Print Template, Status, and Back actions.
- RouterLab Codex CLI model catalog ordered as `gpt-5.5`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.4-mini`, `minimax-m2.7`, and `glm-5.1`.
- `--model` option for `codex apply`, allowing explicit Codex CLI default model selection.
- Codex CLI `model_catalog_json` generation via `wrapper-scionos-model-catalog.json` when a local Codex `models_cache.json` is available.

### Changed

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
