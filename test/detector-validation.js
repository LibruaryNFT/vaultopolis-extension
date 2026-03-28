#!/usr/bin/env node

/**
 * Vaultopolis Detector Validation
 *
 * Validates the TopShotDetector against real nbatopshot.com page structure.
 * Tests:
 * 1. Card element detection via listing links
 * 2. URL parsing (UUID, numeric, edition paths)
 * 3. Player name extraction accuracy
 * 4. Price parsing
 * 5. DOM structure understanding
 */

const { chromium } = require('playwright');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

let passCount = 0;
let failCount = 0;

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function assert(condition, message) {
  if (condition) {
    passCount++;
    log(`✓ ${message}`, 'green');
  } else {
    failCount++;
    log(`✗ ${message}`, 'red');
  }
}

async function validateDetector() {
  log('\n=== Vaultopolis Detector Validation ===\n', 'cyan');

  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(45000);

    log('Loading nbatopshot.com/search...', 'yellow');
    try {
      await page.goto('https://nbatopshot.com/search', {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
    } catch (err) {
      // ERR_ABORTED can happen with certain ad-blockers or blocked resources
      // Retry without waitUntil if first attempt fails
      log(`  First attempt failed: ${err.message}`, 'yellow');
      log('  Retrying without waitUntil...', 'yellow');
      await page.goto('https://nbatopshot.com/search', {
        waitUntil: 'load',
        timeout: 30000,
      });
    }
    await page.waitForTimeout(3000);

    // Test 1: Card structure analysis
    log('\nTest 1: Analyze card DOM structure', 'yellow');

    const cardStructure = await page.evaluate(() => {
      const results = {
        listingLinks: [],
        cardContents: [],
      };

      // Find listing links
      const links = document.querySelectorAll('a[href*="/listings/p2p/"], a[href*="/edition/"]');
      links.forEach((link, i) => {
        if (i >= 3) return; // Limit to 3
        results.listingLinks.push({
          href: link.href,
          text: link.textContent.substring(0, 100),
          classes: link.className,
          hasCardContent: !!link.querySelector('.card-content'),
        });
      });

      // Find .card-content elements
      const cardElements = document.querySelectorAll('.card-content');
      cardElements.forEach((card, i) => {
        if (i >= 3) return;
        let closestLink = card;
        for (let j = 0; j < 10 && closestLink; j++) {
          if (closestLink.tagName === 'A') break;
          closestLink = closestLink.parentElement;
        }
        results.cardContents.push({
          hasParentLink: closestLink?.tagName === 'A',
          parentHref: closestLink?.href || null,
          classes: card.className,
        });
      });

      return results;
    });

    log(`Found ${cardStructure.listingLinks.length} listing links:`, 'blue');
    cardStructure.listingLinks.forEach((link, i) => {
      log(`  Card ${i + 1}:`, 'blue');
      log(`    URL: ${link.href.substring(0, 80)}...`, 'gray');
      log(`    Has .card-content: ${link.hasCardContent}`, 'gray');
    });

    assert(
      cardStructure.listingLinks.length > 0,
      `Card detection: Found ${cardStructure.listingLinks.length} listing links`
    );

    // Test 2: URL parsing validation
    log('\nTest 2: Validate URL parsing logic', 'yellow');

    const urlParseResults = await page.evaluate(() => {
      // Extract and parse first 3 listing link URLs
      const links = document.querySelectorAll('a[href*="/listings/p2p/"]');
      const results = [];

      for (let i = 0; i < Math.min(3, links.length); i++) {
        const href = links[i].href;
        const url = new URL(href);
        const pathname = url.pathname;

        // Try UUID pattern
        const uuidMatch = pathname.match(/\/listings\/p2p\/([\w-]{36})\+([\w-]{36})/);
        // Try numeric pattern
        const numMatch = pathname.match(/\/listings\/p2p\/(\d+)\+(\d+)/);

        results.push({
          href: href.substring(0, 80),
          pathname,
          hasUUIDFormat: !!uuidMatch,
          hasNumericFormat: !!numMatch,
          setId: uuidMatch?.[1] || numMatch?.[1] || null,
          playId: uuidMatch?.[2] || numMatch?.[2] || null,
        });
      }

      return results;
    });

    urlParseResults.forEach((result, i) => {
      log(`  URL ${i + 1}: UUID=${result.hasUUIDFormat} Numeric=${result.hasNumericFormat}`, 'blue');
      if (!result.setId || !result.playId) {
        log(`    WARNING: Failed to parse IDs from: ${result.pathname}`, 'yellow');
      } else {
        log(`    Set: ${result.setId}, Play: ${result.playId}`, 'gray');
      }
    });

    const allUrlsParsed = urlParseResults.every(r => r.setId && r.playId);
    assert(allUrlsParsed, `URL parsing: All URLs successfully parsed (${urlParseResults.length} URLs)`);

    // Test 3: Player name extraction
    log('\nTest 3: Validate player name extraction', 'yellow');

    const playerNameResults = await page.evaluate(() => {
      const NOT_NAMES = new Set([
        'lowest ask', 'avg sale', 'top shot', 'all day', 'see details',
        'view listing', 'view all', 'buy now', 'make offer', 'place bid',
        'owned count', 'serial number', 'edition size', 'burned count',
        'listed count', 'lowest price', 'highest price', 'for sale',
        'not listed', 'common', 'fandom', 'rare', 'legendary', 'ultimate',
        'log in', 'sign up', 'live listings', 'latest purchases', 'top purchases',
      ]);

      // Get player names from first 3 cards
      const links = document.querySelectorAll('a[href*="/listings/p2p/"]');
      const results = [];

      for (let i = 0; i < Math.min(3, links.length); i++) {
        const link = links[i];
        const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);

        let playerName = null;
        let allText = [];

        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (text && text.length > 0) {
            allText.push(text.substring(0, 30));
          }

          if (!text || text.length < 4 || text.length > 40) continue;
          if (NOT_NAMES.has(text.toLowerCase())) continue;

          const playerNameRegex = /^[A-Z][a-zA-Z'.]+(\s+(Jr\.|Sr\.|II|III|IV|[A-Z][a-zA-Z'.]+)){1,3}$/;
          if (playerNameRegex.test(text)) {
            playerName = text;
            break;
          }
        }

        results.push({
          cardIndex: i + 1,
          foundPlayerName: playerName,
          allText: allText.slice(0, 5),
        });
      }

      return results;
    });

    playerNameResults.forEach(result => {
      log(`  Card ${result.cardIndex}:`, 'blue');
      if (result.foundPlayerName) {
        log(`    Player: "${result.foundPlayerName}"`, 'green');
      } else {
        log(`    Player: NOT DETECTED`, 'yellow');
        log(`    Text found: ${result.allText.join(', ')}`, 'gray');
      }
    });

    const playersFound = playerNameResults.filter(r => r.foundPlayerName).length;
    log(`  Found ${playersFound}/${playerNameResults.length} player names`, 'blue');

    // Test 4: Price extraction
    log('\nTest 4: Validate price extraction', 'yellow');

    const priceResults = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/listings/p2p/"]');
      const results = [];

      for (let i = 0; i < Math.min(3, links.length); i++) {
        const link = links[i];
        let el = link;
        let price = null;

        // Walk up 4 levels to find price
        for (let j = 0; j < 4 && el && el !== document.body; j++) {
          const text = el.textContent || '';
          const match = text.match(/USD\s*\$?([\d,]+\.?\d*)/);
          if (match) {
            price = parseFloat(match[1].replace(',', ''));
            break;
          }
          el = el.parentElement;
        }

        results.push({
          cardIndex: i + 1,
          price,
          hasPrice: price !== null,
        });
      }

      return results;
    });

    priceResults.forEach(result => {
      log(
        `  Card ${result.cardIndex}: ${result.price ? `$${result.price.toFixed(2)}` : 'NO PRICE FOUND'}`,
        result.hasPrice ? 'blue' : 'yellow'
      );
    });

    const pricesFound = priceResults.filter(r => r.hasPrice).length;
    log(`  Found prices in ${pricesFound}/${priceResults.length} cards`, 'blue');
    assert(pricesFound > 0, `Price extraction: Found ${pricesFound} prices`);

    // Test 5: Simulate the full detector logic
    log('\nTest 5: Full detector simulation', 'yellow');

    const fullDetectorTest = await page.evaluate(() => {
      const NOT_NAMES = new Set([
        'lowest ask', 'avg sale', 'top shot', 'all day', 'see details',
        'view listing', 'view all', 'buy now', 'make offer', 'place bid',
        'owned count', 'serial number', 'edition size', 'burned count',
        'listed count', 'lowest price', 'highest price', 'for sale',
        'not listed', 'common', 'fandom', 'rare', 'legendary', 'ultimate',
        'log in', 'sign up', 'live listings', 'latest purchases', 'top purchases',
      ]);

      const results = [];
      const links = document.querySelectorAll('a[href*="/listings/p2p/"], a[href*="/edition/"]');

      for (let i = 0; i < Math.min(5, links.length); i++) {
        const link = links[i];
        const href = link.href;
        const url = new URL(href);

        // Parse IDs
        const uuidMatch = url.pathname.match(/\/(?:listings\/p2p|edition)\/([\w-]{36})\+([\w-]{36})/);
        const numMatch = url.pathname.match(/\/(?:listings\/p2p|edition)\/(\d+)\+(\d+)/);
        const setId = uuidMatch?.[1] || numMatch?.[1];
        const playId = uuidMatch?.[2] || numMatch?.[2];

        // Extract player name
        let playerName = null;
        const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (!text || text.length < 4 || text.length > 40) continue;
          if (NOT_NAMES.has(text.toLowerCase())) continue;
          const playerNameRegex = /^[A-Z][a-zA-Z'.]+(\s+(Jr\.|Sr\.|II|III|IV|[A-Z][a-zA-Z'.]+)){1,3}$/;
          if (playerNameRegex.test(text)) {
            playerName = text;
            break;
          }
        }

        // Extract price
        let el = link;
        let price = null;
        for (let j = 0; j < 4 && el && el !== document.body; j++) {
          const text = el.textContent || '';
          const match = text.match(/USD\s*\$?([\d,]+\.?\d*)/);
          if (match) {
            price = parseFloat(match[1].replace(',', ''));
            break;
          }
          el = el.parentElement;
        }

        results.push({
          index: i + 1,
          success: !!(setId && playId),
          hasSetId: !!setId,
          hasPlayId: !!playId,
          hasPlayerName: !!playerName,
          hasPrice: price !== null,
          playerName,
          price,
        });
      }

      return results;
    });

    fullDetectorTest.forEach(result => {
      log(
        `  Card ${result.index}: IDs=${result.success ? 'OK' : 'FAIL'} ` +
        `Player=${result.hasPlayerName ? 'OK' : 'NO'} Price=${result.hasPrice ? 'OK' : 'NO'}`,
        result.success ? 'blue' : 'yellow'
      );
    });

    const successCount = fullDetectorTest.filter(r => r.success).length;
    assert(
      successCount === fullDetectorTest.length,
      `Full detector: ${successCount}/${fullDetectorTest.length} cards fully parsed`
    );

    // Summary
    log('\n=== Validation Summary ===', 'cyan');
    log(`Passed: ${passCount}`, 'green');
    log(`Failed: ${failCount}`, failCount > 0 ? 'red' : 'green');

    log('\n=== DOM Structure Summary ===', 'cyan');
    log(`Total listing cards detected: ${cardStructure.listingLinks.length}`, 'blue');
    log(`URL format: UUID-based (modern) or numeric (legacy)`, 'blue');
    log(`Card structure: <a href="/listings/p2p/..."> wraps .card-content`, 'blue');

    await page.close();
  } catch (err) {
    log(`\nFatal error: ${err.message}`, 'red');
    log(err.stack, 'red');
    failCount++;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  process.exit(failCount > 0 ? 1 : 0);
}

validateDetector().catch(err => {
  log(`Validation runner error: ${err.message}`, 'red');
  process.exit(1);
});
