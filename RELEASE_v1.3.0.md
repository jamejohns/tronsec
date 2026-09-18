# TRONSEC v1.3.0

**Read-only TRON security terminal** — wallet scanner, AML with category taxonomy, TRC-20 approvals, permission auditor, contract audit, TX decoder, URL scanner, vanity generator (local workers), and network dashboard. Eight UI languages. MIT licensed application export.

Live app: **[tronsec.io/app](https://tronsec.io/app/)**

---

## Highlights

### AML category taxonomy
New `aml-categories.js` module — sanctions, mixer, scam, exchange, DeFi, and spam/dust exposure labels shared across AML and wallet flows.

### Module refresh
Wallet, AML, approvals, permissions, TX decoder, phish scan, contract scan, vanity, and graph modules updated with improved heuristics, TronScan merge paths, and PDF/export hooks.

### Approvals monitor
Summary bar, unknown-spender rows, TronGrid + TronScan allowance merge.

### OSS hygiene
CI runs export guards (readable JS only), `node --check` on all app modules, and risk-logic unit tests. No wallet connect in this export — inspect before you sign elsewhere.

### Internationalization
Extended copy for AML categories, approvals UI, and wallet risk strings across EN, RU, ZH, ES, PT-BR, VI, TR, ID.

---

## Quick start

```bash
git clone https://github.com/jamejohns/tronsec.git
cd tronsec
python -m http.server 8080
# open http://localhost:8080/app/
```

Worker proxy (default): `https://api-proxy.tronsec-io.workers.dev` — see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Compare

[Full changelog](CHANGELOG.md) · [v1.2.0…v1.3.0](https://github.com/jamejohns/tronsec/compare/v1.2.0...v1.3.0)
