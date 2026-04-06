/**
 * Shadow DOM tooltip that displays Vaultopolis analytics data.
 * Completely isolated from the host page's CSS.
 */

export class Tooltip {
  constructor() {
    this.host = null;
    this.shadow = null;
    this.container = null;
    this.visible = false;
    this.hideTimer = null;
    this.hoveredOnTooltip = false;
    this.logoUrl = chrome.runtime.getURL('assets/logo.svg');
    this.createHost();
  }

  createHost() {
    this.host = document.createElement('div');
    this.host.id = 'vaultopolis-tooltip-host';
    document.body.appendChild(this.host);

    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    this.container = document.createElement('div');
    this.container.className = 'vp-tooltip';
    this.container.style.display = 'none';
    this.shadow.appendChild(this.container);

    // Keep tooltip visible while mouse is over it
    this.container.addEventListener('mouseenter', () => {
      this.hoveredOnTooltip = true;
      clearTimeout(this.hideTimer);
    });

    this.container.addEventListener('mouseleave', () => {
      this.hoveredOnTooltip = false;
      this.hideDelayed();
    });
  }

  /**
   * Position the tooltip to cover the full card.
   * Adds compact class for narrow cards (e.g. Pinnacle ~183px).
   */
  position(rect) {
    this.container.style.width = `${rect.width}px`;
    this.container.style.left = `${rect.left}px`;
    this.container.style.top = `${rect.top}px`;
    this.container.style.height = `${rect.height}px`;

    // Compact mode for narrow cards (< 250px)
    if (rect.width < 250) {
      this.container.classList.add('vp-compact');
    } else {
      this.container.classList.remove('vp-compact');
    }
  }

  showLoading(rect) {
    clearTimeout(this.hideTimer);
    this.container.innerHTML = `
      <div class="vp-header">
        <img class="vp-logo" src="${this.logoUrl}" alt="Vaultopolis">
      </div>
      <div class="vp-loading">Loading analytics...</div>
    `;
    this.container.style.display = 'block';
    this.position(rect);
    this.visible = true;
  }

  showData(rect, ed, listingPrice, listingUrl, product = 'topshot') {
    if (!this.visible) return;

    const playerName = ed.player_name || ed.character_name || ed.FullName || ed.shape_name || ed.team || ed.set_name || 'Unknown';
    const tier = (ed.tier || ed.edition_type_name || 'UNKNOWN').toUpperCase();
    const tierClass = `vp-tier-${tier.toLowerCase()}`;

    const floor = this.num(ed.floor_price || ed.floor || ed.low);
    const estValue = this.num(ed.estimated_value);
    const supply = ed.existing_supply || ed.mint_count || ed.momentCount || 0;
    const listed = this.num(ed.total_listings);
    const holders = this.num(ed.unique_holders);
    const confidence = ed.value_confidence || 'none';
    const sales7d = this.num(ed.total_sales_7d);
    const sales30d = this.num(ed.total_sales_30d);
    const sales180d = this.num(ed.total_sales_180d);
    const daysSince = this.num(ed.days_since_last_sale);
    const conc = this.num(ed.concentration_pct);

    // Derived: last activity
    let lastActivity = '';
    if (daysSince == null || sales180d === 0) lastActivity = 'Never sold';
    else if (daysSince === 0) lastActivity = 'Sold today';
    else if (daysSince < 180) lastActivity = `${daysSince}d ago`;
    else lastActivity = '6+ months ago';


    // Fair value
    const fairRow = estValue && confidence !== 'none'
      ? this.statRow('Est. Value', this.dollar(estValue))
      : '';

    // Build tab content
    const asp7d = this.num(ed.asp_7d);
    const asp30d = this.num(ed.asp_30d);
    const asp180d = this.num(ed.asp_180d);
    const lastSale = this.num(ed.last_sale_price);
    const highOffer = this.num(ed.highest_edition_offer || ed.highest_offer);
    const offerCount = this.num(ed.edition_offer_count);
    const floating = this.num(ed.floating_supply_pct);
    const burnCount = this.num(ed.burn_count);
    const liquidityScore = this.num(ed.liquidity_score);

    const tabs = {
      price: `
        ${floor ? this.statRow('Floor', this.dollar(floor)) : ''}
        ${fairRow}
        ${this.statRow('7d Avg', asp7d ? this.dollar(asp7d) : 'N/A')}
        ${this.statRow('30d Avg', asp30d ? this.dollar(asp30d) : 'N/A')}
        ${asp180d ? this.statRow('180d Avg', this.dollar(asp180d)) : ''}
        ${lastSale ? this.statRow('Last Sale', this.dollar(lastSale)) : ''}
        ${this.statRow('Last Activity', lastActivity || null)}
      `,
      supply: `
        ${this.statRow('Supply', supply ? Number(supply).toLocaleString() : null)}
        ${burnCount ? this.statRow('Burned', burnCount.toLocaleString()) : ''}
        ${listed != null ? this.statRow('Listed', Number(listed).toLocaleString()) : ''}
        ${holders != null ? this.statRow('Holders', Number(holders).toLocaleString()) : ''}
        ${conc != null ? this.statRow('Top Holder', `${conc.toFixed(1)}%`) : ''}
        ${floating != null ? this.statRow('Floating', `${floating.toFixed(1)}%`) : ''}
      `,
      offers: `
        ${this.statRow('Top Offer', highOffer ? this.dollar(highOffer) : 'N/A')}
        ${offerCount ? this.statRow('Offers', String(offerCount)) : ''}
        ${sales7d != null ? this.statRow('Sales (7d)', String(sales7d)) : ''}
        ${sales30d != null ? this.statRow('Sales (30d)', String(sales30d)) : ''}
        ${liquidityScore != null ? this.statRow('Liquidity', `${Math.round(liquidityScore)}/100`) : ''}
      `,
    };

    this.container.innerHTML = `
      <div class="vp-header">
        <img class="vp-logo" src="${this.logoUrl}" alt="Vaultopolis">
      </div>
      <div class="vp-tabs">
        <button class="vp-tab vp-tab-active" data-tab="price">Price</button>
        <button class="vp-tab" data-tab="supply">Supply</button>
        <button class="vp-tab" data-tab="offers">Offers</button>
      </div>
      <div class="vp-tab-content" data-tab="price">${tabs.price}</div>
      <div class="vp-tab-content" data-tab="supply" style="display:none">${tabs.supply}</div>
      <div class="vp-tab-content" data-tab="offers" style="display:none">${tabs.offers}</div>
      <div class="vp-actions">
        ${listingUrl ? `<a class="vp-btn vp-btn-listing" href="${this.esc(listingUrl)}">View Listing</a>` : ''}
        <a class="vp-btn vp-btn-analytics" href="${this.buildEditionUrl(ed, product)}" target="_blank" rel="noopener">Full Analytics</a>
      </div>
    `;

    // Wire up tab clicks
    this.container.querySelectorAll('.vp-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tabName = btn.dataset.tab;
        this.container.querySelectorAll('.vp-tab').forEach(b => b.classList.remove('vp-tab-active'));
        this.container.querySelectorAll('.vp-tab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('vp-tab-active');
        this.container.querySelector(`.vp-tab-content[data-tab="${tabName}"]`).style.display = 'block';
      });
    });

    this.position(rect);
  }

  showError(rect, message) {
    if (!this.visible) return;
    this.container.innerHTML = `
      <div class="vp-header">
        <img class="vp-logo" src="${this.logoUrl}" alt="Vaultopolis">
      </div>
      <div class="vp-error">${this.esc(message)}</div>
    `;
    this.position(rect);
  }

  /**
   * Request hide with a short delay.
   * Cancelled if the mouse moves onto the tooltip itself.
   */
  hide() {
    this.hideDelayed();
  }

  hideDelayed() {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (!this.hoveredOnTooltip) {
        this.container.style.display = 'none';
        this.visible = false;
      }
    }, 200); // 200ms grace period to reach the tooltip
  }

  hideImmediate() {
    clearTimeout(this.hideTimer);
    this.container.style.display = 'none';
    this.visible = false;
    this.hoveredOnTooltip = false;
  }

  buildEditionUrl(ed, product = 'topshot') {
    if (product === 'allday' || product === 'pinnacle') {
      const edId = ed.edition_id;
      if (!edId) return 'https://vaultopolis.com';
      return `https://vaultopolis.com/analytics/${product}/edition/${edId}`;
    }
    // Top Shot
    const setId = ed.setID || ed.set_id;
    const playId = ed.playID || ed.play_id;
    if (!setId || !playId) return 'https://vaultopolis.com';
    const subId = ed.subeditionID ?? ed.subedition_id;
    if (subId != null && subId !== 0 && subId !== '0') {
      return `https://vaultopolis.com/analytics/topshot/edition/${setId}/${playId}/${subId}`;
    }
    return `https://vaultopolis.com/analytics/topshot/edition/${setId}/${playId}`;
  }

  statRow(label, value) {
    if (value == null || value === '') return '';
    return `
      <div class="vp-stat">
        <span class="vp-label">${label}</span>
        <span class="vp-value">${value}</span>
      </div>`;
  }

  num(val) {
    if (val == null) return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }

  dollar(val) {
    if (val == null) return null;
    return `$${val.toFixed(2)}`;
  }

  esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  getStyles() {
    return `
      :host {
        all: initial;
        display: block !important;
      }

      .vp-tooltip {
        position: fixed;
        z-index: 2147483647;
        background: rgba(10, 10, 24, 0.95);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 12px;
        padding: 10px 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        color: #e0e0e0;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
        pointer-events: auto;
        overflow: hidden;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 16px);
        animation: vpFadeIn 0.12s ease-out;
        padding-bottom: 52px;
      }

      /* Compact mode for narrow cards (Pinnacle ~183px) */
      .vp-compact {
        padding: 8px 10px;
        font-size: 11px;
      }
      .vp-compact .vp-logo { height: 14px; }
      .vp-compact .vp-player { font-size: 13px; }
      .vp-compact .vp-tier { font-size: 8px; padding: 1px 5px; }
      .vp-compact .vp-badge { font-size: 7px; padding: 1px 4px; }
      .vp-compact .vp-tab { font-size: 10px; padding: 4px 0; }
      .vp-compact .vp-label { font-size: 11px; }
      .vp-compact .vp-value { font-size: 12px; }
      .vp-compact .vp-stat { padding: 3px 0; }
      .vp-compact .vp-btn { font-size: 10px; padding: 5px 0; }
      .vp-compact .vp-actions { gap: 4px; padding: 6px 10px; }
      .vp-compact { padding-bottom: 46px; }

      @keyframes vpFadeIn {
        from { opacity: 0; transform: scale(0.97); }
        to { opacity: 1; transform: scale(1); }
      }

      .vp-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
      }

      .vp-logo {
        height: 16px;
        width: auto;
      }

      .vp-tier {
        margin-left: auto;
        padding: 2px 8px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .vp-tier-common { background: #374151; color: #9ca3af; }
      .vp-tier-fandom { background: #1e3a2f; color: #34d399; }
      .vp-tier-rare { background: #1e2a3a; color: #60a5fa; }
      .vp-tier-legendary { background: #3a2a1e; color: #fbbf24; }
      .vp-tier-ultimate { background: #2a1e3a; color: #a78bfa; }

      .vp-player-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
      }

      .vp-player {
        font-weight: 700;
        font-size: 15px;
        color: #ffffff;
      }

      .vp-badge {
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .vp-badge-good { background: #065f46; color: #34d399; }
      .vp-badge-high { background: #7c2d12; color: #fb923c; }

      .vp-badges {
        display: flex;
        gap: 4px;
        margin-bottom: 6px;
        min-height: 0;
      }

      .vp-badges:empty { display: none; }

      .vp-derived {
        font-size: 11px;
        font-weight: 600;
        margin-bottom: 6px;
      }

      .vp-warning {
        font-size: 10px;
        margin-top: 6px;
      }

      .vp-meta {
        font-size: 11px;
        color: #8b8bab;
        margin-bottom: 6px;
      }

      .vp-note {
        font-size: 10px;
        color: #6b7280;
        text-align: center;
        margin-top: 6px;
        font-style: italic;
      }

      .vp-tabs {
        display: flex;
        gap: 0;
        margin: 4px 0 2px;
        border-bottom: 1px solid rgba(45, 45, 74, 0.8);
      }

      .vp-tab {
        flex: 1;
        padding: 6px 0;
        border: none;
        background: none;
        color: #6b7280;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        transition: 0.15s;
        font-family: inherit;
      }

      .vp-tab:hover { color: #e0e0e0; }

      .vp-tab-active {
        color: #6366f1;
        border-bottom-color: #6366f1;
      }

      .vp-tab-content {
        padding: 6px 0;
        overflow-y: auto;
        flex: 1 1 0;
        min-height: 0;
      }

      .vp-stat {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        border-bottom: 1px solid rgba(45, 45, 74, 0.6);
      }

      .vp-stat:last-child {
        border-bottom: none;
      }

      .vp-label {
        color: #8b8bab;
        font-size: 13px;
      }

      .vp-value {
        font-weight: 600;
        color: #e0e0e0;
        font-size: 14px;
      }

      .vp-actions {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        gap: 6px;
        padding: 8px 12px;
        border-top: 1px solid rgba(45, 45, 74, 0.8);
        background: rgba(10, 10, 24, 0.98);
        border-radius: 0 0 12px 12px;
      }

      .vp-btn {
        flex: 1;
        display: block;
        padding: 7px 0;
        border-radius: 8px;
        text-decoration: none;
        font-size: 11px;
        font-weight: 600;
        text-align: center;
        cursor: pointer;
        transition: 0.15s;
        border: none;
        font-family: inherit;
      }

      .vp-btn-listing {
        background: #6366f1;
        color: #fff;
      }
      .vp-btn-listing:hover { background: #818cf8; }

      .vp-btn-analytics {
        background: rgba(99, 102, 241, 0.15);
        color: #6366f1;
        border: 1px solid rgba(99, 102, 241, 0.3);
      }
      .vp-btn-analytics:hover { background: rgba(99, 102, 241, 0.25); }

      .vp-loading {
        color: #8b8bab;
        font-size: 12px;
        text-align: center;
        padding: 12px 0;
      }

      .vp-error {
        color: #ef4444;
        font-size: 12px;
        text-align: center;
        padding: 8px 0;
      }
    `;
  }
}
