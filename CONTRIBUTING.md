# Contributing to TRONSEC

Thank you for your interest in TRONSEC. This repository is the **public application export** — the live product is at **[tronsec.io](https://tronsec.io)**.

## What this repo contains

| In this repo | Not in this repo (private / hosted separately) |
|:--|:--|
| `app/` — readable JavaScript UI | Marketing site HTML |
| `assets/` — brand, fonts, i18n | `dist/` obfuscated production build |
| Worker proxy URL in `proxy-config.js` | Cloudflare Worker source & API secrets |

Default branch: **`main`**.

## How to contribute

1. **Bug reports** — [open an issue](https://github.com/jamejohns/tronsec/issues) with steps to reproduce, browser, and a TRON address / tx hash if relevant (redact personal data).
2. **Small fixes** — fork, branch from `main`, edit files under `app/` or `assets/`, open a PR with a clear description.
3. **Larger features** — open an issue first to align scope; the maintainer may land changes in the private staging tree and sync here.

## Local setup

```bash
git clone https://github.com/jamejohns/tronsec.git
cd tronsec
cp app/js/secrets.local.example.js app/js/secrets.local.js
python -m http.server 8080
```

Open **http://localhost:8080/app/**.

## Rules

- **Never commit API keys**, bot tokens, or `app/js/secrets.local.js`.
- Keep changes **read-only** — no wallet connect, no transaction signing.
- Preserve attribution in `app/js/brand.js` when forking.
- The **Approvals** tab is UI-only in this export; do not imply live revoke without wiring APIs.
- PRs should be focused; avoid drive-by refactors.

## Maintainer sync

The public tree is periodically synced from an internal staging app. Your PR may be merged directly or cherry-picked into staging and re-exported — either way you will be credited in the commit message.

## Questions

- [Telegram community](https://t.me/tronsec_chat)
- [tronsec.io](https://tronsec.io)
