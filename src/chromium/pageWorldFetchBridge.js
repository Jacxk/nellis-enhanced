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
