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

  function dispatchEmbeddedRemixLoaderData() {
    if (embeddedLoaderDispatched) {
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
    return nativeFetch(input, init).then((response) => {
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

        const clone = response.clone();
        clone
          .json()
          .then((json) => {
            const resourceUrl = new URL(reqUrl, window.location.href);
            const dataKey = resourceUrl.searchParams.get('_data');
            if (!dataKey) {
              return;
            }

            document.dispatchEvent(
              new CustomEvent('nellis-enhanced-remix', {
                bubbles: true,
                composed: true,
                detail: { dataKey, json },
              })
            );
          })
          .catch(() => {});
      } catch {
        // ignore
      }

      return response;
    });
  };
})();
