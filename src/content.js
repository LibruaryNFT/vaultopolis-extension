/**
 * Vaultopolis content script — injected into marketplace pages.
 * Detects edition elements, shows analytics tooltips on hover.
 */

import { TopShotDetector } from './detectors/topshot.js';
import { Tooltip } from './tooltip.js';
import { MediaControls } from './media-controls.js';
import { CardBadge } from './card-badge.js';

class VaultopolisOverlay {
  constructor() {
    this.detector = new TopShotDetector();
    this.tooltip = new Tooltip();
    this.badge = new CardBadge('topshot');
    this.currentUrl = window.location.href;
    this.processedElements = new WeakSet();
    this._processedArray = []; // for re-observing on alwaysOn toggle
    this.debounceTimer = null;
    this.enabled = true;
    this.product = 'topshot';
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
      // Media settings handled by MediaControls
    });

    new MediaControls('topshot').init();
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

    // Initial scans — cards load async via GraphQL
    setTimeout(() => this.scanPage(), 3000);
    setTimeout(() => this.scanPage(), 6000);
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
        if (mutations.some(m => m.addedNodes.length > 0)) {
          this.scanPage();
        }
      }, 500);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  scanPage() {
    if (!this.enabled) return;

    for (const { element, setId, playId, setUuid, playUuid, parallelID, playerName, listingPrice } of this.detector.findEditionElements()) {
      if (this.processedElements.has(element)) continue;
      this.processedElements.add(element);
      this._processedArray.push(element);
      element._vpData = { setId, playId, setUuid, playUuid, parallelID, playerName, listingPrice, listingUrl: element.href };
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

    const { setId, playId, setUuid, playUuid, parallelID, playerName, listingPrice, listingUrl } = el._vpData;

    // The <a> link may be 0x0 — use parent with real dimensions
    let rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      rect = (el.parentElement || el).getBoundingClientRect();
    }

    this.tooltip.showLoading(rect);

    try {
      let edition = null;

      // Strategy 1: UUID resolve → lookup
      if (setUuid && playUuid) {
        const resp = await chrome.runtime.sendMessage({
          action: 'resolveAndLookup', setUuid, playUuid, parallelID, listingPrice
        });
        if (resp?.success) edition = resp.data;
      }

      // Strategy 2: Direct numeric ID lookup
      if (!edition && setId && playId) {
        const resp = await chrome.runtime.sendMessage({ action: 'lookupEdition', setId, playId });
        if (resp?.success) edition = resp.data;
      }

      // Strategy 3: Name-based search
      if (!edition && playerName) {
        const resp = await chrome.runtime.sendMessage({ action: 'searchByName', playerName });
        if (resp?.success && resp.data?.length > 0) {
          edition = this.bestMatch(resp.data, listingPrice);
        }
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

  bestMatch(editions, listingPrice) {
    if (editions.length === 1 || !listingPrice) return editions[0];
    let best = editions[0], bestDiff = Infinity;
    for (const ed of editions) {
      const diff = Math.abs((ed.floor_price || 0) - listingPrice);
      if (diff < bestDiff) { bestDiff = diff; best = ed; }
    }
    return best;
  }

}

const overlay = new VaultopolisOverlay();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => overlay.init());
} else {
  overlay.init();
}
