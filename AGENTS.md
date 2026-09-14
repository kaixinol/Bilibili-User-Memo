# AGENTS.md

## Project

- Contribution guidelines: see `CONTRIBUTING.md`.

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
- `src/core/injection/rule-runtime.ts` — Selector building (`buildMergedSelector`, `containerSelectorList`, `expandContainer`)
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
- `pnpm lint` runs `knip`, which reports `Unresolved imports (3)` for the virtual `$` module (`import ... from "$"`) in `src/main.ts`, `src/core/store/store.ts` and `src/utils/gm-storage.ts`. These are false positives — vite-plugin-monkey provides the `$` GM API virtual module at build time — and can be safely ignored.
- Network requests (Bilibili API, e.g. `src/core/api/bilibili-user.ts`) use native `fetch` with `credentials: "include"` to read the login state.
- `__IS_DEBUG__`, `__VERSION__` → compile-time defines in vite.config.ts
- `externalGlobals` in vite.config.ts → alpinejs, opencc-js, query-selector-shadow-dom-modern are CDN-loaded (must have a UMD build exposing a global; it ships `dist/umd/index.min.js` → global `querySelectorShadowDom`). `@alpinejs/persist` is NOT externalized (CDN build auto-registers via `alpine:init`, no global).
- No `beforeunload` listener — data persists via real-time saves + GM_addValueChangeListener
- `ensureUser()` returns temp object without saving to store; only `updateUser()` persists
- HTML files are minified at build time via custom Vite plugin (transform `?raw` imports)
- CSS uses LightningCSS with browserslist targets; shared styles use Constructable Stylesheets
- Dead code = any function/class not imported anywhere under `src/`

- For non-DOM operations (store queries, search, selection, export, refresh) in debug builds, use the exposed Alpine store — `window.$biliMemoAlpine.store('userList')`, or the quick accessor `$$biliMemo` (returns the store) — instead of manipulating DOM. Both are injected only in debug (`__IS_DEBUG__`). When preload-all-cards is off (dev), the list is empty until loaded: `await $$biliMemo.ensureUsersLoaded()` first.
- Panel list search matches nickname, memo, memoDetail and UID (via `matchesChineseSearch`); when a query hits the detailed memo, the card renders a highlighted snippet of the matched text (detailed-memo fragment + `<mark>`)
- Deleted-user filter: `userList.deletedFilter` (`"all" | "deleted" | "active"`) provides a tri-state dropdown (All / Deleted only / Hide deleted); shown only when `hasDeletedUsers` is true, and resets to `"all"` each time the panel opens (not persisted). `isDeleted` is synced by data refresh (`getUserInfo` returns `false` for normal accounts, `true` for deleted), correcting the flag in both directions.
- Dark theme is pure-CSS: JS only toggles the `dark` class on `<html>` (`applyTheme()` in `src/features/panel/custom-css.ts`); all dark visuals live under `html.dark`. `src/styles/global.css` holds the light tokens in `:root` and their dark overrides in `html.dark`; components consume semantic variables (`--surface-bg`, `--card-shadow`, `--fill-hover`, `--on-primary`, …) instead of writing per-theme rules. Only genuinely non-tokenizable tweaks (`box-shadow: none`, `border-width`, extra property in one theme) use `html.dark &` nested rules inside the component block. Never reintroduce a theme class like `.memo-container-dark-theme` or theme branches in TS/HTML (`x-show="isDark"`).
- Stylesheets use native CSS nesting (kept as-is by lightningcss — browserslist is "last 2 versions", so no flattening). After adding flat rules, re-nest with the NYCSS CLI: `npx @nycss/cli "src/styles/*.css" --out-dir <tmp> -m nest -i 2 -c -d 3`, then move comments back inside the blocks (the engine relocates standalone comments).

## Rule system

- `StyleScope.Minimal` → adds CSS classes to the original DOM element (no wrapper)
- `StyleScope.Editable` → creates a `<span class="editable-textarea">` wrapper after the original element, hides original
- `container` → optional scope selector, accepts `string | string[]` (multiple containers); `buildMergedSelector` generates one prefixed selector per container, and matches are validated via `el.closest(containerSelectorList(container))`. Rules without `container` scan globally. All rules share one `setInterval` (750ms) scanning via `buildMergedSelector`
- `matchByName` → fallback to name-based lookup when UID is unavailable; requires `textSelector`
- `uidResolver` / `originalNameResolver` → custom extraction for non-standard DOM structures

## Gotchas

- pnpm 11 `remove`/`install` may fail with `ERR_PNPM_RESOLUTION_POLICY_VIOLATIONS_UNHANDLED` (internal bug: minimumReleaseAge policy has no handler in the remove path) → append `--config.minimumReleaseAge=0`
- pnpm picks the nearest ancestor `.pnpm-store` as store; since `/mnt/data/.pnpm-store` is the real one the project's `node_modules` links from, commands run from an env where HOME differs may want to purge `node_modules` (`ERR_PNPM_UNEXPECTED_STORE`) → pin `--store-dir=/mnt/data/.pnpm-store/v11` (or set `CI=true` only when you really intend a relink); never let it silently re-download into `<project>/.pnpm-store`
- Windows Chrome: `@supports (cursor: context-menu)` returns true but renderer can't draw it → use JS UA detection for fallback
- Bilibili CDN supports CORS (`access-control-allow-origin: *`) → can read pixel data from cross-origin `<img>` with `crossorigin="anonymous"`
- `a.bili-memo-tag` may render as `<a>` in mention scenarios → CSS must handle both
- Panel toggle button cursor: base is `context-menu` with `.is-windows-chrome` override to `cursor: help`
- memoDetail title sync: `syncRenderedNodeState` appends `详细备注：` to element title, uses `\n` separator for existing titles
- `readPreferredText` (src/core/dom/text-utils.ts) prefers live `textContent` over `data-bilimemo-original`; the data attr is only a fallback when DOM text is empty (avoids stale names read from reused DOM nodes)
- Panel user cards (`.user-box`) use `content-visibility: auto` + `contain-intrinsic-size: auto 72px` to skip off-screen rendering, reducing list jank when there are many cards.
