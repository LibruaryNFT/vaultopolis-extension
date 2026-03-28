#!/usr/bin/env node

/**
 * Headless tooltip rendering tests.
 * Validates that the tooltip HTML output is correct after removing
 * market badges, deal badges, and valuation lines.
 *
 * Runs in headless Chromium — no popups, no live sites.
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

// Read the built content scripts to extract tooltip class
const distDir = path.resolve(__dirname, '..', 'dist');

async function run() {
  log('\n=== Vaultopolis Tooltip Headless Tests ===\n', 'cyan');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Load the tooltip source as a module in the page
  const tooltipSrc = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'tooltip.js'),
    'utf-8'
  );

  // Inject tooltip class into page (strip export, mock chrome.runtime)
  await page.setContent(`<html><body><div id="card" style="width:300px;height:400px;"></div></body></html>`);
  await page.evaluate((src) => {
    // Mock chrome.runtime.getURL
    window.chrome = { runtime: { getURL: (p) => `chrome-extension://fake/${p}` } };

    // Execute tooltip source (strip export keyword)
    const code = src.replace(/^export\s+/gm, '');
    const fn = new Function(code + '\nwindow.Tooltip = Tooltip;');
    fn();
  }, tooltipSrc);

  // Helper: render tooltip with given edition data and return innerHTML
  async function renderTooltip(editionData, listingPrice = null, listingUrl = null) {
    return page.evaluate(({ ed, price, url }) => {
      const tooltip = new window.Tooltip();
      const rect = { left: 0, top: 0, width: 300, height: 400 };
      tooltip.showLoading(rect);
      tooltip.showData(rect, ed, price, url);
      return tooltip.container.innerHTML;
    }, { ed: editionData, price: listingPrice, url: listingUrl });
  }

  // --- Test 1: Basic render with active market data ---
  log('Test 1: Active market — no market/deal/valuation badges', 'yellow');
  {
    const html = await renderTooltip({
      player_name: 'LeBron James',
      tier: 'Legendary',
      floor_price: 500,
      estimated_value: 600,
      value_confidence: 'high',
      total_sales_7d: 12,
      total_sales_30d: 40,
      total_sales_180d: 100,
      days_since_last_sale: 0,
      asp_7d: 520,
      asp_30d: 510,
      last_sale_price: 515,
      existing_supply: 49,
      setID: '1',
      playID: '2',
    }, 400, 'https://nbatopshot.com/listings/p2p/1+2');

    assert(html.includes('LeBron James'), 'Player name rendered');
    assert(html.includes('LEGENDARY'), 'Tier badge rendered');
    assert(!html.includes('Active</span>'), 'No "Active" market badge');
    assert(!html.includes('Below Floor'), 'No "Below Floor" deal badge');
    assert(!html.includes('underpriced'), 'No "underpriced" valuation');
    assert(!html.includes('Fair value'), 'No "Fair value" valuation');
    assert(!html.includes('premium'), 'No "premium" valuation');
    assert(html.includes('Price'), 'Price tab exists');
    assert(html.includes('Supply'), 'Supply tab exists');
    assert(html.includes('Offers'), 'Offers tab exists');
    assert(html.includes('$500.00'), 'Floor price in Price tab');
    assert(html.includes('$600.00'), 'Est. Value in Price tab');
    assert(html.includes('View Listing'), 'View Listing button');
    assert(html.includes('Full Analytics'), 'Full Analytics button');
  }

  // --- Test 2: No sales / dormant edition ---
  log('\nTest 2: No sales edition — no "No Sales" badge', 'yellow');
  {
    const html = await renderTooltip({
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
      setID: '10',
      playID: '20',
    });

    assert(html.includes('Aaron Rodgers'), 'Player name rendered');
    assert(html.includes('ULTIMATE'), 'Tier badge rendered');
    assert(!html.includes('No Sales'), 'No "No Sales" badge');
    assert(!html.includes('Dormant'), 'No "Dormant" badge');
    assert(!html.includes('premium'), 'No premium valuation line');
    assert(html.includes('Never sold'), 'Last Activity shows "Never sold" in Price tab');
  }

  // --- Test 3: Below floor listing ---
  log('\nTest 3: Below floor listing — no deal badge', 'yellow');
  {
    const html = await renderTooltip({
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
      setID: '100',
      playID: '200',
    }, 2.0, 'https://nbatopshot.com/listings/p2p/100+200');

    assert(html.includes('Victor Wembanyama'), 'Player name rendered');
    assert(!html.includes('Below Floor'), 'No "Below Floor" badge');
    assert(!html.includes('underpriced'), 'No underpriced valuation');
    assert(!html.includes('Active'), 'No "Active" market badge');
    assert(html.includes('Sold today'), 'Last Activity in Price tab');
  }

  // --- Test 4: Disney Pinnacle (character name, compact) ---
  log('\nTest 4: Disney Pinnacle — compact mode, no badges', 'yellow');
  {
    const html = await renderTooltip({
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
      setID: '50',
      playID: '60',
    });

    assert(html.includes('Mickey Mouse'), 'Character name rendered');
    assert(html.includes('RARE'), 'Tier badge rendered');
    assert(!html.includes('Moderate'), 'No "Moderate" market badge');
    assert(!html.includes('premium'), 'No premium valuation');
    assert(!html.includes('Below Floor'), 'No deal badge');
  }

  // --- Test 5: Verify no vp-badges or vp-derived divs in output ---
  log('\nTest 5: No badge/valuation containers in HTML', 'yellow');
  {
    const html = await renderTooltip({
      player_name: 'Test Player',
      tier: 'Common',
      floor_price: 10,
      estimated_value: 10,
      value_confidence: 'high',
      total_sales_7d: 3,
      total_sales_30d: 10,
      total_sales_180d: 50,
      days_since_last_sale: 1,
      setID: '1',
      playID: '1',
    });

    assert(!html.includes('vp-badges'), 'No vp-badges container in HTML');
    assert(!html.includes('vp-derived'), 'No vp-derived container in HTML');
    assert(!html.includes('vp-badge-good'), 'No vp-badge-good class');
    assert(!html.includes('vp-badge-high'), 'No vp-badge-high class');
  }

  // --- Test 6: Tab content completeness ---
  log('\nTest 6: Tab content has all expected rows', 'yellow');
  {
    const html = await renderTooltip({
      player_name: 'Steph Curry',
      tier: 'Legendary',
      floor_price: 200,
      estimated_value: 250,
      value_confidence: 'high',
      total_sales_7d: 5,
      total_sales_30d: 15,
      total_sales_180d: 60,
      days_since_last_sale: 2,
      asp_7d: 210,
      asp_30d: 220,
      last_sale_price: 205,
      existing_supply: 99,
      total_listings: 12,
      unique_holders: 80,
      concentration_pct: 3.5,
      floating_supply_pct: 85.2,
      highest_edition_offer: 190,
      edition_offer_count: 4,
      setID: '5',
      playID: '6',
    });

    // Price tab
    assert(html.includes('Floor'), 'Price tab: Floor row');
    assert(html.includes('Est. Value'), 'Price tab: Est. Value row');
    assert(html.includes('7d Avg'), 'Price tab: 7d Avg row');
    assert(html.includes('30d Avg'), 'Price tab: 30d Avg row');
    assert(html.includes('Last Sale'), 'Price tab: Last Sale row');
    assert(html.includes('Last Activity'), 'Price tab: Last Activity row');
    assert(html.includes('2d ago'), 'Price tab: correct last activity');

    // Supply tab (hidden but in DOM)
    assert(html.includes('Supply'), 'Supply tab exists');
    assert(html.includes('Listed'), 'Supply tab: Listed row');
    assert(html.includes('Holders'), 'Supply tab: Holders row');

    // Offers tab (hidden but in DOM)
    assert(html.includes('Top Offer'), 'Offers tab: Top Offer row');
    assert(html.includes('Sales (7d)'), 'Offers tab: Sales 7d row');
    assert(html.includes('Sales (30d)'), 'Offers tab: Sales 30d row');
  }

  // --- Summary ---
  log('\n=== Summary ===', 'cyan');
  log(`Passed: ${passCount}`, 'green');
  log(`Failed: ${failCount}`, failCount > 0 ? 'red' : 'green');

  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch((err) => {
  log(`Fatal: ${err.message}`, 'red');
  console.error(err.stack);
  process.exit(1);
});
