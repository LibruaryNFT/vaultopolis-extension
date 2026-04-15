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

      new MediaControls('topshot').init();
      this.pill.init();

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
        if (mutations.some(m => m.addedNodes.length > 0)) {
          this.scanPage();
        }
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  scanPage() {
    if (!this.enabled) return;

    for (const { element, setId, playId, setUuid, playUuid, parallelID, playerName, listingPrice, supply } of this.detector.findEditionElements()) {
      if (this.processedElements.has(element)) continue;
      this.processedElements.add(element);

      const linkEl = element.tagName === 'A' ? element : element.querySelector('a[href*="/listings/p2p/"], a[href*="/edition/"]');
      const listingUrl = linkEl?.href || element.href || '';
      element._vpData = { setId, playId, setUuid, playUuid, parallelID, playerName, listingPrice, listingUrl, supply };

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
