import {
  extractNellisItem,
  findItemDetailsAnchor,
  isNellisItemPage,
  isNellisOnlyItemTitle,
} from '../shared/nellisPage.js';
import { sendRuntimeMessage } from '../shared/extensionApi.js';
import { getAmazonItemFromHtml } from '../shared/amazonSource.js';
import { parseAmazonProductPage } from '../shared/productMatcher.js';

const CARD_ID = 'nellis-amazon-compare-card';
const STYLE_ID = 'nellis-amazon-compare-style';
const PURCHASES_EXPORT_ID = 'nellis-purchases-export';
const RENDER_DEBOUNCE_MS = 250;
const MAX_RENDER_RETRIES = 20;
const RENDER_RETRY_MS = 400;
const PURCHASES_PAGE_SIZE = 30;
const ROUTE_WATCH_INTERVAL_MS = 500;

let activeRouteKey = '';
let renderTimer = 0;
let lookupSequence = 0;
let lastRenderedTitle = '';
let pendingRouteKey = '';
let pendingRouteAttempts = 0;
let purchasesExportInFlight = false;
let purchasesRouteKey = '';
let purchasesRenderAttempts = 0;
let lastKnownUrl = window.location.href;

init();

function init() {
  injectStyles();
  installRouteListeners();
  scheduleRender();
}

function installRouteListeners() {
  const { pushState, replaceState } = history;

  history.pushState = function pushStatePatched(...args) {
    const result = pushState.apply(this, args);
    scheduleRender();
    return result;
  };

  history.replaceState = function replaceStatePatched(...args) {
    const result = replaceState.apply(this, args);
    scheduleRender();
    return result;
  };

  window.addEventListener('popstate', scheduleRender);
  window.addEventListener('pageshow', scheduleRender);
  window.addEventListener('load', scheduleRender);

  const observer = new MutationObserver(() => {
    if (isNellisItemPage() || isPurchasesPage()) {
      scheduleRender();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.setInterval(() => {
    const currentUrl = window.location.href;

    if (currentUrl !== lastKnownUrl) {
      lastKnownUrl = currentUrl;
      scheduleRender();
      return;
    }

    if (isPurchasesPage() && !document.getElementById(PURCHASES_EXPORT_ID)) {
      scheduleRender();
      return;
    }

    if (isNellisItemPage() && !document.getElementById(CARD_ID)) {
      scheduleRender();
    }
  }, ROUTE_WATCH_INTERVAL_MS);
}

function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderPageFeatures, RENDER_DEBOUNCE_MS);
}

async function renderPageFeatures() {
  const routeKey = `${window.location.pathname}${window.location.search}`;
  injectStyles();
  renderPurchasesExportButton(routeKey);

  if (!isNellisItemPage()) {
    cleanupItemComparison(routeKey);
    return;
  }

  await renderComparisonCard(routeKey);
}

async function renderComparisonCard(routeKey) {
  if (!isNellisItemPage()) {
    cleanupItemComparison(routeKey);
    return;
  }

  if (pendingRouteKey !== routeKey) {
    pendingRouteKey = routeKey;
    pendingRouteAttempts = 0;
  }

  const nellisItem = extractNellisItem();
  const itemDetailsAnchor = findItemDetailsAnchor();

  if (!nellisItem?.title || !itemDetailsAnchor) {
    if (pendingRouteAttempts < MAX_RENDER_RETRIES) {
      pendingRouteAttempts += 1;
      window.setTimeout(scheduleRender, RENDER_RETRY_MS);
    }
    return;
  }

  if (isNellisOnlyItemTitle(nellisItem.title)) {
    activeRouteKey = routeKey;
    lastRenderedTitle = nellisItem.title;
    pendingRouteAttempts = 0;
    removeExistingCard();
    return;
  }

  pendingRouteAttempts = 0;

  const titleChanged = nellisItem.title !== lastRenderedTitle;
  const routeChanged = routeKey !== activeRouteKey;
  const existingCard = document.getElementById(CARD_ID);

  if (!titleChanged && !routeChanged && existingCard) {
    return;
  }

  activeRouteKey = routeKey;
  lastRenderedTitle = nellisItem.title;

  const card = ensureCard(itemDetailsAnchor);
  updateCardState(card, {
    state: 'loading',
    nellisItem,
  });

  const currentLookup = ++lookupSequence;

  try {
    const response = await sendRuntimeMessage({
      type: 'FETCH_AMAZON_SEARCH_HTML',
      title: nellisItem.title,
    });

    const searchResultItem = getAmazonItemFromHtml(nellisItem.title, response?.html);
    let amazonItem = searchResultItem;

    if (searchResultItem?.url) {
      const productResponse = await sendRuntimeMessage({
        type: 'FETCH_AMAZON_PRODUCT_HTML',
        url: searchResultItem.url,
      });

      const productPageItem = parseAmazonProductPage(productResponse?.html, searchResultItem.url);
      if (productPageItem) {
        amazonItem = {
          ...searchResultItem,
          ...productPageItem,
        };
      }
    }

    if (currentLookup !== lookupSequence) {
      return;
    }

    updateCardState(card, {
      state: hasRenderableAmazonItem(amazonItem) ? 'ready' : 'empty',
      nellisItem,
      amazonItem: amazonItem || null,
    });
  } catch (error) {
    console.error('[NellisCompare] Failed to load Amazon item:', error);

    if (currentLookup !== lookupSequence) {
      return;
    }

    updateCardState(card, {
      state: 'empty',
      nellisItem,
      amazonItem: null,
    });
  }
}

function cleanupItemComparison(routeKey) {
  activeRouteKey = routeKey;
  lastRenderedTitle = '';
  pendingRouteKey = '';
  pendingRouteAttempts = 0;
  removeExistingCard();
}

function ensureCard(itemDetailsAnchor) {
  let card = document.getElementById(CARD_ID);

  if (!card) {
    card = document.createElement('section');
    card.id = CARD_ID;
    card.innerHTML = `
      <div class="nellis-compare__header">
        <div class="nellis-compare__badge" aria-hidden="true">a</div>
        <div>
          <h3 class="nellis-compare__title">Amazon</h3>
        </div>
      </div>
      <div class="nellis-compare__status" data-role="status"></div>
      <div class="nellis-compare__body" data-role="body" hidden>
        <div class="nellis-compare__image-wrap">
          <img class="nellis-compare__image" data-role="image" alt="" />
        </div>
        <div class="nellis-compare__content">
          <a class="nellis-compare__product-title" data-role="title" target="_blank" rel="noopener noreferrer"></a>
          <p class="nellis-compare__price" data-role="price"></p>
          <a class="nellis-compare__button" data-role="link" target="_blank" rel="noopener noreferrer">
            View on Amazon
          </a>
        </div>
      </div>
    `;
  }

  applyNativeCardStyling(card, itemDetailsAnchor);

  if (card.parentElement !== itemDetailsAnchor.parentElement) {
    itemDetailsAnchor.insertAdjacentElement('afterend', card);
  } else if (card.previousElementSibling !== itemDetailsAnchor) {
    itemDetailsAnchor.insertAdjacentElement('afterend', card);
  }

  return card;
}

function updateCardState(card, { state, nellisItem, amazonItem }) {
  const statusNode = card.querySelector('[data-role="status"]');
  const bodyNode = card.querySelector('[data-role="body"]');
  const imageWrapNode = card.querySelector('.nellis-compare__image-wrap');
  const imageNode = card.querySelector('[data-role="image"]');
  const titleNode = card.querySelector('[data-role="title"]');
  const priceNode = card.querySelector('[data-role="price"]');
  const linkNode = card.querySelector('[data-role="link"]');

  if (state === 'loading') {
    bodyNode.hidden = true;
    statusNode.hidden = false;
    statusNode.textContent = 'Loading Amazon item...';
    return;
  }

  if (state === 'empty' || !amazonItem?.url) {
    bodyNode.hidden = true;
    statusNode.hidden = false;
    statusNode.textContent = 'Amazon item unavailable.';
    return;
  }

  statusNode.hidden = true;
  bodyNode.hidden = false;

  const imageSrc = amazonItem.imageSrc || nellisItem.imageSrc || '';
  imageWrapNode.hidden = !imageSrc;
  imageNode.src = imageSrc;
  imageNode.alt = amazonItem.title || nellisItem.title;
  titleNode.textContent = amazonItem.title || 'Amazon item';
  titleNode.href = amazonItem.url;
  priceNode.textContent = amazonItem.price || 'See price on Amazon';
  linkNode.href = amazonItem.url;
  linkNode.hidden = !amazonItem.url;
}

function hasRenderableAmazonItem(item) {
  return Boolean(item?.title && item?.url);
}

function applyNativeCardStyling(card, itemDetailsAnchor) {
  const anchorStyle = window.getComputedStyle(itemDetailsAnchor);
  const sampleTextNode =
    itemDetailsAnchor.querySelector('p, span, div, li') || itemDetailsAnchor;
  const sampleTextStyle = window.getComputedStyle(sampleTextNode);
  const headingNode =
    itemDetailsAnchor.querySelector('h1, h2, h3, h4, [role="heading"]') || itemDetailsAnchor;
  const headingStyle = window.getComputedStyle(headingNode);

  const backgroundColor = pickStyleValue(anchorStyle.backgroundColor, 'rgb(255, 255, 255)');
  const borderColor = pickStyleValue(anchorStyle.borderColor, 'rgba(15, 23, 42, 0.08)');
  const borderRadius = pickStyleValue(anchorStyle.borderRadius, '12px');
  const boxShadow = pickStyleValue(anchorStyle.boxShadow, '0 6px 18px rgba(15, 23, 42, 0.06)');
  const textColor = pickStyleValue(sampleTextStyle.color, 'rgb(31, 41, 55)');
  const mutedColor = softenColor(textColor, 0.72);
  const headingColor = pickStyleValue(headingStyle.color, textColor);
  const fontFamily = pickStyleValue(sampleTextStyle.fontFamily, 'inherit');
  const buttonBackground = 'linear-gradient(180deg, #ffe7a3 0%, #ffd85c 100%)';

  card.style.setProperty('--nellis-compare-background', backgroundColor);
  card.style.setProperty('--nellis-compare-border', borderColor);
  card.style.setProperty('--nellis-compare-radius', borderRadius);
  card.style.setProperty('--nellis-compare-shadow', boxShadow);
  card.style.setProperty('--nellis-compare-text', textColor);
  card.style.setProperty('--nellis-compare-muted', mutedColor);
  card.style.setProperty('--nellis-compare-heading', headingColor);
  card.style.setProperty('--nellis-compare-font', fontFamily);
  card.style.setProperty('--nellis-compare-button-bg', buttonBackground);
}

function pickStyleValue(value, fallback) {
  if (!value || value === 'rgba(0, 0, 0, 0)' || value === 'none' || value === 'normal') {
    return fallback;
  }

  return value;
}

function softenColor(color, alpha) {
  const match = color.match(/\d+/g);
  if (!match || match.length < 3) {
    return color;
  }

  const [red, green, blue] = match;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function removeExistingCard() {
  const card = document.getElementById(CARD_ID);
  if (card) {
    card.remove();
  }
}

function isPurchasesPage(locationObject = window.location) {
  return locationObject.pathname === '/dashboard/purchases';
}

function renderPurchasesExportButton(routeKey) {
  if (!isPurchasesPage()) {
    purchasesRouteKey = '';
    purchasesRenderAttempts = 0;
    removePurchasesExportButton();
    return;
  }

  if (purchasesRouteKey !== routeKey) {
    purchasesRouteKey = routeKey;
    purchasesRenderAttempts = 0;
  }

  const anchor = findPurchasesAnchor();
  if (!anchor) {
    if (purchasesRenderAttempts < MAX_RENDER_RETRIES) {
      purchasesRenderAttempts += 1;
      window.setTimeout(scheduleRender, RENDER_RETRY_MS);
    }
    return;
  }

  purchasesRenderAttempts = 0;

  let button = document.getElementById(PURCHASES_EXPORT_ID);
  if (!button) {
    button = document.createElement('button');
    button.id = PURCHASES_EXPORT_ID;
    button.type = 'button';
    button.className = 'nellis-export-button';
    button.textContent = 'Export CSV';
    button.addEventListener('click', handlePurchasesExport);
  }

  button.dataset.routeKey = routeKey;

  if (button.parentElement !== anchor) {
    anchor.appendChild(button);
  }
}

function findPurchasesAnchor(root = document) {
  const headings = Array.from(root.querySelectorAll('h1, h2, h3, [role="heading"]'));
  const purchasesHeading = headings.find((node) =>
    node.textContent?.trim().toLowerCase().includes('purchases')
  );

  if (purchasesHeading?.parentElement) {
    return purchasesHeading.parentElement;
  }

  return (
    root.querySelector('[class*="purchase"] [class*="header"]') ||
    root.querySelector('[class*="Purchase"] [class*="Header"]') ||
    root.querySelector('main') ||
    null
  );
}

function removePurchasesExportButton() {
  const button = document.getElementById(PURCHASES_EXPORT_ID);
  if (button) {
    button.remove();
  }
}

async function handlePurchasesExport(event) {
  const button = event.currentTarget;
  if (!(button instanceof HTMLButtonElement) || purchasesExportInFlight) {
    return;
  }

  purchasesExportInFlight = true;
  setPurchasesButtonState(button, {
    disabled: true,
    label: 'Exporting...',
  });

  try {
    const records = await fetchAllPurchases();
    const csvText = buildPurchasesCsv(records);
    downloadPurchasesCsv(csvText);

    setPurchasesButtonState(button, {
      disabled: false,
      label: 'Export CSV',
    });
  } catch (error) {
    console.error('[NellisCompare] Failed to export purchases:', error);
    setPurchasesButtonState(button, {
      disabled: false,
      label: 'Export failed',
    });
    window.setTimeout(() => {
      const liveButton = document.getElementById(PURCHASES_EXPORT_ID);
      if (liveButton instanceof HTMLButtonElement) {
        setPurchasesButtonState(liveButton, {
          disabled: false,
          label: 'Export CSV',
        });
      }
    }, 2000);
  } finally {
    purchasesExportInFlight = false;
  }
}

function setPurchasesButtonState(button, { disabled, label }) {
  button.disabled = disabled;
  button.textContent = label;
}

async function fetchAllPurchases() {
  const strategies = [
    { firstPage: 0, omitPageParam: false },
    { firstPage: 1, omitPageParam: false },
    { firstPage: 0, omitPageParam: true },
  ];

  for (const strategy of strategies) {
    const records = await fetchAllPurchasesWithStrategy(strategy);
    if (records.length) {
      return records;
    }
  }

  return [];
}

async function fetchAllPurchasesWithStrategy({ firstPage, omitPageParam }) {
  const allRecords = [];
  let page = firstPage;
  let total = Infinity;
  let pageIndex = 0;

  while (allRecords.length < total) {
    const pageData = await fetchPurchasesPage({
      page,
      size: PURCHASES_PAGE_SIZE,
      omitPageParam: omitPageParam && pageIndex === 0,
    });
    const records = getPurchasesRecords(pageData);
    const nextTotal = Number(pageData?.total);

    total = Number.isFinite(nextTotal) && nextTotal >= 0 ? nextTotal : records.length;

    if (!records.length) {
      break;
    }

    allRecords.push(...records);
    page += 1;
    pageIndex += 1;
  }

  return allRecords.slice(0, Number.isFinite(total) ? total : allRecords.length);
}

async function fetchPurchasesPage({ page, size, omitPageParam = false }) {
  const endpointUrl = new URL('/dashboard/purchases', window.location.origin);
  endpointUrl.searchParams.set('_data', 'routes/dashboard.purchases._index');
  endpointUrl.searchParams.set('size', String(size));

  if (!omitPageParam) {
    endpointUrl.searchParams.set('page', String(page));
  }

  try {
    const response = await fetch(endpointUrl.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`Purchases request failed with status ${response.status}`);
    }

    const responseText = await response.text();
    const parsed = JSON.parse(responseText);
    return getPurchasesPageData(parsed);
  } catch (error) {
    const fallbackResponse = await sendRuntimeMessage({
      type: 'FETCH_PURCHASES_PAGE',
      page,
      size,
    });

    if (fallbackResponse?.error) {
      throw error;
    }

    return getPurchasesPageData(fallbackResponse?.data);
  }
}

function getPurchasesPageData(payload) {
  if (Array.isArray(payload?.records)) {
    return payload;
  }

  if (Array.isArray(payload?.data?.records)) {
    return payload.data;
  }

  if (Array.isArray(payload?.purchases?.records)) {
    return payload.purchases;
  }

  if (Array.isArray(payload?.purchaseHistory?.records)) {
    return payload.purchaseHistory;
  }

  return {
    total: 0,
    records: [],
  };
}

function getPurchasesRecords(pageData) {
  return Array.isArray(pageData?.records) ? pageData.records : [];
}

function buildPurchasesCsv(records) {
  const columns = [
    ['buyNowId', (record) => record.buyNowId],
    ['projectId', (record) => record.projectId],
    ['originalReceiptId', (record) => record.originalReceiptId],
    ['originalReceiptCreatedAt', (record) => getDateValue(record.originalReceiptCreatedAt)],
    ['locationName', (record) => record.locationName],
    ['locationCity', (record) => record.locationCity],
    ['inventoryNumber', (record) => record.inventoryNumber],
    ['leadDescription', (record) => record.leadDescription],
    ['photoUrl', (record) => record.photo?.url || ''],
    ['returnReceiptId', (record) => record.returnReceiptId],
    ['returnCreatedAt', (record) => getDateValue(record.returnCreatedAt)],
    ['returnUpdatedAt', (record) => getDateValue(record.returnUpdatedAt)],
    ['returnStatusId', (record) => record.returnStatusId],
    ['returnStatus', (record) => record.returnStatus],
    ['returnId', (record) => record.returnId],
    ['notReturnable', (record) => record.notReturnable],
  ];

  const headerRow = columns.map(([name]) => csvEscape(name)).join(',');
  const bodyRows = records.map((record) =>
    columns.map(([, getter]) => csvEscape(getter(record))).join(',')
  );

  return [headerRow, ...bodyRows].join('\r\n');
}

function getDateValue(value) {
  return value?.value || '';
}

function csvEscape(value) {
  const normalizedValue = value == null ? '' : String(value);
  return `"${normalizedValue.replace(/"/g, '""')}"`;
}

function downloadPurchasesCsv(csvText) {
  const blob = new Blob(['\uFEFF', csvText], { type: 'text/csv;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);

  link.href = objectUrl;
  link.download = `nellis-purchases-${dateStamp}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${CARD_ID} {
      margin-top: 16px;
      border: 1px solid var(--nellis-compare-border, rgba(15, 23, 42, 0.08));
      border-radius: var(--nellis-compare-radius, 12px);
      background: var(--nellis-compare-background, #ffffff);
      box-shadow: var(--nellis-compare-shadow, 0 6px 18px rgba(15, 23, 42, 0.06));
      padding: 16px;
      color: var(--nellis-compare-text, #1f2937);
      font-family: var(--nellis-compare-font, inherit);
    }

    #${CARD_ID} * {
      box-sizing: border-box;
      font-family: inherit;
    }

    #${CARD_ID} .nellis-compare__header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    #${CARD_ID} .nellis-compare__badge {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      font: 700 16px/1 Arial, sans-serif;
      color: #111827;
      background: linear-gradient(135deg, #ffe082 0%, #ffc94d 100%);
      text-transform: lowercase;
    }

    #${CARD_ID} .nellis-compare__title {
      margin: 0;
      font-size: 15px;
      line-height: 1.2;
      font-weight: 700;
      color: var(--nellis-compare-heading, #111827);
    }

    #${CARD_ID} .nellis-compare__status {
      font-size: 13px;
      line-height: 1.5;
      color: var(--nellis-compare-muted, #6b7280);
    }

    #${CARD_ID} .nellis-compare__body {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr);
      gap: 14px;
      align-items: start;
    }

    #${CARD_ID} .nellis-compare__image-wrap {
      width: 92px;
      height: 92px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.7);
      border: 1px solid var(--nellis-compare-border, rgba(15, 23, 42, 0.08));
      display: grid;
      place-items: center;
      overflow: hidden;
    }

    #${CARD_ID} .nellis-compare__image {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #fff;
    }

    #${CARD_ID} .nellis-compare__content {
      min-width: 0;
    }

    #${CARD_ID} .nellis-compare__product-title {
      display: inline-block;
      margin: 0 0 12px;
      color: var(--nellis-compare-heading, #111827);
      text-decoration: none;
      font-size: 14px;
      line-height: 1.5;
      font-weight: 600;
    }

    #${CARD_ID} .nellis-compare__product-title:hover {
      text-decoration: underline;
    }

    #${CARD_ID} .nellis-compare__price {
      margin: 0 0 12px;
      font-size: 20px;
      line-height: 1.1;
      font-weight: 800;
      color: #a16207;
    }

    #${CARD_ID} .nellis-compare__button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid #f2c200;
      background: var(--nellis-compare-button-bg, linear-gradient(180deg, #ffe7a3 0%, #ffd85c 100%));
      color: #111827;
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
    }

    #${CARD_ID} .nellis-compare__button:hover {
      filter: brightness(0.98);
    }

    .nellis-export-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0 16px;
      border-radius: 12px;
      border: 1px solid rgba(15, 23, 42, 0.12);
      background: #ffffff;
      color: #111827;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 12px;
    }

    .nellis-export-button:hover:not(:disabled) {
      filter: brightness(0.98);
    }

    .nellis-export-button:disabled {
      cursor: wait;
      opacity: 0.7;
    }

    @media (max-width: 720px) {
      #${CARD_ID} .nellis-compare__body {
        grid-template-columns: 1fr;
      }

      #${CARD_ID} .nellis-compare__image-wrap {
        width: 100%;
        max-width: 120px;
      }
    }
  `;

  (document.head || document.documentElement).appendChild(style);
}
