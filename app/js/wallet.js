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
      if (ageDays < 7) { score += 10; scoreFactors.push({ label: 'Account age under 7 days', pts: 10 }); }
      else if (ageDays < 30) { score += 5; scoreFactors.push({ label: 'Account age under 30 days', pts: 5 }); }
    } else if (txCount > 0) {
      score += 5;
      scoreFactors.push({ label: 'Account creation date unknown', pts: 5 });
    }
  }

  for (const h of heuristics) {
    if (/sweep/i.test(h)) { score += 12; scoreFactors.push({ label: h, pts: 12 }); }
    else if (/dormant|inactive/i.test(h)) { score += 5; scoreFactors.push({ label: h, pts: 5 }); }
    else { score += 6; scoreFactors.push({ label: h, pts: 6 }); }
  }

  const approvals = onChainApprovals || [];
  if (approvals.length > 0) {
    const pts = Math.min(20, approvals.length * 2);
    score += pts;
    scoreFactors.push({
      label: approvals.length > 1 ? '{count} active on-chain approvals' : '1 active on-chain approval',
      labelVars: approvals.length > 1 ? { count: approvals.length } : undefined,
      pts,
    });
  }

  let unlimited = 0;
  let elevated = 0;
  for (const a of approvals) {
    const risk = getApprovalRisk(a.amount, a.decimals);
    if (risk === 'critical') unlimited += 1;
    else if (risk === 'high' || risk === 'warn') elevated += 1;
  }
  if (unlimited > 0) {
    score += unlimited * 18;
    scoreFactors.push({
      label: unlimited > 1 ? '{count} unlimited allowances' : '1 unlimited allowance',
      labelVars: unlimited > 1 ? { count: unlimited } : undefined,
      pts: unlimited * 18,
      tier: 'hard',
    });
  }
  if (elevated > 0) {
    score += elevated * 8;
    scoreFactors.push({
      label: elevated > 1 ? '{count} elevated allowances' : '1 elevated allowance',
      labelVars: elevated > 1 ? { count: elevated } : undefined,
      pts: elevated * 8,
    });
  }

  if (typeof amlAddHardSignals === 'function') {
    score += amlAddHardSignals(hardFlags, scoreFactors);
  } else {
    for (const label of hardFlags) {
      score += 40;
      scoreFactors.unshift({ label, pts: 40, tier: 'hard' });
    }
  }

  score = Math.max(0, score);
  const finalScore = Math.min(100, Math.round(score));
  const hasHardSignals = hardFlags.length > 0 || unlimited > 0;
  let status;
  let statusLabel;
  if (isFlagged || (hasHardSignals && finalScore >= 70)) {
    status = 'flagged';
    statusLabel = 'Flagged';
  } else if (txCount === 0 && !heuristics.length) {
    status = 'insufficient';
    statusLabel = 'Insufficient data';
  } else if (finalScore >= 40) {
    status = 'unusual';
    statusLabel = 'Elevated risk';
  } else if (finalScore >= 15) {
    status = 'unusual';
    statusLabel = 'Review recommended';
  } else {
    status = 'normal';
    statusLabel = 'Low risk';
  }

  return {
    finalScore,
    status,
    statusLabel,
    isFlagged: isFlagged || hasHardSignals,
    hasHardSignals,
    scoreFactors,
    hardFlags,
    unlimitedCount: unlimited,
    approvalCount: approvals.length,
  };
}

function walletBuildSummaryText(report) {
  if (!report) return '';
  const r = report.riskReport || {};
  const lines = [
    'TRONSEC — Wallet scan summary',
    `Address: ${report.addr}`,
    `Scanned: ${new Date(report.scannedAt).toISOString()}`,
    `Risk score: ${r.finalScore ?? '—'}/100 — ${t(r.statusLabel || 'Unknown')}`,
    `Portfolio (est.): $${(report.totalPortfolioUsd || 0).toFixed(2)} · ${report.trxBal?.toFixed(2) || '0'} TRX`,
    `Transactions: ${report.txCount}`,
    `Active on-chain approvals: ${report.approvalCount}`,
  ];
  if (r.unlimitedCount > 0) lines.push(`Unlimited allowances: ${r.unlimitedCount}`);
  if (r.hardFlags?.length) lines.push(`Security flags: ${r.hardFlags.map(f => t(f)).join('; ')}`);
  if (r.scoreFactors?.length) {
    lines.push('Signals:');
    r.scoreFactors.slice(0, 8).forEach(f => lines.push(`  ${t(f.label)} (${f.pts > 0 ? '+' : ''}${f.pts})`));
  }
  lines.push('', t('This report summarizes public on-chain data and security heuristics for a TRON wallet. It is not financial or legal advice.'));
  return lines.join('\n');
}

async function walletExportPdf(report) {
  const api = window.tronsecAmlPdf;
  if (!report || !api?.AmlPdfWriter) {
    showToast(t('PDF export failed'));
    return;
  }
  const btn = document.getElementById('wallet-export-pdf-btn');
  if (btn) btn.classList.add('is-busy');
  try {
    await api.ensurePdfBrandAssets();
    const { AmlPdfWriter, AML_PDF, amlPdfStatusColor } = api;
    const reportId = `WLT-${report.addr.slice(-8).toUpperCase()}`;
    const pdf = new AmlPdfWriter(reportId);
    const m = pdf.margin;
    const r = report.riskReport || {};
    const scoreColor = amlPdfStatusColor(r.status, r.isFlagged);
    const stamp = new Date(report.scannedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    pdf.drawReportHeader({
      title: t('WALLET SCAN REPORT'),
      moduleLabel: t('Wallet scanner'),
      stamp,
      reportId,
    });

    pdf.drawScoreCard({
      score: r.finalScore ?? '—',
      scoreColor,
      statusLabel: t(r.statusLabel || 'Unknown'),
      subtitle: t('Wallet risk signal'),
      meta: t('On-chain profile + security heuristics'),
      address: report.addr,
      addressLabel: t('SUBJECT ADDRESS'),
    });

    if (r.hardFlags?.length) {
      pdf.section(t('Security flags'));
      r.hardFlags.forEach(flag => pdf.bullet(t(flag), AML_PDF.red));
    }
    if (r.scoreFactors?.length) {
      pdf.section(t('Signal breakdown'));
      r.scoreFactors.forEach(f => {
        const lines = pdf.wrapText(i18nFactorLabel(f), pdf.W - m * 2 - 70, 8.5, 'sans');
        pdf.need(lines.length * 12 + 4);
        lines.forEach((line, i) => {
          pdf.text(m, pdf.cursorY, line, 8.5, 'sans', AML_PDF.text2);
          if (i === 0) {
            const ptsColor = f.pts < 0 ? AML_PDF.green : f.pts >= 15 ? AML_PDF.red : AML_PDF.amber;
            pdf.textRight(pdf.W - m, pdf.cursorY, `${f.pts > 0 ? '+' : ''}${f.pts}`, 8.5, 'mono', ptsColor, true);
          }
          pdf.cursorY -= 12;
        });
        pdf.cursorY -= 2;
      });
    }

    pdf.section(t('On-chain summary'));
    pdf.row(t('Estimated portfolio'), report.totalPortfolioUsd > 0 ? `$${report.totalPortfolioUsd.toFixed(2)}` : '—');
    pdf.row(t('TRX balance'), `${report.trxBal?.toFixed(2) || '0'} TRX`);
    pdf.row(t('Total transactions'), String(report.txCount));
    pdf.row(t('Active on-chain approvals'), String(report.approvalCount));
    if (report.ageDays != null) pdf.row(t('Account age'), `${report.ageDays} days`);
    if (report.trc20?.length) {
      pdf.section(t('Token holdings'));
      report.trc20.slice(0, 8).forEach(tok => {
        pdf.row(tok.symbol, `${tok.balance.toFixed(4)}${tok.priceInUsd > 0 ? ` · $${(tok.balance * tok.priceInUsd).toFixed(2)}` : ''}`);
      });
    }

    pdf.disclaimerBox(t('This report summarizes public on-chain data and security heuristics for a TRON wallet. It is not financial or legal advice.'));
    const fname = `TRONSEC-Wallet-${report.addr.slice(0, 6)}${report.addr.slice(-4)}-${new Date(report.scannedAt).toISOString().slice(0, 10)}.pdf`;
    pdf.download(fname);
    showToast(t('PDF report downloaded'));
  } catch (_) {
    showToast(t('PDF export failed'));
  } finally {
    if (btn) btn.classList.remove('is-busy');
  }
}

function walletCopySummary(report) {
  const text = walletBuildSummaryText(report);
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => showToast(t('Summary copied'))).catch(() => showToast(t('Copy failed')));
}

function setWalletScanLocked(locked) {
  walletScanBusy = locked;
  if (locked) {
    spinBtn(walletBtn, true);
    if (walletBtn) walletBtn.setAttribute('aria-busy', 'true');
    lockScanInput(walletInput, true);
  } else {
    endScanUI({ btn: walletBtn, input: walletInput });
  }
}

function buildInactiveAccount(scanProfile) {
  const sp = scanProfile || {};
  const bw = sp.bandwidth || {};
  const balRaw = sp.balance ?? sp.trxBalance;
  let balance = 0;
  if (balRaw != null && balRaw !== '') {
    const n = Number(balRaw);
