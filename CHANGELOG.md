# Changelog

All notable changes to the public TRONSEC application export are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Live product: **[tronsec.io/app](https://tronsec.io/app/)**.

## [Unreleased]

## [1.2.0] - 2026-07-04

### Added
- **Approvals monitor** — live TRC-20 allowance scan (TronGrid + TronScan), risk badges, unlimited-approval warnings
- Vanity generator: default demo pattern (Suffix · SEC), dual-field presets for prefix+suffix mode
- `ROADMAP.md`, `SECURITY.md` — public planning and disclosure policy
- CI step: block internal telemetry markers in OSS export

### Changed
- README and CONTRIBUTING aligned with live module set (9 modules, approvals wired)
- OSS `api-proxy.js` — public proxy helpers only (no server-side activity hooks)
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
