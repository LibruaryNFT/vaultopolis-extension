/**
 * Disney Pinnacle pin detector.
 *
 * Multi-strategy detection — does not depend on specific CSS framework classes
 * or exact URL patterns. Logs diagnostics to console with [VP:Pinnacle] prefix.
 *
 * Strategy order:
 * 1. Known href patterns (/pin/, /collectible/, /listing/, /item/, /edition/)
 * 2. Any <a> with a numeric segment in its path on disneypinnacle.com
 * 3. Card container via .chakra-linkbox → named card/tile/pin classes → dimension walk
 */

const NOT_NAMES = new Set([
  'marketplace', 'trade', 'releases', 'news', 'pinbooks',
  'sign up', 'sign in', 'log in', 'buy now', 'make offer',
  'listed digital pins only', 'newest listings', 'lowest price', 'highest price',
  'pin names', 'edition types', 'sort by', 'status',
]);

// URL segments that indicate a pin/collectible detail page
const PIN_SEGMENTS = ['pin', 'collectible', 'listing', 'item', 'edition'];
const PIN_PATH_RE = new RegExp(`/(${PIN_SEGMENTS.join('|')})/(\\d+)`);

export class PinnacleDetector {
  constructor() {
    this._diagRun = 0;
  }

  findEditionElements() {
    const results = [];
    const seen = new WeakSet();
    this._diagRun++;

    // ── Strategy 1: broad href selector ─────────────────────────────────────
    const selectorLinks = document.querySelectorAll(
      PIN_SEGMENTS.map(s => `a[href*="/${s}/"]`).join(', ')
    );

    // ── Strategy 2: all <a> tags, filter by numeric path segment ────────────
    const allLinks = document.querySelectorAll('a[href]');
    const linkSet = new Set(selectorLinks);
    for (const a of allLinks) {
      try {
        const url = new URL(a.href);
        if (url.hostname.includes('disneypinnacle.com') && PIN_PATH_RE.test(url.pathname)) {
          linkSet.add(a);
        }
      } catch { /* malformed href */ }
    }

    const diagTotal = linkSet.size;

    for (const link of linkSet) {
      // Skip links injected by our own overlay (e.g. View Listing button)
      if (link.closest('.vp-pill-overlay')) continue;
      const ids = this.parseHref(link.href);
      if (!ids) continue;

      const card = this.findCardContainer(link);
      if (seen.has(card)) continue;
      seen.add(card);

      const pinName = this.findPinName(card);
      const listingPrice = this.findPrice(card);

      results.push({
        element: card,
        editionId: ids.pinId,
        playerName: pinName,
        listingPrice,
      });
    }

    // ── Diagnostic output (always — helps debug without DevTools filter) ─────
    console.log(
      `[VP:Pinnacle] scan #${this._diagRun} — links found: ${diagTotal}, ` +
      `cards resolved: ${results.length}, url: ${window.location.pathname}`
    );

    if (diagTotal === 0) {
      // Log a sample of all <a> hrefs so we can see what URL patterns the page uses
      const sample = [...document.querySelectorAll('a[href]')]
        .slice(0, 30)
        .map(a => { try { return new URL(a.href).pathname; } catch { return a.getAttribute('href'); } })
        .filter(Boolean);
      console.log('[VP:Pinnacle] No pin links found. Sample <a> hrefs on page:', sample);
    }

    if (results.length > 0) {
      const first = results[0];
      console.log(`[VP:Pinnacle] First card — id: ${first.editionId}, name: ${first.playerName}, price: ${first.listingPrice}`);
    }

    return results;
  }

  /**
   * Walk up from <a> to the visual card container.
   * Tries multiple strategies before falling back to dimension-based detection.
   */
  findCardContainer(link) {
    // 1. Chakra UI linkbox (original)
    const linkbox = link.closest('.chakra-linkbox');
    if (linkbox) return linkbox;

    // 2. Common card/tile/pin class name fragments (framework-agnostic)
    const cardKeywords = ['card', 'Card', 'tile', 'Tile', 'pin', 'Pin', 'item', 'Item', 'collectible', 'Collectible'];
    for (const kw of cardKeywords) {
      const el = link.closest(`[class*="${kw}"]`);
      if (el && el !== document.body && el !== document.documentElement) {
        const rect = el.getBoundingClientRect();
        // Card should be a small-ish square/portrait element, not the whole page
        if (rect.width > 80 && rect.width < 700 && rect.height > 80) return el;
      }
    }

    // 3. data-testid / role attributes common in React/testing-library apps
    const testIdEl = link.closest('[data-testid], [role="article"], [role="listitem"]');
    if (testIdEl && testIdEl !== document.body) {
      const rect = testIdEl.getBoundingClientRect();
      if (rect.width > 80 && rect.height > 80) return testIdEl;
    }

    // 4. Walk up by dimension — collect all card-sized candidates, then prefer
    //    the first one with multiple direct children (image wrapper has 1 child;
    //    the real card container has image section + info section = 2+ children)
    const candidates = [];
    let el = link.parentElement;
    for (let i = 0; i < 12 && el && el !== document.body; i++) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 80 && rect.width < 700 && rect.height > 80) candidates.push(el);
      el = el.parentElement;
    }
    for (const c of candidates) {
      if (c.childElementCount > 1) return c;
    }
    if (candidates.length > 0) return candidates[0];

    return link;
  }

  findPinName(element) {
    // Prefer alt text on images (Pinnacle puts character name in img alt)
    const img = element.querySelector('img[alt]');
    if (img?.alt && img.alt.length > 2 && img.alt.length < 80) {
      const alt = img.alt.trim();
      if (!NOT_NAMES.has(alt.toLowerCase())) return alt;
    }

    // Text nodes — any reasonably-sized capitalized string
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text.length >= 3 && text.length <= 80 && !NOT_NAMES.has(text.toLowerCase())) {
        if (/^[A-Z]/.test(text)) return text;
      }
    }
    return null;
  }

  findPrice(element) {
    // Search the card's own text content (includes all descendants)
    const text = element.textContent || '';
    // Match: "Buy for $1.00", "$5", "USD 4.99", "4.99 USD"
    const patterns = [
      /(?:Buy for\s*)?\$\s*([\d,]+\.?\d*)/,
      /USD\s*([\d,]+\.?\d*)/i,
      /([\d,]+\.?\d*)\s*USD/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        const val = parseFloat(m[1].replace(',', ''));
        if (val > 0 && val < 100000) return val;
      }
    }

    // Walk a few levels up (price text sometimes lives outside the card container)
    let el = element.parentElement;
    for (let i = 0; i < 3 && el && el !== document.body; i++) {
      for (const re of patterns) {
        const m = (el.textContent || '').match(re);
        if (m) {
          const val = parseFloat(m[1].replace(',', ''));
          if (val > 0 && val < 100000) return val;
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  parseHref(href) {
    try {
      const url = new URL(href);
      const match = url.pathname.match(PIN_PATH_RE);
      if (match) return { pinId: match[2] };
    } catch {}
    return null;
  }

  _debugParentChain(el) {
    if (!el) return [];
    const chain = [];
    let cur = el.parentElement;
    for (let i = 0; i < 8 && cur && cur !== document.body; i++) {
      const rect = cur.getBoundingClientRect();
      chain.push(`${cur.tagName.toLowerCase()}.${(cur.className || '').slice(0, 60)} [${Math.round(rect.width)}x${Math.round(rect.height)}]`);
      cur = cur.parentElement;
    }
    return chain;
  }
}
