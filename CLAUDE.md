# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
# No build step. Open the HTML file directly in a browser:
start universal-prompt-studio-v11.html   # Windows
open universal-prompt-studio-v11.html    # macOS
xdg-open universal-prompt-studio-v11.html # Linux
```

No npm or bundler is required for browser use. The optional MCP service and regression tests use Node.js 22+ and npm (`npm ci --ignore-scripts`, `npm test`). The browser UI and shared core remain in one HTML file; the optional MCP entrypoints and regression tests are separate.

## Architecture

**Single-file React app** loaded via CDN. The plain `prompt-studio-core` script owns schemas, validation and output generation; `mcp/core.mjs` loads that same block in Node. Keep it free of DOM/React dependencies. The following Babel script contains the UI:

- React 18.3.1 + ReactDOM (production UMD builds, pinned versions)
- Babel Standalone 7.26.9 (in-browser JSX compilation via `<script type="text/babel">`)
- Tailwind CSS 3 (CDN, configured with `darkMode: 'class'`)

### Code Layout (inside the HTML file)

_(Line numbers are approximate — grep for the `const NAME =` / `function NAME(` anchors rather than trusting exact lines.)_

| Lines (approx) | Section |
|---|---|
| 35–52 | `MEDIUM_AESTHETICS` — 10 artistic mediums × 15 aesthetic keywords each |
| 54–343 | `MODEL_PROFILES` + helpers (`localDiffusionNative`, `midjourneyNative`, `seedanceNative`, `modelGuidance`, `profileOptions/Labels`) — per-model notes, limits and native syntax for image/video/llm/audio |
| 345–447 | `IMAGE_SCHEMA` — target model, output, multi-reference/edit, `model_params.*` (Midjourney flags) and `sd_local.*` sections |
| 449–494 | `VIDEO_SCHEMA` — extends IMAGE_SCHEMA with target model, motion, shots/references, edit, audio, transitions (strips image-only keys) |
| 496–528 | `INDUSTRY_SKILLS` — 25+ domains with top-10 skill arrays |
| 530–611 | `LLM_SCHEMA` — target model, role, task, context, output, behavior, safety fields |
| 613–712 | `DEV_SCHEMA` — project vision through devops/security/docs |
| 714–843 | `MARKETING_SCHEMA` — campaign strategy through market research |
| 845–901 | `VIBE_SCHEMA` — vibe coder project builder (14 tech stack decisions from The Vibe Coder's Handbook) |
| 903–956 | `AUDIO_SCHEMA` — music/voice/SFX prompts; `meta.target_tool` uses the audio profiles |
| 958–998 | `AGENT_SCHEMA` — tool-use & multi-agent prompts (Agent SDK, MCP, subagents) |
| 1000–1087 | `FRONTEND_SCHEMA` — frontend/website design prompts (visual style, layout, typography, motion, tech stack) |
| 1089–1177 | `PM_SCHEMA` — PMBOK 8 project management prompts (Seven Questions, EVM-lite, risk registers) |
| 1179–1236 | `LOOP_SCHEMA` — agent loop / "Ralph" loop-engineering prompts (stop conditions, verification gates, budgets) |
| 1238–1315 | `MOTION_TOOLS`, `MOTION_SCHEMA` — tool-agnostic motion design brief (AI video model picker reuses the video profiles) |
| 1316–1389 | `AE_SCHEMA` — After Effects build prompts (expressions, ExtendScript, rigging, 3D, MOGRT, render) |
| 1391–1606 | `SCHEMAS`, `SELECT_SENTINELS`, `SENTINEL_*`, `TYPE_META`, `SECTION_INFO` — registry and UI metadata |
| 1608–2625 | `PRESETS` — one-click presets per prompt type |
| ~2627–2754 | Shared core API (`validateFormData`, `buildPromptObject`, `promptPlainText`, …) exported as `PromptStudioCore` |
| ~2755–2885 | Toast notification system + hooks + utilities + `CHAIN_TARGETS` |
| ~2886–3181 | `ChainBuilder` — multi-step pipeline component |
| 3182–4154 | `UniversalPromptStudio` — main component (forms, output, templates, field search, confirm modal) |
| ~4155–4168 | `App` wrapper + ReactDOM render |

## Key Patterns

### Schema-Driven Forms
All UI is generated dynamically from schema objects (`IMAGE_SCHEMA`, `LLM_SCHEMA`, etc.). Each field has:
- `type` — input type (`text`, `textarea`, `select`, `multiselect`, `checkbox`, `number`, `medium_aesthetics`)
- `section` — groups fields into collapsible accordion sections
- `condition` — optional conditional visibility (e.g., `'text.enabled'`)
- `default`, `options`, `placeholder`, `min`, `max`, `step`
- `optionLabels` — optional display labels for select/multiselect values (lets values stay stable while names change)
- `modelProfiles` — marks the one select whose value picks a `MODEL_PROFILES[family]` entry (`'image'`, `'video'`, `'llm'`, `'audio'`)

The `SCHEMAS` object maps prompt types to their schemas. `SECTION_INFO` provides titles/icons/descriptions per section. `TYPE_META` stores mode metadata (icon, title, color gradient, paste target).

### Dot-Path Keys
Schema keys use dot notation (`'subject.hair_color'`, `'meta.aspect_ratio'`). These are stored flat in `formData` state — **not** nested.

### Output Generation Pipeline

`buildPromptObject(type, data)` and `promptPlainText(object)` in the shared core are authoritative. Both MCP and the UI use them. Template previews must pass the saved template type. Use `validateFormData` on externally supplied flat data and `importPromptData` for nested prompt imports.

When the builder's `modelProfiles` field holds a known profile id, `buildPromptObject` appends `model_guidance`: `target_model`, optional `model_status` / `api_model_id`, `prompting_notes`, `native_parameters` (from the profile's `native(visibleData)`), and `compatibility_warnings` (from `limits`: `aspect_ratios`, `resolutions`, `durations`, `min_duration`/`max_duration` in seconds, `max_refs`, `negative_prompt: false`, `transparency: false`, `native_audio: false`, `hd_max_ratio`). User fields are never dropped. `importPromptData` ignores the `model_guidance` block, so output re-imports cleanly.

The UI's memoized `buildNestedJSON(data, type)` wraps `buildPromptObject`. The live preview filters `formData` to the current schema first, because `formData` and the section index are reset by effects one render after `promptType` changes. `generatedPlainText` flattens the same generated JSON rather than keeping a separate LLM field list. Both output modes therefore share sentinel resolution, hidden-field filtering, and validation. Browser import accepts nested or flat JSON; MCP accepts flat fields.

### localStorage Persistence
- **Theme**: `promptStudioTheme` — `'light'` | `'dark'` | `'system'`
- **Templates**: `promptStudioTemplates` — `{ [name]: { type, data, savedAt } }`
- **Auto-save**: `promptStudioAutosave` — `{ type, data, timestamp }` (expires after 24h)
- **Chains**: `promptStudioChains` — saved chain pipelines

Template and chain writes use `safeLocalStorageSet()` and change UI state only after success. Theme and debounced autosave writes have their own guarded storage access.

### Toast Bus
A lightweight pub/sub event bus (`toastBus`) decoupled from the React tree. Call `showToast(message, type)` from anywhere. The `ToastContainer` component subscribes via `useEffect`.

### Dark Mode
`useDarkMode()` hook returns `[isDark, mode, setMode]`. Manages the `dark` class on `<html>` and syncs with `prefers-color-scheme` when mode is `'system'`. Persists to localStorage.

### Chain Builder
A separate component (`ChainBuilder`) for multi-step prompt pipelines. Steps use `standard` or `translate` types. The shared core validates unique IDs/output labels and earlier-step inputs. Includes "translate" steps that describe adaptations for 30+ platform targets (Canva, Figma, GitHub, Vercel, n8n, After Effects, Lottie Creator, Rive, etc.).

## How to Extend

### Adding a New Field to an Existing Schema
1. Add an entry to the relevant schema (e.g., `IMAGE_SCHEMA`):
   ```js
   'section.field_name': { type: 'select', label: 'My Field', options: [...], default: '...', section: 'section_name' }
   ```
2. If the section already exists in `SECTION_INFO`, the field appears automatically.
3. If adding a new section, add an entry to `SECTION_INFO[type]` with `title`, `icon`, `desc`.

### Adding a New Prompt Type
1. Define a new schema constant (e.g., `AUDIO_SCHEMA`).
2. Add it to the `SCHEMAS` object.
3. Add metadata to `TYPE_META` (icon, title, desc, color gradient, pasteTarget).
4. Add section info to `SECTION_INFO`.
5. Optionally add presets to `PRESETS`.
6. Update the builder counts in `tests/core.test.mjs`, `tests/mcp.test.mjs`, `README.md` and `mcp/README.md`.

### Adding or Updating a Target Model
1. Verify the model name, API id and limits from vendor docs (lists go stale within months). Keep still-available models; remove only dead or renamed ones.
2. Add an entry to `MODEL_PROFILES[family]`: `label`, `status` (`current` | `legacy` | `early_access`), `notes`, optional `api_model_id`, `limits`, and `native(d)` for model-specific syntax.
3. The select options update automatically (`profileOptions`/`profileLabels`). Retired ids in saved templates still load; they simply get no guidance.

### Adding a Preset
Add an entry to `PRESETS[type]`:
```js
'Preset Name': { 'field.key': 'value', 'another.key': 'value' }
```
Tests reject preset keys that aren't in the schema, select values that aren't options (or sentinels), and wrong value types.

## Conventions

- **No build tools** — all changes are made directly in the HTML file.
- **No external browser JS/CSS files** — browser logic stays inline. The optional server and Node tests are separate files.
- **React and Babel CDN versions are pinned with SRI; Tailwind Play CDN is not pinned** — update with care, test in-browser.
- **Prefer `useCallback`/`useMemo`** for functions and derived data in the main component to avoid re-render overhead in a 2000+ line single-component tree.
- **Toast for user feedback** — use `showToast()` instead of `alert()`.
- **Safe storage writes** — always use `safeLocalStorageSet()` for localStorage writes.
