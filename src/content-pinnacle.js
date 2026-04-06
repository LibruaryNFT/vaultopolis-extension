/**
 * Vaultopolis content script for Disney Pinnacle.
 * Same overlay logic, different detector and product key.
 */

import { PinnacleDetector } from './detectors/pinnacle.js';
import { Tooltip } from './tooltip.js';
import { MediaControls } from './media-controls.js';
import { CardBadge } from './card-badge.js';

class VaultopolisOverlay {
  constructor() {
    this.detector = new PinnacleDetector();
    this.tooltip = new Tooltip();
    this.badge = new CardBadge('pinnacle');
    this.currentUrl = window.location.href;
    this.processedElements = new WeakSet();
    this._processedArray = [];
    this.debounceTimer = null;
    this.enabled = true;
    this.product = 'pinnacle';
    this.currentTooltipEl = null;
    this._pausedVideo = null;
    this._lastCheck = 0;
  }

  init() {
    chrome.storage.local.get(['enabled', 'alwaysOn'], (result) => {
      this.enabled = result.enabled !== false;
      this.badge.setEnabled(!!result.alwaysOn);
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.enabled) {
        this.enabled = changes.enabled.newValue;
        if (!this.enabled) this._hide();
      }
      if (changes.alwaysOn) {
        this.badge.setEnabled(changes.alwaysOn.newValue);
        if (changes.alwaysOn.newValue) {
          this.badge.observeAll(this.processedElements, this._processedArray);
        }
      }
    });

    new MediaControls('pinnacle').init();
    this.watchNavigation();
    this.watchDOM();

    // Single global handler — covers hover and scroll-under-cursor in one place.
    // Throttled to 16ms (~60fps); elementsFromPoint is cheap at this rate.
    window.addEventListener('mousemove', (e) => {
      const now = performance.now();
      if (now - this._lastCheck < 16) return;
      this._lastCheck = now;
      this._checkPoint(e.clientX, e.clientY);
    }, { passive: true });

    // Scroll just hides — mousemove will re-trigger if cursor is over a card when scroll stops.
    window.addEventListener('scroll', () => this._hide(), { passive: true });

    // Pinnacle takes ~10s to render cards
    setTimeout(() => this.scanPage(), 5000);
    setTimeout(() => this.scanPage(), 10000);
  }

  _checkPoint(x, y) {
    if (!this.enabled) return;
    if (this.badge.enabled) return;
    let found = null;
    for (const el of document.elementsFromPoint(x, y)) {
      if (this.processedElements.has(el)) { found = el; break; }
    }
    if (found && found !== this.currentTooltipEl) {
      this.currentTooltipEl = found;
      this.showTooltip({ currentTarget: found });
    } else if (!found && this.currentTooltipEl) {
      this._hide();
    }
  }

  _hide() {
    this.currentTooltipEl = null;
    if (this._pausedVideo) {
      this._pausedVideo.play().catch(() => {});
      this._pausedVideo = null;
    }
    this.tooltip.hideImmediate();
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
      this._processedArray.push(element);
      element._vpData = { editionId, playerName, listingPrice, listingUrl: element.href };
      this.badge.observe(element);
    }
  }

  async showTooltip(event) {
    if (!this.enabled) return;
    const el = event.currentTarget;
    if (!el._vpData) return;

    // Pause any video playing under the overlay — can't see it anyway
    const vid = el.querySelector('video') || el.parentElement?.querySelector('video');
    if (vid && !vid.paused) {
      vid.pause();
      this._pausedVideo = vid;
    }

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
        this.tooltip.showData(rect, edition, listingPrice, listingUrl, this.product);
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
