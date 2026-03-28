/**
 * Shared media controls for all marketplace content scripts.
 * Blocks videos, reduces images, or hides all card media.
 * Selectors are site-aware — each marketplace has different DOM structure.
 */

const SITE_SELECTORS = {
  topshot: {
    videos: '.card-content video, a[href*="/listings/"] video',
    images: 'img[src*="assets.nbatopshot.com"]',
  },
  allday: {
    videos: 'video, a[href*="/listing/"] video',
    images: 'img[src*="assets.nflallday.com"], img[src*="assets.allday"], img[src*="media.nflallday"]',
  },
  pinnacle: {
    videos: 'video',
    images: 'img[src*="disneypinnacle"], img[src*="pinnacle"]',
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
        `${this.sel.videos} { display: none !important; }`);

      this._setCSS('vp-reduce-images', reduceImages && !blockAll,
        `${this.sel.images} { image-rendering: pixelated; filter: contrast(1.05) brightness(0.98); }`);

      this._setCSS('vp-block-all-media', blockAll,
        `${this.sel.images} { display: none !important; }
         ${this.sel.videos} { display: none !important; }`);

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
