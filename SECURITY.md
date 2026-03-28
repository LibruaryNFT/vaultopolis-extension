# Security — Vaultopolis Extension

## Architecture

- **Zero runtime dependencies.** The built extension has no npm packages — esbuild bundles everything at build time. The `node_modules` folder is dev-only (esbuild + playwright for testing).
- **No remote code.** All JavaScript is bundled locally. No CDNs, no dynamic imports, no eval().
- **Shadow DOM isolation.** The tooltip UI is rendered inside a closed Shadow DOM, preventing the host page from reading or modifying it.
- **HTML escaping.** All dynamic text (player names, prices) is escaped via `textContent` assignment before rendering to prevent XSS.

## Permissions model

The extension requests only the minimum permissions needed:

| Permission | Why |
|------------|-----|
| `storage` | Save user's toggle preferences locally |
| `nbatopshot.com/*` | Inject content script on Top Shot |
| `nflallday.com/*` | Inject content script on All Day |
| `disneypinnacle.com/*` | Inject content script on Pinnacle |
| `api.vaultopolis.com/*` | Fetch public market data (read-only, no auth) |

The extension CANNOT access other websites, tabs, browsing history, bookmarks, passwords, clipboard, camera, microphone, or geolocation.

## Open source

The complete source code is available at [github.com/LibruaryNFT/vaultopolis-extension](https://github.com/LibruaryNFT/vaultopolis-extension). You can audit every line, build from source, and verify the built output matches what runs in the extension.

## Reporting vulnerabilities

If you find a security issue, please report it responsibly:
- Twitter/X DM: [@vaultopolis](https://x.com/vaultopolis)
- Discord: [discord.gg/nJdwqYfenh](https://discord.gg/nJdwqYfenh)

Do not open a public GitHub issue for security vulnerabilities.
