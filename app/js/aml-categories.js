// AML risk category taxonomy — TronScan tags, secAcc flags, known addresses.
(function () {
  'use strict';

  const AML_CATEGORY_ORDER = [
    'sanctions', 'scam_fraud', 'mixer', 'hack_exploit', 'blacklisted', 'fraud_onchain',
    'gambling', 'unknown_risk', 'exchange', 'defi', 'bridge', 'spam_dust',
  ];

  const AML_CATEGORY_META = {
    sanctions:      { severity: 'critical', badge: 'b-red',   label: 'Sanctions',      color: '#ef4444' },
    scam_fraud:     { severity: 'high',     badge: 'b-red',   label: 'Scam / fraud',   color: '#fb7185' },
    mixer:          { severity: 'high',     badge: 'b-red',   label: 'Mixer / privacy', color: '#f43f5e' },
    hack_exploit:   { severity: 'high',     badge: 'b-red',   label: 'Hack / exploit', color: '#e11d48' },
    blacklisted:    { severity: 'high',     badge: 'b-red',   label: 'Stablecoin blacklist', color: '#dc2626' },
    fraud_onchain:  { severity: 'high',     badge: 'b-red',   label: 'Fraud activity', color: '#f87171' },
    gambling:       { severity: 'medium',   badge: 'b-amber', label: 'Gambling',       color: '#f59e0b' },
    unknown_risk:   { severity: 'medium',   badge: 'b-amber', label: 'Security flag',  color: '#fbbf24' },
    exchange:       { severity: 'info',     badge: 'b-cyan',  label: 'Exchange',       color: '#22d3ee' },
    defi:           { severity: 'info',     badge: 'b-cyan',  label: 'DeFi / DEX',     color: '#38bdf8' },
    bridge:         { severity: 'info',     badge: 'b-cyan',  label: 'Bridge',         color: '#06b6d4' },
    spam_dust:      { severity: 'low',      badge: 'b-ghost', label: 'Spam / dust',    color: '#71717a' },
  };

  const AML_GRAPH_FALLBACK = {
    danger: '#fb7185',
    warn: '#fbbf24',
    safe: '#34d399',
    center: '#f5f5f7',
  };

  const AML_RISK_TAG_RE = /scam|phish|fraud|blacklist|sanction|malicious|hack|exploit|mixer|rug|drain|honeypot/i;
  const AML_SANCTION_TAG_RE = /ofac|sdn|sanction/i;

  const AML_ADDRESS_BOOK_ENTRIES = [
    ['TNJVzGqKBWkJxJB5XYSqGAwUTV15U24pPq', { category: 'defi', label: 'SunSwap Router' }],
    ['TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax', { category: 'defi', label: 'SunSwap Router' }],
    ['TKWJdrQkqHisa1X8HUdHEfREvTzw4pMAaY', { category: 'defi', label: 'SunSwap Factory' }],
    ['TCFNp179Lg46D16zKoumd4Poa2WFFdtqYj', { category: 'defi', label: 'SUN Smart Router' }],
    ['TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S', { category: 'defi', label: 'SUN' }],
    ['TJ4NNy8x6a2KJ4Ap9R9YTkPJ73R2JvN8xq', { category: 'exchange', label: 'Binance' }],
    ['THPvaUhoh4q8SF59m74avMWz642aZ6m5c5', { category: 'exchange', label: 'Binance' }],
    ['TKHuVq1oKQLXTkdQ59xKf7g4v6pKgjL1ug', { category: 'exchange', label: 'HTX' }],
    ['TQrY8tryqsYHD76AMAxYcVp9dLXqXpU3f', { category: 'exchange', label: 'OKX' }],
    ['TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', { category: 'exchange', label: 'Poloniex' }],
    ['TYASr5UV6HEcXatwdFQfmLVUqQQzvNgz9i', { category: 'exchange', label: 'KuCoin' }],
    ['TAUUPGQqR8WCVL88Ap9qoHk5XGrHsmNGJQ', { category: 'bridge', label: 'Allbridge' }],
  ];
  const AML_ADDRESS_BOOK = new Map(
    AML_ADDRESS_BOOK_ENTRIES.map(([addr, meta]) => [addr.toLowerCase(), meta]),
  );

  function amlCategoryMeta(id) {
    return AML_CATEGORY_META[id] || null;
  }

  function amlCatLabel(id) {
    const meta = amlCategoryMeta(id);
    return meta ? t(meta.label) : id;
  }

  function amlCategoryColor(id) {
    return amlCategoryMeta(id)?.color || AML_GRAPH_FALLBACK.safe;
  }

  const AML_MAX_SINGLE_TRANSFER_USD = 500_000_000;

  function amlFormatExposureUsd(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 1e15) return '';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    if (n >= 100) return '$' + Math.round(n);
