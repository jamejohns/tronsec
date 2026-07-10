# Changelog

All notable changes to the public TRONSEC application export are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Live product: **[tronsec.io/app](https://tronsec.io/app/)**.

GitHub release tags begin at **v1.0.0** (June 2026). The product itself shipped on tronsec.io earlier; this section records that pre-OSS history so the repo does not read like a weekend project.

## Development history

### April 2026 — foundation

- Read-only security terminal shell (sidebar modules, command palette, dark UI)
- Cloudflare Worker API proxy — TronGrid, TronScan, VirusTotal credentials kept server-side
- **Wallet scanner:** TRX balance, TRC-20 holdings, stake / bandwidth / energy, activity feed, basic security flags
- Shared fetch layer, address validation, risk badge patterns reused across modules

### May 2026 — core security modules

- **AML check:** on-chain heuristics, counterparty exposure, token-flow graph (D3), PDF export
- **Contract audit:** privileged functions, proxy patterns, TRON-specific bytecode signals
- **TX decoder:** TRC-20 transfers, approvals in transactions, fee breakdown, scam-pattern warnings
- **URL scanner:** TRON-focused phishing heuristics + VirusTotal (via worker)
- **Scam report** UI (structured address / domain reports through worker when configured)
- **i18n:** EN, RU, ZH, ES, PT-BR, VI, TR, ID

### June 2026 — polish & public OSS

- PWA manifest, service worker, mobile install prompt
- **Vanity address generator** — Base58 patterns in local Web Workers; keys never leave the browser
- **TRC-20 approvals monitor** — allowance list, unlimited-approval warnings, spender risk
- Production marketing site + app deploy at **tronsec.io**
- **2026-06-17** — first public GitHub export **[v1.0.0]**
- **2026-06-29** — **[v1.1.0]** (vanity module, PWA, AML / wallet edge-case fixes)

### July 2026 — OSS documentation wave

- **2026-07-04** — **[v1.2.0]** — approvals UX defaults, `ARCHITECTURE.md` / `SECURITY.md` / `ROADMAP.md`, README aligned with live 9-module app
- **2026-07-10** — **Network analytics charts** — interactive 7-day TRX, energy/bandwidth, USDT activity; mobile chart layout
- **2026-07-10** — **Wallet scanner** — session cache, on-chain approvals, risk score 0–100, PDF/summary, next-step links to Approvals/AML

---

## [Unreleased]

### Added
- **Network dashboard charts** — 7-day TRX price (CoinGecko via worker → direct → Binance fallback), dual-axis energy/bandwidth usage, USDT transfer count trend
- Chart hover / touch tooltips with active point markers; gradient area fills; chart resize repaint from cached data
- Fear & Greed index error card when `alternative.me` is unavailable
- USDT 24h transfer volume tile sourced from TronScan `/token_trc20` (not TRX homepage stats)
- **Wallet scanner** — session cache (~12 min), on-chain TRC-20 approval count, composite risk score (0–100), PDF/summary export
- **Recommended next steps** — one-click jump to Approvals or AML with address prefilled and scan auto-started

### Changed
- Analytics tab layout: section labels, USDT activity block spacing, mobile full-bleed charts and bottom tooltip bar
- **TRX price chart** — CoinMarketCap OHLCV via worker first; CoinGecko fallback
- Wallet scanner: mobile activity meta truncation; approvals stat opens Approvals module
- **Recommended next steps** — light-theme panel and red/amber row styling
- **Approvals** — session cache (~12 min); always runs full on-chain enrichment (no wallet-scan shortcut)
- TronScan `scanGet` in-memory cache with in-flight dedupe (reduces duplicate API calls)
- i18n strings for chart labels, wallet risk/export, and next-step CTAs (8 locales)

### Fixed
- Localized analytics HTML: restored missing chart containers in non-EN locales

## [1.2.0] - 2026-07-04

### Added
- **Approvals monitor** — live TRC-20 allowance scan (TronGrid + TronScan), risk badges, unlimited-approval warnings
- Vanity generator: default demo pattern (Suffix · SEC), dual-field presets for prefix+suffix mode
- `ROADMAP.md`, `SECURITY.md`, `ARCHITECTURE.md` — public planning and security docs

### Changed
- README and CONTRIBUTING aligned with live module set (9 modules, approvals wired)
- OSS `api-proxy.js` — public proxy URL helpers only
- i18n locales and styles synced from latest app shell

### Fixed
- Wallet / AML TRC-20 activity edge cases (carried from 1.1.x)
- Marketing SEO canonical alignment on localized app pages (hosted site)

## [1.1.0] - 2026-06-29

### Added
- **Vanity address generator** (`vanity.js`, Web Workers): prefix, suffix, contains, or prefix+suffix Base58 patterns; local multi-core search; private keys never leave the browser
- Vanity UI strings in all eight app locales (`i18n-locales.js`)
- PWA service worker (`sw.js`) and mobile install prompt (`pwa-install.js`)

### Fixed
- **AML:** TRC-20 transfer history for USDT-only wallets (TronGrid + TronScan `token_transfers`); counterparty address casing; graph volume `Infinity` on TRC-20 amounts
- **Wallet scanner:** activity for addresses with TRC-20 transfers but no native TRX transactions
- **Phish / contract / TX decoder:** empty states no longer hidden before input validation

### Changed
- Vanity module icon: `wand-2` (Lucide) in sidebar, inputs, and command palette
- Manifest installability fixes (`id`, maskable PNG icons)

## [1.0.0] - 2026-06-17

### Added
- MIT license, CONTRIBUTING.md, CHANGELOG, GitHub Actions secret scan
- Wallet scanner, AML check, contract audit, TX decoder, URL scanner, scam report UI
- 8-language i18n (EN, RU, ZH, ES, PT-BR, VI, TR, ID)
- Cloudflare Worker proxy integration (`proxy-config.js`)
- PWA manifest, brand assets

[1.2.0]: https://github.com/jamejohns/tronsec/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/jamejohns/tronsec/compare/v1.0...v1.1.0
[1.0.0]: https://github.com/jamejohns/tronsec/releases/tag/v1.0
