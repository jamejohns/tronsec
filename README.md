<div align="center">

<br>

<img src="assets/brand/logo-mark-dark.svg" alt="TRONSEC" width="88" height="88">


# TRONSEC

### TRON security terminal · wallets · contracts · transactions

Read-only on-chain intelligence for the TRON ecosystem.<br>
No wallet connection. No registration. No install.

<br>

<a href="https://tronsec.io/app/"><img src="https://img.shields.io/badge/Launch_App-tronsec.io-0a0a0a?style=for-the-badge&labelColor=111111" alt="Launch app"></a>
<a href="https://tronsec.io/"><img src="https://img.shields.io/badge/Website-tronsec.io-ffffff?style=for-the-badge&labelColor=e50914" alt="Website"></a>
&nbsp;
<a href="https://t.me/tronsec_chat"><img src="https://img.shields.io/badge/Telegram-community-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>

<br><br>

<img src="https://img.shields.io/badge/chain-TRON_Mainnet-e50914?style=flat-square" alt="TRON">
<img src="https://img.shields.io/badge/runtime-vanilla_JS-f7df1e?style=flat-square&logo=javascript&logoColor=000" alt="JavaScript">
<img src="https://img.shields.io/badge/i18n-8_languages-64748b?style=flat-square" alt="i18n">
<img src="https://img.shields.io/badge/build-none_required-22c55e?style=flat-square" alt="No build">

<br><br>

</div>

<br>

## Why TRONSEC

Paste an address, contract, transaction hash, or URL — receive structured risk signals, portfolio context, and explorer-grade detail in a single security workbench.

This repository is the **open-source browser application**. Marketing pages and localized shells ship separately on [tronsec.io](https://tronsec.io).

<br>

<table>
<tr>
<td width="50%" valign="top">

**Read-only by design**  
Never requests seed phrases, private keys, or wallet signatures.

**Zero friction**  
Runs in the browser. No npm install required to fork or self-host.

</td>
<td width="50%" valign="top">

**Global-ready**  
Eight languages: EN · RU · ZH · ES · PT · VI · TR · ID.

**Production-grade UX**  
Command palette, guided tour, dark/light theme, mobile layout, PWA manifest.

</td>
</tr>
</table>

<br>

---

<br>

## Modules

<table>
<tr>
<td width="33%" valign="top"><strong>Wallet scanner</strong><br><sub>Portfolio USD · TRC-20 · stake · bandwidth & energy · activity feed</sub></td>
<td width="33%" valign="top"><strong>AML risk check</strong><br><sub>Heuristics · counterparty exposure · token flows · PDF export</sub></td>
<td width="33%" valign="top"><strong>Contract audit</strong><br><sub>Privileged functions · proxy patterns · TRON risk markers</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><strong>TX decoder</strong><br><sub>TRC-20 transfers · approvals · fees · scam-pattern warnings</sub></td>
<td width="33%" valign="top"><strong>URL scanner</strong><br><sub>Typosquatting · homoglyphs · VirusTotal integration</sub></td>
<td width="33%" valign="top"><strong>Scam report</strong><br><sub>Structured submissions · optional Telegram backend</sub></td>
</tr>
</table>

<br>

> **Approvals monitor — work in progress.**  
> The approvals tab is currently a **UI shell** (layout and demo states only). Live allowance fetching and revoke actions are **not wired** in this open-source build. Wallet scanner and TX decoder still surface approval-related signals where available.

<br>

---

<br>

## Get started

<details open>
<summary><strong>1 · Clone</strong></summary>

```bash
git clone https://github.com/jamejons/tronsec.git
cd tronsec
```

</details>

<details open>
<summary><strong>2 · API keys</strong> — required for live scans</summary>

This repo ships **without secrets**. Copy the template and add your credentials:

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

| Key | Used by | Provider |
|:--|:--|:--|
| `trongrid` | Wallet · AML · TX · contracts | [trongrid.io](https://www.trongrid.io/) |
| `tronscan` | Holdings · labels · transfers | [TronScan API](https://docs.tronscan.org/) |
| `virustotal` | URL phishing module | [virustotal.com](https://www.virustotal.com/) |
| `telegramBotToken` · `telegramChatId` | Scam report form | [@BotFather](https://t.me/BotFather) |

`secrets.local.js` is **gitignored** — never commit real keys.

For production, use a **backend proxy** (Cloudflare Worker, etc.) so credentials never reach the browser. The official app at [tronsec.io/app/](https://tronsec.io/app/) uses private configuration.

</details>

<details open>
<summary><strong>3 · Run locally</strong></summary>

Serve the **repository root** so `/assets/` resolves correctly:

```bash
python -m http.server 8080
# → http://localhost:8080/app/
```

```bash
npx serve .
# → http://localhost:3000/app/
```

</details>

<br>

---

<br>

## Architecture

```
tronsec/
├── app/                    Application shell + modules
│   ├── index.html
│   ├── app-tron.js
│   ├── styles-tron.css
│   └── js/
│       ├── wallet.js       Scanner
│       ├── aml.js            Risk report
│       ├── contract.js       Contract audit
│       ├── tx-decoder.js     Transaction decoder
│       ├── phish-check.js    URL scanner
│       ├── approvals.js      Approvals UI (WIP)
│       ├── shared.js         APIs · UI primitives
│       ├── brand.js          tronsec.io links
│       └── secrets*.js       Key configuration
├── assets/                   Brand · fonts · i18n
└── manifest.json             PWA metadata
```

| Layer | Stack |
|:--|:--|
| UI | HTML · CSS variables · Tailwind CDN |
| Logic | Vanilla JavaScript — no bundler |
| Icons | Lucide |
| Graphs | D3.js |
| Data | TronGrid · TronScan · VirusTotal |

Deploy as static files. Map `/app/` to the terminal and `/assets/` to shared resources.

<br>

---

<br>

## Security

| | |
|:--|:--|
| **Client-side keys** | Anything in `secrets.local.js` is visible in DevTools — treat as rate-limited credentials, not secrets. |
| **Read-only** | The app does not sign transactions or connect to wallets. |
| **Abuse protection** | Captcha gate on sensitive scan and report actions. |
| **Git hygiene** | Never commit `secrets.local.js`. Rotate keys immediately if they were ever pushed. |

<br>

---

<br>

## Branding

Official **TRONSEC** identity links to [tronsec.io](https://tronsec.io). Forks and mirrors should keep `app/js/brand.js` attribution — do not rebrand without permission.

<br>

---

<br>

<div align="center">

<sub>

**[tronsec.io/app](https://tronsec.io/app/)** · [Website](https://tronsec.io) · [Telegram](https://t.me/tronsec_chat) · [Issues](https://github.com/jamejons/tronsec/issues)

<br>

Built for the TRON ecosystem

</sub>

</div>
