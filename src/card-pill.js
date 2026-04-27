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
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
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
      pill.style.transform = 'translateX(-50%) scale(1.08)';
      pill.style.boxShadow = '0 0 8px rgba(99, 102, 241, 0.5)';
    });
    pill.addEventListener('mouseleave', () => {
      pill.style.transform = 'translateX(-50%) scale(1)';
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
    try {
      let resp;
      if (editionId) {
        // Direct fetch — no SW involved
        const apiResp = await Promise.race([
          fetch(`https://api.vaultopolis.com/extension/v1/details/${this.product}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [String(editionId)] }),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
        ]);
        if (!apiResp.ok) throw new Error(`HTTP ${apiResp.status}`);
        const data = await apiResp.json();
        const ed = (data.editions || [])[0] || null;
        resp = { success: true, data: ed };
      } else {
        // SW path for TopShot (UUID resolution required)
        resp = await Promise.race([
          chrome.runtime.sendMessage({
            action: 'lookupOne',
            market: this.product,
            setUuid, playUuid, setId, playId, parallelID, editionId, supply, parallelHint,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
        ]);
      }

      if (!state.expanded) return; // collapsed while loading

      if (resp?.success && resp.data) {
        this._renderDetails(overlay, resp.data, listingPrice, listingUrl);
        return;
      }
    } catch { /* fall through — show DOM data */ }

    // ── Fallback: service worker timed out or unavailable — keep DOM data ─────
    if (!state.expanded) return;
    const loadingEl = body.querySelector('.vp-loading-indicator');
    if (loadingEl) loadingEl.remove();

    if (safeUrl(listingUrl)) {
      const linkDiv = document.createElement('div');
      linkDiv.style.cssText = 'display:flex;padding-top:6px;margin-top:4px;border-top:1px solid rgba(45,45,74,0.6);flex-shrink:0;';
      linkDiv.innerHTML = `<a href="${escAttr(listingUrl)}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:rgba(99,102,241,0.9);color:#fff;border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">View Listing</a>`;
      body.appendChild(linkDiv);
    }
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
    const fmt = v => (v != null && v > 0) ? `$${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
    const row = (label, value) =>
      value != null && value !== ''
        ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(45,45,74,0.4);text-shadow:0 1px 3px rgba(0,0,0,0.9)">
             <span style="color:#b0b3c8;font-size:12px">${label}</span>
             <span style="font-weight:600;font-size:13px;color:#f0f0f0">${value}</span>
           </div>`
        : '';

    const floor = ed.floor_price;
    const estValue = ed.estimated_value;
    const supply = ed.existing_supply || ed.mint_count;
    const holders = ed.unique_holders;
    const conc = ed.concentration_pct;
    const asp7d = ed.asp_7d;
    const asp30d = ed.asp_30d;
    const lastSale = ed.last_sale_price;
    const sales7d = ed.total_sales_7d;
    const sales30d = ed.total_sales_30d;
    const listed = ed.total_listings || ed.listed_count;
    const floating = ed.floating_supply_pct;
    const burnCount = ed.burn_count;
    const highOffer = ed.highest_edition_offer || ed.highest_offer;
    const offerCount = ed.edition_offer_count;
    const liquidityScore = ed.liquidity_score;

    const tabs = {
      price: [
        row('Floor', fmt(floor)),
        row('Est. Value', fmt(estValue)),
        row('7d Avg', asp7d ? fmt(asp7d) : 'N/A'),
        row('30d Avg', asp30d ? fmt(asp30d) : 'N/A'),
        row('Last Sale', fmt(lastSale)),
      ].join(''),
      supply: [
        row('Supply', supply ? Number(supply).toLocaleString() : null),
        burnCount ? row('Burned', Number(burnCount).toLocaleString()) : '',
        row('Listed', listed != null ? Number(listed).toLocaleString() : null),
        row('Holders', holders != null ? Number(holders).toLocaleString() : null),
        row('Top Holder', conc != null ? `${Number(conc).toFixed(1)}%` : null),
        row('Floating', floating != null ? `${Number(floating).toFixed(1)}%` : null),
      ].join(''),
      offers: [
        row('Top Offer', highOffer ? fmt(highOffer) : 'N/A'),
        row('Offers', offerCount ? String(offerCount) : null),
        row('Sales (7d)', sales7d != null ? String(sales7d) : null),
        row('Sales (30d)', sales30d != null ? String(sales30d) : null),
        row('Liquidity', liquidityScore != null ? `${Math.round(liquidityScore)}/100` : null),
      ].join(''),
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

    // Pre-render panels upfront — tab switching only toggles display,
    // no innerHTML writes on click (avoids repeated DOM thrash and XSS surface).
    body.innerHTML = `
      <div style="display:flex;gap:0;border-bottom:1px solid rgba(45,45,74,0.8);margin-bottom:2px;background:rgba(10,10,24,0.45);border-radius:4px 4px 0 0">
        <button class="vp-pill-tab vp-pill-tab-active" data-tab="price" style="flex:1;padding:5px 0;border:none;background:none;color:#6366f1;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid #6366f1;margin-bottom:-1px;font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,0.8)">Price</button>
        <button class="vp-pill-tab" data-tab="supply" style="flex:1;padding:5px 0;border:none;background:none;color:#9ca3af;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,0.8)">Supply</button>
        ${showOffers ? `<button class="vp-pill-tab" data-tab="offers" style="flex:1;padding:5px 0;border:none;background:none;color:#9ca3af;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,0.8)">Offers</button>` : ''}
      </div>
      <div class="vp-pill-panel" data-panel="price" style="${panelStyle};display:block">${tabs.price}</div>
      <div class="vp-pill-panel" data-panel="supply" style="${panelStyle};display:none">${tabs.supply}</div>
      ${showOffers ? `<div class="vp-pill-panel" data-panel="offers" style="${panelStyle};display:none">${tabs.offers}</div>` : ''}
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
  }
}
