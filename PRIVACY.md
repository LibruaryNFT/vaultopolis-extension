# Privacy Policy — Vaultopolis Extension

**Last updated:** March 2026

## What this extension does

Vaultopolis is a Chrome extension that shows market analytics (floor price, trading activity, supply data) when you browse NBA Top Shot, NFL All Day, and Disney Pinnacle marketplace pages. It overlays a tooltip on edition cards with data from the Vaultopolis API.

## Data we collect

**None.** This extension does not collect, store, or transmit any personal data.

Specifically, the extension does NOT access or collect:
- Your browsing history
- Your wallet address or account information
- Your username or profile on any marketplace
- Your purchase history or owned collectibles
- Cookies, session tokens, or login credentials
- Any data from pages other than the supported marketplaces

## Network requests

The extension makes read-only API calls to `api.vaultopolis.com` to fetch **public market data** (edition prices, supply counts, trading volumes). These requests contain only edition identifiers — no user information. The API may log request metadata (IP address, request time) for standard infrastructure monitoring, but this data is not linked to any user identity.

No requests are made to any analytics, advertising, or tracking services.

## Data we store locally

The extension stores only your UI preferences (overlay toggle, video blocking settings) in Chrome's local storage. These settings never leave your browser.

## Third-party code

The extension contains no third-party scripts, analytics libraries, tracking pixels, or CDN-loaded code. All code is bundled locally at build time.

## Permissions

- `storage` — Save your UI preferences locally
- `host_permissions` for marketplace domains — Run on supported marketplaces
- `host_permissions` for `api.vaultopolis.com` — Fetch public market data

## Open source

The complete source code is publicly available for audit at: https://github.com/LibruaryNFT/vaultopolis-extension

## Contact

Questions about privacy? Reach us at:
- Twitter/X: [@vaultopolis](https://x.com/vaultopolis)
- Discord: [discord.gg/nJdwqYfenh](https://discord.gg/nJdwqYfenh)
