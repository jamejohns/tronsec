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
