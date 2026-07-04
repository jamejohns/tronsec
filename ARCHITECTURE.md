# Architecture

How TRONSEC handles API access in production vs. local development.

## Production (tronsec.io)

The live site is a **static frontend** on Cloudflare Pages. It does **not** embed TronGrid, TronScan, VirusTotal, or Telegram credentials.

```
Browser (tronsec.io/app)
    │
    │  HTTPS — no API keys in JS bundle or DevTools
    ▼
Cloudflare Worker  (api-proxy.tronsec-io.workers.dev)
    │  Wrangler secrets: TRONGRID_API_KEY, TRONSCAN_API_KEY,
    │                    VIRUSTOTAL_API_KEY, TELEGRAM_* (optional)
    ▼
TronGrid · TronScan · VirusTotal · Telegram Bot API
```

### What the browser loads

| File | Role |
|:--|:--|
| `app/js/proxy-config.js` | Public worker base URL (not a secret) |
| `app/js/secrets.js` | Empty placeholders only — **no production keys** |
| `app/js/api-proxy.js` | Builds proxy URLs; no credentials |

`secrets.local.js` is **not** included in the production HTML bundle and is **gitignored**.

### What never runs in the user's browser on production

- TronGrid / TronScan API keys
- VirusTotal API key
- Telegram bot token for backend delivery

Vanity address generation is the exception: it runs **entirely in Web Workers** and never sends generated private keys to any server.

## Local development (this repository)

Cloning the repo and serving it locally uses the **same worker proxy by default** (`proxy-config.js`). No keys required — behaviour matches production.

### Optional: direct TronGrid / TronScan (dev only)

For offline worker testing, you may disable the proxy in `secrets.local.js` and paste **your own** dev keys. Those keys exist only on your machine, are visible in DevTools, and are **not** how tronsec.io operates.

VirusTotal and scam-report Telegram delivery still require a worker (or your own worker with `/vt/*` and `/telegram/*`).

## Self-hosting

1. Deploy this static `app/` + `assets/` to your host.
2. Deploy a Cloudflare Worker (or compatible proxy) with the route layout documented in README.
3. Store upstream API keys as **server-side secrets** on the worker.
4. Point `proxy-config.js` (or `secrets.local.js`) at your worker URL.
5. Restrict worker CORS to your domain.

Do not ship API keys inside static JS files served to end users.

## Open-source export

The public GitHub tree is a readable snapshot of the application UI. It is synced from the main app sources and verified by CI:

- No `secrets.local.js`
- No internal activity/telemetry hooks
- Secret pattern scan on every push

The marketing site, obfuscated production build, and worker source may live outside this repository.
