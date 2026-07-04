# Security policy

## Supported versions

| Version | Supported |
|:--|:--|
| `main` (latest export) | Yes |
| Older tags | Best-effort |

Live app: **[tronsec.io/app](https://tronsec.io/app/)**

## Reporting a vulnerability

**Please do not open public issues for security bugs.**

1. Email or DM via [Telegram community](https://t.me/tronsec_chat) (maintainer contact).
2. Include steps to reproduce, impact, and affected module (wallet, AML, proxy, etc.).
3. Allow up to **7 business days** for an initial response.

We appreciate responsible disclosure.

## Design principles

- **Read-only by default** — this UI does not connect wallets or sign transactions.
- **No seed phrases** — TRONSEC never asks for private keys or mnemonics (except vanity generator keys you create locally).
- **API keys** — production uses a server-side proxy; do not commit `secrets.local.js`.
- **Vanity generator** — runs entirely in your browser; export your keys yourself; we cannot recover them.

## Forking

If you fork this repo, rotate any API keys you embed and restrict your worker CORS to your own domain.
