import { fetchAmazonHtml, fetchAmazonSearchHtml } from '../shared/amazonSource.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message?.type !== 'FETCH_AMAZON_SEARCH_HTML' &&
    message?.type !== 'FETCH_AMAZON_PRODUCT_HTML' &&
    message?.type !== 'FETCH_PURCHASES_PAGE'
  ) {
    return false;
  }

  (async () => {
    const payload = message?.type === 'FETCH_AMAZON_PRODUCT_HTML'
        ? await fetchAmazonHtml(typeof message.url === 'string' ? message.url : '')
        : message?.type === 'FETCH_PURCHASES_PAGE'
          ? await fetchPurchasesPage({
              page: Number.isInteger(message.page) ? message.page : 0,
              size: Number.isInteger(message.size) ? message.size : 30,
            })
          : await fetchAmazonSearchHtml(typeof message.title === 'string' ? message.title : '');

    sendResponse(payload);
  })().catch((error) => {
    console.error('[NellisCompare] Background lookup error:', error);
    sendResponse({ html: null, searchUrl: null, data: null, error: String(error) });
  });

  return true;
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
