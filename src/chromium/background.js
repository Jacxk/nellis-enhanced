import { fetchAmazonHtml, fetchAmazonSearchHtml } from '../shared/amazonSource.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'FETCH_AMAZON_SEARCH_HTML' && message?.type !== 'FETCH_AMAZON_PRODUCT_HTML') {
    return false;
  }

  (async () => {
    const payload =
      message?.type === 'FETCH_AMAZON_PRODUCT_HTML'
        ? await fetchAmazonHtml(typeof message.url === 'string' ? message.url : '')
        : await fetchAmazonSearchHtml(typeof message.title === 'string' ? message.title : '');

    sendResponse(payload);
  })().catch((error) => {
    console.error('[NellisCompare] Background lookup error:', error);
    sendResponse({ html: null, searchUrl: null, error: String(error) });
  });

  return true;
});
