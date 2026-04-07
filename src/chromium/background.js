import { fetchAmazonHtml, fetchAmazonSearchHtml } from '../shared/amazonSource.js';

const notificationUrlById = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message?.type !== 'FETCH_AMAZON_SEARCH_HTML' &&
    message?.type !== 'FETCH_AMAZON_PRODUCT_HTML' &&
    message?.type !== 'FETCH_PURCHASES_PAGE' &&
    message?.type !== 'POST_NOTIFICATION' &&
    message?.type !== 'GET_NOTIFICATION_PERMISSION_LEVEL'
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
            : await fetchAmazonSearchHtml(typeof message.title === 'string' ? message.title : '');

    sendResponse(payload);
  })().catch((error) => {
    console.error('[NellisCompare] Background lookup error:', error);
    sendResponse({ html: null, searchUrl: null, data: null, error: String(error) });
  });

  return true;
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
