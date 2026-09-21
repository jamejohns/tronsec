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
