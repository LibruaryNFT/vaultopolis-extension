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
      if (link.closest('.vp-pill-overlay')) continue;
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

      if (!target) continue;

      // Walk up to the visual card container (Chakra LinkBox or ancestor with real dimensions)
      const card = this.findCardContainer(target);
      if (seen.has(card)) continue;
      seen.add(card);

      const playerName = this.findPlayerName(card);
      const listingPrice = this.findPrice(card);

      results.push({
        element: card,
        editionId: momentId,
        playerName,
        listingPrice,
      });
    }

    console.log(`[VP:AllDay] scan — links found: ${links.length}, cards resolved: ${results.length}, url: ${window.location.pathname}`);
    if (results.length > 0) {
      const f = results[0];
      console.log(`[VP:AllDay] First card — id: ${f.editionId}, name: ${f.playerName}, price: ${f.listingPrice}`);
    }
    return results;
  }

  /**
   * Walk up from <a> to the visual card container.
   */
  findCardContainer(link) {
    const linkbox = link.closest('.chakra-linkbox');
    if (linkbox) return linkbox;

    let el = link.parentElement;
    for (let i = 0; i < 6 && el; i++) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) return el;
      el = el.parentElement;
    }
    return link;
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
