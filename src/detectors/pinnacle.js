/**
 * Disney Pinnacle pin detector.
 *
 * URL patterns (verified March 2026):
 * - /pin/{pinId}?isMarketplaceView=true  — marketplace listing card
 * - /marketplace?status=listed            — search page
 *
 * Pinnacle uses "pins" not "editions". Character names instead of player names.
 * Images from assets.disneypinnacle.com CDN.
 */

const NOT_NAMES = new Set([
  'marketplace', 'trade', 'releases', 'news', 'pinbooks',
  'sign up', 'sign in', 'log in', 'buy now', 'make offer',
  'listed digital pins only', 'newest listings', 'lowest price', 'highest price',
  'pin names', 'edition types', 'sort by', 'status',
]);

export class PinnacleDetector {
  findEditionElements() {
    const results = [];
    const seen = new WeakSet();

    const links = document.querySelectorAll('a[href*="/pin/"]');

    for (const link of links) {
      const ids = this.parseHref(link.href);
      if (!ids) continue;
      if (seen.has(link)) continue;
      seen.add(link);

      const pinName = this.findPinName(link);
      const listingPrice = this.findPrice(link);

      results.push({
        element: link,
        editionId: ids.pinId,
        playerName: pinName, // reuse field name for API compat
        listingPrice,
      });
    }

    return results;
  }

  findPinName(element) {
    // Look for alt text on images first (Pinnacle puts character name in img alt)
    const img = element.querySelector('img[alt]');
    if (img?.alt && img.alt.length > 2 && img.alt.length < 50) {
      const alt = img.alt.trim();
      if (!NOT_NAMES.has(alt.toLowerCase())) return alt;
    }

    // Fallback: text nodes
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text.length >= 3 && text.length <= 50 && !NOT_NAMES.has(text.toLowerCase())) {
        // Accept any capitalized text that isn't a UI label
        if (/^[A-Z]/.test(text)) return text;
      }
    }
    return null;
  }

  findPrice(element) {
    let el = element;
    for (let i = 0; i < 4 && el && el !== document.body; i++) {
      // Match "Buy for $1.00" or "$5.00"
      const match = (el.textContent || '').match(/(?:Buy for\s*)?\$\s*([\d,]+\.?\d*)/);
      if (match) return parseFloat(match[1].replace(',', ''));
      el = el.parentElement;
    }
    return null;
  }

  parseHref(href) {
    try {
      const url = new URL(href);
      const match = url.pathname.match(/\/pin\/(\d+)/);
      if (match) return { pinId: match[1] };
    } catch {}
    return null;
  }
}
