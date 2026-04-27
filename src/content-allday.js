/**
 * Vaultopolis content script for NFL All Day.
 * Pill badge mode — click to expand analytics.
 */

import { AllDayDetector } from './detectors/allday.js';
import { CardPill } from './card-pill.js';
import { MediaControls } from './media-controls.js';

class VaultopolisOverlay {
  constructor() {
    this.detector = new AllDayDetector();
    this.pill = new CardPill('allday');
    this.currentUrl = window.location.href;
    this.processedEditions = new WeakMap(); // element → last-seen editionId
    this.debounceTimer = null;
    this.enabled = true;
    this.product = 'allday';
  }

  init() {
    chrome.storage.local.get(['enabled'], (result) => {
      this.enabled = result.enabled !== false;

      if (!this.enabled) return;

      new MediaControls('allday').init();
      this.pill.init();

      chrome.runtime.sendMessage({ action: 'ensureIndex', market: this.product });

      this.watchNavigation();
      this.watchDOM();

      console.log('[VP:AllDay] content script active on', window.location.href);

      setTimeout(() => this.scanPage(), 3000);
      setTimeout(() => this.scanPage(), 6000);
      setTimeout(() => this.scanPage(), 12000);
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
        const isVpNode = n => n.nodeType === 1 && /\bvp-pill/.test(n.className || '');
        if (mutations.some(m => m.addedNodes.length > 0 && [...m.addedNodes].some(n => !isVpNode(n)))) this.scanPage();
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  scanPage() {
    if (!this.enabled) return;
    for (const { element, editionId, playerName, listingPrice } of this.detector.findEditionElements()) {
      if (this.processedEditions.get(element) === editionId) continue;
      this.processedEditions.set(element, editionId);

      const linkEl = element.tagName === 'A' ? element : element.querySelector('a[href*="/listing/moment/"]');
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
