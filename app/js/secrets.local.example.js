/* Copy to secrets.local.js (gitignored) — LOCAL DEVELOPMENT ONLY.
   tronsec.io production does NOT load this file and does NOT use browser API keys. */

/* Default (recommended): use the public worker proxy — no keys needed.
   proxy-config.js already points at the TRONSEC worker. */

/* Self-hosted worker: */
// window.TRONSEC_PROXY = { base: 'https://your-worker.workers.dev' };

/* Advanced: disable proxy and call TronGrid/TronScan directly from your browser.
   Keys are visible in DevTools. NOT how production works. VT still needs a worker. */
// window.TRONSEC_PROXY = { base: '' };
// Object.assign(window.TRONSEC_KEYS, {
//   trongrid: 'your-dev-trongrid-key',
//   tronscan: 'your-dev-tronscan-key',
// });
