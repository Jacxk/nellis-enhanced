import {
  DARK_MODE_CRITICAL_STYLE_ID,
  DARK_MODE_HTML_CLASS,
  DARK_MODE_STORAGE_KEY,
} from '../shared/nellisUiConstants.js';

/**
 * MAIN world, document_start — runs before the isolated content script bundle.
 * Applies dark class + a few bytes of background CSS as early as the platform allows,
 * so the first paint is not a full-screen white flash while the large style tag loads.
 */
(function nellisDarkModeEarliestPaint() {
  if (window.__nellisEnhancedDarkBoot) {
    return;
  }
  window.__nellisEnhancedDarkBoot = true;

  try {
    if (localStorage.getItem(DARK_MODE_STORAGE_KEY) !== '1') {
      return;
    }

    document.documentElement.classList.add(DARK_MODE_HTML_CLASS);

    if (document.getElementById(DARK_MODE_CRITICAL_STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = DARK_MODE_CRITICAL_STYLE_ID;
    style.textContent = `html.${DARK_MODE_HTML_CLASS},html.${DARK_MODE_HTML_CLASS} body{background-color:#1f1f1f!important;color-scheme:dark}`;
    (document.head || document.documentElement).appendChild(style);
  } catch {
    /* ignore */
  }
})();

/**
 * Runs in the page MAIN world (see manifest) so `fetch` is the same function Remix uses.
 * Isolated content scripts cannot intercept page `fetch`; this bridge dispatches a DOM event
 * the content script listens for.
 *
 * Full page loads embed initial loader JSON in `window.__remixContext.state.loaderData` and
 * often do not issue a `_data=` fetch for that first paint. Client navigations use `fetch`
 * and are intercepted below. We mirror embedded loader data into the same event so the
 * content script can merge photos on refresh.
 */
(function nellisPageWorldFetchBridge() {
  if (window.__nellisEnhancedFetchPatched) {
    return;
  }
  window.__nellisEnhancedFetchPatched = true;

  let embeddedLoaderDispatched = false;

  function parseDateWonMs(value) {
    if (!value) {
      return Number.NEGATIVE_INFINITY;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
    }
    if (typeof value === 'string') {
      const t = Date.parse(value);
      return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
    }
    if (value instanceof Date) {
      const t = value.getTime();
      return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
    }
    if (typeof value === 'object') {
      if (typeof value.value === 'string') {
        const t = Date.parse(value.value);
        return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
      }
    }
    return Number.NEGATIVE_INFINITY;
  }

  function getCartSortKey() {
    try {
      return localStorage.getItem('nellisCartSort') || 'dateWon_desc';
    } catch {
      return 'dateWon_desc';
    }
  }

  function sortPickUpsItems(maybePayload, sortKey) {
    if (!maybePayload || typeof maybePayload !== 'object') {
      return false;
    }

    const candidates = [];
    if (maybePayload.pickUps) {
      candidates.push(maybePayload.pickUps);
    }
    if (maybePayload.data?.pickUps) {
      candidates.push(maybePayload.data.pickUps);
    }

    let changed = false;
    for (const pickUps of candidates) {
      const items = pickUps?.items;
      if (!Array.isArray(items) || items.length < 2) {
        continue;
      }

      const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
      const sorted = items.slice().sort((a, b) => {
        switch (sortKey) {
          case 'dateWon_asc':
            return parseDateWonMs(a?.dateWon) - parseDateWonMs(b?.dateWon);
          case 'title_az':
            return collator.compare(String(a?.leadDescription || ''), String(b?.leadDescription || ''));
          case 'title_za':
            return collator.compare(String(b?.leadDescription || ''), String(a?.leadDescription || ''));
          case 'amount_desc':
            return (Number(b?.amount) || 0) - (Number(a?.amount) || 0);
          case 'amount_asc':
            return (Number(a?.amount) || 0) - (Number(b?.amount) || 0);
          case 'dateWon_desc':
          default:
            return parseDateWonMs(b?.dateWon) - parseDateWonMs(a?.dateWon);
        }
      });

      // Avoid re-assigning if order is already correct.
      for (let i = 0; i < sorted.length; i += 1) {
        if (sorted[i] !== items[i]) {
          pickUps.items = sorted;
          changed = true;
          break;
        }
      }
    }

    return changed;
  }

  function dispatchEmbeddedRemixLoaderData({ force = false } = {}) {
    if (embeddedLoaderDispatched && !force) {
      return true;
    }
    try {
      const loaderData = window.__remixContext?.state?.loaderData;
      if (!loaderData || typeof loaderData !== 'object') {
        return false;
      }
      embeddedLoaderDispatched = true;
      for (const dataKey of Object.keys(loaderData)) {
        const json = loaderData[dataKey];
        if (
          window.location.pathname === '/dashboard/cart' ||
          window.location.pathname.startsWith('/dashboard/cart/')
        ) {
          sortPickUpsItems(json, getCartSortKey());
        }
        document.dispatchEvent(
          new CustomEvent('nellis-enhanced-remix', {
            bubbles: true,
            composed: true,
            detail: { dataKey, json },
          })
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  document.addEventListener('nellis-enhanced-request-remix', () => {
    dispatchEmbeddedRemixLoaderData({ force: true });
  });

  function scheduleEmbeddedRemixLoaderData() {
    if (dispatchEmbeddedRemixLoaderData()) {
      return;
    }
    const tryLater = (delayMs) => {
      setTimeout(() => {
        if (dispatchEmbeddedRemixLoaderData()) {
          return;
        }
      }, delayMs);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (dispatchEmbeddedRemixLoaderData()) {
          return;
        }
        tryLater(0);
        tryLater(50);
        tryLater(200);
      });
    } else {
      if (dispatchEmbeddedRemixLoaderData()) {
        return;
      }
      tryLater(0);
      tryLater(50);
      tryLater(200);
    }
    window.addEventListener(
      'load',
      () => {
        dispatchEmbeddedRemixLoaderData();
      },
      { once: true }
    );
  }

  scheduleEmbeddedRemixLoaderData();

  const nativeFetch = window.fetch.bind(window);

  window.fetch = function nellisEnhancedFetch(input, init) {
    return nativeFetch(input, init).then(async (response) => {
      try {
        const reqUrl =
          typeof input === 'string'
            ? input
            : input && typeof input.url === 'string'
              ? input.url
              : '';
        if (!reqUrl || !reqUrl.includes('_data=')) {
          return response;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('json')) {
          return response;
        }

        const resourceUrl = new URL(reqUrl, window.location.href);
        const dataKey = resourceUrl.searchParams.get('_data');
        if (!dataKey) {
          return response;
        }

        const clone = response.clone();
        const json = await clone.json().catch(() => undefined);
        if (json === undefined) {
          return response;
        }

        const isCartData =
          resourceUrl.pathname === '/dashboard/cart' ||
          resourceUrl.pathname.startsWith('/dashboard/cart/');
        const shouldSortCart = isCartData && sortPickUpsItems(json, getCartSortKey());

        document.dispatchEvent(
          new CustomEvent('nellis-enhanced-remix', {
            bubbles: true,
            composed: true,
            detail: { dataKey, json },
          })
        );

        if (!shouldSortCart) {
          return response;
        }

        // Replace the response body Remix consumes, preserving status/headers.
        const nextHeaders = new Headers(response.headers);
        nextHeaders.delete('content-length');
        nextHeaders.set('content-type', 'application/json; charset=utf-8');
        return new Response(JSON.stringify(json), {
          status: response.status,
          statusText: response.statusText,
          headers: nextHeaders,
        });
      } catch {
        // ignore
      }

      return response;
    });
  };
})();
