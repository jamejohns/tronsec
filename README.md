<div align="center">

<img src="assets/brand/logo-mark.svg" alt="TRONSEC" width="72" height="72" style="background:#000;border-radius:16px;padding:14px;display:inline-block">

# TRONSEC

**Read-only TRON security terminal for wallets, contracts, approvals, and transactions.**

Scan addresses for AML exposure, audit smart contracts, decode transactions, monitor TRC-20 allowances, and check URLs for phishing — directly in the browser. No wallet connection required.

<br>

[![Website](https://img.shields.io/badge/website-tronsec.io-000000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0iI2ZmZiIgdmlld0JveD0iMCAwIDE2IDE2Ij48cGF0aCBkPSJNOCAwTDggMTZNMTYgOEwwIDE4Ii8+PC9zdmc+)](https://tronsec.io/app/)
[![TRON](https://img.shields.io/badge/chain-TRON-e50914?style=for-the-badge)](https://tron.network/)
[![JavaScript](https://img.shields.io/badge/stack-vanilla%20JS-f7df1e?style=for-the-badge&logo=javascript&logoColor=000)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Open Source](https://img.shields.io/badge/open%20source-yes-22c55e?style=for-the-badge)](https://github.com/jamejons/tronsec)

[Live app](https://tronsec.io/app/) · [Marketing site](https://tronsec.io) · [Telegram](https://t.me/tronsec_chat) · [Report issue](https://github.com/jamejons/tronsec/issues)

<br>

<img src="https://tronsec.io/og-image.png" alt="TRONSEC app preview" width="720">

</div>

---

## Overview

**TRONSEC** is a client-side security workbench for the TRON ecosystem. Paste an address, contract, transaction hash, or URL — get structured risk signals, portfolio context, and explorer-grade detail without installing an extension or connecting a wallet.

This repository contains the **open-source browser application** (modules, UI shell, i18n, and assets). The marketing site and localized page shells live on [tronsec.io](https://tronsec.io) and are maintained separately.

| | |
|---|---|
| **Read-only** | Never asks for seed phrases or private keys |
| **No signup** | Runs instantly in the browser |
| **8 languages** | EN · RU · ZH · ES · PT · VI · TR · ID |
| **Mobile-ready** | Responsive layout + bottom navigation |
| **PWA-friendly** | `manifest.json` included |

---

## Features

### Wallet scanner
Portfolio value in USD, TRC-20 holdings, frozen stake, bandwidth & energy meters, security flags, and a live activity feed for any `T…` address.

### Approvals monitor

> **Work in progress.** The approvals tab is a **UI shell for now** — layout, copy, and demo states are in place, but live allowance fetching and revoke actions are **not fully wired** in this open-source build. Wallet scanner and TX decoder already surface approval-related signals where available.

Planned: active TRC-20 allowance listing, unlimited-approval warnings, and spender risk labels.

### AML risk check
On-chain heuristics, counterparty exposure, token flows, and exportable PDF reports for compliance-style review.

### Contract audit
Bytecode-level signals, privileged functions (`mint`, `pause`, `blacklist`, …), proxy patterns, and TRON-specific risk markers.

### TX decoder
Human-readable breakdown of any transaction: TRC-20 transfers, approvals, contract calls, fees, and automated scam-pattern warnings.

### URL phishing scanner
Domain heuristics + VirusTotal integration for typosquatting, homoglyphs, and known malicious hosts.

### Scam report
Structured report form with optional Telegram backend for community submissions.

### Product UX
Command palette (`/`), guided tour, dark/light theme, captcha gate for abuse-sensitive actions, and live network/market sidebar widgets.

---

## Quick start

### 1. Clone

```bash
git clone https://github.com/jamejons/tronsec.git
cd tronsec
```

### 2. Configure API keys

The repo ships **without secrets**. Copy the example file and add your keys:

```bash
cp app/js/secrets.local.example.js app/js/secrets.local.js
```

Edit `app/js/secrets.local.js`:

```js
Object.assign(window.TRONSEC_KEYS, {
  trongrid: 'YOUR_TRONGRID_API_KEY',
  tronscan: 'YOUR_TRONSCAN_API_KEY',
  virustotal: 'YOUR_VIRUSTOTAL_API_KEY',       // URL scanner only
  telegramBotToken: 'YOUR_BOT_TOKEN',          // report form only
  telegramChatId: 'YOUR_CHAT_ID',
});
```

| Key | Required for | Get it |
|-----|----------------|--------|
| `trongrid` | Wallet, AML, TX, contracts | [trongrid.io](https://www.trongrid.io/) |
| `tronscan` | Holdings, labels, transfers | [TronScan API docs](https://docs.tronscan.org/) |
| `virustotal` | URL phishing module | [virustotal.com](https://www.virustotal.com/) |
| `telegramBotToken` + `telegramChatId` | Scam report delivery | [@BotFather](https://t.me/BotFather) |

> `secrets.local.js` is gitignored — never commit real keys.  
> For production, prefer a **backend proxy** (Cloudflare Worker, etc.) so keys never ship to end users. The official build at [tronsec.io](https://tronsec.io/app/) uses private configuration.

### 3. Run locally

Serve the **repository root** (not `app/` alone) so `/assets/` resolves:

```bash
# Python
python -m http.server 8080

# or Node
npx serve .
```

Open **http://localhost:8080/app/**

---

## Project structure

```
tronsec/
├── app/
│   ├── index.html          # App shell
│   ├── app-tron.js         # Tabs, analytics, report form, init
│   ├── styles-tron.css     # Design system
│   └── js/
│       ├── wallet.js       # Wallet scanner
│       ├── approvals.js    # TRC-20 allowances
│       ├── aml.js          # AML / risk report
│       ├── contract.js     # Contract audit
│       ├── tx-decoder.js   # Transaction decoder
│       ├── phish-check.js  # URL scanner
│       ├── shared.js       # API helpers, UI primitives
│       ├── brand.js        # Official tronsec.io links
│       ├── secrets.js      # Empty key template (committed)
│       └── secrets.local.example.js
├── assets/
│   ├── brand/              # Logos, favicons
│   ├── fonts/              # Inter + JetBrains Mono
│   └── js/
│       ├── i18n-locales.js # 8-language UI strings
│       └── contract-i18n.js
├── manifest.json           # PWA manifest
└── favicon.ico
```

---

## Tech stack

| Layer | Choice |
|-------|--------|
| UI | HTML + CSS custom properties, Tailwind CDN |
| Logic | Vanilla ES modules (no build step required) |
| Icons | [Lucide](https://lucide.dev/) |
| Charts / graph | D3.js (AML flow graph) |
| On-chain data | TronGrid + TronScan APIs |
| Threat intel | VirusTotal API v3 (via proxy) |
| i18n | Client-side dictionary (`assets/js/i18n-locales.js`) |

Zero npm install needed to run or fork — clone, add keys, serve static files.

---

## Deployment

Upload the repo root to any static host (Cloudflare Pages, Netlify, Nginx, S3, etc.).

| Path | Purpose |
|------|---------|
| `/app/` | Security terminal |
| `/assets/` | Shared brand, fonts, i18n |

Ensure `app/js/secrets.local.js` exists on the server (or inject keys via your deploy pipeline). Do **not** commit that file to a public repository.

---

## Security model

- **Client-side app** — API keys in `secrets.local.js` are visible to anyone who opens DevTools. Treat them as rate-limited credentials, not secrets.
- **Read-only scans** — the app does not sign transactions or request wallet access.
- **Captcha gate** — sensitive actions (scans, reports) require a lightweight client challenge to reduce bot abuse.
- **Git history** — never commit `secrets.local.js` or paste keys into tracked files. If keys were ever pushed, **rotate them immediately**; deleting files from the latest commit does not erase older commits until history is rewritten or the repository is recreated.
- **Recommendations** — use server-side proxies for production traffic; never commit `secrets.local.js`.

---

## Branding

Official **TRONSEC** branding points to [tronsec.io](https://tronsec.io):

- `app/js/brand.js` — canonical URLs and locale-aware links
- Header & sidebar show **tronsec.io**
- On third-party hosts (forks, mirrors), brand links open the official site in a new tab

Please do not remove or rebrand without permission when forking.

---

## Contributing

Issues and PRs are welcome.

1. Fork the repo
2. Create a feature branch
3. Keep changes focused — match existing code style
4. Open a pull request with a clear description

For bugs and feature ideas: [GitHub Issues](https://github.com/jamejons/tronsec/issues)

---

## Links

| Resource | URL |
|----------|-----|
| Live app | https://tronsec.io/app/ |
| Website | https://tronsec.io |
| Community | https://t.me/tronsec_chat |
| Repository | https://github.com/jamejons/tronsec |

---

<div align="center">

**Built for the TRON ecosystem · [tronsec.io](https://tronsec.io)**

</div>
