/**
 * Vaultopolis service worker — API calls and caching.
 *
 * Data sources (tried in order):
 * 1. /topshot-market-data — full analytics (prices, volume, scores)
 * 2. /topshot-data — metadata fallback (player, tier, supply — no prices)
 * 3. /allday-market-data — NFL All Day analytics
 * 4. /pinnacle-market-data — Disney Pinnacle analytics
 */

const API_BASE = 'https://api.vaultopolis.com';
const cache = new Map();

const CACHE_TTL = {
  marketData: 15 * 60 * 1000,    // 15 minutes (was 5 — reduces API load)
  metadata: 60 * 60 * 1000,      // 1 hour
  editionSales: 2 * 60 * 1000,   // 2 minutes
  uuidMap: 24 * 60 * 60 * 1000,  // 24 hours
};

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) { cache.delete(key); return null; }
  return entry.value;
}

function setInCache(key, value, ttl) {
  cache.set(key, { value, expiry: Date.now() + ttl });
}

/**
 * Build a lookup map from editions array.
 * Keys: "setID-playID" (standard) and "setID-playID-subeditionID" (specific).
 * Base key points to subedition 0 (standard/highest supply).
 */
function buildLookup(editions) {
  const lookup = {};
  for (const ed of editions) {
    const setId = ed.set_id || ed.setID;
    const playId = ed.play_id || ed.playID;

    // Always index by edition_id (works for All Day + Pinnacle)
    const editionId = ed.edition_id;
    if (editionId) lookup[`eid-${editionId}`] = ed;

    // Skip set+play key if either is missing (Pinnacle has no play_id)
    if (!setId || !playId) continue;

    const subId = ed.subeditionID ?? ed.subedition_id ?? null;
    const supply = ed.existing_supply || ed.mint_count || ed.momentCount || 0;

    if (subId != null) lookup[`${setId}-${playId}-${subId}`] = ed;

    const baseKey = `${setId}-${playId}`;
    const existing = lookup[baseKey];
    const isStandard = subId === 0 || subId === '0' || subId === null;

    if (!existing || (isStandard && !isStandardEdition(existing)) ||
        (!isStandardEdition(existing) && supply > getSupply(existing))) {
      lookup[baseKey] = ed;
    }
  }
  return lookup;
}

function isStandardEdition(ed) {
  const sub = ed.subeditionID ?? ed.subedition_id ?? null;
  return sub === 0 || sub === '0' || sub === null;
}

function getSupply(ed) {
  return ed.existing_supply || ed.mint_count || ed.momentCount || 0;
}

/**
 * Fetch market data with timeout. Returns lookup map or throws.
 */
async function fetchWithTimeout(url, ttlKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Get the best available data source for a product.
 * Lazy — only fetches when first needed, then caches.
 */
async function getDataSource(product = 'topshot') {
  const marketKey = `${product}-market-data`;
  const metaKey = `${product}-metadata`;

  const marketCached = getFromCache(marketKey);
  if (marketCached) return marketCached;

  const metaCached = getFromCache(metaKey);

  // Try market data first
  try {
    const endpoint = product === 'topshot' ? '/topshot-market-data?limit=50000&offset=0' :
                     product === 'allday' ? '/allday-market-data?limit=50000&offset=0' :
                     '/pinnacle-market-data?limit=50000&offset=0';
    const data = await fetchWithTimeout(`${API_BASE}${endpoint}`);
    const editions = data.editions || data;
    if (Array.isArray(editions)) {
      const lookup = buildLookup(editions);
      setInCache(marketKey, lookup, CACHE_TTL.marketData);
      return lookup;
    }
  } catch {
    // Fall through to metadata
  }

  if (metaCached) return metaCached;

  // Metadata fallback
  try {
    const metaEndpoint = product === 'topshot' ? '/topshot-data' :
                         product === 'allday' ? '/allday-data' :
                         '/pinnacle-data';
    const editions = await fetchWithTimeout(`${API_BASE}${metaEndpoint}`);
    if (Array.isArray(editions)) {
      const lookup = buildLookup(editions);
      setInCache(metaKey, lookup, CACHE_TTL.metadata);
      return lookup;
    }
  } catch {
    // Both failed
  }

  return {};
}

/**
 * UUID map — reverse lookup (UUID → numeric ID).
 */
async function getUuidMap() {
  const cached = getFromCache('uuid-map');
  if (cached) return cached;

  const resp = await fetch(`${API_BASE}/topshot-uuid-map`);
  if (!resp.ok) throw new Error(`UUID map failed: ${resp.status}`);

  const data = await resp.json();
  const reverseMap = { sets: {}, plays: {} };
  for (const [numId, uuid] of Object.entries(data.sets || {})) reverseMap.sets[uuid] = numId;
  for (const [numId, uuid] of Object.entries(data.plays || {})) reverseMap.plays[uuid] = numId;

  setInCache('uuid-map', reverseMap, CACHE_TTL.uuidMap);
  return reverseMap;
}

async function resolveUuids(setUuid, playUuid) {
  const map = await getUuidMap();
  const setId = map.sets[setUuid];
  const playId = map.plays[playUuid];
  return (setId && playId) ? { setId, playId } : null;
}

async function lookupEdition(setId, playId, parallelID, listingPrice, product = 'topshot') {
  const lookup = await getDataSource(product);

  // Try subedition-specific key
  if (parallelID) {
    const sub = lookup[`${setId}-${playId}-${parallelID}`];
    if (sub) return sub;
  }

  // Price-match across subeditions
  if (listingPrice) {
    const prefix = `${setId}-${playId}-`;
    const candidates = Object.entries(lookup)
      .filter(([k]) => k.startsWith(prefix) || k === `${setId}-${playId}`)
      .map(([, ed]) => ed);

    if (candidates.length > 1) {
      let best = candidates[0], bestDiff = Infinity;
      for (const ed of candidates) {
        const diff = Math.abs((ed.floor_price || 0) - listingPrice);
        if (diff < bestDiff) { bestDiff = diff; best = ed; }
      }
      return best;
    }
  }

  return lookup[`${setId}-${playId}`] || null;
}

async function searchByName(playerName, product = 'topshot') {
  const lookup = await getDataSource(product);
  const needle = playerName.toLowerCase().trim();
  const matches = [];

  for (const ed of Object.values(lookup)) {
    const name = (ed.player_name || ed.FullName || '').toLowerCase();
    if (name === needle || name.includes(needle)) matches.push(ed);
  }

  matches.sort((a, b) => (b.floor_price || b.momentCount || 0) - (a.floor_price || a.momentCount || 0));
  return matches.slice(0, 10);
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const product = request.product || 'topshot';

  if (request.action === 'resolveAndLookup') {
    resolveUuids(request.setUuid, request.playUuid)
      .then(ids => ids ? lookupEdition(ids.setId, ids.playId, request.parallelID, request.listingPrice, product) : null)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'lookupEdition') {
    lookupEdition(request.setId, request.playId, null, null, product)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'lookupByEditionId') {
    getDataSource(product)
      .then(lookup => sendResponse({ success: true, data: lookup[`eid-${request.editionId}`] || null }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'searchByName') {
    searchByName(request.playerName, product)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'prefetchMarketData') {
    getDataSource(product)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Prefetch UUID map on install (lightweight, 24h cache)
chrome.runtime.onInstalled.addListener(() => {
  getUuidMap().catch(() => {});
});
