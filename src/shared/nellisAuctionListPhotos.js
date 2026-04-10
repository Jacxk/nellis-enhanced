/**
 * Captures Nellis Remix `_data` loader JSON to build per-item photo URL lists.
 * - Dashboard lists: `myAuctions.records[]`, `dealAuctions.records[]`, `noBidAuctions.records[]` (`photos[].url`)
 * - Spotlight (`/spotlight/*`): same record shapes; loaders `routes/spotlight.*`
 * - Search / saved-searches: `products[].photos[]` or `products[].product.photos[]`
 * - Item pages: `item` / `listing` / loader-shaped objects with `photos` for the current product id
 */

const ITEM_PATH_RE = /^\/p\/[^/]+\/(\d+)\/?$/;

/**
 * Known `_data` routes (decoded). Any `routes/dashboard.auctions.*` loader is also
 * accepted via {@link shouldParseNellisAuctionRemixDataKey} (watchlist, won, etc.).
 */
export const AUCTION_LIST_LOADER_ROUTES = new Set([
  'routes/dashboard.auctions.active',
  'routes/dashboard.auctions.watchlist',
]);

/** True for dashboard auction Remix loaders (active, watchlist, won, …). */
export function shouldParseNellisAuctionRemixDataKey(dataKey) {
  if (!dataKey || typeof dataKey !== 'string') {
    return false;
  }
  if (AUCTION_LIST_LOADER_ROUTES.has(dataKey)) {
    return true;
  }
  return dataKey.startsWith('routes/dashboard.auctions.');
}

/** Loader `_data` values for search / product listing (shape: `products[].photos`). */
export function shouldParseNellisSearchRemixDataKey(dataKey) {
  if (!dataKey || typeof dataKey !== 'string') {
    return false;
  }
  if (!dataKey.startsWith('routes/')) {
    return false;
  }
  return dataKey.includes('search');
}

/** Spotlight pages: `dealAuctions` / `noBidAuctions` loaders (`routes/spotlight.deals`, `first-bid`, …). */
export function shouldParseNellisSpotlightRemixDataKey(dataKey) {
  if (!dataKey || typeof dataKey !== 'string') {
    return false;
  }
  return dataKey.startsWith('routes/spotlight.');
}

export function parseNellisItemIdFromPathname(pathname) {
  if (!pathname || typeof pathname !== 'string') {
    return null;
  }
  const match = pathname.match(ITEM_PATH_RE);
  return match ? match[1] : null;
}

export function parseNellisItemIdFromHref(href) {
  if (!href || typeof href !== 'string') {
    return null;
  }
  try {
    const u = new URL(href, 'https://www.nellisauction.com');
    const match = u.pathname.match(ITEM_PATH_RE);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function collectUrlsFromPhotos(photos) {
  if (!Array.isArray(photos)) {
    return [];
  }
  const out = [];
  for (const entry of photos) {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (typeof url === 'string' && url.trim()) {
      out.push(url.trim());
    }
  }
  return out;
}

function resolveRecordItemId(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const candidates = [
    record.itemId,
    record.item_id,
    record.productId,
    record.product_id,
    record.listingId,
    record.listing_id,
    record.id,
    record.auctionId,
    record.auction_id,
    record.item?.id,
  ];
  for (const c of candidates) {
    if (c != null && /^\d+$/.test(String(c))) {
      return String(c);
    }
  }
  const linkish = record.href || record.url || record.path || record.item?.href;
  if (typeof linkish === 'string') {
    return parseNellisItemIdFromHref(linkish);
  }
  return null;
}

function mergePhotoLists(prev, next) {
  const seen = new Set();
  const out = [];
  for (const list of [prev, next]) {
    if (!list) {
      continue;
    }
    for (const u of list) {
      if (u && !seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  }
  return out;
}

function pushRecordsFromKeyedBucket(node, key, records) {
  const bucket = node[key];
  if (bucket && Array.isArray(bucket.records)) {
    records.push(...bucket.records);
  }
}

function collectAuctionListRecordsDeep(payload) {
  const records = [];
  const seen = new WeakSet();

  function walk(node, depth) {
    if (depth > 14 || !node || typeof node !== 'object') {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);

    if (Array.isArray(node)) {
      for (const el of node) {
        walk(el, depth + 1);
      }
      return;
    }

    pushRecordsFromKeyedBucket(node, 'myAuctions', records);
    pushRecordsFromKeyedBucket(node, 'dealAuctions', records);
    pushRecordsFromKeyedBucket(node, 'noBidAuctions', records);

    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') {
        walk(v, depth + 1);
      }
    }
  }

  walk(payload, 0);
  return records;
}

/**
 * Merges auction list loader records (`myAuctions` / `dealAuctions` / `noBidAuctions`) into `intoMap`.
 * @returns {boolean} true if the map changed
 */
export function mergeAuctionListPhotoPayload(payload, intoMap) {
  let records = collectAuctionListRecordsDeep(payload);
  if (!records.length) {
    const chunks = [];
    if (Array.isArray(payload?.myAuctions?.records)) {
      chunks.push(...payload.myAuctions.records);
    }
    if (Array.isArray(payload?.dealAuctions?.records)) {
      chunks.push(...payload.dealAuctions.records);
    }
    if (Array.isArray(payload?.noBidAuctions?.records)) {
      chunks.push(...payload.noBidAuctions.records);
    }
    records = chunks;
  }
  if (!Array.isArray(records) || !records.length) {
    return false;
  }

  let changed = false;
  for (const record of records) {
    const id = resolveRecordItemId(record);
    if (!id) {
      continue;
    }
    const urls = collectUrlsFromPhotos(record.photos);
    if (!urls.length) {
      continue;
    }
    const prev = intoMap.get(id);
    const merged = mergePhotoLists(prev, urls);
    if (
      !prev ||
      merged.length !== prev.length ||
      merged.some((u, i) => u !== prev[i])
    ) {
      intoMap.set(id, merged);
      changed = true;
    }
  }
  return changed;
}

function collectProductsDeep(payload) {
  const products = [];
  const seen = new WeakSet();

  function walk(node, depth) {
    if (depth > 14 || !node || typeof node !== 'object') {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);

    if (Array.isArray(node)) {
      for (const el of node) {
        walk(el, depth + 1);
      }
      return;
    }

    if (Array.isArray(node.products)) {
      products.push(...node.products);
    }

    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') {
        walk(v, depth + 1);
      }
    }
  }

  walk(payload, 0);
  return products;
}

function resolveProductRowPhotosAndId(record) {
  if (!record || typeof record !== 'object') {
    return { id: null, urls: [] };
  }

  let urls = collectUrlsFromPhotos(record.photos);
  let id = resolveRecordItemId(record);

  const inner = record.product;
  if (inner && typeof inner === 'object') {
    urls = mergePhotoLists(urls, collectUrlsFromPhotos(inner.photos));
    if (!id) {
      id = resolveRecordItemId(inner);
    }
  }

  return { id, urls };
}

/**
 * Merges `products[]` rows (flat or nested `product.photos`, e.g. saved-searches) into `intoMap`.
 * @returns {boolean} true if the map changed
 */
export function mergeProductsPhotoPayload(payload, intoMap) {
  let products = collectProductsDeep(payload);
  if (!products.length && Array.isArray(payload?.products)) {
    products = payload.products;
  }
  if (!Array.isArray(products) || !products.length) {
    return false;
  }

  let changed = false;
  for (const record of products) {
    const { id, urls } = resolveProductRowPhotosAndId(record);
    if (!id || !urls.length) {
      continue;
    }
    const prev = intoMap.get(id);
    const merged = mergePhotoLists(prev, urls);
    if (
      !prev ||
      merged.length !== prev.length ||
      merged.some((u, i) => u !== prev[i])
    ) {
      intoMap.set(id, merged);
      changed = true;
    }
  }
  return changed;
}

/**
 * Merges photo URLs from item / product / listing-shaped loader data for the current `/p/.../id` page.
 * @returns {boolean} true if the map changed
 */
export function mergeNellisItemPagePhotoPayload(payload, pageItemId, intoMap) {
  if (!pageItemId || !payload || typeof payload !== 'object') {
    return false;
  }

  let changed = false;
  const seen = new WeakSet();

  const tryRecord = (record) => {
    if (!record || typeof record !== 'object' || !Array.isArray(record.photos)) {
      return;
    }
    const id = resolveRecordItemId(record);
    if (!id || id !== pageItemId) {
      return;
    }
    const urls = collectUrlsFromPhotos(record.photos);
    if (!urls.length) {
      return;
    }
    const prev = intoMap.get(pageItemId);
    const merged = mergePhotoLists(prev, urls);
    if (
      !prev ||
      merged.length !== prev.length ||
      merged.some((u, i) => u !== prev[i])
    ) {
      intoMap.set(pageItemId, merged);
      changed = true;
    }
  };

  function walk(node, depth) {
    if (depth > 14 || node == null || typeof node !== 'object') {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);

    if (Array.isArray(node)) {
      for (const el of node) {
        walk(el, depth + 1);
      }
      return;
    }

    if (Array.isArray(node.photos)) {
      tryRecord(node);
    }

    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') {
        walk(v, depth + 1);
      }
    }
  }

  walk(payload, 0);
  return changed;
}
