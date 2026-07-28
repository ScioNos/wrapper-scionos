# Migration Guide: Codex Changes in 5.0

This guide covers breaking changes in the Codex integration for wrapper-scionos 5.0.

## Overview

Version 5.0 fundamentally changes how wrapper-scionos interacts with Codex:

- **Before (4.x)**: Codex used a wrapper-managed proxy and model catalog.
- **After (5.0)**: Codex connects directly to RouterLab and receives a temporary startup catalog for its native model selector.

## Breaking Changes

### 1. Proxy removed; catalog made ephemeral

**4.2.1 behavior:**

- a local session proxy;
- a temporary `model_catalog_json`;
- wrapper-provided context, instructions, reasoning, modality, shell/tool, search, truncation, and priority fields.

**5.0 behavior:**

- direct `https://api.routerlab.ch/v1` or `https://llm-api.routerlab.ch/v1`;
- seven provider/model routing overrides, including `model_catalog_json`;
- the RouterLab token passed unchanged as child-only `OPENAI_API_KEY`;
- a temporary catalog derived from the discovered, allowlisted models;
- no persistent Codex configuration changes.

Arguments after `--` remain native Codex arguments, but provider, model, profile, alternate-provider, and remote-transport overrides are rejected because they would bypass the RouterLab routing selected by the wrapper. Model discovery also rejects every HTTP redirect instead of forwarding the service token to another origin.

**Impact:**

The catalog feeds Codex `model/list` and `/model`. RouterLab metadata is normalized for display, context, modalities, reasoning, parallel tools, and search. Conservative values are used only when optional metadata fields are missing; they are not a fallback for failed discovery. RouterLab/LiteLLM remains authoritative if the model is changed after launch.

The RouterLab-only destination guarantee is limited to model discovery and inference traffic configured by the wrapper. It does not cover independent network activity from the official Codex binary or user-configured native features such as update checks, MCP, tools, and search. Version 5.0 deliberately leaves those Codex features unchanged.

**Migration:**

Remove any automation that expects a local Codex proxy or a persistent catalog path. The catalog path is unique to each launch and must not be cached.

Legacy `codex restore` restores a known wrapper backup when present. Without that backup it preserves `config.toml`, reports that manual cleanup is required, and only removes the dedicated legacy model catalog.

---

### 2. Model discovery is fail-closed

`GET /v1/models` is used only to intersect returned identifiers with the fixed service allowlist.

- `--model` requires an exact available identifier.
- Interactive launch prompts among available allowed models and auto-selects a single result.
- `--no-prompt` without `--model` requires `gpt-5.6-sol`.
- Network failure, timeout, invalid JSON, HTTP 401/403, server failure, or an empty intersection prevents launch.

There is no fallback model and no fallback catalog when discovery fails. Conservative catalog fields apply only after successful discovery when optional RouterLab metadata is incomplete.

### 3. Transport options removed

`--direct`, `--proxy`, and `--transport` are invalid. Direct RouterLab access is the only Codex mode.

### 4. Production destinations are immutable

These variables no longer redirect traffic and are ignored with a warning:

- `ROUTERLAB_BASE_URL`;
- `ROUTERLAB_LLM_BASE_URL`;
- `WRAPPER_SCIONOS_ROUTERLAB_BASE_URL`;
- `WRAPPER_SCIONOS_LLM_BASE_URL`;
- `ANTHROPIC_BASE_URL`.

Token variables continue to work. Claude Code and Claude Desktop still receive an internally generated `ANTHROPIC_BASE_URL` pointing to their dedicated local proxy; their upstream target is always the official RouterLab domain.

## Unchanged

Token resolution order and storage remain identical:
- `--token` flag
- Secure storage
- Environment variables

The launch still uses temporary `-c` overrides and never writes `~/.codex/config.toml`. `codex launch` creates its catalog in a temporary directory and removes it after success, non-zero exit, or startup failure. `codex status` and `codex restore` remain for legacy persistent cleanup.

---

## Verification

After upgrading to 5.0, verify the migration:

```bash
# Check available models
wrapper-scionos codex launch --service llm

# In the launched Codex session, run /model.
# The list must contain only the currently discovered, allowlisted models,
# in wrapper order, with the model selected at launch active.

# Preview the six provider/model settings that do not require discovery.
wrapper-scionos codex template --service llm
# model_catalog_json is intentionally launch-only because its path is ephemeral.
```

---

## Rollback

If you need to rollback to 4.2.1 behavior:

```bash
npm install -g wrapper-scionos@4.2.1
```

Or pin your `package.json`:
```json
{
  "dependencies": {
    "wrapper-scionos": "^4.2.1"
  }
}
```

---

## Questions

For issues or questions about this migration:
- Open an issue on GitHub
- Review the [CHANGELOG.md](../CHANGELOG.md)
