/**
 * Vaultopolis content script — injected into NBA Top Shot marketplace pages.
 * Shows pill badges with floor prices on card corners.
 * Click pill to expand full analytics overlay.
 */

import { TopShotDetector } from './detectors/topshot.js';
import { CardPill } from './card-pill.js';
import { MediaControls } from './media-controls.js';

class VaultopolisOverlay {
  constructor() {
    this.detector = new TopShotDetector();
    this.pill = new CardPill('topshot');
    this.currentUrl = window.location.href;
    this.processedElements = new WeakSet();
    this.debounceTimer = null;
    this.enabled = true;
    this.product = 'topshot';
  }

  init() {
    chrome.storage.local.get(['enabled'], (result) => {
      this.enabled = result.enabled !== false;

      if (!this.enabled) return; // user disabled — don't inject anything

      // On listing/edition detail pages only prefetch the index — no pills, no media controls.
      // Media blocking is for the marketplace grid; on detail pages you want to see the moment.
      const isDetailPage = /\/listings\/p2p\/[\w%-]+\+[\w%-]+|\/moment\/[\w-]+/.test(window.location.href);
      if (!isDetailPage) {
        new MediaControls('topshot').init();
        this.pill.init();
      }

      chrome.runtime.sendMessage({ action: 'ensureIndex', market: this.product });

      this.watchNavigation();
      this.watchDOM();

      // Initial scans — cards load async via GraphQL
      setTimeout(() => this.scanPage(), 3000);
      setTimeout(() => this.scanPage(), 6000);
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.enabled) {
        this.enabled = changes.enabled.newValue;
      }
    });
  }

  watchNavigation() {
    const onNav = () => {
      const newUrl = window.location.href;
      if (newUrl !== this.currentUrl) {
        this.currentUrl = newUrl;
        // Reset processed set so re-rendered cards get fresh pills after SPA navigation
        this.processedElements = new WeakSet();
        setTimeout(() => this.scanPage(), 800);
      }
    };

    // Navigation API (Chrome 102+) — fires after the new document/state is fully committed,
    // so window.location.href is already updated when the handler runs.
    if ('navigation' in window) {
      window.navigation.addEventListener('navigatesuccess', onNav);
    }

    // Monkey-patch history for older Chrome and for pushState/replaceState calls that
    // the Navigation API may not capture in all SPA patterns.
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...args) => { origPush(...args); onNav(); };
    history.replaceState = (...args) => { origReplace(...args); onNav(); };
    window.addEventListener('popstate', onNav);
  }

  watchDOM() {
    const observer = new MutationObserver((mutations) => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        if (mutations.some(m => m.addedNodes.length > 0)) {
          this.scanPage();
        }
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  scanPage() {
    if (!this.enabled) return;

    // Skip detail/listing pages — they have edition links in parallels sections
    // and sales history, not card grids. Must check here (not just at init) because
    // SPA navigation can land on a detail page after init runs on a grid page.
    if (/\/listings\/p2p\/[\w%-]+\+[\w%-]+|\/moment\/[\w-]+/.test(window.location.href)) return;

    for (const { element, setId, playId, setUuid, playUuid, parallelID, playerName, listingPrice, supply } of this.detector.findEditionElements()) {
      if (this.processedElements.has(element)) continue;
      this.processedElements.add(element);

      const linkEl = element.tagName === 'A' ? element : element.querySelector('a[href*="/listings/p2p/"], a[href*="/edition/"]');
      const listingUrl = linkEl?.href || element.href || '';
      const parallelHint = this.detector.findParallelHint(element);
      element._vpData = { setId, playId, setUuid, playUuid, parallelID, playerName, listingPrice, listingUrl, supply, parallelHint };

      this.pill.observe(element);
    }
  }
}

const overlay = new VaultopolisOverlay();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => overlay.init());
} else {
  overlay.init();
}
