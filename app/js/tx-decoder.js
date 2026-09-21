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
