/**
 * Card pill badge — small pill on each card showing floor price.
 * Click to expand full analytics overlay, click again to collapse.
 *
 * Replaces the old hover tooltip + always-on overlay with progressive disclosure:
 * - Default: card art visible, small pill badge in top-right corner
 * - Expanded: full analytics overlay covers card (click to collapse)
 *
 * Uses IntersectionObserver to only process visible cards.
 */

/** Escape HTML special chars to prevent XSS in innerHTML */
function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Validate that a URL uses http or https — returns null for any other scheme */
function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? url : null;
  } catch {
    return null;
  }
}

/** Format an ISO timestamp as "Apr 23" — short month + day */
function fmtShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format a USD value, smart precision (no decimals on round dollars >$10) */
function fmtUsd(v) {
  if (v == null || v <= 0) return null;
  const n = Number(v);
  const decimals = (n >= 10 && n % 1 === 0) ? 0 : 2;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** Normalize TopShot/AllDay/Pinnacle marketplace string to {abbr, color} */
function marketplaceTag(raw) {
  if (!raw) return { abbr: '?', color: '#6b7280' };
  const s = String(raw).toLowerCase();
  if (s.includes('opensea')) return { abbr: 'OS', color: '#3b82f6' };
  if (s.includes('flowty')) return { abbr: 'Flw', color: '#14b8a6' };
  if (s.includes('offer')) return { abbr: 'Off', color: '#a855f7' };
  if (s.includes('dapper')) return { abbr: 'Dap', color: '#22c55e' };
  return { abbr: s.slice(0, 3), color: '#6b7280' };
}

/** Build inline SVG sparkline from a price array (chronological asc). */
function buildSparkline(prices, width = 200, height = 32) {
  if (!Array.isArray(prices) || prices.length < 2) return '';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const stepX = width / (prices.length - 1);
  const points = prices.map((p, i) => {
    const x = (i * stepX).toFixed(1);
    const y = (height - ((p - min) / range) * height).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  const slope = prices[prices.length - 1] - prices[0];
  const stroke = slope >= 0 ? '#22c55e' : '#ef4444';
  const lastX = ((prices.length - 1) * stepX).toFixed(1);
  const lastY = (height - ((prices[prices.length - 1] - min) / range) * height).toFixed(1);
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block">
    <polyline fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" points="${points}"/>
    <circle cx="${lastX}" cy="${lastY}" r="2" fill="${stroke}"/>
  </svg>`;
}

/** Build a stacked horizontal bar showing top holders vs total supply.
 *  holders: [{wallet_address, count}], sorted desc.  supply: total existing supply.
 *  Returns HTML for a fixed-height bar with up to 5 segments + remainder. */
function buildHolderBar(holders, supply) {
  if (!Array.isArray(holders) || !holders.length || !supply) return '';
  const top = holders.slice(0, 5);
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
  const segs = top.map((h, i) => {
    const pct = (h.count / supply) * 100;
    return `<div title="${escAttr(h.wallet_address || '')}: ${h.count} (${pct.toFixed(1)}%)" style="height:100%;width:${pct.toFixed(2)}%;background:${colors[i]}"></div>`;
  });
  const topSum = top.reduce((a, b) => a + b.count, 0);
  const remPct = Math.max(0, ((supply - topSum) / supply) * 100);
  if (remPct > 0) {
    segs.push(`<div title="Other holders" style="height:100%;width:${remPct.toFixed(2)}%;background:rgba(120,120,140,0.4)"></div>`);
  }
  return `<div style="display:flex;height:8px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.05);margin-top:2px">${segs.join('')}</div>`;
}

export class CardPill {
  constructor(product) {
    this.product = product;
    this.observer = null;
    this.pills = new WeakMap();  // element → { pill, overlay, expanded }
    this.logoUrl = chrome.runtime.getURL('assets/logo.svg');
    this.iconUrl = chrome.runtime.getURL('assets/VaultopolisIcon.svg');
  }

  init() {
    this._startObserver();
    this._installInputFocusSuppression();
  }

  /**
   * Hide pills + overlays while the user is interacting with a text input,
   * search box, or combobox. Sites' autocomplete/suggestion dropdowns often
   * render at lower z-index than our pills (z-index: 10), so without this
   * the pills paint on top of the dropdown (TopShot marketplace search).
   * Capture-phase listeners catch focus events even from inputs in shadow
   * roots / portaled popovers.
   */
  _installInputFocusSuppression() {
    if (document.getElementById('vp-input-suppress')) return;
    const style = document.createElement('style');
    style.id = 'vp-input-suppress';
    style.textContent = `
      html.vp-input-active .vp-pill,
      html.vp-input-active .vp-pill-overlay { visibility: hidden !important; }
    `;
    document.head.appendChild(style);

    const isInteractive = (el) =>
      !!el && typeof el.matches === 'function' && el.matches(
        'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]),' +
        'textarea,' +
        '[role="combobox"],' +
        '[role="searchbox"],' +
        '[role="textbox"],' +
        '[contenteditable="true"]'
      );

    document.addEventListener('focusin', (e) => {
      if (isInteractive(e.target)) document.documentElement.classList.add('vp-input-active');
    }, true);

    document.addEventListener('focusout', () => {
      // Defer so a click on a dropdown item (which moves focus) doesn't flicker pills back.
      setTimeout(() => {
        if (!isInteractive(document.activeElement)) {
          document.documentElement.classList.remove('vp-input-active');
        }
      }, 200);
    }, true);
  }

  /** Register a card element for pill rendering.
   * Unobserve first so recycled elements (same node, new content) re-trigger the IO. */
  observe(element) {
    if (this.observer) {
      this.observer.unobserve(element);
      this.observer.observe(element);
    }
  }

  _startObserver() {
    if (this.observer) return;
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this._showPill(entry.target);
        }
      }
    }, { rootMargin: '200px' });
  }

  async _showPill(el) {
    if (!el._vpData) return;
    const { editionId } = el._vpData;

    // For recycled nodes (same DOM element, new content), clean up the stale pill.
    const existing = this.pills.get(el);
    if (existing) {
      if (existing.editionId === editionId) return; // same content, already rendered
      existing.pill.remove();
      existing.overlay?.remove();
      this.pills.delete(el);
    }

    const { setId, playId, setUuid, playUuid, parallelID, listingPrice, listingUrl, supply, parallelHint } = el._vpData;

    // ── Step 1: Position container and create pill immediately (synchronous) ──
    // Don't await the API before creating DOM — React SPAs re-render elements
    // during async waits, causing isConnected to be false when we try to append.
    const container = el;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const pill = document.createElement('div');
    pill.className = 'vp-pill';
    pill.style.cssText = `
      position: absolute;
      top: 40px;
      left: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(10, 10, 24, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(120, 120, 140, 0.35);
      border-radius: 16px;
      padding: 4px 8px 4px 5px;
      cursor: pointer;
      z-index: 10;
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: #e0e0e0;
      line-height: 1;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      user-select: none;
      white-space: nowrap;
    `;

    const vIcon = document.createElement('img');
    vIcon.src = this.iconUrl;
    vIcon.className = 'vp-icon';
    vIcon.style.cssText = 'height: 14px; width: 14px; flex-shrink: 0; pointer-events: none;';
    vIcon.alt = 'V';

    const priceText = document.createElement('span');
    priceText.textContent = '--';
    priceText.style.cssText = 'color: #7070a0; pointer-events: none;';

    pill.appendChild(vIcon);
    pill.appendChild(priceText);

    pill.addEventListener('mouseenter', () => {
      pill.style.transform = 'scale(1.08)';
      pill.style.boxShadow = '0 0 8px rgba(99, 102, 241, 0.5)';
    });
    pill.addEventListener('mouseleave', () => {
      pill.style.transform = 'scale(1)';
      pill.style.boxShadow = 'none';
    });

    const overlay = this._createOverlay(el, listingUrl);
    const state = { pill, overlay, expanded: false, editionId };
    this.pills.set(el, state);

    pill.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.expanded) {
        this._collapse(state);
      } else {
        pill.style.display = 'none';
        this._expand(el, state);
      }
    });

    try { container.appendChild(pill); } catch { this.pills.delete(el); return; }

    // ── Step 2: Show DOM price immediately (grey) so pill is never blank ─────
    if (listingPrice && listingPrice > 0) {
      const n = Number(listingPrice);
      priceText.textContent = `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}`;
      priceText.style.color = '#94a3b8';
    }

    // ── Step 3: Upgrade to index price (purple) when SW responds ─────────────
    // 8s timeout covers SW cold-start (~3s) + index fetch (~1s) with headroom.
    try {
      const resp = await Promise.race([
        chrome.runtime.sendMessage({
          action: 'indexLookup',
          market: this.product,
          setUuid, playUuid, setId, playId, parallelID, editionId, supply, parallelHint,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
      if (resp?.success && pill.isConnected) {
        // Stash resolved editionId so _expand uses the fast direct-fetch path
        // (the SW already does the complex subedition/UUID resolution here)
        if (resp.editionId && !el._vpData.editionId) {
          el._vpData.editionId = resp.editionId;
        }
        if (resp.data) {
          const ev = resp.data.ev;
          const fp = resp.data.fp;
          const price = (ev != null && ev > 0) ? ev : fp;
          if (price > 0) {
            const n = Number(price);
            priceText.textContent = `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}`;
            priceText.style.color = '#a5b4fc';
            pill.style.borderColor = 'rgba(99, 102, 241, 0.4)';
          }
        }
      }
    } catch { /* keep DOM price */ }
  }

  _createOverlay(el, listingUrl) {
    const overlay = document.createElement('div');
    overlay.className = 'vp-pill-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(
        to bottom,
        rgba(10, 10, 24, 0.93) 0%,
        rgba(10, 10, 24, 0.55) 38%,
        rgba(10, 10, 24, 0.55) 62%,
        rgba(10, 10, 24, 0.93) 100%
      );
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #e0e0e0;
      padding: 8px 10px;
      box-sizing: border-box;
      display: none;
      flex-direction: column;
      z-index: 20;
      pointer-events: auto;
      border-radius: 6px;
      opacity: 0;
      transition: opacity 0.15s ease;
      overflow-y: auto;
      overflow-x: hidden;
    `;

    // Loading state
    overlay.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;background:rgba(10,10,24,0.5);border-radius:4px;padding:2px 4px">
        <img src="${this.iconUrl}" style="height:14px;width:14px;flex-shrink:0" alt="V">
        <button class="vp-pill-close" style="background:none;border:none;color:#8b8bab;font-size:16px;cursor:pointer;padding:0 2px;line-height:1;font-family:inherit">&times;</button>
      </div>
      <div class="vp-pill-body" style="flex:1;display:flex;align-items:center;justify-content:center">
        <div style="color:#6366f1;font-size:12px;text-shadow:0 1px 3px rgba(0,0,0,0.9)">Loading analytics...</div>
      </div>
    `;

    return overlay;
  }

  async _expand(el, state) {
    const { pill, overlay } = state;
    state.expanded = true;

    // Show overlay inside the card container — clip overflow so it can't bleed
    const container = el;
    if (!overlay.parentElement) container.appendChild(overlay);
    container.style.overflow = 'hidden';
    overlay.style.display = 'flex';
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    // Hide pill while expanded
    pill.style.display = 'none';

    // Wire close button
    const closeBtn = overlay.querySelector('.vp-pill-close');
    if (closeBtn && !closeBtn._wired) {
      closeBtn._wired = true;
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._collapse(state);
      });
    }

    const { editionId, playerName, setId, playId, setUuid, playUuid, parallelID, listingPrice, listingUrl, supply, parallelHint } = el._vpData;

    // ── Show DOM-scraped data immediately so overlay is never blank ───────────
    const fmtListing = (v) => v ? `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: Number(v) % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}` : null;
    const rowStyle = 'display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(45,45,74,0.4);text-shadow:0 1px 3px rgba(0,0,0,0.9)';
    const labelStyle = 'color:#b0b3c8;font-size:12px';
    const valStyle = 'font-weight:600;font-size:13px;color:#f0f0f0';

    let quickRows = '';
    if (playerName && playerName !== 'null') quickRows += `<div style="${rowStyle}"><span style="${labelStyle}">Pin</span><span style="${valStyle}">${escAttr(String(playerName))}</span></div>`;
    if (editionId) quickRows += `<div style="${rowStyle}"><span style="${labelStyle}">Edition</span><span style="${valStyle}">#${escAttr(String(editionId))}</span></div>`;
    const lp = fmtListing(listingPrice);
    if (lp) quickRows += `<div style="${rowStyle}"><span style="${labelStyle}">Listed</span><span style="font-weight:600;font-size:13px;color:#94a3b8">${escAttr(lp)}</span></div>`;

    const body = overlay.querySelector('.vp-pill-body');
    body.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;padding:2px 0;';
    body.innerHTML = `
      ${quickRows}
      <div class="vp-loading-indicator" style="color:#6366f1;font-size:11px;margin-top:6px;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,0.9)">Loading analytics...</div>
    `;

    // ── Fetch full details ────────────────────────────────────────────────────
    // Content scripts can call fetch() cross-origin directly when the extension
    // has host_permissions for the target origin (see manifest.json).
    // This bypasses the MV3 service worker entirely, avoiding SW termination
    // race conditions that cause sendResponse to silently drop.
    //
    // Direct fetch: use when editionId is already known (Pinnacle, AllDay).
    // SW path: TopShot only — needs UUID→editionId resolution from the index.
    const fetchAttempt = async (timeoutMs) => {
      if (editionId) {
        const apiResp = await Promise.race([
          fetch(`https://api.vaultopolis.com/extension/v1/details/${this.product}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [String(editionId)] }),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
        ]);
        if (!apiResp.ok) throw new Error(`HTTP ${apiResp.status}`);
        const data = await apiResp.json();
        const ed = (data.editions || [])[0] || null;
        return { success: true, data: ed };
      }
      return Promise.race([
        chrome.runtime.sendMessage({
          action: 'lookupOne',
          market: this.product,
          setUuid, playUuid, setId, playId, parallelID, editionId, supply, parallelHint,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
      ]);
    };

    // Two attempts: short first try catches warm SW; longer retry covers cold start.
    const attempts = [
      { timeout: 6000, retryLabel: null },
      { timeout: 10000, retryLabel: 'Retrying analytics…' },
    ];
    for (let i = 0; i < attempts.length; i++) {
      const { timeout, retryLabel } = attempts[i];
      if (retryLabel && state.expanded) {
        const loadingEl = body.querySelector('.vp-loading-indicator');
        if (loadingEl) loadingEl.textContent = retryLabel;
      }
      try {
        const resp = await fetchAttempt(timeout);
        if (!state.expanded) return;
        if (resp?.success && resp.data) {
          this._renderDetails(overlay, resp.data, listingPrice, listingUrl);
          return;
        }
        // resp returned but had no data — break out and render fallback
        break;
      } catch {
        if (i === attempts.length - 1) break;
        // else: try again
      }
    }

    // ── Fallback: SW/API unavailable — show DOM data + best-effort analytics link ─
    if (!state.expanded) return;
    const loadingEl = body.querySelector('.vp-loading-indicator');
    if (loadingEl) loadingEl.remove();

    // Construct best-effort Full Analytics URL from DOM data so users always have an out
    const fallbackAnalyticsUrl = (() => {
      if (this.product === 'topshot' && setId && playId) {
        return `https://vaultopolis.com/analytics/topshot/edition/${setId}/${playId}`;
      }
      if ((this.product === 'allday' || this.product === 'pinnacle') && editionId) {
        return `https://vaultopolis.com/analytics/${this.product}/edition/${editionId}`;
      }
      return 'https://vaultopolis.com';
    })();

    const buttons = [];
    if (safeUrl(listingUrl)) {
      buttons.push(`<a href="${escAttr(listingUrl)}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:rgba(99,102,241,0.9);color:#fff;border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">View Listing</a>`);
    }
    buttons.push(`<a href="${escAttr(fallbackAnalyticsUrl)}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:rgba(10,10,24,0.6);color:#a5b4fc;border:1px solid rgba(99,102,241,0.6);border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">Full Analytics</a>`);

    const linkDiv = document.createElement('div');
    linkDiv.style.cssText = 'display:flex;gap:6px;padding-top:6px;margin-top:4px;border-top:1px solid rgba(45,45,74,0.6);flex-shrink:0;';
    linkDiv.innerHTML = buttons.join('');
    body.appendChild(linkDiv);
  }

  _collapse(state) {
    state.expanded = false;
    state.overlay.style.opacity = '0';
    setTimeout(() => {
      state.overlay.style.display = 'none';
      // Restore container overflow so card hover effects work normally
      if (state.overlay.parentElement) {
        state.overlay.parentElement.style.overflow = '';
      }
    }, 150);
    state.pill.style.display = 'flex';
  }

  _renderDetails(overlay, ed, listingPrice, listingUrl) {
    const row = (label, value, valueColor) =>
      value != null && value !== ''
        ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(45,45,74,0.4);text-shadow:0 1px 3px rgba(0,0,0,0.9)">
             <span style="color:#b0b3c8;font-size:12px">${label}</span>
             <span style="font-weight:600;font-size:13px;color:${valueColor || '#f0f0f0'}">${value}</span>
           </div>`
        : '';

    const floor = ed.floor_price;
    const estValue = ed.estimated_value;
    const supply = ed.existing_supply || ed.mint_count;
    const uniqueHolders = ed.unique_holders;
    const conc = ed.concentration_pct;
    const asp7d = ed.asp_7d;
    const asp30d = ed.asp_30d;
    const asp180d = ed.asp_180d;
    const lastSale = ed.last_sale_price;
    const lastSaleTs = ed.last_sale_timestamp;
    const daysSince = ed.days_since_last_sale;
    const sales7d = ed.total_sales_7d;
    const sales30d = ed.total_sales_30d;
    const sales180d = ed.total_sales_180d;
    const listed = ed.total_listings || ed.listed_count;
    const floating = ed.floating_supply_pct;
    const burnCount = ed.burn_count;
    const highOffer = ed.highest_edition_offer || ed.highest_offer;
    const offerCount = ed.edition_offer_count;
    const largestHolderCount = ed.largest_holder_count;

    // Derived: offer-to-floor gap (sell-side spread). Negative spread means top offer >= floor (rare arb).
    const gapPct = (floor && highOffer) ? ((floor - highOffer) / floor) * 100 : null;
    const gapColor = gapPct == null ? '#9ca3af'
      : gapPct < 10 ? '#22c55e'
      : gapPct < 20 ? '#eab308'
      : '#ef4444';
    const gapPill = gapPct != null ? `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:6px;background:rgba(${gapPct < 10 ? '34,197,94' : gapPct < 20 ? '234,179,8' : '239,68,68'},0.12);border:1px solid rgba(${gapPct < 10 ? '34,197,94' : gapPct < 20 ? '234,179,8' : '239,68,68'},0.4);border-radius:6px">
        <span style="color:#b0b3c8;font-size:11px;font-weight:500">Offer ↔ Floor gap</span>
        <span style="color:${gapColor};font-size:13px;font-weight:700">${gapPct >= 0 ? '-' : '+'}${Math.abs(gapPct).toFixed(0)}%</span>
      </div>` : '';

    // Derived: whale flag — single wallet holds ≥10% of supply
    const whalePct = (largestHolderCount && supply) ? (largestHolderCount / supply) * 100 : null;
    const isWhale = whalePct != null && whalePct >= 10;
    const whaleBadge = isWhale ? `
      <div style="display:flex;align-items:center;gap:5px;padding:5px 8px;margin-bottom:6px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);border-radius:6px">
        <span style="color:#ef4444;font-size:13px">⚠</span>
        <span style="color:#fca5a5;font-size:11px;font-weight:600">Whale: ${largestHolderCount} of ${supply} (${whalePct.toFixed(0)}%)</span>
      </div>` : '';

    // Last sale formatted with relative date inline
    const lastSaleStr = lastSale ? (() => {
      const price = fmtUsd(lastSale);
      if (daysSince != null) return `${price} · ${daysSince}d ago`;
      if (lastSaleTs) return `${price} · ${fmtShortDate(lastSaleTs)}`;
      return price;
    })() : null;

    // 7d avg: replace "N/A" / 0 with explanatory text
    const asp7dStr = asp7d ? fmtUsd(asp7d) : (sales7d === 0 ? '—' : null);
    const asp7dRow = asp7d
      ? row('7d Avg', fmtUsd(asp7d))
      : sales7d === 0
        ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(45,45,74,0.4);text-shadow:0 1px 3px rgba(0,0,0,0.9)">
             <span style="color:#b0b3c8;font-size:12px">7d Avg</span>
             <span style="color:#6b7280;font-size:11px;font-style:italic">No sales in 7d</span>
           </div>`
        : '';

    // Velocity sentence — used in Sales tab header
    const velocitySentence = (() => {
      const parts = [];
      if (sales7d != null) parts.push(`${sales7d} in 7d`);
      if (sales30d != null) parts.push(`${sales30d} in 30d`);
      if (sales180d != null) parts.push(`${sales180d} in 180d`);
      if (!parts.length) return '';
      const tone = (sales30d != null && sales30d <= 1) ? '#ef4444'
        : (sales30d != null && sales30d < 5) ? '#eab308'
        : '#22c55e';
      return `<div style="font-size:11px;color:${tone};margin-top:4px;text-align:center">${parts.join(' · ')}</div>`;
    })();

    const tabs = {
      price: [
        row('Floor', fmtUsd(floor)),
        row('Est. Value', fmtUsd(estValue)),
        asp7dRow,
        row('30d Avg', asp30d ? fmtUsd(asp30d) : (sales30d === 0 ? '—' : null)),
        row('180d Avg', asp180d ? fmtUsd(asp180d) : null),
        row('Last Sale', lastSaleStr),
      ].join(''),
      supply: whaleBadge + [
        row('Supply', supply ? Number(supply).toLocaleString() : null),
        burnCount ? row('Burned', Number(burnCount).toLocaleString()) : '',
        row('Listed', listed != null ? Number(listed).toLocaleString() : null),
        row('Holders', uniqueHolders != null ? Number(uniqueHolders).toLocaleString() : null),
        row('Top Holder', conc != null ? `${Number(conc).toFixed(1)}%` : null),
        row('Floating', floating != null ? `${Number(floating).toFixed(1)}%` : null),
      ].join('') +
      `<div class="vp-holder-bar-host" style="margin-top:8px">
         <div style="font-size:10px;color:#8b8bab;margin-bottom:3px;text-shadow:0 1px 3px rgba(0,0,0,0.9)">Holder distribution (top 5 + rest)</div>
         <div class="vp-holder-bar-content" style="font-size:10px;color:#6b7280">Loading…</div>
       </div>`,
      offers: gapPill + [
        row('Top Offer', highOffer ? fmtUsd(highOffer) : '—'),
        row('Offers', offerCount ? String(offerCount) : null),
        row('Sales (7d)', sales7d != null ? String(sales7d) : null),
        row('Sales (30d)', sales30d != null ? String(sales30d) : null),
        row('Sales (180d)', sales180d != null ? String(sales180d) : null),
      ].join(''),
      sales: `
        <div class="vp-sales-spark-host" style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 0 8px 0;border-bottom:1px solid rgba(45,45,74,0.6);min-height:36px">
          <div class="vp-sales-spark" style="flex:1"></div>
          <div class="vp-sales-spark-meta" style="font-size:10px;color:#8b8bab;text-align:right;text-shadow:0 1px 3px rgba(0,0,0,0.9)"></div>
        </div>
        ${velocitySentence}
        <div class="vp-sales-rows" style="margin-top:4px;font-size:11px;color:#9ca3af;text-align:center">Loading sales…</div>
      `,
    };

    const analyticsUrl = (() => {
      if (this.product === 'allday' || this.product === 'pinnacle') {
        const edId = ed.edition_id;
        return edId ? `https://vaultopolis.com/analytics/${this.product}/edition/${edId}` : 'https://vaultopolis.com';
      }
      const sId = ed.setID || ed.set_id;
      const pId = ed.playID || ed.play_id;
      if (!sId || !pId) return 'https://vaultopolis.com';
      const subId = ed.subeditionID ?? ed.subedition_id;
      if (subId != null && subId !== 0 && subId !== '0') {
        return `https://vaultopolis.com/analytics/topshot/edition/${sId}/${pId}/${subId}`;
      }
      return `https://vaultopolis.com/analytics/topshot/edition/${sId}/${pId}`;
    })();

    const panelStyle = 'flex:1;overflow-y:auto;padding:2px 0;background:rgba(10,10,24,0.35);border-radius:0 0 4px 4px';
    const body = overlay.querySelector('.vp-pill-body');
    body.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';

    const showOffers = this.product !== 'pinnacle';
    const showSales = true; // Sales tab on all products (TopShot/AllDay/Pinnacle have edition-sales endpoints)
    const tabBtn = (name, label, active) => `<button class="vp-pill-tab${active ? ' vp-pill-tab-active' : ''}" data-tab="${name}" style="flex:1;padding:5px 0;border:none;background:none;color:${active ? '#6366f1' : '#9ca3af'};font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid ${active ? '#6366f1' : 'transparent'};margin-bottom:-1px;font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,0.8)">${label}</button>`;

    // Pre-render panels upfront — tab switching only toggles display,
    // no innerHTML writes on click (avoids repeated DOM thrash and XSS surface).
    body.innerHTML = `
      <div style="display:flex;gap:0;border-bottom:1px solid rgba(45,45,74,0.8);margin-bottom:2px;background:rgba(10,10,24,0.45);border-radius:4px 4px 0 0">
        ${tabBtn('price', 'Price', true)}
        ${tabBtn('supply', 'Supply', false)}
        ${showOffers ? tabBtn('offers', 'Offers', false) : ''}
        ${showSales ? tabBtn('sales', 'Sales', false) : ''}
      </div>
      <div class="vp-pill-panel" data-panel="price" style="${panelStyle};display:block">${tabs.price}</div>
      <div class="vp-pill-panel" data-panel="supply" style="${panelStyle};display:none">${tabs.supply}</div>
      ${showOffers ? `<div class="vp-pill-panel" data-panel="offers" style="${panelStyle};display:none">${tabs.offers}</div>` : ''}
      ${showSales ? `<div class="vp-pill-panel" data-panel="sales" style="${panelStyle};display:none">${tabs.sales}</div>` : ''}
      <div style="display:flex;gap:6px;padding-top:6px;border-top:1px solid rgba(45,45,74,0.6);margin-top:4px;flex-shrink:0">
        ${safeUrl(listingUrl) ? `<a href="${escAttr(listingUrl)}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:rgba(99,102,241,0.9);color:#fff;border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">View Listing</a>` : ''}
        <a href="${escAttr(analyticsUrl)}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:rgba(10,10,24,0.6);color:#a5b4fc;border:1px solid rgba(99,102,241,0.6);border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">Full Analytics</a>
      </div>
    `;

    // Tab switching — show/hide pre-rendered panels, no innerHTML writes
    body.querySelectorAll('.vp-pill-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tabName = btn.dataset.tab;
        body.querySelectorAll('.vp-pill-tab').forEach(b => {
          b.style.color = '#9ca3af';
          b.style.borderBottomColor = 'transparent';
        });
        btn.style.color = '#6366f1';
        btn.style.borderBottomColor = '#6366f1';
        body.querySelectorAll('.vp-pill-panel').forEach(p => {
          p.style.display = p.dataset.panel === tabName ? 'block' : 'none';
        });
      });
    });

    // Async populate holder bar (all products) and sales (TopShot only)
    this._fetchAndRenderHolders(overlay, ed, supply);
    if (showSales) this._fetchAndRenderSales(overlay, ed);
  }

  /** Fetch holder distribution and render the stacked bar in the Supply tab. */
  async _fetchAndRenderHolders(overlay, ed, supply) {
    const host = overlay.querySelector('.vp-holder-bar-content');
    if (!host || !supply) return;
    try {
      const url = (() => {
        if (this.product === 'topshot') {
          const sId = ed.setID || ed.set_id;
          const pId = ed.playID || ed.play_id;
          const subId = ed.subeditionID ?? ed.subedition_id ?? 0;
          if (!sId || !pId) return null;
          return `https://api.vaultopolis.com/topshot-edition-holders?set_id=${sId}&play_id=${pId}&subedition_id=${subId}&limit=20`;
        }
        const edId = ed.edition_id;
        if (!edId) return null;
        return `https://api.vaultopolis.com/${this.product}-edition-holders?edition_id=${encodeURIComponent(edId)}&limit=20`;
      })();
      if (!url) { host.textContent = '—'; return; }

      const resp = await Promise.race([
        fetch(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const holders = Array.isArray(data.holders) ? data.holders : [];
      if (!holders.length) { host.textContent = '—'; return; }

      const top = holders.slice(0, 5);
      const topSum = top.reduce((a, b) => a + b.count, 0);
      const remCount = Math.max(0, supply - topSum);

      const legend = top.map((h, i) => {
        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
        const pct = ((h.count / supply) * 100).toFixed(1);
        const short = (h.wallet_address || '').slice(0, 6) + '…' + (h.wallet_address || '').slice(-4);
        return `<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:#b0b3c8">
          <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${colors[i]}"></span>
          <span style="font-family:monospace">${escAttr(short)}</span>
          <span style="margin-left:auto;color:#9ca3af">${h.count} (${pct}%)</span>
        </div>`;
      }).join('');
      const remPct = ((remCount / supply) * 100).toFixed(1);
      const remLegend = remCount > 0 ? `<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:#b0b3c8">
        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:rgba(120,120,140,0.4)"></span>
        <span>Other (${holders.length - top.length}+ wallets)</span>
        <span style="margin-left:auto;color:#9ca3af">${remCount} (${remPct}%)</span>
      </div>` : '';

      host.innerHTML = buildHolderBar(holders, supply) + `<div style="display:flex;flex-direction:column;gap:2px;margin-top:6px">${legend}${remLegend}</div>`;
    } catch {
      host.textContent = '—';
    }
  }

  /** Fetch recent sales and render sparkline + mini-table in the Sales tab (all products). */
  async _fetchAndRenderSales(overlay, ed) {
    const rowsHost = overlay.querySelector('.vp-sales-rows');
    const sparkHost = overlay.querySelector('.vp-sales-spark');
    const sparkMeta = overlay.querySelector('.vp-sales-spark-meta');
    if (!rowsHost || !sparkHost) return;

    // Build product-specific URL. TopShot uses set/play/sub composite key;
    // AllDay & Pinnacle use a single edition_id integer.
    const url = (() => {
      if (this.product === 'topshot') {
        const sId = ed.setID || ed.set_id;
        const pId = ed.playID || ed.play_id;
        const subId = ed.subeditionID ?? ed.subedition_id ?? 0;
        if (!sId || !pId) return null;
        return `https://api.vaultopolis.com/topshot-edition-sales?set_id=${sId}&play_id=${pId}&subedition_id=${subId}&limit=30&days=180`;
      }
      const edId = ed.edition_id;
      if (!edId) return null;
      return `https://api.vaultopolis.com/${this.product}-edition-sales?edition_id=${encodeURIComponent(edId)}&limit=30&days=180`;
    })();

    if (!url) { rowsHost.textContent = 'No sales data'; return; }

    try {
      const resp = await Promise.race([
        fetch(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const sales = Array.isArray(data.sales) ? data.sales : [];

      if (!sales.length) {
        rowsHost.textContent = 'No sales in last 180 days';
        return;
      }

      // Sparkline: chronological asc
      const chronological = [...sales].reverse();
      const prices = chronological.map(s => Number(s.price)).filter(p => p > 0);
      if (prices.length >= 2) {
        sparkHost.innerHTML = buildSparkline(prices, 160, 32);
        const first = prices[0];
        const last = prices[prices.length - 1];
        const change = ((last - first) / first) * 100;
        const arrow = change >= 0 ? '↑' : '↓';
        const color = change >= 0 ? '#22c55e' : '#ef4444';
        if (sparkMeta) sparkMeta.innerHTML = `<span style="color:${color};font-weight:600">${arrow} ${Math.abs(change).toFixed(0)}%</span><br><span style="color:#6b7280;font-size:9px">${prices.length} sales · 180d</span>`;
      } else if (prices.length === 1) {
        sparkHost.innerHTML = '';
        if (sparkMeta) sparkMeta.innerHTML = `<span style="color:#6b7280;font-size:9px">1 sale · 180d</span>`;
      }

      // Mini-table: 5 most recent
      const recent = sales.slice(0, 5);
      const rowHtml = recent.map(s => {
        const date = fmtShortDate(s.timestamp || s.block_timestamp);
        const price = fmtUsd(s.price) || '—';
        const mp = marketplaceTag(s.marketplace || s.marketplace_source);
        const serial = s.serial != null ? `#${s.serial}` : '';
        const serialColor = (s.serial != null && Number(s.serial) <= 10) ? '#fbbf24' : '#9ca3af';
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 0;border-bottom:1px solid rgba(45,45,74,0.3);font-size:11px">
          <span style="color:#b0b3c8;min-width:42px">${escAttr(date)}</span>
          <span style="font-weight:600;color:#f0f0f0;flex:1;text-align:right">${escAttr(price)}</span>
          ${serial ? `<span style="color:${serialColor};font-family:monospace;min-width:32px;text-align:right">${escAttr(serial)}</span>` : ''}
          <span style="color:#fff;background:${mp.color};border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700;min-width:26px;text-align:center">${escAttr(mp.abbr)}</span>
        </div>`;
      }).join('');

      rowsHost.style.cssText = 'margin-top:4px;text-align:left';
      rowsHost.innerHTML = rowHtml;
    } catch {
      rowsHost.textContent = 'Could not load sales';
    }
  }
}
