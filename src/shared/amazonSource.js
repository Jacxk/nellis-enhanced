import { buildAmazonSearchUrl, parseAmazonSearchResults } from './productMatcher.js';

/**
 * Edit only this function if you later want to switch from HTML fetching to an API.
 * Keep the return shape the same so the rest of the extension does not need to change.
 */
export async function getAmazonItem(title, { fetchImpl = fetch } = {}) {
  if (!title) {
    return null;
  }

  const searchUrl = buildAmazonSearchUrl(title);

  try {
    const response = await fetchImpl(searchUrl, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.warn('[NellisCompare] Amazon search request failed:', response.status);
      return null;
    }

    const html = await response.text();
    return parseAmazonSearchResults(html, title);
  } catch (error) {
    console.error('[NellisCompare] Amazon lookup failed:', error);
    return null;
  }
}

export function createAmazonSearchFallback(title) {
  if (!title) {
    return null;
  }

  return {
    title: 'Search on Amazon',
    price: 'Open search results',
    url: buildAmazonSearchUrl(title),
    imageSrc: '',
  };
}

export async function fetchAmazonSearchHtml(title, { fetchImpl = fetch } = {}) {
  if (!title) {
    return null;
  }

  const searchUrl = buildAmazonSearchUrl(title);

  try {
    const response = await fetchImpl(searchUrl, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.warn('[NellisCompare] Amazon search request failed:', response.status);
      return null;
    }

    return {
      html: await response.text(),
      searchUrl,
    };
  } catch (error) {
    console.error('[NellisCompare] Amazon lookup failed:', error);
    return null;
  }
}

export function getAmazonItemFromHtml(title, html) {
  if (!title || !html) {
    return null;
  }

  return parseAmazonSearchResults(html, title);
}

export async function fetchAmazonHtml(url, { fetchImpl = fetch } = {}) {
  if (!url) {
    return null;
  }

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.warn('[NellisCompare] Amazon page request failed:', response.status, url);
      return null;
    }

    return {
      html: await response.text(),
      url,
    };
  } catch (error) {
    console.error('[NellisCompare] Amazon page fetch failed:', error);
    return null;
  }
}
