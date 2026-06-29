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

function ctrActionBtn({ id, label, icon, href, variant }) {
  const cls = `wallet-action-btn${variant ? ` wallet-action-btn--${variant}` : ''}`;
  const inner = `${icSVG(icon, 14)}<span>${esc(t(label))}</span>`;
  if (href) return `<a class="${cls}" id="${id}" href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`;
  return `<button type="button" class="${cls}" id="${id}">${inner}</button>`;
}

function ctrBlock(titleHtml, bodyHtml, meta = '') {
  const metaHtml = meta ? `<span class="aml-block-meta">${t(meta)}</span>` : '';
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

function ctrHeadCard(name, addr, tagsHtml) {
  return `<div class="aml-head-card contract-head-card">
    <div class="wallet-head-top">
      <div style="flex:1;min-width:0">
        <div class="contract-head-name">${esc(name)}</div>
        <div class="wallet-head-addr contract-head-addr">${esc(addr)}</div>
      </div>
      <div class="wallet-head-actions">
        ${ctrActionBtn({ id: 'contract-copy-btn', label: 'Copy', icon: IC.copy })}
        ${ctrActionBtn({ id: 'contract-tronscan-btn', label: 'TronScan', icon: IC.external, href: `https://tronscan.org/#/contract/${addr}`, variant: 'ext' })}
      </div>
    </div>
    ${tagsHtml ? `<div class="wallet-head-tags">${tagsHtml}</div>` : ''}
  </div>`;
}

function bindContractActions(addr) {
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
  const tier = risk.lvl === 'danger' ? 'is-high' : risk.lvl === 'warn' ? 'is-med' : risk.lvl === 'info' ? 'is-info' : 'is-ok';
  const flagBadge = risk.lvl === 'danger' ? badge('b-red', t('Critical'))
    : risk.lvl === 'warn' ? badge('b-amber', t('Warning'))
    : risk.lvl === 'info' ? badge('b-cyan', t('Expected'))
    : badge('b-green', 'OK');
  return `<div class="contract-risk ${tier}">
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

function analyzeContractAbi(abi) {
  const fns = abi.filter(e => e.type === 'Function' || !e.type);
  const names = fns.map(e => e.name || '');
  const has = (...patterns) => names.some(n => fnNameMatches(n, patterns));
  return {
    fns,
    hasAbi: abi.length > 0,
    hasMint: has('mint'),
    hasPause: has('pause', 'stop', 'unpause'),
    hasOwnerCtrl: has('transferownership', 'setowner', 'changeowner'),
    hasBlack: names.some(isComplianceBlacklistFn),
    hasDestroy: names.some(isSelfDestructFn),
    hasWithdraw: names.some(isPrivilegedWithdrawFn),
    hasFeeChange: has('setfee', 'settax', 'updatefee', 'setbuyfee', 'setsellfee'),
    hasHiddenMint: has('issue', 'generate'),
    hasRenounce: has('renounceownership'),
    hasFallback: abi.some(e => e.type === 'Fallback' || e.type === 'Receive'),
    hasUpgrade: has('upgrade', 'setimplementation', 'setlogic', 'upgradeto'),
    hasProxy: fns.length <= 3,
    hasCooldown: has('cooldown', 'timelock', 'setdelay'),
    hasMaxTx: has('maxtx', 'maxamount', 'setlimit', 'maxtransfer'),
    hasAntiWhale: has('maxwallet', 'maxholding', 'antiwhale'),
    hasSwapBack: has('swapback', 'swapandliquify', 'processfees'),
    hasAirdrop: has('airdrop', 'multisend', 'batchtransfer'),
    hasBurnAll: has(/^burnall$/, 'burnfrom'),
    hasClaimDrain: names.some(isClaimDrainFn),
    hasMulticallBatch: names.some(isMulticallBatchFn),
    hasOwnerChange: has('changeowner', 'changeadmin', 'setadmin'),
    hasTooManyFns: fns.length > 40,
    hasNoEvents: !abi.some(e => e.type === 'Event'),
    readFns: fns.filter(e => e.stateMutability === 'view' || e.stateMutability === 'pure'),
    writeFns: fns.filter(e => e.stateMutability !== 'view' && e.stateMutability !== 'pure' && e.stateMutability !== 'payable'),
    payableFns: fns.filter(e => e.stateMutability === 'payable'),
  };
}

function buildContractRisks(flags, ctx) {
  const risks = [];
  const { official, verified, hasAbi, standard, secToken, fraudTags } = ctx;

  if (!hasAbi) risks.push({ lvl: 'danger', cat: 'Transparency', msg: 'No ABI — bytecode-only contract. Source is hidden, cannot audit logic.' });
  if (flags.hasDestroy) risks.push({ lvl: 'danger', cat: 'Rug risk', msg: 'selfdestruct/destroy detected — owner can permanently kill the contract and lock all funds.' });
  if (flags.hasBlack && !official) risks.push({ lvl: 'danger', cat: 'Censorship', msg: 'Blacklist function found — owner can silently block any address from transacting.' });
  if (flags.hasBlack && official?.tier === 'issuer') risks.push({ lvl: 'info', cat: 'Compliance', msg: 'Issuer compliance controls (blacklist/freeze) — expected on regulated stablecoins, not a scam indicator.' });
  if (flags.hasUpgrade && official?.tier === 'issuer') {
    risks.push({ lvl: 'info', cat: 'Proxy', msg: 'Upgradeable fiat-token proxy — standard Circle/Tether deployment pattern on TRON, not a scam indicator.' });
  } else if (flags.hasUpgrade && !official) {
    risks.push({ lvl: 'danger', cat: 'Proxy', msg: 'Upgradeable proxy pattern — owner can silently replace contract logic at any time.' });
  }
  if (flags.hasWithdraw && !flags.hasRenounce && !official) risks.push({ lvl: 'danger', cat: 'Fund drain', msg: 'withdraw() with active ownership — privileged drain function without renounced control.' });
  if (flags.hasClaimDrain && flags.hasMulticallBatch && !standard) {
    risks.push({ lvl: 'danger', cat: 'Claim drain', msg: 'claim() + multicall() on a non-standard contract — may batch-split your token balance to attacker wallets.' });
  } else if (flags.hasClaimDrain && !standard && !official) {
    risks.push({ lvl: 'danger', cat: 'Claim trap', msg: 'claim() on a non-standard contract — may pull approved tokens or TRX from your wallet to the owner.' });
  }
  if (flags.hasClaimDrain && flags.hasMulticallBatch && flags.hasOwnerChange) {
    risks.push({ lvl: 'danger', cat: 'Known scam', msg: 'claim + multicall + owner change — classic asset-split drain. Do not approve or call any function.' });
  }
  if (!verified && hasAbi && !official) risks.push({ lvl: 'warn', cat: 'Verification', msg: 'Source code not verified on TronScan — review bytecode-derived ABI carefully.' });
  if (official && !verified) risks.push({ lvl: 'info', cat: 'Verification', msg: 'Listed official TRON contract — TronScan source flag may differ, but contract identity is confirmed.' });
  if ((flags.hasMint || flags.hasHiddenMint) && !(official && standard === 'TRC20' && official.tier === 'issuer')) {
    risks.push({ lvl: 'warn', cat: 'Supply', msg: 'Mint/issue function present — owner can inflate token supply at any time.' });
  }
  if (flags.hasPause && !(official?.tier === 'issuer')) risks.push({ lvl: 'warn', cat: 'Freeze', msg: 'pause()/stop() present — owner can freeze all transfers without consent.' });
  if (flags.hasPause && official?.tier === 'issuer') risks.push({ lvl: 'info', cat: 'Compliance', msg: 'Pausable transfers — standard issuer emergency control on stablecoins.' });
  if (flags.hasOwnerCtrl && !official) risks.push({ lvl: 'warn', cat: 'Ownership', msg: 'transferOwnership() present — control can be transferred silently.' });
  if (flags.hasOwnerCtrl && official) risks.push({ lvl: 'info', cat: 'Governance', msg: 'Owner/multisig rotation — normal for established protocol or issuer contracts.' });
  if (flags.hasFeeChange && !official) risks.push({ lvl: 'warn', cat: 'Fees', msg: 'setFee/tax function found — owner can change fees/taxes at will.' });
  if (flags.hasFallback && !official) risks.push({ lvl: 'warn', cat: 'TRX sink', msg: 'Fallback/receive function — contract can accept arbitrary TRX, may be used as honeypot.' });
  if (flags.hasProxy && hasAbi && !standard && !official) risks.push({ lvl: 'warn', cat: 'Proxy hint', msg: 'Very few ABI entries — possible minimal proxy. Real logic may be elsewhere.' });
  if (flags.hasProxy && hasAbi && !standard && official?.tier === 'issuer') {
    risks.push({ lvl: 'info', cat: 'Proxy', msg: 'Proxy contract surface — token logic is behind Circle/Tether fiat-token implementation.' });
  }
  if (flags.hasCooldown) risks.push({ lvl: 'warn', cat: 'Timelock', msg: 'Cooldown/timelock function found — transactions may be delayed or blocked at owner discretion.' });
  if (flags.hasMaxTx) risks.push({ lvl: 'warn', cat: 'Tx limit', msg: 'Max transaction amount function present — owner can cap how much you can transfer at once.' });
  if (flags.hasAntiWhale) risks.push({ lvl: 'warn', cat: 'Whale guard', msg: 'Max wallet/holding limit detected — owner can restrict maximum balance per address.' });
  if (flags.hasSwapBack) risks.push({ lvl: 'warn', cat: 'Swap-router', msg: 'Swap-back/auto-liquidity function — contract may route trades through non-standard paths.' });
  if (flags.hasAirdrop && !official) risks.push({ lvl: 'warn', cat: 'Batch ops', msg: 'Airdrop/batch transfer present — tokens may be distributed without recipient consent.' });
  if (flags.hasBurnAll && !official) risks.push({ lvl: 'warn', cat: 'Burn risk', msg: 'batch burn function — owner can destroy tokens from any address if not restricted.' });
  if (flags.hasRenounce) risks.push({ lvl: 'ok', cat: 'Good sign', msg: 'renounceOwnership() present — owner CAN give up control (check if already called).' });

  if (secToken?.token_level === '3') risks.push({ lvl: 'danger', cat: 'TronScan', msg: 'TronScan marks this token as suspicious — treat as high fraud risk.' });
  if (fraudTags?.length) risks.push({ lvl: 'danger', cat: 'TronScan tag', msg: t('Security tag: {tag}', { tag: fraudTags[0] }) });
  if (secToken?.increase_total_supply === 1 && !(official?.tier === 'issuer')) {
    risks.push({ lvl: 'warn', cat: 'Supply', msg: 'TronScan reports mintable supply — owner may inflate token supply.' });
  }
  if (secToken?.black_list_type === 1 && !official) {
    risks.push({ lvl: 'warn', cat: 'Censorship', msg: 'TronScan reports a blacklist function on this token contract.' });
  }

  if (flags.hasTooManyFns && !official) risks.push({ lvl: 'warn', cat: 'Complexity', msg: t('{n} functions — unusually complex contract, higher attack surface.', { n: flags.fns.length }) });
  if (flags.hasNoEvents && hasAbi && !standard) risks.push({ lvl: 'warn', cat: 'Opacity', msg: 'No events defined — transfers and key actions may not be traceable on-chain.' });
  if (official) risks.unshift({ lvl: 'ok', cat: 'Official', msg: t('Recognized {issuer} contract ({symbol}) on TRON mainnet.', { issuer: official.issuer, symbol: official.symbol }) });
  if (risks.filter(r => !['ok', 'info'].includes(r.lvl)).length === 0) {
    risks.push({ lvl: 'ok', cat: 'Clean', msg: 'No critical risk patterns detected for this contract profile.' });
  }
  return risks;
}

function computeContractScore(risks, ctx) {
  let score = 0;
  risks.forEach(r => {
    if (r.lvl === 'danger') score += 25;
    else if (r.lvl === 'warn') score += 10;
  });
  if (!ctx.verified && ctx.hasAbi && !ctx.official) score += 10;
  score = Math.min(score, 100);
  const fraud = risks.some(r => r.lvl === 'danger' && (r.cat === 'TronScan' || r.cat === 'TronScan tag'));
  const claimScam = risks.some(r => r.lvl === 'danger' && (r.cat === 'Claim drain' || r.cat === 'Claim trap' || r.cat === 'Known scam'));
  if (claimScam) score = Math.max(score, 85);
  if (ctx.official?.tier === 'issuer' && !fraud && !claimScam) score = Math.min(score, 10);
  else if (ctx.official && !fraud && !claimScam) score = Math.min(score, 15);
  if (ctx.intel?.holders != null && ctx.intel.holders > 100000 && ctx.official) score = Math.min(score, 12);
  return score;
}

function isContractVerified(contractData, infoRes, scanMeta, official) {
  const vs = scanMeta?.verify_status ?? infoRes?.info?.verify_status ?? contractData?.verify_status;
  if (vs === 2 || vs === 1 || vs === 'Verified' || vs === 'VERIFIED') return true;
  if (String(vs).toLowerCase() === 'verified') return true;
  if (official) return true;
  if (scanMeta?.vip && (scanMeta?.blueTag || scanMeta?.tokenInfo?.vip)) return true;
  return !!(
    scanMeta?.verifyStatus === 1 ||
    scanMeta?.contract_verify === 1 ||
    infoRes?.contract_state?.verify_status === 'VERIFIED' ||
    (infoRes?.info?.compiler_version && scanMeta?.license)
  );
}

async function fetchContractIntel(addr, standard) {
  const [secToken, tokenMeta, tagAcc] = await Promise.all([
    scanGet('/security/token/data', { address: addr }).catch(() => null),
    standard === 'TRC20'
      ? scanGet('/token_trc20', { contract: addr, showAll: 1 }).catch(() => scanGet('/token_trc20', { address: addr }).catch(() => null))
      : Promise.resolve(null),
    scanGet('/account/tag', { address: addr }).catch(() => null),
  ]);

  const tokenRow = tokenMeta?.trc20_tokens?.[0] || tokenMeta?.data?.[0] || tokenMeta?.token || tokenMeta || {};
  const tags = [];
  const rawTags = Array.isArray(tagAcc) ? tagAcc : (tagAcc?.data || (tagAcc?.tagName || tagAcc?.tag ? [tagAcc] : []));
  rawTags.forEach(t => {
    const tagName = t.tagName || t.tag || t.label || '';
    if (tagName && /scam|phish|fraud|sanction|malicious|hack|exploit|rug/i.test(tagName) && !/blacklist capability/i.test(tagName)) {
      tags.push(tagName);
    }
  });

  const market = tokenRow.market_info || {};
  const liquidityUsd = market.liquidity ?? tokenRow.liquidity24h ?? secToken?.sun_liquidity ?? null;
  const volumeUsd = tokenRow.volume24h ?? market.volume24hInUsd ?? null;
  const volumeTrx = market.volume24hInTrx ?? null;

  return {
    secToken,
    fraudTags: tags,
    tokenRow,
    holders: tokenRow.holders_count ?? tokenRow.holder_count ?? tokenRow.nrOfTokenHolders ?? tokenRow.holders ?? null,
    transfers: tokenRow.transfer_num ?? tokenRow.transfer_count ?? tokenRow.transferCount ?? null,
    supply: tokenRow.total_supply_with_decimals ?? tokenRow.total_supply ?? tokenRow.totalSupply ?? tokenRow.supply ?? null,
    tokenSymbol: tokenRow.tokenAbbr || tokenRow.symbol || tokenRow.token_abbr || null,
    tokenName: tokenRow.tokenName || tokenRow.name || null,
    liquidityUsd,
    volumeUsd,
    volumeTrx,
    marketCapUsd: tokenRow.market_cap_usd ?? market.market_cap_usd ?? null,
    priceUsd: market.priceInUsd ?? tokenRow.price ?? null,
    isToken: standard === 'TRC20' || !!(tokenRow.contract_address || tokenRow.symbol),
    compiler: null,
  };
}

async function contractScan() {
  const addr = contractInput.value.trim();
  setError(contractErr, '');
  contractAbiLimit = 10;
  contractResult = null;
  contractExtra = null;
  if (!addr) { flashInput(contractInput); showToast(t('Enter a contract address')); return; }
  if (!isValidTron(addr)) { flashInput(contractInput); showToast(t('Invalid TRON address — must start with T, 34 chars.')); return; }
  contractRes.innerHTML = '';
  contractEmpty.style.display = 'none';
  spinBtn(contractBtn, true);
  contractRes.innerHTML = SK.contract();

  try {
    const body = { value: addr, visible: true };
    const [contractData, infoRes, scanWrap] = await Promise.all([
      gridPost('/wallet/getcontract', body),
      gridPost('/wallet/getcontractinfo', body).catch(() => ({})),
      scanGet('/contract', { contract: addr }).catch(() => ({})),
    ]);

    if (!contractData || contractData.Error || (!contractData.bytecode && !contractData.abi)) {
      contractRes.innerHTML = '';
      setError(contractErr, t('Not a contract address, or contract not deployed on TRON mainnet.'));
      spinBtn(contractBtn, false);
      return;
    }

    const scanMeta = scanWrap?.data?.[0] || {};
    const abi = contractData.abi?.entrys || [];
    const hasAbi = abi.length > 0;
    const standard = hasAbi ? detectContractStandard(abi) : null;
    const flags = analyzeContractAbi(abi);
    const intel = await fetchContractIntel(addr, standard);
    intel.compiler = infoRes?.info?.compiler_version || scanMeta.compiler || null;
    const official = resolveOfficialContract(addr, scanMeta, intel.tokenRow, intel.secToken);
    const verified = isContractVerified(contractData, infoRes, scanMeta, official);

    const ctx = {
      official,
      verified,
      hasAbi,
      standard,
      secToken: intel.secToken,
      fraudTags: intel.fraudTags,
      intel,
    };
    const risks = buildContractRisks(flags, ctx);
    const score = computeContractScore(risks, ctx);
    const dangerCount = risks.filter(r => r.lvl === 'danger').length;
    const warnCount = risks.filter(r => r.lvl === 'warn').length;
    const infoCount = risks.filter(r => r.lvl === 'info').length;

    const creator = scanMeta.creator_address || scanMeta.ownerAddress || infoRes?.info?.origin_address || contractData.origin_address || '—';
    const created = scanMeta.date_created
      ? new Date(scanMeta.date_created).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    const createdTs = scanMeta.date_created ? new Date(scanMeta.date_created).getTime() : null;
    const ageDays = createdTs ? Math.round((Date.now() - createdTs) / 86400000) : null;
    const txCount = scanMeta.call_count ?? scanMeta.callCount ?? scanMeta.transaction_count ?? '—';

    let contractBalance = null;
    try {
      const balRes = await gridGet(`/v1/accounts/${addr}`);
      if (balRes.data?.[0]) contractBalance = (balRes.data[0].balance || 0) / 1_000_000;
    } catch (_) {}

    contractExtra = {
      standard,
      readFns: flags.readFns.length,
      writeFns: flags.writeFns.length,
      payableFns: flags.payableFns.length,
      ageDays,
      intel,
    };

    contractResult = {
      name: official?.name || contractData.name || scanMeta.name || intel.tokenName || addr.slice(0, 8) + '?',
      verified,
      hasAbi,
      funcCount: abi.length,
      risks,
      score,
      abi,
      creator,
      created,
      txCount,
      contractBalance,
      dangerCount,
      warnCount,
      infoCount,
      addr,
      standard,
      official,
    };
    renderContract();
  } catch (e) {
    setError(contractErr, userFriendlyFetchError(e));
  }
  spinBtn(contractBtn, false);
}

function renderContract() {
  const r = contractResult;
  if (!r) return;

  const vCls = ctrRiskClass(r.score);
  const standardLabel = r.standard ? badge('b-cyan', r.standard) : badge('b-ghost', t('Custom'));
  const ageWarn = contractExtra?.ageDays !== null && contractExtra?.ageDays < 7;

  const headTags = [
    r.official ? badge('b-green', t('Official {symbol}', { symbol: r.official.symbol })) : '',
    standardLabel,
    r.verified ? badge('b-green', t('Verified')) : badge('b-amber', t('Unverified')),
    r.dangerCount > 0 ? badge('b-red', `${r.dangerCount} critical`) :
    r.warnCount > 0 ? badge('b-amber', `${r.warnCount} warnings`) : badge('b-green', t('Clean')),
  ].filter(Boolean).join('');

  const heroHtml = `
    <div class="an-stat contract-risk-stat">
      <div class="an-stat-label">Risk score</div>
      <div class="contract-risk-body">
        ${ctrShieldIcon(r.score, 40)}
        <div class="contract-risk-text">
          <div class="an-stat-value ${vCls}">${r.score}<span class="aml-score-unit">/100</span></div>
          <div class="an-stat-sub">${ctrScoreLabel(r.score)}</div>
        </div>
      </div>
    </div>
    ${ctrHeroStat(t('Critical'), String(r.dangerCount), r.dangerCount ? t('dangerous patterns') : t('none found'), r.dangerCount ? 'is-red' : 'is-green')}
    ${ctrHeroStat(t('Warnings'), String(r.warnCount), r.warnCount ? t('review recommended') : t('none found'), r.warnCount ? 'is-amber' : 'is-green')}
    ${ctrHeroStat('ABI entries', String(r.funcCount), contractExtra ? `${contractExtra.readFns} read / ${contractExtra.writeFns} write` : '', 'is-info')}`;

  let assessmentHtml;
  const claimScam = r.risks.some(x => x.lvl === 'danger' && (x.cat === 'Known scam' || x.cat === 'Claim drain' || x.cat === 'Claim trap'));
  if (claimScam) {
    assessmentHtml = amlAlertInline('red', `<strong>${t('Scam contract detected')}</strong> — ${t('claim/multicall drain pattern. Do not approve tokens or call any function.')}`);
  } else if (r.official && r.dangerCount === 0) {
    assessmentHtml = amlAlertInline('green', `<strong>${t('Recognized official contract')}</strong> — ${t('Compliance controls on issuer tokens are expected and do not indicate a scam.')}`);
  } else if (r.official && r.dangerCount > 0 && !claimScam) {
    assessmentHtml = amlAlertInline('amber', `<strong>${t('Official contract')}</strong> — ${t('Some ABI flags look sensitive but match known issuer/proxy patterns. Review details below.')}`);
  } else if (r.dangerCount > 0) {
    assessmentHtml = amlAlertInline('red', `<strong>${t('Critical findings')}</strong> — ${r.dangerCount} ${t('dangerous pattern')}${r.dangerCount > 1 ? 's' : ''} ${t('detected. Do not interact without review.')}`);
  } else if (r.warnCount > 0) {
    assessmentHtml = amlAlertInline('amber', `<strong>${t('Warnings present')}</strong> — ${r.warnCount} ${t('pattern')}${r.warnCount > 1 ? 's' : ''} ${t('require manual review.')}`);
  } else {
    assessmentHtml = amlAlertInline('green', `<strong>${t('No critical patterns')}</strong> — ${t('ABI scan found no major red flags.')}`);
  }

  const scoreRows = r.score > 0 ? `
    ${ctrKvRow(`${tt('danger')} ${t('flags')}`, `<span class="mono">${r.dangerCount > 0 ? '+' + r.dangerCount * 25 : '0'}</span>`)}
    ${ctrKvRow(`${tt('warnings')} ${t('flags')}`, `<span class="mono">${r.warnCount > 0 ? '+' + r.warnCount * 10 : '0'}</span>`)}
    ${!r.verified && r.hasAbi && !r.official ? ctrKvRow(tt('unverified'), '<span class="mono">+10</span>') : ''}
    ${ctrKvRow(tt('riskScore'), `<span class="an-stat-value ${vCls}">${r.score}<span class="aml-score-unit">/100</span></span>`, true)}
  ` : ctrKvRow(tt('riskScore'), `<span class="mono is-green">0<span class="aml-score-unit">/100</span></span>`, true);

  const intel = contractExtra?.intel || {};
  const isToken = r.standard === 'TRC20' || intel.isToken;
  const intelHtml = ctrPanel(t('On-chain intelligence'), `
    ${ctrKvRow(t('Token'), intel.tokenSymbol ? esc(intel.tokenSymbol) : '—')}
    ${intel.holders != null ? ctrKvRow(tt('holders'), fmtNum(intel.holders)) : ''}
    ${intel.transfers != null ? ctrKvRow(t('Transfers'), fmtNum(intel.transfers)) : ''}
    ${isToken && intel.liquidityUsd != null ? ctrKvRow(tt('liquidity'), `<span class="is-info">${fmtUsd(intel.liquidityUsd)}</span>`) : ''}
    ${isToken && intel.volumeUsd != null ? ctrKvRow(t('24h volume (USD)'), fmtUsd(intel.volumeUsd)) : ''}
    ${isToken && intel.volumeTrx != null ? ctrKvRow(t('24h volume (TRX)'), `${fmtNum(intel.volumeTrx)} TRX`) : ''}
    ${intel.marketCapUsd ? ctrKvRow(t('Market cap'), fmtUsd(intel.marketCapUsd)) : ''}
    ${intel.supply != null ? ctrKvRow(t('Total supply'), esc(String(intel.supply))) : ''}
    ${intel.compiler ? ctrKvRow(t('Compiler'), esc(intel.compiler)) : ''}
    ${intel.secToken?.token_level != null ? ctrKvRow(t('TronScan token level'), badge(intel.secToken.token_level === '3' ? 'b-red' : intel.secToken.token_level === '2' ? 'b-amber' : 'b-green', String(intel.secToken.token_level))) : ''}
    ${intel.fraudTags?.length ? ctrKvRow(t('Security tags'), esc(intel.fraudTags.join(' · ')), true) : ctrKvRow(t('Security tags'), `<span class="kv-muted">${t('None')}</span>`, true)}
  `, t('TronScan + token metadata'));

  const infoHtml = ctrPanel(t('Contract info'), `
    ${ctrKvRow(t('Creator'), r.creator !== '—'
      ? `<a class="a-link a-link-inline" href="https://tronscan.org/#/address/${esc(r.creator)}" target="_blank" rel="noopener"><span>${esc(addrLabel(r.creator))}</span>${icSVG(IC.link, 9)}</a>`
      : `<span class="kv-muted">${t('Unknown')}</span>`)}
    ${ctrKvRow(t('Deployed'), `${esc(r.created)}${ageWarn ? ' <span class="badge b-amber">&lt;7d</span>' : ''}`)}
    ${ctrKvRow(t('Interactions'), r.txCount !== '—' ? fmtNum(r.txCount) : '—')}
    ${ctrKvRow(ttLabel('functions'), `${contractExtra ? contractExtra.readFns : '—'} read · ${contractExtra ? contractExtra.writeFns : '—'} write · ${contractExtra ? contractExtra.payableFns : '—'} ${ttLabel('payable')}`)}
    ${r.contractBalance != null ? ctrKvRow(t('Balance'), `<span class="is-info">${r.contractBalance.toFixed(2)} TRX</span>`, true) : ctrKvRow(t('Balance'), '<span class="kv-muted">—</span>', true)}
  `);

  function fnRisk(name) {
    const n = _n(name);
    if (isClaimDrainFn(name) && !r.standard) return 'danger';
    if (isMulticallBatchFn(name) && !r.standard) return 'danger';
    if (r.official && isComplianceBlacklistFn(name)) return 'ok';
    if (isSelfDestructFn(name)) return 'danger';
    if (n.includes('mint') || (/burn/.test(n) && !/black/.test(n)) || n.includes('pause') || n.includes('kill')) return 'danger';
    if (isPrivilegedWithdrawFn(name) && !r.official) return 'danger';
    if (n.includes('owner') || n.includes('admin') || n.includes('set') || n.includes('fee') || n.includes('tax') || n.includes('cooldown') || n.includes('limit')) {
      return r.official ? 'ok' : 'warn';
    }
    if (n.includes('upgrade') && r.official?.tier === 'issuer') return 'ok';
    if (n.includes('upgrade')) return r.official ? 'ok' : 'warn';
    return 'ok';
  }

  const abiFns = r.abi.slice(0, contractAbiLimit).map(fn => {
    const rf = fnRisk(fn.name);
    return `<tr>
      <td class="mono ctr-fn-name ctr-fn-${rf}">${esc(fn.name || '(unnamed)')}</td>
      <td>${badge('b-cyan', fn.type || 'function')}</td>
      <td class="mono kv-muted">${esc(fn.stateMutability || '—')}</td>
      <td>${rf === 'danger' ? badge('b-red', t('High')) : rf === 'warn' ? badge('b-amber', t('Med')) : badge('b-green', t('Low'))}</td>
    </tr>`;
  }).join('');

  const abiHtml = r.abi.length > 0 ? ctrBlock(
    `Functions <span>· ${r.funcCount}</span>`,
    `<div class="contract-table-wrap">
      <table class="data-table contract-table">
        <thead><tr><th>Name</th><th>Type</th><th>${tt('mutability')}</th><th>Risk</th></tr></thead>
        <tbody>${abiFns}</tbody>
      </table>
      ${r.abi.length > contractAbiLimit ? `
      <div class="contract-table-foot">
        <span class="contract-table-foot-meta kv-muted">Showing ${contractAbiLimit} of ${r.abi.length}</span>
        <button type="button" class="wallet-load-more-btn" id="show-more-abi">${icSVG(IC.arrowDown, 14)}<span>${t('Show more')}</span></button>
      </div>` : ''}
    </div>`,
    `${contractExtra ? `${contractExtra.readFns} read` : ''}`
  ) : '';

  contractRes.innerHTML = `
    <div class="contract-scan">
      ${ctrHeadCard(r.name, r.addr, headTags)}
      <div class="an-stat-grid an-stat-grid--4 contract-hero-grid">${heroHtml}</div>
      <div class="contract-assessment">${assessmentHtml}</div>
      <div class="aml-grid-2">
        ${ctrPanel(t('Score breakdown'), scoreRows)}
        ${infoHtml}
      </div>
      ${intelHtml}
      ${ctrBlock(`Risk findings <span>· ${r.risks.length}</span>`, ctrRiskRows(r.risks))}
      ${abiHtml}
      <p class="aml-disclaimer">ABI pattern scan — does not replace manual audit. Verify source code and permissions before interacting.</p>
    </div>`;

  bindContractActions(r.addr);

  document.getElementById('show-more-abi')?.addEventListener('click', () => {
    contractAbiLimit += 20;
    renderContract();
  });
}

function resetContractScanCache() {
  contractResult = null;
  contractExtra = null;
  contractAbiLimit = 10;
}
