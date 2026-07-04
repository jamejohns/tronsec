# Security policy

## Supported versions

| Version | Supported |
|:--|:--|
| `main` / **v1.2.0+** | Yes |
| v1.0 – v1.1 | Best-effort |

Live app: **[tronsec.io/app](https://tronsec.io/app/)**

## Production credential handling

**tronsec.io does not expose API keys in the browser.**

- Static assets are served from Cloudflare Pages.
- Upstream API calls use a **Cloudflare Worker** proxy.
- TronGrid, TronScan, VirusTotal, and optional Telegram delivery credentials are stored as **worker secrets** (Wrangler), not in JavaScript served to users.
- `secrets.local.js` is gitignored and **not loaded** on the production site.

Auditors reviewing the live site should find only `proxy-config.js` (public worker URL) and empty placeholders in `secrets.js`.

See [ARCHITECTURE.md](ARCHITECTURE.md).

## Reporting a vulnerability

**Please do not open public issues for security bugs.**

1. Contact via [Telegram community](https://t.me/tronsec_chat) (maintainer).
2. Include steps to reproduce, impact, and affected module.
3. Allow up to **7 business days** for an initial response.

We appreciate responsible disclosure.

## Design principles

- **Read-only by default** — no wallet connect, no transaction signing from this UI.
- **No seed phrases** — never ask for wallet mnemonics (vanity generator creates new keys locally only).
- **Server-side API keys on production** — worker proxy; never commit real keys to git.
- **Vanity generator** — runs in browser Web Workers; you export keys yourself.

## Forking

Deploy your own worker, store secrets server-side, restrict CORS. Do not ship API keys inside static JS served to end users.
