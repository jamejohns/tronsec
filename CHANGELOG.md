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

### July 2026 — analytics, permissions, AML v2

- **2026-07-10** — **Network analytics charts** — interactive 7-day TRX, energy/bandwidth, USDT activity; mobile chart layout
- **2026-07-10** — **Wallet scanner** — session cache, on-chain approvals, risk score 0–100, PDF/summary, next-step links to Approvals/AML
- **2026-07-12** — **[v1.2.0]** — **Permission auditor**, AML v2 lite, approvals UI refresh, risk-shield color alignment

---

## [Unreleased]

### Added
- **Wallet scanner** — smart contract detection (not only token contracts) with redirect callout to Contract Scan
- **Command palette** — file-style module labels (`scanner.sh`, `vanity.gen`, …), open animation, keyboard hint styling

### Changed
- Contract redirect UI for Wallet and AML modules (shared callout card)
- `probeTronContract` — broader detection via `getcontractinfo` and TronScan fallback

## [1.2.0] - 2026-07-12

### Added
- **Permission auditor** — owner, active, and witness keys; multisig thresholds; external-controller detection; expandable operation scopes; permission-change history; 0–100 risk score
- **AML check v2** — TronScan `red_tag` hard flags, inbound/outbound activity scoring, first-funder intel, DEX/CEX peer allowlist, improved top-counterparty badges
- Marketing landing page: `/tools/permissions-auditor/`

### Changed
- **Approvals monitor UI** — risk-tier sections, assessment strip, clearer allowance rows
- **Risk shield icons** — amber from score 20, red from 70 (aligned with contract/AML labels)
- **Wallet scanner** — one-click jump to Permission auditor for multisig / external-controller accounts
- Marketing site: ten modules (was nine); changelog **v1.2**

### Fixed
- Risk shield showing red at elevated scores (e.g. 50/100) while labels stayed amber

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
