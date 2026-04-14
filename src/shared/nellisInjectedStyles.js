import {
  AUCTION_LIST_PHOTO_BAR_CLASS,
  AUCTION_LIST_PHOTO_WRAP_CLASS,
  BID_TOTAL_HINT_CLASS,
  CARD_ID,
  CART_BULK_CHECKOUT_TOOLBAR_ID,
  CART_BULK_TOOLBAR_ID,
  CART_ITEM_FEE_HINT_CLASS,
  DARK_MODE_HTML_CLASS,
  DARK_MODE_TOGGLE_ID,
  PREMIUM_HINT_CLASS,
  STYLE_ID,
  TIME_HINT_CLASS,
  WATCHLIST_COUNT_CLASS,
} from './nellisUiConstants.js';

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${CARD_ID} {
      margin: 0 0 16px;
      border: 0;
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
      background: #ffffff;
      border: 0;
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
      width: 100%;
      border-radius: 10px;
      border: 0;
      background: linear-gradient(90deg, #c31432 0%, #93291e 100%);
      color: #ffffff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    #${CARD_ID} .nellis-compare__button:hover {
      filter: brightness(0.97);
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

    .${AUCTION_LIST_PHOTO_WRAP_CLASS} {
      position: relative;
      display: inline-block;
      max-width: 100%;
      vertical-align: top;
    }

    .${AUCTION_LIST_PHOTO_WRAP_CLASS} img {
      display: block;
      max-width: 100%;
      height: auto;
    }

    .${AUCTION_LIST_PHOTO_BAR_CLASS} {
      position: absolute;
      right: 4px;
      bottom: 4px;
      left: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 3px 4px;
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(4px);
      pointer-events: auto;
      z-index: 4;
    }

    .${AUCTION_LIST_PHOTO_BAR_CLASS} button {
      flex: 0 0 auto;
      margin: 0;
      padding: 0 6px;
      min-width: 26px;
      height: 24px;
      border: 0;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.2);
      color: #f9fafb;
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
    }

    .${AUCTION_LIST_PHOTO_BAR_CLASS} button:hover {
      background: rgba(255, 255, 255, 0.32);
    }

    .${AUCTION_LIST_PHOTO_BAR_CLASS} [data-nellis-photo-count] {
      flex: 1 1 auto;
      min-width: 0;
      text-align: center;
      font-size: 11px;
      font-weight: 600;
      color: rgba(249, 250, 251, 0.92);
      letter-spacing: 0.02em;
    }

    a[data-ax="item-card-image-link"] .${AUCTION_LIST_PHOTO_WRAP_CLASS} {
      width: 100%;
      height: 100%;
      max-width: none;
      display: block;
    }

    a[data-ax="item-card-image-link"] .${AUCTION_LIST_PHOTO_WRAP_CLASS} img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    form[data-ax="item-card-watchlist-form"],
    form[data-ax="product-page-watchlist-form"] {
      overflow: visible;
    }

    form[data-ax="item-card-watchlist-form"] button:has(.${WATCHLIST_COUNT_CLASS}),
    form[data-ax="product-page-watchlist-form"] button:has(.${WATCHLIST_COUNT_CLASS}) {
      position: relative;
      overflow: visible;
    }

    .${WATCHLIST_COUNT_CLASS} {
      position: absolute;
      top: -7px;
      right: -7px;
      z-index: 2;
      box-sizing: border-box;
      min-width: 1.25rem;
      min-height: 1.25rem;
      padding: 4px 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      color: #fafafa;
      background: rgba(15, 23, 42, 0.88);
      border-radius: 9999px;
      pointer-events: none;
      user-select: none;
      box-shadow: 0 2px 5px rgba(15, 23, 42, 0.35);
    }

    [data-ax="pickups-item-container"].nellis-cart-bulk-row {
      position: relative;
      padding-left: 40px;
    }

    .nellis-cart-bulk-cb,
    .nellis-cart-bulk-checkout-cb {
      position: absolute;
      left: 12px;
      top: 14px;
      z-index: 3;
      width: 18px;
      height: 18px;
      margin: 0;
      cursor: pointer;
      accent-color: #c31432;
    }

    #${CART_BULK_TOOLBAR_ID},
    #${CART_BULK_CHECKOUT_TOOLBAR_ID} {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 12px;
      margin: 0 0 10px;
      width: 100%;
    }

    .nellis-cart-sort {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 10px;
      width: 100%;
    }

    .nellis-cart-sort__label {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
    }

    .nellis-cart-sort__select {
      flex: 0 0 auto;
      min-height: 38px;
      padding: 0 12px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid rgba(15, 23, 42, 0.12);
      background: #ffffff;
      color: #111827;
    }

    html.${DARK_MODE_HTML_CLASS} .nellis-cart-sort__label {
      color: #f5f5f5;
    }

    html.${DARK_MODE_HTML_CLASS} .nellis-cart-sort__select {
      background: #262626;
      color: #f5f5f5;
      border-color: rgba(245, 245, 245, 0.12);
    }

    #${CART_BULK_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn,
    #${CART_BULK_CHECKOUT_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid rgba(15, 23, 42, 0.12);
      background: #ffffff;
      color: #111827;
    }

    #${CART_BULK_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn--ghost:hover:not(:disabled),
    #${CART_BULK_CHECKOUT_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn--ghost:hover:not(:disabled) {
      filter: brightness(0.97);
    }

    #${CART_BULK_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn--primary,
    #${CART_BULK_CHECKOUT_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn--primary {
      border: 0;
      background: linear-gradient(90deg, #c31432 0%, #93291e 100%);
      color: #ffffff;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    #${CART_BULK_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn--primary:hover:not(:disabled),
    #${CART_BULK_CHECKOUT_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn--primary:hover:not(:disabled) {
      filter: brightness(0.97);
    }

    #${CART_BULK_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn:disabled,
    #${CART_BULK_CHECKOUT_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    html.${DARK_MODE_HTML_CLASS} #${CART_BULK_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn--ghost,
    html.${DARK_MODE_HTML_CLASS} #${CART_BULK_CHECKOUT_TOOLBAR_ID} .nellis-cart-bulk-toolbar__btn--ghost {
      background: #262626;
      color: #f5f5f5;
      border-color: rgba(245, 245, 245, 0.12);
    }

    .${BID_TOTAL_HINT_CLASS} {
      padding: 6px 10px;
      font-size: 12px;
      line-height: 1.25;
      font-weight: 600;
      letter-spacing: 0.01em;
      color: rgba(17, 24, 39, 0.72);
    }

    html.${DARK_MODE_HTML_CLASS} .${BID_TOTAL_HINT_CLASS} {
      color: rgba(229, 229, 229, 0.78);
    }

    .${CART_ITEM_FEE_HINT_CLASS} {
      margin-top: 2px;
      font-size: 12px;
      line-height: 1.25;
      letter-spacing: 0.01em;
    }

    html.${DARK_MODE_HTML_CLASS} .${CART_ITEM_FEE_HINT_CLASS} {
      color: rgba(229, 229, 229, 0.78);
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
      background-color: #1f1f1f !important;
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

    /* Scroll-to-top FAB: same neutral remap as page chrome — lift like dark-mode toggle */
    html.${DARK_MODE_HTML_CLASS} button[data-ax="scroll-to-top"] {
      background-color: #404040 !important;
      border: 1px solid rgba(148, 163, 184, 0.35) !important;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45) !important;
    }

    html.${DARK_MODE_HTML_CLASS} button[data-ax="scroll-to-top"]:hover {
      background-color: #525252 !important;
      border-color: rgba(203, 213, 225, 0.35) !important;
    }

    html.${DARK_MODE_HTML_CLASS} button[data-ax="scroll-to-top"]:focus-visible {
      outline: 2px solid rgba(148, 163, 184, 0.65) !important;
      outline-offset: 2px !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-neutral-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-neutral-900"] {
      background-color: #171717 !important;
    }

    html.${DARK_MODE_HTML_CLASS} .bg-white,
    html.${DARK_MODE_HTML_CLASS} [class*="bg-white"]:not([class*="before:bg-white"]) {
      background-color: #1f1f1f !important;
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
      background-color: #1f1f1f !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="before:bg-white"]::before {
      background-color: #1f1f1f !important;
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

    html.${DARK_MODE_HTML_CLASS} [class*="text-slate-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="text-slate-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="text-zinc-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="text-zinc-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="text-stone-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="text-stone-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="text-black"] {
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

    html.${DARK_MODE_HTML_CLASS} button[data-ax="scroll-to-top"] [class*="fill-neutral-900"],
    html.${DARK_MODE_HTML_CLASS} button[data-ax="scroll-to-top"] [class*="fill-neutral-800"] {
      fill: #f8fafc !important;
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
      --tw-ring-offset-color: #1f1f1f !important;
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

    /* Search header (CSS-module) */
    html.${DARK_MODE_HTML_CLASS} [class*="__search-header"] h2 {
      color: #fafafa !important;
    }

    /* Search pagination (CSS-module): "Showing 1 - … of …" */
    html.${DARK_MODE_HTML_CLASS} [data-ax="search-pagination-container"] [class*="__pagination-header"],
    html.${DARK_MODE_HTML_CLASS} [data-ax="search-pagination-container"] [class*="__pagination-header"] span {
      color: #e5e5e5 !important;
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

    /* Won / success (emerald) and highlight (orange)
     * Scope to card-like surfaces to avoid painting entire pages (e.g. Fees page wrappers).
     */
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-50"][class*="rounded"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-50"][class*="shadow"],
    html.${DARK_MODE_HTML_CLASS} [data-ax*="card"][class*="bg-emerald-50"] {
      background-color: #022c22 !important;
      color: #ecfdf5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-100"][class*="rounded"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-100"][class*="shadow"],
    html.${DARK_MODE_HTML_CLASS} [data-ax*="card"][class*="bg-emerald-100"] {
      background-color: #064e3b !important;
      color: #d1fae5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-200"][class*="rounded"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-200"][class*="shadow"],
    html.${DARK_MODE_HTML_CLASS} [data-ax*="card"][class*="bg-emerald-200"] {
      background-color: #065f46 !important;
      color: #ecfdf5 !important;
    }

    /* Active auctions list: WINNING row is bg-emerald-200 only (no rounded on the strip) */
    html.${DARK_MODE_HTML_CLASS} [data-ax="item-card-container"] [class*="bg-emerald-200"],
    html.${DARK_MODE_HTML_CLASS} [class*="rounded-itemCard"] [class*="bg-emerald-200"] {
      background-color: #065f46 !important;
      color: #ecfdf5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [data-ax="item-card-container"] [class*="bg-emerald-200"] [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [data-ax="item-card-container"] [class*="bg-emerald-200"] [class*="text-gray-800"],
    html.${DARK_MODE_HTML_CLASS} [data-ax="item-card-container"] [class*="bg-emerald-200"] [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} [data-ax="item-card-container"] [class*="bg-emerald-200"] [class*="text-gray-600"],
    html.${DARK_MODE_HTML_CLASS} [class*="rounded-itemCard"] [class*="bg-emerald-200"] [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="rounded-itemCard"] [class*="bg-emerald-200"] [class*="text-gray-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="rounded-itemCard"] [class*="bg-emerald-200"] [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} [class*="rounded-itemCard"] [class*="bg-emerald-200"] [class*="text-gray-600"] {
      color: #ecfdf5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-50"][class*="rounded"] [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-50"][class*="rounded"] [class*="text-gray-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-50"][class*="rounded"] [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-50"][class*="rounded"] [class*="text-gray-600"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-100"][class*="rounded"] [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-100"][class*="rounded"] [class*="text-gray-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-100"][class*="rounded"] [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-100"][class*="rounded"] [class*="text-gray-600"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-200"][class*="rounded"] [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-200"][class*="rounded"] [class*="text-gray-800"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-200"][class*="rounded"] [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-emerald-200"][class*="rounded"] [class*="text-gray-600"] {
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

    /* Orange surface used by product-page sticky bars + bid-section hint cards */
    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-200"],
    html.${DARK_MODE_HTML_CLASS} [class*="bg-orange-200/"],
    html.${DARK_MODE_HTML_CLASS} [class*="sm:bg-orange-200"],
    html.${DARK_MODE_HTML_CLASS} [class*="md:bg-orange-200"],
    html.${DARK_MODE_HTML_CLASS} [class*="lg:bg-orange-200"] {
      background-color: #7c2d12 !important;
      color: #ffedd5 !important;
      border-color: rgba(253, 186, 116, 0.55) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-200"] [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-200"] [class*="text-gray-800"],
    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-200"] [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-200"] [class*="text-gray-600"],
    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-200"] strong,
    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-200"] span,
    html.${DARK_MODE_HTML_CLASS} [class~="bg-orange-200"] h6 {
      color: #fff7ed !important;
    }

    /* Product page sticky header (breadcrumb / outbid bar) */
    html.${DARK_MODE_HTML_CLASS} [class~="sticky"][class~="bg-orange-200"] {
      background-color: #5c280d !important;
      border-bottom: 1px solid rgba(253, 186, 116, 0.35) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class~="sticky"][class~="bg-orange-200"] [class~="bg-white"] {
      background-color: #262626 !important;
      color: #f5f5f5 !important;
      border-color: rgba(115, 115, 115, 0.4) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class~="sticky"][class~="bg-orange-200"] svg[class*="fill-"] path,
    html.${DARK_MODE_HTML_CLASS} [class~="sticky"][class~="bg-orange-200"] svg path {
      fill: #f5f5f5 !important;
    }

    /* Bid section: ensure orange hint cards don't keep dark gray text */
    html.${DARK_MODE_HTML_CLASS} #bid-section [class~="bg-orange-200"] [class*="text-gray-900"],
    html.${DARK_MODE_HTML_CLASS} #bid-section [class~="bg-orange-200"] [class*="text-gray-800"],
    html.${DARK_MODE_HTML_CLASS} #bid-section [class~="bg-orange-200"] [class*="text-gray-700"],
    html.${DARK_MODE_HTML_CLASS} #bid-section [class~="bg-orange-200"] [class*="text-gray-600"] {
      color: #fff7ed !important;
    }

    /* Bid section: keep top divider, remove box borders (OUTBID/WINNING blocks use md:border) */
    html.${DARK_MODE_HTML_CLASS} #bid-section [class*="md:border"][class*="border-t-orange-200"],
    html.${DARK_MODE_HTML_CLASS} #bid-section [class*="md:border"][class*="border-t-emerald-200"] {
      border-left-width: 0 !important;
      border-right-width: 0 !important;
      border-bottom-width: 0 !important;
      border-top-width: 1px !important;
      border-left-color: transparent !important;
      border-right-color: transparent !important;
      border-bottom-color: transparent !important;
    }

    html.${DARK_MODE_HTML_CLASS} #bid-section [class*="md:border"][class*="border-t-orange-200"] {
      border-top-color: rgba(253, 186, 116, 0.55) !important;
    }

    html.${DARK_MODE_HTML_CLASS} #bid-section [class*="md:border"][class*="border-t-emerald-200"] {
      border-top-color: rgba(52, 211, 153, 0.55) !important;
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

    /* Order cancellation flow (CSS modules — green panels, product link row, guideline cards) */
    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-customer-tier-container"] {
      background-color: #0f2918 !important;
      color: #ecfdf5 !important;
      border-color: rgba(52, 211, 153, 0.35) !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-customer-tier-container"] [class*="__cancellation-customer-tier-title"],
    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-customer-tier-container"] [class*="__cancellation-paragraph"] {
      color: #d1fae5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-customer-tier-container"] [class*="__traffic-light-base"][class*="__traffic-light-white"] {
      background-color: #404040 !important;
      border-color: rgba(163, 163, 163, 0.85) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-customer-tier-container"] [class*="__traffic-light-green-background"] {
      background-color: #15803d !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-customer-tier-container"] [class*="__traffic-light-divider"] {
      background-color: rgba(34, 197, 94, 0.28) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-form-container"][class*="__cancellation-form-green"] {
      background-color: #0a1f14 !important;
      border-color: rgba(74, 222, 128, 0.45) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-form-content"] > a {
      color: inherit !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-form-content"] > a:focus-visible {
      outline: 2px solid rgba(248, 113, 113, 0.75) !important;
      outline-offset: 2px !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-form-content"] > a [class*="__cancellation-product-item-container"] {
      background-color: #171717 !important;
      border-color: rgba(74, 222, 128, 0.45) !important;
      border-radius: 0 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-form-content"] > a [class*="__cancellation-item-product-item-title"] {
      color: #f5f5f5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-form-content"] > a [class*="__cancellation-product-item-image"] {
      background-color: #ffffff !important;
      border-radius: 0 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-form-proceed"] {
      background-color: rgba(0, 0, 0, 0.28) !important;
      border-top: 1px solid rgba(74, 222, 128, 0.28) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-form-proceed"] [class*="text-neutral-800"] {
      color: #ecfdf5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-form-proceed"] a[class*="border-primary"] {
      border-color: rgba(248, 113, 113, 0.65) !important;
      background-color: rgba(23, 23, 23, 0.92) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__cancellation-form-proceed"] a[class*="border-primary"] span {
      color: #f5f5f5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__checkout-card-container"][class*="__cancellation-header-shadow"] {
      background-color: #1a1a1a !important;
      color: #e5e5e5 !important;
      border: 1px solid #404040 !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__checkout-card-container"][class*="__cancellation-header-shadow"] [class*="__cancellation-pay-for-items-title"],
    html.${DARK_MODE_HTML_CLASS} [class*="__checkout-card-container"][class*="__cancellation-header-shadow"] h6,
    html.${DARK_MODE_HTML_CLASS} [class*="__checkout-card-container"][class*="__cancellation-header-shadow"] li {
      color: #e5e5e5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__checkout-card-container"][class*="__cancellation-header-shadow"] [class*="fill-emerald-600"] {
      fill: #34d399 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__checkout-card-container"][class*="__cancellation-header-shadow"] [class*="fill-burgundy-400"] {
      fill: #f87171 !important;
    }

    /* Cart / loader: fetch error card (CSS module — stays white otherwise) */
    html.${DARK_MODE_HTML_CLASS} [class*="__fetch-error-container"] {
      background-color: #1a1a1a !important;
      color: #d4d4d4 !important;
      border: 1px solid #404040 !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__fetch-error-container"] > div {
      color: #e5e5e5 !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__fetch-error-container"] [class*="__fetch-error-title"] {
      color: #fafafa !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="__fetch-error-container"] [class*="__fetch-error-subtitle"] {
      color: #a3a3a3 !important;
    }

    /* Receipts + cart items: use a "card" surface, not page surface */
    html.${DARK_MODE_HTML_CLASS} [class~="bg-white"][class*="rounded-itemCard"],
    html.${DARK_MODE_HTML_CLASS} [data-ax="pickups-item-container"][class~="bg-white"],
    html.${DARK_MODE_HTML_CLASS} [data-ax="pickups-item-container"][class*="bg-white"] {
      background-color: #262626 !important;
      border-color: rgba(82, 82, 82, 0.55) !important;
    }

    /* Pick ups checkout: summary column is bg-white remapped to same as body — restore a card surface */
    html.${DARK_MODE_HTML_CLASS} [class*="rounded-xl"][class*="bg-white"]:has([data-ax="pickups-proceed-to-checkout-form"]) {
      background-color: #262626 !important;
      border: 1px solid rgba(82, 82, 82, 0.55) !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [class*="rounded-xl"][class*="bg-white"]:has([data-ax="pickups-proceed-to-checkout-form"]) h3 {
      color: #fafafa !important;
    }

    /* Pick ups flow: global bg-secondary → flat gray kills CTA; restore Nellis gradient */
    html.${DARK_MODE_HTML_CLASS} [data-ax="pickups-proceed-to-checkout-form"] button[class~="bg-secondary"]:not(:disabled),
    html.${DARK_MODE_HTML_CLASS} button[data-ax="pickups-remove-from-cart"][class~="bg-secondary"]:not(:disabled) {
      background-color: #c31432 !important;
      background-image: linear-gradient(90deg, #c31432 0%, #93291e 100%) !important;
    }

    html.${DARK_MODE_HTML_CLASS} [data-ax="pickups-proceed-to-checkout-form"] button[class~="bg-secondary"]:not(:disabled):hover,
    html.${DARK_MODE_HTML_CLASS} button[data-ax="pickups-remove-from-cart"][class~="bg-secondary"]:not(:disabled):hover {
      background-color: #a3122a !important;
      background-image: linear-gradient(90deg, #a3122a 0%, #7d2418 100%) !important;
    }

    /*
     * Checkout payment — saved cards: Nellis only adds p-5 / shadow on the selected card;
     * unselected [data-ax="checkout-payment-select-a-card"] rows omit padding. Match padding and
     * card chrome for all rows + dark surfaces.
     */
    html.${DARK_MODE_HTML_CLASS}
      [data-ax="checkout-payment-saved-cards-container"]
      .__grid-item
      > div[class*="bg-white"] {
      padding: 1.25rem !important;
      background-color: #262626 !important;
      color: #e5e5e5 !important;
      box-shadow:
        0 4px 6px -1px rgba(0, 0, 0, 0.35),
        0 2px 4px -2px rgba(0, 0, 0, 0.28) !important;
    }

    html.${DARK_MODE_HTML_CLASS}
      [data-ax="checkout-payment-saved-cards-container"]
      .__grid-item
      > div[class*="border-neutral-100"] {
      border-color: rgba(82, 82, 82, 0.65) !important;
    }

    html.${DARK_MODE_HTML_CLASS}
      [data-ax="checkout-payment-saved-cards-container"]
      .__grid-item
      > div[class*="border-primary"] {
      border-color: rgba(248, 113, 113, 0.55) !important;
    }

    /* Dashboard cards that are visually "cards" but can be transparent (e.g. Cart items, Receipts) */
    html.${DARK_MODE_HTML_CLASS} main [class*="shadow-"][class*="rounded"]:not([class*="bg-"]) {
      background-color: #1a1a1a !important;
      border-color: #404040 !important;
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
      background: #ffffff;
      border: 0;
    }

    html.${DARK_MODE_HTML_CLASS} #${CARD_ID} .nellis-compare__image {
      background: #ffffff;
    }

    html.${DARK_MODE_HTML_CLASS} .nellis-export-button {
      background: #262626;
      color: #e5e5e5;
      border-color: rgba(115, 115, 115, 0.45);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    }

    html.${DARK_MODE_HTML_CLASS} .${AUCTION_LIST_PHOTO_BAR_CLASS} {
      background: rgba(23, 23, 23, 0.85);
    }

    html.${DARK_MODE_HTML_CLASS} .${AUCTION_LIST_PHOTO_BAR_CLASS} button {
      background: rgba(255, 255, 255, 0.12);
      color: #fafafa;
    }

    html.${DARK_MODE_HTML_CLASS} .${AUCTION_LIST_PHOTO_BAR_CLASS} button:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    html.${DARK_MODE_HTML_CLASS} .${WATCHLIST_COUNT_CLASS} {
      color: #fafafa;
      background: rgba(23, 23, 23, 0.92);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
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