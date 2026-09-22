// ==================================
//  CONTRACT SCANNER PAGE
// ==================================
const contractInput = document.getElementById('contract-input');
const contractBtn   = document.getElementById('contract-scan-btn');
const contractErr   = document.getElementById('contract-err');
const contractRes   = document.getElementById('contract-result');
const contractEmpty = document.getElementById('contract-empty');

contractInput.addEventListener('keydown', e => { if (e.key==='Enter') contractScan(); });
contractBtn.addEventListener('click', contractScan);

function ctrBlock(titleHtml, bodyHtml, meta = '') {
  const metaHtml = scanBlockMeta(meta);
  const title = /<[^>]+>/.test(titleHtml) ? titleHtml : esc(t(titleHtml));
  return `<div class="aml-block">
    <div class="aml-block-head">
      <span class="aml-block-title">${title}</span>
      ${metaHtml}
    </div>
    <div class="aml-block-body">${bodyHtml}</div>
  </div>`;
}

function ctrPanel(titleHtml, rowsHtml, meta = '') {
  return ctrBlock(titleHtml, `<div class="aml-kv-list">${rowsHtml}</div>`, meta);
}

function ctrKvRow(label, valueHtml, last) {
  return `<div class="kv-row${last ? ' kv-row--last' : ''}">
    <span class="kv-label">${kvLabel(label)}</span>
    <span class="kv-val">${valueHtml}</span>
  </div>`;
}

function ctrHeadCard(name, addr, tagsHtml, fromCache = false) {
  const cacheTag = fromCache ? walletTag(t('session cache'), 'name') : '';
  return scanHeadCard({
    leadHtml: `<div style="flex:1;min-width:0">
      <div class="contract-head-name">${esc(name)}</div>
      <div class="wallet-head-addr contract-head-addr">${esc(addr)}</div>
    </div>`,
    actionsHtml: `
      ${scanActionBtn({ id: 'contract-refresh-btn', label: 'Refresh scan', icon: IC.refresh })}
      ${scanActionBtn({ id: 'contract-copy-btn', label: 'Copy', icon: IC.copy })}
      ${scanActionBtn({ id: 'contract-tronscan-btn', label: 'TronScan', icon: IC.external, href: `https://tronscan.org/#/contract/${addr}`, variant: 'ext' })}
    `,
    tagsHtml: `${tagsHtml || ''}${cacheTag}`,
  });
}

function bindContractActions(addr) {
  document.getElementById('contract-refresh-btn')?.addEventListener('click', () => contractScan({ force: true }));
  document.getElementById('contract-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(addr).then(() => {
      const btn = document.getElementById('contract-copy-btn');
      if (!btn) return;
      btn.classList.add('is-copied');
      btn.innerHTML = `${icSVG(IC.check, 14)}<span>${t('Copied')}</span>`;
      setTimeout(() => {
        btn.classList.remove('is-copied');
        btn.innerHTML = `${icSVG(IC.copy, 14)}<span>${t('Copy')}</span>`;
      }, 2000);
    });
  });
}

function ctrHeroStat(label, valueHtml, sub, cls) {
  return `<div class="an-stat">
    <div class="an-stat-label">${t(label)}</div>
    <div class="an-stat-value ${cls || 'is-neutral'}">${valueHtml}</div>
    ${sub ? `<div class="an-stat-sub">${sub}</div>` : ''}
  </div>`;
}

function ctrRiskClass(score) {
  if (score >= 70) return 'is-red';
  if (score >= 40) return 'is-amber';
  if (score >= 20) return 'is-amber';
  return 'is-green';
}

function ctrShieldIcon(riskScore, size) {
  return riskShieldIcon(riskScore, size, { className: 'risk-shield-icon contract-risk-icon' });
}

function ctrScoreLabel(score) {
  if (score >= 70) return t('Critical risk');
  if (score >= 40) return t('Elevated risk');
  if (score >= 20) return t('Moderate risk');
  return t('Low risk');
}

function ctrRiskRow(risk) {
  const tier = risk.lvl === 'danger' ? 'is-high' : risk.lvl === 'warn' ? 'is-med' : risk.lvl === 'info' ? 'is-low' : 'is-ok';
  const flagBadge = risk.lvl === 'danger' ? badge('b-red', t('Critical'))
    : risk.lvl === 'warn' ? badge('b-amber', t('Warning'))
    : risk.lvl === 'info' ? badge('b-cyan', t('Expected'))
    : badge('b-green', 'OK');
  return `<div class="contract-risk risk-row ${tier}">
    <div class="contract-risk-body">
      ${risk.cat ? `<div class="contract-risk-cat">${esc(t(risk.cat))}</div>` : ''}
      <div class="contract-risk-msg">${esc(t(risk.msg))}</div>
    </div>
    <div class="contract-risk-badge">${flagBadge}</div>
  </div>`;
}

function ctrRiskRows(risks) {
  if (!risks.length) return `<div class="aml-empty">${t('No findings')}</div>`;
  return `<div class="contract-risks">${risks.map(ctrRiskRow).join('')}</div>`;
}

let contractAbiLimit = 10;
let contractResult   = null;
let contractExtra    = null;
let contractLastAddr = '';
let contractFromCache = false;

const CONTRACT_CACHE_TTL = 12 * 60 * 1000;

function readContractSessionCache(addr) {
  return readSessionCache('contract', addr, {
    ttl: CONTRACT_CACHE_TTL,
    validate: (p) => p.addr === addr && p.result,
  });
}

function writeContractSessionCache(snapshot) {
  if (!snapshot?.addr) return;
  writeSessionCache('contract', snapshot.addr, snapshot);
}

function clearContractSessionCache(addr) {
  clearSessionCache('contract', addr);
}

function _n(n) { return (n||'').toLowerCase(); }

const OFFICIAL_CONTRACTS = {
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t': { symbol: 'USDT', name: 'Tether USD', tier: 'issuer', issuer: 'Tether' },
  'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8': { symbol: 'USDC', name: 'USD Coin', tier: 'issuer', issuer: 'Circle' },
  'TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4': { symbol: 'TUSD', name: 'TrueUSD', tier: 'issuer', issuer: 'TrustToken' },
  'TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT': { symbol: 'USDJ', name: 'JUST Stablecoin', tier: 'issuer', issuer: 'JUST' },
  'TNUC9Qb1rRpN8skWv9nHQLdGAWZWjUEYue': { symbol: 'WTRX', name: 'Wrapped TRX', tier: 'wrapped', issuer: 'TRON' },
  'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4': { symbol: 'BTT', name: 'BitTorrent', tier: 'native', issuer: 'BitTorrent Chain' },
  'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt': { symbol: 'WBTT', name: 'Wrapped BTT', tier: 'wrapped', issuer: 'BitTorrent' },
  'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S': { symbol: 'SUN', name: 'SUN Token', tier: 'defi', issuer: 'SUN.io' },
  'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9': { symbol: 'JST', name: 'JUST', tier: 'defi', issuer: 'JUST' },
  'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7': { symbol: 'WIN', name: 'WINkLink', tier: 'defi', issuer: 'WINk' },
  'TN3W4H6rK2ce4vX9YnFQHwKx8Vwhi53ZZZ': { symbol: 'NFT', name: 'APENFT', tier: 'defi', issuer: 'APENFT' },
};

const ISSUER_SYMBOLS = new Set(['USDT', 'USDC', 'TUSD', 'USDJ', 'USDD', 'USD1']);

function getOfficialContract(addr) {
  return OFFICIAL_CONTRACTS[addr] || null;
}

function resolveOfficialContract(addr, scanMeta, tokenRow, secToken) {
  const listed = getOfficialContract(addr);
  if (listed) return listed;

  const meta = scanMeta || {};
  const ti = meta.tokenInfo || {};
  const sym = (meta.blueTag || ti.tokenAbbr || tokenRow?.symbol || '').toUpperCase();
  const vip = !!(meta.vip || ti.vip || tokenRow?.vip || secToken?.is_vip);
  const trustedTag = !!(meta.blueTag || meta.publicTag || tokenRow?.level === '2' || ti.tokenLevel === '2');

  if (vip && trustedTag && sym) {
    let tier = 'defi';
    if (ISSUER_SYMBOLS.has(sym)) tier = 'issuer';
    else if (/^W/.test(sym) || sym === 'WTRX' || sym === 'WBTT') tier = 'wrapped';
    else if (sym === 'BTT' || sym === 'BTTC' || sym === 'TRX') tier = 'native';
    return {
      symbol: sym === 'BTTC' ? 'BTT' : sym,
      name: meta.name || ti.tokenName || tokenRow?.name || sym,
      tier,
      issuer: meta.blueTagUrl || meta.publicTag || tokenRow?.home_page || 'TRON ecosystem',
      auto: true,
    };
  }
  return null;
}

function fmtUsd(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  if (v >= 1) return '$' + v.toFixed(2);
  return '$' + v.toPrecision(3);
}

function fnNameMatches(name, patterns) {
  const n = _n(name);
  return patterns.some(p => typeof p === 'string' ? n.includes(p) : p.test(n));
}

function isComplianceBlacklistFn(name) {
  const n = _n(name);
  return /blacklist|blocklist|addblack|removeblack|isblack|banaddress|frozen|unfreeze|destroyblack|slashed|confiscate/.test(n);
}

function isSelfDestructFn(name) {
  const n = _n(name);
  if (/black|slashed|fee|fund|token/.test(n)) return false;
  return n === 'selfdestruct' || n === 'destroy' || n === 'kill' || n === 'suicide' || n.includes('selfdestruct');
}

function isPrivilegedWithdrawFn(name) {
  const n = _n(name);
  return n === 'withdraw' || n === 'withdrawall' || n.includes('draintoken') || n.includes('sweep');
}

function isClaimDrainFn(name) {
  const n = _n(name);
  if (n.includes('ownership') || n.includes('admin')) return false;
  return n === 'claim' || /^claim[a-z0-9]{0,16}$/.test(n) || n === 'airdropclaim' || n === 'collectreward';
}

function isMulticallBatchFn(name) {
  const n = _n(name);
  return n === 'multicall' || n.includes('batchcall') || n.includes('executebatch') || n === 'aggregate';
}

function detectContractStandard(abi) {
  const names = new Set(abi.filter(e=>e.type==='Function'||!e.type).map(e=>_n(e.name)));
  const is20 = ['transfer','balanceof','totalsupply','approve','transferfrom','allowance'].every(n=>names.has(n));
  if (is20) return 'TRC20';
  const is721 = ['ownerof','safetransferfrom(address,address,uint256)','tokenuri'].some(n=>names.has(n));
  if (is721) return 'TRC-721';
  if (['safetransferfrom(address,address,uint256,bytes)','urifromid'].some(n=>names.has(n))) return 'TRC-1155';
  return null;
}
