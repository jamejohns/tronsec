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
