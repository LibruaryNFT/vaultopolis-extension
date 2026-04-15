/**
 * Shared media controls for all marketplace content scripts.
 * Blocks videos, reduces images, or hides all card media.
 * Selectors are site-aware — each marketplace has different DOM structure.
 */

const SITE_SELECTORS = {
  topshot: {
    // TopShot now uses .chakra-linkbox as card container (not <a> links)
    videos: '.chakra-linkbox video, a[href*="/listings/"] video',
    images: '.chakra-linkbox img:not([src*="badge"]):not([src*="icon"]):not([src*="tier"]):not([src*="avatar"]):not([class*="avatar"]), a[href*="/listings/"] img:not([src*="badge"]):not([src*="icon"])',
  },
  allday: {
    videos: 'a[href*="/listing/moment/"] video, a[href*="/listing/moment/"] ~ video',
    // Exclude .chakra-avatar__img (Hall of Fame, badges etc) and SVG badge icons
    images: 'a[href*="/listing/moment/"] img:not(.chakra-avatar__img):not([src*="badge"]):not([src*="icon"]), a[href*="/listing/moment/"] picture img:not(.chakra-avatar__img)',
  },
  pinnacle: {
    videos: 'a[href*="/pin/"] video, a[href*="/collectible/"] video',
    images: 'a[href*="/pin/"] img:not([src*="badge"]):not([src*="icon"]):not([src*="avatar"]), a[href*="/collectible/"] img:not([src*="badge"]):not([src*="icon"]):not([src*="avatar"])',
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
      if (changes.blockVideos || changes.reduceImages || changes.blockAllMedia) {
        this.apply();
      }
    });
  }

  apply() {
    chrome.storage.local.get(['blockVideos', 'reduceImages', 'blockAllMedia'], (result) => {
      const blockVideos = result.blockVideos || result.blockAllMedia || false;
      const reduceImages = result.reduceImages || result.blockAllMedia || false;
      const blockAll = result.blockAllMedia || false;

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

      if (blockVideos) {
        this._killVideos();
        if (!this._mediaObs) {
          this._mediaObs = new MutationObserver(() => this._killVideos());
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

  _killVideos() {
    document.querySelectorAll(this.sel.videos).forEach(v => {
      v.pause();
      v.removeAttribute('autoplay');
      v.preload = 'none';
    });
  }
}
