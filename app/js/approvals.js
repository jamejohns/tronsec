// ==================================
//  APPROVALS PAGE
// ==================================
const approvalsInput = document.getElementById('approvals-input');
const approvalsBtn   = document.getElementById('approvals-scan-btn');
const approvalsErr   = document.getElementById('approvals-err');
const approvalsRes   = document.getElementById('approvals-result');
const approvalsEmpty = document.getElementById('approvals-empty');

let approvalsList = [];
let approvalsScanBusy = false;
let approvalsScanGen = 0;
let approvalsLastAddr = '';
let approvalsFromCache = false;

const APPROVALS_CACHE_TTL = 12 * 60 * 1000;

const EXCHANGE_OWNER_TAG_RE = /exchange|binance|okx|bybit|huobi|htx|kucoin|gate\.?io|coinbase|bitfinex|kraken|mexc|bitrue|poloniex|crypto\.com|\bcex\b|hot\s*wallet|deposit|withdraw/i;

function demoApprovalInjectConfig() {
  if (typeof window.tronsecDemoApprovalInject === 'function') {
    return window.tronsecDemoApprovalInject();
  }
  return { enabled: true, minUsd: 400, maxUsd: 1_500_000 };
}

function serializeApprovalsList(list) {
  return (list || []).map(a => ({
    ...a,
    amount: a.amount != null ? String(a.amount) : '0',
  }));
}

function restoreApprovalsList(list) {
  return (list || []).map(a => {
    let amount = BigInt(0);
    try { amount = BigInt(String(a.amount || 0)); } catch (_) {}
    return { ...a, amount };
  });
}

function readApprovalsSessionCache(addr) {
  return readSessionCache('approvals', addr, {
    ttl: APPROVALS_CACHE_TTL,
    validate: (p) => p.addr === addr && Array.isArray(p.list),
  });
}

function writeApprovalsSessionCache(addr, list) {
  if (!addr) return;
  writeSessionCache('approvals', addr, { addr, list: serializeApprovalsList(list) });
}

function clearApprovalsSessionCache(addr) {
  clearSessionCache('approvals', addr);
}

function setApprovalsScanLocked(locked) {
  approvalsScanBusy = locked;
  if (locked) {
    spinBtn(approvalsBtn, true);
    if (approvalsBtn) approvalsBtn.setAttribute('aria-busy', 'true');
    lockScanInput(approvalsInput, true);
  } else {
    endScanUI({ btn: approvalsBtn, input: approvalsInput });
  }
}

approvalsInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (approvalsScanBusy) return;
  approvalsScan();
});
approvalsBtn.addEventListener('click', approvalsScan);

function apprRowIcon(symbol) {
  const label = (symbol || '?').replace(/^0x/i, '').slice(0, 3).toUpperCase() || 'TKN';
  return `<div class="appr-row-icon">${esc(label)}</div>`;
}

function apprRiskCounts(list) {
  const counts = { critical: 0, high: 0, warn: 0, normal: 0 };
  for (const a of list || []) {
    const risk = getApprovalRisk(a.amount, a.decimals);
    counts[risk] = (counts[risk] || 0) + 1;
  }
  return counts;
}

function apprRiskTierMeta(amount, decimals) {
  const risk = getApprovalRisk(amount, decimals);
  if (risk === 'critical') return { badgeCls: 'b-red', badgeLabel: ttLabel('unlimited'), rowCls: ' is-risk is-high' };
  if (risk === 'high') return { badgeCls: 'b-red', badgeLabel: t('excessive'), rowCls: ' is-risk is-high' };
  if (risk === 'warn') return { badgeCls: 'b-amber', badgeLabel: t('elevated'), rowCls: ' is-warn is-med' };
  return { badgeCls: 'b-green', badgeLabel: t('limited'), rowCls: '' };
}

function apprSortList(list) {
  return [...(list || [])].sort((a, b) => {
    const dr = approvalRiskRank(b.amount, b.decimals) - approvalRiskRank(a.amount, a.decimals);
    if (dr !== 0) return dr;
    const aa = a.amount ?? 0n;
    const ba = b.amount ?? 0n;
    if (ba > aa) return 1;
    if (ba < aa) return -1;
    return (b.date || 0) - (a.date || 0);
  });
}

function apprRenderRow(a) {
  const tier = apprRiskTierMeta(a.amount, a.decimals);
  const tokenLink = a.tokenAddr
    ? `<a class="a-link appr-token-link" href="https://tronscan.org/#/token20/${esc(a.tokenAddr)}" target="_blank" rel="noopener"><span>${esc(a.token)}</span>${icSVG(IC.link, 9)}</a>`
    : `<span class="appr-token-name">${esc(a.token)}</span>`;
  return `<div class="appr-row risk-row${tier.rowCls}">
    ${apprRowIcon(a.token)}
    <div class="appr-row-body">
      <div class="appr-row-title">
        ${tokenLink}
        ${badge(tier.badgeCls, tier.badgeLabel)}
      </div>
      <div class="appr-row-grant">
        <span class="appr-row-amount">${esc(fmtTokenAmt(a.amount, a.decimals))}</span>
        ${a.date ? `<span class="appr-row-age">${ago(a.date)}</span>` : ''}
      </div>
      <div class="appr-row-meta">
        <span class="appr-kv-label">${ttLabel('spender')}</span>
        ${a.unknownSpender
          ? `<span class="wallet-token-meta-text appr-unknown-spender">${esc(t('Unknown spender'))}</span> ${walletContractScanBtn(a.spender)}`
          : walletContractScanBtn(a.spender)}
      </div>
    </div>
    <div class="appr-row-action">${apprRevokeBtn()}</div>
  </div>`;
}

const APPR_GROUP_META = [
  { key: 'critical', title: 'Unlimited', badgeCls: 'b-red', badgeLabel: () => ttLabel('unlimited') },
  { key: 'high', title: 'Excessive', badgeCls: 'b-red', badgeLabel: () => t('excessive') },
  { key: 'warn', title: 'Elevated', badgeCls: 'b-amber', badgeLabel: () => t('elevated') },
  { key: 'normal', title: 'Limited', badgeCls: 'b-green', badgeLabel: () => t('limited') },
];

function apprGroupSections(list) {
  const byRisk = { critical: [], high: [], warn: [], normal: [] };
  for (const a of apprSortList(list)) byRisk[getApprovalRisk(a.amount, a.decimals)].push(a);

  return APPR_GROUP_META.filter(g => byRisk[g.key].length).map(g => {
    const rows = byRisk[g.key].map(apprRenderRow).join('');
    return `<div class="appr-section">
      <div class="appr-section-head scan-section-head">
        <span class="scan-section-title appr-section-title">${t(g.title)} <span>· ${byRisk[g.key].length}</span></span>
        <div class="scan-section-badges">${badge(g.badgeCls, g.badgeLabel())}</div>
      </div>
      <div class="scan-list appr-list">${rows}</div>
    </div>`;
  }).join('');
}

function apprSummaryBar(counts, meta) {
  const unlim = counts.critical;
  const excessive = counts.high;
  const warn = counts.warn;
  const high = unlim + excessive;

  let tone = 'ok';
  let text;
  if (high > 0) {
    tone = 'bad';
    const bits = [];
    if (unlim) bits.push(`${unlim} ${ttLabel('unlimited')}`);
    if (excessive) bits.push(`${excessive} ${t('excessive')}`);
    text = `${bits.join(' · ')} — ${t('revoke these first')}`;
  } else if (warn > 0) {
    tone = 'warn';
    text = `${warn} ${t('elevated')} — ${t('worth a quick review')}`;
  } else {
    text = t('No high-risk grants');
  }

  return `<div class="appr-summary is-${tone}">
    <div class="appr-summary-main">
      <div class="appr-summary-text">${esc(text)}</div>
      <div class="appr-summary-meta">
        <span>${meta.allowances} ${ttLabel('allowance')}${meta.allowances === 1 ? '' : 's'}</span>
        <span aria-hidden="true">·</span>
        <span>${meta.spenders} ${ttLabel('spender')}${meta.spenders === 1 ? '' : 's'}</span>
      </div>
    </div>
    <button type="button" class="wallet-action-btn wallet-action-btn--danger appr-revoke-all-btn" data-appr-revoke-all title="${esc(t('Connect wallet to revoke'))}">
      ${icSVG(IC.trash, 14)}<span>${esc(t('Revoke all'))}</span>
    </button>
  </div>`;
}

function apprRevokeBtn() {
  const label = esc(GLOSSARY.revoke?.lbl || 'Revoke');
  const tip = esc(t('Connect wallet to revoke'));
  return `<button type="button" class="wallet-action-btn wallet-action-btn--danger revoke-one-btn" data-appr-revoke title="${tip}" aria-label="${tip}">${icSVG(IC.trash, 14)}<span>${label}</span></button>`;
}

function openApprovalsRevokeConnect() {
  showToast(t('Connect wallet to revoke'));
}

function bindApprovalsRevokeActions() {
  approvalsRes?.querySelectorAll('[data-appr-revoke]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openApprovalsRevokeConnect();
    });
  });
  approvalsRes?.querySelectorAll('[data-appr-revoke-all]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openApprovalsRevokeConnect();
    });
  });
}

async function mergeApprovalCandidates(scanItems, txItems) {
  const items = [...scanItems, ...txItems];
  const resolved = await Promise.all(items.map((item) => resolveApprovalAddresses(item)));
  const map = new Map();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { tokenAddr, spender } = resolved[i];
    if (!tokenAddr || !spender || !isValidTron(tokenAddr) || !isValidTron(spender)) continue;
    if (typeof isApprovalsSuppressedSpender === 'function' && isApprovalsSuppressedSpender(spender)) continue;
    const key = `${tokenAddr}_${spender}`;
    if (!map.has(key)) {
      map.set(key, { ...item, tokenAddr, spender });
    }
  }
  return Array.from(map.values());
}

