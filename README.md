# Vaultopolis — Collectibles Market Analytics Extension

Open-source Chrome extension that overlays real-time market analytics on NBA Top Shot, NFL All Day, and Disney Pinnacle marketplace pages.

Hover over any listing card to see floor price, estimated value, trading volume, supply data, and more — without leaving the marketplace.

<p align="center">
  <img src="assets/store/screenshot-topshot-price.png" width="240" alt="Price tab — Top Shot">
  <img src="assets/store/screenshot-topshot-supply.png" width="240" alt="Supply tab — Top Shot">
  <img src="assets/store/screenshot-offers-tab.png" width="240" alt="Offers tab">
</p>
<p align="center">
  <img src="assets/store/screenshot-allday-price.png" width="240" alt="NFL All Day">
  <img src="assets/store/screenshot-pinnacle-compact.png" width="160" alt="Disney Pinnacle (compact)">
  <img src="assets/store/screenshot-popup.png" width="220" alt="Settings popup">
</p>

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

## Install

1. Download the latest zip from the [Releases page](https://github.com/LibruaryNFT/vaultopolis-extension/releases)
2. Unzip to any folder
3. Open Chrome and go to `chrome://extensions`
4. Turn on **Developer mode** (toggle in the top right)
5. Click **Load unpacked** and select the unzipped folder
6. Visit any supported marketplace and hover over a listing card

That's it — no accounts, no build tools, no sign-up.

## Build from source (for developers)

If you want to verify or modify the code yourself:

```bash
git clone https://github.com/LibruaryNFT/vaultopolis-extension.git
cd vaultopolis-extension
npm install    # dev dependencies only (esbuild)
npm run build  # bundles src/ → dist/
```

Then load in Chrome using the same steps above (Load unpacked → select the repo folder).

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

## Feedback and suggestions

Have ideas, found a bug, or want to request a feature? Join the conversation:

- **Discord** — [discord.gg/nJdwqYfenh](https://discord.gg/nJdwqYfenh)
- **Twitter/X** — [@vaultopolis](https://x.com/vaultopolis)
- **GitHub Issues** — [open an issue](https://github.com/LibruaryNFT/vaultopolis-extension/issues)

## Contributing

Contributions welcome. Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE) — Libruary
