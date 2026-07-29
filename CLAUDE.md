# CLAUDE.md

## Project

Bilibili-User-Memo — Tampermonkey userscript that adds per-user memo overlays to bilibili.com. Built with Vite + vite-plugin-monkey, Alpine.js 3 (reactive panel UI), TypeScript strict mode.

## Commands

```bash
pnpm dev          # vite --mode debug (unminified, debug builds)
pnpm build        # vite build --mode production (terser + lightningcss)
pnpm lint         # eslint + stylelint + tsc --noEmit
pnpm test         # vitest run
```

## Architecture (one-liner)

URL-matched rules → DOM scanning/injection → render memo as Minimal (CSS class on original element) or Editable (wrapper `<span>` inserted after original element).

## Key modules

- `src/main.ts` — Entry: Alpine init, GM_registerMenuCommand, lifecycle orchestration
- `src/core/rules/rules.ts` — All page rules as `RawConfig[]` (urlPattern + rule)
- `src/core/injection/` — Rule runtime, single-timer scan, selector merging
- `src/core/injection/rule-runtime.ts` — Selector building (`buildMergedSelector`)
- `src/core/render/renderer.ts` — `renderMinimal` (class injection) vs `renderEditable` (wrapper span)
- `src/core/render/rendered-node.ts` — `syncRenderedNodeState` for memoDetail title sync
- `src/core/store/store.ts` — `UserStore` singleton with listener pattern, GM_addValueChangeListener for cross-tab sync
- `src/core/style/style-manager.ts` — Constructable Stylesheets API for Shadow DOM style injection
- `src/features/panel/` — Alpine.js panel UI (box.html, panel.html, panel-core.ts, panel-settings.ts, item-components.ts)
- `src/features/panel/user-list-types.ts` — `UserListStore` TypeScript interface
- `src/features/panel/perceptual-hash.ts` — bmvbhash for fake noface avatar detection (hardcoded reference hash, reads from DOM img)
- `src/utils/gm-storage.ts` — GM_getValue/GM_setValue wrappers, panel settings persistence
- `src/utils/activity-monitor.ts` — Idle detection (3s inactivity → pauses querySelectorDeep scans)

## Conventions

- `verbatimModuleSyntax: true` → always `import type { X }` for type-only imports
- `@/*` path alias → `./src/*`
- `$` import → Tampermonkey GM API (from vite-plugin-monkey)
- `__IS_DEBUG__`, `__VERSION__` → compile-time defines in vite.config.ts
- `externalGlobals` in vite.config.ts → alpinejs, opencc-js, query-selector-shadow-dom are CDN-loaded (must have UMD global). `@alpinejs/persist` is NOT externalized (CDN build auto-registers via `alpine:init`, no global).
- No `beforeunload` listener — data persists via real-time saves + GM_addValueChangeListener
- `ensureUser()` returns temp object without saving to store; only `updateUser()` persists
- HTML files are minified at build time via custom Vite plugin (transform `?raw` imports)
- CSS uses LightningCSS with browserslist targets; shared styles use Constructable Stylesheets
- Dead code = any function/class not imported anywhere under `src/`

- Debug builds expose `window.__biliMemoTest` for MCP/automated testing — use this API for non-DOM tests (store queries, search, selection, export, refresh) instead of manipulating DOM directly

## Rule system

- `StyleScope.Minimal` → adds CSS classes to the original DOM element (no wrapper)
- `StyleScope.Editable` → creates a `<span class="editable-textarea">` wrapper after the original element, hides original
- `container` → optional scope selector; rules with `container` verify `el.closest(container)` before processing, rules without it scan globally. All rules share one `setInterval` (750ms) scanning via `buildMergedSelector`
- `matchByName` → fallback to name-based lookup when UID is unavailable; requires `textSelector`
- `uidResolver` / `originalNameResolver` → custom extraction for non-standard DOM structures

## Gotchas

- Windows Chrome: `@supports (cursor: context-menu)` returns true but renderer can't draw it → use JS UA detection for fallback
- Bilibili CDN supports CORS (`access-control-allow-origin: *`) → can read pixel data from cross-origin `<img>` with `crossorigin="anonymous"`
- `a.bili-memo-tag` may render as `<a>` in mention scenarios → CSS must handle both
- Panel toggle button cursor: base is `context-menu` with `.is-windows-chrome` override to `cursor: help`
- memoDetail title sync: `syncRenderedNodeState` appends `详细备注：` to element title, uses `\n` separator for existing titles

