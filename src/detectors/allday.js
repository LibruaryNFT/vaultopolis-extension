/**
 * NFL All Day edition detector.
 *
 * URL patterns (verified March 2026):
 * - /listing/moment/{momentId}  — marketplace listing card
 * - /marketplace/moments        — search page
 *
 * The momentId in the URL maps to our API's edition data.
 */

const NOT_NAMES = new Set([
  'lowest ask', 'avg sale', 'all day', 'buy now', 'make offer',
  'view listing', 'view all', 'for sale', 'not listed', 'back to marketplace',
  'common', 'rare', 'legendary', 'ultimate', 'select and buy',
  'listed for sale', 'total supply', 'top sale', 'log in', 'sign up',
]);

export class AllDayDetector {
  findEditionElements() {
    const results = [];
    const seen = new WeakSet();

    const links = document.querySelectorAll('a[href*="/listing/moment/"]');

    for (const link of links) {
      const ids = this.parseHref(link.href);
      if (!ids) continue;
      if (seen.has(link)) continue;
      seen.add(link);

      const playerName = this.findPlayerName(link);
      const listingPrice = this.findPrice(link);

      results.push({
        element: link,
        editionId: ids.momentId,
        playerName,
        listingPrice,
      });
    }

    return results;
  }

  findPlayerName(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (this.looksLikePlayerName(text)) return text;
    }
    return null;
  }

  looksLikePlayerName(text) {
    if (!text || text.length < 4 || text.length > 40) return false;
    if (NOT_NAMES.has(text.toLowerCase())) return false;
    return /^[A-Z][a-zA-Z'.]+(\s+(Jr\.|Sr\.|II|III|IV|[A-Z][a-zA-Z'.]+)){1,3}$/.test(text);
  }

  findPrice(element) {
    let el = element;
    for (let i = 0; i < 4 && el && el !== document.body; i++) {
      const match = (el.textContent || '').match(/\$\s*([\d,]+\.?\d*)/);
      if (match) return parseFloat(match[1].replace(',', ''));
      el = el.parentElement;
    }
    return null;
  }

  parseHref(href) {
    try {
      const url = new URL(href);
      const match = url.pathname.match(/\/listing\/moment\/(\d+)/);
      if (match) return { momentId: match[1] };
    } catch {}
    return null;
  }
}
