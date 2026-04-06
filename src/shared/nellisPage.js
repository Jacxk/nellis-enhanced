const TITLE_SELECTORS = [
  'main h1',
  'h1',
  '[class*="title"]',
  '[class*="Title"]',
  '[class*="name"]',
];

const IMAGE_SELECTORS = [
  'img[alt][src*="cdn"]',
  'img[src*="product"]',
  '[class*="gallery"] img',
  'main img',
];

const PRICE_SELECTORS = [
  '[class*="currentBid"]',
  '[class*="current-bid"]',
  '[class*="price"]',
  '[class*="Price"]',
  '[data-testid*="price"]',
];

const NELLIS_ONLY_TITLE_PATTERNS = [
  /\bnellis variety box\b/i,
];

export function isNellisItemPage(locationObject = window.location) {
  return (
    locationObject.hostname === 'www.nellisauction.com' &&
    /^\/p\/[^/]+\/\d+/.test(locationObject.pathname)
  );
}

export function extractNellisItem(root = document) {
  const title = extractText(root, TITLE_SELECTORS);
  if (!title) {
    return null;
  }

  return {
    title,
    imageSrc: extractImage(root, IMAGE_SELECTORS),
    price: extractText(root, PRICE_SELECTORS),
  };
}

export function isNellisOnlyItemTitle(title) {
  return NELLIS_ONLY_TITLE_PATTERNS.some((pattern) => pattern.test(String(title || '')));
}

export function findItemDetailsAnchor(root = document) {
  const selectorMatch = [
    '[class*="item-details"]',
    '[class*="ItemDetails"]',
    '[data-testid*="item-details"]',
  ]
    .map((selector) => root.querySelector(selector))
    .find(Boolean);

  if (selectorMatch) {
    return selectorMatch;
  }

  const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, [role="heading"]'));
  const heading = headings.find((node) =>
    node.textContent?.trim().toLowerCase().includes('item details')
  );

  if (!heading) {
    return null;
  }

  return (
    heading.closest('section') ||
    heading.closest('article') ||
    heading.parentElement ||
    null
  );
}

function extractText(root, selectors) {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    const text = node?.textContent?.trim();
    if (text) {
      return text;
    }
  }

  return '';
}

function extractImage(root, selectors) {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    const src = node?.getAttribute('src') || node?.src;
    if (src) {
      return src;
    }
  }

  return '';
}
