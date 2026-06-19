<table width="100%">
<tr>
<td align="center" bgcolor="#0a0a0b">

<br>

<img src="assets/brand/logo-mark.svg" alt="" width="64" height="64">

<br>

<h1 align="center">
<a href="https://tronsec.io/app/" style="color:#ffffff;text-decoration:none;letter-spacing:0.14em;font-weight:700;">
TRONSEC
</a>
</h1>

<p align="center">
<sub style="color:#9ca3af;letter-spacing:0.06em;">
TRON SECURITY TERMINAL · WALLETS · CONTRACTS · TRANSACTIONS
</sub>
</p>

<p align="center" style="color:#6b7280;max-width:480px;">
Read-only on-chain intelligence.<br>
No wallet connection · No signup · No install
</p>

<br>

<a href="https://tronsec.io/app/"><img src="https://img.shields.io/badge/→_Open_App-tronsec.io%2Fapp-ffffff?style=for-the-badge&labelColor=0a0a0b" alt="Open app"></a>
&nbsp;
<a href="https://tronsec.io/"><img src="https://img.shields.io/badge/website-tronsec.io-e50914?style=for-the-badge" alt="Website"></a>
&nbsp;
<a href="https://t.me/tronsec_chat"><img src="https://img.shields.io/badge/telegram-community-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>

<br><br>

<img src="https://img.shields.io/badge/TRON-Mainnet-e50914?style=flat-square">
<img src="https://img.shields.io/badge/JS-vanilla-111111?style=flat-square&labelColor=0a0a0b">
<img src="https://img.shields.io/badge/i18n-8_langs-374151?style=flat-square&labelColor=0a0a0b">
<img src="https://img.shields.io/badge/build-none-22c55e?style=flat-square&labelColor=0a0a0b">

<br><br>

</td>
</tr>
</table>

<br>

Paste a `T…` address, contract, transaction hash, or URL — get portfolio context, risk signals, and explorer-grade detail in one security workbench.

Open-source **browser application** only. Marketing site and localized shells live at **[tronsec.io](https://tronsec.io)**.

<br>

```
┌─ modules ───────────────────────────────────────────────────────┐
│                                                                 │
│  scanner.sh          wallet · portfolio · TRC-20 · activity     │
│  aml.check           exposure · heuristics · PDF report           │
│  contract.scan       bytecode · privileged ops · proxy flags     │
│  tx.decoder          TRC-20 · approvals · fees · scam patterns   │
│  phish.scan          typosquat · homoglyphs · VirusTotal          │
│  report_scam.md      structured reports · Telegram backend      │
│  approvals.js        UI shell only — not fully wired yet  ⚠       │
│                                                                 │
│  /                   command palette    ·    EN RU ZH ES PT VI TR ID │
└─────────────────────────────────────────────────────────────────┘
```

<br>

<table>
<tr>
<td align="center" width="25%"><br><strong>Read-only</strong><br><sub>No keys · no signatures</sub><br><br></td>
<td align="center" width="25%"><br><strong>Instant</strong><br><sub>Static · zero build step</sub><br><br></td>
<td align="center" width="25%"><br><strong>Global</strong><br><sub>8-language UI</sub><br><br></td>
<td align="center" width="25%"><br><strong>Polished</strong><br><sub>Dark/light · mobile · PWA</sub><br><br></td>
</tr>
</table>

<br>

## Get started

**Clone**

```bash
git clone https://github.com/jamejons/tronsec.git && cd tronsec
```

**API keys** — the repo ships without credentials. Required for live on-chain and external scans:

```bash
cp app/js/secrets.local.example.js app/js/secrets.local.js
```

```js
Object.assign(window.TRONSEC_KEYS, {
  trongrid: 'YOUR_TRONGRID_API_KEY',
  tronscan: 'YOUR_TRONSCAN_API_KEY',
  virustotal: 'YOUR_VIRUSTOTAL_API_KEY',
  telegramBotToken: 'YOUR_BOT_TOKEN',
  telegramChatId: 'YOUR_CHAT_ID',
});
```

| Key | Module | Get key |
|:--|:--|:--|
| `trongrid` | Wallet · AML · TX · contracts | [trongrid.io](https://www.trongrid.io/) |
| `tronscan` | Holdings · labels · history | [docs.tronscan.org](https://docs.tronscan.org/) |
| `virustotal` | URL scanner | [virustotal.com](https://www.virustotal.com/) |
| `telegramBotToken` + `telegramChatId` | Scam reports | [@BotFather](https://t.me/BotFather) |

`secrets.local.js` is gitignored. For production, proxy APIs server-side — [tronsec.io](https://tronsec.io/app/) does.

**Run** — serve the repo root (not `app/` alone):

```bash
python -m http.server 8080    # → localhost:8080/app/
```

<br>

## Approvals module

> **Work in progress.** The approvals tab is a **UI shell** — layout and demo states only. Live allowance fetching and revoke are **not connected** in this build. Scanner and TX decoder still flag approval-related risk where data exists.

<br>

## Stack

| | |
|:--|:--|
| **UI** | HTML · CSS variables · Tailwind CDN · Lucide |
| **Logic** | Vanilla JS modules — no bundler, no npm required |
| **Data** | TronGrid · TronScan · VirusTotal (via proxy) |
| **Deploy** | Any static host — `/app/` + `/assets/` |

```
tronsec/
├── app/           shell · modules · styles
├── assets/        brand · fonts · i18n (8 langs)
└── manifest.json
```

<br>

## Security & branding

- Keys in `secrets.local.js` are visible in DevTools — rate-limit and rotate if exposed.
- App never signs transactions or connects wallets. Captcha on abuse-prone actions.
- Official brand: **[tronsec.io](https://tronsec.io)** via `app/js/brand.js` — keep attribution when forking.

<br>

<div align="center">

<sub>

**[tronsec.io/app](https://tronsec.io/app/)** &nbsp;·&nbsp; [tronsec.io](https://tronsec.io) &nbsp;·&nbsp; [Telegram](https://t.me/tronsec_chat) &nbsp;·&nbsp; [Issues](https://github.com/jamejons/tronsec/issues)

</sub>

</div>
