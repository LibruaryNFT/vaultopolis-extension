/**
 * Shared media controls for all marketplace content scripts.
 * Blocks videos, reduces images, or hides all card media.
 * Selectors are site-aware — each marketplace has different DOM structure.
 */

// .vp-icon is the Vaultopolis logo img inside the pill badge.
// It must never be caught by image blocking rules — always exclude it.
const VP_ICON_EXCL = ':not(.vp-icon)';

const SITE_SELECTORS = {
  topshot: {
    // Broad selector — content script is already scoped to nbatopshot.com/* and MediaControls
    // only runs on non-detail pages, so catching all videos is safe and covers homepage,
    // drops page, and explore page which use different container structures than the marketplace.
    videos: 'video',
    images: `.chakra-linkbox img${VP_ICON_EXCL}:not([src*="badge"]):not([src*="icon"]):not([src*="tier"]):not([src*="avatar"]):not([class*="avatar"]), a[href*="/listings/"] img${VP_ICON_EXCL}:not([src*="badge"]):not([src*="icon"])`,
  },
  allday: {
    videos: 'a[href*="/listing/moment/"] video, a[href*="/listing/moment/"] ~ video',
    // Exclude .chakra-avatar__img (Hall of Fame, badges etc) and SVG badge icons
    images: `a[href*="/listing/moment/"] img${VP_ICON_EXCL}:not(.chakra-avatar__img):not([src*="badge"]):not([src*="icon"]), a[href*="/listing/moment/"] picture img${VP_ICON_EXCL}:not(.chakra-avatar__img)`,
  },
  pinnacle: {
    videos: 'a[href*="/pin/"] video, a[href*="/collectible/"] video',
    images: `a[href*="/pin/"] img${VP_ICON_EXCL}:not([src*="badge"]):not([src*="icon"]):not([src*="avatar"]), a[href*="/collectible/"] img${VP_ICON_EXCL}:not([src*="badge"]):not([src*="icon"]):not([src*="avatar"])`,
  },
};

export class MediaControls {
  constructor(site) {
    this.site = site;
    this.sel = SITE_SELECTORS[site] || SITE_SELECTORS.topshot;
    this._mediaObs = null;
  }

  init() {
    this.apply();

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.mediaMode || changes.blockVideos || changes.reduceImages || changes.blockAllMedia || changes.pauseVideos) {
        this.apply();
      }
    });
  }

  apply() {
    // Read new mediaMode enum; fall back to legacy boolean keys for users upgrading.
    chrome.storage.local.get(['mediaMode', 'pauseVideos', 'blockVideos', 'reduceImages', 'blockAllMedia'], (result) => {
      let mode = result.mediaMode || null;
      if (!mode) {
        // Legacy migration: derive mode from old boolean keys
        if (result.blockAllMedia) mode = 'blockAll';
        else if (result.blockVideos) mode = 'block';
        else if (result.pauseVideos) mode = 'pause';
        else mode = 'normal';
      }

      const pauseVideos = mode === 'pause';
      const blockVideos = mode === 'block' || mode === 'blockAll';
      const reduceImages = false; // removed from mediaMode — never silently degrade images
      const blockAll = mode === 'blockAll';

      this._setCSS('vp-block-videos', blockVideos,
        `${this.sel.videos} { visibility: hidden !important; opacity: 0 !important; }`);

      this._setCSS('vp-reduce-images', reduceImages && !blockAll,
        `${this.sel.images} { image-rendering: pixelated; filter: contrast(1.05) brightness(0.98); }`);

      this._setCSS('vp-block-all-media', blockAll,
        `${this.sel.images} { visibility: hidden !important; opacity: 0 !important; }
         ${this.sel.videos} { visibility: hidden !important; opacity: 0 !important; }`);

      // Restore visibility for our pill/overlay content — media rules must never bleed in.
      this._setCSS('vp-overlay-restore', blockVideos || reduceImages || blockAll,
        `.vp-pill, .vp-pill * { visibility: visible !important; opacity: 1 !important; image-rendering: auto !important; filter: none !important; }
         .vp-pill-overlay, .vp-pill-overlay * { visibility: visible !important; opacity: 1 !important; image-rendering: auto !important; filter: none !important; }`);

      const killActive = blockVideos || pauseVideos;
      // Always disconnect first so toggling between blockVideos/pauseVideos doesn't
      // leave a stale observer running alongside the new one
      if (this._mediaObs) {
        this._mediaObs.disconnect();
        this._mediaObs = null;
      }
      if (killActive) {
        this._killVideos();
        this._mediaObs = new MutationObserver((mutations) => {
          // Only re-scan if nodes were actually added (avoids re-querying on attr/text changes)
          if (mutations.some(m => m.addedNodes.length > 0)) this._killVideos();
        });
        this._mediaObs.observe(document.body, { childList: true, subtree: true });
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

  _killVideos() {
    document.querySelectorAll(this.sel.videos).forEach(v => {
      v.pause();
      v.removeAttribute('autoplay');
      v.preload = 'none';
    });
  }
}
