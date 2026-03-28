#!/usr/bin/env node

/**
 * Visual + interaction tooltip tests.
 *
 * Renders the tooltip in a real headless browser, takes screenshots,
 * tests tab switching, cursor movement, scrolling, and verifies
 * no scrollbar appears on typical card sizes.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

let passCount = 0;
let failCount = 0;
const screenshotDir = path.resolve(__dirname, 'screenshots');

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function assert(condition, message) {
  if (condition) {
    passCount++;
    log(`  ✓ ${message}`, 'green');
  } else {
    failCount++;
    log(`  ✗ ${message}`, 'red');
  }
}

// Edition data fixtures
const fixtures = {
  allday_no_sales: {
    player_name: 'Aaron Rodgers',
    tier: 'Ultimate',
    floor_price: 36999,
    estimated_value: 34000,
    value_confidence: 'medium',
    total_sales_7d: 0,
    total_sales_30d: 0,
    total_sales_180d: 0,
    days_since_last_sale: null,
    asp_7d: 0,
    asp_30d: 0,
    last_sale_price: 34000,
    existing_supply: 1,
    total_listings: 1,
    unique_holders: 1,
    concentration_pct: 100,
    floating_supply_pct: 100,
    highest_edition_offer: null,
    edition_offer_count: 0,
    setID: '10',
    playID: '20',
  },
  topshot_active: {
    player_name: 'Victor Wembanyama',
    tier: 'Common',
    floor_price: 3.9,
    estimated_value: 6.0,
    value_confidence: 'high',
    total_sales_7d: 8,
    total_sales_30d: 25,
    total_sales_180d: 80,
    days_since_last_sale: 0,
    asp_7d: 5,
    asp_30d: 6,
    last_sale_price: 5,
    existing_supply: 10000,
    total_listings: 450,
    unique_holders: 6200,
    concentration_pct: 1.2,
    floating_supply_pct: 92,
    highest_edition_offer: 3.5,
    edition_offer_count: 12,
    setID: '100',
    playID: '200',
  },
  pinnacle_moderate: {
    character_name: 'Mickey Mouse',
    tier: 'Rare',
    floor_price: 15,
    estimated_value: 12,
    value_confidence: 'medium',
    total_sales_7d: 2,
    total_sales_30d: 8,
    total_sales_180d: 30,
    days_since_last_sale: 3,
    asp_7d: 14,
    asp_30d: 13,
    last_sale_price: 14,
    existing_supply: 500,
    total_listings: 35,
    unique_holders: 320,
    concentration_pct: 4.5,
    floating_supply_pct: 78,
    highest_edition_offer: 11,
    edition_offer_count: 3,
    setID: '50',
    playID: '60',
  },
  topshot_legendary: {
    player_name: 'LeBron James',
    tier: 'Legendary',
    floor_price: 500,
    estimated_value: 600,
    value_confidence: 'high',
    total_sales_7d: 5,
    total_sales_30d: 15,
    total_sales_180d: 60,
    days_since_last_sale: 2,
    asp_7d: 520,
    asp_30d: 510,
    last_sale_price: 515,
    existing_supply: 49,
    total_listings: 5,
    unique_holders: 42,
    concentration_pct: 8.5,
    floating_supply_pct: 65,
    highest_edition_offer: 480,
    edition_offer_count: 7,
    setID: '5',
    playID: '6',
  },
};

// Card dimensions per marketplace
const cardSizes = {
  allday: { width: 340, height: 480 },
  topshot: { width: 320, height: 450 },
  pinnacle: { width: 183, height: 280 }, // narrow cards
  topshot_wide: { width: 400, height: 500 },
};

async function run() {
  log('\n=== Vaultopolis Tooltip Visual + Interaction Tests ===\n', 'cyan');

  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const tooltipSrc = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'tooltip.js'), 'utf-8');

  /**
   * Create a fresh page with a card placeholder and injected Tooltip class.
   */
  async function createPage(cardWidth, cardHeight) {
    const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
    await page.setContent(`
      <html>
      <body style="margin:0; background:#111; display:flex; align-items:center; justify-content:center; height:100vh;">
        <div id="card" style="width:${cardWidth}px; height:${cardHeight}px; background:#1a1a2e; border-radius:12px; border:1px solid #333;"></div>
      </body>
      </html>
    `);

    await page.evaluate((src) => {
      window.chrome = { runtime: { getURL: (p) => `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>` } };
      const code = src.replace(/^export\s+/gm, '');
      new Function(code + '\nwindow.Tooltip = Tooltip;')();
    }, tooltipSrc);

    return page;
  }

  /**
   * Render a tooltip and return the page for further interaction.
   */
  async function renderOnPage(page, editionData, listingPrice = null, listingUrl = null) {
    await page.evaluate(({ ed, price, url }) => {
      if (window._tooltip) {
        window._tooltip.hideImmediate();
        const oldHost = document.getElementById('vaultopolis-tooltip-host');
        if (oldHost) oldHost.remove();
      }
      const card = document.getElementById('card');
      const rect = card.getBoundingClientRect();
      const t = new window.Tooltip();
      window._tooltip = t;
      t.showLoading({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      t.showData({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, ed, price, url);
    }, { ed: editionData, price: listingPrice, url: listingUrl });
  }

  // ===================================================================
  // TEST 1: All Day — no scrollbar on typical card
  // ===================================================================
  log('Test 1: All Day card — no scrollbar needed', 'yellow');
  {
    const page = await createPage(cardSizes.allday.width, cardSizes.allday.height);
    await renderOnPage(page, fixtures.allday_no_sales, 36999, 'https://nflallday.com/listing/123');

    const scrollInfo = await page.evaluate(() => {
      const host = document.getElementById('vaultopolis-tooltip-host');
      const shadow = host.shadowRoot || host._shadowRoot;
      // Access via the tooltip instance
      const container = window._tooltip.container;
      return {
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        hasScrollbar: container.scrollHeight > container.clientHeight + 2,
      };
    });

    log(`    scrollHeight=${scrollInfo.scrollHeight} clientHeight=${scrollInfo.clientHeight}`, 'blue');
    assert(!scrollInfo.hasScrollbar, 'No scrollbar on All Day card (480px tall)');

    await page.screenshot({ path: path.join(screenshotDir, '01-allday-no-sales.png') });
    log(`    Screenshot: test/screenshots/01-allday-no-sales.png`, 'blue');
    await page.close();
  }

  // ===================================================================
  // TEST 2: Top Shot active — fits without scroll
  // ===================================================================
  log('\nTest 2: Top Shot active card — fits without scroll', 'yellow');
  {
    const page = await createPage(cardSizes.topshot.width, cardSizes.topshot.height);
    await renderOnPage(page, fixtures.topshot_active, 3.5, 'https://nbatopshot.com/listings/p2p/100+200');

    const scrollInfo = await page.evaluate(() => {
      const container = window._tooltip.container;
      return {
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        hasScrollbar: container.scrollHeight > container.clientHeight + 2,
      };
    });

    log(`    scrollHeight=${scrollInfo.scrollHeight} clientHeight=${scrollInfo.clientHeight}`, 'blue');
    assert(!scrollInfo.hasScrollbar, 'No scrollbar on Top Shot card (450px tall)');

    await page.screenshot({ path: path.join(screenshotDir, '02-topshot-active.png') });
    log(`    Screenshot: test/screenshots/02-topshot-active.png`, 'blue');
    await page.close();
  }

  // ===================================================================
  // TEST 3: Pinnacle compact — fits narrow card
  // ===================================================================
  log('\nTest 3: Disney Pinnacle compact card — fits narrow card', 'yellow');
  {
    const page = await createPage(cardSizes.pinnacle.width, cardSizes.pinnacle.height);
    await renderOnPage(page, fixtures.pinnacle_moderate);

    const isCompact = await page.evaluate(() => {
      return window._tooltip.container.classList.contains('vp-compact');
    });
    assert(isCompact, 'Compact mode activated for 183px wide card');

    const scrollInfo = await page.evaluate(() => {
      const container = window._tooltip.container;
      return {
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        hasScrollbar: container.scrollHeight > container.clientHeight + 2,
      };
    });

    log(`    scrollHeight=${scrollInfo.scrollHeight} clientHeight=${scrollInfo.clientHeight}`, 'blue');
    assert(!scrollInfo.hasScrollbar, 'No scrollbar on Pinnacle card (280px tall)');

    await page.screenshot({ path: path.join(screenshotDir, '03-pinnacle-compact.png') });
    log(`    Screenshot: test/screenshots/03-pinnacle-compact.png`, 'blue');
    await page.close();
  }

  // ===================================================================
  // TEST 4: Tab switching — click each tab, verify content changes
  // ===================================================================
  log('\nTest 4: Tab switching interactions', 'yellow');
  {
    const page = await createPage(cardSizes.topshot_wide.width, cardSizes.topshot_wide.height);
    await renderOnPage(page, fixtures.topshot_legendary, 400, 'https://nbatopshot.com/listings/p2p/5+6');

    // Price tab should be visible by default
    const priceVisible = await page.evaluate(() => {
      const container = window._tooltip.container;
      const priceTab = container.querySelector('.vp-tab-content[data-tab="price"]');
      return priceTab && priceTab.style.display !== 'none';
    });
    assert(priceVisible, 'Price tab visible by default');

    await page.screenshot({ path: path.join(screenshotDir, '04a-tab-price.png') });

    // Click Supply tab
    await page.evaluate(() => {
      const container = window._tooltip.container;
      const supplyBtn = container.querySelector('.vp-tab[data-tab="supply"]');
      supplyBtn.click();
    });

    const supplyState = await page.evaluate(() => {
      const container = window._tooltip.container;
      const priceTab = container.querySelector('.vp-tab-content[data-tab="price"]');
      const supplyTab = container.querySelector('.vp-tab-content[data-tab="supply"]');
      const activeBtn = container.querySelector('.vp-tab-active');
      return {
        priceHidden: priceTab.style.display === 'none',
        supplyVisible: supplyTab.style.display !== 'none',
        activeBtnIsSupply: activeBtn.dataset.tab === 'supply',
      };
    });
    assert(supplyState.priceHidden, 'Price tab hidden after clicking Supply');
    assert(supplyState.supplyVisible, 'Supply tab content visible');
    assert(supplyState.activeBtnIsSupply, 'Supply button has active class');

    await page.screenshot({ path: path.join(screenshotDir, '04b-tab-supply.png') });

    // Click Offers tab
    await page.evaluate(() => {
      const container = window._tooltip.container;
      container.querySelector('.vp-tab[data-tab="offers"]').click();
    });

    const offersState = await page.evaluate(() => {
      const container = window._tooltip.container;
      const offersTab = container.querySelector('.vp-tab-content[data-tab="offers"]');
      const activeBtn = container.querySelector('.vp-tab-active');
      return {
        offersVisible: offersTab.style.display !== 'none',
        activeBtnIsOffers: activeBtn.dataset.tab === 'offers',
      };
    });
    assert(offersState.offersVisible, 'Offers tab content visible');
    assert(offersState.activeBtnIsOffers, 'Offers button has active class');

    await page.screenshot({ path: path.join(screenshotDir, '04c-tab-offers.png') });

    // Click back to Price
    await page.evaluate(() => {
      const container = window._tooltip.container;
      container.querySelector('.vp-tab[data-tab="price"]').click();
    });

    const backToPrice = await page.evaluate(() => {
      const container = window._tooltip.container;
      return container.querySelector('.vp-tab-content[data-tab="price"]').style.display !== 'none';
    });
    assert(backToPrice, 'Price tab visible again after clicking back');

    await page.close();
  }

  // ===================================================================
  // TEST 5: Hover show/hide lifecycle
  // ===================================================================
  log('\nTest 5: Show/hide lifecycle', 'yellow');
  {
    const page = await createPage(cardSizes.topshot.width, cardSizes.topshot.height);

    // Tooltip starts hidden
    const initiallyHidden = await page.evaluate(() => {
      const t = new window.Tooltip();
      window._tooltip = t;
      return t.container.style.display === 'none' && !t.visible;
    });
    assert(initiallyHidden, 'Tooltip starts hidden');

    // Show loading
    await page.evaluate(() => {
      const card = document.getElementById('card');
      const rect = card.getBoundingClientRect();
      window._tooltip.showLoading({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    });

    const loadingVisible = await page.evaluate(() => {
      return window._tooltip.visible && window._tooltip.container.style.display === 'block';
    });
    assert(loadingVisible, 'Loading state visible');

    await page.screenshot({ path: path.join(screenshotDir, '05a-loading.png') });

    // Show data
    await page.evaluate((ed) => {
      const card = document.getElementById('card');
      const rect = card.getBoundingClientRect();
      window._tooltip.showData({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, ed, 3.5, null);
    }, fixtures.topshot_active);

    const dataVisible = await page.evaluate(() => {
      return window._tooltip.visible && window._tooltip.container.innerHTML.includes('Victor Wembanyama');
    });
    assert(dataVisible, 'Data state visible with player name');

    await page.screenshot({ path: path.join(screenshotDir, '05b-data.png') });

    // Hide immediate
    await page.evaluate(() => window._tooltip.hideImmediate());

    const hiddenAfter = await page.evaluate(() => {
      return window._tooltip.container.style.display === 'none' && !window._tooltip.visible;
    });
    assert(hiddenAfter, 'Tooltip hidden after hideImmediate()');

    await page.close();
  }

  // ===================================================================
  // TEST 6: Verify removed elements are truly gone from rendered DOM
  // ===================================================================
  log('\nTest 6: Removed elements not in rendered DOM (all fixtures)', 'yellow');
  {
    const page = await createPage(cardSizes.topshot.width, cardSizes.topshot.height);
    const removedPatterns = [
      'Below Floor', 'Above Avg', 'Active</span>', 'Moderate</span>',
      'Slow</span>', 'Dormant</span>', 'No Sales</span>',
      'underpriced', 'premium', 'Fair value',
      'vp-badges', 'vp-derived', 'vp-badge-good', 'vp-badge-high',
    ];

    for (const [name, data] of Object.entries(fixtures)) {
      await renderOnPage(page, data, data.floor_price * 0.8);

      const html = await page.evaluate(() => window._tooltip.container.innerHTML);
      let allClean = true;
      for (const pat of removedPatterns) {
        if (html.includes(pat)) {
          assert(false, `${name}: found "${pat}" in rendered HTML`);
          allClean = false;
        }
      }
      if (allClean) {
        assert(true, `${name}: no removed badges/valuations in DOM`);
      }
    }

    await page.close();
  }

  // ===================================================================
  // TEST 7: Button links are correct
  // ===================================================================
  log('\nTest 7: Action button links', 'yellow');
  {
    const page = await createPage(cardSizes.topshot.width, cardSizes.topshot.height);

    // With listing URL
    await renderOnPage(page, fixtures.topshot_active, 3.5, 'https://nbatopshot.com/listings/p2p/100+200');
    const withListing = await page.evaluate(() => {
      const container = window._tooltip.container;
      const listingBtn = container.querySelector('.vp-btn-listing');
      const analyticsBtn = container.querySelector('.vp-btn-analytics');
      return {
        hasListingBtn: !!listingBtn,
        listingHref: listingBtn?.href || null,
        hasAnalyticsBtn: !!analyticsBtn,
        analyticsHref: analyticsBtn?.href || null,
      };
    });
    assert(withListing.hasListingBtn, 'View Listing button present when URL provided');
    assert(withListing.hasAnalyticsBtn, 'Full Analytics button present');
    assert(withListing.analyticsHref?.includes('vaultopolis.com/analytics'), 'Analytics link points to vaultopolis.com');

    // Without listing URL
    await renderOnPage(page, fixtures.allday_no_sales, null, null);
    const withoutListing = await page.evaluate(() => {
      const container = window._tooltip.container;
      return { hasListingBtn: !!container.querySelector('.vp-btn-listing') };
    });
    assert(!withoutListing.hasListingBtn, 'No View Listing button when no URL');

    await page.close();
  }

  // ===================================================================
  // TEST 8: Cursor movement simulation
  // ===================================================================
  log('\nTest 8: Cursor movement over tooltip', 'yellow');
  {
    const page = await createPage(cardSizes.topshot_wide.width, cardSizes.topshot_wide.height);
    await renderOnPage(page, fixtures.topshot_legendary, 400, 'https://nbatopshot.com/listings/p2p/5+6');

    // Get tooltip position
    const tooltipBox = await page.evaluate(() => {
      const c = window._tooltip.container;
      return {
        left: parseFloat(c.style.left),
        top: parseFloat(c.style.top),
        width: parseFloat(c.style.width),
        height: parseFloat(c.style.height),
      };
    });

    // Move cursor across the tooltip in a smooth path
    const centerX = tooltipBox.left + tooltipBox.width / 2;
    const centerY = tooltipBox.top + tooltipBox.height / 2;
    const steps = 10;

    // Sweep top to bottom
    for (let i = 0; i <= steps; i++) {
      const y = tooltipBox.top + 10 + (tooltipBox.height - 20) * (i / steps);
      await page.mouse.move(centerX, y);
      await page.waitForTimeout(30);
    }

    // Sweep left to right
    for (let i = 0; i <= steps; i++) {
      const x = tooltipBox.left + 10 + (tooltipBox.width - 20) * (i / steps);
      await page.mouse.move(x, centerY);
      await page.waitForTimeout(30);
    }

    // Tooltip should still be visible after hovering
    const stillVisible = await page.evaluate(() => window._tooltip.visible);
    assert(stillVisible, 'Tooltip stays visible during cursor movement over it');

    await page.screenshot({ path: path.join(screenshotDir, '08-cursor-sweep.png') });
    await page.close();
  }

  // ===================================================================
  // TEST 9: Rapid tab toggling doesn't break
  // ===================================================================
  log('\nTest 9: Rapid tab toggling stress test', 'yellow');
  {
    const page = await createPage(cardSizes.topshot.width, cardSizes.topshot.height);
    await renderOnPage(page, fixtures.topshot_active, 3.5, 'https://nbatopshot.com/listings/p2p/100+200');

    // Click tabs rapidly 30 times
    const survived = await page.evaluate(() => {
      const container = window._tooltip.container;
      const tabs = ['price', 'supply', 'offers'];
      try {
        for (let i = 0; i < 30; i++) {
          const tabName = tabs[i % 3];
          container.querySelector(`.vp-tab[data-tab="${tabName}"]`).click();
        }
        // After 30 clicks, last click is tabs[29 % 3] = tabs[2] = "offers"
        const activeTab = container.querySelector('.vp-tab-active').dataset.tab;
        return { ok: true, activeTab };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });

    assert(survived.ok, 'Survived 30 rapid tab switches without errors');
    assert(survived.activeTab === 'offers', `Correct tab active after cycling (got: ${survived.activeTab})`);

    await page.close();
  }

  // ===================================================================
  // SUMMARY
  // ===================================================================
  log('\n=== Summary ===', 'cyan');
  log(`Passed: ${passCount}`, 'green');
  log(`Failed: ${failCount}`, failCount > 0 ? 'red' : 'green');

  // List screenshots
  const shots = fs.readdirSync(screenshotDir).filter(f => f.endsWith('.png'));
  if (shots.length > 0) {
    log(`\nScreenshots saved to test/screenshots/:`, 'blue');
    shots.forEach(s => log(`  ${s}`, 'blue'));
  }

  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch((err) => {
  log(`Fatal: ${err.message}`, 'red');
  console.error(err.stack);
  process.exit(1);
});
