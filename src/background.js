/**
 * Vaultopolis service worker — API calls, IndexedDB persistence, batch lookups.
 *
 * Architecture (v2 — April 2026):
 * 1. Fetch a lightweight index (~500 KB gzipped) per marketplace on first visit.
 *    Index contains IDs, floor price, supply, listed count + UUID mappings.
 * 2. Persist index in IndexedDB (survives MV3 service worker termination).
 * 3. On hover or always-on intersection, batch-fetch full details (~15 fields)
 *    for only the visible cards via POST /extension/v1/details/:marketplace.
 * 4. Cache full details in IndexedDB with 15-min TTL.
 *
 * Data flow:
 *   Content script → "ensureIndex" → SW fetches/caches index → ready
 *   Content script → "lookupBatch" → SW checks IDB → fetches missing → returns all
 *   Content script → "lookupOne" → SW checks IDB → fetches if needed → returns one
 */

const API_BASE = 'https://api.vaultopolis.com';

const CACHE_TTL = {
  index: 60 * 60 * 1000,    // 1 hour (lightweight, can afford longer)
  details: 15 * 60 * 1000,  // 15 minutes (price-sensitive)
};

// ─── IndexedDB helpers ──────────────────────────────────────────────────────

const DB_NAME = 'vaultopolisCache';
const DB_VERSION = 3; // bumped: delete+recreate stores to clear stale data

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Delete old stores on version bump to clear stale cached data
      for (const name of db.objectStoreNames) {
        db.deleteObjectStore(name);
      }
      db.createObjectStore('indexes', { keyPath: 'market' });
      db.createObjectStore('details', { keyPath: 'key' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function idbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(storeName, value) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbGetMany(storeName, keys) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const results = new Map();
    let pending = keys.length;
    if (pending === 0) return resolve(results);
    for (const key of keys) {
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result) results.set(key, req.result);
        if (--pending === 0) resolve(results);
      };
      req.onerror = () => {
        if (--pending === 0) resolve(results);
      };
    }
  });
}

async function idbPutMany(storeName, entries) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const entry of entries) store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** Evict stale detail entries from IndexedDB (older than TTL) */
async function evictStaleDetails() {
  try {
    const db = await openDB();
    const tx = db.transaction('details', 'readwrite');
    const store = tx.objectStore('details');
    const now = Date.now();
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (now - (cursor.value.ts || 0) > CACHE_TTL.details * 4) {
        cursor.delete(); // remove entries older than 4x TTL (1 hour)
      }
      cursor.continue();
    };
  } catch { /* ignore eviction errors */ }
}

// Run eviction on SW startup
evictStaleDetails();

// ─── In-memory index (rebuilt from IDB on SW wake) ──────────────────────────

const indexMaps = new Map(); // market → { lookup: Map, uuidLookup: Map, ts: number }

function buildIndexLookup(editions, market) {
  const lookup = new Map();    // editionId → { fp, sp, lc, ev }
  const uuidLookup = new Map(); // "setUuid+playUuid" → editionId (standard subedition)
  // For subedition-specific UUID lookups: "setUuid+playUuid+parallelID" → editionId
  const uuidSubLookup = new Map();

  for (const ed of editions) {
    lookup.set(ed.id, ed);

    // TopShot: build UUID reverse maps
    if (market === 'topshot' && ed.su && ed.pu) {
      const uuidKey = `${ed.su}+${ed.pu}`;

      // Subedition-specific key (always set)
      if (ed.sb != null) {
        uuidSubLookup.set(`${uuidKey}+${ed.sb}`, ed.id);
      }

      // Default UUID key → prefer standard subedition (sb=0 or null)
      const isStandard = ed.sb === 0 || ed.sb === null;
      if (isStandard || !uuidLookup.has(uuidKey)) {
        uuidLookup.set(uuidKey, ed.id);
      }
    }
  }

  return { lookup, uuidLookup, uuidSubLookup };
}

// ─── Fetch helpers ──────────────────────────────────────────────────────────

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(url, { signal: controller.signal, ...options });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─── Index management ───────────────────────────────────────────────────────

// Pending-promise lock prevents thundering herd when 30 cards call ensureIndex simultaneously
const pendingIndexFetches = new Map(); // market → Promise

async function ensureIndex(market) {
  // 1. Check in-memory
  const mem = indexMaps.get(market);
  if (mem && Date.now() - mem.ts < CACHE_TTL.index) return mem;

  // 2. If another call is already fetching this market, wait for it
  if (pendingIndexFetches.has(market)) {
    return pendingIndexFetches.get(market);
  }

  const promise = _fetchIndex(market);
  pendingIndexFetches.set(market, promise);
  try {
    return await promise;
  } finally {
    pendingIndexFetches.delete(market);
  }
}

async function _fetchIndex(market) {
  // Check IndexedDB
  const cached = await idbGet('indexes', market);
  if (cached && Date.now() - cached.ts < CACHE_TTL.index) {
    const { lookup, uuidLookup } = buildIndexLookup(cached.editions, market);
    const entry = { lookup, uuidLookup, ts: cached.ts };
    indexMaps.set(market, entry);
    return entry;
  }

  // Fetch from API
  const data = await fetchJSON(`${API_BASE}/extension/v1/index/${market}`);
  const editions = data.editions || [];
  const ts = Date.now();

  // Persist to IDB
  await idbPut('indexes', { market, editions, ts });

  // Build in-memory lookup
  const { lookup, uuidLookup } = buildIndexLookup(editions, market);
  const entry = { lookup, uuidLookup, ts };
  indexMaps.set(market, entry);
  return entry;
}

// ─── Detail lookups ─────────────────────────────────────────────────────────

/**
 * Resolve a content-script identifier to an edition_id.
 * TopShot cards have UUIDs in their URLs; we resolve via the index's UUID map.
 */
function resolveEditionId(market, params) {
  if (params.editionId) return params.editionId;

  if (market === 'topshot') {
    const idx = indexMaps.get(market);
    if (!idx) return null;

    // Try UUID resolution
    if (params.setUuid && params.playUuid) {
      const uuidKey = `${params.setUuid}+${params.playUuid}`;

      // If parallelID is known, try subedition-specific UUID lookup first
      if (params.parallelID != null && params.parallelID !== '') {
        const subKey = `${uuidKey}+${params.parallelID}`;
        const subId = idx.uuidSubLookup?.get(subKey);
        if (subId) return subId;
      }

      // If supply is known (from card text), match against subeditions by supply
      if (params.supply && params.supply > 0) {
        // Find all subeditions for this UUID pair and match by supply
        for (const [key, edId] of idx.uuidSubLookup || []) {
          if (key.startsWith(uuidKey + '+')) {
            const ed = idx.lookup.get(edId);
            if (ed && ed.sp === params.supply) return edId;
          }
        }
      }

      // Fall back to default (standard subedition)
      const edId = idx.uuidLookup.get(uuidKey);
      if (edId) return edId;
    }

    // Try numeric setId+playId
    if (params.setId && params.playId) {
      const subId = params.parallelID ?? '';
      const candidates = subId !== ''
        ? [`${params.setId}_${params.playId}_${subId}`, `${params.setId}_${params.playId}_0`, `${params.setId}_${params.playId}`]
        : [`${params.setId}_${params.playId}_0`, `${params.setId}_${params.playId}`];
      for (const c of candidates) {
        if (idx.lookup.has(c)) return c;
      }
    }
  }

  return null;
}

const pendingDetailFetches = new Map(); // "market:id1,id2" → Promise

async function fetchDetails(market, editionIds) {
  if (editionIds.length === 0) return new Map();

  // Check IDB cache first
  const cacheKeys = editionIds.map(id => `${market}:${id}`);
  const cached = await idbGetMany('details', cacheKeys);
  const now = Date.now();

  const results = new Map();
  const missing = [];

  for (let i = 0; i < editionIds.length; i++) {
    const cacheKey = cacheKeys[i];
    const entry = cached.get(cacheKey);
    if (entry && now - entry.ts < CACHE_TTL.details) {
      results.set(editionIds[i], entry.data);
    } else {
      missing.push(editionIds[i]);
    }
  }

  // Fetch missing from API in batches of 100
  if (missing.length > 0) {
    try {
      const batches = [];
      for (let i = 0; i < missing.length; i += 100) {
        batches.push(missing.slice(i, i + 100));
      }
      for (const batch of batches) {
        const data = await fetchJSON(`${API_BASE}/extension/v1/details/${market}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: batch }),
        });
        const editions = data.editions || [];
        const toCache = [];
        for (const ed of editions) {
          const id = ed.edition_id;
          results.set(id, ed);
          toCache.push({ key: `${market}:${id}`, data: ed, ts: now });
        }
        await idbPutMany('details', toCache);
      }
    } catch (err) {
      console.error('[Vaultopolis] Detail fetch failed:', err.message);
    }
  }

  return results;
}

// ─── Message handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const market = request.market || request.product || 'topshot';

  // Prefetch index on page load
  if (request.action === 'ensureIndex') {
    ensureIndex(market)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Quick lookup from index only (floor price, supply — no API call)
  if (request.action === 'indexLookup') {
    ensureIndex(market).then(idx => {
      const edId = resolveEditionId(market, request);
      const entry = edId ? idx.lookup.get(edId) : null;
      sendResponse({ success: true, data: entry || null, editionId: edId });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Full detail lookup for one edition (hover tooltip)
  if (request.action === 'lookupOne') {
    ensureIndex(market).then(async (idx) => {
      const edId = resolveEditionId(market, request);
      if (!edId) return sendResponse({ success: true, data: null });

      const results = await fetchDetails(market, [edId]);
      sendResponse({ success: true, data: results.get(edId) || null, editionId: edId });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Batch detail lookup (always-on mode + debounced visible cards)
  if (request.action === 'lookupBatch') {
    const ids = request.ids || [];
    ensureIndex(market).then(async () => {
      // Resolve all IDs
      const resolvedIds = ids
        .map(params => resolveEditionId(market, params))
        .filter(Boolean);

      const results = await fetchDetails(market, [...new Set(resolvedIds)]);

      // Return as array matched to input order
      const response = ids.map((params, i) => {
        const edId = resolvedIds[i] || resolveEditionId(market, params);
        return { params, editionId: edId, data: edId ? results.get(edId) || null : null };
      });

      sendResponse({ success: true, data: response });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Legacy compat: resolveAndLookup, lookupEdition, lookupByEditionId, searchByName
  // These map to the new system so existing content scripts still work during migration.
  if (request.action === 'resolveAndLookup' || request.action === 'lookupEdition' || request.action === 'lookupByEditionId') {
    ensureIndex(market).then(async () => {
      const edId = resolveEditionId(market, {
        setUuid: request.setUuid,
        playUuid: request.playUuid,
        setId: request.setId,
        playId: request.playId,
        parallelID: request.parallelID,
        editionId: request.editionId,
      });
      if (!edId) return sendResponse({ success: true, data: null });

      const results = await fetchDetails(market, [edId]);
      sendResponse({ success: true, data: results.get(edId) || null });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'searchByName') {
    // Name search still uses the index — scan for matching player names
    ensureIndex(market).then(async (idx) => {
      // Index doesn't have player names, so we can't search locally.
      // Fall back to returning null — the content script uses UUID/ID lookup primarily.
      sendResponse({ success: true, data: [] });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'prefetchMarketData') {
    ensureIndex(market)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Warm index on install
chrome.runtime.onInstalled.addListener(() => {
  // Don't block — just warm in background
  ensureIndex('topshot').catch(() => {});
  ensureIndex('pinnacle').catch(() => {});
});
