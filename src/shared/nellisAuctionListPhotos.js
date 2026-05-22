/**
 * Captures Nellis Remix `_data` loader JSON to build per-item photo URL lists.
 * - Dashboard lists: `myAuctions.records[]`, `dealAuctions.records[]`, `noBidAuctions.records[]` (`photos[].url`)
 * - Spotlight (`/spotlight/*`): same record shapes; loaders `routes/spotlight.*`
 * - Search / saved-searches: `products[].photos[]` or `products[].product.photos[]`
 * - Item pages: `item` / `listing` / loader-shaped objects with `photos` for the current product id
 * - Close times: same loaders often include `closeTime` (Remix `Date` shape or ISO) per item row
 * - Watchlist: `watchlistCount` on list/product rows (number of users who saved the item)
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

function pickNellisTitleFromRecord(record) {
  if (!record || typeof record !== 'object') {
    return '';
  }
  const nested = [record.listing, record.product, record.item].filter(Boolean);
  const candidates = [
    record.leadDescription,
    record.title,
    record.name,
    ...nested.flatMap((node) => [
      node.leadDescription,
      node.title,
      node.name,
    ]),
  ];
  for (const c of candidates) {
    if (typeof c === 'string') {
      const t = c.trim();
      if (t) {
        return t;
      }
    }
  }
  return '';
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

/**
 * Finds a human-readable listing title for the current `/p/.../id` item in Remix loader JSON.
 * Prefer this over DOM scraping when available — layout changes won’t break the search query.
 */
export function extractNellisItemTitleFromRemixPayload(payload, pageItemId) {
  if (!pageItemId || !payload || typeof payload !== 'object') {
    return '';
  }

  let found = '';
  const seen = new WeakSet();

  const tryRecord = (record) => {
    if (!record || typeof record !== 'object' || found) {
      return;
    }
    const id = resolveRecordItemId(record);
    if (!id || id !== pageItemId) {
      return;
    }
    const t = pickNellisTitleFromRecord(record);
    if (t) {
      found = t;
    }
  };

  function walk(node, depth) {
    if (found || depth > 14 || node == null || typeof node !== 'object') {
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

    tryRecord(node);

    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') {
        walk(v, depth + 1);
      }
    }
  }

  walk(payload, 0);
  return found;
}

function parseRemixCloseTime(raw) {
  if (raw == null || raw === '') {
    return null;
  }
  if (typeof raw === 'string') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'object') {
    if (raw.__type === 'Date' && typeof raw.value === 'string') {
      const d = new Date(raw.value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function pickCloseTimeFromRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const candidates = [
    record.closeTime,
    record.endTime,
    record.auctionEndTime,
    record.listing?.closeTime,
    record.item?.closeTime,
    record.product?.closeTime,
    record.auction?.closeTime,
  ];
  for (const c of candidates) {
    const d = parseRemixCloseTime(c);
    if (d) {
      return d;
    }
  }
  return null;
}

/** Same formatting as the legacy HTML scrape path for `data-time-tooltip`. */
export function formatNellisCloseTimeTooltip(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Walks Remix loader JSON and merges formatted close-time tooltips into `intoMap` keyed by Nellis item id.
 * @returns {boolean} true if the map changed
 */
export function mergeCloseTimeFromRemixPayload(payload, intoMap) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  let changed = false;
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

    const id = resolveRecordItemId(node);
    const closeDate = pickCloseTimeFromRecord(node);
    if (id && closeDate) {
      const text = formatNellisCloseTimeTooltip(closeDate);
      if (intoMap.get(id) !== text) {
        intoMap.set(id, text);
        changed = true;
      }
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

function parseWatchlistCount(raw) {
  if (raw == null || raw === '') {
    return null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    return Number.parseInt(raw, 10);
  }
  return null;
}

function pickWatchlistCountFromRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const candidates = [
    record.watchlistCount,
    record.item?.watchlistCount,
    record.product?.watchlistCount,
  ];
  for (const c of candidates) {
    const n = parseWatchlistCount(c);
    if (n !== null) {
      return n;
    }
  }
  return null;
}

/**
 * Walks Remix loader JSON and merges watchlist viewer counts into `intoMap` keyed by Nellis item / product id.
 * @returns {boolean} true if the map changed
 */
export function mergeWatchlistCountFromRemixPayload(payload, intoMap) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  let changed = false;
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

    const id = resolveRecordItemId(node);
    const wc = pickWatchlistCountFromRecord(node);
    if (id && wc !== null) {
      if (intoMap.get(id) !== wc) {
        intoMap.set(id, wc);
        changed = true;
      }
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

function pickNonRefundableFromRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const candidates = [
    record.nonRefundable,
    record.non_refundable,
    record.isNonRefundable,
    record.is_non_refundable,
    record.item?.nonRefundable,
    record.item?.non_refundable,
    record.listing?.nonRefundable,
    record.listing?.non_refundable,
    record.product?.nonRefundable,
    record.product?.non_refundable,
  ];

  for (const c of candidates) {
    if (typeof c === 'boolean') {
      return c;
    }
    if (typeof c === 'string') {
      const v = c.trim().toLowerCase();
      if (v === 'true') {
        return true;
      }
      if (v === 'false') {
        return false;
      }
    }
    if (typeof c === 'number') {
      if (c === 1) {
        return true;
      }
      if (c === 0) {
        return false;
      }
    }
  }

  return null;
}

/**
 * Walks Remix loader JSON and merges non-refundable flags into `intoMap` keyed by Nellis item / product id.
 * @returns {boolean} true if the map changed
 */
export function mergeNonRefundableFromRemixPayload(payload, intoMap) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  let changed = false;
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

    const id = resolveRecordItemId(node);
    const flag = pickNonRefundableFromRecord(node);
    if (id && flag !== null) {
      if (intoMap.get(id) !== flag) {
        intoMap.set(id, flag);
        changed = true;
      }
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
