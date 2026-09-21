// ==================================
//  TX DECODER PAGE
// ==================================

const txInput  = document.getElementById('tx-input');
const txBtn    = document.getElementById('tx-decode-btn');
const txErr    = document.getElementById('tx-err');
const txRes    = document.getElementById('tx-result');
const txEmpty  = document.getElementById('tx-empty');

let txLastHash = '';
let txFromCache = false;

const TX_CACHE_TTL = 12 * 60 * 1000;

function readTxSessionCache(hash) {
  return readSessionCache('tx', hash, {
    ttl: TX_CACHE_TTL,
    validate: (p) => p.hash === hash,
    allowHtml: true,
  });
}

function writeTxSessionCache(snapshot) {
  if (!snapshot?.hash) return;
  writeSessionCache('tx', snapshot.hash, { hash: snapshot.hash, html: snapshot.html });
}

function clearTxSessionCache(hash) {
  clearSessionCache('tx', hash);
}

txInput.addEventListener('keydown', e => { if (e.key === 'Enter') txDecode(); });
txBtn.addEventListener('click', () => txDecode());

function txActionBtn(opts) {
  return scanActionBtn(opts);
}

function txBlock(titleHtml, bodyHtml, meta = '') {
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

function txPanel(titleHtml, rowsHtml, meta = '') {
  return txBlock(titleHtml, `<div class="aml-kv-list">${rowsHtml}</div>`, meta);
}

function txKvRow(label, valueHtml, last) {
  return `<div class="kv-row${last ? ' kv-row--last' : ''}">
    <span class="kv-label">${kvLabel(label)}</span>
    <span class="kv-val">${valueHtml}</span>
  </div>`;
}

function txHeadCard(titleHtml, hash, tagsHtml, fromCache = false) {
  const cacheTag = fromCache ? walletTag(t('session cache'), 'name') : '';
  return scanHeadCard({
    leadHtml: `<div style="flex:1;min-width:0">
      <div class="tx-head-title">${titleHtml}</div>
      <div class="wallet-head-addr tx-head-hash">${esc(hash)}</div>
    </div>`,
    actionsHtml: `
      ${scanActionBtn({ id: 'tx-refresh-btn', label: 'Refresh scan', icon: IC.refresh })}
      ${scanActionBtn({ id: 'tx-copy-btn', label: 'Copy', icon: IC.copy })}
      ${scanActionBtn({ id: 'tx-tronscan-btn', label: 'TronScan', icon: IC.external, href: `https://tronscan.org/#/transaction/${hash}`, variant: 'ext' })}
    `,
    tagsHtml: `${tagsHtml || ''}${cacheTag}`,
  });
}

function bindTxActions(hash) {
  document.getElementById('tx-refresh-btn')?.addEventListener('click', () => txDecode({ force: true }));
  document.getElementById('tx-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(hash).then(() => {
      const btn = document.getElementById('tx-copy-btn');
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

function txHeroStat(label, valueHtml, sub, cls) {
  return `<div class="an-stat">
    <div class="an-stat-label">${kvLabel(label)}</div>
    <div class="an-stat-value ${cls || 'is-neutral'}">${valueHtml}</div>
    ${sub ? `<div class="an-stat-sub">${sub}</div>` : ''}
  </div>`;
}

function txRiskClass(risk) {
  if (risk === 'high') return 'is-red';
  if (risk === 'med') return 'is-amber';
  if (risk === 'low') return 'is-green';
  return 'is-neutral';
}

function txSignalRow(alert) {
  const tier = alert.lvl === 'red' ? 'is-high' : 'is-med';
  const flagBadge = alert.lvl === 'red' ? badge('b-red', t('Critical')) : badge('b-amber', t('Warning'));
  return `<div class="tx-signal risk-row ${tier}">
    <div class="tx-signal-body">${alert.msg}</div>
    <div class="tx-signal-badge">${flagBadge}</div>
  </div>`;
}

function txDetailVal(d) {
  if (d.html) return d.valueHtml || d.value || '';
  if (d.link) {
    return `<a class="a-link mono kv-link" href="https://tronscan.org/#/address/${esc(d.value)}" target="_blank" rel="noopener"><span>${esc(d.value)}</span>${icSVG(IC.link, 9)}</a>`;
  }
  return `<span class="${d.mono ? 'mono' : ''}">${esc(d.value)}</span>`;
}

// Pre-fill from ?tx=?
(function () {
  const h = new URLSearchParams(location.search).get('tx');
  if (h) { txInput.value = h; txDecode(); }
})();

// -- Known 4-byte selectors -------------------------------------------
const SELECTORS = {
  'a9059cbb': { name: 'transfer',                 desc: 'Send tokens to an address',            risk: 'low'  },
  '095ea7b3': { name: 'approve',                  desc: 'Grant a spender allowance over tokens', risk: 'high' },
  '23b872dd': { name: 'transferFrom',             desc: 'Move tokens on behalf of another wallet', risk: 'med' },
  'a22cb465': { name: 'setApprovalForAll',        desc: 'Grant full NFT collection control to spender', risk: 'high' },
  '42842e0e': { name: 'safeTransferFrom',         desc: 'Transfer NFT ownership safely',        risk: 'low'  },
  '70a08231': { name: 'balanceOf',                desc: 'Read token balance (read-only)',        risk: 'none' },
  '18160ddd': { name: 'totalSupply',              desc: 'Read total token supply (read-only)',   risk: 'none' },
  'dd62ed3e': { name: 'allowance',                desc: 'Check spending allowance (read-only)', risk: 'none' },
  '40c10f19': { name: 'mint',                     desc: 'Mint new tokens — inflates supply',    risk: 'high' },
  '42966c68': { name: 'burn',                     desc: 'Burn / destroy tokens',                risk: 'med'  },
  '8456cb59': { name: 'pause',                    desc: 'Freeze all token transfers',           risk: 'high' },
  '3f4ba83a': { name: 'unpause',                  desc: 'Resume token transfers',               risk: 'med'  },
  'f2fde38b': { name: 'transferOwnership',        desc: 'Transfer contract ownership to new address', risk: 'high' },
  '715018a6': { name: 'renounceOwnership',        desc: 'Permanently give up contract ownership', risk: 'med' },
  'e8a3d485': { name: 'contractURI',              desc: 'Read contract metadata URI (read-only)', risk: 'none' },
  'c87b56dd': { name: 'tokenURI',                 desc: 'Read NFT token URI (read-only)',       risk: 'none' },
  '4e71d92d': { name: 'claim',                    desc: 'Claim rewards or tokens from contract', risk: 'low'  },
  'aad3ec96': { name: 'claim (split %)',          desc: 'Claim with percentage split — common drain pattern', risk: 'high' },
  'b6b55f25': { name: 'deposit',                  desc: 'Deposit funds into contract',          risk: 'med'  },
  '2e1a7d4d': { name: 'withdraw',                 desc: 'Withdraw funds from contract',         risk: 'med'  },
  'e9fad8ee': { name: 'exit',                     desc: 'Withdraw all funds and stop staking',  risk: 'med'  },
  'a694fc3a': { name: 'stake',                    desc: 'Stake tokens in contract',             risk: 'med'  },
  '2525c5e3': { name: 'unstake',                  desc: 'Unstake tokens from contract',         risk: 'low'  },
  '441a3e70': { name: 'withdraw (idx,amt)',        desc: 'Withdraw by pool index and amount',    risk: 'med'  },
  'e2bbb158': { name: 'deposit (pid,amt)',         desc: 'Deposit into specific pool',           risk: 'med'  },
  '38ed1739': { name: 'swapExactTokensForTokens', desc: 'DEX swap: exact input > tokens',       risk: 'low'  },
  '8803dbee': { name: 'swapTokensForExactTokens', desc: 'DEX swap: tokens > exact output',      risk: 'low'  },
  '7ff36ab5': { name: 'swapExactETHForTokens',    desc: 'DEX swap: exact TRX > tokens',         risk: 'low'  },
  '18cbafe5': { name: 'swapExactTokensForETH',    desc: 'DEX swap: tokens > TRX',               risk: 'low'  },
  'fb3bdb41': { name: 'swapETHForExactTokens',    desc: 'DEX swap: TRX > exact tokens',         risk: 'low'  },
  'e8e33700': { name: 'addLiquidity',             desc: 'Add liquidity to DEX pool',            risk: 'low'  },
  'baa2abde': { name: 'removeLiquidity',          desc: 'Remove liquidity from DEX pool',       risk: 'low'  },
  'f305d719': { name: 'addLiquidityETH',          desc: 'Add TRX + token liquidity',            risk: 'low'  },
  '39509351': { name: 'increaseAllowance',        desc: 'Increase token spending allowance',    risk: 'high' },
  'd73dd623': { name: 'increaseApproval',         desc: 'Increase token spending approval (USDT)', risk: 'high' },
  '66188463': { name: 'decreaseApproval',         desc: 'Decrease token spending approval (USDT)', risk: 'low'  },
  'a457c2d7': { name: 'decreaseAllowance',        desc: 'Decrease token spending allowance',    risk: 'low'  },
  'd505accf': { name: 'permit',                   desc: 'Gasless approval via signed permit',   risk: 'high' },
  'ac9650d8': { name: 'multicall',                desc: 'Batch multiple contract calls',        risk: 'med'  },
  '3593564c': { name: 'execute',                  desc: 'Execute swap/route via DEX router',    risk: 'low'  },
  '704802ad': { name: 'changeAdmin',              desc: 'Transfer proxy admin control',         risk: 'high' },
  '5c60da1b': { name: 'implementation',           desc: 'Read proxy implementation (view)',     risk: 'none' },
};

const OFFICIAL_TOKEN_ADDRS = new Set([
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
  'TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4', 'TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT',
  'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4', 'TNUC9Qb1rRpN8skWv9nHQLdGAWZWjUEYue',
  'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt', 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
  'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9', 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
  'TN3W4H6rK2ce4vX9YnFQHwKx8Vwhi53ZZZ',
]);

const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const APPROVAL_INCREASE_FNS = new Set(['approve', 'increaseAllowance', 'increaseApproval']);
const APPROVAL_DECREASE_FNS = new Set(['decreaseAllowance', 'decreaseApproval']);
const APPROVAL_INCREASE_SELECTORS = new Set(['095ea7b3', '39509351', 'd73dd623']);

function isApprovalIncreaseCall(decodedCall, selector) {
  return APPROVAL_INCREASE_SELECTORS.has(selector) || APPROVAL_INCREASE_FNS.has(decodedCall?.fn);
}

function isApprovalDecreaseCall(decodedCall, selector) {
  return selector === 'a457c2d7' || selector === '66188463' || APPROVAL_DECREASE_FNS.has(decodedCall?.fn);
}

function approvalIncreaseFnLabel(fn) {
  return (fn === 'increaseAllowance' || fn === 'increaseApproval')
    ? t('Increased allowance for')
    : t('Approved');
}

// -- Contract type labels ---------------------------------------------
const CONTRACT_TYPES = {
  TransferContract:               { label: 'TRX Transfer',         icon: icSVG('M5 12h14M12 5l7 7-7 7'),           risk: 'low' },
  TransferAssetContract:          { label: 'TRC10 Token Transfer', icon: icSVG('M12 2l10 6v8l-10 6L2 16V8l10-6z'), risk: 'low' },
  TriggerSmartContract:           { label: 'Smart Contract Call',  icon: icSVG('M16 18l6-6-6-6M8 6l-6 6 6 6'),      risk: 'med' },
  FreezeBalanceContract:          { label: 'Freeze TRX (stake v1)',icon: icSVG('M8 5V3a4 4 0 0 1 8 0v2M6 21h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2z'), risk: 'low' },
  UnfreezeBalanceContract:        { label: 'Unfreeze TRX',         icon: icSVG('M6 21h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2z'), risk: 'low' },
  FreezeBalanceV2Contract:        { label: 'Freeze TRX (stake v2)',icon: icSVG('M8 5V3a4 4 0 0 1 8 0v2M6 21h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2z'), risk: 'low' },
  UnfreezeBalanceV2Contract:      { label: 'Unfreeze TRX (v2)',    icon: icSVG('M6 21h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2z'), risk: 'low' },
  DelegateResourceContract:       { label: 'Delegate Energy/BW',   icon: icSVG('M5 12h14M12 5l7 7-7 7'),           risk: 'low' },
  UnDelegateResourceContract:     { label: 'Undelegate Resource',  icon: icSVG('M19 12H5M12 19l-7-7 7-7'),          risk: 'low' },
  VoteWitnessContract:            { label: 'Vote for SR',          icon: icSVG('M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM9 12l2 2 4-4'), risk: 'low' },
  WithdrawBalanceContract:        { label: 'Claim Voting Rewards', icon: icSVG('M12 15V3M8 11l4 4 4-4M2 21h20'),   risk: 'low' },
  AccountCreateContract:          { label: 'Create Account',       icon: icSVG('M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M16 11h6'), risk: 'low' },
  AccountUpdateContract:          { label: 'Update Account Name',  icon: icSVG('M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'), risk: 'low' },
  CreateSmartContract:            { label: 'Deploy Contract',      icon: icSVG('M21 16v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2M7 10l5 5 5-5M12 15V3'), risk: 'med' },
  WithdrawExpireUnfreezeContract: { label: 'Withdraw Unfrozen TRX',icon: icSVG('M21 12v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 15V3'), risk: 'low' },
};

// -- Known TRON token contracts ---------------------------------------
const KNOWN_TOKENS = {
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t': { symbol: 'USDT',    name: 'Tether USD',          decimals: 6 },
  'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8': { symbol: 'USDC',    name: 'USD Coin',             decimals: 6 },
  'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7': { symbol: 'WIN',     name: 'WINkLink',             decimals: 6 },
  'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9': { symbol: 'JST',     name: 'JUST',                 decimals: 18 },
  'TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4': { symbol: 'TUSD',   name: 'TrueUSD',              decimals: 18 },
  'TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT': { symbol: 'USDJ',   name: 'JUST Stablecoin',      decimals: 18 },
  'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt': { symbol: 'WBTT',   name: 'Wrapped BTT',          decimals: 6 },
  'TNUC9Qb1rRpN8skWv9nHQLdGAWZWjUEYue': { symbol: 'WTRX',   name: 'Wrapped TRX',          decimals: 6 },
  'TN3W4H6rK2ce4vX9YnFQHwKx8Vwhi53ZZZ': { symbol: 'NFT',    name: 'APENFT',               decimals: 6 },
  'TFczxzPhnThNSqr5by8tvxsdCFRDHJwEKS': { symbol: 'SUNOLD', name: 'SUN (old)',             decimals: 18 },
  'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S': { symbol: 'SUN',    name: 'SUN Token',            decimals: 18 },
  'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4': { symbol: 'BTT',    name: 'BitTorrent',           decimals: 18 },
  'TKkeiboTkxXKJpbmVFbv4a8ov5rAfRDMf9': { symbol: 'SunDrop',name: 'SunDrop',              decimals: 18 },
};

// -- Helpers ----------------------------------------------------------
function hexToAddress(hex32) {
  // ABI-encoded address: 32 bytes, last 21 bytes (42 hex chars) = TRON address
  // TRON addresses start with 0x41 prefix
  if (!hex32 || hex32.length < 40) return null;
  if (hex32.length === 40) return '41' + hex32;
  const raw42 = hex32.slice(-42);
  if (raw42.startsWith('41')) return raw42; // Already TRON format
  return '41' + raw42.slice(-40);           // EVM format - prepend TRON prefix
}

function hexToUint(hex) {
  if (!hex) return BigInt(0);
  try { return BigInt('0x' + hex); } catch(_) { return BigInt(0); }
}

function riskBadge(risk) {
  const map = {
    high: 'b-red',
    med:  'b-amber',
    low:  'b-green',
    none: 'b-ghost',
  };
  const icons = {
    high: icSVG('M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01', 10),
    med:  icSVG('M5 12h14', 10),
    low:  icSVG('M20 6L9 17l-5-5', 10),
    none: icSVG('M12 12h.01', 10),
  };
  const labels = { high: 'High risk', med: 'Medium', low: 'Low risk', none: 'Read-only' };
  const cls = map[risk] || 'b-ghost';
  const label = t(labels[risk] || risk);
  const icon = icons[risk] || '';
  return `<span class="badge ${cls}">${icon} ${esc(label)}</span>`;
}

function statusBadge(success) {
  return success
    ? `<span class="badge b-green">${icSVG(IC.check, 10)} ${t('Success')}</span>`
    : `<span class="badge b-red">${icSVG(IC.x, 10)} ${t('Failed')}</span>`;
}

function txAddrLink(addr) {
  if (!addr || addr === '—') return `<span class="kv-muted">—</span>`;
  return `<a class="a-link a-link-inline mono kv-link" href="https://tronscan.org/#/address/${esc(addr)}" target="_blank" rel="noopener"><span>${esc(addrLabel(addr))}</span>${icSVG(IC.link, 9)}</a>`;
}

function transferDedupKey(tr, loose) {
  const amt = String(tr.amount_str || tr.amount || '');
  const parts = [tr.from_address, tr.to_address];
  if (!loose) parts.push(tr.contract_address);
  parts.push(amt);
  return parts.join('|').toLowerCase();
}

async function normalizeTransferAddr(addr) {
  if (!addr || isValidTron(addr)) return addr;
  let clean = String(addr).replace(/^0x/i, '');
  if (clean.length >= 40) clean = '41' + clean.slice(-40);
  if (clean.length === 42) return hexToTronAddress(clean).catch(() => addr);
  return addr;
}

async function normalizeTransferRow(tr) {
  const out = { ...tr };
  for (const key of ['from_address', 'to_address', 'contract_address']) {
    out[key] = await normalizeTransferAddr(out[key]);
  }
  const tok = KNOWN_TOKENS[out.contract_address];
  if (tok) {
    if (!out.symbol || out.symbol === '?') out.symbol = tok.symbol;
    if (out.decimals == null) out.decimals = tok.decimals;
    if (!out.name) out.name = tok.name;
    out.vip = true;
  }
  return out;
}

async function mergeTrc20Transfers(scanInfo, txInfo) {
  const scanTransfers = collectTrc20Transfers(scanInfo);
  const logTransfers = decodeLogsToTransfers(txInfo?.log, KNOWN_TOKENS);
  const normalizedScan = await Promise.all(scanTransfers.map(normalizeTransferRow));
  const normalizedLogs = await Promise.all(logTransfers.map(normalizeTransferRow));
  const merged = [];
  const seenStrict = new Set();
  const seenLoose = new Set();
  for (const tr of normalizedScan) {
    seenStrict.add(transferDedupKey(tr));
    seenLoose.add(transferDedupKey(tr, true));
    merged.push(tr);
  }
  for (const tr of normalizedLogs) {
    const strict = transferDedupKey(tr);
    const loose = transferDedupKey(tr, true);
    if (seenStrict.has(strict) || seenLoose.has(loose)) continue;
    seenStrict.add(strict);
    seenLoose.add(loose);
    merged.push(tr);
  }
  return merged;
}

function normalizeSelector(raw) {
  if (!raw) return '';
  return String(raw).toLowerCase().replace(/^0x/, '').slice(0, 8);
}

function pickTriggerParam(params, ...keys) {
  if (!params) return null;
  for (const k of keys) {
    if (params[k] != null && params[k] !== '') return params[k];
  }
  return null;
}

function pickTriggerBigInt(params, ...keys) {
  const v = pickTriggerParam(params, ...keys);
  if (v == null || v === '') return null;
  try { return BigInt(String(v)); } catch (_) { return null; }
}

function buildDecodedFromTrigger(trigger) {
  if (!trigger?.methodId) return null;
  const sel = normalizeSelector(trigger.methodId);
  const p = trigger.parameter || {};
  switch (sel) {
    case 'a9059cbb':
      return { fn: 'transfer', to: pickTriggerParam(p, '_to', 'to', 'recipient'), amount: pickTriggerBigInt(p, '_value', 'value', 'amount') };
    case '095ea7b3':
      return { fn: 'approve', spender: pickTriggerParam(p, '_spender', 'spender'), amount: pickTriggerBigInt(p, '_value', 'value', 'amount') };
    case '23b872dd':
      return { fn: 'transferFrom', from: pickTriggerParam(p, '_from', 'from'), to: pickTriggerParam(p, '_to', 'to'), amount: pickTriggerBigInt(p, '_value', 'value', 'amount') };
    case '39509351':
      return { fn: 'increaseAllowance', spender: pickTriggerParam(p, '_spender', 'spender'), amount: pickTriggerBigInt(p, '_increment', 'increment', '_value', 'value') };
    case 'd73dd623':
      return { fn: 'increaseApproval', spender: pickTriggerParam(p, '_spender', 'spender'), amount: pickTriggerBigInt(p, '_addedValue', '_increment', 'increment', '_value', 'value') };
    case 'a457c2d7':
      return { fn: 'decreaseAllowance', spender: pickTriggerParam(p, '_spender', 'spender'), amount: pickTriggerBigInt(p, '_decrement', 'decrement', '_value', 'value') };
    case '66188463':
      return { fn: 'decreaseApproval', spender: pickTriggerParam(p, '_spender', 'spender'), amount: pickTriggerBigInt(p, '_subtractedValue', '_decrement', 'decrement', '_value', 'value') };
    case 'a22cb465': {
      const approved = pickTriggerBigInt(p, '_approved', 'approved');
      return { fn: 'setApprovalForAll', operator: pickTriggerParam(p, '_operator', 'operator'), approved: approved === BigInt(1) };
    }
    case 'aad3ec96':
      return {
        fn: 'claimSplit',
        to: pickTriggerParam(p, 'recipient', '_recipient', '_to', 'to'),
        amount: pickTriggerBigInt(p, 'percentage', '_percentage', '_value', 'value'),
      };
    default:
      return SELECTORS[sel] ? { fn: SELECTORS[sel].name } : null;
  }
}

async function hydrateDecodedAddresses(decoded) {
  if (!decoded) return decoded;
  const out = { ...decoded };
  if (out.from && !isValidTron(out.from)) out.from = await hexToTronAddress(out.from);
  if (out.to && !isValidTron(out.to)) out.to = await hexToTronAddress(out.to);
  if (out.spender && !isValidTron(out.spender)) out.spender = await hexToTronAddress(out.spender);
  if (out.operator && !isValidTron(out.operator)) out.operator = await hexToTronAddress(out.operator);
  return out;
}

function isTronScanRiskyTx(scanInfo) {
  if (!scanInfo) return false;
  const v = scanInfo.riskTransaction;
  return v === true || v === 1 || v === '1';
}

// -- Dust / address-poisoning heuristics --------------------------------

function isMicroTokenTransfer(tr) {
  if (!tr) return false;
  if (OFFICIAL_TOKEN_ADDRS.has(tr.contract_address)) return false;
  const dec = Number(tr.decimals ?? 6);
  let raw = 0n;
  try { raw = BigInt(tr.amount_str ?? tr.amount ?? 0); } catch (_) { return false; }
  if (raw <= 0n) return false;
  const unit = 10n ** BigInt(Math.max(0, dec));
  return raw <= unit;
}

function tronAddrPoisonMatch(a, b) {
  if (!a || !b || a === '—' || b === '—' || a === b) return false;
  if (!isValidTron(a) || !isValidTron(b)) return false;
  return a.slice(0, 4) === b.slice(0, 4) && a.slice(-4) === b.slice(-4);
}

async function collectDustSignals(ctx) {
  const { cType, cVal, scanInfo, mergedTransfers, fromAddr, toAddr } = ctx;
  const alerts = [];
  let summaryRiskBump = null;
  let summaryDesc = '';

  const trxSun = cType === 'TransferContract' ? (cVal.amount || 0) : 0;
  const isMicroTrx = cType === 'TransferContract' && isMicroTrxSun(trxSun);
  const microTokenTransfers = (mergedTransfers || []).filter(isMicroTokenTransfer);
  const trc10Micro = cType === 'TransferAssetContract' && isMicroTokenTransfer(
    trc10TransferFromScan(scanInfo, cVal)
  );
  const hasDustAmount = isMicroTrx || microTokenTransfers.length > 0 || trc10Micro;

  if (tronAddrPoisonMatch(fromAddr, toAddr)) {
    alerts.push({
      lvl: 'red',
      msg: t('Address poisoning pattern — sender resembles recipient (matching prefix and suffix). Verify the full base58 address before sending funds.'),
    });
    summaryRiskBump = 'high';
  }

  if (isMicroTrx) {
    alerts.push({
      lvl: 'amber',
      msg: t('Micro TRX transfer ({amount} TRX) — typical dust/spam probe. Do not treat as payment and never copy an address from history without verifying every character.', {
        amount: (trxSun / 1_000_000).toFixed(6),
      }),
    });
    summaryDesc = t('Possible dust attack — micro-transfer designed to pollute your transaction history.');
    summaryRiskBump = summaryRiskBump || 'med';
  }

  if (microTokenTransfers.length > 0) {
    const sym = microTokenTransfers[0].symbol || 'token';
    alerts.push({
      lvl: 'amber',
      msg: t('Micro {symbol} transfer — suspicious dust amount on a non-official token. Verify the contract/asset ID before interacting.', { symbol: sym }),
    });
    summaryRiskBump = summaryRiskBump || 'med';
  } else if (trc10Micro) {
    const ti = scanInfo?.contractData?.tokenInfo;
    const sym = ti?.tokenAbbr || ti?.tokenName || t('TRC10 token');
    alerts.push({
      lvl: 'amber',
      msg: t('Micro {symbol} transfer — suspicious dust amount on a non-official token. Verify the contract/asset ID before interacting.', { symbol: sym }),
    });
    summaryRiskBump = summaryRiskBump || 'med';
  }

  if (hasDustAmount || isTronScanRiskyTx(scanInfo)) {
    const sender = isValidTron(fromAddr) ? fromAddr : null;
    if (sender) {
