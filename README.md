<p align="center">
  <img src="assets/brand/logo-mark-readme.svg" alt="TRONSEC logo — TRON security terminal" width="80" height="80">
</p>

<h1 align="center">TRONSEC</h1>

<p align="center">
  <strong>Open-source TRON security terminal</strong><br>
  Wallet risk · AML screening · TRC-20 approvals · contract audit · TX decode · URL phishing · vanity generator
</p>

<p align="center">
  <a href="https://tronsec.io/app/"><img src="https://img.shields.io/badge/Live_App-tronsec.io%2Fapp-e50914?style=for-the-badge" alt="Live app on tronsec.io"></a>
  &nbsp;
  <a href="https://tronsec.io/"><img src="https://img.shields.io/badge/Website-tronsec.io-0a0a0a?style=for-the-badge" alt="TRONSEC website"></a>
  &nbsp;
  <a href="https://www.youtube.com/watch?v=AwwVFx8PJgc"><img src="https://img.shields.io/badge/Video_demo-YouTube-ff0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube product demo"></a>
  &nbsp;
  <a href="https://t.me/tronsec_io"><img src="https://img.shields.io/badge/Community-Telegram-0088cc?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram community"></a>
</p>

<p align="center">
  <a href="https://github.com/jamejohns/tronsec/releases/tag/v1.3.0"><img src="https://img.shields.io/github/v/release/jamejohns/tronsec?style=flat-square&label=OSS%20release&color=e50914" alt="Latest OSS release v1.3.0"></a>
  <a href="https://github.com/jamejohns/tronsec/actions/workflows/ci.yml"><img src="https://github.com/jamejohns/tronsec/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <img src="https://img.shields.io/github/license/jamejohns/tronsec?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/read--only-no_wallet_connect-22c55e?style=flat-square" alt="Read-only — no wallet connect">
  <img src="https://img.shields.io/badge/TRON-Mainnet-e50914?style=flat-square" alt="TRON mainnet">
  <img src="https://img.shields.io/badge/stack-vanilla_JavaScript-f7df1e?style=flat-square&logo=javascript&logoColor=000" alt="Vanilla JavaScript">
  <img src="https://img.shields.io/badge/languages-8-64748b?style=flat-square" alt="8 UI languages">
</p>

<p align="center">
  <a href="https://github.com/jamejohns/tronsec/issues">Report issue</a>
  &nbsp;·&nbsp;
  <a href="CONTRIBUTING.md">Contribute</a>
  &nbsp;·&nbsp;
  <a href="CHANGELOG.md">Changelog</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/jamejohns/tronsec/releases/tag/v1.3.0">Release v1.3.0</a>
  &nbsp;·&nbsp;
  <a href="ARCHITECTURE.md">Architecture</a>
  &nbsp;·&nbsp;
  <a href="ROADMAP.md">Roadmap</a>
</p>

<br>

## What is TRONSEC?

**TRONSEC** is a browser-based **TRON (TRX) security workbench**. It helps users, analysts, and developers inspect TRON mainnet addresses, smart contracts, transactions, and URLs **without connecting a wallet** and **without creating an account**.

Use it to answer questions such as:

- Is this **TRON wallet address** risky? What tokens and approvals does it hold?
- Does this address show **AML / sanctions exposure** or suspicious counterparty links?
- Which **TRC-20 approvals** are unlimited or granted to unknown spenders?
- Is this **TRON smart contract** privileged, proxied, or commonly abused?
- What does this **transaction calldata** actually do — transfer, approval, or drain pattern?
- Is this **URL** a TRON phishing or typosquat page?

The live product runs at **[tronsec.io/app](https://tronsec.io/app/)**.  
This repository is the **MIT-licensed, readable JavaScript export** of the application modules and UI shell.

> **Video walkthrough (~6 min):** [YouTube — all modules](https://www.youtube.com/watch?v=AwwVFx8PJgc)

<br>

## Who is this for?

| Audience | Typical use |
|:--|:--|
| **TRON users** | Check a address or link before signing in TronLink / Trust Wallet |
| **Security researchers** | Reproduce heuristics, extend modules, cite readable source |
| **Developers & integrators** | Self-host the terminal, wire your own Cloudflare Worker proxy |
| **Compliance & OSINT** | AML-style on-chain signals, counterparty graphs, exportable PDF summaries |

TRONSEC is **read-only**. It does not execute transactions, hold custody, or request seed phrases.

<br>

## Security modules (open source)

| Module | File(s) | Capabilities |
|:--|:--|:--|
| **Wallet scanner** | `wallet.js`, `shared.js` | Portfolio USD, TRC-20 holdings, stake / bandwidth / energy, activity feed, **risk score 0–100**, contract vs token detection, on-chain approval count, session cache, PDF summary, guided next steps |
| **AML check** | `aml.js`, `aml-categories.js`, `graph.js` | On-chain heuristics, **risk category taxonomy** (sanctions, mixer, scam, exchange, DeFi, spam/dust), counterparty exposure, token-flow **D3 graph**, PDF export |
| **TRC-20 approvals** | `approvals.js` | Active allowances, unlimited-approval warnings, risky / unknown spenders, TronScan + grid merge |
| **Permission auditor** | `permissions.js` | Owner / active / witness keys, multisig thresholds, external controllers, permission history |
| **Contract audit** | `contract.js` | Privileged functions, proxy patterns, TRON bytecode signals |
| **TX decoder** | `tx-decoder.js` | TRC-20 transfers, approvals in calldata, fees, dust / poisoning / drainer heuristics |
| **URL / phishing scan** | `phish-check.js` | Typosquatting, homoglyphs, TRON-themed lures; VirusTotal via worker |
| **Vanity generator** | `vanity.js`, `vanity-worker.js` | Base58 prefix/suffix search in **local Web Workers** — keys never leave the browser |
| **Network dashboard** | `app-tron.js` (shell) | Live TRX metrics, chain stats; **7-day charts** (TRX, energy/bandwidth, USDT activity) |
| **Scam report** | `shared.js` + worker | Structured address/domain reports when worker is configured |

All modules share a **Cloudflare Worker proxy client** (`api-proxy.js`, `proxy-config.js`) so **API keys stay server-side** on production and in recommended self-hosted setups.

<br>

## How TRONSEC handles API keys

Production **[tronsec.io](https://tronsec.io)** never ships TronGrid, TronScan, or VirusTotal keys in static JavaScript.

```
Browser (static app/)  →  Cloudflare Worker (secrets)  →  TronGrid · TronScan · VirusTotal
```

| Artifact | Contains secrets? |
|:--|:--|
| `app/js/proxy-config.js` | No — public worker URL only |
| `app/js/api-proxy.js` | No — URL builder + fetch helpers |
| `app/js/secrets.js` | No — empty placeholders |
| `app/js/secrets.local.js` | **Local dev only** — gitignored, not in production HTML |

Clone this repo and run locally — **default config uses the public worker**; no keys required.  
Details: **[ARCHITECTURE.md](ARCHITECTURE.md)**

<br>

## Quick start

```bash
git clone https://github.com/jamejohns/tronsec.git
cd tronsec
python -m http.server 8080
# open http://localhost:8080/app/
```

Optional: copy `app/js/secrets.local.example.js` → `secrets.local.js` for direct TronGrid/TronScan keys on **your machine only** (advanced dev — not how tronsec.io works).

<br>

## Worker proxy routes

Default worker base (public, not a secret):

```js
// app/js/proxy-config.js
window.TRONSEC_PROXY = { base: 'https://api-proxy.tronsec-io.workers.dev' };
```

| Route prefix | Upstream |
|:--|:--|
| `/grid/*` | TronGrid |
| `/scan/*` | TronScan |
| `/vt/*` | VirusTotal |
| `/cmc/*` | CoinMarketCap (TRX quotes) |
| `/telegram/sendMessage` | Optional scam-report delivery (worker credentials) |

Self-hosting: deploy your own worker ([tronsec-worker-starter](https://github.com/jamejohns/tronsec-worker-starter)), store keys as Wrangler secrets, point `proxy-config.js` at your URL, restrict CORS.

<br>

## Repository layout

```
app/
  index.html          App shell (sidebar modules, command palette)
  app-tron.js         Bootstrap, routing, network charts
  js/
    wallet.js         Wallet scanner
    aml.js            AML heuristics + graph integration
    aml-categories.js Category taxonomy & exposure labels
    approvals.js      TRC-20 allowance monitor
    permissions.js    Account permission auditor
    contract.js       Contract risk heuristics
    tx-decoder.js     Transaction decoder
    phish-check.js    URL / phishing scanner
    vanity.js         Vanity generator (local workers)
    shared.js         Fetch layer, risk helpers, PDF export
    api-proxy.js      Worker client (readable OSS copy)
assets/
  js/i18n-locales.js  UI strings (EN, RU, ZH, ES, PT-BR, VI, TR, ID)
manifest.json         PWA manifest
sw.js                 Service worker
```

Stack: **vanilla JavaScript**, Tailwind CSS, Lucide icons, D3.js, Web Workers. No React/Vue build step.

<br>

## Internationalization

Eight locales ship in `assets/js/i18n-locales.js`: **English, Russian, Chinese, Spanish, Portuguese (Brazil), Vietnamese, Turkish, Indonesian**.  
Module logic lives in English under `app/js/`; UI strings are centralized for translation.

<br>

## Pet OSS (focused satellite repos)

| Repository | Purpose |
|:--|:--|
| [tronsec-worker-starter](https://github.com/jamejohns/tronsec-worker-starter) | Cloudflare Worker API proxy template |
| [tron-approvals-check](https://github.com/jamejohns/tron-approvals-check) | CLI — list TRON token approvals |
| [tron-phish-rules](https://github.com/jamejohns/tron-phish-rules) | Versioned TRON phishing URL rules (offline) |
| [tron-drainer-tracker](https://github.com/jamejohns/tron-drainer-tracker) | **Defensive** chain monitor — flags new USDT approval-phishing / VerifyAccount scam **contracts** via TronGrid + TronScan (read-only IOC registry; **not** a drainer kit) |

<br>

## This repo vs tronsec.io production

| | **This repository (OSS)** | **tronsec.io (production)** |
|:--|:--|:--|
| JavaScript | Readable source | Obfuscated build |
| Wallet connect / sign-in | **Not included** | Prod-only flows |
| Scope | Security **modules** + classic terminal UI | Full product shell + ops features |
| API keys | Worker proxy (recommended) | Same worker architecture |
| License | MIT | Proprietary deployed site |

The OSS export is maintained so researchers and integrators can **audit and extend TRON security tooling** without exposing production-only operational code.

<br>

## Product timeline

| When | Highlights |
|:--|:--|
| **Apr 2026** | Terminal shell, worker proxy, wallet scanner, shared TronGrid/TronScan client |
| **May 2026** | AML + graph, contract audit, TX decoder, URL scanner, 8-language i18n |
| **Jun 2026** | PWA, vanity workers, approvals monitor, **MIT OSS** [v1.0](https://github.com/jamejohns/tronsec/releases/tag/v1.0) → [v1.1](https://github.com/jamejohns/tronsec/releases/tag/v1.1.0) |
| **Jul 2026** | Permission auditor, network charts, wallet risk score & PDF — [v1.2.0](https://github.com/jamejohns/tronsec/releases/tag/v1.2.0) |
| **Aug–Sep 2026** | AML category taxonomy, exposure labels, wallet/AML graph polish, approvals merge logic, extended i18n, CI export guards — **[v1.3.0](https://github.com/jamejohns/tronsec/releases/tag/v1.3.0)** |

Full notes: **[CHANGELOG.md](CHANGELOG.md)**

<br>

## FAQ

**Does TRONSEC connect to my wallet?**  
No. The open-source app is read-only. It never asks for a seed phrase or signing capability.

**Where do TRON API keys go?**  
On tronsec.io and in recommended self-hosted setups, keys live in a **server-side worker**, not in the browser bundle.

**Does the vanity generator send private keys to a server?**  
No. Vanity search runs in **local Web Workers**; generated keys stay in your browser.

**Which network is supported?**  
**TRON mainnet** (TRX, TRC-20, smart contracts on TRON).

**Can I use this for compliance decisions?**  
TRONSEC provides **heuristic on-chain signals** for research and user protection. It is not a substitute for formal KYC/AML procedures or legal advice.

**How do I report a security issue?**  
See **[SECURITY.md](SECURITY.md)** for responsible disclosure.

<br>

## Security & privacy

- Read-only terminal — inspect before you sign elsewhere  
- No wallet connection in the OSS export  
- Vanity keys remain local  
- No seed phrase collection  
- Production credentials only on the worker — never in git  

When forking, keep attribution in `app/js/brand.js` and link to [tronsec.io](https://tronsec.io).

<br>

<p align="center">
  <sub>
    <a href="https://tronsec.io/app/"><strong>tronsec.io/app</strong></a>
    &nbsp;·&nbsp;
    <a href="https://tronsec.io">Website</a>
    &nbsp;·&nbsp;
    <a href="https://t.me/tronsec_io">Telegram</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/jamejohns/tronsec/releases/tag/v1.3.0">v1.3.0</a>
    &nbsp;·&nbsp;
    MIT License
  </sub>
</p>
