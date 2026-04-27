import {
  formatNellisCloseTimeTooltip,
  mergeAuctionListPhotoPayload,
  mergeCloseTimeFromRemixPayload,
  mergeNellisItemPagePhotoPayload,
  mergeProductsPhotoPayload,
  mergeWatchlistCountFromRemixPayload,
  parseNellisItemIdFromHref,
  parseNellisItemIdFromPathname,
  shouldParseNellisAuctionRemixDataKey,
  shouldParseNellisSearchRemixDataKey,
  shouldParseNellisSpotlightRemixDataKey,
} from '../shared/nellisAuctionListPhotos.js';
import {
  extractNellisItem,
  findNellisPriceTargets,
  findNellisTimeTargets,
  findItemDetailsAnchor,
  hasNellisPriceCards,
  isNellisAuctionSite,
  isNellisCartPage,
  isNellisDashboardAuctionListPage,
  isNellisItemPage,
  isNellisSearchPage,
  isNellisSpotlightPage,
  isNellisOnlyItemTitle,
  parseCurrencyAmount,
} from '../shared/nellisPage.js';
import { sendRuntimeMessage } from '../shared/extensionApi.js';
import { getAmazonItemFromHtml } from '../shared/amazonSource.js';
import { parseAmazonProductPage } from '../shared/productMatcher.js';

import {
  AUCTION_LIST_PHOTO_BAR_CLASS,
  AUCTION_LIST_PHOTO_WRAP_CLASS,
  BID_TOTAL_HINT_CLASS,
  BUYER_PREMIUM_RATE,
  CARD_ID,
  CART_BULK_CHECKOUT_TOOLBAR_ID,
  CART_BULK_TOOLBAR_ID,
  CART_SORT_DROPDOWN_ID,
  CART_SORT_STORAGE_KEY,
  CART_ITEM_FEE_HINT_CLASS,
  DARK_MODE_CRITICAL_STYLE_ID,
  DARK_MODE_HTML_CLASS,
  DARK_MODE_ICON_MOON,
  DARK_MODE_ICON_SUN,
  DARK_MODE_STORAGE_KEY,
  DARK_MODE_TOGGLE_CLASS,
  DARK_MODE_TOGGLE_ID,
  MAX_RENDER_RETRIES,
  PREMIUM_HINT_CLASS,
  PURCHASES_EXPORT_ID,
  PURCHASES_PAGE_SIZE,
  RECEIPTS_PAGE_SIZE,
  RECEIPTS_SUMMARY_ID,
  RENDER_DEBOUNCE_MS,
  RENDER_RETRY_MS,
  ROUTE_WATCH_INTERVAL_MS,
  TIME_HINT_CLASS,
  WATCHLIST_COUNT_CLASS,
} from '../shared/nellisUiConstants.js';
import { injectStyles } from '../shared/nellisInjectedStyles.js';

let activeRouteKey = '';
let renderTimer = 0;
let lookupSequence = 0;
let lastRenderedTitle = '';
let pendingRouteKey = '';
let pendingRouteAttempts = 0;
let purchasesExportInFlight = false;
let purchasesRouteKey = '';
let purchasesRenderAttempts = 0;
let receiptsRouteKey = '';
let receiptsRenderAttempts = 0;
let receiptsSummaryInFlight = false;
let cartBulkRouteKey = '';
let cartBulkRenderAttempts = 0;
let cartBulkSaveInFlight = false;
let cartBulkCheckoutInFlight = false;
let cartSortObserver = null;
let cartSortRaf = 0;
let cartSortApplying = false;
let lastKnownUrl = window.location.href;
/** Item id → formatted local time for “time left” hover (from Remix loaders or HTML fallback). */
const closeTimeByItemId = new Map();
const watchlistCountByItemId = new Map();
const auctionListPhotosByItemId = new Map();
const prefetchedAuctionPhotoUrls = new Set();
const activeAuctionPhotoPrefetches = new Map();
let lastCartPickupsItems = [];

/**
 * Remix `fetch` runs in the page main world; the isolated content script cannot patch it.
 * `pageWorldFetchBridge.bundle.js` (MAIN world, document_start) patches `fetch` and dispatches
 * `nellis-enhanced-remix` on `document` with `{ dataKey, json }`.
 */
function shouldParseRemixLoaderDataKey(dataKey) {
  if (shouldParseNellisAuctionRemixDataKey(dataKey)) {
    return true;
  }
  if (shouldParseNellisSearchRemixDataKey(dataKey)) {
    return true;
  }
  if (shouldParseNellisSpotlightRemixDataKey(dataKey)) {
    return true;
  }
  if (isNellisItemPage()) {
    return true;
  }
  if (isNellisCartPage()) {
    return true;
  }
  if (isNellisDashboardAuctionListPage()) {
    return true;
  }
  if (isNellisSearchPage()) {
    return true;
  }
  if (isNellisSpotlightPage()) {
    return true;
  }
  return false;
}

function handleRemixLoaderPayload(json, dataKey) {
  if (!shouldParseRemixLoaderDataKey(dataKey)) {
    return;
  }

  let changed = mergeAuctionListPhotoPayload(json, auctionListPhotosByItemId);
  changed = mergeProductsPhotoPayload(json, auctionListPhotosByItemId) || changed;
  changed = mergeCloseTimeFromRemixPayload(json, closeTimeByItemId) || changed;
  changed = mergeWatchlistCountFromRemixPayload(json, watchlistCountByItemId) || changed;
  if (isCartPage()) {
    const maybeItems = getCartPickUpsItemsFromRemixPayload(json);
    if (maybeItems) {
      lastCartPickupsItems = maybeItems;
      applyCartSortToDom(getStoredCartSortKey());
    }
  }
  if (isNellisItemPage()) {
    const pageId = parseNellisItemIdFromPathname(window.location.pathname);
    if (pageId) {
      changed = mergeNellisItemPagePhotoPayload(json, pageId, auctionListPhotosByItemId) || changed;
    }
  }
  if (changed) {
    scheduleRender();
  }
}

document.addEventListener('nellis-enhanced-remix', (event) => {
  const detail = event?.detail;
  if (!detail || detail.json === undefined || !detail.dataKey) {
    return;
  }
  try {
    handleRemixLoaderPayload(detail.json, detail.dataKey);
  } catch (err) {
    console.warn('[NellisEnhanced] remix loader handler error:', err);
  }
});

// Content scripts are registered at document_start; running theme + CSS only from init()
// (on DOMContentLoaded) lets the first paint happen in light mode before dark styles apply.
applyStoredDarkMode();
injectStyles();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

function init() {
  injectStyles();
  applyStoredDarkMode();
  installDarkModeResyncListeners();
  installRouteListeners();
  scheduleRender();
}

function installDarkModeResyncListeners() {
  // Background/prerendered tabs can temporarily deny storage access. Re-apply on activation.
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      applyStoredDarkMode();
      syncDarkModeToggleButtons();
      refreshComparisonCardStyling();
    }
  });

  window.addEventListener('pageshow', () => {
    applyStoredDarkMode();
    syncDarkModeToggleButtons();
    refreshComparisonCardStyling();
  });
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
    if (
      (isPurchasesPage() && !document.getElementById(PURCHASES_EXPORT_ID)) ||
      (isNellisCartPage() && needsCartBulkUiRefresh()) ||
      (isNellisItemPage() && !document.getElementById(CARD_ID)) ||
      (isNellisAuctionSite() && needsDarkModeToggleRender()) ||
      needsNellisItemImageCarouselRefresh() ||
      needsWatchlistCountRefresh() ||
      hasTooltipRefreshTargets() ||
      hasBidTotalHintRefreshTargets()
    ) {
      scheduleRender();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
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

    if (isNellisCartPage() && needsCartBulkUiRefresh()) {
      scheduleRender();
      return;
    }

    if (isNellisItemPage() && !document.getElementById(CARD_ID)) {
      scheduleRender();
      return;
    }

    if (isNellisAuctionSite() && needsDarkModeToggleRender()) {
      scheduleRender();
      return;
    }

    if (needsNellisItemImageCarouselRefresh()) {
      scheduleRender();
      return;
    }

    if (needsWatchlistCountRefresh()) {
      scheduleRender();
      return;
    }

    if (hasBidTotalHintRefreshTargets()) {
      scheduleRender();
    }
  }, ROUTE_WATCH_INTERVAL_MS);
}

function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderPageFeatures, RENDER_DEBOUNCE_MS);
}

/**
 * Reserve the Amazon comparison slot as soon as Item Details is in the DOM so
 * later injections (carousel controls, etc.) do not push the section downward first.
 */
function primeComparisonCardSlot() {
  if (!isNellisItemPage()) {
    return;
  }

  const anchor = findItemDetailsAnchor();
  if (!anchor) {
    return;
  }

  const nellisItem = extractNellisItem();
  if (nellisItem?.title && isNellisOnlyItemTitle(nellisItem.title)) {
    removeExistingCard();
    return;
  }

  if (document.getElementById(CARD_ID)) {
    return;
  }

  const card = ensureCard(anchor);
  updateCardState(card, {
    state: 'loading',
    nellisItem: nellisItem?.title ? nellisItem : { title: '', imageSrc: '', price: '' },
  });
}

async function renderPageFeatures() {
  const routeKey = `${window.location.pathname}${window.location.search}`;
  injectStyles();
  applyStoredDarkMode();
  if (isNellisItemPage()) {
    primeComparisonCardSlot();
  }
  renderPurchasesExportButton(routeKey);
  renderReceiptsSummary(routeKey);
  renderCartBulkUis(routeKey);
  renderNellisItemImageCarousels(routeKey);
  renderWatchlistCountBadges(routeKey);
  renderDarkModeToggleButtons();
  attachPricePremiumHint();
  attachBidTotalPremiumHint();
  attachTimeEndHint();
  attachCartItemFeeHint();

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

  const itemDetailsAnchor = findItemDetailsAnchor();
  const nellisItem = extractNellisItem();

  if (!itemDetailsAnchor) {
    if (pendingRouteAttempts < MAX_RENDER_RETRIES) {
      pendingRouteAttempts += 1;
      window.setTimeout(scheduleRender, RENDER_RETRY_MS);
    }
    return;
  }

  if (!nellisItem?.title) {
    if (pendingRouteAttempts < MAX_RENDER_RETRIES) {
      pendingRouteAttempts += 1;
      window.setTimeout(scheduleRender, RENDER_RETRY_MS);
    } else {
      removeExistingCard();
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

  if (itemDetailsAnchor.parentElement) {
    itemDetailsAnchor.parentElement.insertBefore(card, itemDetailsAnchor);
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

function attachPricePremiumHint() {
  const targets = findNellisPriceTargets();
  const activeTargets = new Set();

  for (const target of targets) {
    const amount = parseCurrencyAmount(target.priceNode?.textContent);
    if (amount === null) {
      continue;
    }

    const totalWithPremium = formatCurrency(amount * (1 + BUYER_PREMIUM_RATE));

    activeTargets.add(target.container);
    target.container.classList.add(PREMIUM_HINT_CLASS);
    target.container.setAttribute('data-premium-tooltip', `Actual total: ${totalWithPremium}`);
    target.container.dataset.premiumSourceAmount = amount.toFixed(2);
  }

  removeStaleTooltipTargets(PREMIUM_HINT_CLASS, 'data-premium-tooltip', activeTargets);
}

function attachBidTotalPremiumHint(root = document) {
  const forms = root.querySelectorAll(
    'form[data-ax="item-card-bid-form"], form[data-ax="product-page-bid-form"]'
  );

  for (const form of forms) {
    if (!(form instanceof HTMLFormElement)) {
      continue;
    }

    const input = form.querySelector('input[name="wsprice"][type="number"]');
    if (!(input instanceof HTMLInputElement)) {
      continue;
    }

    const hint = ensureBidTotalHint(form, input);
    updateBidTotalHint(hint, input);

    if (input.dataset.nellisBidTotalHintBound !== 'true') {
      const handler = () => updateBidTotalHint(hint, input);
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
      input.dataset.nellisBidTotalHintBound = 'true';
    }
  }
}

function ensureBidTotalHint(form, input) {
  const existing = form.querySelector(
    `.${BID_TOTAL_HINT_CLASS}[data-bid-input-id="${cssEscape(input.id)}"]`
  );
  if (existing instanceof HTMLElement) {
    return existing;
  }

  const hint = document.createElement('div');
  hint.className = BID_TOTAL_HINT_CLASS;
  hint.setAttribute('role', 'note');
  hint.setAttribute('aria-live', 'polite');
  hint.dataset.bidInputId = input.id;

  const label = form.querySelector(`label[for="${cssEscape(input.id)}"]`);
  if (label) {
    label.appendChild(hint);
  } else {
    form.appendChild(hint);
  }

  return hint;
}

function updateBidTotalHint(hint, input) {
  if (!(hint instanceof HTMLElement)) {
    return;
  }

  const rawValue = input.value;
  const sourceText = rawValue === '' ? input.placeholder : rawValue;
  const bidAmount = sourceText === '' ? NaN : Number(sourceText);

  if (!Number.isFinite(bidAmount) || bidAmount < 0) {
    hint.textContent = 'Total: —';
    hint.hidden = false;
    return;
  }

  const total = bidAmount * (1 + BUYER_PREMIUM_RATE);
  const premium = total - bidAmount;

  hint.hidden = false;
  hint.textContent = `Total: ${formatCurrency(total)} (+${formatCurrency(premium)} fees)`;
}

function attachCartItemFeeHint(root = document) {
  if (!isCartPage()) {
    removeCartItemFeeHints(root);
    return;
  }

  const containers = root.querySelectorAll('[data-ax="pickups-item-container"]');
  const activeContainers = new Set();

  for (const container of containers) {
    if (!(container instanceof HTMLElement)) {
      continue;
    }

    const targets = findCartItemPriceTargets(container);
    if (!targets) {
      continue;
    }

    const { priceNode, insertAfterNode } = targets;
    const amount = parseCurrencyAmount(priceNode.textContent);
    if (amount === null) {
      continue;
    }

    const hint = ensureCartItemFeeHint(container, insertAfterNode);
    updateCartItemFeeHint(hint, amount);
    activeContainers.add(container);
  }

  removeStaleCartItemFeeHints(activeContainers);
}

function findCartItemPriceTargets(container) {
  const form = container.querySelector('form[action^="/dashboard/cart/"]');
  if (!form?.parentElement) {
    return null;
  }

  const priceNode = form.parentElement.querySelector('p');
  if (!(priceNode instanceof HTMLParagraphElement)) {
    return null;
  }

  return { priceNode, insertAfterNode: priceNode };
}

function ensureCartItemFeeHint(container, insertAfterNode) {
  const existing = container.querySelector(`.${CART_ITEM_FEE_HINT_CLASS}`);
  if (existing instanceof HTMLElement) {
    return existing;
  }

  const hint = document.createElement('div');
  hint.className = `${CART_ITEM_FEE_HINT_CLASS} text-label-sm opacity-60`;
  hint.setAttribute('role', 'note');
  hint.setAttribute('aria-live', 'polite');

  insertAfterNode.insertAdjacentElement('afterend', hint);
  return hint;
}

function updateCartItemFeeHint(hint, amount) {
  if (!(hint instanceof HTMLElement)) {
    return;
  }

  const total = amount * (1 + BUYER_PREMIUM_RATE);
  const premium = total - amount;
  hint.hidden = false;
  hint.textContent = `Total: ${formatCurrency(total)} (+${formatCurrency(premium)} fees)`;
  hint.dataset.premiumSourceAmount = amount.toFixed(2);
}

function removeStaleCartItemFeeHints(activeContainers) {
  for (const node of document.querySelectorAll(`.${CART_ITEM_FEE_HINT_CLASS}`)) {
    const owner = node.closest('[data-ax="pickups-item-container"]');
    if (!owner || !activeContainers.has(owner)) {
      node.remove();
    }
  }
}

function removeCartItemFeeHints(root = document) {
  for (const node of root.querySelectorAll(`.${CART_ITEM_FEE_HINT_CLASS}`)) {
    node.remove();
  }
}

function cssEscape(value) {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, '\\$&');
}

function attachTimeEndHint() {
  const targets = findNellisTimeTargets();
  const activeTargets = new Set();

  for (const target of targets) {
    activeTargets.add(target.container);
    target.container.classList.add(TIME_HINT_CLASS);
    const itemUrl = getItemUrlForTimeTarget(target.container);
    const itemId = itemUrl ? parseNellisItemIdFromHref(itemUrl) : null;
    const tip =
      itemId && closeTimeByItemId.has(itemId) ? closeTimeByItemId.get(itemId) || '' : '';
    target.container.setAttribute('data-time-tooltip', tip);

    if (target.container.dataset.timeHintBound !== 'true') {
      target.container.addEventListener('mouseenter', handleTimeHintHover);
      target.container.addEventListener('focusin', handleTimeHintHover);
      target.container.dataset.timeHintBound = 'true';
    }
  }

  removeStaleTimeTargets(activeTargets);
}

function removePricePremiumHints() {
  for (const node of document.querySelectorAll(`.${PREMIUM_HINT_CLASS}`)) {
    node.classList.remove(PREMIUM_HINT_CLASS);
    node.removeAttribute('data-premium-tooltip');
    if (node instanceof HTMLElement) {
      delete node.dataset.premiumSourceAmount;
    }
  }
}

function removeTimeEndHints() {
  for (const node of document.querySelectorAll(`.${TIME_HINT_CLASS}`)) {
    node.classList.remove(TIME_HINT_CLASS);
    node.removeAttribute('data-time-tooltip');
    if (node instanceof HTMLElement && node.dataset.timeHintBound === 'true') {
      node.removeEventListener('mouseenter', handleTimeHintHover);
      node.removeEventListener('focusin', handleTimeHintHover);
      delete node.dataset.timeHintBound;
    }
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

async function handleTimeHintHover(event) {
  const container = event.currentTarget;
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const itemUrl = getItemUrlForTimeTarget(container);
  if (!itemUrl) {
    container.setAttribute('data-time-tooltip', '');
    return;
  }

  const itemId = parseNellisItemIdFromHref(itemUrl);
  if (itemId && closeTimeByItemId.has(itemId)) {
    container.setAttribute('data-time-tooltip', closeTimeByItemId.get(itemId) || '');
    return;
  }

  container.setAttribute('data-time-tooltip', 'Loading...');

  try {
    const response = await fetch(itemUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Nellis item request failed with status ${response.status}`);
    }

    const html = await response.text();
    const tooltipText = extractCloseTimeTooltipFromHtml(html);
    if (itemId && tooltipText) {
      closeTimeByItemId.set(itemId, tooltipText);
    }
    container.setAttribute('data-time-tooltip', tooltipText);
  } catch (error) {
    console.error('[NellisCompare] Failed to resolve exact close time:', error);
    container.setAttribute('data-time-tooltip', '');
  }
}

function getItemUrlForTimeTarget(container) {
  const itemCard = container.closest('[data-ax="item-card-container"]');
  const cardLink = itemCard?.querySelector(
    'a[data-ax="item-card-title-link"], a[data-ax="item-card-image-link"]'
  );
  const href = cardLink?.getAttribute('href');

  if (href) {
    return new URL(href, window.location.origin).toString();
  }

  if (container.closest('#bid-section') && isNellisItemPage()) {
    return window.location.href;
  }

  return '';
}

function extractCloseTimeTooltipFromHtml(html) {
  const match = html.match(/"closeTime":\{"__type":"Date","value":"([^"]+)"\}/);
  if (!match?.[1]) {
    return '';
  }

  const closeTime = new Date(match[1]);
  if (Number.isNaN(closeTime.getTime())) {
    return '';
  }

  return formatNellisCloseTimeTooltip(closeTime);
}

function hasTooltipRefreshTargets() {
  if (!hasNellisPriceCards()) {
    return false;
  }

  return (
    findNellisPriceTargets().some((target) => {
      if (!target.container.classList.contains(PREMIUM_HINT_CLASS)) {
        return true;
      }

      const amount = parseCurrencyAmount(target.priceNode?.textContent);
      if (amount === null || !(target.container instanceof HTMLElement)) {
        return false;
      }

      return target.container.dataset.premiumSourceAmount !== amount.toFixed(2);
    }) ||
    findNellisTimeTargets().some((target) => !target.container.classList.contains(TIME_HINT_CLASS))
  );
}

function hasBidTotalHintRefreshTargets(root = document) {
  const forms = root.querySelectorAll(
    'form[data-ax="item-card-bid-form"], form[data-ax="product-page-bid-form"]'
  );
  if (!forms.length) {
    return false;
  }

  for (const form of forms) {
    const input = form.querySelector('input[name="wsprice"][type="number"]');
    if (!(input instanceof HTMLInputElement)) {
      continue;
    }

    if (input.dataset.nellisBidTotalHintBound !== 'true') {
      return true;
    }

    if (!input.id) {
      continue;
    }

    const hint = form.querySelector(
      `.${BID_TOTAL_HINT_CLASS}[data-bid-input-id="${cssEscape(input.id)}"]`
    );
    if (!(hint instanceof HTMLElement)) {
      return true;
    }
  }

  return false;
}

function removeStaleTooltipTargets(className, attributeName, activeTargets) {
  for (const node of document.querySelectorAll(`.${className}`)) {
    if (!activeTargets.has(node)) {
      node.classList.remove(className);
      node.removeAttribute(attributeName);
    }
  }
}

function removeStaleTimeTargets(activeTargets) {
  for (const node of document.querySelectorAll(`.${TIME_HINT_CLASS}`)) {
    if (!activeTargets.has(node)) {
      node.classList.remove(TIME_HINT_CLASS);
      node.removeAttribute('data-time-tooltip');

      if (node instanceof HTMLElement && node.dataset.timeHintBound === 'true') {
        node.removeEventListener('mouseenter', handleTimeHintHover);
        node.removeEventListener('focusin', handleTimeHintHover);
        delete node.dataset.timeHintBound;
      }
    }
  }
}

function isPurchasesPage(locationObject = window.location) {
  return locationObject.pathname === '/dashboard/purchases';
}

function isReceiptsPage(locationObject = window.location) {
  return locationObject.pathname === '/dashboard/receipts';
}

function isCartPage(locationObject = window.location) {
  return locationObject.pathname === '/dashboard/cart' || locationObject.pathname.startsWith('/dashboard/cart/');
}

function needsNellisItemImageCarouselRefresh() {
  if (!isNellisAuctionSite()) {
    return false;
  }

  for (const anchor of document.querySelectorAll(
    'a[data-ax="item-card-image-link"][href*="/p/"]'
  )) {
    const itemId = parseNellisItemIdFromHref(anchor.getAttribute('href'));
    if (!itemId) {
      continue;
    }
    const photos = auctionListPhotosByItemId.get(itemId);
    if (!photos || photos.length < 2) {
      continue;
    }
    const img = anchor.querySelector('img[src]');
    if (img && !img.closest(`.${AUCTION_LIST_PHOTO_WRAP_CLASS}`)) {
      return true;
    }
  }

  return false;
}

function normalizePhotoUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  try {
    return new URL(url, window.location.href).toString();
  } catch {
    return '';
  }
}

function getItemIdFromAuctionCard(card) {
  const cardLink = card.querySelector(
    'a[data-ax="item-card-title-link"], a[data-ax="item-card-image-link"]'
  );
  return parseNellisItemIdFromHref(cardLink?.getAttribute('href'));
}

function prefetchAuctionListPhotos(itemId, currentSrc = '') {
  const photos = auctionListPhotosByItemId.get(itemId);
  if (!photos || photos.length < 2) {
    return;
  }

  const activeUrl = normalizePhotoUrl(currentSrc);
  for (const photo of photos) {
    const url = normalizePhotoUrl(photo);
    if (!url || url === activeUrl || prefetchedAuctionPhotoUrls.has(url)) {
      continue;
    }

    prefetchedAuctionPhotoUrls.add(url);
    const image = new Image();
    activeAuctionPhotoPrefetches.set(url, image);

    const cleanup = () => {
      activeAuctionPhotoPrefetches.delete(url);
    };
    const allowRetry = () => {
      prefetchedAuctionPhotoUrls.delete(url);
      cleanup();
    };

    image.addEventListener('load', cleanup, { once: true });
    image.addEventListener('error', allowRetry, { once: true });
    image.decoding = 'async';
    image.src = url;
  }
}

function prefetchAuctionListPhotosForCard(card) {
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const itemId = getItemIdFromAuctionCard(card);
  if (!itemId) {
    return;
  }

  const image = card.querySelector(
    `.${AUCTION_LIST_PHOTO_WRAP_CLASS} img, a[data-ax="item-card-image-link"] img`
  );
  const currentSrc =
    image instanceof HTMLImageElement ? image.currentSrc || image.src || '' : '';
  prefetchAuctionListPhotos(itemId, currentSrc);
}

function bindAuctionPhotoPrefetch(anchor) {
  const card = anchor.closest('[data-ax="item-card-container"]') || anchor;
  if (!(card instanceof HTMLElement) || card.dataset.nellisPhotoPrefetchBound === 'true') {
    return;
  }

  const handlePrefetch = () => prefetchAuctionListPhotosForCard(card);
  card.addEventListener('pointerenter', handlePrefetch);
  card.addEventListener('focusin', handlePrefetch);
  card.dataset.nellisPhotoPrefetchBound = 'true';
}

function attachNellisPhotoCarouselToAnchor(anchor, itemId, routeKey) {
  const photos = auctionListPhotosByItemId.get(itemId);
  if (!photos || photos.length < 2) {
    return;
  }

  const img = anchor.querySelector('img[src]');
  if (!img || img.closest(`.${AUCTION_LIST_PHOTO_WRAP_CLASS}`)) {
    return;
  }

  const wrap = document.createElement('span');
  wrap.className = AUCTION_LIST_PHOTO_WRAP_CLASS;
  wrap.dataset.nellisItemId = itemId;
  wrap.dataset.routeKey = routeKey;

  const bar = document.createElement('span');
  bar.className = AUCTION_LIST_PHOTO_BAR_CLASS;
  bar.innerHTML = `
      <button type="button" data-nellis-photo-prev aria-label="Previous photo">‹</button>
      <span data-nellis-photo-count></span>
      <button type="button" data-nellis-photo-next aria-label="Next photo">›</button>
    `;

  img.replaceWith(wrap);
  wrap.appendChild(img);
  wrap.appendChild(bar);

  const prevBtn = bar.querySelector('[data-nellis-photo-prev]');
  const nextBtn = bar.querySelector('[data-nellis-photo-next]');
  const countEl = bar.querySelector('[data-nellis-photo-count]');

  let index = 0;
  const syncFromMap = () => {
    const list = auctionListPhotosByItemId.get(itemId) || photos;
    if (list.length < 2) {
      return list;
    }
    index = ((index % list.length) + list.length) % list.length;
    const url = list[index];
    if (url && img instanceof HTMLImageElement) {
      img.src = url;
    }
    if (countEl) {
      countEl.textContent = `${index + 1} / ${list.length}`;
    }
    return list;
  };

  syncFromMap();

  const step = (delta) => {
    const list = auctionListPhotosByItemId.get(itemId) || photos;
    if (list.length < 2) {
      return;
    }
    index = (index + delta + list.length) % list.length;
    syncFromMap();
  };

  const stopNav = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  prevBtn?.addEventListener('click', (event) => {
    stopNav(event);
    step(-1);
  });
  nextBtn?.addEventListener('click', (event) => {
    stopNav(event);
    step(1);
  });
}

function renderNellisItemImageCarousels(routeKey) {
  if (!isNellisAuctionSite()) {
    return;
  }

  for (const anchor of document.querySelectorAll(
    'a[data-ax="item-card-image-link"][href*="/p/"]'
  )) {
    const itemId = parseNellisItemIdFromHref(anchor.getAttribute('href'));
    if (!itemId) {
      continue;
    }
    bindAuctionPhotoPrefetch(anchor);
    attachNellisPhotoCarouselToAnchor(anchor, itemId, routeKey);
  }
}

function getProductIdFromWatchlistForm(form) {
  const input = form.querySelector('input[name="productId"]');
  if (input instanceof HTMLInputElement) {
    const v = input.value.trim();
    if (/^\d+$/.test(v)) {
      return v;
    }
  }
  return null;
}

function renderWatchlistCountBadges(_routeKey) {
  if (!isNellisAuctionSite()) {
    return;
  }

  const forms = document.querySelectorAll(
    '[data-ax="item-card-watchlist-form"], [data-ax="product-page-watchlist-form"]'
  );
  const activeButtons = new Set();

  for (const form of forms) {
    if (!(form instanceof HTMLFormElement)) {
      continue;
    }
    const button = form.querySelector('button');
    if (!(button instanceof HTMLElement)) {
      continue;
    }
    activeButtons.add(button);

    const id = getProductIdFromWatchlistForm(form);
    const count = id ? watchlistCountByItemId.get(id) : undefined;

    let span = button.querySelector(`.${WATCHLIST_COUNT_CLASS}`);

    if (count === undefined || count === 0) {
      span?.remove();
      continue;
    }

    if (!span) {
      span = document.createElement('span');
      span.className = WATCHLIST_COUNT_CLASS;
      span.setAttribute('data-nellis-watchlist-count', '');
      button.appendChild(span);
    }
    span.setAttribute('aria-label', `${count} on watchlist`);
    span.textContent = String(count);
  }

  for (const span of document.querySelectorAll(`.${WATCHLIST_COUNT_CLASS}`)) {
    const parent = span.parentElement;
    if (!(parent instanceof HTMLElement) || !activeButtons.has(parent)) {
      span.remove();
    }
  }

  for (const form of forms) {
    const next = form.nextElementSibling;
    if (next instanceof HTMLElement && next.classList.contains(WATCHLIST_COUNT_CLASS)) {
      next.remove();
    }
  }
}

function needsWatchlistCountRefresh() {
  if (!isNellisAuctionSite()) {
    return false;
  }

  for (const form of document.querySelectorAll(
    '[data-ax="item-card-watchlist-form"], [data-ax="product-page-watchlist-form"]'
  )) {
    if (!(form instanceof HTMLFormElement)) {
      continue;
    }
    const id = getProductIdFromWatchlistForm(form);
    if (!id) {
      continue;
    }
    const count = watchlistCountByItemId.get(id);
    const button = form.querySelector('button');
    if (!(button instanceof HTMLElement)) {
      return true;
    }
    const span = button.querySelector(`.${WATCHLIST_COUNT_CLASS}`);
    const shouldShow = count !== undefined && count > 0;

    if (!shouldShow) {
      if (span) {
        return true;
      }
      continue;
    }

    if (!span) {
      return true;
    }
    if (span.textContent !== String(count)) {
      return true;
    }
  }

  return false;
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

function renderReceiptsSummary(routeKey) {
  if (!isReceiptsPage()) {
    receiptsRouteKey = '';
    receiptsRenderAttempts = 0;
    removeReceiptsSummary();
    return;
  }

  if (receiptsRouteKey !== routeKey) {
    receiptsRouteKey = routeKey;
    receiptsRenderAttempts = 0;
  }

  const anchor = findReceiptsAnchor();
  if (!anchor) {
    if (receiptsRenderAttempts < MAX_RENDER_RETRIES) {
      receiptsRenderAttempts += 1;
      window.setTimeout(scheduleRender, RENDER_RETRY_MS);
    }
    return;
  }

  receiptsRenderAttempts = 0;

  let summary = document.getElementById(RECEIPTS_SUMMARY_ID);
  if (!summary) {
    summary = document.createElement('div');
    summary.id = RECEIPTS_SUMMARY_ID;
    summary.innerHTML = `
      <div class="flex flex-wrap justify-end gap-2">
        <div class="flex items-baseline gap-2 px-3 py-2 bg-white rounded-xl">
          <div class="text-label-md opacity-70">Spent</div>
          <div class="text-title-sm font-semibold text-neutral-800" data-role="spent">Loading…</div>
        </div>
        <div class="flex items-baseline gap-2 px-3 py-2 bg-white rounded-xl">
          <div class="text-label-md opacity-70">Returned</div>
          <div class="text-title-sm font-semibold text-neutral-800" data-role="returned">Loading…</div>
        </div>
        <div class="flex items-baseline gap-2 px-3 py-2 bg-white rounded-xl">
          <div class="text-label-md opacity-70">Total</div>
          <div class="text-title-sm font-semibold text-neutral-800" data-role="total">Loading…</div>
        </div>
      </div>
    `;
  }

  summary.dataset.routeKey = routeKey;

  if (summary.parentElement !== anchor) {
    anchor.appendChild(summary);
  }

  void refreshReceiptsSummary(routeKey);
}

function findReceiptsAnchor(root = document) {
  const headings = Array.from(root.querySelectorAll('h1, h2, h3, [role="heading"]'));
  const receiptsHeading = headings.find((node) =>
    node.textContent?.trim().toLowerCase().includes('receipts')
  );

  if (receiptsHeading) {
    const headerRow = receiptsHeading.closest('.flex.justify-between.items-center');
    if (headerRow instanceof HTMLElement) {
      return headerRow;
    }
    if (receiptsHeading.parentElement) {
      return receiptsHeading.parentElement;
    }
  }

  return root.querySelector('main') || null;
}

function removeReceiptsSummary() {
  const node = document.getElementById(RECEIPTS_SUMMARY_ID);
  if (node) {
    node.remove();
  }
}

async function refreshReceiptsSummary(routeKey) {
  const summary = document.getElementById(RECEIPTS_SUMMARY_ID);
  if (!(summary instanceof HTMLElement)) {
    return;
  }
  if (summary.dataset.routeKey !== routeKey) {
    return;
  }
  if (receiptsSummaryInFlight) {
    return;
  }

  receiptsSummaryInFlight = true;
  try {
    const receipts = await fetchAllReceipts();
    const spent = receipts.reduce((acc, record) => {
      const total = Number(record?.total);
      return acc + (Number.isFinite(total) && total > 0 ? total : 0);
    }, 0);

    // Some receipts APIs represent returns as negative totals. Treat any negative total as a return.
    const returned = receipts.reduce((acc, record) => {
      const total = Number(record?.total);
      if (!Number.isFinite(total)) {
        return acc;
      }
      if (total < 0) {
        return acc + total; // negative
      }
      const count = Number(record?.returnCount) || 0;
      if (count > 0) {
        return acc - Math.abs(total); // force return dollars to reduce net
      }
      return acc;
    }, 0);

    const net = spent + returned;

    const spentNode = summary.querySelector('[data-role="spent"]');
    const returnedNode = summary.querySelector('[data-role="returned"]');
    const totalNode = summary.querySelector('[data-role="total"]');
    if (spentNode) spentNode.textContent = formatCurrency(spent);
    if (returnedNode) {
      const returnedAbs = Math.abs(returned);
      returnedNode.textContent = returnedAbs === 0 ? formatCurrency(0) : `-${formatCurrency(returnedAbs)}`;
    }
    if (totalNode) totalNode.textContent = formatCurrency(net);
  } catch (error) {
    console.error('[NellisCompare] Failed to load receipts summary:', error);
    const spentNode = summary.querySelector('[data-role="spent"]');
    const returnedNode = summary.querySelector('[data-role="returned"]');
    const totalNode = summary.querySelector('[data-role="total"]');
    if (spentNode) spentNode.textContent = '—';
    if (returnedNode) returnedNode.textContent = '—';
    if (totalNode) totalNode.textContent = '—';
  } finally {
    receiptsSummaryInFlight = false;
  }
}

async function fetchAllReceipts() {
  const allRecords = [];
  let page = 0;
  let total = Infinity;

  while (allRecords.length < total) {
    const pageData = await fetchReceiptsPage({ page, size: RECEIPTS_PAGE_SIZE });
    const records = getReceiptsRecords(pageData);
    const nextTotal = Number(pageData?.total);
    total = Number.isFinite(nextTotal) && nextTotal >= 0 ? nextTotal : records.length;

    if (!records.length) {
      break;
    }

    allRecords.push(...records);
    page += 1;
  }

  return allRecords.slice(0, Number.isFinite(total) ? total : allRecords.length);
}

async function fetchReceiptsPage({ page, size }) {
  const endpointUrl = new URL('/dashboard/receipts', window.location.origin);
  endpointUrl.searchParams.set('_data', 'routes/dashboard.receipts._index');
  endpointUrl.searchParams.set('_p', `s:${size},n:${page}`);

  const response = await fetch(endpointUrl.toString(), {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: 'application/json, text/plain, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`Receipts request failed with status ${response.status}`);
  }

  const responseText = await response.text();
  const parsed = JSON.parse(responseText);
  return getReceiptsPageData(parsed);
}

function getReceiptsPageData(payload) {
  if (payload?.page && Array.isArray(payload.page.records)) {
    return payload.page;
  }
  if (payload?.data?.page && Array.isArray(payload.data.page.records)) {
    return payload.data.page;
  }
  if (Array.isArray(payload?.records)) {
    return payload;
  }
  if (Array.isArray(payload?.data?.records)) {
    return payload.data;
  }
  return { total: 0, records: [] };
}

function getReceiptsRecords(pageData) {
  return Array.isArray(pageData?.records) ? pageData.records : [];
}

function isCartRowBulkSaveForLaterEligible(row) {
  return Boolean(
    row.querySelector(
      'button[name="_action"][value="save-for-later"], [data-ax="pickups-remove-from-cart"]'
    )
  );
}

function isCartRowBulkAddToCheckoutEligible(row) {
  return Boolean(
    row.querySelector(
      'button[name="_action"][value="add-to-checkout"], [data-ax="pickups-add-to-cart"]'
    )
  );
}

function needsCartBulkUiRefresh() {
  if (!isNellisCartPage()) {
    return false;
  }

  const allRows = document.querySelectorAll('[data-ax="pickups-item-container"]');
  if (!allRows.length) {
    return false;
  }

  for (const row of allRows) {
    const save = isCartRowBulkSaveForLaterEligible(row);
    const checkout = isCartRowBulkAddToCheckoutEligible(row);
    if (save && row.querySelector('.nellis-cart-bulk-checkout-cb')) {
      return true;
    }
    if (checkout && row.querySelector('.nellis-cart-bulk-cb')) {
      return true;
    }
    if (!save && row.querySelector('.nellis-cart-bulk-cb')) {
      return true;
    }
    if (!checkout && row.querySelector('.nellis-cart-bulk-checkout-cb')) {
      return true;
    }
  }

  const saveEligible = Array.from(allRows).filter(isCartRowBulkSaveForLaterEligible);
  if (saveEligible.length) {
    if (!document.getElementById(CART_BULK_TOOLBAR_ID)) {
      return true;
    }
    if (saveEligible.some((row) => !row.querySelector('.nellis-cart-bulk-cb'))) {
      return true;
    }
  } else if (document.getElementById(CART_BULK_TOOLBAR_ID)) {
    return true;
  }

  const checkoutEligible = Array.from(allRows).filter(isCartRowBulkAddToCheckoutEligible);
  if (checkoutEligible.length) {
    if (!document.getElementById(CART_BULK_CHECKOUT_TOOLBAR_ID)) {
      return true;
    }
    if (checkoutEligible.some((row) => !row.querySelector('.nellis-cart-bulk-checkout-cb'))) {
      return true;
    }
  } else if (document.getElementById(CART_BULK_CHECKOUT_TOOLBAR_ID)) {
    return true;
  }

  return false;
}

function renderCartBulkUis(routeKey) {
  if (!isNellisCartPage()) {
    cartBulkRouteKey = '';
    cartBulkRenderAttempts = 0;
    teardownCartSortObserver();
    removeAllCartBulkUi();
    return;
  }

  if (cartBulkRouteKey !== routeKey) {
    cartBulkRouteKey = routeKey;
    cartBulkRenderAttempts = 0;
  }

  const allRows = document.querySelectorAll('[data-ax="pickups-item-container"]');
  if (!allRows.length) {
    if (cartBulkRenderAttempts < MAX_RENDER_RETRIES) {
      cartBulkRenderAttempts += 1;
      window.setTimeout(scheduleRender, RENDER_RETRY_MS);
    }
    return;
  }

  cartBulkRenderAttempts = 0;

  cleanupCartBulkRowDecorations(allRows);
  renderCartSortDropdown(allRows);
  ensureCartSortObserver(allRows);
  renderCartBulkSaveSection(allRows);
  renderCartBulkCheckoutSection(allRows);
}

function cleanupCartBulkRowDecorations(allRows) {
  for (const row of allRows) {
    const save = isCartRowBulkSaveForLaterEligible(row);
    const checkout = isCartRowBulkAddToCheckoutEligible(row);
    if (!save) {
      row.querySelector('.nellis-cart-bulk-cb')?.remove();
    }
    if (!checkout) {
      row.querySelector('.nellis-cart-bulk-checkout-cb')?.remove();
    }
    if (!save && !checkout) {
      row.classList.remove('nellis-cart-bulk-row');
    }
  }
}

function renderCartBulkSaveSection(allRows) {
  const eligibleRows = Array.from(allRows).filter(isCartRowBulkSaveForLaterEligible);
  if (!eligibleRows.length) {
    document.getElementById(CART_BULK_TOOLBAR_ID)?.remove();
    return;
  }

  for (const row of eligibleRows) {
    if (row.querySelector('.nellis-cart-bulk-cb')) {
      continue;
    }

    row.classList.add('nellis-cart-bulk-row');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'nellis-cart-bulk-cb';
    checkbox.setAttribute('aria-label', 'Select item for bulk save for later');
    checkbox.addEventListener('change', () => {
      syncCartBulkToolbar();
    });
    row.prepend(checkbox);
  }

  const anchor = findPickUpBulkToolbarAnchor(eligibleRows[0]);
  if (!anchor) {
    return;
  }

  let toolbar = document.getElementById(CART_BULK_TOOLBAR_ID);
  if (toolbar) {
    toolbar.querySelector('[data-role="hint"]')?.remove();
  }
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = CART_BULK_TOOLBAR_ID;
    toolbar.className = 'nellis-cart-bulk-toolbar';

    const selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.className = 'nellis-cart-bulk-toolbar__btn nellis-cart-bulk-toolbar__btn--ghost';
    selectAll.textContent = 'Select all';
    selectAll.addEventListener('click', () => {
      setAllCartBulkSaveCheckboxes(true);
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'nellis-cart-bulk-toolbar__btn nellis-cart-bulk-toolbar__btn--ghost';
    clearBtn.textContent = 'Clear selection';
    clearBtn.addEventListener('click', () => {
      setAllCartBulkSaveCheckboxes(false);
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'nellis-cart-bulk-toolbar__btn nellis-cart-bulk-toolbar__btn--primary';
    saveBtn.dataset.role = 'save';
    saveBtn.addEventListener('click', handleCartBulkSaveForLater);

    toolbar.append(selectAll, clearBtn, saveBtn);
  }

  if (toolbar.parentElement !== anchor || toolbar !== anchor.firstElementChild) {
    anchor.insertBefore(toolbar, anchor.firstChild);
  }

  syncCartBulkToolbar();
}

function renderCartBulkCheckoutSection(allRows) {
  const eligibleRows = Array.from(allRows).filter(isCartRowBulkAddToCheckoutEligible);
  if (!eligibleRows.length) {
    document.getElementById(CART_BULK_CHECKOUT_TOOLBAR_ID)?.remove();
    return;
  }

  for (const row of eligibleRows) {
    if (row.querySelector('.nellis-cart-bulk-checkout-cb')) {
      continue;
    }

    row.classList.add('nellis-cart-bulk-row');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'nellis-cart-bulk-checkout-cb';
    checkbox.setAttribute('aria-label', 'Select item for bulk add to checkout');
    checkbox.addEventListener('change', () => {
      syncCartBulkCheckoutToolbar();
    });
    row.prepend(checkbox);
  }

  const anchor = findPickUpBulkToolbarAnchor(eligibleRows[0]);
  if (!anchor) {
    return;
  }

  let toolbar = document.getElementById(CART_BULK_CHECKOUT_TOOLBAR_ID);
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = CART_BULK_CHECKOUT_TOOLBAR_ID;
    toolbar.className = 'nellis-cart-bulk-toolbar';

    const selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.className = 'nellis-cart-bulk-toolbar__btn nellis-cart-bulk-toolbar__btn--ghost';
    selectAll.textContent = 'Select all';
    selectAll.addEventListener('click', () => {
      setAllCartBulkCheckoutCheckboxes(true);
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'nellis-cart-bulk-toolbar__btn nellis-cart-bulk-toolbar__btn--ghost';
    clearBtn.textContent = 'Clear selection';
    clearBtn.addEventListener('click', () => {
      setAllCartBulkCheckoutCheckboxes(false);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'nellis-cart-bulk-toolbar__btn nellis-cart-bulk-toolbar__btn--primary';
    addBtn.dataset.role = 'add-checkout';
    addBtn.addEventListener('click', handleCartBulkAddToCheckout);

    toolbar.append(selectAll, clearBtn, addBtn);
  }

  if (toolbar.parentElement !== anchor || toolbar !== anchor.firstElementChild) {
    anchor.insertBefore(toolbar, anchor.firstChild);
  }

  syncCartBulkCheckoutToolbar();
}

function getStoredCartSortKey() {
  try {
    return localStorage.getItem(CART_SORT_STORAGE_KEY) || 'dateWon_desc';
  } catch {
    return 'dateWon_desc';
  }
}

function setStoredCartSortKey(value) {
  try {
    localStorage.setItem(CART_SORT_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

function teardownCartSortObserver() {
  if (cartSortObserver) {
    cartSortObserver.disconnect();
    cartSortObserver = null;
  }
  if (cartSortRaf) {
    window.cancelAnimationFrame(cartSortRaf);
    cartSortRaf = 0;
  }
  cartSortApplying = false;
}

function ensureCartSortObserver(allRows) {
  const firstRow = allRows?.[0];
  if (!(firstRow instanceof HTMLElement)) {
    return;
  }

  const listContainer = findPickUpBulkToolbarAnchor(firstRow) || firstRow.parentElement;
  if (!(listContainer instanceof HTMLElement)) {
    return;
  }

  if (cartSortObserver) {
    return;
  }

  cartSortObserver = new MutationObserver(() => {
    if (cartSortApplying || cartSortRaf) {
      return;
    }
    cartSortRaf = window.requestAnimationFrame(() => {
      cartSortRaf = 0;
      applyCartSortToDom(getStoredCartSortKey());
    });
  });

  cartSortObserver.observe(listContainer, { childList: true });
}

function getCartPickUpsItemsFromRemixPayload(payload) {
  const items = payload?.pickUps?.items || payload?.data?.pickUps?.items;
  return Array.isArray(items) ? items : null;
}

function parseCartDateMs(value) {
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
  if (typeof value === 'object' && typeof value.value === 'string') {
    const t = Date.parse(value.value);
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  }
  return Number.NEGATIVE_INFINITY;
}

function getCartRowKeyFromItem(item) {
  const buyNowId = item?.buyNowId ?? item?.buynowId ?? item?.buynowId;
  return buyNowId == null ? '' : String(buyNowId);
}

function getCartRowKeyFromRow(row) {
  const form = row.querySelector('form[action*="/dashboard/cart"]');
  if (form instanceof HTMLFormElement) {
    const buyNowId =
      form.querySelector('input[name="buynow-id"]')?.value ||
      form.querySelector('input[name="buyNowId"]')?.value ||
      form.querySelector('input[name="buynowId"]')?.value ||
      '';
    if (buyNowId) {
      return buyNowId;
    }
  }

  const cancelHref = row
    .querySelector('a[href^="/cancel-item/"]')
    ?.getAttribute('href');
  if (cancelHref) {
    const match = cancelHref.match(/\/cancel-item\/(\d+)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  const href = row.querySelector('a[href*="/p/"]')?.getAttribute('href') || '';
  if (href) {
    const parts = href.split('/').filter(Boolean);
    const maybeProjectId = parts[parts.length - 1];
    if (maybeProjectId && /^\d+$/.test(maybeProjectId)) {
      // Not perfect, but better than nothing if buynow-id is missing.
      return `project:${maybeProjectId}`;
    }
  }

  return '';
}

function buildCartItemDataIndex(items) {
  const map = new Map();
  for (const item of items) {
    const key = getCartRowKeyFromItem(item);
    if (key && !map.has(key)) {
      map.set(key, item);
    }
  }
  return map;
}

const CART_SORT_OPTIONS = [
  ['dateWon_desc', 'Date won (new → old)'],
  ['dateWon_asc', 'Date won (old → new)'],
  ['title_az', 'Title (A → Z)'],
  ['title_za', 'Title (Z → A)'],
  ['amount_desc', 'Bid amount (high → low)'],
  ['amount_asc', 'Bid amount (low → high)'],
];

function getCartSortLabelForKey(key) {
  const row = CART_SORT_OPTIONS.find(([v]) => v === key);
  return row ? row[1] : CART_SORT_OPTIONS[0][1];
}

function renderCartSortDropdown(allRows) {
  if (!allRows?.length) {
    return;
  }

  const anchor = findPickUpBulkToolbarAnchor(allRows[0]);
  if (!anchor) {
    return;
  }

  let wrap = document.getElementById(CART_SORT_DROPDOWN_ID);
  if (!(wrap instanceof HTMLElement)) {
    wrap = document.createElement('div');
    wrap.id = CART_SORT_DROPDOWN_ID;
    wrap.className = 'nellis-cart-sort relative block text-left min-w-72';

    const shell = document.createElement('div');
    shell.className = 'relative block text-left min-w-72';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'flex items-center justify-between w-full border border-solid border-gray-500 rounded-xl px-3 py-2 bg-white hover:border-gray-700 focus:outline-secondary shadow-md';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('data-ax', 'nellis-cart-sort-trigger');

    const textCol = document.createElement('div');
    textCol.className = 'flex flex-col text-left';

    const hint = document.createElement('p');
    hint.className = 'cursor-pointer text-label-sm';
    hint.textContent = 'Sort by';

    const valueEl = document.createElement('p');
    valueEl.className = 'font-semibold text-title-xs pr-2';
    valueEl.dataset.role = 'nellis-cart-sort-value';

    textCol.append(hint, valueEl);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', '0 0 320 512');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('class', 'fill-secondary shrink-0 transition-transform duration-200');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z'
    );
    svg.appendChild(path);

    btn.append(textCol, svg);

    const menu = document.createElement('ul');
    menu.setAttribute('role', 'listbox');
    menu.className =
      'absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-auto rounded-xl border border-solid border-gray-500 bg-white py-1 shadow-md hidden';
    menu.hidden = true;

    for (const [value, text] of CART_SORT_OPTIONS) {
      const li = document.createElement('li');
      li.setAttribute('role', 'none');
      const optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.setAttribute('role', 'option');
      optBtn.dataset.value = value;
      optBtn.className =
        'w-full px-3 py-2 text-left text-body-md hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none';
      optBtn.textContent = text;
      li.appendChild(optBtn);
      menu.appendChild(li);
    }

    let docCloser = null;
    const detachDocCloser = () => {
      if (docCloser) {
        document.removeEventListener('click', docCloser, true);
        docCloser = null;
      }
    };

    const closeMenu = () => {
      menu.classList.add('hidden');
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      svg.classList.remove('rotate-180');
      detachDocCloser();
    };

    const openMenu = () => {
      menu.classList.remove('hidden');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      svg.classList.add('rotate-180');
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!menu.hidden) {
        closeMenu();
        return;
      }
      openMenu();
      detachDocCloser();
      docCloser = (ev) => {
        if (!wrap.contains(ev.target)) {
          closeMenu();
        }
      };
      window.setTimeout(() => document.addEventListener('click', docCloser, true), 0);
    });

    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        btn.focus();
      }
    });

    for (const optBtn of menu.querySelectorAll('button[role="option"]')) {
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = optBtn.dataset.value || 'dateWon_desc';
        setStoredCartSortKey(v);
        applyCartSortToDom(v);
        valueEl.textContent = optBtn.textContent || getCartSortLabelForKey(v);
        closeMenu();
      });
    }

    shell.append(btn, menu);
    wrap.appendChild(shell);
  }

  const valueEl = wrap.querySelector('[data-role="nellis-cart-sort-value"]');
  if (valueEl) {
    valueEl.textContent = getCartSortLabelForKey(getStoredCartSortKey());
  }

  if (wrap.parentElement !== anchor || wrap !== anchor.firstElementChild) {
    anchor.insertBefore(wrap, anchor.firstChild);
  }
}

function applyCartSortToDom(sortKey) {
  if (!isCartPage()) {
    return;
  }

  const rows = Array.from(document.querySelectorAll('[data-ax="pickups-item-container"]')).filter(
    (n) => n instanceof HTMLElement
  );
  if (rows.length < 2) {
    return;
  }

  const listContainer = findPickUpBulkToolbarAnchor(rows[0]) || rows[0]?.parentElement;
  if (!(listContainer instanceof HTMLElement)) {
    return;
  }

  const index = buildCartItemDataIndex(lastCartPickupsItems || []);
  const getDataForRow = (row) => {
    const key = getCartRowKeyFromRow(row);
    if (key && index.has(key)) {
      return index.get(key);
    }
    return null;
  };

  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const comparator = (aRow, bRow) => {
    const a = getDataForRow(aRow) || {};
    const b = getDataForRow(bRow) || {};

    switch (sortKey) {
      case 'dateWon_asc':
        return parseCartDateMs(a.dateWon) - parseCartDateMs(b.dateWon);
      case 'amount_desc':
        return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      case 'amount_asc':
        return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      case 'title_az':
        return collator.compare(String(a.leadDescription || ''), String(b.leadDescription || ''));
      case 'title_za':
        return collator.compare(String(b.leadDescription || ''), String(a.leadDescription || ''));
      case 'dateWon_desc':
      default:
        return parseCartDateMs(b.dateWon) - parseCartDateMs(a.dateWon);
    }
  };

  const decorated = rows.map((row, idx) => ({ row, idx }));
  decorated.sort((a, b) => comparator(a.row, b.row) || a.idx - b.idx);

  const currentOrder = rows.map(getCartRowKeyFromRow);
  const nextOrder = decorated.map(({ row }) => getCartRowKeyFromRow(row));
  const alreadySorted =
    currentOrder.length === nextOrder.length &&
    currentOrder.every((key, idx) => key && key === nextOrder[idx]);
  if (alreadySorted) {
    return;
  }

  cartSortApplying = true;
  try {
    for (const { row } of decorated) {
      listContainer.appendChild(row);
    }
  } finally {
    cartSortApplying = false;
  }
}

function findPickUpBulkToolbarAnchor(eligibleRow) {
  if (!(eligibleRow instanceof Element)) {
    return null;
  }

  let node = eligibleRow.parentElement;
  while (node && node !== document.body) {
    if (
      node instanceof HTMLDivElement &&
      node.classList.contains('flex') &&
      node.classList.contains('flex-col') &&
      node.classList.contains('gap-2.5')
    ) {
      return node;
    }
    node = node.parentElement;
  }

  return null;
}

function removeAllCartBulkUi() {
  document.getElementById(CART_BULK_TOOLBAR_ID)?.remove();
  document.getElementById(CART_BULK_CHECKOUT_TOOLBAR_ID)?.remove();

  for (const checkbox of document.querySelectorAll('.nellis-cart-bulk-cb, .nellis-cart-bulk-checkout-cb')) {
    checkbox.remove();
  }

  for (const row of document.querySelectorAll('.nellis-cart-bulk-row')) {
    row.classList.remove('nellis-cart-bulk-row');
  }
}

function getEligibleCartBulkSaveRows() {
  return Array.from(document.querySelectorAll('[data-ax="pickups-item-container"]')).filter(
    isCartRowBulkSaveForLaterEligible
  );
}

function getEligibleCartBulkCheckoutRows() {
  return Array.from(document.querySelectorAll('[data-ax="pickups-item-container"]')).filter(
    isCartRowBulkAddToCheckoutEligible
  );
}

function setAllCartBulkSaveCheckboxes(checked) {
  for (const row of getEligibleCartBulkSaveRows()) {
    const checkbox = row.querySelector('.nellis-cart-bulk-cb');
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = checked;
    }
  }
  syncCartBulkToolbar();
}

function setAllCartBulkCheckoutCheckboxes(checked) {
  for (const row of getEligibleCartBulkCheckoutRows()) {
    const checkbox = row.querySelector('.nellis-cart-bulk-checkout-cb');
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = checked;
    }
  }
  syncCartBulkCheckoutToolbar();
}

function syncCartBulkToolbar() {
  const toolbar = document.getElementById(CART_BULK_TOOLBAR_ID);
  if (!toolbar) {
    return;
  }

  const saveBtn = toolbar.querySelector('[data-role="save"]');
  if (!(saveBtn instanceof HTMLButtonElement)) {
    return;
  }

  const selectedCount = getEligibleCartBulkSaveRows().filter((row) => {
    const checkbox = row.querySelector('.nellis-cart-bulk-cb');
    return checkbox instanceof HTMLInputElement && checkbox.checked;
  }).length;

  saveBtn.disabled = selectedCount === 0 || cartBulkSaveInFlight;
  saveBtn.textContent =
    selectedCount === 0
      ? 'Save selected for later'
      : `Save selected for later (${selectedCount})`;
}

function syncCartBulkCheckoutToolbar() {
  const toolbar = document.getElementById(CART_BULK_CHECKOUT_TOOLBAR_ID);
  if (!toolbar) {
    return;
  }

  const addBtn = toolbar.querySelector('[data-role="add-checkout"]');
  if (!(addBtn instanceof HTMLButtonElement)) {
    return;
  }

  const selectedCount = getEligibleCartBulkCheckoutRows().filter((row) => {
    const checkbox = row.querySelector('.nellis-cart-bulk-checkout-cb');
    return checkbox instanceof HTMLInputElement && checkbox.checked;
  }).length;

  addBtn.disabled = selectedCount === 0 || cartBulkCheckoutInFlight;
  addBtn.textContent =
    selectedCount === 0
      ? 'Add selected to checkout'
      : `Add selected to checkout (${selectedCount})`;
}

function buildCartFormPostBody(form, actionValue) {
  const data = new URLSearchParams();

  for (const element of form.elements) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
    ) {
      continue;
    }

    if (element.disabled || !element.name) {
      continue;
    }

    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
      if (element.checked) {
        data.append(element.name, element.value);
      }
      continue;
    }

    if (element instanceof HTMLInputElement && element.type === 'file') {
      continue;
    }

    data.append(element.name, element.value);
  }

  data.set('_action', actionValue);
  return data;
}

async function postCartPickupsFormForRow(row, actionValue, errorLabel) {
  const form = row.querySelector('form[action*="/dashboard/cart"]');
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Cart form not found for a selected row.');
  }

  const action = form.getAttribute('action');
  if (!action) {
    throw new Error('Cart form is missing an action URL.');
  }

  const actionUrl = new URL(action, window.location.origin).toString();
  const body = buildCartFormPostBody(form, actionValue);

  const response = await fetch(actionUrl, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: body.toString(),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`${errorLabel} failed with status ${response.status}.`);
  }
}

async function handleCartBulkSaveForLater() {
  if (cartBulkSaveInFlight) {
    return;
  }

  const selectedRows = getEligibleCartBulkSaveRows().filter((row) => {
    const checkbox = row.querySelector('.nellis-cart-bulk-cb');
    return checkbox instanceof HTMLInputElement && checkbox.checked;
  });

  if (!selectedRows.length) {
    return;
  }

  cartBulkSaveInFlight = true;
  syncCartBulkToolbar();

  const saveBtn = document.querySelector(`#${CART_BULK_TOOLBAR_ID} [data-role="save"]`);
  if (saveBtn instanceof HTMLButtonElement) {
    saveBtn.textContent = `Saving… (0/${selectedRows.length})`;
  }

  try {
    let index = 0;
    for (const row of selectedRows) {
      await postCartPickupsFormForRow(row, 'save-for-later', 'Save for later');
      index += 1;
      if (saveBtn instanceof HTMLButtonElement) {
        saveBtn.textContent = `Saving… (${index}/${selectedRows.length})`;
      }
    }
    window.location.reload();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Save for later failed.';
    window.alert(message);
  } finally {
    cartBulkSaveInFlight = false;
    syncCartBulkToolbar();
  }
}

async function handleCartBulkAddToCheckout() {
  if (cartBulkCheckoutInFlight) {
    return;
  }

  const selectedRows = getEligibleCartBulkCheckoutRows().filter((row) => {
    const checkbox = row.querySelector('.nellis-cart-bulk-checkout-cb');
    return checkbox instanceof HTMLInputElement && checkbox.checked;
  });

  if (!selectedRows.length) {
    return;
  }

  cartBulkCheckoutInFlight = true;
  syncCartBulkCheckoutToolbar();

  const addBtn = document.querySelector(`#${CART_BULK_CHECKOUT_TOOLBAR_ID} [data-role="add-checkout"]`);
  if (addBtn instanceof HTMLButtonElement) {
    addBtn.textContent = `Adding… (0/${selectedRows.length})`;
  }

  try {
    let index = 0;
    for (const row of selectedRows) {
      await postCartPickupsFormForRow(row, 'add-to-checkout', 'Add to checkout');
      index += 1;
      if (addBtn instanceof HTMLButtonElement) {
        addBtn.textContent = `Adding… (${index}/${selectedRows.length})`;
      }
    }
    window.location.reload();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Add to checkout failed.';
    window.alert(message);
  } finally {
    cartBulkCheckoutInFlight = false;
    syncCartBulkCheckoutToolbar();
  }
}

function needsDarkModeToggleRender() {
  return isNellisAuctionSite() && !document.getElementById(DARK_MODE_TOGGLE_ID);
}

function syncCriticalDarkModePaint() {
  const isDark = document.documentElement.classList.contains(DARK_MODE_HTML_CLASS);
  const existing = document.getElementById(DARK_MODE_CRITICAL_STYLE_ID);

  if (!isDark) {
    existing?.remove();
    return;
  }

  const css = `html.${DARK_MODE_HTML_CLASS},html.${DARK_MODE_HTML_CLASS} body{background-color:#1f1f1f!important;color-scheme:dark}`;
  if (existing) {
    existing.textContent = css;
    return;
  }

  const style = document.createElement('style');
  style.id = DARK_MODE_CRITICAL_STYLE_ID;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

function applyStoredDarkMode() {
  try {
    if (localStorage.getItem(DARK_MODE_STORAGE_KEY) === '1') {
      document.documentElement.classList.add(DARK_MODE_HTML_CLASS);
    } else {
      document.documentElement.classList.remove(DARK_MODE_HTML_CLASS);
    }
  } catch {
    document.documentElement.classList.remove(DARK_MODE_HTML_CLASS);
  }
  syncCriticalDarkModePaint();
}

function syncDarkModeToggleButtons() {
  const btn = document.getElementById(DARK_MODE_TOGGLE_ID);
  if (!(btn instanceof HTMLButtonElement)) {
    return;
  }

  const isDark = document.documentElement.classList.contains(DARK_MODE_HTML_CLASS);
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  btn.setAttribute('aria-pressed', String(isDark));
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = isDark ? DARK_MODE_ICON_SUN : DARK_MODE_ICON_MOON;
}

function handleDarkModeToggle() {
  const next = !document.documentElement.classList.contains(DARK_MODE_HTML_CLASS);

  if (next) {
    document.documentElement.classList.add(DARK_MODE_HTML_CLASS);
    try {
      localStorage.setItem(DARK_MODE_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  } else {
    document.documentElement.classList.remove(DARK_MODE_HTML_CLASS);
    try {
      localStorage.setItem(DARK_MODE_STORAGE_KEY, '0');
    } catch {
      /* ignore */
    }
  }

  syncDarkModeToggleButtons();
  syncCriticalDarkModePaint();
  refreshComparisonCardStyling();
}

function refreshComparisonCardStyling() {
  const card = document.getElementById(CARD_ID);
  if (!card || !isNellisItemPage()) {
    return;
  }

  const itemDetailsAnchor = findItemDetailsAnchor();
  if (!itemDetailsAnchor) {
    return;
  }

  applyNativeCardStyling(card, itemDetailsAnchor);
}

function renderDarkModeToggleButtons() {
  for (const el of document.querySelectorAll(`.${DARK_MODE_TOGGLE_CLASS}`)) {
    if (el.id !== DARK_MODE_TOGGLE_ID) {
      el.remove();
    }
  }

  if (!isNellisAuctionSite()) {
    const existing = document.getElementById(DARK_MODE_TOGGLE_ID);
    if (existing) {
      existing.remove();
    }
    return;
  }

  let button = document.getElementById(DARK_MODE_TOGGLE_ID);
  if (!button) {
    button = document.createElement('button');
    button.id = DARK_MODE_TOGGLE_ID;
    button.type = 'button';
    button.className = DARK_MODE_TOGGLE_CLASS;
    button.addEventListener('click', handleDarkModeToggle);
    document.body.appendChild(button);
  }

  syncDarkModeToggleButtons();
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

