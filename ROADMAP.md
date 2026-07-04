# Roadmap

Public-facing plans for the TRONSEC application. Timelines are approximate.

Product development on tronsec.io started **April 2026**; the public GitHub repo followed in **June 2026**. Month-by-month history: [CHANGELOG § Development history](CHANGELOG.md#development-history).

## Shipped (see [CHANGELOG](CHANGELOG.md))

- Wallet scanner, AML, contract audit, TX decoder, URL scanner
- TRC-20 approvals monitor
- Vanity address generator (local Web Workers)
- 8-language UI, PWA install, worker proxy integration

## Next

| Area | Goal |
|:--|:--|
| **UX** | Plain-language verdicts for non-technical users (risk summary before raw tables) |
| **Approvals** | One-click revoke flow with wallet connect (opt-in, user-signed) |
| **SEO / sharing** | Public read-only address report pages (index only when data exists) |
| **Docs** | In-app glossary for allowance, proxy contracts, energy/bandwidth |
| **API** | Read-only public endpoint for address risk checks (for wallets & bots) |

## Later

- Monthly TRON security digest (scam patterns, community submissions)
- Deeper contract bytecode heuristics for TRON-specific proxies
- Optional self-hosted worker template in a separate repo

## Out of scope (this OSS repo)

- Custody, key storage, or transaction signing as a default path
- Paid tiers or tokenomics
- Marketing site HTML (lives on tronsec.io)

Suggestions welcome via [GitHub Issues](https://github.com/jamejohns/tronsec/issues).
