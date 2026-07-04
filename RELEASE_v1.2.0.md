# TRONSEC v1.2.0

**Read-only security terminal for TRON** — wallet scanner, approvals monitor, AML, contract audit, TX decoder, URL scanner, vanity generator, and network dashboard. Eight UI languages. MIT licensed application export.

---

## Production security model

> **tronsec.io does not ship API keys to the browser.**

The live app at [tronsec.io/app](https://tronsec.io/app/) is static HTML/JS. All upstream API calls (TronGrid, TronScan, VirusTotal, optional scam-report delivery) go through a **Cloudflare Worker** proxy. Credentials live as **Wrangler secrets** on the worker — not in the client bundle, not in `localStorage`, not in DevTools.

What users download from production:

- `proxy-config.js` — public worker URL only
- `secrets.js` — empty string placeholders

See [ARCHITECTURE.md](https://github.com/jamejohns/tronsec/blob/main/ARCHITECTURE.md) for the full diagram.

Local clones use the same proxy by default; direct browser keys are an **optional dev-only** path documented in README.

---

## Highlights

### Approvals monitor
Live TRC-20 allowance scan (TronGrid + TronScan), unlimited-approval detection, risk badges per spender.

### Vanity address generator
Prefix, suffix, contains, or prefix+suffix Base58 patterns. Multi-core Web Worker search. **Private keys never leave the browser.**

### Internationalization
Full UI strings for EN, RU, ZH, ES, PT-BR, VI, TR, ID.

### PWA
Service worker shell, mobile install prompt, manifest with maskable icons.

### OSS hygiene
CI blocks committed secrets and internal telemetry markers. Public `api-proxy.js` contains proxy helpers only.

---

## All modules

| Module | Description |
|:--|:--|
| Wallet scanner | Portfolio, TRC-20, stake, resources, activity |
| Approvals | Active allowances, unlimited grants, risky spenders |
| AML check | Heuristics, counterparties, graph, PDF export |
| Contract audit | Privileged functions, proxy patterns, bytecode signals |
| TX decoder | Transfers, approvals, calldata, fee & scam hints |
| URL scanner | Typosquatting, homoglyphs, VirusTotal (via worker) |
| Vanity generator | Local Base58 search in Web Workers |
| Scam report | Structured submissions (via worker when configured) |
| Network dashboard | TRX price, chain stats, Fear & Greed |

---

## Upgrade notes

| From | Notes |
|:--|:--|
| **v1.0 “mvp”** | Approvals is now fully wired (was UI shell). Vanity module added in v1.1. |
| **v1.1** | + Approvals live scan, vanity demo defaults, README/ARCHITECTURE refresh |

---

## Install & run

```bash
git clone https://github.com/jamejohns/tronsec.git
cd tronsec
python -m http.server 8080
# open http://localhost:8080/app/
```

No API keys required for local run — uses the public worker proxy by default.

---

**Full changelog:** [CHANGELOG.md](https://github.com/jamejohns/tronsec/blob/main/CHANGELOG.md)

**Live product:** [tronsec.io/app](https://tronsec.io/app/)
