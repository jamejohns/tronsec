/* Public worker URL (not a secret). Override in secrets.local.js if needed. */
window.TRONSEC_PROXY = Object.assign(
  { base: 'https://api-proxy.tronsec-io.workers.dev' },
  window.TRONSEC_PROXY || {}
);
