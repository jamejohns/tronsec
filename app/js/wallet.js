// ==================================
//  WALLET PAGE
// ==================================
const walletInput = document.getElementById('wallet-input');
const walletBtn   = document.getElementById('wallet-scan-btn');
const walletErr   = document.getElementById('wallet-err');
const walletRes   = document.getElementById('wallet-result');
const walletEmpty = document.getElementById('wallet-empty');

let walletData = null;
let walletTxs = [];
let walletHasMore = false;
let walletOldestTs = 0;
let txShowCount = 10;
let loadMoreBusy = false;
let walletScanBusy = false;
let walletScanGen = 0;
let walletFromCache = false;

const WALLET_CACHE_TTL = 12 * 60 * 1000;

function readWalletSessionCache(addr) {
  return readSessionCache('wallet', addr, {
    ttl: WALLET_CACHE_TTL,
    validate: (p) => p.addr === addr,
  });
}

function writeWalletSessionCache(snapshot) {
  if (!snapshot?.addr) return;
  writeSessionCache('wallet', snapshot.addr, snapshot);
}

function clearWalletSessionCache(addr) {
  clearSessionCache('wallet', addr);
}

function serializeWalletApprovals(list) {
  return (list || []).map(a => ({
    ...a,
    amount: a.amount != null ? String(a.amount) : '0',
  }));
}

function restoreWalletApprovals(list) {
  return (list || []).map(a => {
    let amount = BigInt(0);
    try { amount = BigInt(String(a.amount || 0)); } catch (_) {}
    return { ...a, amount };
  });
}

function restoreWalletFromCache(cached) {
  walletData = {
    acc: cached.acc,
    trc20: cached.trc20 || [],
    addr: cached.addr,
    scanProfile: cached.scanProfile || {},
    secAcc: cached.secAcc || null,
    tags: cached.tags || [],
    approvalCount: cached.approvalCount || 0,
    onChainApprovals: restoreWalletApprovals(cached.onChainApprovals),
    riskReport: cached.riskReport || null,
  };
  walletTxs = cached.walletTxs || [];
  walletHasMore = !!cached.walletHasMore;
  walletOldestTs = cached.walletOldestTs || 0;
  txShowCount = cached.txShowCount || 10;
  walletFromCache = true;
  window._walletLastReport = buildWalletReportSnapshot();
}

function buildWalletReportSnapshot() {
  if (!walletData) return null;
  const { acc, trc20, addr, scanProfile, secAcc, tags, approvalCount, onChainApprovals, riskReport } = walletData;
  const trxBal = (acc?.balance || 0) / 1_000_000;
  const tokenUsd = t => (t.priceInUsd > 0) ? t.balance * t.priceInUsd : null;
  const trc20UsdTotal = (trc20 || []).reduce((sum, t) => sum + (tokenUsd(t) || 0), 0);
  const totalPortfolioUsd = (TRX_PRICE != null ? trxBal * TRX_PRICE : 0) + trc20UsdTotal;
  const createdTs = acc?.create_time || scanProfile?.date_created || scanProfile?.createTime;
  return {
    addr,
    scannedAt: Date.now(),
    acc,
    trc20,
    scanProfile,
    secAcc,
    tags,
    approvalCount,
    onChainApprovals: onChainApprovals || [],
    riskReport,
    walletTxs,
    trxBal,
    totalPortfolioUsd,
    txCount: Math.max(walletTxs.length, Number(scanProfile?.totalTransactionCount ?? scanProfile?.transactions ?? 0) || 0),
    createdTs,
    ageDays: createdTs ? Math.round((Date.now() - createdTs) / 86400000) : null,
  };
}

function computeWalletRisk(ctx) {
  const {
    security, heuristics, onChainApprovals, ageDays, txCount, isFlagged,
  } = ctx;
  let score = 0;
  const scoreFactors = [];
  const hardFlags = (security?.flags || []).filter(f => /blacklist|fraud|scam|phish|sanction|malicious|hack|exploit/i.test(f));

  if (txCount > 0 || heuristics.length) {
    if (ageDays !== null) {
