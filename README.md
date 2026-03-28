# Vaultopolis — Collectibles Market Analytics Extension

Open-source Chrome extension that overlays real-time market analytics on NBA Top Shot, NFL All Day, and Disney Pinnacle marketplace pages.

Hover over any listing card to see floor price, estimated value, trading volume, supply data, and more — without leaving the marketplace.

## Why open source?

Browser extensions have access to the pages you visit. We believe you should be able to verify exactly what an extension does before installing it. This repository contains the complete, unobfuscated source code. There is no difference between what you see here and what runs in the extension.

## What it does

- **Price tab** — Floor price, estimated value, 7d/30d averages, last sale, last activity
- **Supply tab** — Total supply, listed count, unique holders, top holder concentration, floating supply
- **Offers tab** — Top offer, offer count, 7d/30d sales volume
- **Performance mode** — Block autoplay videos, reduce image quality, or hide all card media

## What it does NOT do

- Collect any personal data (no analytics, no tracking, no telemetry)
- Access your wallet, account, credentials, or browsing history
- Send data anywhere except `api.vaultopolis.com` (public read-only market data)
- Load remote code (no CDNs, no eval, no dynamic imports)
- Require any account or login

See [PRIVACY.md](PRIVACY.md) for the full privacy policy and [SECURITY.md](SECURITY.md) for the security architecture.

## Supported marketplaces

| Marketplace | URL |
|-------------|-----|
| NBA Top Shot | nbatopshot.com |
| NFL All Day | nflallday.com |
| Disney Pinnacle | disneypinnacle.com |

## Install from source

```bash
# Clone the repo
git clone https://github.com/LibruaryNFT/vaultopolis-extension.git
cd vaultopolis-extension

# Install dev dependencies (esbuild only — zero runtime deps)
npm install

# Build
npm run build
```

Then load in Chrome:

1. Go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `vaultopolis-extension` root folder (not `dist/`)

The extension activates automatically on supported marketplace pages.

## Project structure

```
src/
├── tooltip.js            # Analytics overlay UI (Shadow DOM)
├── content.js            # NBA Top Shot content script
├── content-allday.js     # NFL All Day content script
├── content-pinnacle.js   # Disney Pinnacle content script
├── background.js         # Service worker (API calls + caching)
├── popup.js              # Settings popup logic
├── popup.html            # Settings popup UI
└── detectors/
    ├── topshot.js        # Card detection for Top Shot
    ├── allday.js         # Card detection for All Day
    └── pinnacle.js       # Card detection for Pinnacle
```

## API endpoints

The extension calls these **public, read-only** endpoints on `api.vaultopolis.com`. No authentication required. No API keys.

| Endpoint | Purpose | Cache TTL |
|----------|---------|-----------|
| `/topshot-market-data` | Top Shot prices + analytics | 15 min |
| `/allday-market-data` | All Day prices + analytics | 15 min |
| `/pinnacle-market-data` | Pinnacle prices + analytics | 15 min |
| `/topshot-data` | Top Shot metadata (fallback) | 1 hour |
| `/allday-data` | All Day metadata (fallback) | 1 hour |
| `/pinnacle-data` | Pinnacle metadata (fallback) | 1 hour |
| `/topshot-uuid-map` | UUID → numeric ID mapping | 24 hours |

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Save toggle preferences locally |
| `nbatopshot.com/*` | Run content script on Top Shot |
| `nflallday.com/*` | Run content script on All Day |
| `disneypinnacle.com/*` | Run content script on Pinnacle |
| `api.vaultopolis.com/*` | Fetch public market data |

No access to other websites, tabs, history, bookmarks, passwords, clipboard, camera, microphone, or geolocation.

## Testing

```bash
# Headless tooltip rendering tests (47 assertions)
node test/tooltip-headless.test.js

# Visual + interaction tests with screenshots (26 assertions)
node test/tooltip-visual.test.js

# Detector validation (card detection patterns)
node test/detector-validation.js
```

## Security

- Zero runtime dependencies (esbuild bundles at build time)
- Shadow DOM isolation prevents host page interference
- All dynamic content HTML-escaped via `textContent`
- No `eval()`, no `innerHTML` with raw user input, no remote code
- Minimal Chrome permissions (storage only)

Report vulnerabilities privately via [Twitter DM](https://x.com/vaultopolis) or [Discord](https://discord.gg/nJdwqYfenh). Do not open public issues for security reports.

## Contributing

Contributions welcome. Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE) — Libruary
