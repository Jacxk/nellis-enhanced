import {
  extractNellisItem,
  findNellisPriceTargets,
  findNellisTimeTargets,
  findItemDetailsAnchor,
  hasNellisPriceCards,
  isNellisAuctionSite,
  isNellisItemPage,
  isNellisOnlyItemTitle,
  parseCurrencyAmount,
} from '../shared/nellisPage.js';
import { sendRuntimeMessage } from '../shared/extensionApi.js';
import { getAmazonItemFromHtml } from '../shared/amazonSource.js';
import { parseAmazonProductPage } from '../shared/productMatcher.js';

const CARD_ID = 'nellis-amazon-compare-card';
const STYLE_ID = 'nellis-amazon-compare-style';
const PREMIUM_HINT_CLASS = 'nellis-premium-hint';
const TIME_HINT_CLASS = 'nellis-time-hint';
const PURCHASES_EXPORT_ID = 'nellis-purchases-export';
const DARK_MODE_TOGGLE_CLASS = 'nellis-dark-mode-toggle';
const DARK_MODE_TOGGLE_ID = 'nellis-dark-mode-toggle';
const DARK_MODE_HTML_CLASS = 'nellis-dark-mode';
const DARK_MODE_STORAGE_KEY = 'nellisAuctionDarkMode';
const DARK_MODE_ICON_MOON =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" width="17" height="17" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>';
const DARK_MODE_ICON_SUN =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" width="17" height="17" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>';
const RENDER_DEBOUNCE_MS = 250;
const MAX_RENDER_RETRIES = 20;
const RENDER_RETRY_MS = 400;
const PURCHASES_PAGE_SIZE = 30;
const ROUTE_WATCH_INTERVAL_MS = 500;
const BUYER_PREMIUM_RATE = 0.15;

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
const closeTimeCache = new Map();

init();

function init() {
  injectStyles();
  applyStoredDarkMode();
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
    if (
      (isPurchasesPage() && !document.getElementById(PURCHASES_EXPORT_ID)) ||
      (isNellisItemPage() && !document.getElementById(CARD_ID)) ||
      (isNellisAuctionSite() && needsDarkModeToggleRender()) ||
      hasTooltipRefreshTargets()
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

    if (isNellisItemPage() && !document.getElementById(CARD_ID)) {
      scheduleRender();
      return;
    }

    if (isNellisAuctionSite() && needsDarkModeToggleRender()) {
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
  renderDarkModeToggleButtons();
  attachPricePremiumHint();
  attachTimeEndHint();

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

function attachTimeEndHint() {
  const targets = findNellisTimeTargets();
  const activeTargets = new Set();

  for (const target of targets) {
    activeTargets.add(target.container);
    target.container.classList.add(TIME_HINT_CLASS);
    if (!target.container.hasAttribute('data-time-tooltip')) {
      target.container.setAttribute('data-time-tooltip', 'Loading...');
    }

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

  if (closeTimeCache.has(itemUrl)) {
    container.setAttribute('data-time-tooltip', closeTimeCache.get(itemUrl) || '');
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
    closeTimeCache.set(itemUrl, tooltipText);
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

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(closeTime);
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

function needsDarkModeToggleRender() {
  return isNellisAuctionSite() && !document.getElementById(DARK_MODE_TOGGLE_ID);
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

    .${PREMIUM_HINT_CLASS} {
      position: relative;
      cursor: default;
      overflow: visible;
    }

    .${PREMIUM_HINT_CLASS}::after {
      content: attr(data-premium-tooltip);
      position: absolute;
      left: 50%;
      bottom: calc(100% + 8px);
      transform: translateX(-50%);
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(17, 24, 39, 0.94);
      color: #fff;
      font-size: 12px;
      line-height: 1.2;
      font-weight: 600;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
      z-index: 9999;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.22);
    }

    .${PREMIUM_HINT_CLASS}::before {
      content: '';
      position: absolute;
      left: 50%;
      bottom: calc(100% + 2px);
      transform: translateX(-50%);
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid rgba(17, 24, 39, 0.94);
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
      z-index: 9999;
    }

    .${PREMIUM_HINT_CLASS}:hover::after,
    .${PREMIUM_HINT_CLASS}:hover::before {
      opacity: 1;
    }

    .${TIME_HINT_CLASS} {
      position: relative;
      cursor: default;
      overflow: visible;
    }

    .${TIME_HINT_CLASS}::after {
      content: attr(data-time-tooltip);
      position: absolute;
      left: 50%;
      bottom: calc(100% + 8px);
      transform: translateX(-50%);
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(17, 24, 39, 0.94);
      color: #fff;
      font-size: 12px;
      line-height: 1.2;
      font-weight: 600;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
      z-index: 9999;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.22);
    }

    .${TIME_HINT_CLASS}::before {
      content: '';
      position: absolute;
      left: 50%;
      bottom: calc(100% + 2px);
      transform: translateX(-50%);
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid rgba(17, 24, 39, 0.94);
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
      z-index: 9999;
    }

    .${TIME_HINT_CLASS}:hover::after,
    .${TIME_HINT_CLASS}:hover::before,
    .${TIME_HINT_CLASS}:focus-within::after,
    .${TIME_HINT_CLASS}:focus-within::before {
      opacity: 1;
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

    #${DARK_MODE_TOGGLE_ID} {
      box-sizing: border-box;
      position: fixed;
      left: 16px;
      bottom: 16px;
      right: auto;
      z-index: 2147483000;
      width: 40px;
      height: 40px;
      margin: 0;
      padding: 0;
      display: grid;
      place-items: center;
      border: 1px solid rgba(15, 23, 42, 0.14);
      border-radius: 9999px;
      background: #ffffff;
      color: #334155;
      cursor: pointer;
      opacity: 1;
      box-shadow: 0 4px 18px rgba(15, 23, 42, 0.14);
      transition: background 140ms ease, color 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
    }

    #${DARK_MODE_TOGGLE_ID} svg {
      display: block;
      flex-shrink: 0;
      stroke: currentColor;
    }

    #${DARK_MODE_TOGGLE_ID}:hover {
      background: #f8fafc;
      color: #0f172a;
      border-color: rgba(15, 23, 42, 0.2);
      box-shadow: 0 6px 20px rgba(15, 23, 42, 0.18);
    }

    #${DARK_MODE_TOGGLE_ID}:focus-visible {
      outline: 2px solid rgba(100, 116, 139, 0.55);
      outline-offset: 2px;
    }

    html.${DARK_MODE_HTML_CLASS} #${DARK_MODE_TOGGLE_ID} {
      background: #262626;
      color: #e2e8f0;
      border-color: rgba(148, 163, 184, 0.35);
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
    }

    html.${DARK_MODE_HTML_CLASS} #${DARK_MODE_TOGGLE_ID}:hover {
      background: #333333;
      color: #f8fafc;
      border-color: rgba(203, 213, 225, 0.45);
    }

    html.${DARK_MODE_HTML_CLASS} #${DARK_MODE_TOGGLE_ID}:focus-visible {
      outline-color: rgba(148, 163, 184, 0.65);
    }

    html.${DARK_MODE_HTML_CLASS} {
      color-scheme: dark;
    }

    html.${DARK_MODE_HTML_CLASS} body {
      background-color: #0a0a0a !important;
      color: #e5e5e5 !important;
    }

    /*
     * Neutral surfaces: use [class~="…"] for exact tokens only. Substring [class*="bg-neutral-100"]
     * falsely matches hover:bg-neutral-100 (sidebar links looked always “selected”).
     */
    html.${DARK_MODE_HTML_CLASS} .bg-neutral-50,
    html.${DARK_MODE_HTML_CLASS} .bg-neutral-100,
    html.${DARK_MODE_HTML_CLASS} .bg-neutral-200,
    html.${DARK_MODE_HTML_CLASS} [class~="bg-neutral-50"],
    html.${DARK_MODE_HTML_CLASS} [class~="bg-neutral-100"],
    html.${DARK_MODE_HTML_CLASS} [class~="bg-neutral-200"],
    html.${DARK_MODE_HTML_CLASS} [class~="xxs:bg-neutral-50"],
    html.${DARK_MODE_HTML_CLASS} [class~="xxs:bg-neutral-100"],
    html.${DARK_MODE_HTML_CLASS} [class~="xxs:bg-neutral-200"],
    html.${DARK_MODE_HTML_CLASS} [class~="xs:bg-neutral-50"],
    html.${DARK_MODE_HTML_CLASS} [class~="xs:bg-neutral-100"],
    html.${DARK_MODE_HTML_CLASS} [class~="xs:bg-neutral-200"],
    html.${DARK_MODE_HTML_CLASS} [class~="sm:bg-neutral-50"],
    html.${DARK_MODE_HTML_CLASS} [class~="sm:bg-neutral-100"],
    html.${DARK_MODE_HTML_CLASS} [class~="sm:bg-neutral-200"],
    html.${DARK_MODE_HTML_CLASS} [class~="md:bg-neutral-50"],
    html.${DARK_MODE_HTML_CLASS} [class~="md:bg-neutral-100"],
    html.${DARK_MODE_HTML_CLASS} [class~="md:bg-neutral-200"],
    html.${DARK_MODE_HTML_CLASS} [class~="lg:bg-neutral-50"],
    html.${DARK_MODE_HTML_CLASS} [class~="lg:bg-neutral-100"],
    html.${DARK_MODE_HTML_CLASS} [class~="lg:bg-neutral-200"],
    html.${DARK_MODE_HTML_CLASS} [class~="xl:bg-neutral-50"],
    html.${DARK_MODE_HTML_CLASS} [class~="xl:bg-neutral-100"],
    html.${DARK_MODE_HTML_CLASS} [class~="xl:bg-neutral-200"],
    html.${DARK_MODE_HTML_CLASS} [class~="xxl:bg-neutral-50"],
    html.${DARK_MODE_HTML_CLASS} [class~="xxl:bg-neutral-100"],
    html.${DARK_MODE_HTML_CLASS} [class~="xxl:bg-neutral-200"],
    html.${DARK_MODE_HTML_CLASS} [class~="2xl:bg-neutral-50"],
    html.${DARK_MODE_HTML_CLASS} [class~="2xl:bg-neutral-100"],
    html.${DARK_MODE_HTML_CLASS} [class~="2xl:bg-neutral-200"],
    html.${DARK_MODE_HTML_CLASS} [class~="3xl:bg-neutral-50"],
    html.${DARK_MODE_HTML_CLASS} [class~="3xl:bg-neutral-100"],
    html.${DARK_MODE_HTML_CLASS} [class~="3xl:bg-neutral-200"] {
      background-color: #262626 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-neutral-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-neutral-900"] {
      background-color: #171717 !important;
    }

    html.${DARK_MODE_HTML_CLASS} .bg-white,
    html.${DARK_MODE_HTML_CLASS} [class*="bg-white"]:not([class*="before:bg-white"]) {
      background-color: #141414 !important;
    }

    /* Search / listing “Filters” sticky bar: no solid strip (bg-white + lg:bg-neutral-100) */
    html.${DARK_MODE_HTML_CLASS} [class*="sticky"][class*="top-0"][class*="bg-white"][class*="lg:bg-neutral-100"][class*="z-50"][class*="my-2.5"] {
      background-color: transparent !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-burgundy-50"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-burgundy-100"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-sincity-red-100"] {
      background-color: #2a2a2a !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class~="bg-secondary"] {
      background-color: #262626 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="hover:bg-secondary-light"]:hover {
      background-color: #333333 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-transition-background"] {
      background-color: #0a0a0a !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="before:bg-white"]::before {
      background-color: #141414 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="hover:bg-neutral-100"]:hover,
    html.${DARK_MODE_HTML_CLASS} [class*="hover:bg-neutral-300"]:hover,
    html.${DARK_MODE_HTML_CLASS} [class*="hover:bg-burgundy-100"]:hover,
    html.${DARK_MODE_HTML_CLASS} [class*="focus-visible:bg-burgundy-100"]:focus-visible {
      background-color: #333333 !important;
    }

    /* Dashboard sidebar: match parent strip; only aria-current row is highlighted */
    html.${DARK_MODE_HTML_CLASS} [class~="flex-col"][class~="gap-3"][class~="bg-white"] > a[href] {
      background-color: transparent !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class~="flex-col"][class~="gap-3"][class~="bg-white"] > a[href][aria-current] {
      background-color: #262626 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class~="flex-col"][class~="gap-3"][class~="bg-white"] > a[href]:not([aria-current]):hover {
      background-color: #2a2a2a !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class~="flex-col"][class~="gap-3"][class~="bg-white"] > a[href][aria-current]:hover {
      background-color: #333333 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="hover:bg-[#"]:hover,
    html.${DARK_MODE_HTML_CLASS} [class*="focus:bg-[#"]:focus {
      background-color: rgba(255, 255, 255, 0.07) !important;
    }

    html.${DARK_MODE_HTML_CLASS} .text-gray-900,
    html.${DARK_MODE_HTML_CLASS} .text-gray-800,
    html.${DARK_MODE_HTML_CLASS} [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="text-gray-800"] {
      color: #fafafa !important;
    }

    html.${DARK_MODE_HTML_CLASS} .text-gray-700,
    html.${DARK_MODE_HTML_CLASS} .text-gray-600,
    html.${DARK_MODE_HTML_CLASS} [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} [class*="text-gray-600"] {
      color: #d4d4d4 !important;
    }

    html.${DARK_MODE_HTML_CLASS} .text-gray-500,
    html.${DARK_MODE_HTML_CLASS} [class*="text-gray-500"] {
      color: #a3a3a3 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="text-neutral-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="text-neutral-900"] {
      color: #e5e5e5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="text-burgundy-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="text-secondary"] {
      color: #d4d4d4 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="placeholder:text-gray-700"]::placeholder {
      color: #737373 !important;
    }

    html.${DARK_MODE_HTML_CLASS} .fill-gray-900,
    html.${DARK_MODE_HTML_CLASS} .fill-gray-800,
    html.${DARK_MODE_HTML_CLASS} [class*="fill-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="fill-gray-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="fill-neutral-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="fill-neutral-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="fill-burgundy-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="fill-secondary"],
    html.${DARK_MODE_HTML_CLASS} [class*="fill-black"] {
      fill: #d4d4d4 !important;
    }

    /*
     * Search filter column: many header SVGs have no fill class (default black → invisible on dark cards).
     */
    html.${DARK_MODE_HTML_CLASS} [data-ax^="search-refine"] svg:not([class*="fill-"]) path,
    html.${DARK_MODE_HTML_CLASS} [data-ax^="search-refine"] form svg path,
    html.${DARK_MODE_HTML_CLASS} [class*="rounded-itemCard"][class*="shadow-md"] details svg:not([class*="fill-"]) path {
      fill: #e5e5e5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [data-ax^="search-refine"] [class*="fill-secondary"] {
      fill: #f0f0f0 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [data-ax^="search-refine"] [class*="fill-starRating"] {
      fill: #fbbf24 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [data-ax^="search-refine"] [class*="fill-gray-900"] {
      fill: #94a3b8 !important;
    }

    /* Icons that only set fill when .group is hovered/focused need a visible default on dark surfaces */
    html.${DARK_MODE_HTML_CLASS} svg[class*="group-hover:fill-white"],
    html.${DARK_MODE_HTML_CLASS} svg[class*="group-focus-within:fill-white"] {
      fill: #e5e5e5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} .group:hover svg[class*="group-hover:fill-white"],
    html.${DARK_MODE_HTML_CLASS} .group:focus-within svg[class*="group-hover:fill-white"] {
      fill: #ffffff !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="rounded-full"][class*="bg-white"]:hover svg[class*="group-hover:fill-white"],
    html.${DARK_MODE_HTML_CLASS} [class*="rounded-full"][class*="group-hover:bg-secondary"]:hover svg[class*="group-hover:fill-white"],
    html.${DARK_MODE_HTML_CLASS} [class*="rounded-full"][class*="group-focus-within:bg-secondary"]:focus-within svg[class*="group-hover:fill-white"] {
      fill: #ffffff !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="fill-sincity-red-600"] {
      fill: #a3a3a3 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="fill-sincity-red-800"] {
      fill: #fb7185 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="text-burgundy-800"] {
      color: #fecdd3 !important;
    }

    html.${DARK_MODE_HTML_CLASS} .stroke-burgundy-900,
    html.${DARK_MODE_HTML_CLASS} [class*="stroke-burgundy-900"] {
      stroke: #a3a3a3 !important;
    }

    html.${DARK_MODE_HTML_CLASS} .outline-burgundy-900,
    html.${DARK_MODE_HTML_CLASS} .border-burgundy-900,
    html.${DARK_MODE_HTML_CLASS} .border-burgundy-800,
    html.${DARK_MODE_HTML_CLASS} [class*="outline-burgundy-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="border-burgundy-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="border-burgundy-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="outline-neutral-400"],
    html.${DARK_MODE_HTML_CLASS} [class*="border-neutral-300"],
    html.${DARK_MODE_HTML_CLASS} [class*="border-neutral-400"],
    html.${DARK_MODE_HTML_CLASS} [class*="border-gray-500"],
    html.${DARK_MODE_HTML_CLASS} [class*="border-secondary"],
    html.${DARK_MODE_HTML_CLASS} [class*="outline-secondary"] {
      outline-color: #525252 !important;
      border-color: #525252 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="shadow-header"],
    html.${DARK_MODE_HTML_CLASS} [class*="shadow-md"],
    html.${DARK_MODE_HTML_CLASS} [class*="shadow-sm"] {
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45) !important;
    }

    html.${DARK_MODE_HTML_CLASS} .divide-gray-200 > :not([hidden]) ~ :not([hidden]),
    html.${DARK_MODE_HTML_CLASS} [class*="divide-gray-"] > :not([hidden]) ~ :not([hidden]),
    html.${DARK_MODE_HTML_CLASS} [class*="divide-neutral"] > :not([hidden]) ~ :not([hidden]) {
      border-color: rgba(64, 64, 64, 0.75) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="ring-offset-white"] {
      --tw-ring-offset-color: #0a0a0a !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="disabled:bg-gray-700"]:disabled {
      background-color: #404040 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="disabled:border-gray-400"]:disabled {
      border-color: #525252 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-zinc-50"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-zinc-100"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-zinc-200"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-slate-50"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-slate-100"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-slate-200"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-stone-50"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-stone-100"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-gray-50"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-gray-100"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-gray-200"] {
      background-color: #262626 !important;
    }

    /* Unread / alert notification strip (bg-sincity-red-50) */
    html.${DARK_MODE_HTML_CLASS} [class*="bg-sincity-red-50"] {
      background-color: #3d2326 !important;
      color: #f5f0f0 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-sincity-red-50"] p,
    html.${DARK_MODE_HTML_CLASS} [class*="bg-sincity-red-50"] [class*="text-body-"] {
      color: #ece7e7 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-sincity-red-50"] [class*="opacity-60"] {
      color: #c9bdbd !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-sincity-red-50"] button svg path {
      fill: #e5e5e5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-sincity-red-50"] [class*="ring-gray-400"] {
      --tw-ring-color: rgba(212, 212, 212, 0.55) !important;
      color: #f5f5f5 !important;
    }

    /* Header / nav: icons without a Tailwind fill-* class (e.g. notification bell) */
    html.${DARK_MODE_HTML_CLASS} header svg:not([class*="fill-"]) path,
    html.${DARK_MODE_HTML_CLASS} nav svg:not([class*="fill-"]) path {
      fill: #e5e5e5 !important;
    }

    /* Won / success (emerald) and highlight (orange) */
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-50"] {
      background-color: #022c22 !important;
      color: #ecfdf5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-100"] {
      background-color: #064e3b !important;
      color: #d1fae5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-200"] {
      background-color: #065f46 !important;
      color: #ecfdf5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-50"] [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-50"] [class*="text-gray-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-50"] [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-50"] [class*="text-gray-600"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-100"] [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-100"] [class*="text-gray-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-100"] [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-100"] [class*="text-gray-600"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-200"] [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-200"] [class*="text-gray-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-200"] [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-200"] [class*="text-gray-600"] {
      color: #ecfdf5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-orange-100"] {
      background-color: #7c2d12 !important;
      color: #ffedd5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-orange-100"] [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-orange-100"] [class*="text-gray-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-orange-100"] [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-orange-100"] [class*="text-gray-600"] {
      color: #fed7aa !important;
    }

    /* Lighter orange surfaces (e.g. thank-you strip) — use class~ to avoid matching bg-orange-500 */
    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-50"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-orange-50/"],
    html.${DARK_MODE_HTML_CLASS} [class*="sm:bg-orange-50"],
    html.${DARK_MODE_HTML_CLASS} [class*="md:bg-orange-50"],
    html.${DARK_MODE_HTML_CLASS} [class*="lg:bg-orange-50"] {
      background-color: #5c280d !important;
      color: #ffedd5 !important;
      border-color: rgba(253, 186, 116, 0.5) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-50"] .font-bold,
    html.${DARK_MODE_HTML_CLASS} [class*="bg-orange-50/"] .font-bold,
    html.${DARK_MODE_HTML_CLASS} [class*="sm:bg-orange-50"] .font-bold,
    html.${DARK_MODE_HTML_CLASS} [class*="md:bg-orange-50"] .font-bold,
    html.${DARK_MODE_HTML_CLASS} [class*="lg:bg-orange-50"] .font-bold,
    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-50"] p,
    html.${DARK_MODE_HTML_CLASS} [class*="bg-orange-50/"] p,
    html.${DARK_MODE_HTML_CLASS} [class*="sm:bg-orange-50"] p,
    html.${DARK_MODE_HTML_CLASS} [class*="md:bg-orange-50"] p,
    html.${DARK_MODE_HTML_CLASS} [class*="lg:bg-orange-50"] p,
    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-50"] div,
    html.${DARK_MODE_HTML_CLASS} [class*="bg-orange-50/"] div,
    html.${DARK_MODE_HTML_CLASS} [class*="sm:bg-orange-50"] div,
    html.${DARK_MODE_HTML_CLASS} [class*="md:bg-orange-50"] div,
    html.${DARK_MODE_HTML_CLASS} [class*="lg:bg-orange-50"] div {
      color: #fff7ed !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-50"] a,
    html.${DARK_MODE_HTML_CLASS} [class*="bg-orange-50/"] a,
    html.${DARK_MODE_HTML_CLASS} [class*="sm:bg-orange-50"] a,
    html.${DARK_MODE_HTML_CLASS} [class*="md:bg-orange-50"] a,
    html.${DARK_MODE_HTML_CLASS} [class*="lg:bg-orange-50"] a {
      color: #fdba74 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [data-ax="item-card-container"][class*="ring-emerald"],
    html.${DARK_MODE_HTML_CLASS} [data-ax="item-card-container"][class*="outline-emerald"],
    html.${DARK_MODE_HTML_CLASS} [class*="ring-emerald-"],
    html.${DARK_MODE_HTML_CLASS} [class*="outline-emerald"] {
      --tw-ring-color: rgba(5, 150, 105, 0.65) !important;
      outline-color: #047857 !important;
      border-color: #047857 !important;
    }

    /* Dashboard appointments card (CSS-module classes; not always Tailwind bg-*) */
    html.${DARK_MODE_HTML_CLASS} [data-ax="appointments-card"],
    html.${DARK_MODE_HTML_CLASS} [class*="__my-appointments-card-container"] {
      background-color: #1a1a1a !important;
      color: #e5e5e5 !important;
      border-color: #404040 !important;
      border-radius: 14px !important;
      overflow: hidden !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [data-ax="appointments-card"] > div {
      background-color: #1a1a1a !important;
      color: #e5e5e5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [data-ax="appointments-card"] [class*="__my-appointments-card-content"],
    html.${DARK_MODE_HTML_CLASS} [data-ax="appointments-card"] [class*="__my-appointments-line-item-container"],
    html.${DARK_MODE_HTML_CLASS} [data-ax="appointments-card"] [class*="__my-appointment-card-footer"] {
      background-color: #1a1a1a !important;
    }

    html.${DARK_MODE_HTML_CLASS} [data-ax="appointments-card"] [class*="__my-appointment-card-title"],
    html.${DARK_MODE_HTML_CLASS} [data-ax="appointments-card"] [class*="__my-appointments-line-item-text"] {
      color: #f5f5f5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [data-ax="appointments-card"] [class*="__my-appointments-line-item-caption"] {
      color: #a3a3a3 !important;
    }

    /* Location + hours card (embedded Google Map — keep controls/attribution readable) */
    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"],
    html.${DARK_MODE_HTML_CLASS} [class*="__card-base"][class*="__location-hours-card"] {
      background-color: #1a1a1a !important;
      color: #e5e5e5 !important;
      border-color: #404040 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__location-card-content"] h4,
    html.${DARK_MODE_HTML_CLASS} [class*="__location-card-content"] p,
    html.${DARK_MODE_HTML_CLASS} [class*="__location-card-content"] li,
    html.${DARK_MODE_HTML_CLASS} [class*="__hours-operations-list"],
    html.${DARK_MODE_HTML_CLASS} [class*="__hours-operations-bold-text"] {
      color: #e5e5e5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] svg:not([class*="fill-"]) path {
      fill: #e5e5e5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] [style*="229, 227, 223"] {
      background-color: #2a2a2a !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] .gm-style {
      color-scheme: light;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] .gm-style-mtc button,
    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] .gm-control-active,
    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] .gm-svpc,
    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] gmp-internal-camera-control button {
      background-color: #ffffff !important;
      color: #202124 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] .gm-style-cc span,
    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] .gm-style-cc a,
    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] .gm-style-cc button {
      color: #202124 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] .gm-style-cc div[style*="245, 245, 245"] {
      background-color: #e8e8e8 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__location-hours-card"] .gmnoscreen div {
      background-color: #e8e8e8 !important;
      color: #202124 !important;
    }

    html.${DARK_MODE_HTML_CLASS} #${CARD_ID} {
      --nellis-compare-background: #262626;
      --nellis-compare-text: #e5e5e5;
      --nellis-compare-heading: #fafafa;
      --nellis-compare-muted: #a3a3a3;
      --nellis-compare-border: rgba(82, 82, 82, 0.55);
      --nellis-compare-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    }

    html.${DARK_MODE_HTML_CLASS} #${CARD_ID} .nellis-compare__image-wrap {
      background: rgba(23, 23, 23, 0.92);
    }

    html.${DARK_MODE_HTML_CLASS} #${CARD_ID} .nellis-compare__image {
      background: #141414;
    }

    html.${DARK_MODE_HTML_CLASS} .nellis-export-button {
      background: #262626;
      color: #e5e5e5;
      border-color: rgba(115, 115, 115, 0.45);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
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
