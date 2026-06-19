// ==================================
//  CONFIG
// ==================================
window.TRONSEC_ASSET_BASE = (function () {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length && /\.[a-z0-9]+$/i.test(parts[parts.length - 1])) parts.pop();
  const appIdx = parts.lastIndexOf('app');
  if (appIdx === -1) return '../assets';
  const LOCALES = new Set(['ru', 'zh', 'es', 'pt-BR', 'vi', 'tr', 'id', 'en']);
  const start = appIdx > 0 && LOCALES.has(parts[appIdx - 1]) ? appIdx - 1 : appIdx;
  return '../'.repeat(parts.slice(start).length) + 'assets';
})();

window.tronsecAsset = function tronsecAsset(relativePath) {
  const base = (window.TRONSEC_ASSET_BASE || '../assets').replace(/\/$/, '');
  const joined = `${base}/${String(relativePath).replace(/^\//, '')}`;
  try {
    return new URL(joined, location.href).href;
  } catch (_) {
    return joined;
  }
};

window.tronsecShieldMarkSvg = function tronsecShieldMarkSvg(size, className) {
  const cls = className ? ` class="${esc(className)}"` : '';
  return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M32 8L12 18v12c0 10.8 8.2 20.8 20 24 11.8-3.2 20-13.2 20-24V18L32 8z" fill="#f5f5f7"/></svg>`;
};

const TRONGRID_API_KEY = (window.TRONSEC_KEYS && window.TRONSEC_KEYS.trongrid) || '';
const TRONSCAN_API_KEY = (window.TRONSEC_KEYS && window.TRONSEC_KEYS.tronscan) || '';
const BASE_GRID = 'https://api.trongrid.io';
const BASE_SCAN = 'https://apilist.tronscanapi.com/api';

function trongridHeaders() {
  return TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } : {};
}
function tronscanHeaders() {
  return TRONSCAN_API_KEY ? { 'TRON-PRO-API-KEY': TRONSCAN_API_KEY } : {};
}

// ==================================
//  UTILS
// ==================================
const isValidTron = a => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test((a||'').trim());
const short = a => a ? `${a.slice(0,6)}?${a.slice(-4)}` : '—';

const fmtNum = n => {
  if (n == null) return '—';
  if (n >= 1e9) return (n/1e9).toFixed(2)+'B';
  if (n >= 1e6) return (n/1e6).toFixed(2)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
  return Number(n).toFixed(0);
};
const toTRX = sun => sun ? (sun/1_000_000).toFixed(2) : '0.00';

// -- Token amount formatting (shared by tx-decoder & approvals) ------
const UNLIMITED_THRESHOLD = BigInt('0xfffffffffffffffffffffffffffffff0');

// -- TRON Base58 address conversion ----------------------------------
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function _base58Encode(bytes) {
  if (!bytes || bytes.length === 0) return '';
  let n = BigInt(0);
  for (const b of bytes) n = (n << BigInt(8)) + BigInt(b);
  if (n === BigInt(0)) return BASE58_ALPHABET[0];
  let result = '';
  while (n > 0) {
    result = BASE58_ALPHABET[Number(n % BigInt(58))] + result;
    n /= BigInt(58);
  }
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result = BASE58_ALPHABET[0] + result;
  }
  return result;
}

async function hexToTronAddress(hex) {
  if (!hex || typeof hex !== 'string') return hex;
  if (isValidTron(hex)) return hex;
  const clean = hex.replace(/^0x/, '');
  if (clean.length !== 42) return hex;
  const bytes = new Uint8Array(21);
  for (let i = 0; i < 42; i += 2) bytes[i >> 1] = parseInt(clean.slice(i, i + 2), 16);
  try {
    const hash1 = await crypto.subtle.digest('SHA-256', bytes);
    const hash2 = await crypto.subtle.digest('SHA-256', hash1);
    const full = new Uint8Array(25);
    full.set(bytes, 0);
    full.set(new Uint8Array(hash2, 0, 4), 21);
    return _base58Encode(full);
  } catch (_) {
    return hex;
  }
}

function isUnlimitedApproval(amount, decimals=6) {
  if (amount == null || amount === '') return false;
  let big;
  try { big = typeof amount === 'bigint' ? amount : BigInt(String(amount)); }
  catch(_) { return false; }
  return big >= UNLIMITED_THRESHOLD;
}

function fmtTokenAmt(raw, decimals = 6) {
  if (raw == null) return '—';
  let bigRaw;
  try { bigRaw = typeof raw === 'bigint' ? raw : BigInt(String(raw)); }
  catch(_) { return String(raw); }
  const divisor = BigInt(10 ** decimals);

  if (bigRaw >= UNLIMITED_THRESHOLD) return '≈ Unlimited';

  const whole = bigRaw / divisor;
  const frac  = bigRaw % divisor;
  const fracStr = frac.toString().padStart(decimals, '0');
  const n = Number(whole) + Number('0.' + fracStr);

  if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3)  return n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  return n.toFixed(n < 1 ? 6 : 2);
}

const ago = ts => {
  const d = Date.now() - ts;
  if (d < 60000)    return `${Math.floor(d/1000)}s ago`;
  if (d < 3600000)  return `${Math.floor(d/60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
  return `${Math.floor(d/86400000)}d ago`;
};

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function gridGet(path, params={}) {
  const url = new URL(BASE_GRID+path);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
  const headers = trongridHeaders();
  const res = await fetch(url.toString(), {headers});
  if (!res.ok) {
    let bodyText = '';
    try { bodyText = await res.text(); } catch(_) { bodyText = ''; }
    let json = null;
    try { json = JSON.parse(bodyText); } catch(_) { json = null; }
    const msg = json && (json.error || json.message) ? (json.error || json.message) : (bodyText || res.statusText || '');
    const err = new Error(`TronGrid ${res.status}${msg?': '+msg:''}`);
    err.status = res.status;
    err.body = json || bodyText;
    throw err;
  }
  return res.json();
}

async function gridPost(path, body) {
  const headers = {'Content-Type':'application/json', ...trongridHeaders()};
  const res = await fetch(BASE_GRID+path, {method:'POST', headers, body:JSON.stringify(body)});
  if (!res.ok) {
    let bodyText = '';
    try { bodyText = await res.text(); } catch(_) { bodyText = ''; }
    let json = null;
    try { json = JSON.parse(bodyText); } catch(_) { json = null; }
    const msg = json && (json.error || json.message) ? (json.error || json.message) : (bodyText || res.statusText || '');
    const err = new Error(`TronGrid ${res.status}${msg?': '+msg:''}`);
    err.status = res.status;
    err.body = json || bodyText;
    throw err;
  }
  return res.json();
}

// -- Tronscan API rate limiter --
const _scanQueue = [];
let _scanBusy = false;
async function _scanNext() {
  if (_scanBusy || _scanQueue.length === 0) return;
  _scanBusy = true;
  const { url, headers, resolve, reject } = _scanQueue.shift();
  try {
    const res = await fetch(url.toString(), {headers});
    if (!res.ok) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch(_) { bodyText = ''; }
      let json = null;
      try { json = JSON.parse(bodyText); } catch(_) { json = null; }
      const msg = json && (json.error || json.message) ? (json.error || json.message) : (bodyText || res.statusText || '');
      const err = new Error(`TronScan ${res.status}${msg?': '+msg:''}`);
      err.status = res.status;
      err.body = json || bodyText;
      reject(err);
    } else {
      resolve(await res.json());
    }
  } catch(e) { reject(e); }
  finally {
    _scanBusy = false;
    setTimeout(_scanNext, 250);
  }
}
function _enqueueScan(url, headers) {
  return new Promise((resolve, reject) => {
    _scanQueue.push({ url, headers, resolve, reject });
    _scanNext();
  });
}

async function scanGet(path, params={}) {
  const url = new URL(BASE_SCAN+path);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
  const headers = tronscanHeaders();
  return _enqueueScan(url, headers);
}

function userFriendlyFetchError(e) {
  if (!e) return t('Unknown fetch error');
  if (typeof e === 'string') return t(e);
  const status = e.status || (e.message && (e.message.match(/\b(\d{3})\b/) ? Number(e.message.match(/\b(\d{3})\b/)[1]) : null));
  if (status === 400 || status === 404) return t('Address not found or unactivated — no on-chain account for that address. Please check the address format and try again.');
  if (status >= 500) return t('External service error (TronGrid/TronScan). Please try again later.');
  return t('Fetch failed: {message}', { message: e.message || String(e) });
}

async function fetchTrc20FromTronScan(address) {
  const endpoints = [
    ['/token_trc20/transfers', {address, start:0, limit:200}],
    ['/token_trc20/transfers', {account:address, start:0, limit:200}],
    ['/transaction', {address, start:0, limit:200}],
    ['/transactions', {address, start:0, limit:200}],
    ['/transfer', {address, start:0, limit:200}],
    ['/token_transfers', {address, start:0, limit:200}],
  ];
  for (const [path, params] of endpoints) {
    try {
      const res = await scanGet(path, params);
      if (!res) continue;
      const arr = res.data || res.transfers || res.transactions || res.txs || (Array.isArray(res) ? res : null) || res.items;
      if (arr && arr.length) return arr;
    } catch(_) {}
  }
  return [];
}


// ==================================
//  TRX PRICE  (used by wallet.js for USD calculations)
// ==================================
let TRX_PRICE  = null;
let TRX_CHANGE = null;

const _PRICE_KEY = 'trxs_price_v1';
const _PRICE_TTL = 3 * 60 * 1000;

function _priceFromCache() {
  try {
    const d = JSON.parse(sessionStorage.getItem(_PRICE_KEY));
    if (d && Date.now() - d.ts < _PRICE_TTL) return d;
  } catch(_) {}
  return null;
}

function _priceToCache(usd, change) {
  try { sessionStorage.setItem(_PRICE_KEY, JSON.stringify({usd, change, ts: Date.now()})); } catch(_) {}
}

async function fetchTrxPrice() {
  try {
    const r = await fetch(`${BASE_SCAN}/funds`, {cache:'no-store', headers: tronscanHeaders()});
    if (r.ok) {
      const d = await r.json();
      const usd = parseFloat(d.priceInUsd || 0) || null;
      if (usd) return {usd, change: null};
    }
  } catch(_) {}
  const r2 = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd&include_24hr_change=true', {cache:'no-store'});
  if (!r2.ok) throw new Error('CoinGecko '+r2.status);
  const d2 = await r2.json();
  return {usd: d2?.tron?.usd || null, change: d2?.tron?.usd_24h_change || null};
}

const _priceReady = (async function initPrice() {
  const cached = _priceFromCache();
  if (cached) {
    TRX_PRICE  = cached.usd;
    TRX_CHANGE = cached.change;
    return;
  }
  try {
    const {usd, change} = await fetchTrxPrice();
    TRX_PRICE  = usd; TRX_CHANGE = change;
    _priceToCache(usd, change);
  } catch(_) {}
  setInterval(async () => {
    try {
      const {usd, change} = await fetchTrxPrice();
      TRX_PRICE  = usd; TRX_CHANGE = change;
      _priceToCache(usd, change);
    } catch(_) {}
  }, _PRICE_TTL);
})();
// ==================================
//  SKELETON LOADERS
// ==================================
const sk = (cls = '', w = '') => {
  const style = w ? ` style="width:${w}"` : '';
  return `<div class="sk ${cls}"${style}></div>`;
};
const skGap = (h = 12) => `<div class="sk-gap" style="height:${h}px"></div>`;

const SK = {
  status: (label = 'FETCHING DATA', id = '') => `
    <div class="sk-status"${id ? ` id="${id}"` : ''}>
      <span class="sk-status-dot"></span>
      <span class="sk-status-text">[ ${t(label)} ]</span>
    </div>`,

  statGrid: (count = 4, min = 140) => `
    <div class="sk-stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(${min}px,1fr))">
      ${Array.from({ length: count }, (_, i) => `
        <div class="sk-stat">
          ${sk('sk-line-xs')}
          ${sk('sk-line-lg', `${50 + (i % 3) * 12}%`)}
          ${sk('sk-line-xs', '42%')}
        </div>`).join('')}
    </div>`,

  panel: (rows = 4, headW = '38%') => `
    <div class="sk-panel">
      <div class="sk-panel-head">${sk('sk-line-xs', headW)}</div>
      <div class="sk-panel-body">
        ${Array.from({ length: rows }, (_, i) => `
          <div class="sk-kv-row">
            ${sk('sk-line', `${28 + (i % 2) * 8}%`)}
            ${sk('sk-line', `${18 + (i % 3) * 6}%`)}
          </div>`).join('')}
      </div>
    </div>`,

  tableRows: (rows = 4, cols = 5) => `
    <div class="sk-table-head" style="--sk-cols:${cols}">
      ${Array.from({ length: cols }, () => sk('sk-line-xs')).join('')}
    </div>
    ${Array.from({ length: rows }, () => `
      <div class="sk-table-row" style="--sk-cols:${cols}">
        ${Array.from({ length: cols }, (_, ci) => sk('sk-line-xs', ci === 0 ? '72%' : ci === cols - 1 ? '55%' : '100%')).join('')}
      </div>`).join('')}`,

  table: (rows = 4, cols = 5) => `
    <div class="sk-table-wrap">${SK.tableRows(rows, cols)}</div>`,

  tabs: (count = 3) => `
    <div class="sk-tabs-row">
      ${Array.from({ length: count }, (_, i) => `<div class="sk sk-tab-pill${i === 0 ? ' is-wide' : ''}"></div>`).join('')}
    </div>`,

  tokens: (count = 4) => `
    <div class="sk-token-grid">
      ${Array.from({ length: count }, () => `
        <div class="sk-token-card">
          ${sk('sk-avatar')}
          <div class="sk-token-meta">
            ${sk('sk-line-xs', '58%')}
            ${sk('sk-line-xs', '42%')}
          </div>
          <div class="sk-token-val">
            ${sk('sk-line-sm', '48px')}
            ${sk('sk-line-xs', '36px')}
          </div>
        </div>`).join('')}
    </div>`,

  chart: (h = 220) => `
    <div class="sk-panel">
      <div class="sk-panel-head sk-panel-head-split">
        ${sk('sk-line-xs', '36%')}
        ${sk('sk-line-xs', '22%')}
      </div>
      <div class="sk-panel-body sk-panel-body-flush">
        <div class="sk sk-chart" style="height:${h}px"></div>
        <div class="sk-stat-grid sk-stat-grid-compact" style="grid-template-columns:repeat(4,minmax(0,1fr));padding:8px 12px;border-top:1px solid var(--line)">
          ${Array.from({ length: 4 }, (_, i) => `
            <div class="sk-stat sk-stat-flat">
              ${sk('sk-line-xs', '50%')}
              ${sk('sk-line-md', `${40 + i * 5}%`)}
            </div>`).join('')}
        </div>
      </div>
    </div>`,

  analyticsCell: () => `
    <div class="an-stat an-stat--sk">
      <div class="sk an-sk-label"></div>
      <div class="sk an-sk-value"></div>
      <div class="sk an-sk-sub"></div>
    </div>`,

  analyticsGrid: (n = 3) => Array.from({ length: n }, () => SK.analyticsCell()).join(''),

  scanHeadCard: (actionCount = 3) => `
    <div class="aml-head-card sk-wallet-block">
      <div class="wallet-head-top">
        ${sk('sk-line-md', '72%')}
        <div class="wallet-head-actions" style="display:flex;gap:6px">
          ${Array.from({ length: actionCount }, () => sk('sk-line-xs', '72px')).join('')}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
        ${sk('sk-badge', '64px')}${sk('sk-badge', '58px')}${sk('sk-badge', '52px')}
      </div>
    </div>`,

  assessmentSk: () => `
    <div class="aml-alert aml-alert--inline sk-wallet-block" style="padding:12px 14px">
      <div class="sk" style="width:14px;height:14px;border-radius:50%;flex-shrink:0"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        ${sk('sk-line-sm', '78%')}
        ${sk('sk-line-xs', '54%')}
      </div>
    </div>`,

  amlKvRowsSk: (n = 4) => Array.from({ length: n }, (_, i) => `
    <div class="kv-row sk-wallet-kv">
      ${sk('sk-line-xs', `${22 + (i % 4) * 6}%`)}
      ${sk('sk-line-xs', `${30 + (i % 3) * 8}%`)}
    </div>`).join(''),

  amlBlockSk: (headW = '32%', bodyHtml = '', metaW = '') => `
    <div class="aml-block sk-wallet-block">
      <div class="aml-block-head">
        ${sk('sk-line-xs', headW)}
        ${metaW ? sk('sk-line-xs', metaW) : ''}
      </div>
      <div class="aml-block-body">${bodyHtml || SK.amlKvRowsSk(4)}</div>
    </div>`,

  amlSignalRowsSk: (n = 5) => `
    <div class="aml-signals">
      ${Array.from({ length: n }, () => `
        <div class="aml-signal sk-wallet-block" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px">
          ${sk('sk-line-sm', '72%')}
          ${sk('sk-line-xs', '30px')}
        </div>`).join('')}
    </div>`,

  amlRowsSk: (n = 3) => `
    <div class="aml-rows">
      ${Array.from({ length: n }, () => `
        <div class="aml-row sk-wallet-block">
          <div class="sk sk-avatar" style="width:34px;height:34px;border-radius:8px"></div>
          <div class="aml-row-body" style="display:flex;flex-direction:column;gap:6px;flex:1;min-width:0">
            ${sk('sk-line-xs', '46%')}
            ${sk('sk-line-xs', '34%')}
          </div>
          ${sk('sk-badge', '44px')}
        </div>`).join('')}
    </div>`,

  phishFlagRowsSk: (n = 3) => `
    <div class="phish-flags">
      ${Array.from({ length: n }, () => `
        <div class="phish-flag sk-wallet-block">
          <div class="phish-flag-body" style="display:flex;flex-direction:column;gap:6px;flex:1;min-width:0">
            ${sk('sk-line-sm', '90%')}
            ${sk('sk-line-xs', '48%')}
          </div>
          ${sk('sk-badge', '52px')}
        </div>`).join('')}
    </div>`,

  analyticsStat: (label, id, sub, tone = 'neutral') => `
    <div class="an-stat">
      <div class="an-stat-label">${t(label)}</div>
      <div class="an-stat-value is-${tone}" id="${id}"><span class="sk an-sk-value an-sk-value--inline"></span></div>
      <div class="an-stat-sub">${t(sub)}</div>
    </div>`,

  walletMeterSk: () => `
    <div class="wallet-meter">
      <div class="wallet-meter-head" style="display:flex;justify-content:space-between;gap:8px">
        ${sk('sk-line-xs', '30%')}
        ${sk('sk-line-xs', '40%')}
      </div>
      <div class="sk sk-wallet-meter-track"></div>
    </div>`,

  walletTokenRowSk: () => `
    <div class="wallet-token-row">
      <div class="sk sk-avatar" style="width:38px;height:38px;border-radius:10px"></div>
      <div class="wallet-token-body" style="display:flex;flex-direction:column;gap:6px">
        ${sk('sk-line-xs', '46%')}
        ${sk('sk-line-xs', '62%')}
      </div>
      <div class="wallet-token-val" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        ${sk('sk-line-xs', '52px')}
        ${sk('sk-line-xs', '68px')}
      </div>
    </div>`,

  walletActivityRowSk: () => `
    <div class="wallet-activity-item">
      <div class="sk sk-avatar" style="width:34px;height:34px;border-radius:9px"></div>
      <div class="wallet-activity-body" style="display:flex;flex-direction:column;gap:6px">
        ${sk('sk-line-xs', '50%')}
        ${sk('sk-line-xs', '38%')}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        ${sk('sk-line-xs', '48px')}
        ${sk('sk-line-xs', '36px')}
      </div>
    </div>`,

  walletCardSk: (rows = 6, headW = '38%') => `
    <div class="card">
      <div class="card-head">${sk('sk-line-xs', headW)}</div>
      ${Array.from({ length: rows }, (_, i) => `
        <div class="kv-row sk-wallet-kv">
          ${sk('sk-line-xs', `${30 + (i % 2) * 6}%`)}
          ${sk('sk-line-xs', `${18 + (i % 3) * 5}%`)}
        </div>`).join('')}
    </div>`,

  wallet: () => `
    <div class="wallet-scan">
      ${SK.status('SCANNING WALLET')}
      ${skGap(14)}
      <div class="wallet-head-card sk-wallet-block">
        <div class="wallet-head-top">
          ${sk('sk-line-md', '62%')}
          <div class="wallet-head-actions" style="display:flex;gap:6px">
            ${sk('sk-line-xs', '58px')}${sk('sk-line-xs', '76px')}${sk('sk-line-xs', '82px')}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
          ${Array.from({ length: 4 }, () => sk('sk-line-xs', '72px')).join('')}
        </div>
      </div>
      ${skGap(12)}
      <div class="wallet-hero-grid">
        <div class="wallet-portfolio-card sk-wallet-block">
          ${sk('sk-line-xs', '40%')}
          ${sk('sk-line-xl', '54%')}
          ${sk('sk-line-sm', '72%')}
        </div>
        <div class="wallet-meters-card sk-wallet-block">
          ${SK.walletMeterSk()}${SK.walletMeterSk()}${SK.walletMeterSk()}
        </div>
      </div>
      ${skGap(12)}
      <div class="wallet-profile-grid">
        ${SK.walletCardSk(6, '36%')}
        ${SK.walletCardSk(6, '42%')}
      </div>
      ${skGap(12)}
      <div>
        <div class="wallet-section-title">${sk('sk-line-xs', '32%')}</div>
        <div class="wallet-token-list">${Array.from({ length: 3 }, () => SK.walletTokenRowSk()).join('')}</div>
      </div>
      ${skGap(12)}
      <div>
        <div class="wallet-section-title">${sk('sk-line-xs', '36%')}</div>
        <div class="wallet-activity">${Array.from({ length: 4 }, () => SK.walletActivityRowSk()).join('')}</div>
      </div>
    </div>`,

  approvals: () => `
    <div class="appr-scan">
      ${SK.status('CHECKING APPROVALS')}
      ${skGap(14)}
      <div class="an-stat-grid an-stat-grid--2 appr-hero-grid">
        ${SK.analyticsCell()}${SK.analyticsCell()}
      </div>
      ${skGap(12)}
      <div class="appr-section">
        <div class="appr-section-head">
          ${sk('sk-line-xs', '32%')}
          ${sk('sk-badge')}
        </div>
        <div class="appr-list">
          ${Array.from({ length: 4 }, () => `
            <div class="appr-row sk-wallet-block">
              <div class="sk sk-avatar" style="width:38px;height:38px;border-radius:10px"></div>
              <div class="appr-row-body" style="display:flex;flex-direction:column;gap:6px;flex:1">
                ${sk('sk-line-xs', '52%')}
                ${sk('sk-line-xs', '68%')}
                ${sk('sk-line-xs', '44%')}
              </div>
              ${sk('sk-badge')}
            </div>`).join('')}
        </div>
      </div>
    </div>`,

  contractTableSk: (rows = 6) => `
    <div class="contract-table-wrap sk-wallet-block">
      ${SK.tableRows(rows, 4)}
    </div>`,

  contractRiskRowsSk: (n = 4) => `
    <div class="contract-risks">
      ${Array.from({ length: n }, () => `
        <div class="contract-risk sk-wallet-block">
          <div class="contract-risk-body" style="display:flex;flex-direction:column;gap:6px;flex:1;min-width:0">
            ${sk('sk-line-xs', '22%')}
            ${sk('sk-line-sm', '88%')}
          </div>
          ${sk('sk-badge', '56px')}
        </div>`).join('')}
    </div>`,

  contract: () => `
    <div class="contract-scan">
      ${SK.status('AUDITING CONTRACT', 'contract-skel-status')}
      ${skGap(12)}
      ${SK.scanHeadCard(2)}
      ${skGap(10)}
      <div class="an-stat-grid an-stat-grid--4 contract-hero-grid">
        ${SK.analyticsGrid(4)}
      </div>
      ${skGap(10)}
      <div class="contract-assessment">${SK.assessmentSk()}</div>
      ${skGap(10)}
      <div class="aml-grid-2">
        ${SK.amlBlockSk('34%', SK.amlSignalRowsSk(4), '18%')}
        ${SK.amlBlockSk('30%', SK.amlKvRowsSk(5), '20%')}
      </div>
      ${skGap(10)}
      ${SK.amlBlockSk('38%', SK.contractRiskRowsSk(4), '12%')}
      ${skGap(10)}
      ${SK.amlBlockSk('32%', SK.contractTableSk(6), '24%')}
      ${skGap(10)}
      ${sk('sk-line-xs', '82%')}
    </div>`,

  graph: () => SK.chart(220),

  aml: () => `
    <div class="aml-scan">
      ${SK.status('RUNNING AML SCREEN', 'aml-skel-status')}
      ${skGap(12)}
      ${SK.scanHeadCard(3)}
      ${skGap(10)}
      <div class="an-stat-grid an-stat-grid--4 aml-hero-grid">
        ${SK.analyticsGrid(4)}
      </div>
      ${skGap(10)}
      <div class="aml-assessment">${SK.assessmentSk()}</div>
      ${skGap(10)}
      <div class="aml-grid-2">
        ${SK.amlBlockSk('36%', SK.amlSignalRowsSk(5), '18%')}
        ${SK.amlBlockSk('30%', SK.amlKvRowsSk(5), '22%')}
      </div>
      ${skGap(10)}
      <div class="aml-grid-2">
        ${SK.amlBlockSk('34%', SK.amlKvRowsSk(3), '20%')}
        ${SK.amlBlockSk('32%', SK.amlKvRowsSk(4), '24%')}
      </div>
      ${skGap(10)}
      ${SK.amlBlockSk('38%', '<div class="sk" style="height:200px;border-radius:0"></div>', '28%')}
      ${skGap(10)}
      ${SK.amlBlockSk('42%', SK.amlRowsSk(4), '12%')}
      ${skGap(10)}
      ${sk('sk-line-xs', '88%')}
    </div>`,

  txDecoder: () => `
    <div class="tx-scan">
      ${SK.status('DECODING TRANSACTION', 'tx-skel-status')}
      ${skGap(12)}
      ${SK.scanHeadCard(2)}
      ${skGap(10)}
      <div class="an-stat-grid an-stat-grid--4 tx-hero-grid">
        ${SK.analyticsGrid(4)}
      </div>
      ${skGap(10)}
      <div class="tx-assessment">${SK.assessmentSk()}</div>
      ${skGap(10)}
      ${SK.amlBlockSk('34%', SK.amlSignalRowsSk(3), '14%')}
      ${skGap(10)}
      <div class="aml-grid-2">
        ${SK.amlBlockSk('38%', SK.amlKvRowsSk(5), '18%')}
        ${SK.amlBlockSk('30%', SK.amlKvRowsSk(6), '20%')}
      </div>
      ${skGap(10)}
      ${sk('sk-line-xs', '80%')}
    </div>`,

  scamLookup: () => `
    ${SK.status('SEARCHING DATABASE')}
    ${skGap(14)}
    ${SK.statGrid(3, 150)}
    ${skGap(12)}
    ${SK.panel(3, '32%')}
    ${skGap(12)}
    ${SK.panel(4, '38%')}`,

  phishCheck: () => `
    <div class="phish-scan" id="phish-skel">
      ${SK.status('RUNNING SCAN', 'phish-skel-status')}
      ${skGap(12)}
      ${SK.scanHeadCard(2)}
      ${skGap(10)}
      <div class="an-stat-grid an-stat-grid--4 phish-hero-grid">
        ${SK.analyticsGrid(4)}
      </div>
      ${skGap(10)}
      <div class="phish-assessment">${SK.assessmentSk()}</div>
      ${skGap(10)}
      <div class="aml-grid-2">
        ${SK.amlBlockSk('34%', SK.phishFlagRowsSk(3), '14%')}
        ${SK.amlBlockSk('36%', SK.amlKvRowsSk(3), '18%')}
      </div>
      ${skGap(10)}
      ${SK.amlBlockSk('28%', SK.amlKvRowsSk(5), '22%')}
      ${skGap(10)}
      ${sk('sk-line-xs', '76%')}
    </div>`,
};

// ==================================
//  HTML HELPERS
// ==================================
const icSVG = (d, size=13) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

const IC = {
  alert: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  check: "M20 6L9 17l-5-5",
  x:     "M18 6L6 18M6 6l12 12",
  link:  "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3",
  copy:  "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z",
  qr:    "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M16 16h4v4h-4z M18 18h2v2h-2z",
  external: "M15 3h6v6 M10 14L21 3 M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8",
  trash: "M3 6h18 M19 6l-1 14H6L5 6 M8 6V4h8v2",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
};

function badge(cls, text) {
  return `<span class="badge ${cls}">${esc(t(text))}</span>`;
}

function alertBox(type, html) {
  return `<div class="alert alert-${type}">${icSVG(IC.alert)}<div>${html}</div></div>`;
}

function setError(el, msg) {
  el.innerHTML = msg ? alertBox('red', esc(msg)) : '';
}
function flashInput(el) {
  if (!el) return;
  el.classList.add('input-flash');
  setTimeout(() => el.classList.remove('input-flash'), 500);
}
function spinBtn(btn, spin) {
  btn.disabled = spin;
  const txt = btn.querySelector('.scan-btn-text');
  const ldr = btn.querySelector('.scan-btn-loader');
  if (txt || ldr) {
    if (txt) txt.textContent = spin ? (txt.dataset.busy || '[ SCANNING ]') : (txt.dataset.idle || '[ SCAN ]');
    if (ldr) { if (spin) ldr.classList.remove('hidden'); else ldr.classList.add('hidden'); }
    return;
  }
  const svgChild = btn.querySelector('svg');
  let spinEl = btn.querySelector('.spin');
  if (spin) {
    if (svgChild) svgChild.style.display='none';
    if (!spinEl) { spinEl = document.createElement('span'); spinEl.className='spin'; btn.prepend(spinEl); }
  } else {
    if (svgChild) svgChild.style.display='';
    if (spinEl) spinEl.remove();
  }
}


// ==================================
//  GLOSSARY ? technical term tooltips
// ==================================
const GLOSSARY = {
  aml:              { lbl:'AML',              desc:'Anti-Money Laundering — automated blockchain risk screening.' },
  trc20:            { lbl:'TRC20',            desc:'Token standard on TRON, analogous to ERC-20 on Ethereum.' },
  trx:              { lbl:'TRX',              desc:'Native cryptocurrency of the TRON blockchain.' },
  dex:              { lbl:'DEX',              desc:'Decentralized Exchange — peer-to-peer marketplace without intermediaries.' },
  router:           { lbl:'Router',           desc:'Smart contract that routes trades between liquidity pools.' },
  pool:             { lbl:'Pool',             desc:'Liquidity pool — a collection of funds locked in a smart contract for trading.' },
  counterparty:     { lbl:'Counterparty',     desc:'The other address involved in a transaction.' },
  concentration:    { lbl:'Concentration',    desc:'Portion of all transactions sent to a single address — high values may indicate wash trading.' },
  heuristic:        { lbl:'Heuristic',        desc:'Rule-based pattern detection used to flag suspicious activity.' },
  allowance:        { lbl:'Allowance',        desc:'Approval granted to a smart contract to spend your tokens.' },
  revoke:           { lbl:'Revoke',           desc:'Cancel a previously granted token allowance.' },
  unlimited:        { lbl:'Unlimited',        desc:'An allowance with no cap — the contract can spend all your tokens.' },
  spender:          { lbl:'Spender',          desc:'The address or contract authorized to use your tokens.' },
  abi:              { lbl:'ABI',              desc:'Application Binary Interface — describes how to call a contract\'s functions.' },
  selector:         { lbl:'Selector',         desc:'First 4 bytes of a keccak256 hash of a function signature — identifies which function is called.' },
  payable:          { lbl:'Payable',          desc:'A function that can receive TRX or tokens along with the call.' },
  unverified:       { lbl:'Unverified',       desc:'Source code not published on-chain — higher risk, cannot verify what the contract actually does.' },
  blacklisted:      { lbl:'Blacklisted',      desc:'Address blocked by stablecoin issuers (USDT/USDC) from sending or receiving.' },
  flagged:          { lbl:'Flagged',          desc:'Marked as potentially malicious by security databases or heuristic analysis.' },
  sanctioned:       { lbl:'Sanctioned',       desc:'Address targeted by international financial sanctions.' },
  entity:           { lbl:'Entity',           desc:'Known organization or protocol (exchange, DEX, bridge) identified on-chain.' },
  energy:           { lbl:'Energy',           desc:'Computational resource consumed by smart contract execution on TRON.' },
  bandwidth:        { lbl:'Bandwidth',        desc:'Network resource consumed by every transaction — free quota available daily.' },
  node:             { lbl:'Node',             desc:'Each address represented as a point in the graph.' },
  forceGraph:       { lbl:'Force-directed',   desc:'Layout algorithm that pulls connected nodes together and pushes unrelated apart.' },
  trigger:          { lbl:'TriggerSmartContract', desc:'A transaction type that invokes a function on a smart contract.' },
  transfer:         { lbl:'TransferContract', desc:'A basic TRX transfer between two addresses.' },
  payout:           { lbl:'Payout address',   desc:'Address designated to receive funds from a potentially fraudulent scheme.' },
  contract:         { lbl:'Contract',         desc:'Smart contract — self-executing code deployed on the blockchain.' },
  shield:           { lbl:'Shield',           desc:'Aggregate safety score combining static analysis and risk heuristics.' },
  functions:        { lbl:'Functions',        desc:'Callable methods defined in a smart contract\'s ABI.' },
  danger:           { lbl:'Danger',           desc:'Severe-risk pattern that can lead to loss of funds.' },
  mutability:       { lbl:'Mutability',       desc:'Whether a function modifies blockchain state (write) or only reads it (view/pure).' },
  trxNative:        { lbl:'TRX',              desc:'Native cryptocurrency of the TRON blockchain, used for fees and transfers.' },
  staked:           { lbl:'Staked',           desc:'TRX locked as bandwidth or energy resource (voting/freezing), earning rewards.' },
  portfolio:        { lbl:'Portfolio',        desc:'Combined USD value of all TRC-20 tokens held by an address.' },
  block:            { lbl:'Block',            desc:'A batch of transactions recorded on the blockchain at a specific time.' },
  fee:              { lbl:'Fee',              desc:'Transaction fee paid in TRX for processing on the TRON network.' },
  tronscan:         { lbl:'TronScan',         desc:'Official TRON blockchain explorer for viewing transactions and addresses.' },
};

function tt(key, fallback) {
  const g = GLOSSARY[key];
  if (!g) return esc(t(fallback || key));
  return `<span class="term" data-term="${key}">${esc(t(g.lbl))}</span>`;
}

function ttLabel(key, fallback) {
  const g = GLOSSARY[key];
  return g ? t(g.lbl) : t(fallback || key);
}

function amlPdfPlain(str) {
  if (str == null) return '';
  let text = String(str);
  if (/<[^>]+>/.test(text)) {
    const el = document.createElement('div');
    el.innerHTML = text;
    text = el.textContent || el.innerText || '';
  }
  return text
    .replace(/\u2014/g, ' - ')
    .replace(/\u2013/g, '-')
    .replace(/\u00b7/g, ' / ')
    .replace(/\u2192/g, '->')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// -- Tooltip renderer --
let _termTip = null;
function showTermTip(key, el) {
  const g = GLOSSARY[key];
  if (!g) return;
  if (!_termTip) {
    _termTip = document.createElement('div');
    _termTip.id = 'term-tip';
    _termTip.style.cssText = 'position:fixed;z-index:9999;background:#111113;border:1px solid rgba(255,255,255,.1);color:#f5f5f7;font-family:var(--font-ui);font-size:12px;padding:10px 12px;border-radius:9px;max-width:300px;line-height:1.5;pointer-events:none;opacity:0;transition:opacity .12s;box-shadow:0 16px 48px rgba(0,0,0,.4)';
    document.body.appendChild(_termTip);
  }
  _termTip.innerHTML = `<strong>${esc(t(g.lbl))}</strong> — ${esc(t(g.desc))}`;
  _termTip.style.opacity = '1';
  positionTermTip(el);
}

function positionTermTip(el) {
  if (!_termTip) return;
  const r = el.getBoundingClientRect();
  let top = r.bottom + 6;
  let left = r.left + (r.width - 300) / 2;
  if (left < 8) left = 8;
  if (left + 300 > window.innerWidth - 8) left = window.innerWidth - 308;
  if (top + _termTip.offsetHeight > window.innerHeight - 8) {
    top = r.top - _termTip.offsetHeight - 6;
  }
  _termTip.style.top = top + 'px';
  _termTip.style.left = left + 'px';
}

function hideTermTip() {
  if (_termTip) _termTip.style.opacity = '0';
}

function setupTermTooltips() {
  document.addEventListener('mouseover', e => {
    const t = e.target.closest('.term');
    if (t) { showTermTip(t.dataset.term, t); return; }
    hideTermTip();
  });
  document.addEventListener('mouseleave', e => {
    if (e.target.closest('.term')) return;
    hideTermTip();
  });
  // touch support
  document.addEventListener('touchstart', e => {
    const t = e.target.closest('.term');
    if (!t) { hideTermTip(); return; }
    e.preventDefault();
    const shown = t.dataset.tipShown;
    hideTermTip();
    t.dataset.tipShown = '';
    if (!shown) {
      showTermTip(t.dataset.term, t);
      t.dataset.tipShown = '1';
    }
  }, { passive: false });
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setupTermTooltips();
});
