# Nellis Enhanced

Chromium extension that injects an Amazon comparison module into Nellis Auction item pages.

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
  shared/
    amazonSource.js
    extensionApi.js
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
```

Load [dist/manifest.json](/Users/yanluisfermin/Documents/Projects/nellis-amazon-compare/dist/manifest.json) as an unpacked extension in a Chromium browser.

## Editable Amazon Lookup

The only function you should need to replace later is `getAmazonItem()` in [src/shared/amazonSource.js](/Users/yanluisfermin/Documents/Projects/nellis-amazon-compare/src/shared/amazonSource.js).

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
- Firefox support can be added by creating a `src/firefox/` adapter layer while reusing `src/shared/`.
