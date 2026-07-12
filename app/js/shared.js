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
  const { flagged = false, className = '', muted = false } = opts;
  const extraCls = className ? ' ' + esc(className) : '';

  if (muted) {
    return `<svg class="risk-shield-icon risk-shield-icon--muted${extraCls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="${RISK_SHIELD_PATH}" fill="var(--text-3)" fill-opacity="0.12" stroke="var(--text-3)" stroke-width="1.2"/>
    </svg>`;
  }

  const tier = riskShieldTier(score, flagged);
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
      if (!dh.startsWith(APPROVE_SIG)) return;
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

async function fetchTronScanApprovalList(addr) {
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
    const key = `${tokenAddr}_${spender}`;
    if (!map.has(key)) map.set(key, { ...item, tokenAddr, spender });
  }
  return Array.from(map.values());
}

async function fetchActiveOnChainApprovals(addr, trc20TxList, nativeTxList, scanRaw) {
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

async function fetchTrc20FromTronScan(address) {
  const endpoints = [
    ['/token_trc20/transfers', {address, start:0, limit:200}],
    ['/token_trc20/transfers', {account:address, start:0, limit:200}],
    ['/transaction', {address, start:0, limit:200}],
    ['/transactions', {address, start:0, limit:200}],
    ['/transfer', {address, start:0, limit:200}],
    ['/token_transfers', {address, start:0, limit:200}],
  ];
  const results = await Promise.all(
    endpoints.map(([path, params]) => scanGet(path, params).catch(() => null)),
  );
  for (const res of results) {
    if (!res) continue;
    const arr = res.token_transfers || res.data || res.transfers || res.transactions || res.txs || (Array.isArray(res) ? res : null) || res.items;
    if (arr && arr.length) return arr;
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
  return {
    txID: row.transaction_id || row.transactionHash || row.hash || row.txID || '',
    block_timestamp: ts,
    _trc20From: from,
    _trc20To: to,
    _isTrc20: true,
    raw_data: {
      contract: [{
        type: 'TriggerSmartContract',
        parameter: { value: { owner_address: from, to_address: to, contract_address: contract, amount, data: '' } },
      }],
    },
  };
}

function normalizeScanTrc20TransferToGridTx(row) {
  return normalizeTrc20ToAmlTx(row);
}

async function fetchTronScanNativeTransfers(address, limit = 200) {
  const endpoints = [
    ['/transfer', { address, start: 0, limit }],
    ['/transactions', { address, start: 0, limit }],
  ];
  const results = await Promise.all(
    endpoints.map(([path, params]) => scanGet(path, params).catch(() => null)),
  );
  for (const res of results) {
    const rows = scanTransferRows(res);
    if (rows.length) return rows.map(normalizeScanTransferToGridTx);
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
    .filter(t => (t.type || t.event_type || 'Transfer') !== 'Approval')
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
    .filter(r => (r.event_type || r.type || 'Transfer') !== 'Approval')
    .map(normalizeScanTrc20TransferToGridTx)
    .filter(t => t._trc20From || t._trc20To);
  txs = dedupeTxList(txs.concat(nativeScan, trc20Scan));
  return trimAmlTxHistory(txs);
}

function patchAmlModuleCopy() {
  if (typeof t !== 'function' || typeof AML_TX_SAMPLE_LIMIT !== 'number') return;
  const count = AML_TX_SAMPLE_LIMIT;
  const leadKey = 'Behavioral risk screening on the latest {count} transactions — composite score, concentration analysis, counterparty graph, activity patterns, and public security flags for any address.';
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
    <div class="aml-block wallet-kv-block sk-wallet-block">
      <div class="aml-block-head">${sk('sk-line-xs', headW)}</div>
      <div class="aml-block-body aml-block-body--flush">
        <div class="aml-kv-list">
      ${Array.from({ length: rows }, (_, i) => `
        <div class="kv-row sk-wallet-kv">
          ${sk('sk-line-xs', `${30 + (i % 2) * 6}%`)}
          ${sk('sk-line-xs', `${18 + (i % 3) * 5}%`)}
        </div>`).join('')}
        </div>
      </div>
    </div>`,

  wallet: () => `
    <div class="wallet-scan">
      ${SK.status('SCANNING WALLET')}
      ${skGap(14)}
      <div class="scan-head-card scan-head-card--featured sk-wallet-block">
        <div class="wallet-head-top">
          ${sk('sk-line-md', '62%')}
          <div class="wallet-head-actions" style="display:flex;gap:6px;flex-wrap:wrap">
            ${Array.from({ length: 6 }, () => sk('sk-line-xs', '68px')).join('')}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
          ${Array.from({ length: 4 }, () => sk('sk-line-xs', '72px')).join('')}
        </div>
      </div>
      ${skGap(10)}
      <div class="wallet-risk-grid an-stat-grid an-stat-grid--2">${SK.analyticsGrid(2)}</div>
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
        <div class="scan-section-title wallet-section-title">${sk('sk-line-xs', '32%')}</div>
        <div class="wallet-token-list">${Array.from({ length: 3 }, () => SK.walletTokenRowSk()).join('')}</div>
      </div>
      ${skGap(12)}
      <div>
        <div class="scan-section-title wallet-section-title">${sk('sk-line-xs', '36%')}</div>
        <div class="wallet-activity">${Array.from({ length: 4 }, () => SK.walletActivityRowSk()).join('')}</div>
      </div>
    </div>`,

  approvals: () => `
    <div class="appr-scan">
      ${SK.status('CHECKING APPROVALS')}
      ${skGap(14)}
      ${SK.scanHeadCard(3)}
      ${skGap(10)}
      <div class="an-stat-grid an-stat-grid--4 scan-hero-grid">
        ${SK.analyticsGrid(4)}
      </div>
      ${skGap(10)}
      <div class="appr-assessment">${SK.assessmentSk()}</div>
      ${skGap(12)}
      <div class="appr-sections">
      <div class="appr-section">
        <div class="appr-section-head scan-section-head">
          ${sk('sk-line-xs', '32%')}
          ${sk('sk-badge')}
        </div>
        <div class="scan-list appr-list">
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
      </div>
    </div>`,

  permissions: () => `
    <div class="perm-scan">
      ${SK.status('AUDITING PERMISSIONS')}
      ${skGap(14)}
      ${SK.scanHeadCard(3)}
      ${skGap(10)}
      <div class="an-stat-grid an-stat-grid--4 scan-hero-grid">${SK.analyticsGrid(4)}</div>
      <div class="perm-assessment">${SK.assessmentSk()}</div>
      ${SK.amlBlockSk('28%', SK.contractRiskRowsSk(3), '12%')}
      <div class="perm-sections">
        ${SK.amlBlockSk('30%', '<div class="perm-signer-list">' + Array.from({ length: 2 }, () => '<div class="perm-signer sk-wallet-block" style="min-height:54px"></div>').join('') + '</div>', '18%')}
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
      ${SK.scanHeadCard(3)}
      ${skGap(10)}
      <div class="an-stat-grid an-stat-grid--4 scan-hero-grid">
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
      ${SK.scanHeadCard(4)}
      ${skGap(10)}
      <div class="an-stat-grid an-stat-grid--4 scan-hero-grid">
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
      ${SK.scanHeadCard(3)}
      ${skGap(10)}
      <div class="an-stat-grid an-stat-grid--4 scan-hero-grid">
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

  phishCheck: () => `
    <div class="phish-scan" id="phish-skel">
      ${SK.status('RUNNING SCAN', 'phish-skel-status')}
      ${skGap(12)}
      ${SK.scanHeadCard(3)}
      ${skGap(10)}
      <div class="an-stat-grid an-stat-grid--4 scan-hero-grid">
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

  vanity: () => `
    <div class="vanity-scan-skel">
      ${SK.status('SEARCHING PATTERN', 'vanity-skel-status')}
      ${skGap(12)}
      <div class="vanity-searching-card sk-wallet-block">
        <div class="wallet-head-top" style="margin-bottom:12px">
          ${sk('sk-line-sm', '42%')}
          ${sk('sk-line-xs', '72px')}
        </div>
        <div class="sk" style="height:8px;border-radius:999px;width:100%;margin-bottom:14px"></div>
        <div class="an-stat-grid an-stat-grid--3" style="gap:10px">
          ${SK.analyticsCell()}${SK.analyticsCell()}${SK.analyticsCell()}
        </div>
        ${skGap(10)}
        ${sk('sk-line-xs', '68%')}
      </div>
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
  refresh: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15",
};

function badge(cls, text) {
  return `<span class="badge ${cls}">${esc(t(text))}</span>`;
}

function scanActionBtn({ id, label, icon, href, variant }) {
  const cls = `wallet-action-btn${variant ? ` wallet-action-btn--${variant}` : ''}`;
  const lbl = esc(t(label));
  const inner = `${icSVG(icon, 14)}<span>${lbl}</span>`;
  const aria = ` aria-label="${lbl}"`;
  if (href) return `<a class="${cls}" id="${id}" href="${esc(href)}" target="_blank" rel="noopener"${aria}>${inner}</a>`;
  return `<button type="button" class="${cls}" id="${id}"${aria}>${inner}</button>`;
}

function scanHeadCard({ leadHtml, actionsHtml = '', tagsHtml = '', extraClass = '', variant = '' }) {
  const cardCls = ['scan-head-card', variant && `scan-head-card--${variant}`, extraClass].filter(Boolean).join(' ');
  const tagsBlock = tagsHtml ? `<div class="wallet-head-tags">${tagsHtml}</div>` : '';
  const actionsBlock = actionsHtml ? `<div class="wallet-head-actions">${actionsHtml}</div>` : '';
  return `<div class="${cardCls}">
    <div class="wallet-head-top">
      ${leadHtml}
      ${actionsBlock}
    </div>
    ${tagsBlock}
  </div>`;
}

function amlAlertInline(type, html) {
  return `<div class="aml-alert aml-alert--${type} aml-alert--inline">
    ${icSVG(IC.alert, 14)}
    <div class="aml-alert-body">${html}</div>
  </div>`;
}

function alertBox(type, html) {
  return amlAlertInline(type, html);
}

const SCAN_HEAD_OVERFLOW_PRIMARY = 2;
const _scanHeadOverflowMq = typeof window !== 'undefined'
  ? window.matchMedia('(max-width: 767px)')
  : null;

function scanHeadActionButtons(actionsEl) {
  return [...actionsEl.children].filter(el =>
    (el.classList.contains('wallet-action-btn') || el.tagName === 'A')
    && !el.classList.contains('scan-head-overflow-btn')
    && !el.classList.contains('scan-head-overflow-menu')
  );
}

function bindScanHeadOverflow(scope) {
  const roots = [];
  if (scope?.classList?.contains('wallet-head-actions')) roots.push(scope);
  else if (scope?.querySelectorAll) roots.push(...scope.querySelectorAll('.wallet-head-actions'));

  roots.forEach(actionsEl => {
    if (!actionsEl || actionsEl.dataset.headOverflowInit === '1') return;
    actionsEl.dataset.headOverflowInit = '1';

    let moreBtn = null;
    let menu = null;

    const closeMenu = () => {
      if (!menu || menu.hidden) return;
      menu.hidden = true;
      moreBtn?.setAttribute('aria-expanded', 'false');
      actionsEl.classList.remove('is-overflow-open');
    };

    const teardownOverflow = () => {
      closeMenu();
      if (menu) {
        [...menu.children].forEach(btn => actionsEl.insertBefore(btn, moreBtn));
        menu.remove();
        menu = null;
      }
      if (moreBtn) {
        moreBtn.remove();
        moreBtn = null;
      }
    };

    const layout = () => {
      teardownOverflow();
      const buttons = scanHeadActionButtons(actionsEl);
      if (!_scanHeadOverflowMq?.matches || buttons.length <= 3) return;

      const extra = buttons.slice(SCAN_HEAD_OVERFLOW_PRIMARY);
      if (!extra.length) return;

      moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'wallet-action-btn scan-head-overflow-btn';
      moreBtn.setAttribute('aria-expanded', 'false');
      moreBtn.setAttribute('aria-haspopup', 'true');
      moreBtn.innerHTML = `${icSVG('M6 12h.01M12 12h.01M18 12h.01', 14)}<span>${esc(t('More'))}</span>`;
      actionsEl.appendChild(moreBtn);

      menu = document.createElement('div');
      menu.className = 'scan-head-overflow-menu';
      menu.setAttribute('role', 'menu');
      menu.hidden = true;
      actionsEl.appendChild(menu);
      extra.forEach(btn => {
        btn.setAttribute('role', 'menuitem');
        menu.appendChild(btn);
      });

      const focusMenuItem = (idx) => {
        const items = [...menu.querySelectorAll('[role="menuitem"]')];
        if (!items.length) return;
        const i = ((idx % items.length) + items.length) % items.length;
        items[i].focus();
      };

      const openMenu = () => {
        if (!menu) return;
        menu.hidden = false;
        moreBtn?.setAttribute('aria-expanded', 'true');
        actionsEl.classList.add('is-overflow-open');
        focusMenuItem(0);
      };

      moreBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (menu.hidden) openMenu();
        else closeMenu();
      });

      moreBtn.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (menu.hidden) openMenu();
          else focusMenuItem(0);
        } else if (e.key === 'Escape') {
          closeMenu();
        }
      });

      menu.addEventListener('keydown', e => {
        const items = [...menu.querySelectorAll('[role="menuitem"]')];
        const idx = items.indexOf(document.activeElement);
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMenu();
          moreBtn?.focus();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          focusMenuItem(idx + 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          focusMenuItem(idx - 1);
        } else if (e.key === 'Home') {
          e.preventDefault();
          focusMenuItem(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          focusMenuItem(items.length - 1);
        }
      });
    };

    layout();
    _scanHeadOverflowMq?.addEventListener('change', layout);
    document.addEventListener('click', () => closeMenu());
  });
}

function scanKvBlock(title, rowsHtml) {
  const titleHtml = /<[^>]+>/.test(title) ? title : esc(t(title));
  return `<div class="aml-block wallet-kv-block">
    <div class="aml-block-head">
      <span class="aml-block-title">${titleHtml}</span>
    </div>
    <div class="aml-block-body aml-block-body--flush">
      <div class="aml-kv-list">${rowsHtml}</div>
    </div>
  </div>`;
}

function initModuleDescTags() {
  document.querySelectorAll('.module-desc-tags').forEach(tags => {
    const parent = tags.parentElement;
    if (!parent || parent.querySelector('.module-desc-tags-toggle')) return;
    const count = tags.querySelectorAll('.module-desc-tag').length;
    if (!count) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'module-desc-tags-toggle';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = `<span class="module-desc-tags-toggle-label">${esc(t('Module features'))}</span><span class="module-desc-tags-toggle-meta">${count}</span>`;
    parent.insertBefore(btn, tags);

    btn.addEventListener('click', () => {
      const open = tags.classList.toggle('is-open');
      btn.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
}

const MODULE_STATE_ARIA = {
  empty: 'No scan yet',
  cached: 'Cached result in module',
  error: 'Last scan failed',
};

function moduleNavStateLabel(state) {
  const key = MODULE_STATE_ARIA[state];
  return key ? t(key) : state;
}

const MODULE_STATE_TABS = {
  scanner: { result: 'wallet-result', err: 'wallet-err' },
  approvals: { result: 'approvals-result', err: 'approvals-err' },
  permissions: { result: 'permissions-result', err: 'permissions-err' },
  'aml-check': { result: 'aml-result', err: 'aml-err' },
  'scan-url': { result: 'phish-result', err: 'phish-err' },
  'contract-scan': { result: 'contract-result', err: 'contract-err' },
  'tx-decoder': { result: 'tx-result', err: 'tx-err' },
  vanity: { result: 'vanity-result', err: 'vanity-err' },
};

function setModuleNavState(tabId, state) {
  if (!MODULE_STATE_TABS[tabId] || !['empty', 'cached', 'error'].includes(state)) return;
  document.querySelectorAll(`[data-tab-btn="${tabId}"], [data-more-tab="${tabId}"]`).forEach(btn => {
    btn.dataset.moduleState = state;
    const dot = btn.querySelector('.sidebar-nav-state:not(.is-spacer)');
    if (dot) {
      dot.classList.remove('is-empty', 'is-cached', 'is-error');
      dot.classList.add(`is-${state}`);
      dot.dataset.moduleState = state;
      dot.setAttribute('aria-label', moduleNavStateLabel(state));
    }
    if (btn.closest('.mobile-bottom-nav') || btn.classList.contains('mobile-more-item')) {
      const name = btn.querySelector('span')?.textContent?.trim() || tabId;
      if (state === 'empty') btn.removeAttribute('aria-label');
      else btn.setAttribute('aria-label', `${name} — ${moduleNavStateLabel(state)}`);
    }
  });
}

function wireMobileMoreItemStates() {
  document.querySelectorAll('.mobile-more-item').forEach(item => {
    if (item.dataset.moreTab) return;
    const onclick = item.getAttribute('onclick') || '';
    const m = onclick.match(/switchTab\(["']([^"']+)["']\)/);
    if (m) item.dataset.moreTab = m[1];
    if (!item.dataset.moduleState) item.dataset.moduleState = 'empty';
  });
}

function syncMobileMoreActiveItem(tabId) {
  const active = tabId || document.querySelector('.tab-content.active')?.id?.slice(4) || '';
  document.querySelectorAll('.mobile-more-item[data-more-tab]').forEach(item => {
    item.classList.toggle('is-more-active', item.dataset.moreTab === active);
  });
}

function syncModuleNavState(tabId) {
  const cfg = MODULE_STATE_TABS[tabId];
  if (!cfg) return;
  const err = document.getElementById(cfg.err);
  const result = document.getElementById(cfg.result);
  if (err && err.innerHTML.trim()) {
    setModuleNavState(tabId, 'error');
    syncMoreMenuBadge();
    return;
  }
  if (!result || !result.innerHTML.trim()) {
    setModuleNavState(tabId, 'empty');
    syncMoreMenuBadge();
    return;
  }
  if (result.querySelector('.sk')) return;
  setModuleNavState(tabId, 'cached');
  syncMoreMenuBadge();
}

function refreshModuleNavStateAria() {
  document.querySelectorAll('.sidebar-nav-state[data-module-state]').forEach(dot => {
    dot.setAttribute('aria-label', moduleNavStateLabel(dot.dataset.moduleState));
  });
}

function injectModuleNavStateDots() {
  Object.keys(MODULE_STATE_TABS).forEach(tabId => {
    document.querySelectorAll(`[data-tab-btn="${tabId}"]`).forEach(btn => {
      if (btn.getAttribute('data-tab-btn') === 'more') return;
      if (btn.closest('.mobile-bottom-nav')) {
        if (!btn.dataset.moduleState) btn.dataset.moduleState = 'empty';
        return;
      }
      if (btn.querySelector('.sidebar-nav-state:not(.is-spacer)')) return;
      const dot = document.createElement('span');
      dot.className = 'sidebar-nav-state is-empty';
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label', moduleNavStateLabel('empty'));
      dot.dataset.moduleState = 'empty';
      const label = btn.querySelector('.module-file');
      if (label) label.insertAdjacentElement('afterend', dot);
      else btn.appendChild(dot);
    });
  });
}

let _moduleResultObserver = null;
function observeModuleResultNodes() {
  if (_moduleResultObserver) return;
  const tabByNodeId = {};
  Object.entries(MODULE_STATE_TABS).forEach(([tabId, cfg]) => {
    tabByNodeId[cfg.result] = tabId;
    tabByNodeId[cfg.err] = tabId;
  });
  _moduleResultObserver = new MutationObserver(muts => {
    const touched = new Set();
    muts.forEach(m => {
      let node = m.target;
      while (node && node !== document.body) {
        if (node.id && tabByNodeId[node.id]) {
          touched.add(tabByNodeId[node.id]);
          break;
        }
        node = node.parentNode;
      }
    });
    touched.forEach(tabId => {
      syncModuleNavState(tabId);
      const cfg = MODULE_STATE_TABS[tabId];
      const result = cfg && document.getElementById(cfg.result);
      if (result) bindScanHeadOverflow(result);
    });
  });
  const opts = { childList: true, subtree: true, characterData: true };
  Object.values(MODULE_STATE_TABS).forEach(cfg => {
    const result = document.getElementById(cfg.result);
    const err = document.getElementById(cfg.err);
    if (result) _moduleResultObserver.observe(result, opts);
    if (err) _moduleResultObserver.observe(err, opts);
  });
}

function initModuleNavStates() {
  wireMobileMoreItemStates();
  injectModuleNavStateDots();
  observeModuleResultNodes();
  initA11yShell();
  Object.keys(MODULE_STATE_TABS).forEach(syncModuleNavState);
  syncMoreMenuBadge();
  syncMobileMoreActiveItem();
}

const SCAN_EMPTY_HIDE_MS = 150;

function lockScanInput(input, locked) {
  if (!input) return;
  input.disabled = !!locked;
  if (locked) input.setAttribute('aria-busy', 'true');
  else input.removeAttribute('aria-busy');
}

function hideScanEmpty(emptyEl, opts = {}) {
  if (!emptyEl || emptyEl.style.display === 'none') {
    opts.onDone?.();
    return;
  }
  const instant = opts.instant === true;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (instant || reduced) {
    emptyEl.style.display = 'none';
    emptyEl.classList.remove('is-hiding');
    opts.onDone?.();
    return;
  }
  emptyEl.classList.add('is-hiding');
  setTimeout(() => {
    emptyEl.style.display = 'none';
    emptyEl.classList.remove('is-hiding');
    opts.onDone?.();
  }, SCAN_EMPTY_HIDE_MS);
}

function showScanEmpty(emptyEl) {
  if (!emptyEl) return;
  emptyEl.classList.remove('is-hiding', 'hidden');
  emptyEl.style.display = '';
}

const SESSION_CACHE_TTL_MS = 12 * 60 * 1000;
const SESSION_CACHE_VERSION = 1;

function sessionCacheLang() {
  if (typeof i18nLang === 'function') return i18nLang();
  return document.documentElement.getAttribute('lang') || 'en';
}

function sessionCacheKey(module, id, locale) {
  const loc = locale != null ? locale : sessionCacheLang();
  return `tronsec:v${SESSION_CACHE_VERSION}:${module}:${loc}:${id}`;
}

function legacySessionCacheKey(module, id) {
  const legacy = {
    wallet: `tronsec_wallet_scan:${id}`,
    aml: `tronsec_aml_scan:${id}`,
    approvals: `tronsec_approvals_scan:${id}`,
    permissions: `tronsec_permissions_scan:${id}`,
    contract: `tronsec_contract_scan:${id}`,
    phish: `tronsec_phish_scan:${id}`,
    tx: `tronsec_tx_scan:${id}`,
  };
  return legacy[module] || null;
}

function readSessionCache(module, id, options = {}) {
  const ttl = options.ttl ?? SESSION_CACHE_TTL_MS;
  const lang = sessionCacheLang();
  const keys = [sessionCacheKey(module, id, lang)];
  const legacy = options.legacyKey ? options.legacyKey(id) : legacySessionCacheKey(module, id);
  if (legacy) keys.push(legacy);

  for (const key of keys) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed?.ts || Date.now() - parsed.ts > ttl) continue;
      if (options.validate && !options.validate(parsed, id)) continue;
      if (parsed.html && !options.allowHtml) continue;
      if (parsed.html && parsed.locale && parsed.locale !== lang && !options.allowStaleHtml) continue;
      if (options.requirePayload && !parsed.payload && !parsed.report && !parsed.result && !parsed.data && !parsed.list) continue;
      return parsed;
    } catch (_) {}
  }
  return null;
}

function writeSessionCache(module, id, snapshot, options = {}) {
  if (!module || id == null || id === '') return;
  const lang = sessionCacheLang();
  const key = sessionCacheKey(module, id, lang);
  const payload = { ...snapshot, v: SESSION_CACHE_VERSION, locale: lang, ts: Date.now() };
  try {
    sessionStorage.setItem(key, JSON.stringify(payload));
    const legacy = options.legacyKey ? options.legacyKey(id) : legacySessionCacheKey(module, id);
    if (legacy && legacy !== key) sessionStorage.removeItem(legacy);
  } catch (_) {}
}

function clearSessionCache(module, id, options = {}) {
  if (!module || id == null || id === '') return;
  const keys = new Set([sessionCacheKey(module, id, sessionCacheLang())]);
  const legacy = options.legacyKey ? options.legacyKey(id) : legacySessionCacheKey(module, id);
  if (legacy) keys.add(legacy);
  keys.forEach((key) => {
    try { sessionStorage.removeItem(key); } catch (_) {}
  });
}

function beginScanUI({ emptyEl, resultEl, errEl, btn, input, skeletonHtml, lockInput = true }) {
  setError(errEl, '');
  hideScanEmpty(emptyEl);
  if (resultEl && skeletonHtml != null) resultEl.innerHTML = skeletonHtml;
  if (btn) {
    spinBtn(btn, true);
    btn.setAttribute('aria-busy', 'true');
  }
  if (lockInput) lockScanInput(input, true);
}

function endScanUI({ btn, input, lockInput = true }) {
  if (btn) {
    spinBtn(btn, false);
    btn.removeAttribute('aria-busy');
  }
  if (lockInput) lockScanInput(input, false);
}

function failScanUI({ resultEl, errEl, msg, btn, input, lockInput = true }) {
  if (resultEl) resultEl.innerHTML = '';
  setError(errEl, msg);
  endScanUI({ btn, input, lockInput });
}

function animateScore(el, from, to, duration = 600) {
  if (!el || from === to) return;
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = String(to);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = String(to);
  };
  requestAnimationFrame(tick);
}

function mountScanMotion(root, opts = {}) {
  if (!root) return;
  if (opts.fromCache) {
    root.querySelectorAll('[data-score-value]').forEach((el) => {
      const to = Number(el.dataset.scoreValue);
      if (Number.isFinite(to)) el.textContent = String(to);
    });
    root.querySelectorAll('.aml-risk-meter-fill[data-score-pct]').forEach((el) => {
      const pct = Number(el.dataset.scorePct);
      if (Number.isFinite(pct)) el.style.width = `${Math.max(4, pct)}%`;
    });
    return;
  }
  root.querySelectorAll('[data-score-value]').forEach((el) => {
    const to = Number(el.dataset.scoreValue);
    if (!Number.isFinite(to)) return;
    animateScore(el, 0, to, 600);
  });
  root.querySelectorAll('.aml-risk-meter-fill[data-score-pct]').forEach((el) => {
    const pct = Number(el.dataset.scorePct);
    if (!Number.isFinite(pct)) return;
    el.style.width = '4%';
    requestAnimationFrame(() => {
      el.classList.add('is-animated');
      el.style.width = `${Math.max(4, pct)}%`;
    });
  });
}

const MORE_MENU_TABS = ['contract-scan', 'scan-url', 'permissions', 'tx-decoder', 'vanity', 'report'];

function syncMoreMenuBadge() {
  const moreBtn = document.querySelector('[data-tab-btn="more"]');
  if (!moreBtn) return;
  let state = 'empty';
  for (const tabId of MORE_MENU_TABS) {
    const cfg = MODULE_STATE_TABS[tabId];
    if (!cfg) continue;
    const err = document.getElementById(cfg.err);
    const result = document.getElementById(cfg.result);
    if (err?.innerHTML?.trim()) { state = 'error'; break; }
    if (result?.innerHTML?.trim() && !result.querySelector('.sk')) state = 'cached';
  }
  moreBtn.dataset.moduleState = state;
  const name = moreBtn.querySelector('span')?.textContent?.trim() || 'More';
  if (state === 'empty') moreBtn.removeAttribute('aria-label');
  else moreBtn.setAttribute('aria-label', `${name} — ${moduleNavStateLabel(state)}`);
}

function trapFocus(container, opts = {}) {
  if (!container) return () => {};
  const prev = document.activeElement;
  const sel = opts.selector || 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const getFocusable = () => [...container.querySelectorAll(sel)].filter(el =>
    !el.disabled && el.offsetParent !== null && !el.hidden && el.getAttribute('aria-hidden') !== 'true'
  );

  const onKey = (e) => {
    if (e.key === 'Escape' && typeof opts.onEscape === 'function') {
      e.preventDefault();
      opts.onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = getFocusable();
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKey);
  const nodes = getFocusable();
  (opts.initialFocus || nodes[0] || container)?.focus?.();

  return () => {
    document.removeEventListener('keydown', onKey);
    if (prev && typeof prev.focus === 'function') prev.focus();
  };
}

function navigateToTab(tabId, opts = {}) {
  if (typeof switchTab === 'function') switchTab(tabId, opts);
  const prefill = opts.prefill;
  const selector = opts.prefillSelector || TAB_PREFILL?.[tabId]?.inputId;
  if (!prefill || !selector) return;
  const apply = () => {
    const inp = document.getElementById(selector);
    if (!inp) return;
    let val = prefill;
    if (tabId === 'scan-url' && val && !/^https?:\/\//i.test(val)) val = 'https://' + val;
    inp.value = val;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    if (opts.autoScan) inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  };
  apply();
  requestAnimationFrame(apply);
}

function initA11yShell() {
  document.querySelectorAll('[data-tab-btn]').forEach(btn => {
    const tabId = btn.getAttribute('data-tab-btn');
    if (!tabId || tabId === 'more') return;
    btn.setAttribute('role', 'tab');
    btn.id = btn.id || `tabbtn-${tabId}`;
    btn.setAttribute('aria-controls', `tab-${tabId}`);
    btn.setAttribute('aria-selected', btn.classList.contains('tab-nav-active') ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-content').forEach(panel => {
    const tabId = panel.id?.replace(/^tab-/, '');
    if (!tabId) return;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tabbtn-${tabId}`);
    panel.setAttribute('tabindex', '-1');
  });
  Object.values(MODULE_STATE_TABS).forEach(cfg => {
    const result = document.getElementById(cfg.result);
    const err = document.getElementById(cfg.err);
    if (result && !result.getAttribute('aria-live')) {
      result.setAttribute('aria-live', 'polite');
      result.setAttribute('aria-relevant', 'additions');
    }
    if (err && !err.getAttribute('role')) err.setAttribute('role', 'alert');
  });
  const menu = document.getElementById('mobile-more-menu');
  if (menu) {
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    menu.setAttribute('aria-label', t('More tools'));
  }
}

function setError(el, msg) {
  if (!el) return;
  el.innerHTML = msg ? alertBox('red', esc(msg)) : '';
  const panel = el.closest('.module-panel') || el.closest('.vanity-panel') || el.closest('.report-panel');
  const empty = panel?.querySelector('[id$="-empty"]');
  const result = panel?.querySelector('[id$="-result"]');
  if (empty) {
    if (msg) empty.style.display = 'none';
    else if (!result?.innerHTML?.trim()) empty.style.display = '';
  }
  if (el.id) {
    for (const [tabId, cfg] of Object.entries(MODULE_STATE_TABS)) {
      if (cfg.err === el.id) {
        syncModuleNavState(tabId);
        break;
      }
    }
  }
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
  approval:         { lbl:'Approval',         desc:'Permission for a contract to spend your TRC-20 tokens without further confirmation.' },
  approvals:        { lbl:'Approvals',        desc:'Active on-chain permissions letting contracts move your tokens.' },
  transferFrom:     { lbl:'transferFrom',     desc:'Transfers tokens using a prior approval — common in DeFi and drainers.' },
  multicall:        { lbl:'multicall',        desc:'Batches multiple contract calls in one transaction — review all inner actions.' },
  verified:         { lbl:'Verified',         desc:'Source code published on TronScan and matches deployed bytecode.' },
  liquidity:        { lbl:'Liquidity',        desc:'Tokens locked in a pool — depth affects price impact and exit risk.' },
  trc10:            { lbl:'TRC10',            desc:'TRON native token standard — simpler than TRC-20, no smart contract required.' },
  staking:          { lbl:'Staking',          desc:'Freezing TRX for bandwidth, energy, and TRON Power used to vote for SRs.' },
  sr:               { lbl:'SR',               desc:'Super Representative — block producer that earns and shares network rewards.' },
  riskScore:        { lbl:'Risk score',       desc:'Composite 0–100 rating from automated heuristics and pattern checks.' },
  risk:             { lbl:'Risk',             desc:'Estimated severity of interacting with this address, contract, transaction, or URL.' },
  status:           { lbl:'Status',           desc:'Whether the transaction succeeded or reverted on-chain.' },
  type:             { lbl:'Type',             desc:'On-chain operation category — transfer, contract call, stake, vote, etc.' },
  drainer:          { lbl:'Drainer',          desc:'Malicious contract or site designed to steal tokens via approvals or tricks.' },
  claimSplit:       { lbl:'Claim split',      desc:'Drainer pattern: claim(recipient, %) sends a share of approved assets to attacker.' },
  mintFn:           { lbl:'mint()',           desc:'Creates new tokens — inflates supply and can dilute existing holders.' },
  officialToken:    { lbl:'Official token',   desc:'Recognized issuer contract (e.g. USDT) — issuer compliance controls are normal.' },
  heuristics:       { lbl:'Heuristics',       desc:'Rule-based detectors that flag suspicious URLs, contracts, or wallet behavior.' },
  scanEngines:      { lbl:'Multi-engine scan', desc:'URL reputation checked across several security databases (e.g. VirusTotal).' },
  smartContract:    { lbl:'Smart contract',   desc:'Program deployed on TRON — executes logic when called via transactions.' },
  warnings:         { lbl:'Warnings',         desc:'Non-critical risk patterns that deserve manual review before interacting.' },
  holders:          { lbl:'Holders',          desc:'Number of distinct addresses holding this token.' },
  blacklist:        { lbl:'Blacklist',        desc:'Address blocked from sending or receiving by token issuers or security services.' },
  communityBlocklist: { lbl:'Community blocklist', desc:'Crowdsourced list of known phishing and scam domains maintained by security communities.' },
};

/** KV / stat label: plain i18n string, or pre-rendered `tt()` HTML. */
function kvLabel(label) {
  if (label == null || label === '') return '';
  const s = String(label);
  if (s.includes('class="term"')) return s;
  return esc(t(s));
}

function i18nFactorLabel(f) {
  if (!f || f.label == null) return '';
  return t(f.label, f.labelVars || undefined);
}

/** Block meta: i18n key, `{ key, vars }`, or pre-rendered count string (`12 total`). */
function scanBlockMeta(meta) {
  if (!meta) return '';
  if (typeof meta === 'object' && meta != null && 'key' in meta) {
    return `<span class="aml-block-meta">${esc(t(meta.key, meta.vars))}</span>`;
  }
  const s = String(meta);
  if (/^\d/.test(s.trim())) return `<span class="aml-block-meta">${esc(s)}</span>`;
  return `<span class="aml-block-meta">${esc(t(s))}</span>`;
}

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

function termNodeFromTarget(node) {
  let el = node && node.nodeType === 1 ? node : node && node.parentElement;
  while (el) {
    if (el.classList && el.classList.contains('term')) return el;
    el = el.parentElement;
  }
  return null;
}

function setupTermTooltips() {
  document.addEventListener('mouseover', e => {
    const t = termNodeFromTarget(e.target);
    if (t) { showTermTip(t.dataset.term, t); return; }
    hideTermTip();
  });
  document.addEventListener('mouseleave', e => {
    if (termNodeFromTarget(e.target)) return;
    hideTermTip();
  });
  // touch support — tap to toggle, no scroll blocking
  document.addEventListener('click', e => {
    if (!window.matchMedia('(hover: none)').matches) return;
    const node = termNodeFromTarget(e.target);
    if (!node) {
      if (!e.target.closest?.('.term-tip')) hideTermTip();
      return;
    }
    const shown = node.dataset.tipShown;
    hideTermTip();
    node.dataset.tipShown = '';
    if (!shown) {
      showTermTip(node.dataset.term, node);
      node.dataset.tipShown = '1';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setupTermTooltips();
  initModuleNavStates();
});
