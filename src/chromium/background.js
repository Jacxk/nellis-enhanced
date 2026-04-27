import { fetchAmazonHtml, fetchAmazonSearchHtml } from '../shared/amazonSource.js';

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
 * Amazon: retry + queue + dedupe (unchanged behavior from prior work).
 */
function createRetryingFetch({ maxRetries = 4, baseDelayMs = 2000 } = {}) {
  return async (resource, init) => {
    let lastResponse;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      lastResponse = await fetch(resource, init);
      if (lastResponse.status !== 429) {
        return lastResponse;
      }
      if (attempt >= maxRetries) {
        return lastResponse;
      }
      const backoff =
        baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 500);
      await sleep(backoff);
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
    message?.type !== 'FETCH_NELLIS'
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
