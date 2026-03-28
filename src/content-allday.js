/**
 * Vaultopolis content script for NFL All Day.
 * Same overlay logic as Top Shot, different detector and product key.
 */

import { AllDayDetector } from './detectors/allday.js';
import { Tooltip } from './tooltip.js';
import { MediaControls } from './media-controls.js';

class VaultopolisOverlay {
  constructor() {
    this.detector = new AllDayDetector();
    this.tooltip = new Tooltip();
    this.currentUrl = window.location.href;
    this.processedElements = new WeakSet();
    this.debounceTimer = null;
    this.enabled = true;
    this.product = 'allday';
  }

  init() {
    chrome.storage.local.get('enabled', (result) => {
      this.enabled = result.enabled !== false;
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.enabled) {
        this.enabled = changes.enabled.newValue;
        if (!this.enabled) this.tooltip.hide();
      }
    });

    new MediaControls('allday').init();
    this.watchNavigation();
    this.watchDOM();
    window.addEventListener('scroll', () => this.tooltip.hideImmediate(), { passive: true });
    setTimeout(() => this.scanPage(), 3000);
    setTimeout(() => this.scanPage(), 6000);
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
        if (mutations.some(m => m.addedNodes.length > 0)) this.scanPage();
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  scanPage() {
    if (!this.enabled) return;
    for (const { element, editionId, playerName, listingPrice } of this.detector.findEditionElements()) {
      if (this.processedElements.has(element)) continue;
      this.processedElements.add(element);
      element._vpData = { editionId, playerName, listingPrice, listingUrl: element.href };
      element.addEventListener('mouseenter', (e) => this.showTooltip(e));
      element.addEventListener('mouseleave', () => this.tooltip.hide());
    }
  }

  async showTooltip(event) {
    if (!this.enabled) return;
    const el = event.currentTarget;
    const { editionId, playerName, listingPrice, listingUrl } = el._vpData;

    let rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      rect = (el.parentElement || el).getBoundingClientRect();
    }

    this.tooltip.showLoading(rect);

    try {
      let edition = null;

      if (editionId) {
        const resp = await chrome.runtime.sendMessage({
          action: 'lookupByEditionId', editionId, product: this.product
        });
        if (resp?.success) edition = resp.data;
      }

      if (!edition && playerName) {
        const resp = await chrome.runtime.sendMessage({
          action: 'searchByName', playerName, product: this.product
        });
        if (resp?.success && resp.data?.length > 0) edition = resp.data[0];
      }

      if (edition) {
        this.tooltip.showData(rect, edition, listingPrice, listingUrl);
      } else {
        this.tooltip.showError(rect, 'Data not available');
      }
    } catch (err) {
      console.error('[Vaultopolis]', err);
      this.tooltip.showError(rect, 'Failed to load data');
    }
  }
}

const overlay = new VaultopolisOverlay();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => overlay.init());
} else {
  overlay.init();
}
