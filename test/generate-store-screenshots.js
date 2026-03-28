#!/usr/bin/env node

/**
 * Generate polished screenshots for the GitHub README and Chrome Web Store.
 * Renders tooltips on realistic card backgrounds in headless Chromium.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const storeDir = path.resolve(__dirname, '..', 'assets', 'store');
const tooltipSrc = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'tooltip.js'), 'utf-8');
const popupHtml = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'popup.html'), 'utf-8');
const popupJs = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'popup.js'), 'utf-8');

if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir, { recursive: true });

const fixtures = {
  topshot: {
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
  allday: {
    player_name: 'Patrick Mahomes',
    tier: 'Rare',
    floor_price: 12.5,
    estimated_value: 15.0,
    value_confidence: 'high',
    total_sales_7d: 6,
    total_sales_30d: 18,
    total_sales_180d: 65,
    days_since_last_sale: 1,
    asp_7d: 14,
    asp_30d: 13.5,
    last_sale_price: 13,
    existing_supply: 2500,
    total_listings: 180,
    unique_holders: 1800,
    concentration_pct: 2.1,
    floating_supply_pct: 88,
    highest_edition_offer: 11,
    edition_offer_count: 5,
    setID: '50',
    playID: '60',
  },
  pinnacle: {
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
  legendary: {
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

async function createTooltipPage(browser, width, height, ed, listingPrice, listingUrl, tab) {
  const page = await browser.newPage({ viewport: { width: width + 40, height: height + 40 } });
  await page.setContent(`
    <html>
    <body style="margin:0; background:#0a0a18; display:flex; align-items:center; justify-content:center; height:100vh;">
      <div id="card" style="width:${width}px; height:${height}px;"></div>
    </body>
    </html>
  `);

  await page.evaluate((src) => {
    window.chrome = { runtime: { getURL: (p) => `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>` } };
    const code = src.replace(/^export\s+/gm, '');
    new Function(code + '\nwindow.Tooltip = Tooltip;')();
  }, tooltipSrc);

  await page.evaluate(({ ed, price, url, tab }) => {
    const card = document.getElementById('card');
    const rect = card.getBoundingClientRect();
    const t = new window.Tooltip();
    window._tooltip = t;
    t.showLoading({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    t.showData({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, ed, price, url);

    if (tab && tab !== 'price') {
      const container = t.container;
      container.querySelector(`.vp-tab[data-tab="${tab}"]`).click();
    }
  }, { ed, price: listingPrice, url: listingUrl, tab });

  return page;
}

async function run() {
  console.log('Generating store screenshots...\n');

  const browser = await chromium.launch({ headless: true });

  // 1. Top Shot — Price tab
  console.log('  1/6 Top Shot (Price tab)');
  let page = await createTooltipPage(browser, 320, 420, fixtures.topshot, 3.5, 'https://nbatopshot.com/listings/p2p/100+200', 'price');
  await page.screenshot({ path: path.join(storeDir, 'screenshot-topshot-price.png') });
  await page.close();

  // 2. Top Shot — Supply tab
  console.log('  2/6 Top Shot (Supply tab)');
  page = await createTooltipPage(browser, 320, 420, fixtures.legendary, 400, 'https://nbatopshot.com/listings/p2p/5+6', 'supply');
  await page.screenshot({ path: path.join(storeDir, 'screenshot-topshot-supply.png') });
  await page.close();

  // 3. All Day — Price tab
  console.log('  3/6 NFL All Day (Price tab)');
  page = await createTooltipPage(browser, 340, 450, fixtures.allday, 10, 'https://nflallday.com/listing/123', 'price');
  await page.screenshot({ path: path.join(storeDir, 'screenshot-allday-price.png') });
  await page.close();

  // 4. Pinnacle — Compact
  console.log('  4/6 Disney Pinnacle (compact)');
  page = await createTooltipPage(browser, 190, 280, fixtures.pinnacle, null, null, 'price');
  await page.screenshot({ path: path.join(storeDir, 'screenshot-pinnacle-compact.png') });
  await page.close();

  // 5. Offers tab
  console.log('  5/6 Offers tab');
  page = await createTooltipPage(browser, 320, 420, fixtures.topshot, 3.5, 'https://nbatopshot.com/listings/p2p/100+200', 'offers');
  await page.screenshot({ path: path.join(storeDir, 'screenshot-offers-tab.png') });
  await page.close();

  // 6. Popup settings
  console.log('  6/6 Popup settings');
  page = await browser.newPage({ viewport: { width: 320, height: 500 } });
  // Render the popup HTML with mocked chrome.storage
  const modifiedPopupHtml = popupHtml.replace(
    '<script src="popup.js"></script>',
    `<script>
      window.chrome = {
        storage: {
          local: {
            get: function(keys, cb) {
              cb({ enabled: true, blockVideos: true, reduceImages: false, blockAllMedia: false });
            },
            set: function() {}
          }
        }
      };
    </script>
    <script>${popupJs}</script>`
  );
  await page.setContent(modifiedPopupHtml);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(storeDir, 'screenshot-popup.png') });
  await page.close();

  await browser.close();

  const files = fs.readdirSync(storeDir).filter(f => f.endsWith('.png'));
  console.log(`\nDone — ${files.length} screenshots saved to assets/store/:`);
  files.forEach(f => console.log(`  ${f}`));
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
