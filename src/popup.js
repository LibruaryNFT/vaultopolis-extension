// Fix logo path for Chrome extension context
document.getElementById('logo').src = chrome.runtime.getURL('assets/logo.svg');

// Show version from manifest
const { version } = chrome.runtime.getManifest();
document.getElementById('version').textContent = `v${version}`;

// ─── Analytics toggle ───────────────────────────────────────────────────────

chrome.storage.local.get(['enabled'], (result) => {
  const el = document.getElementById('enabled');
  if (el) el.checked = result.enabled !== false; // default: true
});

document.getElementById('enabled').addEventListener('change', (e) => {
  chrome.storage.local.set({ enabled: e.target.checked });
});

// ─── Media mode — 4-state segmented control ─────────────────────────────────
// Modes: 'normal' | 'pause' | 'block' | 'blockAll'
// Migration: if legacy boolean keys exist, convert them to mediaMode on load.

const SEG_BTNS = document.querySelectorAll('.seg-btn');

function setActiveMode(mode) {
  SEG_BTNS.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

// Load saved mode, migrating legacy boolean keys if needed
chrome.storage.local.get(['mediaMode', 'pauseVideos', 'blockVideos', 'blockAllMedia'], (result) => {
  let mode = result.mediaMode || null;

  if (!mode) {
    // Migrate from legacy boolean keys
    if (result.blockAllMedia) mode = 'blockAll';
    else if (result.blockVideos) mode = 'block';
    else if (result.pauseVideos) mode = 'pause';
    else mode = 'normal';

    // Persist migrated value and clear legacy keys
    chrome.storage.local.set({ mediaMode: mode });
    chrome.storage.local.remove(['pauseVideos', 'blockVideos', 'reduceImages', 'blockAllMedia']);
  }

  setActiveMode(mode);
});

// Save on segment click
SEG_BTNS.forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    setActiveMode(mode);
    chrome.storage.local.set({ mediaMode: mode });
  });
});
