<p align="center">
  <img src="assets/brand/logo-mark-readme.svg" alt="TRONSEC" width="80" height="80">
</p>

<h1 align="center">TRONSEC</h1>

<p align="center">
  <strong>Security terminal for the TRON ecosystem</strong><br>
  Wallets · contracts · transactions · URLs — read-only, in the browser.
</p>

<p align="center">
  <a href="https://tronsec.io/app/"><img src="https://img.shields.io/badge/Open_App-tronsec.io%2Fapp-0a0a0a?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNCIgaGVpZ2h0PSIxNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik03IDJsMTAgNXYxMGMwIDUuNSA0LjIgMTAuNCAxMCAxMiA1LjgtMS42IDEwLTYuNSAxMC0xMlY3TDE3IDJIN3oiLz48L3N2Zz4=" alt="Open app"></a>
  &nbsp;
  <a href="https://tronsec.io/"><img src="https://img.shields.io/badge/Website-tronsec.io-e50914?style=for-the-badge" alt="Website"></a>
  &nbsp;
  <a href="https://t.me/tronsec_chat"><img src="https://img.shields.io/badge/Telegram-community-0088cc?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TRON-Mainnet-e50914?style=flat-square" alt="TRON">
  <img src="https://img.shields.io/badge/JavaScript-vanilla-f7df1e?style=flat-square&logo=javascript&logoColor=000" alt="JS">
  <img src="https://img.shields.io/badge/Languages-8-64748b?style=flat-square" alt="i18n">
  <img src="https://img.shields.io/badge/Build-not_required-22c55e?style=flat-square" alt="No build">
</p>

<p align="center">
  <a href="https://github.com/jamejons/tronsec/issues">Report issue</a>
</p>

<br>

## Overview

**TRONSEC** is a client-side security workbench. Paste a TRON address, contract, transaction hash, or URL — get structured risk signals and explorer-grade context without connecting a wallet or creating an account.

This repository contains the **open-source application** (UI shell, modules, assets, i18n). The marketing site and localized page wrappers are hosted separately at **[tronsec.io](https://tronsec.io)**.

<br>

## Capabilities

| Module | What it does |
|:--|:--|
| **Wallet scanner** | Portfolio USD, TRC-20 holdings, stake, bandwidth & energy, security flags, activity feed |
| **AML check** | On-chain heuristics, counterparty exposure, token flows, PDF export |
| **Contract audit** | Privileged functions, proxy patterns, TRON-specific bytecode signals |
| **TX decoder** | TRC-20 transfers, approvals, contract calls, fees, scam-pattern warnings |
| **URL scanner** | Typosquatting, homoglyphs, VirusTotal lookup |
| **Scam report** | Structured submissions with optional Telegram delivery |
| **Approvals** | ⚠️ **UI only** — tab is a shell; live fetch & revoke not wired in this build |

<br>

## Quick start

```bash
git clone https://github.com/jamejons/tronsec.git
cd tronsec
cp app/js/secrets.local.example.js app/js/secrets.local.js
# edit secrets.local.js — see below
python -m http.server 8080
```

Open **http://localhost:8080/app/** (serve repo root, not `app/` alone).

<br>

## API keys

Shipped **without credentials**. Add your own in `app/js/secrets.local.js` (gitignored):

```js
Object.assign(window.TRONSEC_KEYS, {
  trongrid: 'YOUR_TRONGRID_API_KEY',
  tronscan: 'YOUR_TRONSCAN_API_KEY',
  virustotal: 'YOUR_VIRUSTOTAL_API_KEY',
  telegramBotToken: 'YOUR_BOT_TOKEN',
  telegramChatId: 'YOUR_CHAT_ID',
});
```

| Key | Powers | Where to get |
|:--|:--|:--|
| `trongrid` | Wallet · AML · TX · contracts | [trongrid.io](https://www.trongrid.io/) |
| `tronscan` | Balances · labels · history | [TronScan docs](https://docs.tronscan.org/) |
| `virustotal` | URL scanner | [virustotal.com](https://www.virustotal.com/) |
| `telegramBotToken` + `telegramChatId` | Report form | [@BotFather](https://t.me/BotFather) |

Without keys the UI loads, but live scans fail. For production, proxy APIs server-side — never ship secrets to end users.

<br>

## Project layout

```
app/                 Shell, styles, modules
assets/              Brand, fonts, i18n (EN RU ZH ES PT VI TR ID)
manifest.json        PWA metadata
```

Stack: vanilla JavaScript · Tailwind CDN · Lucide · D3.js · TronGrid / TronScan / VirusTotal.

<br>

## Security & brand

- Read-only — no wallet connection, no transaction signing.
- Client-side keys are visible in DevTools; rotate if ever committed.
- Official product: **[tronsec.io](https://tronsec.io)** — keep `app/js/brand.js` attribution when forking.

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
