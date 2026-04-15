/**
 * Always-on card overlays — shows tabbed analytics on every visible card.
 * Uses IntersectionObserver so only in-viewport cards are rendered.
 * Data comes from the same cached bulk fetch as the tooltip (no extra API calls).
 */

export class CardBadge {
  constructor(product) {
    this.product = product;
    this.enabled = false;
    this.observer = null;
    this.badges = new WeakMap(); // element → overlay div
    this._siteObs = null;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this._startObserver();
      if (this.product === 'allday') this._setSiteSuppression(true);
    } else {
      this._stopObserver();
      this._clearAll();
      if (this.product === 'allday') this._setSiteSuppression(false);
    }
  }

  _hideBuyNow() {
    document.querySelectorAll('button').forEach(btn => {
      if (btn.textContent.trim().toUpperCase().includes('BUY NOW')) {
        btn.setAttribute('data-vp-hide', '1');
      }
    });
  }

  _setSiteSuppression(on) {
    if (this.product !== 'allday') return;
    const cssId = 'vp-allday-buynow-hide';
    if (on) {
      if (!document.getElementById(cssId)) {
        const s = document.createElement('style');
        s.id = cssId;
        s.textContent = `button[data-vp-hide="1"] { display: none !important; }`;
        document.head.appendChild(s);
      }
      this._hideBuyNow();
      if (!this._siteObs) {
        this._siteObs = new MutationObserver(() => this._hideBuyNow());
        this._siteObs.observe(document.body, { childList: true, subtree: true });
      }
    } else {
      document.getElementById(cssId)?.remove();
      document.querySelectorAll('button[data-vp-hide]').forEach(b => b.removeAttribute('data-vp-hide'));
      this._siteObs?.disconnect();
      this._siteObs = null;
    }
  }

  observe(element) {
    if (!this.enabled) return;
    if (this.observer) this.observer.observe(element);
  }

  observeAll(processedSet, allElements) {
    if (!this.observer) this._startObserver();
    for (const el of allElements) {
      if (processedSet.has(el)) this.observer.observe(el);
    }
  }

  _startObserver() {
    if (this.observer) return;
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this._showOverlay(entry.target);
        } else {
          this._removeOverlay(entry.target);
        }
      }
    }, { rootMargin: '100px' });
  }

  _stopObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  _clearAll() {
    document.querySelectorAll('.vp-always-overlay').forEach(b => b.remove());
    document.querySelectorAll('.vp-restore-btn').forEach(b => b.remove());
  }

  async _showOverlay(el) {
    if (!this.enabled || !el._vpData) return;
    if (this.badges.has(el)) return;

    const { editionId, setId, playId, setUuid, playUuid, parallelID, listingPrice, listingUrl } = el._vpData;

    let ed = null;
    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'lookupOne',
        market: this.product,
        setUuid, playUuid, setId, playId, parallelID, editionId,
      });
      if (resp?.success) ed = resp.data;
    } catch { return; }

    if (!ed || !this.enabled || !el.isConnected) return;

    const floor = ed.floor_price || ed.floor || ed.low;
    const estValue = ed.estimated_value;
    const supply = ed.existing_supply || ed.mint_count || ed.momentCount;
    const listed = ed.total_listings;
    const holders = ed.unique_holders;
    const burnCount = ed.burn_count;
    const floating = ed.floating_supply_pct;
    const conc = ed.concentration_pct;
    const asp7d = ed.asp_7d;
    const asp30d = ed.asp_30d;
    const lastSale = ed.last_sale_price;
    const sales7d = ed.total_sales_7d;
    const sales30d = ed.total_sales_30d;
    const highOffer = ed.highest_edition_offer || ed.highest_offer;
    const offerCount = ed.edition_offer_count;
    const liquidityScore = ed.liquidity_score;

    const fmt = v => (v != null && v > 0) ? `$${parseFloat(v).toFixed(2)}` : null;
    const row = (label, value, valueColor = '#e0e0e0') =>
      value != null && value !== ''
        ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(45,45,74,0.5)">
             <span style="color:#8b8bab;font-size:12px">${label}</span>
             <span style="font-weight:600;font-size:13px;color:${valueColor}">${value}</span>
           </div>`
        : '';

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
        row('Top Holder', conc != null ? `${conc.toFixed(1)}%` : null),
        row('Floating', floating != null ? `${floating.toFixed(1)}%` : null),
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

    const overlay = document.createElement('div');
    overlay.className = 'vp-always-overlay';
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(10, 10, 24, 0.93);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #e0e0e0;
      padding: 8px 10px 8px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      z-index: 1;
      border-radius: 6px 6px 0 0;
      transition: opacity 0.2s;
      visibility: visible !important;
    `;

    overlay.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <img src="${chrome.runtime.getURL('assets/logo.svg')}" style="height:14px;width:auto" alt="Vaultopolis">
        <button class="vp-peek-btn" title="Peek at media (3s)" style="background:rgba(255,255,255,0.08);border:none;border-radius:4px;color:#8b8bab;font-size:10px;cursor:pointer;padding:2px 5px;font-family:inherit;line-height:1">&#128065;</button>
      </div>
      <div style="display:flex;gap:0;border-bottom:1px solid rgba(45,45,74,0.8);margin-bottom:2px">
        <button class="vp-ao-tab vp-ao-active" data-tab="price" style="flex:1;padding:5px 0;border:none;background:none;color:#6366f1;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid #6366f1;margin-bottom:-1px;font-family:inherit">Price</button>
        <button class="vp-ao-tab" data-tab="supply" style="flex:1;padding:5px 0;border:none;background:none;color:#6b7280;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit">Supply</button>
        <button class="vp-ao-tab" data-tab="offers" style="flex:1;padding:5px 0;border:none;background:none;color:#6b7280;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit">Offers</button>
      </div>
      <div class="vp-ao-content" style="flex:1;overflow-y:auto;padding:2px 0">${tabs.price}</div>
      <div style="display:flex;gap:6px;padding-top:6px;border-top:1px solid rgba(45,45,74,0.6);margin-top:4px;flex-shrink:0">
        ${listingUrl ? `<a href="${listingUrl}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:#6366f1;color:#fff;border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">View Listing</a>` : ''}
        <a href="${analyticsUrl}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:transparent;color:#6366f1;border:1px solid rgba(99,102,241,0.6);border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">Full Analytics</a>
      </div>
    `;

    // Tab switching
    overlay.querySelectorAll('.vp-ao-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tabName = btn.dataset.tab;
        overlay.querySelectorAll('.vp-ao-tab').forEach(b => {
          b.style.color = '#6b7280';
          b.style.borderBottomColor = 'transparent';
          b.classList.remove('vp-ao-active');
        });
        btn.style.color = '#6366f1';
        btn.style.borderBottomColor = '#6366f1';
        btn.classList.add('vp-ao-active');
        overlay.querySelector('.vp-ao-content').innerHTML = tabs[tabName];
      });
    });

    // Restore button — floats over card media when overlay is hidden
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'vp-restore-btn';
    restoreBtn.textContent = '◀ Analytics';
    restoreBtn.style.cssText = `
      position: absolute; top: 8px; right: 8px;
      background: rgba(10,10,24,0.88);
      border: 1px solid rgba(99,102,241,0.5);
      border-radius: 6px; color: #6366f1;
      font-size: 10px; font-weight: 600;
      cursor: pointer; padding: 4px 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 2; display: none; line-height: 1;
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    `;
    overlay._restoreBtn = restoreBtn;

    const blockerIds = ['vp-block-videos', 'vp-block-all-media', 'vp-reduce-images'];
    const setPeeking = (on) => {
      overlay.style.opacity = on ? '0' : '1';
      overlay.style.pointerEvents = on ? 'none' : '';
      restoreBtn.style.display = on ? 'block' : 'none';
      for (const id of blockerIds) {
        const s = document.getElementById(id);
        if (s) s.disabled = on;
      }
    };

    overlay.querySelector('.vp-peek-btn').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      setPeeking(true);
    });
    restoreBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      setPeeking(false);
    });

    // AllDay: attach to parent so overlay is sibling to the Buy Now button
    // (which is also a child of the card wrapper, not inside our anchor).
    // TopShot/Pinnacle: attach to el itself — no sibling button conflict.
    const container = this.product === 'allday' ? (el.parentElement || el) : el;
    const pos = getComputedStyle(container).position;
    if (pos === 'static') container.style.position = 'relative';
    container.appendChild(restoreBtn);
    container.appendChild(overlay);
    this.badges.set(el, overlay);
    if (this.product === 'allday') this._hideBuyNow();
  }

  _removeOverlay(el) {
    const overlay = this.badges.get(el);
    if (overlay) {
      overlay._restoreBtn?.remove();
      overlay.remove();
      this.badges.delete(el);
    }
  }
}
