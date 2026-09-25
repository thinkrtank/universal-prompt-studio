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
- Tailwind CSS 3 (CDN, configured with `darkMode: 'class'`, semantic color tokens, 2px radius and no shadows)
- Google Fonts: Newsreader (headings), IBM Plex Sans (body), IBM Plex Mono (labels, code)

### Code Layout (inside the HTML file)

_(Line numbers are approximate — grep for the `const NAME =` / `function NAME(` anchors rather than trusting exact lines.)_

| Lines (approx) | Section |
|---|---|
| 1–186 | `<head>`: CDN scripts, fonts, early theme script, Tailwind config, design tokens and component CSS, skeleton loader |
| 187–205 | `MEDIUM_AESTHETICS`: 10 artistic mediums × 15 aesthetic keywords each |
| 206–495 | `MODEL_PROFILES` + helpers (`localDiffusionNative`, `midjourneyNative`, `seedanceNative`, `modelGuidance`, `profileOptions/Labels`): per-model notes, limits and native syntax for image/video/llm/audio |
| 497–599 | `IMAGE_SCHEMA`: target model, output, multi-reference/edit, `model_params.*` (Midjourney flags) and `sd_local.*` sections |
| 601–646 | `VIDEO_SCHEMA`: extends IMAGE_SCHEMA with target model, motion, shots/references, edit, audio, transitions (strips image-only keys) |
| 648–680 | `INDUSTRY_SKILLS`: 25+ domains with top-10 skill arrays |
| 682–763 | `LLM_SCHEMA`: target model, role, task, context, output, behavior, safety fields |
| 765–864 | `DEV_SCHEMA`: project vision through devops/security/docs |
| 866–995 | `MARKETING_SCHEMA`: campaign strategy through market research |
| 997–1053 | `VIBE_SCHEMA`: vibe coder project builder (stack decisions from The Vibe Coder's Handbook) |
| 1055–1108 | `AUDIO_SCHEMA`: music/voice/SFX prompts; `meta.target_tool` uses the audio profiles |
| 1110–1150 | `AGENT_SCHEMA`: tool-use and multi-agent prompts (Agent SDK, MCP, subagents) |
| 1152–1239 | `FRONTEND_SCHEMA`: frontend/website design prompts |
| 1241–1329 | `PM_SCHEMA`: PMBOK 8 project management prompts |
| 1331–1389 | `LOOP_SCHEMA`: agent loop / "Ralph" loop-engineering prompts |
| 1391–1467 | `MOTION_TOOLS`, `MOTION_SCHEMA`: tool-agnostic motion design brief (AI video model picker reuses the video profiles) |
| 1469–1543 | `AE_SCHEMA`: After Effects build prompts (expressions, ExtendScript, rigging, 3D, MOGRT, render) |
| 1545–1625 | `ANDROID_SCHEMA`: Android app, idea to Google Play (Kotlin + Compose first, cross-platform optional) |
| 1627–1701 | `IOS_SCHEMA`: iOS app, idea to App Store (Swift + SwiftUI first, cross-platform optional) |
| 1703–1954 | `SCHEMAS`, `SELECT_SENTINELS`, `SENTINEL_*`, `TYPE_META`, `SECTION_INFO`: registry and UI metadata |
| 1956–3057 | `PRESETS`: one-click presets per prompt type |
| ~3059–3190 | Shared core API (`validateFormData`, `buildPromptObject`, `promptPlainText`, …) exported as `PromptStudioCore` |
| ~3190–3344 | Toasts, hooks, `ThemeToggle`, `BUILDER_GROUPS` / `BUILDER_SYMBOLS`, `CodeView`, `INDUSTRY_GROUPS`, `CHAIN_TARGETS` |
| ~3345–3592 | `ChainBuilder`: multi-step pipeline component |
| 3594–4448 | `UniversalPromptStudio`: main component (home tiles, builder, output, templates, field search, confirm modal) |
| ~4449–4462 | `App` wrapper + ReactDOM render |

## Key Patterns

### Schema-Driven Forms
All UI is generated dynamically from schema objects (`IMAGE_SCHEMA`, `LLM_SCHEMA`, etc.). Each field has:
- `type` — input type (`text`, `textarea`, `select`, `multiselect`, `checkbox`, `number`, `medium_aesthetics`)
- `section` — groups fields into collapsible accordion sections
- `condition` — optional conditional visibility (e.g., `'text.enabled'`)
- `default`, `options`, `placeholder`, `min`, `max`, `step`
- `optionLabels` — optional display labels for select/multiselect values (lets values stay stable while names change)
- `modelProfiles` — marks the one select whose value picks a `MODEL_PROFILES[family]` entry (`'image'`, `'video'`, `'llm'`, `'audio'`)

The `SCHEMAS` object maps prompt types to their schemas. `SECTION_INFO` provides titles/descriptions per section. `TYPE_META` stores builder metadata (`group` for the home index, title, shortTitle, desc, pasteTarget).

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

### Visual Design
Warm paper and ink with hairline rules, 2px corners, and no shadows, gradients, emoji, icon fonts or hover motion. Keep UI copy free of em dashes.

- **Builder families** (periodic-table metaphor): `TYPE_META.group` maps each builder to a family with one muted hue: `--fam-media` (rust), `--fam-language` (teal), `--fam-software` (indigo), `--fam-business` (bronze), `--fam-pipelines` (ink). Text on family fills uses `--on-fam`. Fills stay deep in both themes.
- **Accent follows the family.** Setting `data-family="<id>"` on an element sets `--accent` (fills: tiles, header band, primary buttons, marks), `--accent-soft` (tints) and `--accent-text` (the hue as text or lines, lifted in dark mode). The Tailwind color `accent` maps to `--accent-text`.
- **Home** is a grid of element tiles (`.tile`: number, stats, two-letter symbol from `BUILDER_SYMBOLS`, name, description) sorted by family, ending with a key tile. **Builder screens** use a family-colored `.band` header with inverted controls, a `.mark` symbol, a numbered section list and a live output column.
- Colors are CSS variables on `:root` / `html.dark`, exposed to Tailwind as `paper`, `surface`, `field`, `code`, `ink`, `ink2`, `muted`, `rule`, `strong`, `accent`, `accentsoft`, `ok`, `err`, so no `dark:` variants are needed. Component classes in the head `<style>`: `.fld`, `.btn` / `.btn-primary` / `.btn-quiet` / `.btn-danger`, `.seg`, `.grid-cells` + `.cell`, `.tile`, `.band`, `.mark`, `.swatch`, `.sec`, `.scrim` + `.dialog`, `.code` (`CodeView`), `.toast`, `.kicker`. The `#root` placeholder is a static skeleton shown until React mounts.
### Dark Mode
`useDarkMode()` hook returns `[isDark, mode, setMode]`. Manages the `dark` class on `<html>` and syncs with `prefers-color-scheme` when mode is `'system'`. Persists to localStorage. A small inline script in `<head>` applies the saved theme before first paint.

### Chain Builder
A separate component (`ChainBuilder`) for multi-step prompt pipelines. Steps use `standard` or `translate` types. The shared core validates unique IDs/output labels and earlier-step inputs. Includes "translate" steps that describe adaptations for 30+ platform targets (Canva, Figma, GitHub, Vercel, n8n, After Effects, Lottie Creator, Rive, etc.).

## How to Extend

### Adding a New Field to an Existing Schema
1. Add an entry to the relevant schema (e.g., `IMAGE_SCHEMA`):
   ```js
   'section.field_name': { type: 'select', label: 'My Field', options: [...], default: '...', section: 'section_name' }
   ```
2. If the section already exists in `SECTION_INFO`, the field appears automatically.
3. If adding a new section, add an entry to `SECTION_INFO[type]` with `title` and `desc`.

### Adding a New Prompt Type
1. Define a new schema constant (e.g., `AUDIO_SCHEMA`).
2. Add it to the `SCHEMAS` object.
3. Add metadata to `TYPE_META` (group, title, shortTitle, desc, pasteTarget). `group` is one of `BUILDER_GROUPS` (media, language, software, business).
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
