const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'in',
  'of',
  'the',
  'to',
  'with',
]);

export function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeTitle(value) {
  return normalizeTitle(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));
}

export function buildAmazonSearchUrl(title) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(title)}`;
}

export function scoreAmazonCandidate(sourceTitle, candidateTitle) {
  const sourceTokens = tokenizeTitle(sourceTitle);
  const candidateTokens = new Set(tokenizeTitle(candidateTitle));

  if (!sourceTokens.length || !candidateTokens.size) {
    return 0;
  }

  let score = 0;
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) {
      score += token.length >= 4 ? 2 : 1;
    }
  }

  const sourceNormalized = normalizeTitle(sourceTitle);
  const candidateNormalized = normalizeTitle(candidateTitle);

  if (candidateNormalized.includes(sourceNormalized)) {
    score += 5;
  }

  return score;
}

export function parseAmazonSearchResults(html, searchTitle) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(html, 'text/html');
  const resultNodes = Array.from(
    documentNode.querySelectorAll('[data-component-type="s-search-result"]')
  );

  const candidates = resultNodes
    .map((resultNode) => {
      const titleNode = resultNode.querySelector('h2 a span, h2 span');
      const linkNode = resultNode.querySelector('h2 a[href], a[href*="/dp/"], a[href*="/gp/product/"]');
      const imageNode = resultNode.querySelector('img.s-image, img[data-image-latency="s-product-image"]');

      const title = titleNode?.textContent?.trim() || '';
      const href = linkNode?.getAttribute('href') || '';
      const url = normalizeAmazonProductUrl(href);
      const price = extractAmazonPrice(resultNode);

      return {
        title,
        url,
        price,
        imageSrc: imageNode?.getAttribute('src') || '',
        score:
          scoreAmazonCandidate(searchTitle, title) +
          (price ? 2 : 0) +
          (imageNode ? 1 : 0) +
          (url.includes('/dp/') ? 2 : 0),
      };
    })
    .filter((candidate) => candidate.title && candidate.url);

  candidates.sort((left, right) => right.score - left.score);

  return candidates[0] || null;
}

export function parseAmazonProductPage(html, url) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(html, 'text/html');
  const title =
    documentNode.querySelector('#productTitle')?.textContent?.trim() ||
    documentNode.querySelector('#title')?.textContent?.trim() ||
    documentNode.querySelector('meta[name="title"]')?.getAttribute('content')?.trim() ||
    documentNode.querySelector('title')?.textContent?.replace(/\s*:\s*Amazon.*$/i, '').trim() ||
    '';
  const price =
    documentNode.querySelector('#corePriceDisplay_desktop_feature_div .a-offscreen')?.textContent?.trim() ||
    documentNode.querySelector('#corePrice_feature_div .a-offscreen')?.textContent?.trim() ||
    documentNode.querySelector('.apexPriceToPay .a-offscreen')?.textContent?.trim() ||
    documentNode.querySelector('.a-price .a-offscreen')?.textContent?.trim() ||
    '';
  const imageSrc =
    documentNode.querySelector('#landingImage')?.getAttribute('src') ||
    documentNode.querySelector('#imgTagWrapperId img')?.getAttribute('src') ||
    documentNode.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
    '';

  if (!title || !url) {
    return null;
  }

  return {
    title,
    price,
    url: normalizeAmazonProductUrl(url),
    imageSrc,
  };
}

function extractAmazonPrice(resultNode) {
  const offscreenPrice = resultNode.querySelector('.a-price .a-offscreen')?.textContent?.trim();
  if (offscreenPrice) {
    return offscreenPrice;
  }

  const whole = resultNode.querySelector('.a-price .a-price-whole')?.textContent?.trim();
  const fraction = resultNode.querySelector('.a-price .a-price-fraction')?.textContent?.trim();

  if (whole && fraction) {
    return `$${whole.replace(/[^\d.,]/g, '')}${fraction ? `.${fraction.replace(/[^\d]/g, '')}` : ''}`;
  }

  return '';
}

function normalizeAmazonProductUrl(href) {
  if (!href) {
    return '';
  }

  const absoluteUrl = href.startsWith('http') ? href : `https://www.amazon.com${href}`;
  const asinMatch = absoluteUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);

  if (asinMatch) {
    return `https://www.amazon.com/dp/${asinMatch[1].toUpperCase()}`;
  }

  try {
    const parsedUrl = new URL(absoluteUrl);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch (_error) {
    return absoluteUrl;
  }
}
