# Migration Guide: Codex Changes in 5.0

This guide covers breaking changes in the Codex integration for wrapper-scionos 5.0.

## Overview

Version 5.0 fundamentally changes how wrapper-scionos interacts with Codex:

- **Before (4.x)**: The wrapper imposed model identities through hardcoded profiles
- **After (5.0)**: The wrapper uses upstream metadata from RouterLab's `/v1/models`

## Breaking Changes

### 1. Model Metadata Now Comes from Upstream

**4.2.1 behavior:**
```javascript
// Hardcoded in src/apps/codex.js
const CODEX_MODEL_PROFILES = {
  'gpt-5.6-sol': {
    contextWindow: 372000,
    inputModalities: ['text', 'image'],
    baseInstructions: 'You are Codex, a coding agent...',
  }
};
```

**5.0 behavior:**
```javascript
// Fetched from GET /v1/models
const upstream = await fetchModels(token, { serviceValue, baseUrl });
// Used directly in catalog generation
```

**Impact:**
- Context windows may differ if RouterLab reports different values
- Base instructions come from upstream or use Codex defaults
- Reasoning levels reflect upstream capabilities

**Migration:**
None required for most users. If you relied on specific hardcoded values, verify them against RouterLab's actual responses.

---

### 2. Request Body No Longer Rewritten

**4.2.1 behavior:**
```javascript
// In proxy mode, every /v1/responses request was modified:
body.store = false;
delete body.metadata;
```

**5.0 behavior:**
```javascript
// Request body passed through unchanged
```

**Impact:**
- `metadata` field is preserved (if Codex sends it)
- `store` is no longer forced to `false`

**Migration:**
None required. This change makes the wrapper transparent.

---

### 3. web_search No Longer Forced to "disabled"

**4.2.1 behavior:**
```javascript
// Always injected via -c flag:
web_search="disabled"
```

**5.0 behavior:**
```javascript
// Not injected, Codex decides
```

**Impact:**
Codex can now use web search if configured and supported by the model.

**Migration:**
If you want to disable web search, add it to your `~/.codex/config.toml`:
```toml
web_search = "disabled"
```

---

### 4. Model List Changes for LLM Service

**4.2.1 allowed models (llm):**
```
gpt-5.6-sol
gpt-5.6-luna
gpt-5.6-terra
kimi-k3
grok-4.5
MiniMax-M3
```

**5.0 allowed models (llm):**
```
gpt-5.6-sol
gpt-5.6-terra
kimi-k3
grok-4.5
MiniMax-M3
```

**Impact:**
`gpt-5.6-luna` is no longer available on the `llm` service.

**Migration:**
Switch to `gpt-5.6-terra` or another model from the list above.

---

### 5. Hardcoded Fallbacks Removed

**4.2.1 behavior:**
```javascript
// If /v1/models failed, used detailed hardcoded profiles
CODEX_MODEL_PROFILES['deepseek-v4-pro'] = {
  contextWindow: 1000000,
  supportsReasoning: true,
  // ... 15+ fields
};
```

**5.0 behavior:**
```javascript
// If /v1/models fails, uses minimal conservative fallback:
{
  context_window: 128000,
  default_reasoning_level: 'medium',
  input_modalities: ['text'],
  // ... minimal safe defaults
}
```

**Impact:**
If RouterLab's `/v1/models` endpoint is unreachable, models will have conservative defaults (128K context, text-only).

**Migration:**
Ensure RouterLab's `/v1/models` endpoint is reachable. If you see the fallback warning, verify network connectivity.

---

## Non-Breaking Changes

### Context Window Still Pinned

Both 4.2.1 and 5.0 report a fixed context window to Codex (1M tokens, 90% auto-compact = 900K) to ensure smaller models don't cap the catalog. This behavior is unchanged.

### Authentication Unchanged

Token resolution order and storage remain identical:
- `--token` flag
- Secure storage
- Environment variables

### Runtime Injection Unchanged

5.0 still uses `-c` runtime overrides, not `config.toml` modification. Your `~/.codex/config.toml` is never touched.

---

## Verification

After upgrading to 5.0, verify the migration:

```bash
# Check available models
wrapper-scionos codex launch --service llm

# In Codex, inspect the model catalog
# Context windows should match RouterLab's reported values
# Base instructions should come from upstream
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
- Check the [RAPPORT-CODEX-WRAPPER.md](../RAPPORT-CODEX-WRAPPER.md) analysis
- Open an issue on GitHub
- Review the [CHANGELOG.md](../CHANGELOG.md)
