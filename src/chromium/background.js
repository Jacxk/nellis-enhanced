import { fetchAmazonHtml, fetchAmazonSearchHtml } from '../shared/amazonSource.js';

const notificationUrlById = new Map();
const NOTIFICATIONS_STORAGE_KEY = 'nellisAuctionNotificationsEnabled';
const OUTBID_STORAGE_KEY = 'nellisAuctionOutbidNotificationsEnabled';
const NOTIFICATIONS_ALARM_NAME = 'nellis-auction-notifications';
const THREE_MINUTES_MS = 3 * 60 * 1000;
const ACTIVE_AUCTIONS_URL = 'https://nellisauction.com/dashboard/auctions/active';
const OUTBID_AUCTIONS_URL = 'https://nellisauction.com/dashboard/auctions/outbid';


function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const NELLIS_HOST_SUFFIXES = ['nellisauction.com', 'www.nellisauction.com'];

function isAllowedNellisUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:') {
      return false;
    }
    return NELLIS_HOST_SUFFIXES.includes(u.hostname);
  } catch {
    return false;
  }
}

/** Normalize host for dedupe so www vs apex share one in-flight GET. */
function nellisDedupeUrlKey(urlString) {
  const u = new URL(urlString);
  const host = u.hostname.replace(/^www\./, '');
  return `${u.protocol}//${host}${u.pathname}${u.search}`;
}

async function fetchNellisWith429Retry(url, init, { maxRetries = 5, baseDelayMs = 1500 } = {}) {
  let lastResponse;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    lastResponse = await fetch(url, {
      ...init,
      credentials: 'include',
      redirect: 'follow',
    });
    if (lastResponse.status !== 429) {
      return lastResponse;
    }
    if (attempt >= maxRetries) {
      return lastResponse;
    }
    const backoff =
      baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 400);
    await sleep(backoff);
  }
  return lastResponse;
}

/** @type {Map<string, Promise<{ ok: boolean; status: number; statusText: string; bodyText: string }>>} */
const nellisGetInflight = new Map();

let nellisQueueTail = Promise.resolve();

const NELLIS_MIN_GAP_MS = 180;

function enqueueNellisRequest(fn) {
  const run = nellisQueueTail.then(async () => {
    try {
      return await fn();
    } finally {
      await sleep(NELLIS_MIN_GAP_MS);
    }
  });
  nellisQueueTail = run.catch(() => {});
  return run;
}

const ALLOWED_NELLIS_METHODS = new Set(['GET', 'POST', 'HEAD']);

async function runProxiedNellisFetch({ url, method, headers, body }) {
  if (!isAllowedNellisUrl(url)) {
    throw new Error('Blocked Nellis proxy URL.');
  }
  const m = ALLOWED_NELLIS_METHODS.has(method) ? method : 'GET';
  const fetchInit = {
    method: m,
    headers: headers && typeof headers === 'object' ? headers : undefined,
    body: m === 'GET' || m === 'HEAD' ? undefined : body,
  };

  const work = async () => {
    const response = await fetchNellisWith429Retry(url, fetchInit);
    const bodyText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText || '',
      bodyText,
    };
  };

  if (m === 'GET' || m === 'HEAD') {
    const key = `${m}:${nellisDedupeUrlKey(url)}`;
    const existing = nellisGetInflight.get(key);
    if (existing) {
      return existing;
    }
    const p = enqueueNellisRequest(work).finally(() => {
      if (nellisGetInflight.get(key) === p) {
        nellisGetInflight.delete(key);
      }
    });
    nellisGetInflight.set(key, p);
    return p;
  }

  return enqueueNellisRequest(work);
}

/**
 * Amazon: timeout + retry + queue + dedupe.
 */
const AMAZON_FETCH_TIMEOUT_MS = 15000;

function createRetryingFetch({ maxRetries = 4, baseDelayMs = 2000 } = {}) {
  return async (resource, init) => {
    let lastResponse;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), AMAZON_FETCH_TIMEOUT_MS);

      try {
        lastResponse = await fetch(resource, {
          ...init,
          signal: timeoutController.signal,
        });
        lastError = undefined;

        if (lastResponse.status !== 429) {
          return lastResponse;
        }
        if (attempt >= maxRetries) {
          return lastResponse;
        }
      } catch (error) {
        lastError = error;
        if (attempt >= maxRetries) {
          throw error;
        }
      } finally {
        clearTimeout(timeoutId);
      }

      const backoff =
        baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 500);
      await sleep(backoff);
    }
    if (lastError) {
      throw lastError;
    }
    return lastResponse;
  };
}

const retryingFetch = createRetryingFetch();

/** @type {Map<string, Promise<unknown>>} */
const amazonInflight = new Map();

let amazonQueueTail = Promise.resolve();

const AMAZON_MIN_GAP_MS = 700;

function enqueueAmazonRequest(fn) {
  const run = amazonQueueTail.then(async () => {
    try {
      return await fn();
    } finally {
      await sleep(AMAZON_MIN_GAP_MS);
    }
  });
  amazonQueueTail = run.catch(() => {});
  return run;
}

function normalizeAmazonTitle(title) {
  return typeof title === 'string' ? title.trim().replace(/\s+/g, ' ') : '';
}

function getAmazonDedupeKey(type, message) {
  if (type === 'FETCH_AMAZON_SEARCH_HTML') {
    const t = normalizeAmazonTitle(message.title);
    return `search:${t}`;
  }
  if (type === 'FETCH_AMAZON_PRODUCT_HTML') {
    const u = typeof message.url === 'string' ? message.url.trim() : '';
    return `product:${u}`;
  }
  return '';
}

function runDedupedAmazon(type, message, work) {
  const key = getAmazonDedupeKey(type, message);
  const existing = amazonInflight.get(key);
  if (existing) {
    return existing;
  }
  const p = enqueueAmazonRequest(work).finally(() => {
    if (amazonInflight.get(key) === p) {
      amazonInflight.delete(key);
    }
  });
  amazonInflight.set(key, p);
  return p;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message?.type !== 'FETCH_AMAZON_SEARCH_HTML' &&
    message?.type !== 'FETCH_AMAZON_PRODUCT_HTML' &&
    message?.type !== 'FETCH_NELLIS' &&
    message?.type !== 'FETCH_PURCHASES_PAGE' &&
    message?.type !== 'POST_NOTIFICATION' &&
    message?.type !== 'GET_NOTIFICATION_PERMISSION_LEVEL' &&
    message?.type !== 'SET_AUCTION_NOTIFICATIONS_ENABLED'
  ) {
    return false;
  }

  (async () => {
    if (message?.type === 'FETCH_NELLIS') {
      const url = typeof message.url === 'string' ? message.url : '';
      const method =
        typeof message.method === 'string' ? message.method.toUpperCase() : 'GET';
      const payload = await runProxiedNellisFetch({
        url,
        method,
        headers: message.headers,
        body: message.body,
      });
      sendResponse(payload);
      return;
    }

    let payload;
    if (message?.type === 'FETCH_AMAZON_PRODUCT_HTML') {
      const url = typeof message.url === 'string' ? message.url : '';
      payload = await runDedupedAmazon(message.type, message, () =>
        fetchAmazonHtml(url, { fetchImpl: retryingFetch })
      );
    } else if (message?.type === 'FETCH_AMAZON_SEARCH_HTML') {
      const title = typeof message.title === 'string' ? message.title : '';
      payload = await runDedupedAmazon(message.type, message, () =>
        fetchAmazonSearchHtml(title, { fetchImpl: retryingFetch })
      );
    } else if (message?.type === 'FETCH_PURCHASES_PAGE') {
      payload = await fetchPurchasesPage({
        page: Number.isInteger(message.page) ? message.page : 0,
        size: Number.isInteger(message.size) ? message.size : 30,
      });
    } else if (message?.type === 'POST_NOTIFICATION') {
      payload = await postBrowserNotification(message);
    } else if (message?.type === 'GET_NOTIFICATION_PERMISSION_LEVEL') {
      payload = await getNotificationPermissionLevel();
    } else if (message?.type === 'SET_AUCTION_NOTIFICATIONS_ENABLED') {
      payload = await setAuctionNotificationsEnabled({
        enabled: Boolean(message?.enabled),
        outbidEnabled: Boolean(message?.outbidEnabled),
      });
    }

    sendResponse(payload);
  })().catch((error) => {
    console.error('[NellisCompare] Background lookup error:', error);
    if (message?.type === 'FETCH_NELLIS') {
      sendResponse({ error: String(error) });
    } else {
      sendResponse({ html: null, searchUrl: null, data: null, error: String(error) });
    }
  });

  return true;
});

chrome.runtime.onInstalled?.addListener(() => {
  ensureAuctionNotificationsAlarm().catch((error) => {
    console.error('[NellisCompare] Failed to init auction notifications alarm:', error);
  });
});

chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm?.name !== NOTIFICATIONS_ALARM_NAME) {
    return;
  }

  runAuctionNotificationsCheck().catch((error) => {
    console.error('[NellisCompare] Auction notifications check failed:', error);
  });
});

chrome.notifications?.onClicked?.addListener((notificationId) => {
  const url = notificationUrlById.get(notificationId);
  if (!url) {
    return;
  }

  notificationUrlById.delete(notificationId);

  try {
    chrome.tabs?.create({ url });
  } catch (error) {
    console.error('[NellisCompare] Failed to open notification URL:', error);
  }

  try {
    chrome.notifications?.clear(notificationId);
  } catch {
    /* ignore */
  }
});

async function fetchPurchasesPage({ page, size }) {
  const endpointUrl = new URL('https://nellisauction.com/dashboard/purchases');
  endpointUrl.searchParams.set('_data', 'routes/dashboard.purchases._index');
  endpointUrl.searchParams.set('page', String(page));
  endpointUrl.searchParams.set('size', String(size));

  const response = await fetch(endpointUrl.toString(), {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
    },
  });

  if (!response.ok) {
    throw new Error(`Purchases request failed with status ${response.status}`);
  }

  return {
    data: await response.json(),
  };
}

async function postBrowserNotification(message) {
  const chromeNotifications = chrome.notifications;
  if (!chromeNotifications?.create) {
    return { ok: false, error: 'Notifications API unavailable.' };
  }

  const title = typeof message?.title === 'string' ? message.title.trim() : '';
  const body = typeof message?.message === 'string' ? message.message.trim() : '';
  const url = typeof message?.url === 'string' ? message.url : '';
  const notificationId =
    typeof message?.notificationId === 'string' && message.notificationId
      ? message.notificationId
      : `nellis-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (url) {
    notificationUrlById.set(notificationId, url);
  }

  try {
    await new Promise((resolve, reject) => {
      chromeNotifications.create(
        notificationId,
        {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: title || 'Nellis auction ending soon',
          message: body || '3 minutes left',
          priority: 1,
        },
        () => {
          const err = chrome.runtime?.lastError;
          if (err) {
            reject(new Error(err.message || String(err)));
            return;
          }
          resolve();
        }
      );
    });

    return { ok: true, notificationId };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

async function getNotificationPermissionLevel() {
  const chromeNotifications = chrome.notifications;
  if (!chromeNotifications?.getPermissionLevel) {
    return { ok: false, level: 'unknown' };
  }

  try {
    const level = await new Promise((resolve, reject) => {
      chromeNotifications.getPermissionLevel((permissionLevel) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          reject(new Error(err.message || String(err)));
          return;
        }
        resolve(permissionLevel);
      });
    });

    return { ok: true, level };
  } catch {
    return { ok: false, level: 'unknown' };
  }
}

async function ensureAuctionNotificationsAlarm() {
  const alarms = chrome.alarms;
  if (!alarms?.create) {
    return;
  }

  // Run every minute. We only notify on the 3-minute window, so 60s resolution is OK.
  alarms.create(NOTIFICATIONS_ALARM_NAME, { periodInMinutes: 1 });
}

async function setAuctionNotificationsEnabled({ enabled, outbidEnabled }) {
  try {
    await chrome.storage.local.set({
      [NOTIFICATIONS_STORAGE_KEY]: Boolean(enabled),
      [OUTBID_STORAGE_KEY]: Boolean(outbidEnabled),
    });
  } catch (error) {
    return { ok: false, error: String(error) };
  }

  try {
    await ensureAuctionNotificationsAlarm();
  } catch {
    /* ignore */
  }

  // Kick an immediate check when enabling.
  if (enabled || outbidEnabled) {
    runAuctionNotificationsCheck().catch(() => {});
  }

  return { ok: true };
}

async function getAuctionNotificationsEnabled() {
  try {
    const result = await chrome.storage.local.get([NOTIFICATIONS_STORAGE_KEY]);
    return Boolean(result?.[NOTIFICATIONS_STORAGE_KEY]);
  } catch {
    return false;
  }
}

async function getOutbidNotificationsEnabled() {
  try {
    const result = await chrome.storage.local.get([OUTBID_STORAGE_KEY]);
    return Boolean(result?.[OUTBID_STORAGE_KEY]);
  } catch {
    return false;
  }
}

async function getNotifiedKeysSet() {
  try {
    const result = await chrome.storage.local.get(['nellisAuctionNotifiedCloseTimes']);
    const raw = result?.nellisAuctionNotifiedCloseTimes;
    if (Array.isArray(raw)) {
      return new Set(raw.filter((value) => typeof value === 'string'));
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

async function persistNotifiedKeysSet(set) {
  try {
    const values = Array.from(set).slice(-2000);
    await chrome.storage.local.set({ nellisAuctionNotifiedCloseTimes: values });
  } catch {
    /* ignore */
  }
}

async function runAuctionNotificationsCheck() {
  const enabled = await getAuctionNotificationsEnabled();
  const outbidEnabled = await getOutbidNotificationsEnabled();
  if (!enabled && !outbidEnabled) {
    return;
  }

  const permission = await getNotificationPermissionLevel();
  if (permission?.level === 'denied') {
    return;
  }

  const notifiedKeys = await getNotifiedKeysSet();

  const now = Date.now();

  if (enabled) {
    const itemUrls = await fetchActiveAuctionItemUrls();

    // Limit work per tick to keep the service worker light.
    const urlsToCheck = itemUrls.slice(0, 25);

    for (const itemUrl of urlsToCheck) {
      const closeTimeIso = await fetchItemCloseTimeIso(itemUrl);
      if (!closeTimeIso) {
        continue;
      }

      const closeTime = new Date(closeTimeIso).getTime();
      if (!Number.isFinite(closeTime)) {
        continue;
      }

      const remainingMs = closeTime - now;
      if (remainingMs <= 0 || remainingMs > THREE_MINUTES_MS) {
        continue;
      }

      const key = `3min|${itemUrl}|${closeTimeIso}`;
      if (notifiedKeys.has(key)) {
        continue;
      }

      notifiedKeys.add(key);
      await persistNotifiedKeysSet(notifiedKeys);

      await postBrowserNotification({
        type: 'POST_NOTIFICATION',
        notificationId: buildNotificationId(itemUrl, closeTimeIso),
        title: 'Nellis auction ending soon',
        message: '3 minutes left',
        url: itemUrl,
      });
    }
  }

  if (outbidEnabled) {
    const outbidItems = await fetchOutbidItems();
    const itemsToCheck = outbidItems.slice(0, 25);

    for (const item of itemsToCheck) {
      const itemUrl = item?.url;
      if (!itemUrl) {
        continue;
      }

      const key = `outbid|${itemUrl}`;
      if (notifiedKeys.has(key)) {
        continue;
      }

      notifiedKeys.add(key);
      await persistNotifiedKeysSet(notifiedKeys);

      await postBrowserNotification({
        type: 'POST_NOTIFICATION',
        notificationId: `nellis-outbid-${itemUrl.replace(/[^a-z0-9]/gi, '_').slice(-120)}`,
        title: 'You were outbid',
        message: item.title ? item.title : 'An item in your auctions was outbid.',
        url: itemUrl,
      });
    }
  }
}

function buildNotificationId(itemUrl, closeTimeIso) {
  const token = `${itemUrl}|${closeTimeIso}`.replace(/[^a-z0-9]/gi, '_').slice(-120);
  return `nellis-3min-${token}`;
}

async function fetchActiveAuctionItemUrls() {
  const response = await fetch(ACTIVE_AUCTIONS_URL, {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Active auctions request failed with status ${response.status}`);
  }

  const html = await response.text();
  const urls = new Set();

  // Match href="/p/<slug>/<id>" or absolute variants.
  for (const match of html.matchAll(/href="(\/p\/[^"/]+\/\d+[^"]*)"/g)) {
    const href = match?.[1];
    if (!href) continue;
    urls.add(new URL(href, 'https://nellisauction.com').toString());
  }

  // Fallback: sometimes links are relative without quotes captured; try a broader scan.
  if (!urls.size) {
    for (const match of html.matchAll(/\/p\/[^/\s"']+\/\d+/g)) {
      urls.add(new URL(match[0], 'https://nellisauction.com').toString());
    }
  }

  return Array.from(urls);
}

async function fetchItemCloseTimeIso(itemUrl) {
  const response = await fetch(itemUrl, {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    return '';
  }

  const html = await response.text();
  return extractCloseTimeIsoFromHtml(html);
}

function extractCloseTimeIsoFromHtml(html) {
  const match = String(html || '').match(/"closeTime":\{"__type":"Date","value":"([^"]+)"\}/);
  return match?.[1] || '';
}

async function fetchOutbidItems() {
  const response = await fetch(OUTBID_AUCTIONS_URL, {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Outbid auctions request failed with status ${response.status}`);
  }

  const html = await response.text();
  const items = [];
  const seen = new Set();

  for (const match of html.matchAll(/href="(\/p\/[^"/]+\/\d+[^"]*)"/g)) {
    const href = match?.[1];
    if (!href) continue;
    const url = new URL(href, 'https://nellisauction.com').toString();
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ url, title: '' });
  }

  // Opportunistic title parse: grab the first plausible text near the link.
  for (const item of items) {
    const escapedHref = item.url.replace('https://nellisauction.com', '');
    const idx = html.indexOf(`href="${escapedHref}"`);
    if (idx === -1) continue;
    const windowText = html.slice(idx, idx + 600);
    const titleMatch = windowText.match(/data-ax="item-card-title-link"[^>]*>([^<]{3,120})</i);
    if (titleMatch?.[1]) {
      item.title = titleMatch[1].trim();
    }
  }

  return items;
}
