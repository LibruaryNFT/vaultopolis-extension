/**
 * Top Shot edition detector.
 *
 * Finds edition/moment elements on nbatopshot.com and extracts identifiers.
 *
 * Top Shot is a React SPA (Next.js + Chakra UI). Cards use Chakra LinkBox:
 * the <a> link is a 0x0 overlay (chakra-linkbox__overlay) inside the card.
 * The visual card container is .chakra-linkbox with real dimensions.
 *
 * STRATEGY: Find <a> links with /listings/p2p/ URLs, walk up to .chakra-linkbox
 * card container, extract IDs from href, player name from card text nodes.
 * Player names may be split across separate text nodes (combined via fragments).
 *
 * Last verified: April 2026 (Playwright DOM inspection)
 */

// Text that looks like a player name but isn't
const NOT_NAMES = new Set([
  'lowest ask', 'avg sale', 'top shot', 'all day', 'see details',
  'view listing', 'view all', 'buy now', 'make offer', 'place bid', 'owned count',
  'serial number', 'edition size', 'burned count', 'listed count',
  'lowest price', 'highest price', 'for sale', 'not listed',
  'common', 'fandom', 'rare', 'legendary', 'ultimate',
  // Tier/edition badge abbreviations
  'le', 're', 'ue', 'ce', 'fe', 'ge',
  'burned', 'supply', 'jump shot', 'top shot this',
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

      // TopShot uses Chakra LinkBox: the <a> is a 0x0 overlay inside the
      // card container. Walk up to the .chakra-linkbox (or first ancestor
      // with real dimensions) so hover detection via elementsFromPoint works.
      const card = this.findCardContainer(link);
      if (seen.has(card)) continue;
      seen.add(card);

      const playerName = this.findPlayerName(card);
      const listingPrice = this.findPrice(card);
      const supply = this.findSupply(card);

      results.push({
        element: card,
        setId: ids.setId || null,
        playId: ids.playId || null,
        setUuid: ids.setUuid || null,
        playUuid: ids.playUuid || null,
        parallelID: ids.parallelID || null,
        playerName,
        listingPrice,
        supply,
      });
    }

    return results;
  }

  /**
   * Walk up from the <a> link to find the visual card container.
   * Chakra LinkBox: <a class="chakra-linkbox__overlay"> is 0x0;
   * the parent .chakra-linkbox has the real card dimensions.
   * Falls back to first ancestor with width > 100px.
   */
  findCardContainer(link) {
    // Try .chakra-linkbox first (Chakra UI LinkBox pattern)
    const linkbox = link.closest('.chakra-linkbox');
    if (linkbox) return linkbox;

    // Fallback: walk up to find an ancestor with real dimensions
    let el = link.parentElement;
    for (let i = 0; i < 6 && el; i++) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) return el;
      el = el.parentElement;
    }

    // Last resort: return link itself
    return link;
  }

  /**
   * Find player name text inside an element.
   * Skips common non-name text like "Lowest Ask", "Avg Sale", etc.
   *
   * TopShot may split first/last name across separate text nodes
   * (e.g. "Nikola" + "Jokić" in adjacent nodes). Try single nodes
   * first, then combine consecutive short capitalized fragments.
   */
  findPlayerName(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const fragments = []; // collect short capitalized text nodes for combining

    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();

      // Direct match (single node contains full name)
      if (this.looksLikePlayerName(text)) return text;

      // Collect short capitalized fragments for combining (min 3 chars to skip tier badges like "LE")
      if (text.length >= 3 && text.length <= 20 && /^[A-ZÀ-Ž]/.test(text) &&
          !NOT_NAMES.has(text.toLowerCase())) {
        fragments.push(text);
      }
    }

    // Try combining consecutive fragments (e.g. "Nikola" + "Jokić")
    for (let i = 0; i < fragments.length - 1; i++) {
      const combined = fragments[i] + ' ' + fragments[i + 1];
      if (this.looksLikePlayerName(combined)) return combined;
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
    // Must be 2-4 words, each starting with uppercase (including accented chars)
    return /^[A-ZÀ-Ž][a-zA-ZÀ-ž'.]+(\s+(Jr\.|Sr\.|II|III|IV|[A-ZÀ-Ž][a-zA-ZÀ-ž'.]+)){1,3}$/.test(text);
  }

  /**
   * Extract supply count from card text.
   * TopShot cards show "Supply: 2,654" or "/2666" (tier/supply format).
   */
  findSupply(element) {
    const text = element.textContent || '';
    // Match "Supply: 2,654" or "Supply:2654"
    const supplyMatch = text.match(/Supply:\s*([\d,]+)/);
    if (supplyMatch) return parseInt(supplyMatch[1].replace(/,/g, ''), 10);
    // Match "/2666" (tier badge format like "Fandom/2666")
    const slashMatch = text.match(/\/([\d,]+)\s*(?:LE|RE|UE|CE|FE|GE)/);
    if (slashMatch) return parseInt(slashMatch[1].replace(/,/g, ''), 10);
    return null;
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
