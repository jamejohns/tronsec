// ==================================
//  TX DECODER PAGE
// ==================================

const txInput  = document.getElementById('tx-input');
const txBtn    = document.getElementById('tx-decode-btn');
const txErr    = document.getElementById('tx-err');
const txRes    = document.getElementById('tx-result');
const txEmpty  = document.getElementById('tx-empty');

txInput.addEventListener('keydown', e => { if (e.key === 'Enter') txDecode(); });
txBtn.addEventListener('click', txDecode);

function txActionBtn({ id, label, icon, href, variant }) {
  const cls = `wallet-action-btn${variant ? ` wallet-action-btn--${variant}` : ''}`;
  const inner = `${icSVG(icon, 14)}<span>${esc(t(label))}</span>`;
  if (href) return `<a class="${cls}" id="${id}" href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`;
  return `<button type="button" class="${cls}" id="${id}">${inner}</button>`;
}

function txBlock(titleHtml, bodyHtml, meta = '') {
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

function txPanel(titleHtml, rowsHtml, meta = '') {
  return txBlock(titleHtml, `<div class="aml-kv-list">${rowsHtml}</div>`, meta);
}

function txKvRow(label, valueHtml, last) {
  return `<div class="kv-row${last ? ' kv-row--last' : ''}">
    <span class="kv-label">${t(label)}</span>
    <span class="kv-val">${valueHtml}</span>
  </div>`;
}

function txHeadCard(titleHtml, hash, tagsHtml) {
  return `<div class="aml-head-card tx-head-card">
    <div class="wallet-head-top">
      <div style="flex:1;min-width:0">
        <div class="tx-head-title">${titleHtml}</div>
        <div class="wallet-head-addr tx-head-hash">${esc(hash)}</div>
      </div>
      <div class="wallet-head-actions">
        ${txActionBtn({ id: 'tx-copy-btn', label: 'Copy', icon: IC.copy })}
        ${txActionBtn({ id: 'tx-tronscan-btn', label: 'TronScan', icon: IC.external, href: `https://tronscan.org/#/transaction/${hash}`, variant: 'ext' })}
      </div>
    </div>
    ${tagsHtml ? `<div class="wallet-head-tags">${tagsHtml}</div>` : ''}
  </div>`;
}

function bindTxActions(hash) {
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
    <div class="an-stat-label">${t(label)}</div>
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
  return `<div class="tx-signal ${tier}">
    <div class="tx-signal-body">${alert.msg}</div>
    <div class="tx-signal-badge">${flagBadge}</div>
  </div>`;
}

function txDetailVal(d) {
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
  '4e71d92d': { name: 'claim',                    desc: 'Claim rewards or tokens from contract', risk: 'low' },
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
};

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

// Decode ABI-encoded call data (hex string without 0x, starting after 4-byte selector)
function decodeCallData(selector, data) {
  const sel = SELECTORS[selector];
  if (!sel) return null;

  const params = data.slice(8); // strip 4-byte selector (8 hex chars)
  const chunks = [];
  for (let i = 0; i < params.length; i += 64) {
    chunks.push(params.slice(i, i + 64));
  }

  // Decode by known function
  switch (selector) {
    case 'a9059cbb': { // transfer(address,uint256)
      if (chunks.length < 2) return null;
      const to  = hexToAddress(chunks[0]);
      const amt = hexToUint(chunks[1]);
      return { fn: 'transfer', to, amount: amt };
    }
    case '095ea7b3': { // approve(address,uint256)
      if (chunks.length < 2) return null;
      const spender = hexToAddress(chunks[0]);
      const amt     = hexToUint(chunks[1]);
      return { fn: 'approve', spender, amount: amt };
    }
    case '23b872dd': { // transferFrom(address,address,uint256)
      if (chunks.length < 3) return null;
      const from = hexToAddress(chunks[0]);
      const to   = hexToAddress(chunks[1]);
      const amt  = hexToUint(chunks[2]);
      return { fn: 'transferFrom', from, to, amount: amt };
    }
    case 'a22cb465': { // setApprovalForAll(address,bool)
      if (chunks.length < 2) return null;
      const op       = hexToAddress(chunks[0]);
      const approved = BigInt('0x' + chunks[1]) === BigInt(1);
      return { fn: 'setApprovalForAll', operator: op, approved };
    }
    default:
      return { fn: sel.name };
  }
}

// -- Fetch token decimals from chain (for unknown TRC20 contracts) ----
// Calls decimals() selector 0x313ce567 via triggerconstantcontract
const _decimalsCache = {};
async function fetchTokenDecimals(contractAddress) {
  if (_decimalsCache[contractAddress] != null) return _decimalsCache[contractAddress];
  try {
    const res = await gridPost('/wallet/triggerconstantcontract', {
      owner_address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', // burn address, read-only call
      contract_address: contractAddress,
      function_selector: 'decimals()',
      parameter: '',
      visible: true,
    });
    const hex = res?.constant_result?.[0];
    if (hex) {
      const d = parseInt(hex, 16);
      if (d >= 0 && d <= 36) {
        _decimalsCache[contractAddress] = d;
        return d;
      }
    }
  } catch(_) {}
  // Fallback to 6 (most common on TRON)
  _decimalsCache[contractAddress] = 6;
  return 6;
}

// -- Main decode function ----------------------------------------------
async function txDecode() {
  const hash = txInput.value.trim();
  setError(txErr, '');
  txRes.innerHTML = '';
  txEmpty.style.display = 'none';

  if (!hash) { flashInput(txInput); showToast('Enter a TX hash or hex data'); return; }
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
    flashInput(txInput);
    showToast('Invalid TX hash — must be 64 hex characters.');
    return;
  }

  spinBtn(txBtn, true);
  txRes.innerHTML = SK.txDecoder();

  try {
    // Fetch TX info + receipt in parallel
    const [txData, txInfo] = await Promise.all([
      gridPost('/wallet/gettransactionbyid', { value: hash, visible: true }),
      gridPost('/wallet/gettransactioninfobyid', { value: hash }),
    ]);

    if (!txData || !txData.txID) {
      txRes.innerHTML = ''; setError(txErr, t('Transaction not found. Check the hash and try again.'));
      spinBtn(txBtn, false);
      return;
    }

    const contract   = txData.raw_data?.contract?.[0];
    const cType      = contract?.type || 'Unknown';
    const cVal       = contract?.parameter?.value || {};
    const typeMeta   = CONTRACT_TYPES[cType] || { label: cType, icon: icSVG('M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01'), risk: 'med' };
    const success    = txData.ret?.[0]?.contractRet === 'SUCCESS';
    const timestamp  = txData.raw_data?.timestamp;
    const fee        = txInfo?.fee ? (txInfo.fee / 1_000_000).toFixed(6) : '0';
    const energyUsed = txInfo?.receipt?.energy_usage_total || txInfo?.receipt?.energy_usage || 0;
    const netUsed    = txInfo?.receipt?.net_usage || 0;
    const blockNum   = txInfo?.blockNumber || '—';

    // -- Build human-readable summary --------------------------------
    let summaryTitleHtml = '';
    let summaryDesc  = '';
    let summaryRisk  = typeMeta.risk;
    let decodedCall  = null;
    let tokenInfo    = null;
    const details    = []; // [{label, value, mono?}]

    // From / To
    const fromAddr = cVal.owner_address || '—';
    const toAddr   = cVal.to_address || cVal.contract_address || '—';

    switch (cType) {

      case 'TransferContract': {
        const amt = (cVal.amount || 0) / 1_000_000;
        summaryTitleHtml = esc(`Sent ${amt.toFixed(6)} TRX`);
        summaryDesc  = t('Sent {amount} TRX from {from} to {to}. TRX is the native currency of TRON used for fees, staking, and voting.', {
          amount: amt.toFixed(6), from: short(fromAddr), to: short(toAddr),
        });
        details.push({ label: 'Amount', value: amt.toFixed(6) + ' TRX', mono: true });
        details.push({ label: 'From',   value: fromAddr, mono: true, link: true });
        details.push({ label: 'To',     value: toAddr,   mono: true, link: true });
        break;
      }

      case 'TransferAssetContract': {
        const asset = cVal.asset_name || t('TRC10 token');
        const amt   = cVal.amount || 0;
        summaryTitleHtml = esc(`Sent ${amt} ${asset}`);
        summaryDesc  = t('Transferred {amount} units of the TRC-10 token "{asset}" from {from} to {to}. TRC-10 transfers use bandwidth, not energy.', {
          amount: String(amt), asset, from: short(fromAddr), to: short(toAddr),
        });
        details.push({ label: 'Token',  value: asset });
        details.push({ label: 'Amount', value: String(amt), mono: true });
        details.push({ label: 'From',   value: fromAddr, mono: true, link: true });
        details.push({ label: 'To',     value: toAddr,   mono: true, link: true });
        break;
      }

      case 'TriggerSmartContract': {
        const data     = cVal.data || '';
        const selector = data.slice(0, 8).toLowerCase();
        const selMeta  = SELECTORS[selector];
        const knownTok = KNOWN_TOKENS[cVal.contract_address];

        // Resolve decimals: use known mapping first, then query chain
        const tokenDecimals = knownTok?.decimals != null
          ? knownTok.decimals
          : await fetchTokenDecimals(cVal.contract_address);

        decodedCall = decodeCallData(selector, data);
        // Convert hex addresses to TRON base58
        if (decodedCall) {
          if (decodedCall.from)    decodedCall.from    = await hexToTronAddress(decodedCall.from);
          if (decodedCall.to)      decodedCall.to      = await hexToTronAddress(decodedCall.to);
          if (decodedCall.spender) decodedCall.spender = await hexToTronAddress(decodedCall.spender);
        }
        summaryRisk = selMeta?.risk || 'med';

        if (knownTok) tokenInfo = knownTok;
        const symbol = knownTok ? knownTok.symbol : 'tokens';

        // Build human-readable summary & detail rows from decoded data
        const amtStr = decodedCall?.amount != null
          ? fmtTokenAmt(decodedCall.amount, tokenDecimals) + ' ' + symbol
          : null;

        if (decodedCall) {
          if (decodedCall.fn === 'transfer') {
            const toShort = decodedCall.to ? short(decodedCall.to) : '—';
            const fromShort = short(cVal.owner_address);
            const tkName = knownTok ? `${knownTok.symbol} (${knownTok.name})` : symbol;
            summaryTitleHtml = esc(`Sent ${amtStr || '—'} > ${toShort}`);
            summaryDesc  = t('TRC-20 transfer: {amount} of {token} from {from} to {to}.', {
              amount: amtStr || t('amount unknown'), token: tkName, from: fromShort, to: toShort,
            }) + (knownTok ? '' : ' ' + t('Always verify the contract address before interacting.'));
            details.push({ label: 'From',   value: cVal.owner_address, mono: true, link: true });
            if (decodedCall.to)   details.push({ label: 'To',     value: decodedCall.to,   mono: true, link: true });
            if (amtStr) details.push({ label: 'Amount', value: amtStr, mono: true });
          } else if (decodedCall.fn === 'transferFrom') {
            const fromShort = decodedCall.from ? short(decodedCall.from) : '—';
            const toShort   = decodedCall.to   ? short(decodedCall.to)   : '—';
            const tkName = knownTok ? `${knownTok.symbol} (${knownTok.name})` : symbol;
            summaryTitleHtml = esc(`${fromShort} > ${toShort} — ${amtStr || '—'}`);
            summaryDesc  = `transferFrom: ${amtStr || 'tokens'} of ${tkName} moved from ${fromShort} to ${toShort}, initiated by ${short(cVal.owner_address)}. Used by DeFi protocols and DEX aggregators — also a common drainer pattern.`;
            if (decodedCall.from) details.push({ label: 'From',   value: decodedCall.from, mono: true, link: true });
            if (decodedCall.to)   details.push({ label: 'To',     value: decodedCall.to,   mono: true, link: true });
            if (amtStr) details.push({ label: 'Amount', value: amtStr, mono: true });
          } else if (decodedCall.fn === 'approve') {
            const spShort = decodedCall.spender ? short(decodedCall.spender) : '—';
            const isUnlim = isUnlimitedApproval(decodedCall.amount, tokenDecimals);
            const allowStr = isUnlim ? '≈ ' + tt('unlimited') : (amtStr || '—');
            const tkName = knownTok ? `${knownTok.symbol} (${knownTok.name})` : symbol;
            summaryTitleHtml = isUnlim
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:inline;vertical-align:-2px;margin-right:2px;color:var(--red)"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> Approved ${esc(spShort)} for unlimited ${esc(symbol)}`
              : esc(`Approved ${spShort} to spend ${allowStr}`);
            summaryDesc  = `Approved ${spShort} for ${allowStr} of ${tkName}. ${isUnlim ? 'UNLIMITED — the spender can drain your entire balance at any time.' : 'The spender can transfer this amount without further confirmation.'}`;
            if (isUnlim) summaryRisk = 'high';
            details.push({ label: tt('spender'), value: decodedCall.spender || '—', mono: true, link: true });
            details.push({ label: tt('allowance'), value: allowStr, mono: true });
          } else if (decodedCall.fn === 'setApprovalForAll') {
            const opShort = decodedCall.operator ? short(decodedCall.operator) : '—';
            summaryTitleHtml = esc(decodedCall.approved ? `Approved ${opShort} for all NFTs` : `Revoked NFT approval for ${opShort}`);
            summaryDesc  = decodedCall.approved
              ? `Granted ${opShort} full control over all NFTs in this collection. They can transfer, burn, or list your NFTs without further approval.`
              : `Revoked ${opShort}'s permission to manage your NFTs in this collection.`;
            details.push({ label: 'Operator', value: decodedCall.operator || '—', mono: true, link: true });
            details.push({ label: 'Approved', value: decodedCall.approved ? t('YES — full collection access granted') : t('NO — approval revoked'), mono: false });
          } else if (selMeta) {
            summaryTitleHtml = esc(selMeta.name + '()');
            summaryDesc  = t('Called {fn}() on {addr}. {desc}.', {
              fn: selMeta.name, addr: short(cVal.contract_address), desc: t(selMeta.desc),
            });
          } else {
            summaryTitleHtml = esc(t('Contract call'));
            summaryDesc  = t('Unknown function (0x{selector}) called on {addr}. Raw call data shown below.', {
              selector, addr: short(cVal.contract_address),
            });
          }
        } else if (selMeta) {
          summaryTitleHtml = esc(selMeta.name + '()');
          summaryDesc  = t('Called {fn}() on {addr}. {desc}.', {
            fn: selMeta.name, addr: short(cVal.contract_address), desc: t(selMeta.desc),
          });
        } else {
          summaryTitleHtml = esc(t('Contract call'));
          summaryDesc  = t('Unrecognized method (0x{selector}) on {addr}.', { selector, addr: short(cVal.contract_address) });
        }

        details.push({ label: 'Contract', value: cVal.contract_address || '—', mono: true, link: true });
        if (data) details.push({ label: tt('selector'), value: '0x' + selector + (selMeta ? ` (${selMeta.name})` : ' — unknown'), mono: true });

        if (cVal.call_value && cVal.call_value > 0) {
          details.push({ label: 'TRX sent', value: (cVal.call_value / 1_000_000).toFixed(6) + ' TRX', mono: true });
        }
        break;
      }

      case 'FreezeBalanceContract':
      case 'FreezeBalanceV2Contract': {
        const amt      = (cVal.frozen_balance || 0) / 1_000_000;
        const resource = cVal.resource === 'ENERGY' ? t('Energy') : t('Bandwidth');
        const isV2     = cType === 'FreezeBalanceV2Contract';
        summaryTitleHtml = esc(isV2 ? `Freeze ${amt.toFixed(2)} TRX for ${resource} (v2)` : `Freeze ${amt.toFixed(2)} TRX for ${resource}`);
        summaryDesc    = `Froze ${amt.toFixed(2)} TRX for ${resource}${cVal.receiver_address ? ', delegated to ' + short(cVal.receiver_address) : ''}. ${isV2 ? 'v2 staking — instant unfreeze, earn TP for voting.' : 'v1 staking — 3-day unfreeze period.'}`;
        details.push({ label: 'Frozen',   value: amt.toFixed(6) + ' TRX', mono: true });
        details.push({ label: 'Resource', value: resource });
        if (cVal.receiver_address) details.push({ label: 'Delegated to', value: cVal.receiver_address, mono: true, link: true });
        break;
      }

      case 'UnfreezeBalanceContract':
      case 'UnfreezeBalanceV2Contract': {
        const amt      = (cVal.unfreeze_balance || 0) / 1_000_000;
        const resource = cVal.resource === 'ENERGY' ? t('Energy') : t('Bandwidth');
        const isV2     = cType === 'UnfreezeBalanceV2Contract';
        summaryTitleHtml = esc(`Unfreeze ${amt > 0 ? amt.toFixed(2) + ' TRX' : 'TRX'} (${resource})`);
        summaryDesc    = `Unfroze ${amt > 0 ? amt.toFixed(2) + ' TRX' : 'TRX'} previously frozen for ${resource}. ${isV2 ? 'Instant unfreeze (v2).' : 'TRX returned to wallet after unfreeze.'}`;
        details.push({ label: 'Resource', value: resource });
        break;
      }

      case 'DelegateResourceContract': {
        const amt      = (cVal.balance || 0) / 1_000_000;
        const resource = cVal.resource === 'ENERGY' ? t('Energy') : t('Bandwidth');
        summaryTitleHtml = esc(`Delegate ${amt.toFixed(2)} TRX of ${resource}`);
        summaryDesc    = t('Delegated {amount} TRX worth of {resource} to {receiver}. You retain ownership and can undelegate anytime.', {
          amount: amt.toFixed(2), resource, receiver: short(cVal.receiver_address || t('another address')),
        });
        details.push({ label: 'Amount',   value: amt.toFixed(6) + ' TRX', mono: true });
        details.push({ label: 'Resource', value: resource });
        details.push({ label: 'Receiver', value: cVal.receiver_address || '—', mono: true, link: true });
        break;
      }

      case 'VoteWitnessContract': {
        const votes = cVal.votes || [];
        summaryTitleHtml = esc(`Voted for ${votes.length} SR candidate${votes.length !== 1 ? 's' : ''}`);
        summaryDesc  = `Cast ${votes.reduce((s, v) => s + (v.vote_count || 0), 0)} vote${votes.length === 1 ? '' : 's'} for ${votes.length} SR candidate${votes.length !== 1 ? 's' : ''}. Voting helps secure the network and earns rewards. Requires TRON Power (TP) from staking.`;
        votes.forEach((v, i) => {
          details.push({ label: `Vote ${i + 1}`, value: `${v.vote_address || '—'} — ${v.vote_count} votes`, mono: true });
        });
        break;
      }

      case 'WithdrawBalanceContract': {
        summaryTitleHtml = esc('Claimed voting rewards');
        summaryDesc  = t('Claimed accumulated voting rewards from the TRON network. Rewards are generated by voting for Super Representatives.');
        break;
      }

      case 'CreateSmartContract': {
        summaryTitleHtml = esc('Deployed new contract');
        summaryDesc  = t('Deployed a new smart contract to the TRON blockchain. Smart contracts run on the TRON Virtual Machine (TVM). Deployment consumes significant energy and storage fees.');
        summaryRisk  = 'med';
        if (txInfo?.contract_address) details.push({ label: 'New contract', value: txInfo.contract_address, mono: true, link: true });
        break;
      }

      default: {
        summaryTitleHtml = esc(typeMeta.label);
        summaryDesc  = `This transaction executed a ${cType} operation on the TRON network. ${typeMeta.label !== cType ? `The contract type is "${cType}".` : ''} Refer to the on-chain details below for more information about this transaction.`;
      }
    }

    // -- Risk warning block -------------------------------------------
    const riskAlerts = [];
    const sel = cType === 'TriggerSmartContract' ? (cVal.data || '').slice(0, 8).toLowerCase() : '';

    // -- Scam DB cross-reference (skip known legitimate tokens) --
    const involvedAddrs = [
      cVal.owner_address, cVal.to_address, cVal.contract_address,
      decodedCall?.to, decodedCall?.from, decodedCall?.spender, decodedCall?.operator,
    ].filter(Boolean);
    const _legitAddrs = {};
    Object.keys(KNOWN_TOKENS).forEach(a => { _legitAddrs[a.toLowerCase()] = true; });
    const _scamDb = (typeof allEntries === 'function') ? allEntries() : [];
    const _byAddr = {};
    _scamDb.forEach(e => { _byAddr[e.addr.toLowerCase()] = e; });
    for (const addr of involvedAddrs) {
      const clean = addr.replace(/^0x/, '').toLowerCase();
      if (_legitAddrs[clean]) continue;
      const hit = _byAddr[clean];
      if (hit) {
        riskAlerts.push({ lvl: 'red', msg: `Known <strong>${esc(hit.cat)}</strong>: ${esc(hit.label)} — ${esc(hit.desc)}` });
      }
    }

    // -- Selector-based risk heuristics --
    if (cType === 'TriggerSmartContract') {
      // approve() ? unlimited approval
      if (sel === '095ea7b3') {
        const isUnlim = isUnlimitedApproval(decodedCall?.amount, tokenDecimals);
        if (isUnlim) {
          riskAlerts.push({ lvl: 'red', msg: t('Unlimited approval — spender can drain <strong>all</strong> tokens of this type from your wallet at any time.') });
        } else {
          riskAlerts.push({ lvl: 'amber', msg: t('Token approval — you are granting permission to spend your tokens. Only approve trusted contracts.') });
        }
      }
      // setApprovalForAll ? full NFT control
      if (sel === 'a22cb465' && decodedCall?.approved) {
        riskAlerts.push({ lvl: 'red', msg: t('setApprovalForAll — full NFT collection access granted to operator. Revoke immediately if unexpected.') });
      }
      // mint() ? supply inflation
      if (sel === '40c10f19') {
        riskAlerts.push({ lvl: 'red', msg: t('mint() — new tokens are being created, inflating supply. Potential price dilution.') });
      }
      // transferOwnership ? contract control handover
      if (sel === 'f2fde38b') {
        riskAlerts.push({ lvl: 'red', msg: t('transferOwnership() — contract control is being transferred. Verify the new owner is trustworthy.') });
      }
      // withdraw() ? potential fund drain
      if (sel === '2e1a7d4d' || sel === 'e9fad8ee') {
        riskAlerts.push({ lvl: 'amber', msg: t('withdraw() called — funds are being removed from a contract. Ensure this is expected behaviour.') });
      }
      // transferFrom ? tokens moved on behalf of someone
      if (sel === '23b872dd') {
        riskAlerts.push({ lvl: 'amber', msg: t('transferFrom() — tokens are being transferred on behalf of another address. This can be used by drainers to steal approved tokens.') });
      }
      // swap with high call value
      if (cVal.call_value && cVal.call_value > 500_000_000) {
        riskAlerts.push({ lvl: 'amber', msg: t('Large TRX payment ({amount} TRX) sent with contract call. Verify the recipient is a legitimate exchange or service.', { amount: (cVal.call_value/1_000_000).toFixed(2) }) });
      }
    }

    // -- Additional risk signals --
    // Failed transaction
    if (!success) {
      riskAlerts.push({ lvl: 'amber', msg: t('This transaction <strong>failed</strong> on-chain. No state changes were applied, but the fee was still consumed.') });
    }
    // mint + transferOwnership in same tx = rug setup
    if (sel === '40c10f19' && cVal.data && cVal.data.slice(0, 8).toLowerCase() !== 'f2fde38b') {
      // We only check the first call ? multi-call would be in internal txs
    }
    // TRX transfer to a contract (not a wallet)
    if (cType === 'TransferContract' && cVal.to_address && cVal.to_address.length > 0 && cVal.amount > 0) {
      // Can't easily check if destination is a contract without an extra API call
    }

    // -- Render -------------------------------------------------------
    const redCount = riskAlerts.filter(a => a.lvl === 'red').length;
    const amberCount = riskAlerts.filter(a => a.lvl === 'amber').length;

    const headTags = [
      statusBadge(success),
      riskBadge(summaryRisk),
      badge('b-ghost', t(typeMeta.label)),
      tokenInfo ? badge('b-blue', tokenInfo.symbol + ' — ' + tokenInfo.name) : '',
    ].filter(Boolean).join('');

    const riskSub = redCount
      ? t('{count} critical', { count: redCount })
      : amberCount
        ? t('{count} warnings', { count: amberCount })
        : t('No flags');
    const feeSub = energyUsed
      ? t('{amount} energy', { amount: fmtNum(energyUsed) })
      : netUsed
        ? t('{amount} bandwidth', { amount: fmtNum(netUsed) })
        : '';

    const heroHtml = `
      ${txHeroStat('Type', `<span class="tx-type-inline">${typeMeta.icon}<span>${esc(t(typeMeta.label))}</span></span>`, cType !== typeMeta.label ? esc(cType) : '', 'is-neutral')}
      ${txHeroStat('Status', success ? `<span class="is-green">${t('Success')}</span>` : `<span class="is-red">${t('Failed')}</span>`, timestamp ? esc(ago(timestamp)) : '—', success ? 'is-green' : 'is-red')}
      ${txHeroStat('Risk', riskBadge(summaryRisk), riskSub, txRiskClass(summaryRisk))}
      ${txHeroStat('Fee', `${fee} TRX`, feeSub, 'is-neutral')}`;

    let assessmentHtml;
    if (redCount > 0 || summaryRisk === 'high') {
      assessmentHtml = amlAlertInline('red', `<strong>${t('High risk signals')}</strong> — ${t('{count} critical patterns detected. Review before signing similar transactions.', { count: redCount || 1 })}`);
    } else if (amberCount > 0 || summaryRisk === 'med' || !success) {
      const parts = [`<strong>${t('Review recommended')}</strong> —`];
      if (!success) parts.push(t('transaction failed on-chain.'));
      if (amberCount) parts.push(t('{count} warning signals present.', { count: amberCount }));
      else parts.push(t('moderate-risk operation detected.'));
      assessmentHtml = amlAlertInline('amber', parts.join(' '));
    } else {
      assessmentHtml = amlAlertInline('green', `<strong>${t('Low risk')}</strong> — ${t('no critical patterns detected in this transaction.')}`);
    }

    const signalsHtml = riskAlerts.length
      ? txBlock('Risk signals', `<div class="tx-signals aml-block-body--flush">${riskAlerts.map(txSignalRow).join('')}</div>`, `${riskAlerts.length} total`)
      : '';

    const whatRows = details.map((d, i) =>
      txKvRow(d.label, txDetailVal(d), i === details.length - 1)
    ).join('');

    const whatHtml = txBlock('What happened', `
      <div class="tx-summary">
        <div class="tx-summary-desc">${esc(summaryDesc)}</div>
      </div>
      ${whatRows ? `<div class="aml-kv-list aml-block-body--flush">${whatRows}</div>` : ''}
    `);

    const chainRows = [
      txKvRow('Block', `<span class="mono">${esc(String(blockNum))}</span>`),
      txKvRow('Time', `<span class="mono">${timestamp ? esc(new Date(timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })) : '—'}</span>`),
      txKvRow('Fee', `<span class="mono is-blue">${fee} TRX</span>`),
      energyUsed ? txKvRow(`${tt('energy')} used`, `<span class="mono is-amber">${fmtNum(energyUsed)}</span>`) : '',
      netUsed ? txKvRow(`${tt('bandwidth')} used`, `<span class="mono">${fmtNum(netUsed)}</span>`) : '',
      txKvRow('Contract type', `<span class="mono">${esc(cType)}</span>`, true),
    ].filter(Boolean).join('');

    const chainHtml = txPanel('On-chain details', chainRows);

    const rawHtml = (cType === 'TriggerSmartContract' && cVal.data) ? txBlock('Raw call data', `
      <div class="tx-raw-data">
        <span class="tx-raw-sel">${esc(cVal.data.slice(0, 8))}</span>${esc(cVal.data.slice(8))}
        <div class="tx-raw-note">${t('Highlighted = 4-byte function {selector} · remainder = {abi}-encoded parameters', { selector: tt('selector'), abi: tt('abi') })}</div>
      </div>
    `) : '';

    txRes.innerHTML = `
      <div class="tx-scan">
        ${txHeadCard(summaryTitleHtml || esc(typeMeta.label), hash, headTags)}
        <div class="an-stat-grid an-stat-grid--4 tx-hero-grid">${heroHtml}</div>
        <div class="tx-assessment">${assessmentHtml}</div>
        ${signalsHtml}
        ${whatHtml}
        ${chainHtml}
        ${rawHtml}
        <p class="aml-disclaimer">${t('Decoded from on-chain data — verify contract addresses and amounts before signing similar transactions.')}</p>
      </div>`;

    bindTxActions(hash);

  } catch (e) {
    txRes.innerHTML = ''; setError(txErr, userFriendlyFetchError(e));
  }

  spinBtn(txBtn, false);
}
