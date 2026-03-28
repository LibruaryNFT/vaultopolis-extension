/**
 * Top Shot edition detector.
 *
 * Finds edition/moment elements on nbatopshot.com and extracts identifiers.
 *
 * Top Shot is a React SPA (Next.js + Chakra UI). Cards render via EditionCard
 * component. The card is wrapped in an <a> link with href /listings/p2p/{setId}+{playId}.
 * Inside the card, .card-content and .card-rarity are real CSS classes.
 *
 * PRIMARY STRATEGY: Find <a> links with /listings/p2p/ URLs, extract IDs from href.
 * FALLBACK: Find .card-content elements and walk up to parent <a>.
 *
 * Last verified: March 2026 (from live console logs)
 */

// Text that looks like a player name but isn't
const NOT_NAMES = new Set([
  'lowest ask', 'avg sale', 'top shot', 'all day', 'see details',
  'view listing', 'view all', 'buy now', 'make offer', 'place bid', 'owned count',
  'serial number', 'edition size', 'burned count', 'listed count',
  'lowest price', 'highest price', 'for sale', 'not listed',
  'common', 'fandom', 'rare', 'legendary', 'ultimate',
]);

export class TopShotDetector {
  /**
   * Find all edition-related elements on the current page.
   * Returns array of { element, setId, playId, playerName, listingPrice }.
   */
  findEditionElements() {
    const results = [];
    const seen = new WeakSet();

    // PRIMARY: Find all <a> links that point to edition listing pages.
    // These have the setId+playId right in the URL.
    const links = document.querySelectorAll('a[href*="/listings/p2p/"], a[href*="/edition/"]');

    for (const link of links) {
      const ids = this.parseHref(link.href);
      if (!ids) continue;

      // The <a> itself is the hoverable card element.
      // Don't go up further — the link IS the card boundary.
      if (seen.has(link)) continue;
      seen.add(link);

      const playerName = this.findPlayerName(link);
      const listingPrice = this.findPrice(link);

      results.push({
        element: link,
        setId: ids.setId || null,
        playId: ids.playId || null,
        setUuid: ids.setUuid || null,
        playUuid: ids.playUuid || null,
        parallelID: ids.parallelID || null,
        playerName,
        listingPrice,
      });
    }

    // FALLBACK: If no listing links found, try .card-content elements
    // and walk up to find a parent <a> with IDs.
    if (results.length === 0) {
      const cards = document.querySelectorAll('.card-content');
      for (const card of cards) {
        if (seen.has(card)) continue;

        // Walk up to find the wrapping <a> tag
        let el = card;
        let link = null;
        for (let i = 0; i < 10 && el; i++) {
          if (el.tagName === 'A' && el.href) {
            link = el;
            break;
          }
          el = el.parentElement;
        }

        const target = link || card;
        if (seen.has(target)) continue;
        seen.add(target);

        const ids = link ? this.parseHref(link.href) : null;
        const playerName = this.findPlayerName(target);
        const listingPrice = this.findPrice(target);

        if ((ids?.setId && ids?.playId) || playerName) {
          results.push({
            element: target,
            setId: ids?.setId || null,
            playId: ids?.playId || null,
            playerName,
            listingPrice,
          });
        }
      }
    }

    return results;
  }

  /**
   * Find player name text inside an element.
   * Skips common non-name text like "Lowest Ask", "Avg Sale", etc.
   */
  findPlayerName(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (this.looksLikePlayerName(text)) {
        return text;
      }
    }
    return null;
  }

  /**
   * Check if text looks like a player name.
   * Must be 2-4 capitalized words, not a known UI label.
   */
  looksLikePlayerName(text) {
    if (!text || text.length < 4 || text.length > 40) return false;
    if (NOT_NAMES.has(text.toLowerCase())) return false;
    // Must be 2-4 words, each starting with uppercase
    return /^[A-Z][a-zA-Z'.]+(\s+(Jr\.|Sr\.|II|III|IV|[A-Z][a-zA-Z'.]+)){1,3}$/.test(text);
  }

  /**
   * Find the listing price from the card.
   * Top Shot renders "USD $2.00" in the parent container of the <a> link.
   * We search the link's parent chain up to 4 levels.
   */
  findPrice(element) {
    let el = element;
    for (let i = 0; i < 4 && el && el !== document.body; i++) {
      const text = el.textContent || '';
      // Match "USD $X.XX" — the first occurrence is the listing price
      const match = text.match(/USD\s*\$?([\d,]+\.?\d*)/);
      if (match) return parseFloat(match[1].replace(',', ''));
      el = el.parentElement;
    }
    return null;
  }

  /**
   * Parse a Top Shot URL for edition identifiers.
   *
   * URL patterns:
   * - /listings/p2p/{setId}+{playId}
   * - /listings/p2p/{setId}+{playId}?parallelID=X
   * - /edition/{setId}+{playId}
   * - ?setID=X&playID=Y (older format)
   */
  parseHref(href) {
    try {
      const url = new URL(href);

      // Query params (older format)
      const qSetId = url.searchParams.get('setID') || url.searchParams.get('set_id');
      const qPlayId = url.searchParams.get('playID') || url.searchParams.get('play_id');
      if (qSetId && qPlayId) return { setId: qSetId, playId: qPlayId };

      // parallelID query param (maps to subedition)
      const parallelID = url.searchParams.get('parallelID') || null;

      // Path: /listings/p2p/{setUuid}+{playUuid} (current format — UUIDs)
      const uuidMatch = url.pathname.match(/\/(?:listings\/p2p|edition)\/([\w-]{36})\+([\w-]{36})/);
      if (uuidMatch) return { setUuid: uuidMatch[1], playUuid: uuidMatch[2], parallelID };

      // Path: /listings/p2p/{setId}+{playId} (numeric fallback)
      const numMatch = url.pathname.match(/\/(?:listings\/p2p|edition)\/(\d+)\+(\d+)/);
      if (numMatch) return { setId: numMatch[1], playId: numMatch[2], parallelID };
    } catch {
      // invalid URL
    }
    return null;
  }
}
