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
  return isNellisAuctionSite(locationObject) && /^\/p\/[^/]+\/\d+/.test(locationObject.pathname);
}

export function extractNellisItem(root = document, { allowEmptyTitle = false } = {}) {
  const title = extractText(root, TITLE_SELECTORS);
  if (!title && !allowEmptyTitle) {
    return null;
  }

  return {
    title: title || '',
    imageSrc: extractImage(root, IMAGE_SELECTORS),
    price: extractText(root, PRICE_SELECTORS),
  };
}

export function isNellisOnlyItemTitle(title) {
  return NELLIS_ONLY_TITLE_PATTERNS.some((pattern) => pattern.test(String(title || '')));
}

export function findNellisPriceTargets(root = document) {
  const targetLabels = ['current price', 'won for', 'sold for'];
  const targets = [];
  const seen = new Set();

  for (const targetLabel of targetLabels) {
    for (const target of findPriceTargetsByLabel(root, targetLabel)) {
      if (!seen.has(target.container)) {
        seen.add(target.container);
        targets.push(target);
      }
    }
  }

  const searchRoots = [root.querySelector('#bid-section'), root.querySelector('main'), root].filter(
    Boolean
  );

  for (const searchRoot of searchRoots) {
    for (const selector of PRICE_SELECTORS) {
      const nodes = Array.from(searchRoot.querySelectorAll(selector));

      for (const node of nodes) {
        if (!node?.textContent?.trim() || node.closest('#nellis-amazon-compare-card')) {
          continue;
        }

        const container = node.closest('[data-ax="item-card-container"], #bid-section, div');
        if (container && !seen.has(container)) {
          seen.add(container);
          targets.push({ container, priceNode: node });
        }
      }
    }
  }

  return targets;
}

export function findNellisTimeTargets(root = document) {
  return findCardTargetsByLabel(root, ['time left']);
}

export function hasNellisPriceCards(root = document) {
  return Boolean(root.querySelector('#bid-section, [data-ax="item-card-container"]'));
}

export function parseCurrencyAmount(value) {
  const normalizedValue = String(value || '').replace(/,/g, '');
  const match = normalizedValue.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);

  if (!match) {
    return null;
  }

  return Number.parseFloat(match[1]);
}

function findPriceTargetsByLabel(root, labelText) {
  return findCardTargetsByLabel(root, [labelText], (container, labelNode) => {
    const priceCandidates = Array.from(container.querySelectorAll('p, span, div'))
      .filter((node) => node !== labelNode)
      .filter((node) => !node.closest('#nellis-amazon-compare-card'))
      .filter((node) => /\$\s*\d/.test(node.textContent || ''));

    if (!priceCandidates.length) {
      return null;
    }

    return {
      container,
      priceNode: priceCandidates[0],
    };
  });
}

function findCardTargetsByLabel(root, labels, buildTarget = (container) => ({ container })) {
  const normalizedLabels = new Set(labels.map((label) => label.trim().toLowerCase()));
  const labelNodes = Array.from(root.querySelectorAll('p, strong, span, div'));
  const targets = [];
  const seen = new Set();

  for (const labelNode of labelNodes) {
    const text = labelNode.textContent?.trim().toLowerCase();
    if (!text || !normalizedLabels.has(text)) {
      continue;
    }

    const preferredContainer =
      labelNode.closest('#bid-section > div > div, [data-ax="item-card-container"] .p-2\\.5 > div') ||
      labelNode.closest('#bid-section, [data-ax="item-card-container"], form, div');
    const container = preferredContainer || labelNode.closest('div');
    if (!container || seen.has(container)) {
      continue;
    }

    const target = buildTarget(container, labelNode);
    if (!target) {
      continue;
    }

    seen.add(container);
    targets.push(target);
  }

  return targets;
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

export function isNellisAuctionSite(locationObject = window.location) {
  const host = locationObject.hostname || '';
  return host === 'www.nellisauction.com' || host === 'nellisauction.com';
}

export function isNellisCartPage(locationObject = window.location) {
  return isNellisAuctionSite(locationObject) && /^\/dashboard\/cart(\/|$)/.test(locationObject.pathname);
}

/** Dashboard auction list routes (active, won, etc.) that load item rows with thumbnails */
export function isNellisDashboardAuctionListPage(locationObject = window.location) {
  return isNellisAuctionSite(locationObject) && /^\/dashboard\/auctions\//.test(locationObject.pathname);
}

/** Product search / refine listing (Remix loaders use `products[].photos`, not `myAuctions.records`) */
export function isNellisSearchPage(locationObject = window.location) {
  if (!isNellisAuctionSite(locationObject)) {
    return false;
  }
  const path = locationObject.pathname || '';
  return /^\/search(\/|$)/.test(path) || /^\/dashboard\/search(\/|$)/.test(path);
}

/** Spotlight (deals, first-bid, saved-searches, …) — loaders use `dealAuctions` / `noBidAuctions` records */
export function isNellisSpotlightPage(locationObject = window.location) {
  return isNellisAuctionSite(locationObject) && /^\/spotlight(\/|$)/.test(locationObject.pathname || '');
}
