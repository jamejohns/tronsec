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
    if (Number.isFinite(n)) balance = n;
  }
  return {
    balance,
    free_net_usage: sp.freeNetUsed ?? bw.freeNetUsed ?? bw.netUsed ?? 0,
    free_net_limit: sp.freeNetLimit ?? bw.freeNetLimit ?? bw.netLimit ?? 1500,
    EnergyUsed: sp.energyUsed ?? bw.energyUsed ?? 0,
    EnergyLimit: sp.energyLimit ?? bw.energyLimit ?? 0,
    frozenV2: normalizeFrozenV2(sp.frozenV2 ?? sp.frozen),
    create_time: sp.date_created || sp.createTime || sp.create_time,
    latest_opration_time: sp.latest_operation_time || sp.latestOperationTime || sp.latest_operation_time,
    _inactive: true,
  };
}

walletInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (walletScanBusy) return;
  walletScan();
});
walletBtn.addEventListener('click', walletScan);

function addrCell(a, addr) {
  if (!a) return '<span class="mono" style="font-size:11px;color:var(--text-3)">?</span>';
  return a === addr
    ? '<span class="mono" style="font-weight:600;color:var(--info);font-size:11px">You</span>'
    : `<a class="a-link" style="display:inline-flex;align-items:center;gap:3px;font-size:11px" href="https://tronscan.org/#/address/${esc(a)}" target="_blank">${esc(short(a))} ${icSVG(IC.link, 9)}</a>`;
}

function walletTag(text, variant) {
  if (text == null || text === '') {
    return `<span class="wallet-tag${variant ? ` is-${variant}` : ''}"></span>`;
  }
  const s = String(text);
  const inner = (s.includes('<') || s.includes('class="term"')) ? s : esc(t(s));
  return `<span class="wallet-tag${variant ? ` is-${variant}` : ''}">${inner}</span>`;
}

function walletMeter(label, used, total, tone) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const free = Math.max(0, total - used);
  return `<div class="wallet-meter">
    <div class="wallet-meter-head">
      <span class="wallet-meter-label">${t(label)}</span>
      <span class="wallet-meter-val">${t('{free} free · {pct}% used', { free: fmtNum(free), pct })}</span>
    </div>
    <div class="wallet-meter-track"><div class="wallet-meter-fill is-${tone}" style="width:${pct}%"></div></div>
  </div>`;
}

function parseAccountTags(tagAcc) {
  return normalizeTagList(tagAcc)
    .map((t) => (typeof t === 'string' ? t : (t.tagName || t.tag || t.label || '')))
    .filter(Boolean);
}

function walletFlagLabel(flag) {
  if (typeof flag === 'string' && flag.startsWith('TronScan tag: ')) {
    return t('TronScan tag: {tag}', { tag: flag.slice('TronScan tag: '.length) });
  }
  return t(flag);
}

function buildWalletSecurity(secAcc, tags, heuristics) {
  const flags = [...heuristics];
  if (secAcc) {
  if (secAcc.is_black_list) flags.push('Blacklisted by stablecoin issuer');
  if (secAcc.has_fraud_transaction) flags.push('Flagged fraud transactions');
  if (secAcc.fraud_token_creator) flags.push('Created fraud tokens');
  if (secAcc.send_ad_by_memo) flags.push('Spam / ad memo activity');
  if (secAcc.has_cheat_transaction) flags.push('Suspicious cheat transactions');
  }
  for (const tag of tags) {
    if (/scam|phish|fraud|blacklist|sanction|malicious|hack|exploit/i.test(tag)) {
      flags.push(`TronScan tag: ${tag}`);
    }
  }
  const hard = flags.filter(f => /blacklist|fraud|scam|phish|sanction|malicious|hack|exploit/i.test(f));
  const level = hard.length ? 'bad' : flags.length ? 'warn' : 'clean';
  return { level, flags };
}

function walletContractScanBtn(addr) {
  if (!addr || !isValidTron(addr)) {
    return `<span class="wallet-token-meta-text">${esc(addrLabel(addr) || '—')}</span>`;
  }
  return `<button type="button" class="wallet-inline-link wallet-contract-scan-btn" data-addr="${esc(addr)}" title="${esc(addr)}">${esc(addrLabel(addr))}</button>`;
}

function walletTxHashBtn(hash) {
  if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) return '';
  return `<button type="button" class="wallet-inline-link wallet-tx-decode-btn" data-hash="${esc(hash)}" title="${esc(hash)}">${esc(addrLabel(hash))}</button>`;
}

function buildActivityItem(tx, addr) {
  const c = tx.raw_data?.contract?.[0];
  const rawVal = c?.parameter?.value || {};
  const time = tx.block_timestamp ? ago(tx.block_timestamp) : '—';
  const txHash = tx.txID || tx.transaction_id || tx.hash || tx.tx_id || '';
  const isTrc20 = tx._isTrc20 || tx.token_info || tx.token_amount != null || (tx.type && String(tx.type).toLowerCase().includes('trc20')) || !!tx.tokenInfo;
  let iconCls, iconPath, title, meta, amountHtml;

  if (isTrc20) {
    const tokenInfo = tx.token_info || tx.tokenInfo || {};
    const decimals = parseInt(tx.token_decimals || tokenInfo.decimals || tokenInfo.tokenDecimal || 6);
    const symbol = tokenInfo.tokenAbbr || tokenInfo.symbol || tokenInfo.tokenName || tokenInfo.name || tx.token_symbol || 'TOKEN';
    const amountRaw = Number(tx.token_amount || tx.value || rawVal.amount || 0);
    const amount = amountRaw / Math.pow(10, decimals || 6);
    const from = rawVal.owner_address || tx.from || null;
    const to = rawVal.to_address || tx.to || null;
    const isIn = sameTronAddr(to, addr);
    iconCls = isIn ? 'is-in' : 'is-out';
    iconPath = isIn ? IC.arrowDown : IC.arrowUp;
    title = isIn ? t('Received {symbol}', { symbol }) : t('Sent {symbol}', { symbol });
    meta = isIn ? t('from {addr}', { addr: addrLabel(from || '?') }) : t('to {addr}', { addr: addrLabel(to || '?') });
    amountHtml = `<div class="wallet-activity-amt ${isIn ? 'tx-amt-in' : 'tx-amt-out'}">${isIn ? '+' : '-'}${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>`;
  } else {
    const type = c?.type || 'Unknown';
    const val = rawVal;
    const from = val?.owner_address || null;
    const to = val?.to_address || null;
    const amount = val?.amount || val?.call_value || 0;
    const isIn = type === 'TransferContract' && sameTronAddr(to, addr);
    const isOut = type === 'TransferContract' && sameTronAddr(from, addr);
    if (isIn) { iconCls = 'is-in'; iconPath = IC.arrowDown; title = t('Received TRX'); meta = t('from {addr}', { addr: addrLabel(from || '?') }); }
    else if (isOut) { iconCls = 'is-out'; iconPath = IC.arrowUp; title = t('Sent TRX'); meta = t('to {addr}', { addr: addrLabel(to || '?') }); }
    else {
      iconCls = 'is-neutral';
      iconPath = IC.activity;
      title = type.replace('Contract', '').replace(/([A-Z])/g, ' $1').trim() || t('Contract call');
      meta = addrLabel(to || from || '?');
    }
    amountHtml = amount
      ? `<div class="wallet-activity-amt ${isIn ? 'tx-amt-in' : isOut ? 'tx-amt-out' : 'tx-amt-neutral'}">${isIn ? '+' : isOut ? '-' : ''}${toTRX(amount)} TRX</div>`
      : `<div class="wallet-activity-amt tx-amt-neutral">—</div>`;
  }

  const hashBtn = walletTxHashBtn(txHash);
  const metaHtml = hashBtn
    ? `<span class="wallet-activity-route">${esc(meta)}</span><span class="wallet-activity-hash">${hashBtn}</span>`
    : `<span class="wallet-activity-route">${esc(meta)}</span>`;

  return `<div class="wallet-activity-item">
    <div class="wallet-activity-icon ${iconCls}">${icSVG(iconPath, 14)}</div>
    <div class="wallet-activity-body">
      <div class="wallet-activity-title">${esc(title)}</div>
      <div class="wallet-activity-meta">${metaHtml}</div>
    </div>
    <div>
      ${amountHtml}
      <div class="wallet-activity-time">${time}</div>
    </div>
  </div>`;
}

function walletLoadMoreBtn(busy) {
  if (busy) {
    return `<button type="button" class="wallet-load-more-btn" disabled><span class="spin"></span><span>${t('Loading...')}</span></button>`;
  }
  return `<button type="button" class="wallet-load-more-btn" onclick="loadMoreTxs()">${icSVG(IC.arrowDown, 14)}<span>${t('Load more activity')}</span></button>`;
}

function walletActionBtn(opts) {
  return scanActionBtn(opts);
}

function walletGoBtn({ id, label, go, tone }) {
  const cls = `wallet-action-btn wallet-go-btn${tone ? ` wallet-go-btn--${tone}` : ''}`;
  const lbl = esc(t(label));
  return `<button type="button" class="${cls}" id="${id}" data-wallet-go="${esc(go)}" aria-label="${lbl}">${lbl} ${icSVG(IC.link, 12)}</button>`;
}

function walletRiskStat(status, statusLabel, finalScore, isFlagged, hasHardSignals) {
  if (typeof amlRiskClass !== 'function') return '';
  const cls = amlRiskClass(status, isFlagged);
  const scoreText = status === 'insufficient' && !hasHardSignals
    ? '—'
    : `<span class="score-value" data-score-value="${finalScore}">0</span><span class="aml-score-unit">/100</span>`;
  const meter = (status !== 'insufficient' || hasHardSignals)
    ? `<div class="aml-risk-meter"><div class="aml-risk-meter-fill ${cls}" data-score-pct="${finalScore}" style="width:4%"></div></div>`
    : '';
  return `<div class="an-stat risk-stat risk-stat--wallet wallet-risk-stat">
    <div class="an-stat-label">${t('Wallet risk signal')}</div>
    <div class="wallet-risk-scope">${t('Heuristic score — not an AML check')}</div>
    <div class="risk-stat__body wallet-risk-body">
      <div class="risk-stat__text">
        <div class="an-stat-value ${cls}">${scoreText}</div>
        <div class="an-stat-sub">${esc(t(statusLabel))}</div>
        ${meter}
      </div>
    </div>
  </div>`;
}

function buildWalletNextSteps({ addr, riskReport, approvalCount, unlimitedCount, security, permissionLayout }) {
  const steps = [];
  const score = riskReport?.finalScore ?? 0;
  const perm = permissionLayout || {};

  if (perm.isMultisig) {
    steps.push({
      tone: perm.hasRiskyExternal ? 'amber' : undefined,
      title: perm.hasRiskyExternal
        ? t('Risky external permission controller')
        : t('Multisig account permissions'),
      desc: perm.hasRiskyExternal
        ? t('An external address can act without this wallet — audit permissions before trusting funds here.')
        : t('Co-signed layout — open Permission Auditor to review signers and thresholds.'),
      go: 'permissions',
      label: 'Audit permissions',
      primary: !unlimitedCount && !perm.hasRiskyExternal,
    });
  }

  if (unlimitedCount > 0) {
    steps.push({
      tone: 'red',
      title: unlimitedCount > 1
        ? t('{count} unlimited allowances detected', { count: unlimitedCount })
        : t('1 unlimited allowance detected'),
      desc: t('Spenders can drain approved tokens at any time. Open Approvals to review and revoke.'),
      go: 'approvals',
      label: 'Review approvals',
      primary: true,
    });
  } else if (approvalCount > 0) {
    steps.push({
      tone: 'amber',
      title: approvalCount > 1
        ? t('{count} active on-chain approvals', { count: approvalCount })
        : t('1 active on-chain approval'),
      desc: t('Check who can move tokens from this wallet and revoke unused spenders.'),
      go: 'approvals',
      label: 'Open Approvals',
      primary: true,
    });
  }

  if (security?.level === 'bad' || riskReport?.hardFlags?.length) {
    steps.push({
      tone: 'red',
      title: t('Security flags on this address'),
      desc: t('Run a full AML check for counterparty exposure and transaction patterns.'),
      go: 'aml',
      label: 'Run AML check',
      primary: !steps.length,
    });
  } else if (score >= 40) {
    steps.push({
      tone: 'amber',
      title: t('Elevated wallet risk ({score}/100)', { score }),
      desc: t('AML screening adds peer graph, concentration, and deeper transaction analysis.'),
      go: 'aml',
      label: 'Run AML check',
      primary: !steps.length,
    });
  } else if (score >= 15 && approvalCount === 0) {
    steps.push({
      tone: 'amber',
      title: t('Patterns worth a second look'),
      desc: t('Optional: run AML for a fuller risk picture on this address.'),
      go: 'aml',
      label: 'Run AML check',
      primary: false,
    });
  }

  if (!steps.length) return '';

  const rows = steps.map((step, i) => `
    <div class="wallet-next-step${step.tone ? ` is-${step.tone}` : ''}${step.primary ? ' is-primary' : ''}">
      <div class="wallet-next-step-body">
        <div class="wallet-next-step-title">${esc(step.title)}</div>
        <div class="wallet-next-step-desc">${esc(step.desc)}</div>
      </div>
      ${walletGoBtn({ id: `wallet-go-${step.go}-${i}`, label: step.label, go: step.go, tone: step.tone })}
    </div>`).join('');

  return `<div class="wallet-next-steps">
    <div class="wallet-next-steps-head">
      <span class="wallet-next-steps-title">${t('Recommended next steps')}</span>
      <span class="wallet-next-steps-hint">${t('Opens the module and runs the scan for this address')}</span>
    </div>
    <div class="wallet-next-steps-list">${rows}</div>
  </div>`;
}

function bindWalletGoButtons(root, addr) {
  (root || document).querySelectorAll('[data-wallet-go]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const go = btn.getAttribute('data-wallet-go');
      if (go === 'approvals') openApprovalsScan(addr);
      else if (go === 'aml') openAmlScan(addr);
      else if (go === 'permissions') openPermissionsScan(addr);
    });
  });
}

function qrRoundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function readQrMatrix(qrInstance) {
  const model = qrInstance?._oQRCode;
  if (!model?.getModuleCount || !model?.isDark) return null;
  const modules = model.getModuleCount();
  const matrix = [];
  for (let r = 0; r < modules; r++) {
    matrix[r] = [];
    for (let c = 0; c < modules; c++) {
      matrix[r][c] = model.isDark(r, c);
    }
  }
  return { matrix, modules };
}

function isFinderCell(r, c, modules) {
  if (r < 7 && c < 7) return true;
  if (r < 7 && c >= modules - 7) return true;
  if (r >= modules - 7 && c < 7) return true;
  return false;
}

function isLogoCell(r, c, modules) {
  const center = (modules - 1) / 2;
  const radius = Math.floor(modules * 0.1);
  return Math.abs(r - center) <= radius && Math.abs(c - center) <= radius;
}

function drawBrandedQrCanvas(ctx, matrix, modules, size) {
  const pad = 14;
  const area = size - pad * 2;
  const cell = area / modules;

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#141416');
  grad.addColorStop(1, '#09090a');
  ctx.fillStyle = grad;
  qrRoundRect(ctx, 0, 0, size, size, 16);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,.09)';
  ctx.lineWidth = 1;
  qrRoundRect(ctx, 0.5, 0.5, size - 1, size - 1, 16);
  ctx.stroke();

  ctx.fillStyle = '#f5f5f7';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (!matrix[r][c] || isLogoCell(r, c, modules)) continue;
      const x = pad + c * cell;
      const y = pad + r * cell;
      const radius = isFinderCell(r, c, modules) ? cell * 0.42 : cell * 0.36;
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const TRONSEC_SHIELD_PATH = new Path2D('M32 8L12 18v12c0 10.8 8.2 20.8 20 24 11.8-3.2 20-13.2 20-24V18L32 8z');

function drawTronsecShieldMark(ctx, x, y, markSize) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(markSize / 64, markSize / 64);
  ctx.fillStyle = '#f5f5f7';
  ctx.fill(TRONSEC_SHIELD_PATH);
  ctx.restore();
}

function drawQrLogoPlate(ctx, size) {
  const box = Math.round(size * 0.19);
  const x = (size - box) / 2;
  const y = (size - box) / 2;

  ctx.fillStyle = '#09090a';
  qrRoundRect(ctx, x - 7, y - 7, box + 14, box + 14, 11);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = 1;
  qrRoundRect(ctx, x - 7.5, y - 7.5, box + 15, box + 15, 11);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(200,206,216,.18)';
  ctx.lineWidth = 1;
  qrRoundRect(ctx, x - 3.5, y - 3.5, box + 7, box + 7, 8);
  ctx.stroke();

  const inset = box * 0.24;
  drawTronsecShieldMark(ctx, x + inset, y + inset, box - inset * 2);
}

function renderBrandedQr(wrap, text, opts = {}) {
  const size = opts.size || 248;
  const temp = document.createElement('div');
  temp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
  document.body.appendChild(temp);

  const qr = new QRCode(temp, {
    text,
    width: size,
    height: size,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  });

  const parsed = readQrMatrix(qr);
  temp.remove();

  if (!parsed) {
    wrap.innerHTML = '';
    new QRCode(wrap, {
      text,
      width: size,
      height: size,
      colorDark: '#f5f5f7',
      colorLight: '#111113',
      correctLevel: QRCode.CorrectLevel.H,
    });
    return;
  }

  const { matrix, modules } = parsed;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'qr-branded-canvas';
  const ctx = canvas.getContext('2d');

  drawBrandedQrCanvas(ctx, matrix, modules, size);
  drawQrLogoPlate(ctx, size);
  wrap.innerHTML = '';
  wrap.appendChild(canvas);
}

function openWalletQr(addr, triggerEl) {
  const overlay = document.createElement('div');
  overlay.className = 'qr-modal-overlay';
  overlay.innerHTML = `
    <div class="qr-modal" role="dialog" aria-modal="true" aria-label="${t('Address QR code')}">
      <button type="button" class="qr-modal-close" id="qr-close" aria-label="${t('Close')}">${icSVG(IC.x, 16)}</button>
      <div class="qr-modal-brand">
        ${tronsecShieldMarkSvg(18)}
        <span>TRONSEC</span>
      </div>
      <div class="qr-modal-kicker">[ WALLET QR ]</div>
      <div class="qr-modal-title">${t('Scan to send TRX or tokens')}</div>
      <div class="qr-modal-addr">${esc(addr)}</div>
      <div class="qr-modal-frame">
        <div class="qr-modal-frame-glow"></div>
        <div id="qr-canvas-wrap" class="qr-canvas-wrap"></div>
      </div>
      <button type="button" class="wallet-action-btn qr-modal-copy" id="qr-copy-btn">${icSVG(IC.copy, 14)}<span>${t('Copy address')}</span></button>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-open')));

  renderBrandedQr(document.getElementById('qr-canvas-wrap'), addr, { size: 248 });

  let releaseFocus = null;
  const close = () => {
    releaseFocus?.();
    releaseFocus = null;
    overlay.classList.remove('is-open');
    overlay.classList.add('is-closing');
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = '';
      triggerEl?.focus?.();
    }, 280);
    document.removeEventListener('keydown', onEsc);
  };

  const modal = overlay.querySelector('.qr-modal');
  if (typeof trapFocus === 'function' && modal) {
    releaseFocus = trapFocus(modal, {
      initialFocus: document.getElementById('qr-close'),
      onEscape: close,
    });
  }

  document.getElementById('qr-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.getElementById('qr-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(addr).then(() => showToast(t('Address copied')));
  });
  const onEsc = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onEsc);
}

function kvRow(label, valueHtml, last) {
  return `<div class="kv-row${last ? ' kv-row--last' : ''}">
    <span class="kv-label">${kvLabel(label)}</span>
    <span class="kv-val">${valueHtml}</span>
  </div>`;
}

function bindWalletContractRedirect(addr) {
  bindContractScanRedirect(addr, 'wallet');
}

async function renderWalletContractRedirect(addr) {
  return renderContractScanRedirect(addr, {
    idPrefix: 'wallet',
    wrapperClass: 'wallet-scan',
    hintText: t('Wallet scanner profiles user accounts — portfolio, staking, and transfers. For contract addresses, review bytecode, ABI risks, and verification status instead.'),
    disclaimerHtml: `<p class="aml-disclaimer">${t('Wallet scan uses public on-chain data and heuristics. It is not AML compliance screening or investment advice.')}</p>`,
  });
}

async function walletScan(opts = {}) {
  if (walletScanBusy) return;
  const force = opts.force === true;
  const addr = walletInput.value.trim();
  setError(walletErr, '');
  if (!addr) { flashInput(walletInput); showToast(t('Enter a TRON address')); return; }
  if (!isValidTron(addr)) { flashInput(walletInput); showToast(t('Invalid TRON address — must start with T, 34 chars.')); return; }

  if (!force) {
    const cached = readWalletSessionCache(addr);
    if (cached) {
      hideScanEmpty(walletEmpty, { instant: true });
      restoreWalletFromCache(cached);
      renderWallet();
      showToast(t('Loaded from session cache'));
      return;
    }
  } else {
    clearWalletSessionCache(addr);
  }

  const gen = ++walletScanGen;
  walletFromCache = false;
  setWalletScanLocked(true);
  hideScanEmpty(walletEmpty);
  walletRes.innerHTML = SK.wallet();
  walletTxs = [];
  walletHasMore = false;
  walletOldestTs = 0;
  txShowCount = 10;

  try {
    try {
      if (await probeTronContract(addr)) {
        walletFromCache = false;
        hideScanEmpty(walletEmpty);
        walletRes.innerHTML = await renderWalletContractRedirect(addr);
        bindWalletContractRedirect(addr);
        return;
      }
    } catch (_) {}

    const [accRes, txRes, trc20TxRes, tokenRes, scanAcc, secAcc, tagAcc, scanApprovalRaw] = await Promise.all([
      gridGet(`/v1/accounts/${addr}`).catch(() => ({ data: [] })),
      gridGet(`/v1/accounts/${addr}/transactions`, { limit: 50, order_by: 'block_timestamp,desc' }).catch(() => ({ data: [] })),
      gridGet(`/v1/accounts/${addr}/transactions/trc20`, { limit: 100, order_by: 'block_timestamp,desc' }).catch(() => ({ data: [] })),
      scanGet('/account/tokens', { address: addr, start: 0, limit: 50 }).catch(() => null),
      scanGet('/account', { address: addr }).catch(() => null),
      scanGet('/security/account/data', { address: addr }).catch(() => null),
      scanGet('/account/tag', { address: addr }).catch(() => null),
      fetchTronScanApprovalList(addr).catch(() => []),
    ]);
    if (gen !== walletScanGen) return;

    const scanProfile = scanAcc?.data?.[0] || scanAcc || {};

    let trc20List = trc20TxRes?.data || [];
    if (!trc20List.length) {
      try {
        const scanFound = await fetchTrc20FromTronScan(addr).catch(() => []);
        if (scanFound.length) trc20List = trc20List.concat(scanFound);
      } catch (_) {}
    }

    let acc;
    if (accRes.data?.length) {
      acc = normalizeAccountRecord(accRes.data[0]);
    } else {
      const hasTrc20Bal = tokenRes?.data?.some(t => parseFloat(t.balance || 0) > 0);
      const hasNativeTxs = (txRes.data || []).length > 0;
      const hasTrc20Txs = trc20List.length > 0;
      const scanTxCount = Number(scanProfile.totalTransactionCount ?? scanProfile.transactions ?? scanProfile.transaction_count ?? 0) || 0;
      if (!hasTrc20Bal && !hasNativeTxs && !hasTrc20Txs && scanTxCount <= 0) {
        walletRes.innerHTML = '';
        setError(walletErr, t('Address not found or no on-chain activity.'));
        return;
      }
      acc = buildInactiveAccount(scanProfile);
    }

    const nativeTxs = txRes.data || [];
    walletHasMore = nativeTxs.length === 50;
    if (nativeTxs.length) walletOldestTs = nativeTxs[nativeTxs.length - 1].block_timestamp || 0;

    const onChainApprovals = await fetchActiveOnChainApprovals(addr, trc20List, nativeTxs, scanApprovalRaw);
    if (gen !== walletScanGen) return;
    const approvalCount = onChainApprovals.length;
    const MAX_U256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
    const normTrc20 = trc20List.filter(t => {
      if (t.type === 'Approval' || t.event_type === 'Approval') return false;
      const val = String(t.value || t.amount || t.quant || t.token_amount || t.transfer_amount || t.transferValue || t['amount_str'] || 0);
      return val !== MAX_U256;
    }).map(t => {
      const owner = t.owner_address || t.ownerAddress || t.owner || t.from || t.from_address || t.fromAddress || t.sender || t.account || null;
      const toAddr = t.to_address || t.toAddress || t.to || t.receiver || t.to_address_hex || null;
      let amount = t.value || t.amount || t.quant || t.token_amount || t.transfer_amount || t.transferValue || t['amount_str'] || 0;
      const tokenInfo = t.token_info || t.tokenInfo || t.token || t.token_data || {};
      const blockTs = Number(t.block_timestamp || t.block_ts || t.timestamp || t.block || t.date || t.time || 0) || 0;
      const decimals = parseInt(tokenInfo?.decimals || tokenInfo?.tokenDecimal || t.tokenDecimal || 6);
      const symbol = tokenInfo?.tokenAbbr || tokenInfo?.symbol || tokenInfo?.tokenName || tokenInfo?.name || t.tokenName || t.tokenAbbr || t.token || 'TOKEN';
      if (typeof amount === 'string' && amount.startsWith('0x')) {
        try { amount = parseInt(amount.slice(2), 16); } catch (_) { amount = Number(amount) || 0; }
      } else { amount = Number(amount || 0); }
      return {
        _isTrc20: true, type: t.type || t.event || 'TRC20', token_info: tokenInfo,
        txID: t.transaction_id || t.transaction_hash || t.hash || t.txID || t.tx_id || '',
        raw_data: { contract: [{ type: 'TriggerSmartContract', parameter: { value: { owner_address: owner, to_address: toAddr, amount } } }] },
        block_timestamp: blockTs, ret: [{ contractRet: t.contractRet || t.result || t.status || 'SUCCESS' }],
        from: owner, to: toAddr, value: amount, token_amount: amount, token_decimals: decimals, token_symbol: symbol,
      };
    });

    walletTxs = nativeTxs.concat(normTrc20).sort((a, b) => (b.block_timestamp || 0) - (a.block_timestamp || 0));

    let trc20 = [];
    if (tokenRes?.data?.length) {
      trc20 = tokenRes.data
        .filter(t => t.tokenType === 'trc20' && parseFloat(t.balance || 0) > 0)
        .map(t => {
          const decimals = parseInt(t.tokenDecimal || 6);
          const balance = parseFloat(t.balance || 0) / Math.pow(10, decimals);
          const priceInUsd = parseFloat(t.tokenPriceInUsd || t.priceInUsd || 0) || null;
          return {
            contract: t.tokenId || t.tokenContractAddress || '',
            symbol: t.tokenAbbr || t.tokenName || '—',
            name: t.tokenName || '',
            decimals,
            balance,
            priceInUsd,
          };
        })
        .filter(t => t.balance > 0);
    }

    await ensureTrxPrice();
    if (gen !== walletScanGen) return;
    const tags = parseAccountTags(tagAcc);

    const heuristics = [];
    if (acc._inactive) heuristics.push(t('Unactivated TRX account record'));
    if (walletTxs.length >= 10) {
      const transfers = walletTxs.filter(tx => tx.raw_data?.contract?.[0]?.type === 'TransferContract');
      if (transfers.length >= 5) {
        const uniq = new Set(transfers.map(tx => tx.raw_data?.contract?.[0]?.parameter?.value?.to_address)).size;
        if (uniq === 1) heuristics.push(t('Recent TRX sweep pattern detected'));
      }
    }
    const bwUsedPreview = acc.free_net_usage ?? acc.account_resource?.net_usage ?? scanProfile.freeNetUsed ?? 0;
    if (bwUsedPreview === 0 && (acc.balance || 0) < 1_000_000) heuristics.push(t('Dormant / low-activity account'));

    const security = buildWalletSecurity(secAcc, tags, heuristics);
    const createdTs = acc.create_time || scanProfile.date_created || scanProfile.createTime;
    const ageDays = createdTs ? Math.round((Date.now() - createdTs) / 86400000) : null;
    const txCountPreview = Math.max(
      walletTxs.length,
      Number(scanProfile.totalTransactionCount ?? scanProfile.transactions ?? scanProfile.transaction_count) || 0
    );
    const riskReport = computeWalletRisk({
      security,
      heuristics,
      onChainApprovals,
      ageDays,
      txCount: txCountPreview,
      isFlagged: security.level === 'bad',
    });

    walletData = { acc, trc20, addr, scanProfile, secAcc, tags, approvalCount, onChainApprovals, riskReport };
    window._walletLastReport = buildWalletReportSnapshot();
    writeWalletSessionCache({
      addr,
      acc,
      trc20,
      scanProfile,
      secAcc,
      tags,
      approvalCount,
      onChainApprovals: serializeWalletApprovals(onChainApprovals),
      riskReport,
      walletTxs,
      walletHasMore,
      walletOldestTs,
      txShowCount,
    });
    renderWallet();
  } catch (e) {
    if (gen !== walletScanGen) return;
    walletRes.innerHTML = '';
    setError(walletErr, userFriendlyFetchError(e));
  } finally {
    if (gen === walletScanGen) setWalletScanLocked(false);
  }
}

async function loadMoreTxs() {
  if (loadMoreBusy) return;
  loadMoreBusy = true;
  renderWallet();

  const addr = walletData.addr;
  const ts = walletOldestTs;
  if (walletHasMore && ts) {
    try {
      const txRes = await gridGet(`/v1/accounts/${addr}/transactions`, { limit: 50, order_by: 'block_timestamp,desc', max_timestamp: ts - 1 });
      const more = txRes.data || [];
      walletHasMore = more.length === 50;
      if (more.length) walletOldestTs = more[more.length - 1].block_timestamp || 0;

      const trc20Cache = walletTxs.filter(t => t._isTrc20);
      const nativeOld = walletTxs.filter(t => !t._isTrc20);
      const combined = nativeOld.concat(more).concat(trc20Cache).sort((a, b) => (b.block_timestamp || 0) - (a.block_timestamp || 0));
      const seen = new Set();
      walletTxs = [];
      for (const t of combined) {
        const key = (t._isTrc20 ? 'T' : 'N') + (t.from || '') + (t.to || '') + (t.block_timestamp || 0) + (t.token_symbol || '');
        if (!seen.has(key)) { seen.add(key); walletTxs.push(t); }
      }
    } catch (_) {}
  }

  txShowCount += 12;
  loadMoreBusy = false;
  renderWallet();
}

function renderWallet() {
  const { acc, trc20, addr, scanProfile, secAcc, tags, approvalCount, onChainApprovals, riskReport: storedRisk } = walletData;
  const res = acc.account_resource || {};
  const bwUsed = acc.free_net_usage ?? res.net_usage ?? scanProfile.freeNetUsed ?? 0;
  const bwTotal = acc.free_net_limit ?? res.free_net_limit ?? scanProfile.freeNetLimit ?? 1500;
  const bwPct = bwTotal > 0 ? Math.round((bwUsed / bwTotal) * 100) : 0;
  const energyUsed = acc.EnergyUsed ?? res.energy_used ?? scanProfile.energyUsed ?? 0;
  const energyLimit = acc.EnergyLimit ?? res.energy_limit ?? scanProfile.energyLimit ?? 0;
  const energyPct = energyLimit > 0 ? Math.round((energyUsed / energyLimit) * 100) : 0;
  const frozen = normalizeFrozenV2(acc.frozenV2 ?? acc.frozen);
  const staked = frozen.reduce((s, f) => s + (f.amount || 0), 0);
  const stakedBw = frozen.filter(f => (f.type || '').includes('BANDWIDTH') || f.type === undefined).reduce((s, f) => s + (f.amount || 0), 0);
  const stakedEnergy = frozen.filter(f => (f.type || '').includes('ENERGY')).reduce((s, f) => s + (f.amount || 0), 0);
  const trxBal = (acc.balance || 0) / 1_000_000;
  const trxUsdVal = TRX_PRICE != null ? trxBal * TRX_PRICE : null;
  const tokenUsd = t => (t.priceInUsd > 0) ? t.balance * t.priceInUsd : null;
  const trc20UsdTotal = trc20.reduce((sum, t) => sum + (tokenUsd(t) || 0), 0);
  const totalPortfolioUsd = (trxUsdVal || 0) + trc20UsdTotal;
  const txs = walletTxs;
  const votes = asArray(acc.votes);
  const votePower = votes.reduce((s, v) => s + (v.vote_count || 0), 0);
  const permissionLayout = summarizeWalletPermissionLayout(
    addr,
    acc.owner_permission,
    acc.active_permission,
    acc.witness_permission,
  );
  const txCount = Math.max(
    txs.length,
    Number(scanProfile.totalTransactionCount ?? scanProfile.transactions ?? scanProfile.transaction_count) || 0
  );
  const createdTs = acc.create_time || scanProfile.date_created || scanProfile.createTime;
  const lastActiveTs = acc.latest_opration_time || scanProfile.latest_operation_time || scanProfile.latestOperationTime;
  const created = createdTs ? new Date(createdTs).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const lastActive = lastActiveTs ? ago(lastActiveTs) : '—';
  const ageDays = createdTs ? Math.round((Date.now() - createdTs) / 86400000) : null;
  const addressName = scanProfile.name || scanProfile.addressTag || scanProfile.publicTag || '';

  const heuristics = [];
  if (acc._inactive) heuristics.push('Unactivated TRX account record');
  if (txs.length >= 10) {
    const transfers = txs.filter(t => t.raw_data?.contract?.[0]?.type === 'TransferContract');
    if (transfers.length >= 5) {
      const uniq = new Set(transfers.map(t => t.raw_data?.contract?.[0]?.parameter?.value?.to_address)).size;
      if (uniq === 1) heuristics.push('Recent TRX sweep pattern detected');
    }
  }
  if (bwUsed === 0 && (acc.balance || 0) < 1_000_000) heuristics.push('Dormant / low-activity account');

  const security = buildWalletSecurity(secAcc, tags, heuristics);
  const riskReport = storedRisk || computeWalletRisk({
    security,
    heuristics,
    onChainApprovals: onChainApprovals || [],
    ageDays,
    txCount,
    isFlagged: security.level === 'bad',
  });
  const unlimitedCount = riskReport.unlimitedCount || 0;
  const alertsHtml = security.level === 'bad'
    ? alertBox('red', `${esc(walletFlagLabel(security.flags[0] || 'Address flagged by security checks'))} <button type="button" class="a-link wallet-inline-cta" data-wallet-go="aml">${t('Run AML check')} →</button>`)
    : unlimitedCount > 0
      ? alertBox('red', `${esc(unlimitedCount > 1 ? t('{count} unlimited allowances — revoke in Approvals first', { count: unlimitedCount }) : t('1 unlimited allowance — revoke in Approvals first'))} <button type="button" class="a-link wallet-inline-cta" data-wallet-go="approvals">${t('Open Approvals')} →</button>`)
      : approvalCount > 0
        ? alertBox('amber', `${esc(approvalCount > 1 ? t('{count} active approvals on-chain', { count: approvalCount }) : t('1 active approval on-chain'))} <button type="button" class="a-link wallet-inline-cta" data-wallet-go="approvals">${t('Review in Approvals')} →</button>`)
        : security.level === 'warn' && heuristics.length
          ? alertBox('amber', esc(t(heuristics[0])))
          : '';

  const nextStepsHtml = buildWalletNextSteps({ addr, riskReport, approvalCount, unlimitedCount, security, permissionLayout });

  const showTxs = txs.slice(0, txShowCount);
  const allTxShown = txShowCount >= txs.length && !walletHasMore;
  const sortedTokens = [...trc20].sort((a, b) => (tokenUsd(b) || 0) - (tokenUsd(a) || 0));

  const headTags = [
    acc._inactive ? walletTag(t('inactive account'), 'warn') : walletTag(t('active account'), 'live'),
    addressName ? walletTag(addressName, 'name') : '',
    permissionLayout.isMultisig
      ? `<button type="button" class="wallet-tag ${permissionLayout.hasRiskyExternal ? 'is-warn' : 'is-name'} wallet-inline-cta" data-wallet-go="permissions">${esc(t('multisig'))}</button>`
      : '',
    votePower > 0 ? walletTag(`${fmtNum(votePower)} votes · ${votes.length} SR${votes.length !== 1 ? 's' : ''}`) : '',
    approvalCount > 0 ? walletTag(t('{count} on-chain approvals', { count: approvalCount }), unlimitedCount > 0 ? 'bad' : 'warn') : '',
    ...tags.slice(0, 4).map(t => walletTag(t, /scam|fraud|phish|black/i.test(t) ? 'bad' : '')),
  ].filter(Boolean).join('');

  const securityRows = [
    kvRow(t('TronScan security'), secAcc ? (security.level === 'clean' ? badge('b-green', t('Clean')) : security.level === 'warn' ? badge('b-amber', t('Review')) : badge('b-red', t('Flagged'))) : badge('b-ghost', t('Unavailable'))),
    kvRow(tt('blacklist'), secAcc?.is_black_list ? badge('b-red', t('Listed')) : badge('b-green', t('Not listed'))),
    kvRow(t('Fraud transactions'), secAcc?.has_fraud_transaction ? badge('b-red', t('Detected')) : badge('b-green', t('None'))),
    kvRow(tt('riskScore'), riskReport ? `<span class="mono">${riskReport.finalScore}</span><span class="aml-score-unit">/100</span> · ${esc(t(riskReport.statusLabel))}` : '—'),
    kvRow(tt('approvals'), approvalCount > 0
      ? `<span class="mono">${approvalCount}</span>${unlimitedCount > 0 ? ` · <span class="wallet-tag is-bad" style="display:inline-flex;padding:1px 6px;font-size:10px">${unlimitedCount} ${t('unlimited')}</span>` : ''} · <button type="button" class="a-link wallet-inline-cta" data-wallet-go="approvals">${t('Open Approvals')} →</button>`
      : `<span class="mono">0</span> · <span class="kv-muted">${t('verified on-chain')}</span>`),
    kvRow(tt('heuristics'), heuristics.length ? esc(t(heuristics[0])) : `<span class="kv-muted">${t('No patterns')}</span>`),
    kvRow(t('Public tags'), tags.length ? esc(tags.slice(0, 3).join(' · ')) : `<span class="kv-muted">${t('None')}</span>`, true),
  ].join('');

  const profileRows = [
    kvRow(t('Account created'), esc(created) + (ageDays != null ? ` · ${ageDays}d` : '')),
    kvRow(t('Last active'), esc(lastActive)),
    kvRow(t('Total transactions'), fmtNum(txCount)),
    kvRow(t('TRX balance'), `${trxBal.toFixed(2)} TRX${trxUsdVal != null ? ` · $${trxUsdVal.toFixed(2)}` : ''}`),
    kvRow(`${tt('staking')} TRX`, `${toTRX(staked)} TRX · ${frozen.length} lock${frozen.length !== 1 ? 's' : ''}`),
    stakedBw || stakedEnergy
      ? kvRow(t('Stake split'), `${toTRX(stakedBw)} BW · ${toTRX(stakedEnergy)} EN`, true)
      : kvRow(t('Votes'), votePower > 0 ? `${fmtNum(votePower)} to ${votes.length} SR${votes.length !== 1 ? 's' : ''}` : '—', true),
  ].join('');

  const tokenHtml = sortedTokens.length === 0
    ? '<div class="wallet-empty-block">' + t('No TRC20 tokens with balance') + '</div>'
    : sortedTokens.map(tok => {
        const uv = tokenUsd(tok);
        const balFmt = tok.balance >= 1e6
          ? (tok.balance / 1e6).toFixed(2) + 'M'
          : tok.balance >= 1e3
            ? (tok.balance / 1e3).toFixed(2) + 'K'
            : tok.balance.toFixed(Math.min(tok.decimals, 4));
        return `<div class="wallet-token-row">
          <div class="wallet-token-icon">${esc(tok.symbol.slice(0, 3))}</div>
          <div class="wallet-token-body">
            <div class="wallet-token-name">${esc(tok.symbol)}${tok.name ? ` <span style="color:var(--text-4);font-weight:400">${esc(tok.name)}</span>` : ''}</div>
            <div class="wallet-token-meta">${walletContractScanBtn(tok.contract)}</div>
          </div>
          <div class="wallet-token-val">
            <div class="wallet-token-usd">${uv && uv > 0 ? '$' + uv.toFixed(2) : '—'}</div>
            <div class="wallet-token-bal">${esc(balFmt)} · ${tok.priceInUsd > 0 ? '$' + tok.priceInUsd.toFixed(4) : t('no price')}</div>
          </div>
        </div>`;
      }).join('') + (trc20UsdTotal > 0
        ? `<div class="wallet-token-footer"><span>${t('Token holdings')}</span><strong>$${trc20UsdTotal.toFixed(2)}</strong></div>`
        : '');

  const riskStatHtml = typeof walletRiskStat === 'function'
    ? walletRiskStat(riskReport.status, riskReport.statusLabel, riskReport.finalScore, riskReport.isFlagged, riskReport.hasHardSignals)
    : '';
  const signalsHtml = typeof amlSignalsPanel === 'function' && riskReport.scoreFactors?.length
    ? amlSignalsPanel(riskReport.scoreFactors, riskReport.finalScore, riskReport.status)
    : '';

  const activityHtml = txs.length === 0
    ? `<div class="wallet-empty-block">${t('No recent transactions')}</div>`
    : showTxs.map(tx => buildActivityItem(tx, addr)).join('');

  walletRes.innerHTML = `
    <div class="wallet-scan">
      ${alertsHtml}

      ${scanHeadCard({
        variant: 'featured',
        leadHtml: `<div class="wallet-head-addr">${esc(addr)}</div>`,
        actionsHtml: `
          ${walletActionBtn({ id: 'wallet-export-pdf-btn', label: 'Export PDF', icon: IC.download })}
          ${walletActionBtn({ id: 'wallet-copy-summary-btn', label: 'Copy summary', icon: IC.copy })}
          ${walletActionBtn({ id: 'wallet-refresh-btn', label: 'Refresh scan', icon: IC.refresh })}
          ${walletActionBtn({ id: 'copy-addr-btn', label: 'Copy', icon: IC.copy })}
          ${walletActionBtn({ id: 'qr-addr-btn', label: 'QR code', icon: IC.qr })}
          ${walletActionBtn({ id: 'tronscan-addr-btn', label: 'TronScan', icon: IC.external, href: `https://tronscan.org/#/address/${addr}`, variant: 'ext' })}
        `,
        tagsHtml: `${headTags}${walletFromCache ? walletTag(t('session cache'), 'name') : ''}`,
      })}

      ${riskStatHtml ? `<div class="wallet-risk-grid an-stat-grid an-stat-grid--2">${riskStatHtml}
        ${approvalCount > 0
          ? `<button type="button" class="an-stat wallet-approvals-stat is-clickable" data-wallet-go="approvals">`
          : `<div class="an-stat wallet-approvals-stat">`}
          <div class="an-stat-label">${t('Active on-chain approvals')}</div>
          <div class="an-stat-value ${approvalCount > 0 ? (unlimitedCount > 0 ? 'is-red' : 'is-amber') : 'is-green'}">${approvalCount}</div>
          <div class="an-stat-sub">${approvalCount > 0 ? `${t('Tap to review')} →` : t('verified on-chain')}</div>
        ${approvalCount > 0 ? '</button>' : '</div>'}
      </div>` : ''}

      ${nextStepsHtml}

      ${signalsHtml ? `<div class="wallet-signals-wrap">${signalsHtml}</div>` : ''}

      <div class="wallet-hero-grid">
        <div class="wallet-portfolio-card">
          <div class="wallet-portfolio-label">${t('Estimated portfolio')}</div>
          <div class="wallet-portfolio-value">${totalPortfolioUsd > 0 ? '$' + totalPortfolioUsd.toFixed(2) : trxUsdVal != null ? '$' + trxUsdVal.toFixed(2) : '—'}</div>
          <div class="wallet-portfolio-sub">
            <span><strong>${trxBal.toFixed(2)} TRX</strong>${trxUsdVal != null ? ` · $${trxUsdVal.toFixed(2)}` : ''}</span>
            <span><strong>${trc20.length}</strong> token${trc20.length !== 1 ? 's' : ''}</span>
            <span><strong>${fmtNum(txCount)}</strong> txs</span>
            ${TRX_CHANGE != null ? `<span>TRX ${TRX_CHANGE >= 0 ? '+' : ''}${TRX_CHANGE.toFixed(2)}% 24h</span>` : ''}
          </div>
        </div>
        <div class="wallet-meters-card">
          ${walletMeter('Bandwidth', bwUsed, bwTotal, bwPct > 80 ? 'red' : bwPct > 55 ? 'amber' : 'green')}
          ${energyLimit > 0
            ? walletMeter('Energy', energyUsed, energyLimit, energyPct > 80 ? 'amber' : 'info')
            : `<div class="wallet-meter"><div class="wallet-meter-head"><span class="wallet-meter-label">${t('Energy')}</span><span class="wallet-meter-val">${t('No staked energy')}</span></div></div>`}
          <div class="wallet-meter">
            <div class="wallet-meter-head">
              <span class="wallet-meter-label">${t('Staked TRX')}</span>
              <span class="wallet-meter-val">${toTRX(staked)} TRX</span>
            </div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">${frozen.length} lock${frozen.length !== 1 ? 's' : ''}${stakedBw || stakedEnergy ? ` · ${toTRX(stakedBw)} BW · ${toTRX(stakedEnergy)} EN` : ''}</div>
          </div>
        </div>
      </div>

      <div class="wallet-profile-grid">
        ${scanKvBlock('On-chain profile', profileRows)}
        ${scanKvBlock('Security & signals', securityRows)}
      </div>

      <div>
        <div class="scan-section-title wallet-section-title">${t('Token holdings')} <span>· ${trc20.length}</span></div>
        <div class="wallet-token-list">${tokenHtml}</div>
      </div>

      ${txs.length > 0 ? `
      <div>
        <div class="scan-section-title wallet-section-title">${t('Recent activity')} <span>· ${Math.min(txShowCount, txs.length)} / ${txs.length}${walletHasMore ? '+' : ''}</span></div>
        <div class="wallet-activity">${activityHtml}</div>
        ${!allTxShown ? walletLoadMoreBtn(loadMoreBusy) : ''}
      </div>` : ''}

      <p class="aml-disclaimer">${t('Wallet scan uses public on-chain data and heuristics. It is not AML compliance screening or investment advice.')}</p>
    </div>`;

  document.getElementById('wallet-export-pdf-btn')?.addEventListener('click', () => {
    walletExportPdf(window._walletLastReport || buildWalletReportSnapshot());
  });
  document.getElementById('wallet-copy-summary-btn')?.addEventListener('click', () => {
    walletCopySummary(window._walletLastReport || buildWalletReportSnapshot());
  });
  document.getElementById('wallet-refresh-btn')?.addEventListener('click', () => walletScan({ force: true }));

  document.getElementById('copy-addr-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(addr).then(() => {
      const btn = document.getElementById('copy-addr-btn');
      btn.classList.add('is-copied');
      btn.innerHTML = `${icSVG(IC.check, 14)}<span>${t('Copied')}</span>`;
      setTimeout(() => {
        btn.classList.remove('is-copied');
        btn.innerHTML = `${icSVG(IC.copy, 14)}<span>${t('Copy')}</span>`;
      }, 2000);
    });
  });

  document.getElementById('qr-addr-btn')?.addEventListener('click', function () { openWalletQr(addr, this); });

  bindWalletGoButtons(walletRes, addr);
  mountScanMotion(walletRes, { fromCache: walletFromCache });

  walletRes.querySelectorAll('.wallet-contract-scan-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      openAddressScan(btn.getAttribute('data-addr'));
    });
  });

  walletRes.querySelectorAll('.wallet-tx-decode-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      openTxDecoder(btn.getAttribute('data-hash'));
    });
  });
}

function getWalletApprovalsSeed(addr) {
  if (!addr) return null;
  if (walletData?.addr === addr && Array.isArray(walletData.onChainApprovals)) {
    return walletData.onChainApprovals;
  }
  const cached = readWalletSessionCache(addr);
  if (cached?.addr === addr && Array.isArray(cached.onChainApprovals)) {
    return restoreWalletApprovals(cached.onChainApprovals);
  }
  return null;
}

function resetWalletScanCache() {
  walletScanGen++;
  if (walletData?.addr) clearWalletSessionCache(walletData.addr);
  walletData = null;
  walletTxs = [];
  walletHasMore = false;
  walletOldestTs = 0;
  txShowCount = 10;
  loadMoreBusy = false;
  walletFromCache = false;
  window._walletLastReport = null;
  setWalletScanLocked(false);
  if (typeof clearApiCaches === 'function') clearApiCaches();
  else if (typeof clearScanApiCache === 'function') clearScanApiCache();
}
