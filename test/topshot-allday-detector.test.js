#!/usr/bin/env node
/**
 * TopShot + AllDay detector DOM verification test.
 * Loads the extension in Chrome, navigates to each marketplace,
 * and verifies card detection works (links found, cards resolved, pills injected).
 */

const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const colors = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

let pass = 0, fail = 0;
const log = (msg, c = 'reset') => console.log(`${colors[c]}${msg}${colors.reset}`);
function assert(ok, msg) {
  if (ok) { pass++; log(`✓ ${msg}`, 'green'); }
  else    { fail++; log(`✗ ${msg}`, 'red'); }
}

async function testMarket(browser, { name, prefix, url, waitMs, linkPattern, detailsUrl, mockEditionId, mockBody }) {
  log(`\n${'─'.repeat(60)}`, 'cyan');
  log(`Market: ${name}`, 'cyan');
  log(`${'─'.repeat(60)}`, 'cyan');

  const vpLogs = [];
  const page = await browser.newPage();

  // Mock the details API so analytics tabs render without real network
  await browser.route(detailsUrl, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockBody) });
  });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes(`[VP:${prefix}`)) {
      vpLogs.push(text);
      log(`  console: ${text}`, 'gray');
    }
  });

  log(`Loading ${name} marketplace...`, 'yellow');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  log(`Waiting up to ${waitMs / 1000}s for cards...`, 'yellow');
  await page.waitForTimeout(waitMs);

  // ── Test 1: content script activated ───────────────────────────────────────
  log(`\nTest [${name}] 1: Content script activation`, 'yellow');
  const activated = vpLogs.some(l => l.includes('content script active'));
  assert(activated, `${name}: Content script fired`);

  // ── Test 2: links found ─────────────────────────────────────────────────────
  log(`\nTest [${name}] 2: Link detection`, 'yellow');
  const scanWithLinks = vpLogs.find(l => new RegExp(`links found: ([1-9]\\d*)`).test(l));
  const linkCount = scanWithLinks ? parseInt(scanWithLinks.match(/links found: (\d+)/)[1]) : 0;
  assert(linkCount > 0, `${name}: Found ${linkCount} card links`);

  // ── Test 3: cards resolved ──────────────────────────────────────────────────
  log(`\nTest [${name}] 3: Card container resolution`, 'yellow');
  const scanWithCards = vpLogs.find(l => /cards resolved: ([1-9]\d*)/.test(l));
  const cardCount = scanWithCards ? parseInt(scanWithCards.match(/cards resolved: (\d+)/)[1]) : 0;
  assert(cardCount > 0, `${name}: Resolved ${cardCount} card containers`);

  // ── Test 4: first card has an ID ────────────────────────────────────────────
  log(`\nTest [${name}] 4: Edition/moment ID extraction`, 'yellow');
  const idLog = vpLogs.find(l => l.includes('First card'));
  const idMatch = idLog?.match(/id: ([^\s,]+)/);
  assert(!!idMatch, `${name}: ID extracted: ${idMatch?.[1] ?? 'none'}`);

  // ── Test 5: pills injected ──────────────────────────────────────────────────
  log(`\nTest [${name}] 5: Pill injection`, 'yellow');
  const pillCount = await page.evaluate(() => document.querySelectorAll('.vp-pill').length);
  assert(pillCount > 0, `${name}: ${pillCount} .vp-pill elements in DOM`);

  // ── Test 6: no pill inside overlay (the bug we fixed) ─────────────────────
  log(`\nTest [${name}] 6: No pill spawned inside overlay`, 'yellow');
  // Click first pill to open overlay, wait 6s for analytics to load, check no .vp-pill inside
  const overlayCheckResult = await page.evaluate(async () => {
    const pill = document.querySelector('.vp-pill');
    if (!pill) return { error: 'no pill' };
    pill.click();
    await new Promise(r => setTimeout(r, 6000));
    const overlay = document.querySelector('.vp-pill-overlay');
    if (!overlay) return { overlayVisible: false, pillsInsideOverlay: 0 };
    const pillsInside = overlay.querySelectorAll('.vp-pill').length;
    return { overlayVisible: overlay.style.display !== 'none', pillsInsideOverlay: pillsInside };
  });
  log(`  overlay visible: ${overlayCheckResult.overlayVisible}, pills inside: ${overlayCheckResult.pillsInsideOverlay}`, 'gray');
  assert(
    overlayCheckResult.pillsInsideOverlay === 0,
    `${name}: No duplicate pill spawned inside overlay (found ${overlayCheckResult.pillsInsideOverlay})`
  );

  // ── Test 7: overlay shows analytics tabs (not just loading state) ──────────
  log(`\nTest [${name}] 7: Overlay shows analytics tabs`, 'yellow');
  const overlayResult = await page.evaluate(() => {
    const body = document.querySelector('.vp-pill-overlay .vp-pill-body');
    if (!body) return { text: '', hasTabs: false };
    const text = (body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const hasTabs = body.querySelectorAll('.vp-pill-tab').length > 0;
    return { text, hasTabs };
  });
  log(`  overlay text: "${overlayResult.text}"`, 'gray');
  log(`  has tabs: ${overlayResult.hasTabs}`, 'gray');
  assert(overlayResult.hasTabs, `${name}: Analytics tabs rendered (not stuck at loading)`);

  // ── DOM structure dump ──────────────────────────────────────────────────────
  log(`\nDOM around first pill (${name}):`, 'cyan');
  const domDump = await page.evaluate(() => {
    const pill = document.querySelector('.vp-pill');
    if (!pill) return 'no pill';
    let el = pill.parentElement;
    const lines = [];
    for (let i = 0; i < 5 && el && el !== document.body; i++) {
      const rect = el.getBoundingClientRect();
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      lines.push(`${i}: ${el.tagName}.${(el.className || '').slice(0, 40)} [${Math.round(rect.width)}x${Math.round(rect.height)}] "${txt}"`);
      el = el.parentElement;
    }
    return lines.join('\n');
  });
  log(domDump, 'gray');

  const shot = path.resolve(__dirname, `../test-screenshots/${name.toLowerCase().replace(/\s/g, '-')}-test-latest.png`);
  await page.screenshot({ path: shot, fullPage: false });
  log(`Screenshot: ${shot}`, 'blue');

  await page.close();
}

async function run() {
  log('\n=== TopShot + AllDay Detector Test ===\n', 'cyan');
  let browser;

  try {
    const tmpProfile = path.join(os.tmpdir(), `vp-test-${crypto.randomBytes(6).toString('hex')}`);
    const extPath = path.resolve(__dirname, '..');
    log(`Extension: ${extPath}`, 'gray');

    browser = await chromium.launchPersistentContext(tmpProfile, {
      headless: false,
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        '--no-sandbox',
      ],
      viewport: { width: 1400, height: 900 },
    });

    await testMarket(browser, {
      name: 'TopShot',
      prefix: 'TopShot',
      url: 'https://nbatopshot.com/search',
      waitMs: 20000,
      detailsUrl: 'https://api.vaultopolis.com/extension/v1/details/topshot',
      mockEditionId: '1',
      mockBody: {
        editions: [{
          setID: '1', playID: '1',
          floor_price: 5, estimated_value: 8,
          existing_supply: 60000, unique_holders: 12000,
          listed_count: 500, asp_7d: 6, asp_30d: 6.5,
          last_sale_price: 5, total_sales_7d: 120,
          total_sales_30d: 480, liquidity_score: 65,
          highest_offer: 4, offer_count: 30,
        }],
      },
    });

    await testMarket(browser, {
      name: 'AllDay',
      prefix: 'AllDay',
      url: 'https://nflallday.com/marketplace/moments',
      waitMs: 20000,
      detailsUrl: 'https://api.vaultopolis.com/extension/v1/details/allday',
      mockEditionId: '1',
      mockBody: {
        editions: [{
          edition_id: '1',
          floor_price: 3, estimated_value: 5,
          existing_supply: 10000, unique_holders: 4000,
          listed_count: 200, asp_7d: 3.5, asp_30d: 4,
          last_sale_price: 3, total_sales_7d: 40,
          total_sales_30d: 160, liquidity_score: 50,
        }],
      },
    });

  } catch (err) {
    log(`\nFatal: ${err.message}`, 'red');
    fail++;
  } finally {
    if (browser) await browser.close();
  }

  log('\n=== Summary ===', 'cyan');
  log(`Passed: ${pass}`, 'green');
  log(`Failed: ${fail}`, fail > 0 ? 'red' : 'green');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
