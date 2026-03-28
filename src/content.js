/**
 * Vaultopolis content script — injected into marketplace pages.
 * Detects edition elements, shows analytics tooltips on hover.
 */

import { TopShotDetector } from './detectors/topshot.js';
import { Tooltip } from './tooltip.js';

class VaultopolisOverlay {
  constructor() {
    this.detector = new TopShotDetector();
    this.tooltip = new Tooltip();
    this.currentUrl = window.location.href;
    this.processedElements = new WeakSet();
    this.debounceTimer = null;
    this.enabled = true;
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
      if (changes.blockVideos || changes.reduceImages || changes.blockAllMedia) {
        this.applyMediaSettings();
      }
    });

    this.applyMediaSettings();
    this.watchNavigation();
    this.watchDOM();

    // Hide tooltip on scroll
    window.addEventListener('scroll', () => this.tooltip.hideImmediate(), { passive: true });

    // Initial scans — cards load async via GraphQL
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

      element._vpData = { setId, playId, setUuid, playUuid, parallelID, playerName, listingPrice, listingUrl: element.href };

      element.addEventListener('mouseenter', (e) => this.showTooltip(e));
      element.addEventListener('mouseleave', () => this.tooltip.hide());
    }
  }

  async showTooltip(event) {
    if (!this.enabled) return;

    const el = event.currentTarget;
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
        this.tooltip.showData(rect, edition, listingPrice, listingUrl);
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

  /**
   * Media settings — only targets moment card media, not site UI.
   */
  applyMediaSettings() {
    chrome.storage.local.get(['blockVideos', 'reduceImages', 'blockAllMedia'], (result) => {
      const blockVideos = result.blockVideos || result.blockAllMedia || false;
      const reduceImages = result.reduceImages || result.blockAllMedia || false;
      const blockAll = result.blockAllMedia || false;

      this._setCSS('vp-block-videos', blockVideos,
        `.card-content video, a[href*="/listings/"] video { display: none !important; }`);

      this._setCSS('vp-reduce-images', reduceImages && !blockAll,
        `img[src*="assets.nbatopshot.com/resize/editions/"] { image-rendering: pixelated; filter: contrast(1.05) brightness(0.98); }`);

      this._setCSS('vp-block-all-media', blockAll,
        `img[src*="assets.nbatopshot.com/resize/editions/"] { display: none !important; }
         .card-content video { display: none !important; }`);

      if (blockVideos) {
        this._killCardVideos();
        if (!this._mediaObs) {
          this._mediaObs = new MutationObserver(() => this._killCardVideos());
          this._mediaObs.observe(document.body, { childList: true, subtree: true });
        }
      } else if (this._mediaObs) {
        this._mediaObs.disconnect();
        this._mediaObs = null;
      }
    });
  }

  _setCSS(id, on, css) {
    const el = document.getElementById(id);
    if (on && !el) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = css;
      document.head.appendChild(s);
    } else if (!on && el) {
      el.remove();
    }
  }

  _killCardVideos() {
    document.querySelectorAll('.card-content video, a[href*="/listings/"] video').forEach(v => {
      v.pause();
      v.removeAttribute('autoplay');
      v.preload = 'none';
    });
  }
}

const overlay = new VaultopolisOverlay();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => overlay.init());
} else {
  overlay.init();
}
