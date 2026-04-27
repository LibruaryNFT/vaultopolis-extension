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
    this.processedEditions = new WeakMap(); // element → last-seen editionId
    this.debounceTimer = null;
    this.enabled = true;
    this.product = 'pinnacle';
    this.detectedEditions = new Map(); // editionId → element
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

      console.log('[VP:Pinnacle] content script active on', window.location.href);

      // Pinnacle SPA renders slowly — scan up to 90s after load
      setTimeout(() => this.scanPage(), 1000);
      setTimeout(() => this.scanPage(), 3000);
      setTimeout(() => this.scanPage(), 5000);
      setTimeout(() => this.scanPage(), 10000);
      setTimeout(() => this.scanPage(), 20000);
      setTimeout(() => this.scanPage(), 30000);
      setTimeout(() => this.scanPage(), 45000);
      setTimeout(() => this.scanPage(true), 60000);
      setTimeout(() => this.scanPage(true), 90000);
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
        const dominated = mutations.some(m =>
          (m.addedNodes.length > 0 && [...m.addedNodes].some(n => !isVpNode(n))) ||
          m.type === 'attributes'
        );
        if (dominated) this.scanPage();
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src', 'alt'] });
  }

  scanPage(buildSummary = false) {
    if (!this.enabled) return;
    for (const { element, editionId, playerName, listingPrice } of this.detector.findEditionElements()) {
      if (this.processedEditions.get(element) === editionId) continue;
      this.processedEditions.set(element, editionId);

      const linkEl = element.tagName === 'A' ? element : element.querySelector('a[href*="/pin/"], a[href*="/collectible/"]');
      const listingUrl = linkEl?.href || element.href || '';
      element._vpData = { editionId, playerName, listingPrice, listingUrl };

      if (editionId) this.detectedEditions.set(editionId, element);
      this.pill.observe(element);
    }

    if (buildSummary) this._buildCollectionSummary();
  }

  async _buildCollectionSummary() {
    if (!window.location.pathname.includes('/user/')) return;
    if (this.detectedEditions.size === 0) return;

    const ids = [...this.detectedEditions.keys()].map(id => ({ editionId: id }));
    let totalFloor = 0;
    let priced = 0;

    try {
      const resp = await chrome.runtime.sendMessage({ action: 'lookupBatch', market: this.product, ids });
      if (!resp?.success) return;
      for (const entry of (resp.data || [])) {
        const fp = entry.data?.floor_price;
        if (fp && fp > 0) { totalFloor += fp; priced++; }
      }
    } catch { return; }

    this._showCollectionBanner(this.detectedEditions.size, totalFloor, priced);
  }

  _showCollectionBanner(total, totalFloor, priced) {
    document.getElementById('vp-collection-banner')?.remove();

    const fmt = v => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const avgFloor = priced > 0 ? totalFloor / priced : 0;

    const banner = document.createElement('div');
    banner.id = 'vp-collection-banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
      background: rgba(10, 10, 24, 0.92); backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(99, 102, 241, 0.4);
      padding: 8px 16px; display: flex; align-items: center; gap: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px; color: #e0e0e0;
    `;

    const logoUrl = chrome.runtime.getURL('assets/logo.svg');
    const floorStr = priced > 0 ? fmt(totalFloor) : 'N/A';
    const avgStr = priced > 0 ? fmt(avgFloor) : 'N/A';

    banner.innerHTML = `
      <img src="${logoUrl}" style="height:16px;width:16px;flex-shrink:0" alt="V">
      <span style="color:#6366f1;font-weight:700">Collection</span>
      <span style="color:#7070a0">|</span>
      <span><span style="color:#7070a0">Pins:</span> <strong style="color:#f0f0f0">${total}</strong></span>
      <span style="color:#7070a0">|</span>
      <span><span style="color:#7070a0">Floor value:</span> <strong style="color:#a5b4fc">${floorStr}</strong></span>
      <span style="color:#7070a0">|</span>
      <span><span style="color:#7070a0">Avg floor:</span> <strong style="color:#a5b4fc">${avgStr}</strong></span>
      <button id="vp-banner-close" style="margin-left:auto;background:none;border:none;color:#6b7280;cursor:pointer;font-size:18px;line-height:1;padding:0 4px">&times;</button>
    `;

    document.body.appendChild(banner);
    document.getElementById('vp-banner-close')?.addEventListener('click', () => banner.remove());
  }
}

const overlay = new VaultopolisOverlay();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => overlay.init());
} else {
  overlay.init();
}
