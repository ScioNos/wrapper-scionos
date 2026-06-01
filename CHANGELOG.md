# Changelog

All notable changes to this project will be documented in this file.

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
