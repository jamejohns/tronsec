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
  return address && !sameTronAddr(address, selfAddr);
}

function externalCanActAlone(key, threshold) {
  return permKeyWeight(key) >= (Number(threshold) || 1);
}

function classifyPermissionKeys(keys, selfAddr, threshold, signerMeta = {}) {
  const external = (keys || []).filter(k => isExternalPermKey(k.address, selfAddr));
  const soloExternal = external.filter(k => externalCanActAlone(k, threshold));
  const contractExternal = external.filter(k => signerMeta[k.address]?.isContract);
  const coSigners = external.filter(k =>
    !signerMeta[k.address]?.isContract && !externalCanActAlone(k, threshold),
  );
  const riskyAddresses = new Set([
    ...soloExternal.map(k => k.address),
    ...contractExternal.map(k => k.address),
  ]);
  return { external, soloExternal, contractExternal, coSigners, riskyAddresses };
}

function summarizeWalletPermissionLayout(addr, owner, actives, witness) {
  const activeList = Array.isArray(actives) ? actives : (actives ? [actives] : []);
  const blocks = [owner, ...activeList, witness].filter(Boolean);
  const riskyExternal = new Set();
  const coSigners = new Set();
  let multisigGroups = 0;
  blocks.forEach(b => {
    const threshold = b.threshold || 1;
    const keys = b.keys || [];
    if (keys.length > 1 || threshold > 1) multisigGroups++;
    const cls = classifyPermissionKeys(keys, addr, threshold, {});
    cls.riskyAddresses.forEach(a => riskyExternal.add(a));
    cls.coSigners.forEach(k => coSigners.add(k.address));
  });
  return {
    isMultisig: multisigGroups > 0,
    multisigGroups,
    hasRiskyExternal: riskyExternal.size > 0,
    riskyExternalCount: riskyExternal.size,
    coSignerCount: coSigners.size,
  };
}

const isTronHexAddr = s => /^0?x?41[0-9a-f]{40}$/i.test(String(s || ''));
const addrLookupKey = a => {
  const s = String(a || '').trim();
  if (!s) return '';
  if (isTronHexAddr(s)) return 'h:' + s.replace(/^0x/i, '').toLowerCase();
  return 'b:' + s.toLowerCase();
};
function trackResolveAddr(set, addr) {
  if (!addr) return;
  const s = String(addr);
  set.add(isTronHexAddr(s) ? s.replace(/^0x/i, '').toLowerCase() : s);
}
function lookupResolvedAddr(map, addr, hintAddr) {
  if (!addr) return null;
  let v = map.get(addrLookupKey(addr)) || addr;
  if (hintAddr && sameTronAddr(v, hintAddr)) return hintAddr;
  return v;
}
const short = a => a ? `${a.slice(0,6)}?${a.slice(-4)}` : '—';
/** Human-readable address or tx hash for prose (ellipsis, not "?"). */
const addrLabel = a => {
  if (!a || a === '—') return '—';
  const s = String(a).trim();
  if (isValidTron(s) && s.length > 13) return `${s.slice(0, 6)}…${s.slice(-4)}`;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return `${s.slice(0, 6)}…${s.slice(-4)}`;
  return s;
};

function openContractScan(addr) {
  if (!addr) return;
  switchTab('contract-scan');
  setTimeout(() => {
    const input = document.getElementById('contract-input');
    if (input) input.value = addr;
    if (typeof contractScan === 'function') contractScan();
  }, 0);
}

function openWalletScan(addr) {
  if (!addr) return;
  switchTab('scanner');
  setTimeout(() => {
    const input = document.getElementById('wallet-input');
    if (input) input.value = addr;
    if (typeof walletScan === 'function') walletScan();
  }, 0);
}

function openApprovalsScan(addr, { autoRun = true, force = false } = {}) {
  if (!addr) return;
  switchTab('approvals');
  setTimeout(() => {
    const input = document.getElementById('approvals-input');
    if (input) input.value = addr;
    if (autoRun && typeof approvalsScan === 'function') approvalsScan({ force });
  }, 0);
}

function openAmlScan(addr, { autoRun = true, force = false } = {}) {
  if (!addr) return;
  switchTab('aml-check');
  setTimeout(() => {
    const input = document.getElementById('aml-input');
    if (input) input.value = addr;
    if (autoRun && typeof amlScan === 'function') amlScan({ force });
  }, 0);
}

function openPermissionsScan(addr, { autoRun = true, force = false } = {}) {
  if (!addr) return;
  switchTab('permissions');
  setTimeout(() => {
    const input = document.getElementById('permissions-input');
    if (input) input.value = addr;
    if (autoRun && typeof permissionsScan === 'function') permissionsScan({ force });
  }, 0);
}

const _contractProbeCache = new Map();

async function probeTronContract(addr) {
  if (!addr || !isValidTron(addr)) return false;
  if (_contractProbeCache.has(addr)) return _contractProbeCache.get(addr);

  let ok = false;
  try {
    const contractData = await gridPost('/wallet/getcontract', { value: addr, visible: true });
    const abiEntries = contractData?.abi?.entrys || contractData?.abi?.entries;
    ok = !!(contractData && !contractData.Error && (contractData.bytecode || (abiEntries && abiEntries.length)));
  } catch (_) {}

  if (!ok) {
    try {
      const info = await gridPost('/wallet/getcontractinfo', { value: addr, visible: true });
      ok = !!(info && !info.Error && (info.contract_address || info.name));
    } catch (_) {}
  }

  if (!ok) {
    try {
      const wrap = await scanGet('/contract', { contract: addr });
      const meta = wrap?.data?.[0];
      ok = !!(meta && (meta.bytecode || meta.contract_type != null || meta.verify_status != null));
    } catch (_) {}
  }

  _contractProbeCache.set(addr, ok);
  return ok;
}

async function fetchTronContractLabel(addr) {
  try {
    const wrap = await scanGet('/contract', { contract: addr });
    const meta = wrap?.data?.[0] || {};
    return meta.tag1 || meta.name || meta.project_name || '';
  } catch (_) {
    return '';
  }
}

