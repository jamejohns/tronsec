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

async function renderContractScanRedirect(addr, opts = {}) {
  const idPrefix = opts.idPrefix || 'contract-redirect';
  const wrapperClass = opts.wrapperClass || 'aml-scan';
  const hintText = opts.hintText || t('AML screening scores wallet addresses and their transaction patterns. For tokens and smart contracts, use Contract Scan to review bytecode, permissions, and upgrade risks.');
  const contractLabel = await fetchTronContractLabel(addr);
  const contractIcon = icSVG('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M10 13h4 M10 17h7', 26);
  const labelHtml = contractLabel
    ? `<span class="contract-redirect-name">${esc(contractLabel)}</span>`
    : '';

  return `<div class="${wrapperClass}">
    <div class="contract-redirect-card">
      <div class="contract-redirect-glow" aria-hidden="true"></div>
      <div class="contract-redirect-inner">
        <div class="contract-redirect-meta">
          ${walletTag(t('Smart contract'), 'info')}
          ${labelHtml}
        </div>
        <div class="contract-redirect-body">
          <div class="contract-redirect-icon">${contractIcon}</div>
          <p class="contract-redirect-title">${esc(t('This is a contract, not a wallet'))}</p>
          <p class="contract-redirect-hint">${esc(hintText)}</p>
        </div>
        <div class="contract-redirect-addr">
          <span class="contract-redirect-addr-text">${esc(addr)}</span>
        </div>
        <div class="contract-redirect-actions">
          <button type="button" class="contract-redirect-btn contract-redirect-btn--primary" id="${idPrefix}-contract-scan-btn" aria-label="${esc(t('Open in Contract Scan'))}">
            ${icSVG(IC.external, 16)}<span>${esc(t('Open in Contract Scan'))}</span>
          </button>
          <button type="button" class="contract-redirect-btn contract-redirect-btn--ghost" id="${idPrefix}-copy-addr-btn" aria-label="${esc(t('Copy'))}">
            ${icSVG(IC.copy, 16)}<span>${esc(t('Copy'))}</span>
          </button>
        </div>
      </div>
    </div>
    ${opts.disclaimerHtml || ''}
  </div>`;
}

function bindContractScanRedirect(addr, idPrefix = 'contract-redirect') {
  document.getElementById(`${idPrefix}-contract-scan-btn`)?.addEventListener('click', e => {
    e.preventDefault();
    openContractScan(addr);
  });
  document.getElementById(`${idPrefix}-copy-addr-btn`)?.addEventListener('click', () => {
    navigator.clipboard.writeText(addr).then(() => {
      const btn = document.getElementById(`${idPrefix}-copy-addr-btn`);
      if (!btn) return;
      btn.classList.add('is-copied');
      btn.innerHTML = `${icSVG(IC.check, 16)}<span>${t('Copied')}</span>`;
      setTimeout(() => {
        btn.classList.remove('is-copied');
        btn.innerHTML = `${icSVG(IC.copy, 16)}<span>${t('Copy')}</span>`;
      }, 2000);
    });
  });
}

async function openAddressScan(addr) {
  if (!addr) return;
  const isContract = await probeTronContract(addr);
  if (isContract) openContractScan(addr);
  else openWalletScan(addr);
}

function bindAddressScanButtons(root) {
  (root || document).querySelectorAll('.wallet-contract-scan-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      openAddressScan(btn.getAttribute('data-addr'));
    });
  });
}

function openTxDecoder(hash) {
  if (!hash) return;
  switchTab('tx-decoder');
  setTimeout(() => {
    const input = document.getElementById('tx-input');
    if (input) input.value = hash;
    if (typeof txDecode === 'function') txDecode();
  }, 0);
}

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

const APPROVAL_RISK_HIGH_TOKENS = BigInt(1_000_000);
const APPROVAL_RISK_WARN_TOKENS = BigInt(100_000);

function approvalTokenWhole(amount, decimals = 6) {
  if (amount == null || amount === '') return null;
  let big;
  try { big = typeof amount === 'bigint' ? amount : BigInt(String(amount)); }
  catch (_) { return null; }
  if (big >= UNLIMITED_THRESHOLD) return null;
  const dec = Math.min(Math.max(parseInt(decimals, 10) || 6, 0), 18);
  return big / BigInt(10 ** dec);
}

function getApprovalRisk(amount, decimals = 6) {
  if (isUnlimitedApproval(amount, decimals)) return 'critical';
  const whole = approvalTokenWhole(amount, decimals);
  if (whole == null) return 'normal';
  if (whole >= APPROVAL_RISK_HIGH_TOKENS) return 'high';
  if (whole >= APPROVAL_RISK_WARN_TOKENS) return 'warn';
  return 'normal';
}

function isHighRiskApproval(amount, decimals = 6) {
  const risk = getApprovalRisk(amount, decimals);
  return risk === 'critical' || risk === 'high';
}

function approvalRiskRank(amount, decimals = 6) {
  return { critical: 3, high: 2, warn: 1, normal: 0 }[getApprovalRisk(amount, decimals)] || 0;
}

const APPROVE_SIG = '095ea7b3';
const APPROVAL_INCREASE_SIGS = ['095ea7b3', '39509351', 'd73dd623'];

function isApprovalIncreaseCalldata(dataHex) {
  const dh = String(dataHex || '').toLowerCase().replace(/^0x/, '');
  return APPROVAL_INCREASE_SIGS.some((sig) => dh.startsWith(sig));
}

/** Spender contracts tied to active drain kits (IOC list). */
const KNOWN_DRAINER_SPENDERS = new Set([
  'TXnDibB9a6wGHJMPxxmXT8mAgQHf4cN3ED', // VerifyAccount drainer
  'TFLsH1xMPg2g72oEAq4GhoFKm3Wf2fi3cq', // heyue controlAndTransferToken drainer
]);

function isKnownDrainerSpender(addr) {
  return !!(addr && KNOWN_DRAINER_SPENDERS.has(String(addr).trim()));
}

function isDrainerPullMethods(methods) {
  if (!methods?.length) return false;
  const joined = methods.join(' ').toLowerCase();
  return /controlandtransfertoken|transferfromwithapproval|sweeptoken|sweep|draintoken|pulltoken|executetransferfrom/.test(joined);
}

function isSuspiciousApprovalSpender(addr, methods) {
  return isKnownDrainerSpender(addr) || isDrainerPullMethods(methods);
}

function countDistinctApprovals(trc20TxList, nativeTxList) {
  const approveMap = new Map();
  (trc20TxList || []).forEach(tx => {
    if (tx.type !== 'Approval') return;
    const tokenAddr = tx.token_info?.address || tx.token_info?.contract_address || '';
    const key = `${tokenAddr}_${tx.to}`;
    if (!approveMap.has(key)) approveMap.set(key, 1);
  });
  if (approveMap.size === 0 && nativeTxList?.length) {
    nativeTxList.forEach(tx => {
      const c = tx.raw_data?.contract?.[0];
      if (c?.type !== 'TriggerSmartContract') return;
      const dh = c.parameter?.value?.data || '';
      if (!isApprovalIncreaseCalldata(dh)) return;
      const spenderHex = dh.slice(34, 74);
      const contractAddr = c.parameter?.value?.contract_address;
      const key = `${contractAddr}_${spenderHex}`;
      if (!approveMap.has(key)) approveMap.set(key, 1);
    });
  }
  return approveMap.size;
}

function _base58Decode(str) {
  if (!str) return null;
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const val = BASE58_ALPHABET.indexOf(str[i]);
    if (val < 0) return null;
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === BASE58_ALPHABET[0]; i++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

function tronAddressToAbiParam(addr) {
  if (!addr) return null;
  if (isValidTron(addr)) {
    const decoded = _base58Decode(addr);
    if (!decoded || decoded.length < 21) return null;
    const hex = Array.from(decoded.slice(0, 21)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex.padStart(64, '0');
  }
  const clean = String(addr).replace(/^0x/i, '');
  const hex41 = clean.length === 40 ? '41' + clean : (clean.startsWith('41') ? clean : null);
  return hex41 ? hex41.padStart(64, '0') : null;
}

async function fetchOnChainAllowance(owner, tokenContract, spender) {
  const ownerParam = tronAddressToAbiParam(owner);
  const spenderParam = tronAddressToAbiParam(spender);
  if (!ownerParam || !spenderParam) return null;
  try {
    const res = await gridPost('/wallet/triggerconstantcontract', {
      owner_address: owner,
      contract_address: tokenContract,
      function_selector: 'allowance(address,address)',
      parameter: ownerParam + spenderParam,
      visible: true,
    });
    const hex = res?.constant_result?.[0];
    if (!hex) return null;
    return BigInt('0x' + hex);
  } catch (_) {
    return null;
  }
}

function collectApprovalCandidates(trc20TxList, nativeTxList) {
  const map = new Map();
  const put = (key, entry) => {
    if (!map.has(key)) map.set(key, entry);
  };

  (trc20TxList || []).forEach(tx => {
    if (tx.type !== 'Approval') return;
    const tokenAddr = tx.token_info?.address || tx.token_info?.contract_address || '';
    const spender = tx.to;
    if (!tokenAddr || !spender) return;
    const key = `${tokenAddr}_${spender}`;
    let amount = tx.value;
    try {
      const big = typeof amount === 'bigint' ? amount : BigInt(String(amount || 0));
      if (big === BigInt(0)) return;
    } catch (_) { return; }
    put(key, {
      token: tx.token_info?.symbol || tx.token_info?.name || '—',
      tokenAddr,
      spender,
      amount,
      decimals: parseInt(tx.token_info?.decimals || 6, 10) || 6,
      date: tx.block_timestamp || 0,
    });
  });

  (nativeTxList || []).forEach(tx => {
    const c = tx.raw_data?.contract?.[0];
    if (c?.type !== 'TriggerSmartContract') return;
    const dh = c.parameter?.value?.data || '';
    if (!dh.startsWith(APPROVE_SIG)) return;
    const spenderHex = dh.slice(34, 74);
    const amountHex = dh.slice(74, 138);
    const contractAddr = c.parameter?.value?.contract_address;
    if (!contractAddr || !spenderHex) return;
    const key = `${contractAddr}_${spenderHex}`;
    let amount = BigInt(0);
    try { amount = amountHex ? BigInt('0x' + amountHex) : BigInt(0); } catch (_) { return; }
    if (amount === BigInt(0)) return;
    put(key, {
      token: short(contractAddr),
      tokenAddr: contractAddr,
      spender: spenderHex.length === 40 ? '41' + spenderHex : spenderHex,
      amount,
      decimals: 6,
      date: tx.block_timestamp || 0,
    });
  });

  return Array.from(map.values());
}

function normalizeTronScanApprovalItem(item) {
  const tokenInfo = item.tokenInfo || item.token_info || item.token || {};
  const tokenAddr = tokenInfo.tokenId || tokenInfo.token_id || item.contract_address || item.tokenId || item.token_id || '';
  const spender = item.to_address || item.spender || item.toAddress || item.to || '';
  const rawAmt = item.amount ?? item.remainAmount ?? item.remain ?? item.approveAmount ?? item.value;
  const unlimited = !!(item.unlimited || item.isUnlimited || item.is_unlimited);
  return {
    token: tokenInfo.tokenAbbr || tokenInfo.token_abbr || item.tokenAbbr || item.tokenName || item.token_name || '—',
    tokenAddr,
    spender,
    amount: unlimited ? UNLIMITED_THRESHOLD : rawAmt,
    decimals: parseInt(tokenInfo.tokenDecimal || tokenInfo.token_decimal || item.decimals || 6, 10) || 6,
    date: item.operate_time || item.timestamp || item.block_timestamp || item.time || 0,
    unlimited,
  };
}

/** Fallback until /features poll fills TRONSEC_FEATURES.approvalsHideAddrs. */
const APPROVALS_SUPPRESS_ADDRS_DEFAULT = [
  'TTDNqRpe8TtGCMvHVRv7Yw82AZSNzmqK5S',
];

/** Hide approvals granted to known drainer / fake-revoke spenders (global). */
const APPROVALS_SUPPRESS_SPENDERS = new Set([
  'TXnDibB9a6wGHJMPxxmXT8mAgQHf4cN3ED', // VerifyAccount drainer
]);

function isApprovalsSuppressedAddress(addr) {
  const a = addr && String(addr).trim();
  if (!a) return false;
  let list = APPROVALS_SUPPRESS_ADDRS_DEFAULT;
  try {
    if (typeof window.tronsecApprovalsHideAddrs === 'function') {
      list = window.tronsecApprovalsHideAddrs();
    } else if (window.TRONSEC_FEATURES && Array.isArray(window.TRONSEC_FEATURES.approvalsHideAddrs)) {
      list = window.TRONSEC_FEATURES.approvalsHideAddrs;
    }
  } catch (_) {}
  return Array.isArray(list) && list.includes(a);
}

function isApprovalsSuppressedSpender(addr) {
  return !!(addr && APPROVALS_SUPPRESS_SPENDERS.has(String(addr).trim()));
}


async function fetchTronScanApprovalList(addr) {
  if (isApprovalsSuppressedAddress(addr)) return [];
  const all = [];
  const limit = 50;
  const maxPages = 12;
  const pageBatch = GRID_PAGE_BATCH;

  for (let batchStart = 0; batchStart < maxPages; batchStart += pageBatch) {
    const pageNums = [];
    for (let p = batchStart; p < Math.min(batchStart + pageBatch, maxPages); p++) pageNums.push(p);
    const results = await Promise.all(
      pageNums.map((page) => scanGet('/account/approve/list', {
        address: addr,
        start: page * limit,
        limit,
        type: 'token',
      }).catch(() => null)),
    );
    let done = false;
    for (const res of results) {
      const batch = res?.data || res?.approveList || res?.list || [];
      if (!Array.isArray(batch) || !batch.length) {
        done = true;
        break;
      }
      all.push(...batch);
      if (batch.length < limit) {
        done = true;
        break;
      }
    }
    if (done) break;
  }
  return all;
}

async function resolveApprovalAddresses(entry) {
  let tokenAddr = entry.tokenAddr;
  let spender = entry.spender;
  if (tokenAddr && !isValidTron(tokenAddr)) tokenAddr = await hexToTronAddress(tokenAddr);
  if (spender && !isValidTron(spender)) {
    const hex = String(spender).replace(/^0x/i, '');
    const normalized = hex.length === 40 ? '41' + hex : hex;
    spender = await hexToTronAddress(normalized);
  }
  return { tokenAddr, spender };
}

async function enrichApprovalsOnChain(owner, entries, concurrency = GRID_API_MAX_CONCURRENT) {
  const merged = new Map();
  const resolved = await Promise.all((entries || []).map((entry) => resolveApprovalAddresses(entry)));
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const { tokenAddr, spender } = resolved[i];
    if (!tokenAddr || !spender || !isValidTron(tokenAddr) || !isValidTron(spender)) continue;
    if (isApprovalsSuppressedSpender(spender)) continue;
    const key = `${tokenAddr}_${spender}`;
    if (!merged.has(key)) {
      merged.set(key, {
        ...entry,
        tokenAddr,
        spender,
        decimals: entry.decimals || 6,
      });
    }
  }

  const keys = Array.from(merged.keys());
  const active = [];
  for (let i = 0; i < keys.length; i += concurrency) {
    const chunk = keys.slice(i, i + concurrency);
    const rows = await Promise.all(chunk.map(async key => {
      const entry = merged.get(key);
      const onChain = await fetchOnChainAllowance(owner, entry.tokenAddr, entry.spender);
      if (onChain == null || onChain === BigInt(0)) return null;
      return {
        ...entry,
        amount: onChain,
      };
    }));
    active.push(...rows.filter(Boolean));
  }

  active.sort((a, b) => {
    const dr = approvalRiskRank(b.amount, b.decimals) - approvalRiskRank(a.amount, a.decimals);
    if (dr) return dr;
    return (b.date || 0) - (a.date || 0);
  });
  return active;
}

async function mergeApprovalEntries(scanItems, txItems) {
  const items = [...(scanItems || []), ...(txItems || [])];
  const resolved = await Promise.all(items.map((item) => resolveApprovalAddresses(item)));
  const map = new Map();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { tokenAddr, spender } = resolved[i];
    if (!tokenAddr || !spender || !isValidTron(tokenAddr) || !isValidTron(spender)) continue;
    if (isApprovalsSuppressedSpender(spender)) continue;
    const key = `${tokenAddr}_${spender}`;
    if (!map.has(key)) map.set(key, { ...item, tokenAddr, spender });
  }
  return Array.from(map.values());
}

async function fetchActiveOnChainApprovals(addr, trc20TxList, nativeTxList, scanRaw) {
  if (isApprovalsSuppressedAddress(addr)) return [];
  const scanList = scanRaw != null ? scanRaw : await fetchTronScanApprovalList(addr).catch(() => []);
  const scanCandidates = (scanList || []).map(normalizeTronScanApprovalItem).filter(i => i.tokenAddr && i.spender);
  const txCandidates = collectApprovalCandidates(trc20TxList || [], nativeTxList || []);
  const merged = await mergeApprovalEntries(scanCandidates, txCandidates);
  return enrichApprovalsOnChain(addr, merged);
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

function withProxyHeaders(headers) {
  return headers || {};
}

/** Match TronGrid / TronScan key pool size on the API proxy worker. */
const API_KEY_POOL_SIZE = 9;
const SCAN_API_MAX_CONCURRENT = API_KEY_POOL_SIZE;
const SCAN_API_START_INTERVAL_MS = 20;
const GRID_API_MAX_CONCURRENT = API_KEY_POOL_SIZE;
const GRID_API_START_INTERVAL_MS = 20;
const GRID_PAGE_BATCH = API_KEY_POOL_SIZE;

// -- TronGrid API rate limiter + in-memory response cache --
const _gridQueue = [];
let _gridActive = 0;
let _gridPumpTimer = null;
const _gridApiCache = new Map();
const _gridInflightByKey = new Map();
const GRID_API_CACHE_DEFAULT_TTL = 8 * 60 * 1000;

function gridApiCacheTtl(cacheKey) {
  if (cacheKey.startsWith('POST:')) {
    if (cacheKey.includes('/wallet/getcontract')) return 10 * 60 * 1000;
    if (cacheKey.includes('/wallet/gettransactionbyid')) return 15 * 60 * 1000;
    if (cacheKey.includes('/wallet/gettransactioninfobyid')) return 15 * 60 * 1000;
    return 0;
  }
  if (cacheKey.includes('/transactions')) return GRID_API_CACHE_DEFAULT_TTL;
  if (cacheKey.includes('/v1/accounts/')) return 5 * 60 * 1000;
  return GRID_API_CACHE_DEFAULT_TTL;
}

function clearGridApiCache() {
  _gridApiCache.clear();
  _gridInflightByKey.clear();
}

function _scheduleGridPump(delay = 0) {
  if (_gridPumpTimer != null) return;
  _gridPumpTimer = setTimeout(() => {
    _gridPumpTimer = null;
    _gridNext();
  }, delay);
}

async function _gridNext() {
  if (_gridActive >= GRID_API_MAX_CONCURRENT || _gridQueue.length === 0) return;
  _gridActive++;
  const { url, init, resolve, reject } = _gridQueue.shift();
  if (_gridQueue.length && _gridActive < GRID_API_MAX_CONCURRENT) {
    _scheduleGridPump(GRID_API_START_INTERVAL_MS);
  }
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch (_) { bodyText = ''; }
      let json = null;
      try { json = JSON.parse(bodyText); } catch (_) { json = null; }
      const msg = json && (json.error || json.message) ? (json.error || json.message) : (bodyText || res.statusText || '');
      const err = new Error(`TronGrid ${res.status}${msg ? ': ' + msg : ''}`);
      err.status = res.status;
      err.body = json || bodyText;
      reject(err);
    } else {
      resolve(await res.json());
    }
  } catch (e) { reject(e); }
  finally {
    _gridActive--;
    _scheduleGridPump(_gridQueue.length ? GRID_API_START_INTERVAL_MS : 0);
  }
}

function _enqueueGrid(url, init) {
  return new Promise((resolve, reject) => {
    _gridQueue.push({ url, init, resolve, reject });
    _scheduleGridPump();
  });
}

async function gridGet(path, params = {}, opts = {}) {
  const url = gridRequestUrl(path, params);
  const headers = withProxyHeaders(upstreamHeaders('grid'));
  const cacheKey = `GET:${url}`;
  if (!opts.bypassCache) {
    const hit = _gridApiCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < hit.ttl) return hit.data;
    const pending = _gridInflightByKey.get(cacheKey);
    if (pending) return pending;
  }
  const flight = _enqueueGrid(url, { method: 'GET', headers }).then((data) => {
    if (!opts.bypassCache) {
      const ttl = gridApiCacheTtl(cacheKey);
      if (ttl > 0) _gridApiCache.set(cacheKey, { data, ts: Date.now(), ttl });
    }
    return data;
  }).finally(() => {
    _gridInflightByKey.delete(cacheKey);
  });
  if (!opts.bypassCache) _gridInflightByKey.set(cacheKey, flight);
  return flight;
}

async function gridPost(path, body, opts = {}) {
  const url = gridRequestUrl(path);
  const headers = withProxyHeaders({ 'Content-Type': 'application/json', ...upstreamHeaders('grid') });
  const bodyStr = JSON.stringify(body);
  const cacheKey = `POST:${url}:${bodyStr}`;
  if (!opts.bypassCache) {
    const hit = _gridApiCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < hit.ttl) return hit.data;
    const pending = _gridInflightByKey.get(cacheKey);
    if (pending) return pending;
  }
  const flight = _enqueueGrid(url, { method: 'POST', headers, body: bodyStr }).then((data) => {
    if (!opts.bypassCache) {
      const ttl = gridApiCacheTtl(cacheKey);
      if (ttl > 0) _gridApiCache.set(cacheKey, { data, ts: Date.now(), ttl });
    }
    return data;
  }).finally(() => {
    _gridInflightByKey.delete(cacheKey);
  });
  if (!opts.bypassCache) _gridInflightByKey.set(cacheKey, flight);
  return flight;
}

// -- Tronscan API rate limiter + in-memory response cache --
const _scanQueue = [];
let _scanActive = 0;
let _scanPumpTimer = null;
const _scanApiCache = new Map();
const _scanInflightByKey = new Map();
const SCAN_API_CACHE_DEFAULT_TTL = 8 * 60 * 1000;

function scanApiCacheTtl(urlStr) {
  if (urlStr.includes('/security/')) return 15 * 60 * 1000;
  if (urlStr.includes('/account/tag')) return 15 * 60 * 1000;
  if (urlStr.includes('/account/approve/')) return 5 * 60 * 1000;
  if (urlStr.includes('/account/tokens')) return 10 * 60 * 1000;
  if (urlStr.includes('/contract')) return 10 * 60 * 1000;
  return SCAN_API_CACHE_DEFAULT_TTL;
}

function clearScanApiCache() {
  _scanApiCache.clear();
  _scanInflightByKey.clear();
}

function clearApiCaches() {
  clearGridApiCache();
  clearScanApiCache();
}

function _scheduleScanPump(delay = 0) {
  if (_scanPumpTimer != null) return;
  _scanPumpTimer = setTimeout(() => {
    _scanPumpTimer = null;
    _scanNext();
  }, delay);
}

async function _scanNext() {
  if (_scanActive >= SCAN_API_MAX_CONCURRENT || _scanQueue.length === 0) return;
  _scanActive++;
  const { url, headers, resolve, reject } = _scanQueue.shift();
  if (_scanQueue.length && _scanActive < SCAN_API_MAX_CONCURRENT) {
    _scheduleScanPump(SCAN_API_START_INTERVAL_MS);
  }
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
    _scanActive--;
    _scheduleScanPump(_scanQueue.length ? SCAN_API_START_INTERVAL_MS : 0);
  }
}
function _enqueueScan(url, headers) {
  return new Promise((resolve, reject) => {
    _scanQueue.push({ url, headers, resolve, reject });
    _scheduleScanPump();
  });
}

async function scanGet(path, params = {}, opts = {}) {
  const url = new URL(scanRequestUrl(path, params));
  const headers = withProxyHeaders(upstreamHeaders('scan'));
  const key = url.toString();
  if (!opts.bypassCache) {
    const hit = _scanApiCache.get(key);
    if (hit && Date.now() - hit.ts < hit.ttl) return hit.data;
    const pending = _scanInflightByKey.get(key);
    if (pending) return pending;
  }
  const flight = _enqueueScan(url, headers).then((data) => {
    if (!opts.bypassCache) {
      _scanApiCache.set(key, { data, ts: Date.now(), ttl: scanApiCacheTtl(key) });
    }
    return data;
  }).finally(() => {
    _scanInflightByKey.delete(key);
  });
  if (!opts.bypassCache) _scanInflightByKey.set(key, flight);
  return flight;
}

/** TronScan may return frozen as { total, balances: [] } instead of an array. */
function normalizeFrozenV2(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.balances)) {
    return raw.balances.map((b) => ({
      amount: Number(b.amount ?? b.frozen_balance ?? 0) || 0,
      type: b.resource ?? b.type ?? b.frozen_balance_resource,
    }));
  }
  if (Array.isArray(raw.frozen)) return raw.frozen;
  if (raw.amount != null || raw.frozen_balance != null) return [raw];
  return [];
}

function asArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null) return [];
  return [raw];
}

function normalizeTagList(tagAcc) {
  if (!tagAcc) return [];
  if (Array.isArray(tagAcc)) return tagAcc;
  if (Array.isArray(tagAcc.data)) return tagAcc.data;
  if (tagAcc.tagName || tagAcc.tag || tagAcc.label) return [tagAcc];
  if (tagAcc.chainTags && typeof tagAcc.chainTags === 'object') {
    const out = [];
    for (const group of Object.values(tagAcc.chainTags)) {
      if (Array.isArray(group)) out.push(...group);
    }
    return out;
  }
  return [];
}

function normalizeAccountRecord(acc) {
  if (!acc || typeof acc !== 'object') return acc;
  acc.frozenV2 = normalizeFrozenV2(acc.frozenV2 ?? acc.frozen);
  acc.votes = asArray(acc.votes);
  return acc;
}

function userFriendlyFetchError(e) {
  if (!e) return t('Unknown fetch error');
  if (typeof e === 'string') return t(e);
  const status = e.status || (e.message && (e.message.match(/\b(\d{3})\b/) ? Number(e.message.match(/\b(\d{3})\b/)[1]) : null));
  if (status === 400 || status === 404) return t('Address not found or unactivated — no on-chain account for that address. Please check the address format and try again.');
  if (status >= 500) return t('External service error (TronGrid/TronScan). Please try again later.');
  return t('Fetch failed: {message}', { message: e.message || String(e) });
}

function scanRowInvolvesAddress(row, address) {
  if (!row || !address) return false;
  const want = String(address);
  const fields = [
    row.from_address, row.to_address, row.from, row.to,
    row.transferFromAddress, row.transferToAddress,
    row.fromAddress, row.toAddress, row.ownerAddress, row.owner_address,
    row.owner, row.sender, row.receiver, row.account, row.address,
  ];
  return fields.some((v) => v != null && String(v) === want);
}

/**
 * TronScan `/token_trc20/transfers?address=` ignores the filter and returns
 * recent *global* TRC-20 transfers — never use bare `address` here.
 * Prefer `relatedAddress` and always filter client-side.
 */
async function fetchTrc20FromTronScan(address) {
  if (!address) return [];
  const endpoints = [
    ['/token_trc20/transfers', { relatedAddress: address, start: 0, limit: 200 }],
  ];
  const results = await Promise.all(
    endpoints.map(([path, params]) => scanGet(path, params).catch(() => null)),
  );
  for (const res of results) {
    if (!res) continue;
    const arr = res.token_transfers || res.data || res.transfers || res.transactions || res.txs || (Array.isArray(res) ? res : null) || res.items;
    if (!arr || !arr.length) continue;
    const filtered = arr.filter((row) => scanRowInvolvesAddress(row, address));
    if (filtered.length) return filtered;
  }
  return [];
}

function scanTransferRows(res) {
  if (!res) return [];
  return res.token_transfers || res.data || res.transfers || res.transactions || res.txs || (Array.isArray(res) ? res : null) || res.items || [];
}

function normalizeScanTransferToGridTx(row) {
  const from = row.transferFromAddress || row.from_address || row.from || row.fromAddress || row.ownerAddress || '';
  const to = row.transferToAddress || row.to_address || row.to || row.toAddress || '';
  const amount = row.amount ?? row.quant ?? row.transfer_amount ?? 0;
  const ts = row.block_timestamp || row.timestamp || row.block_ts || 0;
  return {
    txID: row.transactionHash || row.transaction_id || row.hash || row.txID || '',
    block_timestamp: ts,
    raw_data: {
      contract: [{
        type: 'TransferContract',
        parameter: { value: { owner_address: from, to, to_address: to, amount } },
      }],
    },
  };
}

function normalizeTrc20ToAmlTx(row) {
  const from = row.from_address || row.from || row.transferFromAddress || row.ownerAddress || row.owner_address || '';
  const to = row.to_address || row.to || row.transferToAddress || row.toAddress || '';
  const contract = row.contract_address || row.tokenId || row.tokenAddress || row.token_id || row.token_info?.address || '';
  const amount = row.quant ?? row.amount ?? row.value ?? row.token_amount ?? 0;
  const ts = row.block_timestamp || row.block_ts || row.timestamp || 0;
  const decimals = parseInt(row.token_info?.decimals ?? row.tokenDecimal ?? row.decimals ?? 6, 10) || 6;
  return {
    txID: row.transaction_id || row.transactionHash || row.hash || row.txID || '',
    block_timestamp: ts,
    _trc20From: from,
    _trc20To: to,
    _isTrc20: true,
    _trc20Decimals: decimals,
    _trc20Type: row.type || row.event_type || 'Transfer',
    raw_data: {
      contract: [{
        type: 'TriggerSmartContract',
        parameter: { value: { owner_address: from, to_address: to, contract_address: contract, amount, data: '' } },
      }],
    },
  };
}

function isAmlTrc20TransferRow(row) {
  const typ = row?.type || row?.event_type || row?._trc20Type || 'Transfer';
  if (typ === 'Approval') return false;
  const amount = row?.quant ?? row?.amount ?? row?.value ?? row?.token_amount ?? 0;
  const decimals = parseInt(row?.token_info?.decimals ?? row?.tokenDecimal ?? row?._trc20Decimals ?? 6, 10) || 6;
  if (typeof isUnlimitedApproval === 'function' && isUnlimitedApproval(amount, decimals)) return false;
  return true;
}

function normalizeScanTrc20TransferToGridTx(row) {
  return normalizeTrc20ToAmlTx(row);
}

async function fetchTronScanNativeTransfers(address, limit = 200) {
  if (!address) return [];
  const endpoints = [
    ['/transfer', { address, start: 0, limit }],
    ['/transactions', { address, start: 0, limit }],
  ];
  const results = await Promise.all(
    endpoints.map(([path, params]) => scanGet(path, params).catch(() => null)),
  );
  for (const res of results) {
    const rows = scanTransferRows(res);
    if (!rows.length) continue;
    const mapped = rows
      .map(normalizeScanTransferToGridTx)
      .filter((tx) => {
        const v = tx.raw_data?.contract?.[0]?.parameter?.value || {};
        return scanRowInvolvesAddress({
          from: v.owner_address,
          to: v.to_address || v.to,
          ownerAddress: v.owner_address,
          toAddress: v.to_address || v.to,
        }, address);
      });
    if (mapped.length) return mapped;
  }
  return [];
}

function dedupeTxList(txs) {
  const seen = new Set();
  const out = [];
  for (const tx of txs) {
    const id = tx.txID || tx.transaction_id || tx.transactionHash
      || `${tx.block_timestamp || 0}:${tx.raw_data?.contract?.[0]?.type || 'tx'}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(tx);
  }
  return out;
}

const AML_TX_SAMPLE_LIMIT = 1000;
const AML_GRID_PAGE_SIZE = 200;

function sortAmlTxHistoryDesc(txs) {
  return txs.sort((a, b) => (b.block_timestamp || 0) - (a.block_timestamp || 0));
}

function trimAmlTxHistory(txs) {
  return sortAmlTxHistoryDesc(txs).slice(0, AML_TX_SAMPLE_LIMIT);
}

function normalizeAmlGridTrc20Rows(rows) {
  return (rows || [])
    .filter(isAmlTrc20TransferRow)
    .map(normalizeTrc20ToAmlTx)
    .filter(t => t._trc20From || t._trc20To);
}

async function fetchAmlGridTxPages(address, kind) {
  const path = kind === 'trc20'
    ? `/v1/accounts/${address}/transactions/trc20`
    : `/v1/accounts/${address}/transactions`;
  const maxPages = Math.ceil(AML_TX_SAMPLE_LIMIT / AML_GRID_PAGE_SIZE);
  const pageBatch = GRID_PAGE_BATCH;
  const all = [];

  for (let batchStart = 0; batchStart < maxPages; batchStart += pageBatch) {
    const pageNums = [];
    for (let p = batchStart; p < Math.min(batchStart + pageBatch, maxPages); p++) pageNums.push(p);
    const results = await Promise.all(pageNums.map((page) => gridGet(path, {
      limit: AML_GRID_PAGE_SIZE,
      order_by: 'block_timestamp,desc',
      start: page * AML_GRID_PAGE_SIZE,
    }).catch(() => ({ data: [] }))));

    let done = false;
    for (const res of results) {
      const batch = res?.data || [];
      if (!batch.length) {
        done = true;
        break;
      }
      all.push(...batch);
      if (batch.length < AML_GRID_PAGE_SIZE || all.length >= AML_TX_SAMPLE_LIMIT) {
        done = true;
        break;
      }
    }
    if (done) break;
  }

  return all;
}

async function fetchAmlTxHistory(address) {
  const nativeRaw = await fetchAmlGridTxPages(address, 'native');
  let txs = dedupeTxList(nativeRaw);

  if (txs.length < AML_TX_SAMPLE_LIMIT) {
    const trc20Raw = await fetchAmlGridTxPages(address, 'trc20');
    txs = dedupeTxList(txs.concat(normalizeAmlGridTrc20Rows(trc20Raw)));
  }

  if (txs.length >= 50) return trimAmlTxHistory(txs);

  const [nativeScan, trc20Raw] = await Promise.all([
    fetchTronScanNativeTransfers(address, 200).catch(() => []),
    fetchTrc20FromTronScan(address).catch(() => []),
  ]);
  const trc20Scan = trc20Raw
    .filter(isAmlTrc20TransferRow)
    .map(normalizeScanTrc20TransferToGridTx)
    .filter(t => t._trc20From || t._trc20To);
  txs = dedupeTxList(txs.concat(nativeScan, trc20Scan));
  return trimAmlTxHistory(txs);
}

async function fetchAmlPeerTxSample(address, limit = 120) {
  const nativeRaw = await fetchAmlGridTxPages(address, 'native');
  let txs = dedupeTxList(nativeRaw);
  if (txs.length < limit) {
    const trc20Raw = await fetchAmlGridTxPages(address, 'trc20');
    txs = dedupeTxList(txs.concat(normalizeAmlGridTrc20Rows(trc20Raw)));
  }
  return sortAmlTxHistoryDesc(txs).slice(0, limit);
}

const _amlSanctionCache = new Map();

async function fetchAmlSanctionScreen(addresses) {
  const addrs = [...new Set((addresses || []).filter(isValidTron))].slice(0, 32);
  if (!addrs.length) return { hits: [], meta: {}, unavailable: false };

  if (!useApiProxy()) {
    return { hits: [], meta: {}, unavailable: true };
  }

  const cacheKey = addrs.map((a) => a.toLowerCase()).sort().join(',');
  if (_amlSanctionCache.has(cacheKey)) return _amlSanctionCache.get(cacheKey);

  try {
    const res = await fetchWithTimeout(
      window.tronsecProxyUrl('/aml/v1/sanctions-check', { addresses: addrs.join(',') }),
      { headers: withProxyHeaders({}), cache: 'default' },
      8000,
    );
    if (!res.ok) {
      const out = { hits: [], meta: {}, unavailable: true };
      _amlSanctionCache.set(cacheKey, out);
      return out;
    }
    const body = await res.json();
    const out = {
      hits: Array.isArray(body?.hits) ? body.hits : [],
      meta: body?.meta || {},
      unavailable: false,
    };
    _amlSanctionCache.set(cacheKey, out);
    return out;
  } catch (_) {
    return { hits: [], meta: {}, unavailable: true };
  }
}

function patchAmlModuleCopy() {
  if (typeof t !== 'function' || typeof AML_TX_SAMPLE_LIMIT !== 'number') return;
  const count = AML_TX_SAMPLE_LIMIT;
  const leadKey = 'Behavioral risk screening on the latest {count} transactions — composite score, counterparty graph, OFAC SDN / UK OFSI (where synced), TronScan public tags, and TRONSEC label signals.';
  const lead = document.querySelector('#tab-aml-check .module-desc-lead');
  if (lead) {
    lead.setAttribute('data-i18n', leadKey);
    lead.textContent = t(leadKey, { count });
  }
  document.querySelectorAll('#tab-aml-check .module-desc-tag').forEach((tag) => {
    if (tag.dataset.amlTxSample !== '1') return;
    tag.dataset.amlTxSample = '1';
    tag.textContent = t('{count} txs', { count });
  });
}


// ==================================
//  TRX PRICE  (wallet USD + analytics market — shared CMC cache)
// ==================================
let TRX_PRICE  = null;
let TRX_CHANGE = null;

const TRX_MARKET_KEY = 'tronsec_trx_market_v1';
const TRX_MARKET_TTL = 30 * 60 * 1000;
window.TRONSEC_TRX_MARKET_TTL = TRX_MARKET_TTL;

function readTrxMarketCache() {
  try {
    const d = JSON.parse(localStorage.getItem(TRX_MARKET_KEY));
    if (d && d.usd) return d;
  } catch (_) {}
  return null;
}

function isTrxMarketCacheFresh(entry) {
  return !!(entry && entry.ts && Date.now() - entry.ts < TRX_MARKET_TTL);
}

function writeTrxMarketCache(quote) {
  if (!quote?.usd) return;
  try {
    localStorage.setItem(TRX_MARKET_KEY, JSON.stringify({
      usd: quote.usd,
      change: quote.change ?? null,
      marketCap: quote.marketCap ?? null,
      volume24h: quote.volume24h ?? null,
      ts: Date.now(),
    }));
  } catch (_) {}
}

function syncTrxPriceGlobals(quote) {
  if (!quote?.usd) return;
  TRX_PRICE = quote.usd;
  TRX_CHANGE = quote.change ?? null;
}

async function fetchWithTimeout(url, opts = {}, ms = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function scanFetchDirect(path, params = {}, timeoutMs = 7000) {
  const res = await fetchWithTimeout(
    scanRequestUrl(path, params),
    { headers: upstreamHeaders('scan'), cache: 'no-store' },
    timeoutMs,
  );
  if (!res.ok) return null;
  return res.json();
}

async function fetchTrxQuoteFromCmc() {
  if (!useApiProxy()) return null;
  try {
    const res = await fetchWithTimeout(
      window.tronsecProxyUrl('/cmc/v1/cryptocurrency/quotes/latest', { symbol: 'TRX', convert: 'USD' }),
      { cache: 'no-store' },
      7000,
    );
    if (!res.ok) return null;
    const body = await res.json();
    const q = body?.data?.TRX?.quote?.USD;
    const usd = parseFloat(q?.price || 0) || null;
    if (!usd) return null;
    const change = q?.percent_change_24h;
    return {
      usd,
      change: change != null && Number.isFinite(Number(change)) ? Number(change) : null,
      marketCap: q?.market_cap ?? null,
      volume24h: q?.volume_24h ?? null,
    };
  } catch (_) {
    return null;
  }
}

async function fetchTrxQuoteFromCoingecko() {
  if (!useApiProxy()) return null;
  try {
    const res = await fetchWithTimeout(
      window.tronsecProxyUrl('/cg/simple/price', {
        ids: 'tron',
        vs_currencies: 'usd',
        include_24hr_change: 'true',
      }),
      { cache: 'no-store' },
      6000,
    );
    if (!res.ok) return null;
    const body = await res.json();
    const row = body?.tron;
    const usd = parseFloat(row?.usd || 0) || null;
    if (!usd) return null;
    const change = row?.usd_24h_change;
    return {
      usd,
      change: change != null && Number.isFinite(Number(change)) ? Number(change) : null,
      marketCap: null,
      volume24h: null,
    };
  } catch (_) {
    return null;
  }
}

async function fetchTrxQuoteFromScan() {
  try {
    const p = await scanFetchDirect('/token/price', { token: 'trx' });
    if (!p) return null;
    const usd = parseFloat(p.price_in_usd ?? p.priceInUsd ?? p.price ?? 0) || null;
    if (!usd) return null;
    const changeRaw = p.percent_change_24h ?? p.priceChange24h ?? p.percentChangeIn24h ?? p.change24h;
    const change = changeRaw != null ? parseFloat(changeRaw) : null;
    const marketCap = parseFloat(p.market_cap ?? p.marketCap ?? 0) || null;
    const volume24h = parseFloat(p.volume_24h ?? p.volume24h ?? 0) || null;
    return {
      usd,
      change: Number.isFinite(change) ? change : null,
      marketCap,
      volume24h,
    };
  } catch (_) {}
  try {
    const list = await scanFetchDirect('/getAssetWithPriceList', { limit: 20 });
    const trx = (list?.data || []).find(t => String(t.abbr || '').toLowerCase() === 'trx' || t.id === '_');
    const usd = parseFloat(trx?.priceInUsd ?? trx?.price_in_usd ?? 0) || null;
    if (usd) return { usd, change: null, marketCap: null, volume24h: null };
  } catch (_) {}
  return null;
}

function pickTrxMarketQuote(results) {
  const cmc = results[0]?.status === 'fulfilled' ? results[0].value : null;
  const scan = results[1]?.status === 'fulfilled' ? results[1].value : null;
  const cg = results[2]?.status === 'fulfilled' ? results[2].value : null;
  if (cmc?.usd) return cmc;
  if (scan?.usd) return scan;
  if (cg?.usd) return cg;
  return null;
}

async function fetchTrxMarketQuote(opts = {}) {
  const cacheOnly = !!opts.cacheOnly;
  const cached = readTrxMarketCache();

  if (cached?.usd) {
    syncTrxPriceGlobals(cached);
    if (cacheOnly || isTrxMarketCacheFresh(cached)) return cached;
  }
  if (cacheOnly) return cached || null;

  const results = await Promise.allSettled([
    fetchTrxQuoteFromCmc(),
    fetchTrxQuoteFromScan(),
    fetchTrxQuoteFromCoingecko(),
  ]);
  const quote = pickTrxMarketQuote(results);
  if (quote?.usd) {
    writeTrxMarketCache(quote);
    syncTrxPriceGlobals(quote);
  }
  return quote || cached || null;
}

let _trxPriceInflight = null;

function hydrateTrxPriceFromCache() {
  const cached = readTrxMarketCache();
  if (cached?.usd) syncTrxPriceGlobals(cached);
  return cached;
}

async function ensureTrxPrice(opts = {}) {
  const cacheOnly = !!opts.cacheOnly;
  const cached = hydrateTrxPriceFromCache();
  if (cached?.usd && (cacheOnly || isTrxMarketCacheFresh(cached))) {
    return { usd: cached.usd, change: cached.change ?? null };
  }
  if (cacheOnly) {
    return cached?.usd ? { usd: cached.usd, change: cached.change ?? null } : { usd: null, change: null };
  }
  if (!_trxPriceInflight) {
    _trxPriceInflight = fetchTrxMarketQuote().finally(() => { _trxPriceInflight = null; });
  }
  const quote = await _trxPriceInflight;
  if (quote?.usd) return { usd: quote.usd, change: quote.change ?? null };
  return {
    usd: TRX_PRICE,
    change: TRX_CHANGE,
  };
}

window.ensureTrxPrice = ensureTrxPrice;
hydrateTrxPriceFromCache();
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
    <div class="scan-head-card sk-wallet-block">
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
