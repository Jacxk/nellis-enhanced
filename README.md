# Nellis Enhanced

**Nellis Enhanced** is a Chromium extension that improves the browsing experience on `nellisauction.com` with quality-of-life UI enhancements.

## Features

- **Amazon comparison card**: injects an Amazon match under **Item Details** on item pages.
- **Dark mode**: site-wide dark styling with a persistent toggle.
- **SPA-aware injection**: re-applies enhancements as Nellis navigates without full page loads.
- **Extra helpers**: small UI hints (e.g. bid/price helpers) to reduce friction while browsing.

## Install (Chrome / Chromium browsers)

This extension is distributed as a **zip** containing the unpacked extension folder. Install it by loading it as an unpacked extension.

1. Download the latest release asset (`nellis-enhanced-<tag>-chromium.zip`) from **GitHub Releases**.
2. Unzip it somewhere permanent on your machine (don’t delete the folder after installing).
3. Open `chrome://extensions/` (or `edge://extensions/`).
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the **unzipped folder** (the one that contains `manifest.json` at its root).

To update later, download/unzip the new release and either:
- remove + re-add the unpacked extension pointing at the new folder, or
- keep the same folder path and replace its contents, then click **Reload** on the extension card.

## Development / build from source

```bash
pnpm install
pnpm run build:chromium
```

Then load `dist/` as an unpacked extension (it contains `manifest.json`).

## Structure

```text
src/
  chromium/
    background.js
    contentScript.js
    manifest.json
  shared/
    amazonSource.js
    extensionApi.js
    nellisPage.js
    productMatcher.js
scripts/
  build.js
dist/
```

## Editable Amazon Lookup

The primary seam for swapping Amazon matching logic is `getAmazonItem()` in `src/shared/amazonSource.js`.

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

## Notes / compatibility

- The current implementation uses Amazon search HTML and title-based matching.
- If Amazon blocks requests or changes markup, replace `getAmazonItem()` with your API-backed logic.
- Firefox support can be added by creating a `src/firefox/` adapter layer while reusing `src/shared/`.
