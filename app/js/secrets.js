/* Production (tronsec.io): no API keys in the browser — all upstream calls use the
   Cloudflare Worker in proxy-config.js. Keys live as Wrangler secrets on the worker.

   This object is ONLY for optional local development when you disable the proxy.
   See README → "Optional: local dev without proxy" and ARCHITECTURE.md. */
window.TRONSEC_KEYS = Object.assign(
  {
    trongrid: '',
    tronscan: '',
  },
  window.TRONSEC_KEYS || {}
);
