import { fetchAmazonHtml, fetchAmazonSearchHtml } from '../shared/amazonSource.js';

const notificationUrlById = new Map();
const NOTIFICATIONS_STORAGE_KEY = 'nellisAuctionNotificationsEnabled';
const NOTIFICATIONS_ALARM_NAME = 'nellis-auction-notifications';
const THREE_MINUTES_MS = 3 * 60 * 1000;
const ACTIVE_AUCTIONS_URL = 'https://nellisauction.com/dashboard/auctions/active';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message?.type !== 'FETCH_AMAZON_SEARCH_HTML' &&
    message?.type !== 'FETCH_AMAZON_PRODUCT_HTML' &&
    message?.type !== 'FETCH_PURCHASES_PAGE' &&
    message?.type !== 'POST_NOTIFICATION' &&
    message?.type !== 'GET_NOTIFICATION_PERMISSION_LEVEL' &&
    message?.type !== 'SET_AUCTION_NOTIFICATIONS_ENABLED'
  ) {
    return false;
  }

  (async () => {
    const payload =
      message?.type === 'FETCH_AMAZON_PRODUCT_HTML'
        ? await fetchAmazonHtml(typeof message.url === 'string' ? message.url : '')
        : message?.type === 'FETCH_PURCHASES_PAGE'
          ? await fetchPurchasesPage({
              page: Number.isInteger(message.page) ? message.page : 0,
              size: Number.isInteger(message.size) ? message.size : 30,
            })
          : message?.type === 'POST_NOTIFICATION'
            ? await postBrowserNotification(message)
            : message?.type === 'GET_NOTIFICATION_PERMISSION_LEVEL'
              ? await getNotificationPermissionLevel()
              : message?.type === 'SET_AUCTION_NOTIFICATIONS_ENABLED'
                ? await setAuctionNotificationsEnabled(Boolean(message?.enabled))
            : await fetchAmazonSearchHtml(typeof message.title === 'string' ? message.title : '');

    sendResponse(payload);
  })().catch((error) => {
    console.error('[NellisCompare] Background lookup error:', error);
    sendResponse({ html: null, searchUrl: null, data: null, error: String(error) });
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

async function setAuctionNotificationsEnabled(enabled) {
  try {
    await chrome.storage.local.set({ [NOTIFICATIONS_STORAGE_KEY]: Boolean(enabled) });
  } catch (error) {
    return { ok: false, error: String(error) };
  }

  try {
    await ensureAuctionNotificationsAlarm();
  } catch {
    /* ignore */
  }

  // Kick an immediate check when enabling.
  if (enabled) {
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
  if (!enabled) {
    return;
  }

  const permission = await getNotificationPermissionLevel();
  if (permission?.level === 'denied') {
    return;
  }

  const notifiedKeys = await getNotifiedKeysSet();
  const itemUrls = await fetchActiveAuctionItemUrls();

  // Limit work per tick to keep the service worker light.
  const urlsToCheck = itemUrls.slice(0, 25);
  const now = Date.now();

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

    const key = `${itemUrl}|${closeTimeIso}`;
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
