<p align="center">
  <img src="assets/brand/logo-mark-readme.svg" alt="TRONSEC" width="80" height="80">
</p>

<h1 align="center">TRONSEC</h1>

<p align="center">
  <strong>Security terminal for the TRON ecosystem</strong><br>
  Wallets · approvals · contracts · transactions · URLs · vanity addresses — read-only, in the browser.
</p>

<p align="center">
  <a href="https://tronsec.io/app/"><img src="https://img.shields.io/badge/Open_App-tronsec.io%2Fapp-0a0a0a?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNCIgaGVpZ2h0PSIxNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik03IDJsMTAgNXYxMGMwIDUuNSA0LjIgMTAuNCAxMCAxMiA1LjgtMS42IDEwLTYuNSAxMC0xMlY3TDE3IDJIN3oiLz48L3N2Zz4=" alt="Open app"></a>
  &nbsp;
  <a href="https://tronsec.io/"><img src="https://img.shields.io/badge/Website-tronsec.io-e50914?style=for-the-badge" alt="Website"></a>
  &nbsp;
  <a href="https://t.me/tronsec_chat"><img src="https://img.shields.io/badge/Telegram-community-0088cc?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
</p>

<p align="center">
  <a href="https://github.com/jamejohns/tronsec/actions/workflows/ci.yml"><img src="https://github.com/jamejohns/tronsec/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/github/license/jamejohns/tronsec?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/TRON-Mainnet-e50914?style=flat-square" alt="TRON">
  <img src="https://img.shields.io/badge/JavaScript-vanilla-f7df1e?style=flat-square&logo=javascript&logoColor=000" alt="JS">
  <img src="https://img.shields.io/badge/Languages-8-64748b?style=flat-square" alt="i18n">
  <img src="https://img.shields.io/badge/Modules-9-22c55e?style=flat-square" alt="Modules">
</p>

<p align="center">
  <a href="https://github.com/jamejohns/tronsec/issues">Report issue</a>
  &nbsp;·&nbsp;
  <a href="CONTRIBUTING.md">Contribute</a>
  &nbsp;·&nbsp;
  <a href="CHANGELOG.md">Changelog</a>
  &nbsp;·&nbsp;
  <a href="ROADMAP.md">Roadmap</a>
</p>

<br>

## Overview

**TRONSEC** is a client-side security workbench for TRON. Paste an address, contract, transaction hash, or URL — get structured risk signals and explorer-grade context **without connecting a wallet** or creating an account.

This repository contains the **open-source application** (UI shell, modules, assets, i18n) under the [MIT license](LICENSE). The marketing site and localized page wrappers are hosted separately at **[tronsec.io](https://tronsec.io)**.

> **Live demo:** [tronsec.io/app](https://tronsec.io/app/) — no install, no wallet connect.

<br>

## Modules

| Module | What it does |
|:--|:--|
| **Wallet scanner** | Portfolio USD, TRC-20 holdings, stake, bandwidth & energy, security flags, activity feed |
| **Approvals** | Lists active TRC-20 allowances, flags unlimited grants and risky spenders |
| **AML check** | On-chain heuristics, counterparty exposure, token flows, PDF export |
| **Contract audit** | Privileged functions, proxy patterns, TRON-specific bytecode signals |
| **TX decoder** | TRC-20 transfers, approvals, contract calls, fees, scam-pattern warnings |
| **URL scanner** | Typosquatting, homoglyphs, VirusTotal lookup |
| **Vanity generator** | Custom Base58 prefix/suffix/contains patterns — **runs locally** in Web Workers; keys never leave the browser |
| **Scam report** | Structured address/domain reports with evidence links |
| **Network dashboard** | Live TRX price, chain stats, Fear & Greed (read-only) |

<br>

## Quick start

```bash
git clone https://github.com/jamejohns/tronsec.git
cd tronsec
cp app/js/secrets.local.example.js app/js/secrets.local.js
python -m http.server 8080
```

Open **http://localhost:8080/app/** (serve repo root, not `app/` alone).

By default the app talks to upstream APIs through a **Cloudflare Worker proxy** (`app/js/proxy-config.js`). No browser-side API keys are required for a basic local run.

<br>

## API access (Worker proxy)

Production **[tronsec.io](https://tronsec.io)** does not ship TronGrid / TronScan / VirusTotal credentials to the browser. The client calls a thin proxy; keys live as **Wrangler secrets** on the worker.

Default proxy URL (public, not a secret):

```js
// app/js/proxy-config.js
window.TRONSEC_PROXY = { base: 'https://api-proxy.tronsec-io.workers.dev' };
```

| Route | Upstream |
|:--|:--|
| `/grid/*` | TronGrid |
| `/scan/*` | TronScan |
| `/vt/*` | VirusTotal |
| `/cmc/*` | CoinMarketCap (TRX quotes) |
| `/telegram/sendMessage` | User-submitted scam reports only (optional worker route) |

**Self-hosting:** deploy your own Cloudflare Worker with the same route layout, store API keys as worker secrets, then override in `app/js/secrets.local.js`:

```js
window.TRONSEC_PROXY = { base: 'https://your-worker.workers.dev' };
```

Restrict CORS on the worker to your domain — otherwise anyone can relay requests through your keys.

<br>

## Local dev fallback (direct keys)

Optional — only if you **do not** use a proxy. Edit `app/js/secrets.local.js` (gitignored):

```js
// Disable proxy for this session
window.TRONSEC_PROXY = { base: '' };

Object.assign(window.TRONSEC_KEYS, {
  trongrid: 'YOUR_TRONGRID_API_KEY',
  tronscan: 'YOUR_TRONSCAN_API_KEY',
});
```

| Key | Powers | Where to get |
|:--|:--|:--|
| `trongrid` | Wallet · AML · TX · contracts · approvals | [trongrid.io](https://www.trongrid.io/) |
| `tronscan` | Balances · labels · history | [TronScan docs](https://docs.tronscan.org/) |

**VirusTotal** requires the worker proxy (or your own worker with `/vt/*`). Direct browser keys for VT are not supported in this build.

Without a working proxy or direct TronGrid/TronScan keys, the UI loads but live scans fail.

<br>

## Project layout

```
app/                 Shell, styles, modules (vanilla JS)
assets/              Brand, fonts, i18n (EN RU ZH ES PT VI TR ID)
manifest.json        PWA metadata
sw.js                Service worker (offline shell)
```

Stack: vanilla JavaScript · Tailwind · Lucide · D3.js · TronGrid / TronScan / VirusTotal.

<br>

## Security & privacy

- **Read-only** — no wallet connection, no transaction signing from this UI.
- **Vanity keys stay local** — generated private keys never leave your browser.
- **Do not commit API keys** — use a worker proxy in production; `secrets.local.js` is gitignored.
- Direct browser keys (dev fallback) are visible in DevTools — rotate if ever exposed.
- Official product: **[tronsec.io](https://tronsec.io)** — keep `app/js/brand.js` attribution when forking.

See [SECURITY.md](SECURITY.md) for responsible disclosure.

<br>

<p align="center">
  <sub>
    <a href="https://tronsec.io/app/"><strong>tronsec.io/app</strong></a>
    &nbsp;·&nbsp;
    <a href="https://tronsec.io">tronsec.io</a>
    &nbsp;·&nbsp;
    <a href="https://t.me/tronsec_chat">Telegram</a>
  </sub>
</p>
