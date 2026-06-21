/* Copy to secrets.local.js (gitignored) */

/* Default: proxy-config.js points at the TRONSEC worker — no browser keys needed.
   Override only if you self-host your own worker: */
// window.TRONSEC_PROXY = { base: 'https://your-worker.workers.dev' };

/* Optional local dev: disable proxy and call TronGrid/TronScan directly from the browser.
   VT + Telegram still need a worker. See README → "Local dev fallback". */
// window.TRONSEC_PROXY = { base: '' };
// Object.assign(window.TRONSEC_KEYS, {
//   trongrid: '',
//   tronscan: '',
// });
