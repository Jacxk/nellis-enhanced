# Nellis Enhanced

Chromium-first browser extension that injects an Amazon comparison module into Nellis Auction item pages, with a Firefox target sharing the same core logic.

## What It Does

- Detects Nellis item pages inside the site SPA.
- Inserts a low-noise comparison card directly under the `Item Details` section.
- Matches Amazon items by Nellis title for now.
- Shows Amazon image, title, price, and a direct link to the item.
- Keeps Amazon lookup logic isolated so you can replace it later without touching DOM code.

## Structure

```text
src/
  chromium/
    background.js
    contentScript.js
    manifest.json
  firefox/
    background.js
    contentScript.js
    manifest.json
  shared/
    amazonSource.js
    extensionApi.js
    backgroundMain.js
    nellisPage.js
    productMatcher.js
scripts/
  build.js
dist/
```

## Build

```bash
pnpm install
pnpm run build:chromium
pnpm run build:firefox
```

Load [dist/manifest.json](/Users/yanluisfermin/.codex/worktrees/4e39/nellis-amazon-compare/dist/manifest.json) as an unpacked extension in a Chromium browser.

For Firefox, open `about:debugging#/runtime/this-firefox` and load [dist/manifest.json](/Users/yanluisfermin/.codex/worktrees/4e39/nellis-amazon-compare/dist/manifest.json) as a temporary add-on after running `pnpm run build:firefox`.

## Editable Amazon Lookup

The only function you should need to replace later is `getAmazonItem()` in [src/shared/amazonSource.js](/Users/yanluisfermin/.codex/worktrees/4e39/nellis-amazon-compare/src/shared/amazonSource.js).

Keep this return shape:

```js
{
  title: string,
  price: string,
  url: string,
  imageSrc: string
}
```

If you swap from HTML fetching to your own API, leave the rest of the extension alone.

## Notes

- The current implementation uses Amazon search HTML and title-based matching.
- If Amazon blocks requests or changes markup, replace `getAmazonItem()` with your API-backed logic.
- Firefox support now lives in `src/firefox/` while reusing the shared DOM, lookup, and background logic.
