# Nellis Enhanced

**Nellis Enhanced** is a Chromium extension that improves the browsing experience on `nellisauction.com` with quality-of-life UI enhancements.

## Features

- **Amazon comparison card**: injects an Amazon match under **Item Details** on item pages.
- **Dark mode**: site-wide dark styling with a persistent toggle.
- **Receipts totals summary**: shows **spent / returned / total** at a glance on the Receipts page.
- **Cart sort UI improvements**: cart sort dropdown is styled to match Nellis’ native dropdowns.
- **SPA-aware injection**: re-applies enhancements as Nellis navigates without full page loads.
- **Extra helpers**: small UI hints (e.g. bid/price helpers) to reduce friction while browsing.

## Install (Chrome / Chromium browsers)

This extension is distributed as a **zip** containing the unpacked extension folder. Install it by loading it as an unpacked extension.

### Step-by-step (dummy proof)

1. Download the latest release asset from **Latest Release**:
   - **Latest Release**: [github.com/Jacxk/nellis-enhanced/releases/latest](https://github.com/Jacxk/nellis-enhanced/releases/latest)
   - Look for: `nellis-enhanced-<tag>-chromium.zip`
2. Unzip the downloaded file to a folder you will keep (Desktop is fine, but don’t delete it later).
3. Open your extensions page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
4. Turn on **Developer mode** (toggle in the top-right).
5. Click **Load unpacked**.
6. Select the **unzipped folder** that contains `manifest.json` directly inside it.
   - If you don’t see `manifest.json`, you picked the wrong folder level. Go “up” or “down” until you do.

To update later, download/unzip the new release and either:
- remove + re-add the unpacked extension pointing at the new folder, or
- keep the same folder path and replace its contents, then click **Reload** on the extension card.

### Troubleshooting

- **“Manifest file is missing or unreadable”**
  - You selected the wrong folder. You must select the folder that has `manifest.json` directly inside it.
- **“Load unpacked” is missing**
  - Turn on **Developer mode** on the extensions page first.
- **The extension worked, then stopped after deleting the unzip folder**
  - Unzip to a permanent folder (the browser loads the extension from that exact path).

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
