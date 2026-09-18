/* Public worker URL (not a secret). */
window.TRONSEC_PROXY = Object.assign(
  {
    base: 'https://api.tronsec.io',
    supportBase: 'https://api.tronsec.io',
  },
  window.TRONSEC_PROXY || {}
);
