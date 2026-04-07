# AGENTS.md

This repository is a **Chromium browser extension** ("Nellis Enhanced") that injects UI and behavior into `nellisauction.com` pages (primarily item pages), including an **Amazon comparison card** and a **site-wide dark mode**.

This file is a condensed, high-signal handoff for future coding agents.

## What this extension does

- **Detects Nellis pages in an SPA** and re-applies enhancements when the DOM changes.
- **Injects an Amazon comparison module** under the "Item Details" section on item pages.
- **Provides a dark mode** that restyles Nellis’ Tailwind-heavy UI plus some CSS-module components.

## Repo structure (high-level)

- `src/chromium/`
  - `contentScript.js`: primary injection point (DOM mutations, UI insertion, dark mode, styles)
  - `background.js`: background logic (if any)
  - `manifest.json`: extension manifest
- `src/shared/`
  - `nellisPage.js`: page detection + DOM extraction helpers (selectors, parsing)
  - `amazonSource.js`: Amazon lookup (intentionally isolated for replacement)
  - `productMatcher.js`: title matching
  - `extensionApi.js`: shared extension API helpers
- `scripts/build.js`: esbuild bundling into `dist/`

## Build / dev loop

- **Install**: `pnpm install`
- **Build**: `pnpm run build:chromium`
- **Watch**: `pnpm run watch:chromium`
- Output is written to `dist/` (load unpacked extension from that folder).

## Core implementation notes (content script)

### The "center of gravity" file

Most behavior lives in `src/chromium/contentScript.js`:

- Creates/inserts UI
- Watches for SPA navigation/DOM changes
- Injects a single `<style>` tag (dark mode + component styling)

### Dark mode: key concepts

- **Mode flag**: a class on the root element
  - `document.documentElement.classList.toggle('nellis-dark-mode', enabled)`
  - Class name constant: `nellis-dark-mode` (commonly referenced as `DARK_MODE_HTML_CLASS`)
- **Persistence**: stored boolean in extension storage
  - Storage key: `nellisAuctionDarkMode`
- **Initialization**:
  - `applyStoredDarkMode()` loads storage and applies the root class
- **User control**:
  - Toggle UI is created by `renderDarkModeToggleButtons()`
  - Toggle element IDs/classes used by the script:
    - `#nellis-dark-mode-toggle`
    - `.nellis-dark-mode-toggle`
  - Toggle uses a **fixed-position FAB** (placed **bottom-left**) to avoid overlapping site controls.
  - The icon is swapped by setting `innerHTML` (moon/sun SVG).

### Dark mode styling approach

All styling is injected from inside `injectStyles()` as a single style tag (id tied to `STYLE_ID`).

General strategy used throughout the CSS:

- Prefer **scoped selectors** under `html.nellis-dark-mode ...` so nothing affects light mode.
- Prefer **class token** matching for Tailwind utilities:
  - Use `[class~="bg-neutral-100"]` (token match) rather than `[class*="bg-neutral-100"]`
  - This avoids false positives like `hover:bg-neutral-100`
- Use targeted overrides for CSS-module components where Tailwind utilities aren’t present.
- When SVGs are hard to read, add rules that set `fill`/`stroke` for SVGs without `fill-*` classes.

### Dark mode: site-specific overrides already implemented

The injected CSS includes targeted overrides for:

- **Sidebar navigation**
  - Only `aria-current` row should appear "selected"
  - Hover false-positives were avoided using `[class~="..."]` selectors
- **Notifications (unread)** (e.g. `bg-sincity-red-50`)
- **Won cards** (emerald/orange accents)
- **Appointments card** (`data-ax="appointments-card"` and `__my-appointments-*` CSS modules)
  - Explicit dark background, border, radius, shadow
- **Sticky filters bar**: make a very specific sticky “Filters” row transparent
- **Search refine column**: improve icon contrast, star colors, default SVG path fill fallback
- **Location / hours card** containing an embedded Google Map (`__location-hours-card`)
  - Card shell + text contrast
  - Darkens the map placeholder strip (`rgb(229, 227, 223)` → `#2a2a2a`)
  - Keeps Google Maps controls/attribution readable without touching map tiles

If you need to add a new fix:

- Find the closest existing section in `injectStyles()` (Tailwind vs CSS-module vs semantic card).
- Add **minimal selectors** first; only broaden if you can’t catch all variants.
- Prefer targeting by `data-ax="..."` attributes if available (more stable than CSS-module names).

## Shared helpers (Nellis page detection and extraction)

`src/shared/nellisPage.js` contains:

- `isNellisAuctionSite()`:
  - `www.nellisauction.com` or `nellisauction.com`
- `isNellisItemPage()`:
  - checks host and path like `/p/<slug>/<id>`
- Extractors/targets:
  - `extractNellisItem()`, `findNellisPriceTargets()`, `findNellisTimeTargets()`, `findItemDetailsAnchor()`
  - `parseCurrencyAmount()` for price parsing

## “Don’t break this” constraints

- Keep all page styling changes behind `html.nellis-dark-mode` gating.
- When writing Tailwind selectors, prefer `[class~="token"]` to avoid matching `hover:` / breakpoint variants.
- Google Maps DOM is complex and includes inline styles; only style the **wrapper/card** and **control chrome** narrowly.
- Don’t hard-code `device_id`-style identifiers; prefer `data-ax`, roles, and stable structural anchors.

## Quick verification checklist

- `pnpm run build:chromium` succeeds
- Dark mode toggle:
  - Persists across reloads (storage key `nellisAuctionDarkMode`)
  - Doesn’t overlap site controls on desktop/mobile (FAB placement)
- Major pages:
  - Item page card + bidding area remain readable
  - Sidebar selected state is correct (`aria-current`)
  - Embedded map card is readable (controls/attribution visible)

