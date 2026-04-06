// Fix logo path for Chrome extension context
document.getElementById('logo').src = chrome.runtime.getURL('assets/logo.svg');

// Show version from manifest
const { version } = chrome.runtime.getManifest();
document.getElementById('version').textContent = `v${version}`;

const ALL_KEYS = ['enabled', 'alwaysOn', 'blockVideos', 'reduceImages', 'blockAllMedia'];

const DEFAULTS = {
  enabled: true,
  alwaysOn: false,
  blockVideos: false,
  reduceImages: false,
  blockAllMedia: false,
};

// Load saved state
chrome.storage.local.get(ALL_KEYS, (result) => {
  for (const key of ALL_KEYS) {
    const el = document.getElementById(key);
    if (el) el.checked = result[key] !== undefined ? result[key] : DEFAULTS[key];
  }
});

// Save on change
for (const key of ALL_KEYS) {
  const el = document.getElementById(key);
  if (!el) continue;
  el.addEventListener('change', () => {
    const update = { [key]: el.checked };

    if (key === 'blockAllMedia') {
      // Toggling the master also toggles sub-options
      document.getElementById('blockVideos').checked = el.checked;
      document.getElementById('reduceImages').checked = el.checked;
      update.blockVideos = el.checked;
      update.reduceImages = el.checked;
    }

    if ((key === 'blockVideos' || key === 'reduceImages') && !el.checked) {
      // If a sub-option is manually unchecked, the master can't be fully "on"
      document.getElementById('blockAllMedia').checked = false;
      update.blockAllMedia = false;
    }

    chrome.storage.local.set(update);
  });
}
