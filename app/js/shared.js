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

const RISK_SHIELD_PATH = 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z';

/** Align with ctrRiskClass / amlRiskClass / wallet risk labels (red ≥70, amber ≥20). */
function riskShieldTier(score, flagged) {
  const risk = flagged ? Math.max(score, 70) : score;
  if (risk >= 70) return 'high';
  if (risk >= 20) return 'med';
  return 'low';
}

window.riskShieldIcon = function riskShieldIcon(score, size, opts = {}) {
  const { flagged = false, className = '', muted = false, tier: tierOverride } = opts;
  const extraCls = className ? ' ' + esc(className) : '';

  if (muted) {
    return `<svg class="risk-shield-icon risk-shield-icon--muted${extraCls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="${RISK_SHIELD_PATH}" fill="var(--text-3)" fill-opacity="0.12" stroke="var(--text-3)" stroke-width="1.2"/>
    </svg>`;
  }

  const tier = tierOverride || riskShieldTier(score, flagged);
  const risk = flagged ? Math.max(score, 70) : score;
  const palette = {
    low:  { color: 'var(--green)', fill: 0.14, glow: 3 },
    med:  { color: 'var(--amber)', fill: 0.17, glow: 4 },
    high: { color: 'var(--red)',   fill: 0.19, glow: 5.5 },
  };
  const p = palette[tier];
  const fillOpacity = Math.min(0.42, p.fill + (Math.min(risk, 100) / 100) * 0.1);

  let mark = '';
  if (tier === 'med') {
    mark = `<g fill="${p.color}" stroke="${p.color}">
      <rect x="11.25" y="7.85" width="1.5" height="5.2" rx="0.75" opacity="0.92"/>
      <circle cx="12" cy="15.15" r="1.05" opacity="0.95"/>
    </g>`;
  } else if (tier === 'high') {
    mark = `<g stroke="${p.color}" stroke-linecap="round" fill="none">
      <path d="M10.2 10.2 L13.8 13.8" stroke-width="1.35" opacity="0.88"/>
      <path d="M13.8 10.2 L10.2 13.8" stroke-width="1.35" opacity="0.88"/>
    </g>`;
  }

  return `<svg class="risk-shield-icon risk-shield-icon--${tier}${extraCls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="flex-shrink:0;filter:drop-shadow(0 0 ${p.glow}px ${p.color})">
    <path d="${RISK_SHIELD_PATH}" fill="${p.color}" fill-opacity="${fillOpacity}" stroke="${p.color}" stroke-width="1.2"/>
    ${mark}
  </svg>`;
};

const TRONGRID_API_KEY = (window.TRONSEC_KEYS && window.TRONSEC_KEYS.trongrid) || '';
const TRONSCAN_API_KEY = (window.TRONSEC_KEYS && window.TRONSEC_KEYS.tronscan) || '';
const BASE_GRID = 'https://api.trongrid.io';
const BASE_SCAN = 'https://apilist.tronscanapi.com/api';

function trongridHeaders() {
  const key = (window.TRONSEC_KEYS && window.TRONSEC_KEYS.trongrid) || TRONGRID_API_KEY || '';
  return key ? { 'TRON-PRO-API-KEY': key } : {};
}
function tronscanHeaders() {
  const key = (window.TRONSEC_KEYS && window.TRONSEC_KEYS.tronscan) || TRONSCAN_API_KEY || '';
  return key ? { 'TRON-PRO-API-KEY': key } : {};
}

function useApiProxy() {
  return typeof window.tronsecUseApiProxy === 'function' && window.tronsecUseApiProxy();
}
function gridRequestUrl(path, params) {
  if (useApiProxy()) return window.tronsecProxyUrl('/grid' + path, params);
  const url = new URL(BASE_GRID + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}
function scanRequestUrl(path, params) {
  if (useApiProxy()) return window.tronsecProxyUrl('/scan' + path, params);
  const url = new URL(BASE_SCAN + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}
function upstreamHeaders(kind) {
  if (useApiProxy()) return {};
  return kind === 'scan' ? tronscanHeaders() : trongridHeaders();
}

// ==================================
//  UTILS
// ==================================
const isValidTron = a => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test((a||'').trim());
const sameTronAddr = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();

const DUST_TRX_SUN = 1_000_000; // <= 1 TRX
const _dustSenderCache = {};

function isMicroTrxSun(sun) {
  const n = Number(sun) || 0;
  return n > 0 && n <= DUST_TRX_SUN;
}

async function fetchDustSenderProfile(address) {
  if (!address || !isValidTron(address)) return null;
  if (Object.prototype.hasOwnProperty.call(_dustSenderCache, address)) return _dustSenderCache[address];
  try {
    const res = await scanGet('/account', { address });
    const d = res?.data ?? res ?? {};
    const profile = {
      out: Number(d.transactions_out ?? 0),
      inn: Number(d.transactions_in ?? 0),
      balance: Number(d.balance ?? 0),
    };
    _dustSenderCache[address] = profile;
    return profile;
  } catch (_) {
    _dustSenderCache[address] = null;
    return null;
  }
}

function isDustBotProfile(profile) {
  if (!profile) return false;
  return profile.out >= 80 && profile.out > profile.inn * 4 && profile.balance < DUST_TRX_SUN * 10;
}

function isAmlPeerInboundDustHeavy(peerAddr, directTransfers) {
  const inbound = (directTransfers || []).filter(d => d.inbound && sameTronAddr(d.peer, peerAddr));
  if (!inbound.length) return false;
  return inbound.every(d => {
    if (d.isStable) return false;
    if (d.isTrc20) return true;
    return isMicroTrxSun(d.amount);
  });
}

function permKeyWeight(key) {
  return Number(key?.weight) || 0;
}

function isExternalPermKey(address, selfAddr) {
