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
    <span class="kv-label">${t(label)}</span>
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
  const color = riskScore >= 50 ? 'var(--red)' : riskScore >= 25 ? 'var(--amber)' : 'var(--green)';
  const fillOpacity = 0.14 + (Math.min(riskScore, 100) / 100) * 0.28;
  const glow = 3 + (Math.min(riskScore, 100) / 100) * 6;
  let cracks = '';
  if (riskScore >= 25) cracks += `<path d="M14 8l-1 2v4l-2 1" stroke="${color}" stroke-width="1" fill="none" opacity="0.55"/>`;
  if (riskScore >= 50) cracks += `<path d="M9 10l2 3-2 2M16 13l-2 1" stroke="${color}" stroke-width="1" fill="none" opacity="0.6"/>`;
  if (riskScore >= 75) cracks += `<path d="M7 7l4 2-3 5M18 9l-4 2" stroke="${color}" stroke-width="1" fill="none" opacity="0.65"/>`;
  return `<svg class="contract-risk-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;filter:drop-shadow(0 0 ${glow}px ${color})">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="${color}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="1.2"/>
    ${cracks}
  </svg>`;
}

function ctrScoreLabel(score) {
  if (score >= 70) return t('Critical risk');
  if (score >= 40) return t('Elevated risk');
  if (score >= 20) return t('Moderate risk');
  return t('Low risk');
}

function ctrRiskRow(risk) {
  const tier = risk.lvl === 'danger' ? 'is-high' : risk.lvl === 'warn' ? 'is-med' : 'is-ok';
  const flagBadge = risk.lvl === 'danger' ? badge('b-red', t('Critical'))
    : risk.lvl === 'warn' ? badge('b-amber', t('Warning'))
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

function detectContractStandard(abi) {
  const names = new Set(abi.filter(e=>e.type==='Function'||!e.type).map(e=>_n(e.name)));
  const is20 = ['transfer','balanceof','totalsupply','approve','transferfrom','allowance'].every(n=>names.has(n));
  if (is20) return 'TRC20';
  const is721 = ['ownerof','safetransferfrom(address,address,uint256)','tokenuri'].some(n=>names.has(n));
  if (is721) return 'TRC-721';
  if (['safetransferfrom(address,address,uint256,bytes)','urifromid'].some(n=>names.has(n))) return 'TRC-1155';
  return null;
}

async function contractScan() {
  const addr = contractInput.value.trim();
  setError(contractErr, '');
  contractRes.innerHTML = '';
  contractEmpty.style.display = 'none';
  contractAbiLimit = 10;
  contractResult = null;
  contractExtra = null;
  if (!addr) { flashInput(contractInput); showToast(t('Enter a contract address')); return; }
  if (!isValidTron(addr)) { flashInput(contractInput); showToast(t('Invalid TRON address — must start with T, 34 chars.')); return; }
  spinBtn(contractBtn, true);
  contractRes.innerHTML = SK.contract();

  try {
    const body = {value: addr, visible: true};
    const [contractData, infoRes] = await Promise.all([
      gridPost('/wallet/getcontract', body),
      gridPost('/wallet/getcontractinfo', body).catch(()=>({})),
    ]);

    if (!contractData || contractData.Error || (!contractData.bytecode && !contractData.abi)) {
      contractRes.innerHTML = ''; setError(contractErr, t('Not a contract address, or contract not deployed on TRON mainnet.'));
      spinBtn(contractBtn, false); return;
    }

    const abi    = contractData.abi?.entrys || [];
    const hasAbi = abi.length > 0;
    const verified = hasAbi && !!(
      infoRes?.contract_state?.update_energy_limit != null ||
      infoRes?.info?.compiler_version ||
      infoRes?.info?.verify_status === 'VERIFIED' ||
      contractData.name
    );
    const standard = hasAbi ? detectContractStandard(abi) : null;

    const hasMint       = abi.some(e=>_n(e.name).includes('mint'));
    const hasPause      = abi.some(e=>_n(e.name).includes('pause')||_n(e.name)==='stop');
    const hasOwnerCtrl  = abi.some(e=>_n(e.name).includes('transferownership')||_n(e.name).includes('setowner'));
    const hasBlack      = abi.some(e=>_n(e.name).includes('blacklist')||_n(e.name).includes('ban')||_n(e.name).includes('blocklist'));
    const hasDestroy    = abi.some(e=>_n(e.name).includes('selfdestruct')||_n(e.name).includes('destroy')||_n(e.name).includes('kill'));
    const hasWithdraw   = abi.some(e=>_n(e.name).includes('withdrawall')||_n(e.name).includes('draintoken')||_n(e.name)==='withdraw');
    const hasFeeChange  = abi.some(e=>_n(e.name).includes('setfee')||_n(e.name).includes('settax')||_n(e.name).includes('updatefee'));
    const hasHiddenMint = abi.some(e=>_n(e.name).includes('issue')||_n(e.name).includes('generate'));
    const hasRenounce   = abi.some(e=>_n(e.name).includes('renounceownership'));
    const hasFallback   = abi.some(e=>e.type==='Fallback'||e.type==='Receive');
    const hasUpgrade    = abi.some(e=>_n(e.name).includes('upgrade')||_n(e.name).includes('setimplementation')||_n(e.name).includes('setlogic'));
    const hasProxy      = hasAbi && abi.filter(e=>e.type==='Function'||!e.type).length <= 3;
    const hasCooldown   = abi.some(e=>_n(e.name).includes('cooldown')||_n(e.name).includes('timelock')||_n(e.name).includes('setdelay'));
    const hasMaxTx      = abi.some(e=>_n(e.name).includes('maxtx')||_n(e.name).includes('maxamount')||_n(e.name).includes('setlimit'));
    const hasAntiWhale  = abi.some(e=>_n(e.name).includes('maxwallet')||_n(e.name).includes('maxholding')||_n(e.name).includes('antiwhale'));
    const hasSwapBack   = abi.some(e=>_n(e.name).includes('swapback')||_n(e.name).includes('swapandliquify')||_n(e.name).includes('processfees'));
    const hasAirdrop    = abi.some(e=>_n(e.name).includes('airdrop')||_n(e.name).includes('multisend')||_n(e.name).includes('batchtransfer'));
    const hasBurnAll    = abi.some(e=>e.name==='burnAll'||e.name==='burnall'||_n(e.name).includes('burnfrom'));
    const fns          = abi.filter(e=>e.type==='Function'||!e.type);
    const hasTooManyFns = fns.length > 40;
    const hasNoEvents   = !abi.some(e=>e.type==='Event');
    const readFns      = fns.filter(e=>e.stateMutability==='view'||e.stateMutability==='pure');
    const writeFns     = fns.filter(e=>e.stateMutability!=='view'&&e.stateMutability!=='pure'&&e.stateMutability!=='payable');
    const payableFns   = fns.filter(e=>e.stateMutability==='payable');

    const risks = [];
    if (!hasAbi)    risks.push({lvl:'danger',cat:'Transparency',msg:'No ABI — bytecode-only contract. Source is hidden, cannot audit logic.'});
    if (hasDestroy) risks.push({lvl:'danger',cat:'Rug risk',    msg:'selfdestruct/destroy detected — owner can permanently kill the contract and lock all funds.'});
    if (hasBlack)   risks.push({lvl:'danger',cat:'Censorship',  msg:'Blacklist function found — owner can silently block any address from transacting.'});
    if (hasUpgrade) risks.push({lvl:'danger',cat:'Proxy',       msg:'Upgradeable proxy pattern — owner can silently replace contract logic at any time.'});
    if (hasWithdraw && !hasRenounce) risks.push({lvl:'danger',cat:'Fund drain',msg:'withdraw() with active ownership — privileged drain function without renounced control.'});
    if (!verified)  risks.push({lvl:'warn',cat:'Verification',  msg:'Source code not verified — ABI decoded from bytecode only.'});
    if (hasMint||hasHiddenMint) risks.push({lvl:'warn',cat:'Supply',msg:'Mint/issue function present — owner can inflate token supply at any time.'});
    if (hasPause)   risks.push({lvl:'warn',cat:'Freeze',        msg:'pause()/stop() present — owner can freeze all transfers without consent.'});
    if (hasOwnerCtrl) risks.push({lvl:'warn',cat:'Ownership',   msg:'transferOwnership() present — control can be transferred silently.'});
    if (hasFeeChange) risks.push({lvl:'warn',cat:'Fees',        msg:'setFee/tax function found — owner can change fees/taxes at will.'});
    if (hasFallback)  risks.push({lvl:'warn',cat:'ETH sink',    msg:'Fallback/receive function — contract can accept arbitrary TRX, may be used as honeypot.'});
    if (hasProxy&&hasAbi) risks.push({lvl:'warn',cat:'Proxy hint',msg:'Very few ABI entries — possible minimal proxy. Real logic may be elsewhere.'});
    if (hasCooldown)  risks.push({lvl:'warn',cat:'Timelock',    msg:'Cooldown/timelock function found — transactions may be delayed or blocked at owner discretion.'});
    if (hasMaxTx)     risks.push({lvl:'warn',cat:'Tx limit',    msg:'Max transaction amount function present — owner can cap how much you can transfer at once.'});
    if (hasAntiWhale) risks.push({lvl:'warn',cat:'Whale guard', msg:'Max wallet/holding limit detected — owner can restrict maximum balance per address.'});
    if (hasSwapBack)  risks.push({lvl:'warn',cat:'Swap-router', msg:'Swap-back/auto-liquidity function — contract may route trades through non-standard paths.'});
    if (hasAirdrop)   risks.push({lvl:'warn',cat:'Batch ops',   msg:'Airdrop/batch transfer present — tokens may be distributed without recipient consent.'});
    if (hasBurnAll)   risks.push({lvl:'warn',cat:'Burn risk',   msg:'batch burn function — owner can destroy tokens from any address if not restricted.'});
    if (hasRenounce)  risks.push({lvl:'ok',cat:'Good sign',     msg:'renounceOwnership() present — owner CAN give up control (check if already called).'});
    if (hasTooManyFns) risks.push({lvl:'warn',cat:'Complexity',msg:t('{n} functions — unusually complex contract, higher attack surface.', {n: fns.length})});
    if (hasNoEvents&&hasAbi) risks.push({lvl:'warn',cat:'Opacity',msg:'No events defined — transfers and key actions may not be traceable on-chain.'});
    if (risks.filter(r=>r.lvl!=='ok').length===0) risks.push({lvl:'ok',cat:'Clean',msg:'No critical risk patterns detected in ABI.'});

    const dangerCount = risks.filter(r=>r.lvl==='danger').length;
    const warnCount   = risks.filter(r=>r.lvl==='warn').length;
    const score = Math.min(((!verified&&hasAbi)?10:0)+dangerCount*25+warnCount*10, 100);

    let scanMeta = {};
    try { scanMeta = (await scanGet('/contract', {contract:addr}).catch(()=>({}))).data?.[0] || {}; } catch(_){}

    const creator = scanMeta.creator_address || scanMeta.ownerAddress || infoRes?.info?.origin_address || contractData.origin_address || '—';
    const created = scanMeta.date_created
      ? new Date(scanMeta.date_created).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})
      : '—';
    const createdTs = scanMeta.date_created ? new Date(scanMeta.date_created).getTime() : null;
    const ageDays = createdTs ? Math.round((Date.now()-createdTs)/86400000) : null;
    const txCount = scanMeta.call_count ?? scanMeta.callCount ?? scanMeta.transaction_count ?? '—';

    let contractBalance = null;
    try {
      const balRes = await gridGet(`/v1/accounts/${addr}`);
      if (balRes.data?.[0]) contractBalance = (balRes.data[0].balance||0)/1_000_000;
    } catch(_){}

    contractExtra = { standard, readFns: readFns.length, writeFns: writeFns.length, payableFns: payableFns.length, ageDays };

    contractResult = {
      name: contractData.name || scanMeta.name || addr.slice(0,8)+'?',
      verified, hasAbi, funcCount: abi.length, risks, score, abi,
      creator, created, txCount, contractBalance, dangerCount, warnCount, addr,
      standard,
    };
    renderContract();
  } catch(e) { setError(contractErr, userFriendlyFetchError(e)); }
  spinBtn(contractBtn, false);
}

function renderContract() {
  const r = contractResult;
  if (!r) return;

  const vCls = ctrRiskClass(r.score);
  const standardLabel = r.standard ? badge('b-cyan', r.standard) : badge('b-ghost', t('Custom'));
  const ageWarn = contractExtra?.ageDays !== null && contractExtra?.ageDays < 7;

  const headTags = [
    standardLabel,
    r.verified ? badge('b-green', t('Verified')) : badge('b-amber', t('Unverified')),
    r.dangerCount > 0 ? badge('b-red', `${r.dangerCount} critical`) :
    r.warnCount > 0 ? badge('b-amber', `${r.warnCount} warnings`) : badge('b-green', t('Clean')),
  ].join('');

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
  if (r.dangerCount > 0) {
    assessmentHtml = amlAlertInline('red', `<strong>Critical findings</strong> — ${r.dangerCount} dangerous pattern${r.dangerCount > 1 ? 's' : ''} detected. Do not interact without review.`);
  } else if (r.warnCount > 0) {
    assessmentHtml = amlAlertInline('amber', `<strong>Warnings present</strong> — ${r.warnCount} pattern${r.warnCount > 1 ? 's' : ''} require manual review.`);
  } else {
    assessmentHtml = amlAlertInline('green', '<strong>No critical patterns</strong> — ABI scan found no major red flags.');
  }

  const scoreRows = r.score > 0 ? `
    ${ctrKvRow(`${ttLabel('danger')} flags`, `<span class="mono">${r.dangerCount > 0 ? '+' + r.dangerCount * 25 : '0'}</span>`)}
    ${ctrKvRow(t('Warning flags'), `<span class="mono">${r.warnCount > 0 ? '+' + r.warnCount * 10 : '0'}</span>`)}
    ${!r.verified && r.hasAbi ? ctrKvRow(t('Unverified source'), '<span class="mono">+10</span>') : ''}
    ${ctrKvRow(t('Total score'), `<span class="an-stat-value ${vCls}">${r.score}<span class="aml-score-unit">/100</span></span>`, true)}
  ` : ctrKvRow(t('Total score'), `<span class="mono is-green">0<span class="aml-score-unit">/100</span></span>`, true);

  const infoHtml = ctrPanel(t('Contract info'), `
    ${ctrKvRow(t('Creator'), r.creator !== '—'
      ? `<a class="a-link" href="https://tronscan.org/#/address/${esc(r.creator)}" target="_blank" rel="noopener">${esc(short(r.creator))} ${icSVG(IC.link, 9)}</a>`
      : `<span class="kv-muted">${t('Unknown')}</span>`)}
    ${ctrKvRow(t('Deployed'), `${esc(r.created)}${ageWarn ? ' <span class="badge b-amber">&lt;7d</span>' : ''}`)}
    ${ctrKvRow(t('Interactions'), r.txCount !== '—' ? fmtNum(r.txCount) : '—')}
    ${ctrKvRow(ttLabel('functions'), `${contractExtra ? contractExtra.readFns : '—'} read · ${contractExtra ? contractExtra.writeFns : '—'} write · ${contractExtra ? contractExtra.payableFns : '—'} ${ttLabel('payable')}`)}
    ${r.contractBalance != null ? ctrKvRow(t('Balance'), `<span class="is-info">${r.contractBalance.toFixed(2)} TRX</span>`, true) : ctrKvRow(t('Balance'), '<span class="kv-muted">—</span>', true)}
  `);

  function fnRisk(name) {
    const n = _n(name);
    if (n.includes('mint')||n.includes('burn')||n.includes('pause')||n.includes('destroy')||n.includes('blacklist')||n.includes('kill')||n.includes('selfdestruct')) return 'danger';
    if (n.includes('owner')||n.includes('admin')||n.includes('set')||n.includes('fee')||n.includes('tax')||n.includes('cooldown')||n.includes('limit')||n.includes('withdraw')||n.includes('drain')||n.includes('upgrade')) return 'warn';
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
