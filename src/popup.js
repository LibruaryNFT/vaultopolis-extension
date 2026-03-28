// Fix logo path for Chrome extension context
document.getElementById('logo').src = chrome.runtime.getURL('assets/logo.svg');

const ALL_KEYS = ['enabled', 'blockVideos', 'reduceImages', 'blockAllMedia'];

const DEFAULTS = {
  enabled: true,
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

    if (key === 'blockAllMedia' && el.checked) {
      document.getElementById('blockVideos').checked = true;
      document.getElementById('reduceImages').checked = true;
      update.blockVideos = true;
      update.reduceImages = true;
    }

    chrome.storage.local.set(update);
  });
}
