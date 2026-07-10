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
  <img src="https://img.shields.io/badge/API_keys-server--side_(Worker)-22c55e?style=flat-square" alt="Server-side API keys">
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
  <a href="ARCHITECTURE.md">Architecture</a>
  &nbsp;·&nbsp;
  <a href="ROADMAP.md">Roadmap</a>
</p>

<br>

## Overview

**TRONSEC** is a read-only security workbench for TRON. Paste an address, contract, transaction hash, or URL — get structured risk signals without connecting a wallet or creating an account.

Focus areas: **on-chain risk** · **financial crime signals** · **secure client architecture** — wallet compromise patterns, TRC-20 approvals, phishing & drainer surfaces, and read-only tooling that helps users decide before they sign.

This repository is the **open-source application** (MIT). The marketing site lives at **[tronsec.io](https://tronsec.io)**.

> **Live demo:** [tronsec.io/app](https://tronsec.io/app/)

The **first public GitHub release** was June 2026 — not the start of the project. TRONSEC had been in active development on [tronsec.io](https://tronsec.io) for roughly **three months** before the repo went public. Tags here track the OSS export; the timeline below is the full product history.

<br>

## Development timeline

| Period | Milestones |
|:--|:--|
| **Apr 2026** | Terminal UI shell, module routing, Cloudflare Worker proxy (API keys server-side), wallet scanner (portfolio, TRC-20, stake, activity), TronGrid / TronScan client layer |
| **May 2026** | AML check + flow graph, contract audit heuristics, TX decoder, URL / phishing scanner (heuristics + VirusTotal via worker), scam-report flow, **8-language i18n** |
| **Jun 2026** | PWA + service worker, vanity generator (local Web Workers), TRC-20 **approvals** monitor, production deploy on tronsec.io, **MIT OSS published** ([v1.0](https://github.com/jamejohns/tronsec/releases/tag/v1.0) → [v1.1](https://github.com/jamejohns/tronsec/releases/tag/v1.1.0)) |
| **Jul 2026** | Approvals polish, public architecture / security docs, OSS [v1.2.0](https://github.com/jamejohns/tronsec/releases/tag/v1.2.0); **network analytics charts**; **wallet scanner** risk score, on-chain approvals, session cache, PDF export |

Full month-by-month notes: **[CHANGELOG.md#development-history](CHANGELOG.md#development-history)**.

<br>

## Production: API keys stay on the server

**[tronsec.io](https://tronsec.io) does not ship API keys in the browser.**

The deployed app is static HTML/JS. Every upstream call (TronGrid, TronScan, VirusTotal, optional scam-report backend) goes through a **Cloudflare Worker** proxy. Credentials are **Wrangler secrets on the worker** — they never appear in the client bundle, DevTools, or this git tree.

```
Browser  →  Cloudflare Worker (secrets)  →  TronGrid / TronScan / VirusTotal
```

| Production loads | Contains secrets? |
|:--|:--|
| `app/js/proxy-config.js` | No — public worker URL only |
| `app/js/secrets.js` | No — empty placeholders |
| `app/js/secrets.local.js` | **Not shipped** — gitignored, not in prod HTML |

Cloning this repo and running locally uses the **same worker proxy by default** — no keys required.

Full diagram: **[ARCHITECTURE.md](ARCHITECTURE.md)**

<br>

## Modules

| Module | What it does |
|:--|:--|
| **Wallet scanner** | Portfolio USD, TRC-20 holdings, stake, bandwidth & energy, security flags, activity feed; **risk score 0–100**, on-chain approval count, session cache, PDF/summary export; links to Approvals / AML |
| **Approvals** | Lists active TRC-20 allowances, flags unlimited grants and risky spenders |
| **AML check** | On-chain heuristics, counterparty exposure, token flows, PDF export |
| **Contract audit** | Privileged functions, proxy patterns, TRON-specific bytecode signals |
| **TX decoder** | TRC-20 transfers, approvals, contract calls, fees, scam-pattern warnings |
| **URL scanner** | Typosquatting, homoglyphs, VirusTotal (via worker) |
| **Vanity generator** | Base58 patterns in **local Web Workers** — generated keys never leave your browser |
| **Scam report** | Structured address/domain reports (delivered via worker when configured) |
| **Network dashboard** | Live TRX price, chain stats, Fear & Greed; **7-day charts** for TRX price, energy/bandwidth usage, and USDT transfer activity (D3 area/line, hover & touch tooltips) |

<br>

## Pet OSS (satellite repos)

Small, focused tools extracted from TRONSEC patterns — also pinned on [@jamejohns](https://github.com/jamejohns):

| Repo | What it is |
|:--|:--|
| [**tronsec-worker-starter**](https://github.com/jamejohns/tronsec-worker-starter) | Cloudflare Worker API proxy — TronGrid, TronScan, VirusTotal keys stay server-side |
| [**tron-approvals-check**](https://github.com/jamejohns/tron-approvals-check) | CLI to list TRON token approvals and flag unlimited or risky spenders |
| [**tron-phish-rules**](https://github.com/jamejohns/tron-phish-rules) | Versioned TRON phishing URL heuristics + offline checker (no VirusTotal required) |

Use the worker starter with the CLI tools, or run the full terminal here.

<br>

## Quick start

```bash
git clone https://github.com/jamejohns/tronsec.git
cd tronsec
python -m http.server 8080
```

Open **http://localhost:8080/app/** — works out of the box via the public worker proxy (`proxy-config.js`). **No API keys needed.**

<br>

## Worker proxy routes

Public worker base URL (not a secret):

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
| `/telegram/sendMessage` | Scam-report form delivery (worker-held credentials) |

**Self-hosting:** deploy your own worker, store keys as server secrets, point `proxy-config.js` at your worker URL, restrict CORS to your domain.

<br>

## Optional: local dev without proxy

<details>
<summary><strong>Advanced — direct TronGrid/TronScan keys in the browser (dev machines only)</strong></summary>

This path is **not used on tronsec.io**. Only for developers who intentionally disable the proxy:

```bash
cp app/js/secrets.local.example.js app/js/secrets.local.js
```

```js
window.TRONSEC_PROXY = { base: '' };
Object.assign(window.TRONSEC_KEYS, {
  trongrid: 'YOUR_DEV_TRONGRID_KEY',
  tronscan: 'YOUR_DEV_TRONSCAN_KEY',
});
```

Keys are visible in DevTools. VirusTotal still requires a worker. Never commit `secrets.local.js`.

</details>

<br>

## Project layout

```
app/                 Shell, styles, modules (vanilla JS)
assets/              Brand, fonts, i18n (8 locales)
manifest.json        PWA metadata
sw.js                Service worker
```

Stack: vanilla JavaScript · Tailwind · Lucide · D3.js · TronGrid / TronScan / VirusTotal (via worker).

<br>

## Security & privacy

- **Read-only** — no wallet connection, no transaction signing from this UI.
- **Production keys server-side** — Cloudflare Worker + Wrangler secrets on the live site.
- **Vanity keys stay local** — generated private keys never sent to any server.
- **No seed phrases** — TRONSEC never asks for your wallet mnemonic.
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
