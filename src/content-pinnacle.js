/**
 * Vaultopolis content script for Disney Pinnacle.
 * Pill badge mode — click to expand analytics.
 */

import { PinnacleDetector } from './detectors/pinnacle.js';
import { CardPill } from './card-pill.js';
import { MediaControls } from './media-controls.js';

class VaultopolisOverlay {
  constructor() {
    this.detector = new PinnacleDetector();
    this.pill = new CardPill('pinnacle');
    this.currentUrl = window.location.href;
    this.processedElements = new WeakSet();
    this.debounceTimer = null;
    this.enabled = true;
    this.product = 'pinnacle';
  }

  init() {
    chrome.storage.local.get(['enabled'], (result) => {
      this.enabled = result.enabled !== false;

      if (!this.enabled) return;

      new MediaControls('pinnacle').init();
      this.pill.init();

      chrome.runtime.sendMessage({ action: 'ensureIndex', market: this.product });

      this.watchNavigation();
      this.watchDOM();

      // Pinnacle takes 10-30s to render cards
      setTimeout(() => this.scanPage(), 5000);
      setTimeout(() => this.scanPage(), 10000);
      setTimeout(() => this.scanPage(), 20000);
      setTimeout(() => this.scanPage(), 30000);
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
        setTimeout(() => this.scanPage(), 800);
      }
    };
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
        const dominated = mutations.some(m => m.addedNodes.length > 0 || m.type === 'attributes');
        if (dominated) this.scanPage();
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src', 'alt'] });
  }

  scanPage() {
    if (!this.enabled) return;
    for (const { element, editionId, playerName, listingPrice } of this.detector.findEditionElements()) {
      if (this.processedElements.has(element)) continue;
      this.processedElements.add(element);

      const linkEl = element.tagName === 'A' ? element : element.querySelector('a[href*="/pin/"]');
      const listingUrl = linkEl?.href || element.href || '';
      element._vpData = { editionId, playerName, listingPrice, listingUrl };

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
