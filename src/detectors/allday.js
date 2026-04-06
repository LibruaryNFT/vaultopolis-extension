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

    // Group links by momentId — one card often has multiple links
    // (media image link, details link, buy-now button). We want only the
    // media link so the overlay appears over the image, not the details area.
    const byMomentId = new Map();
    for (const link of links) {
      const ids = this.parseHref(link.href);
      if (!ids) continue;
      if (!byMomentId.has(ids.momentId)) byMomentId.set(ids.momentId, []);
      byMomentId.get(ids.momentId).push(link);
    }

    for (const [momentId, candidates] of byMomentId) {
      // Prefer a link that wraps an img or video (the media area)
      const mediaLink = candidates.find(l => l.querySelector('img, video'));
      // Fall back to first non-buy-now link
      const target = mediaLink
        || candidates.find(l => !this.isBuyNowLink(l))
        || candidates[0];

      if (!target || seen.has(target)) continue;
      seen.add(target);

      const playerName = this.findPlayerName(target);
      const listingPrice = this.findPrice(target);

      results.push({
        element: target,
        editionId: momentId,
        playerName,
        listingPrice,
      });
    }

    return results;
  }

  isBuyNowLink(link) {
    const text = (link.textContent || '').toLowerCase().trim();
    return text.includes('buy now') || text.includes('select and buy') || text.includes('make offer');
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
