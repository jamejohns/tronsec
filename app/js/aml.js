const amlInput = document.getElementById('aml-input');
const amlBtn   = document.getElementById('aml-scan-btn');
const amlErr   = document.getElementById('aml-err');
const amlRes   = document.getElementById('aml-result');
const amlEmpty = document.getElementById('aml-empty');

let amlLastAddr = '';
let amlFromCache = false;
let amlScanGen = 0;
let amlScanBusy = false;

function setAmlScanLocked(locked) {
  amlScanBusy = locked;
  if (locked) {
    spinBtn(amlBtn, true);
    if (amlBtn) amlBtn.setAttribute('aria-busy', 'true');
    lockScanInput(amlInput, true);
  } else {
    endScanUI({ btn: amlBtn, input: amlInput });
  }
}

const AML_DISCLAIMER_KEY = 'Informational screening based on the latest {count} transactions, OFAC SDN / UK OFSI / EU sanctions lists (where synced), TronScan public tags, and TRONSEC labels. Not legal advice or a compliance clearance.';
const AML_SANCTION_SOURCES = new Set(['ofac_sdn', 'uk_ofsi', 'eu_sanctions']);
const AML_INDIRECT_PEER_LIMIT = 3;
const AML_INDIRECT_TX_LIMIT = 120;

function amlSampleCount() {
  return (typeof AML_TX_SAMPLE_LIMIT === 'number' && AML_TX_SAMPLE_LIMIT > 0) ? AML_TX_SAMPLE_LIMIT : 1000;
}

function amlDisclaimerText() {
  return t(AML_DISCLAIMER_KEY, { count: amlSampleCount() });
}

const AML_CACHE_TTL = 12 * 60 * 1000;
const AML_PEER_SECURITY_LIMIT = 10;
const AML_TOKEN_SECURITY_LIMIT = 5;
const AML_RISK_TAG_RE = /scam|phish|fraud|blacklist|sanction|malicious|hack|exploit|mixer|rug/i;
const AML_SANCTION_TAG_RE = /ofac|sdn|sanction/i;

function readAmlSessionCache(addr) {
  return readSessionCache('aml', addr, {
    ttl: AML_CACHE_TTL,
    validate: (p) => p.addr === addr && (p.report || p.html),
    allowHtml: true,
  });
}

function writeAmlSessionCache(snapshot) {
  if (!snapshot?.addr) return;
  const { html, ...rest } = snapshot;
  writeSessionCache('aml', snapshot.addr, rest);
}

function clearAmlSessionCache(addr) {
  clearSessionCache('aml', addr);
}

function restoreAmlFromCache(cached) {
  if (cached?.report && renderAmlScanFromReport(cached.report, cached.graphPayload, true)) {
    showToast(t('Loaded from session cache'));
    return;
  }
  if (cached?.html) {
    amlFromCache = true;
    hideScanEmpty(amlEmpty, { instant: true });
    amlRes.innerHTML = cached.html;
    window._amlLastReport = cached.report || null;
    bindAmlActions(cached.addr);
    if (cached.graphPayload) {
      const gp = cached.graphPayload;
      renderAMLGraph('aml-graph-container', gp.addr, gp.topPeers, gp.peerFlags, gp.directTransfers, gp.txCount, {
        selfFlagged: !!gp.selfFlagged,
        peerCategories: gp.peerCategories || [],
        trxPriceUsd: gp.trxPriceUsd ?? null,
      });
    }
    showToast(t('Loaded from session cache'));
  }
}

if (amlInput) amlInput.addEventListener('keydown', e => { if (e.key==='Enter') amlScan(); });
if (amlBtn) amlBtn.addEventListener('click', () => amlScan());

function amlAddrLink(addr, label) {
  const text = esc(label || addrLabel(addr));
  return `<a class="a-link aml-addr-link" href="https://tronscan.org/#/address/${esc(addr)}" target="_blank" rel="noopener"><span>${text}</span>${icSVG(IC.link, 9)}</a>`;
}

function amlKvRow(label, valueHtml, last) {
  return `<div class="kv-row${last ? ' kv-row--last' : ''}">
    <span class="kv-label">${kvLabel(label)}</span>
    <span class="kv-val">${valueHtml}</span>
  </div>`;
}

function amlRiskClass(status, isFlagged) {
  if (status === 'insufficient') return 'is-neutral';
  if (isFlagged || status === 'flagged') return 'is-red';
  if (status === 'unusual') return 'is-amber';
  return 'is-green';
}

function amlExtractTags(tagAcc) {
  return normalizeTagList(tagAcc)
    .map((t) => (typeof t === 'string' ? t : (t.tagName || t.tag || t.label || '')))
    .filter(Boolean);
}

function amlAlertList(type, title, items) {
  return `<div class="aml-alert aml-alert--${type}">
    <div class="aml-alert-head">${icSVG(IC.alert, 14)}<span class="aml-alert-title">${esc(t(title))}</span></div>
    <ul class="aml-alert-list">${items.map(item => `<li>${item}</li>`).join('')}</ul>
  </div>`;
}

function amlHeadCard(addr, tagsHtml, fromCache = false) {
  const cacheTag = fromCache ? walletTag(t('session cache'), 'name') : '';
  return scanHeadCard({
    leadHtml: `<div class="wallet-head-addr">${esc(addr)}</div>`,
    actionsHtml: `
      ${scanActionBtn({ id: 'aml-refresh-btn', label: 'Refresh scan', icon: IC.refresh })}
      ${scanActionBtn({ id: 'aml-copy-addr-btn', label: 'Copy', icon: IC.copy })}
      ${scanActionBtn({ id: 'aml-export-pdf-btn', label: 'Export PDF', icon: IC.download })}
      ${scanActionBtn({ id: 'aml-tronscan-btn', label: 'TronScan', icon: IC.external, href: `https://tronscan.org/#/address/${addr}`, variant: 'ext' })}
    `,
    tagsHtml: `${tagsHtml || ''}${cacheTag}`,
  });
}

function amlStatusBadge(status, isFlagged) {
  if (isFlagged) return badge('b-red', 'Flagged');
  if (status === 'unusual') return badge('b-amber', 'Unusual activity');
  if (status === 'insufficient') return badge('b-ghost', 'Insufficient data');
  return badge('b-green', 'Clean');
}

async function renderAmlContractRedirect(addr) {
  return renderContractScanRedirect(addr, {
    idPrefix: 'aml',
    wrapperClass: 'aml-scan',
    hintText: t('AML screening scores wallet addresses and their transaction patterns. For tokens and smart contracts, review bytecode, permissions, and upgrade risks instead.'),
    disclaimerHtml: `<p class="aml-disclaimer">${amlDisclaimerText()}</p>`,
  });
}

function bindAmlContractRedirect(addr) {
  bindContractScanRedirect(addr, 'aml');
}

function bindAmlActions(addr) {
  if (!amlRes) return;
  amlRes.dataset.amlBindAddr = addr;

  if (amlRes.dataset.amlActionsBound !== '1') {
    amlRes.dataset.amlActionsBound = '1';
    amlRes.addEventListener('click', (e) => {
      const boundAddr = amlRes.dataset.amlBindAddr;
      if (!boundAddr) return;

      if (e.target.closest('#aml-refresh-btn')) {
        e.preventDefault();
        amlScan({ force: true });
        return;
      }

      if (e.target.closest('#aml-copy-addr-btn')) {
        e.preventDefault();
        navigator.clipboard.writeText(boundAddr).then(() => {
          const btn = document.getElementById('aml-copy-addr-btn');
          if (!btn) return;
          btn.classList.add('is-copied');
          btn.innerHTML = `${icSVG(IC.check, 14)}<span>${t('Copied')}</span>`;
          setTimeout(() => {
            btn.classList.remove('is-copied');
            btn.innerHTML = `${icSVG(IC.copy, 14)}<span>${t('Copy')}</span>`;
          }, 2000);
        });
        return;
      }

      if (e.target.closest('#aml-export-pdf-btn')) {
        e.preventDefault();
        if (!window._amlLastReport) { showToast(t('Run a scan first')); return; }
        amlExportPdf(window._amlLastReport);
      }
    });
  }

  if (typeof bindScanHeadOverflow === 'function') bindScanHeadOverflow(amlRes);
}

async function amlExportPdf(report) {
  const api = window.tronsecAmlPdf;
  if (!report || !api?.AmlPdfWriter) {
    showToast(t('PDF export failed'));
    return;
  }
  const { AmlPdfWriter, AML_PDF, amlPdfStatusColor } = api;
  const btn = document.getElementById('aml-export-pdf-btn');
  if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
  try {
    await api.ensurePdfBrandAssets();
    const reportId = `AML-${report.addr.slice(-8).toUpperCase()}`;
    const pdf = new AmlPdfWriter(reportId);
    const m = pdf.margin;
    const scoreColor = amlPdfStatusColor(report.status, report.isFlagged);
    const stamp = new Date(report.scannedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    pdf.drawReportHeader({
      title: t('AML SCREENING REPORT'),
      moduleLabel: t('AML check'),
      stamp,
      reportId,
    });

    pdf.drawScoreCard({
      score: report.finalScore,
      scoreColor,
      statusLabel: t(report.statusLabel),
      subtitle: report.hasHardSignals ? t('Composite risk signal') : t('Activity risk signal'),
      meta: t('Sample: latest {count} transactions', { count: amlSampleCount() }),
      address: report.addr,
      addressLabel: t('SUBJECT ADDRESS'),
    });

    if (report.assessmentText) {
      pdf.section(t('Assessment'));
      pdf.bullet(t(report.assessmentText), scoreColor);
    }
    if (report.hardFlags?.length) {
      const fs = report.flagSources || {};
      if (fs.sanctions?.length) {
        pdf.section(t('Scanned address — sanctions lists'));
        fs.sanctions.forEach((entry) => pdf.bullet(`${t(entry.label)} — ${t(entry.hint)}`, AML_PDF.red));
      }
      if (fs.labels?.length) {
        pdf.section(t('Scanned address — TRONSEC labels'));
        fs.labels.forEach((entry) => pdf.bullet(`${t(entry.label)} — ${t(entry.hint)}`, AML_PDF.red));
      }
      if (fs.secAcc?.length) {
        pdf.section(t('Scanned address — TronScan security'));
        fs.secAcc.forEach((entry) => pdf.bullet(`${t(entry.label)} — ${t(entry.hint)}`, AML_PDF.red));
      }
      if (fs.tags?.length) {
        pdf.section(t('Scanned address — public tags'));
        fs.tags.forEach((entry) => pdf.bullet(`${t(entry.label)} — ${t(entry.hint)}`, AML_PDF.red));
      }
      if (fs.tokens?.length) {
        pdf.section(t('Scanned address — token holdings'));
        fs.tokens.forEach((entry) => pdf.bullet(`${t(entry.label)} — ${t(entry.hint)}`, AML_PDF.red));
      }
      if (!fs.secAcc?.length && !fs.tags?.length && !fs.tokens?.length && !fs.sanctions?.length && !fs.labels?.length) {
        pdf.section(t('Security flags'));
        report.hardFlags.forEach(flag => pdf.bullet(t(flag), AML_PDF.red));
      }
    }
    const sanctionPeerSet = new Set(report.sanctionPeerAddrs || []);
    const tronScanPeerFlags = (report.peerFlags || []).filter((a) => !sanctionPeerSet.has(a));
    if (report.sanctionPeerAddrs?.length) {
      pdf.section(t('Sanctions list counterparties'));
      report.sanctionPeerAddrs.slice(0, 8).forEach((p) => pdf.bullet(p, AML_PDF.red));
    }
    if (report.indirectSanctionLinks?.length) {
      pdf.section(t('Indirect sanctions exposure'));
      report.indirectSanctionLinks.slice(0, 8).forEach((link) => {
        pdf.bullet(t('{peer} · via {sanctioned}', {
          peer: addrLabel(link.peer),
          sanctioned: addrLabel(link.sanctioned),
        }), AML_PDF.amber);
      });
    }
    if (tronScanPeerFlags.length) {
      pdf.section(t('Flagged counterparties (TronScan security)'));
      tronScanPeerFlags.slice(0, 8).forEach(p => pdf.bullet(p, AML_PDF.amber));
    }
    if (report.scoreFactors?.length) {
      pdf.section(t('Signal breakdown'));
      report.scoreFactors.forEach(f => {
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
    pdf.row(t('Transactions sampled'), `${Math.min(report.txCount, amlSampleCount())} ${t('of latest {count}', { count: amlSampleCount() })}`);
    pdf.row(t('Direct transfers'), String(report.dtCount));
    pdf.row(t('Concentration'), report.dtCount > 0 ? `${(report.concentration * 100).toFixed(0)}% / ${report.uniquePeers}${t(' peers')}` : '-');
    pdf.row(t('Account age'), report.ageDays !== null ? `${report.ageDays} days` : t('Unknown'));
    if (report.balanceTrx !== null) pdf.row(t('Balance'), `${report.balanceTrx.toFixed(2)} TRX`, AML_PDF.info);
    if (report.accCreated) pdf.row(t('Created'), report.accCreated);
    if (report.activityWindow) pdf.row(t('Activity window'), report.activityWindow);
    if (report.inboundCount > 0 || report.outboundCount > 0) {
      const ratioStr = report.flowRatio != null && report.outboundCount > 0
        ? ` (${Number(report.flowRatio).toFixed(1)}×)`
        : '';
      pdf.row(t('Inbound/outbound ratio'), `${report.inboundCount} / ${report.outboundCount}${ratioStr}`);
    }
    if (report.firstFunder?.addr) {
      pdf.row(t('First funder'), `${addrLabel(report.firstFunder.addr)} · ${report.firstFunder.asset || 'TRX'}`);
    }

    if (report.exposureBreakdown?.length) {
      pdf.section(t('Risk exposure'));
      report.exposureBreakdown.forEach((row) => {
        const stats = [];
        if (row.volumeUsd > 0 && typeof amlFormatExposureUsd === 'function') {
          stats.push(amlFormatExposureUsd(row.volumeUsd));
        }
        if (row.subject) stats.push(t('This address'));
        if (row.peerCount > 0) {
          stats.push(row.peerCount === 1
            ? t('1 counterparty')
            : t('{count} counterparties', { count: row.peerCount }));
        }
        if (row.transferCount > 0) {
          stats.push(row.transferCount === 1
            ? t('1 transfer')
            : t('{count} transfers', { count: row.transferCount }));
        }
        pdf.row(row.label, stats.join(' · ') || '—');
      });
    }
    if (report.topPeers?.length) {
      pdf.section(t('Top counterparties (security screened)'));
      const screened = new Set(report.peerSecurityScreened || []);
      report.topPeers.slice(0, AML_PEER_SECURITY_LIMIT).forEach(([a, c]) => {
        let status = '';
        if (report.peerFlags?.includes(a)) status = ` · ${t('TronScan security · flagged')}`;
        else if (screened.has(a)) status = ` · ${t('TronScan security · no flags')}`;
        pdf.row(addrLabel(a), t('{count} direct transfers', { count: c }) + status);
      });
    }

    pdf.section(t('Sources checked'));
    pdf.row(t('TronScan account security'), report.secAccLevel || t('Unavailable'));
    const sm = report.sanctionMeta || {};
    const sanctionSummary = report.flagSources?.sanctions?.length
      ? t('Match found')
      : report.sanctionUnavailable
        ? t('Unavailable')
        : [sm.ofac?.version ? `OFAC ${sm.ofac.version}` : null, sm.uk?.count ? `UK ${sm.uk.count}` : null].filter(Boolean).join(' · ') || t('No match');
    pdf.row(t('Sanctions lists'), sanctionSummary);
    pdf.row(t('TRONSEC labels'), report.flagSources?.labels?.length ? t('Match found') : t('No match'));
    pdf.row(t('TronScan token security'), report.secTokenLevel || t('Unavailable'));

    pdf.disclaimerBox(amlDisclaimerText());

    const fname = `TRONSEC-AML-${report.addr.slice(0, 6)}${report.addr.slice(-4)}-${new Date(report.scannedAt).toISOString().slice(0, 10)}.pdf`;
    pdf.download(fname);
    showToast(t('PDF report downloaded'));
  } catch (e) {
    showToast(t('PDF export failed'));
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); }
  }
}

function amlShieldTier(status, isFlagged) {
  if (isFlagged || status === 'flagged') return 'high';
  if (status === 'unusual') return 'med';
  if (status === 'insufficient') return 'low';
  return 'low';
}

function amlShieldIcon(riskScore, size, isFlagged, status) {
  return riskShieldIcon(riskScore, size, {
    flagged: isFlagged,
    tier: amlShieldTier(status, isFlagged),
    className: 'risk-shield-icon aml-risk-icon',
  });
}

function isAmlSanctionHit(hit) {
  return AML_SANCTION_SOURCES.has(hit?.source);
}

function isAmlSanctionSource(source) {
  return AML_SANCTION_SOURCES.has(source);
}

function amlHardFlagPoints(label) {
  if (/OFAC SDN listed|UK OFSI listed|EU sanctions listed|Sanctions listed|TRONSEC label/i.test(label)) return 50;
  if (/Suspicious|blacklist|Blacklisted/i.test(label)) return 50;
  if (/fraud|scam|phish|Suspicious|malicious|hack|exploit|sanction|Security tag|Sanctioned/i.test(label)) return 40;
  if (/High-risk token/i.test(label)) return 35;
  if (/spam|advertising/i.test(label)) return 12;
  if (/mintable|blacklist function|Unknown|Neutral/i.test(label)) return 18;
  return 30;
}

function amlAddHardSignals(hardFlags, scoreFactors) {
  let add = 0;
  for (const label of hardFlags) {
    const pts = amlHardFlagPoints(label);
    add += pts;
    scoreFactors.unshift({ label, pts, tier: 'hard' });
  }
  return add;
}

function amlRiskStat(status, statusLabel, finalScore, isFlagged, hasHardSignals) {
  const cls = amlRiskClass(status, isFlagged);
  const icon = status === 'insufficient' && !hasHardSignals
    ? riskShieldIcon(0, 40, { muted: true, className: 'risk-shield-icon aml-risk-icon aml-risk-icon--muted' })
    : amlShieldIcon(finalScore, 40, isFlagged, status);
  const scoreText = status === 'insufficient' && !hasHardSignals
    ? '—'
    : `<span class="score-value" data-score-value="${finalScore}">0</span><span class="aml-score-unit">/100</span>`;
  const meter = (status !== 'insufficient' || hasHardSignals)
    ? `<div class="aml-risk-meter"><div class="aml-risk-meter-fill ${cls}" data-score-pct="${finalScore}" style="width:4%"></div></div>`
    : '';
  const statLabel = hasHardSignals ? t('Composite risk signal') : t('Activity risk signal');
  return `<div class="an-stat risk-stat risk-stat--aml aml-risk-stat">
    <div class="an-stat-label">${statLabel}</div>
    <div class="risk-stat__body aml-risk-body">
      ${icon}
      <div class="risk-stat__text aml-risk-text">
        <div class="an-stat-value ${cls}">${scoreText}</div>
        <div class="an-stat-sub">${esc(t(statusLabel))}</div>
        ${meter}
      </div>
    </div>
  </div>`;
}

function amlPeerVolumeUsd(peerAddr, directTransfers, trxPriceUsd) {
  let total = 0;
  let has = false;
  for (const d of directTransfers || []) {
    if (!sameTronAddr(d.peer, peerAddr)) continue;
    const usd = typeof amlTransferVolumeUsd === 'function' ? amlTransferVolumeUsd(d, trxPriceUsd) : null;
    if (usd != null && usd > 0) {
      total += usd;
      has = true;
    }
  }
  return has ? total : null;
}

function amlPeerRow(addr, count, opts = {}) {
  const {
    rank = 1,
    maxCount = count,
    secState = 'unscreened',
    peerCategory = '',
    isDust = false,
    volumeUsd = null,
  } = opts;
  const catColor = peerCategory && typeof amlCategoryColor === 'function'
    ? amlCategoryColor(peerCategory)
    : '';
  const catBadge = (typeof amlPeerCategoryBadge === 'function' && peerCategory)
    ? amlPeerCategoryBadge(peerCategory)
    : '';
  const isFlaggedPeer = !isDust && secState === 'flagged';
  const isWatchPeer = !isDust && !isFlaggedPeer && count > 20;
  const isHighCat = peerCategory && typeof isAmlHighRiskCategory === 'function' && isAmlHighRiskCategory(peerCategory);
  const sevCls = isDust ? 'is-dust'
    : isFlaggedPeer || isHighCat ? 'is-high'
    : isWatchPeer ? 'is-med'
    : peerCategory && typeof isAmlKnownEntityCategory === 'function' && isAmlKnownEntityCategory(peerCategory) ? 'is-info'
    : '';
  const barPct = maxCount > 0 ? Math.max(4, Math.round((count / maxCount) * 100)) : 0;
  const volStr = volumeUsd > 0 && typeof amlFormatExposureUsd === 'function'
    ? amlFormatExposureUsd(volumeUsd)
    : '';

  let statusPill = '';
  if (isDust) {
    statusPill = `<span class="aml-peer-pill is-dust">${esc(t('Spam / dust'))}</span>`;
  } else if (secState === 'flagged') {
    statusPill = `<span class="aml-peer-pill is-danger">${esc(t('TronScan flagged'))}</span>`;
  } else if (secState === 'pending') {
    statusPill = `<span class="aml-peer-pill is-pending">${esc(t('Checking…'))}</span>`;
  } else if (secState === 'screened') {
    statusPill = isWatchPeer
      ? `<span class="aml-peer-pill is-watch">${esc(t('High volume'))}</span><span class="aml-peer-pill is-clear">${esc(t('TronScan clear'))}</span>`
      : `<span class="aml-peer-pill is-clear">${esc(t('TronScan clear'))}</span>`;
  } else {
    statusPill = `<span class="aml-peer-pill is-muted">${esc(t('Not screened'))}</span>`;
  }

  const dotStyle = catColor ? ` style="background:${esc(catColor)}"` : '';
  const barStyle = catColor
    ? ` style="width:${barPct}%;background:${esc(catColor)}"`
    : ` style="width:${barPct}%"`;

  return `<div class="aml-peer-row ${sevCls}">
    <div class="aml-peer-rank">${String(rank).padStart(2, '0')}</div>
    <div class="aml-peer-dot"${dotStyle} aria-hidden="true"></div>
    <div class="aml-peer-main">
      <div class="aml-peer-head">
        <div class="aml-peer-title">${amlAddrLink(addr)}${catBadge}</div>
        <div class="aml-peer-stats">${volStr ? `<span class="aml-peer-vol">${esc(volStr)}</span>` : ''}<span class="aml-peer-tx">${t('{count} txs', { count })}</span></div>
      </div>
      <div class="aml-peer-bar" aria-hidden="true"><span${barStyle}></span></div>
      <div class="aml-peer-foot">${statusPill}</div>
    </div>
  </div>`;
}

function amlPeersPanel(topPeers, opts = {}) {
  const {
    peersPending = false,
    peerFlags = [],
    dustPeers = [],
    peerCatMap = new Map(),
    screenedSet = new Set(),
    directTransfers = [],
    trxPriceUsd = null,
    peerSecurityLimit = AML_PEER_SECURITY_LIMIT,
    noteHtml = '',
    meta = '',
    emptyMsg = 'No direct transfers found in analyzed history',
  } = opts;

  if (!topPeers.length) {
    return amlRowsBlock(
      `${esc(t('Top counterparties (security screened)'))} <span>· 0</span>`,
      '',
      meta,
      emptyMsg,
      noteHtml,
    );
  }

  const dustSet = new Set((dustPeers || []).map((a) => String(a).toLowerCase()));
  const maxCount = Math.max(1, ...topPeers.map((p) => p[1]));
  const flaggedCount = topPeers.filter(([a]) => peerFlags.includes(a)).length;
  const dustCount = topPeers.filter(([a]) => dustSet.has(String(a).toLowerCase())).length;
  const knownCount = topPeers.filter(([a]) => {
    const cat = peerCatMap.get(a)?.category;
    return typeof isAmlKnownEntityCategory === 'function' && isAmlKnownEntityCategory(cat);
  }).length;

  const summaryHtml = peersPending ? '' : `<div class="aml-peer-summary">
    <span class="aml-peer-chip">${topPeers.length} ${esc(t('peers'))}</span>
    ${flaggedCount ? `<span class="aml-peer-chip is-danger">${flaggedCount} ${esc(tt('flagged'))}</span>` : ''}
    ${dustCount ? `<span class="aml-peer-chip is-muted">${dustCount} ${esc(t('dust'))}</span>` : ''}
    ${knownCount ? `<span class="aml-peer-chip is-info">${knownCount} ${esc(t('known entities'))}</span>` : ''}
  </div>`;

  const rows = topPeers.map(([a, c], idx) => {
    const isDust = dustSet.has(String(a).toLowerCase());
    const secState = peersPending
      ? 'pending'
      : peerFlags.includes(a)
        ? 'flagged'
        : (screenedSet.has(a) ? 'screened' : 'unscreened');
    const peerCat = peerCatMap.get(a)?.category || '';
    const volumeUsd = amlPeerVolumeUsd(a, directTransfers, trxPriceUsd);
    return amlPeerRow(a, c, {
      rank: idx + 1,
      maxCount,
      secState,
      peerCategory: peerCat,
      isDust,
      volumeUsd,
    });
  }).join('');

  const note = noteHtml ? `<p class="aml-block-note">${noteHtml}</p>` : '';
  const body = `${summaryHtml}${note}<div class="aml-peer-list">${rows}</div>`;
  const title = `${esc(t('Top counterparties (security screened)'))} <span>· ${topPeers.length}</span>`;
  const metaOut = peersPending
    ? t('Security screening…')
    : (typeof meta === 'object' && meta?.key
      ? t(meta.key, meta.vars || {})
      : meta);
  return amlBlock(title, body, metaOut || t('Top {count} by direct transfers · TronScan security API', { count: peerSecurityLimit }));
}

function amlBlock(titleHtml, bodyHtml, meta = '') {
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

function amlPanel(titleHtml, rowsHtml, meta = '') {
  return amlBlock(titleHtml, `<div class="aml-kv-list">${rowsHtml}</div>`, meta);
}

function amlRowsBlock(titleHtml, rowsHtml, meta = '', emptyMsg = '', noteHtml = '') {
  const note = noteHtml ? `<p class="aml-block-note">${noteHtml}</p>` : '';
  const body = rowsHtml
    ? `${note}<div class="aml-rows">${rowsHtml}</div>`
    : `<div class="aml-empty">${esc(t(emptyMsg))}</div>`;
  return amlBlock(titleHtml, body, meta);
}

function amlSignalsPanel(factors, finalScore, status) {
  if (!factors.length) {
    return amlBlock(t('Signal breakdown'), '<div class="aml-empty">' + esc(t('Not enough data to compute risk factors')) + '</div>');
  }
  const body = `<div class="aml-signals">${factors.map(f => `
      <div class="aml-signal${f.tier === 'hard' ? ' is-hard' : ''}${f.pts < 0 ? ' is-positive' : f.pts >= 15 ? ' is-high' : ''}">
        <span class="aml-signal-label">${esc(i18nFactorLabel(f))}</span>
        <span class="aml-signal-pts ${f.pts < 0 ? 'is-green' : f.pts >= 15 ? 'is-red' : 'is-amber'}">${f.pts > 0 ? '+' : ''}${f.pts}</span>
      </div>`).join('')}
    </div>`;
  return amlBlock(t('Signal breakdown'), body, `${finalScore}/100 ${t('composite')}`);
}

function amlLooksLikeSpamTokenSymbol(symbol) {
  const s = String(symbol || '').trim();
  if (!s || s === '—' || s === '-') return false;
  if (/telegram|t\.me|@\w/i.test(s)) return true;
  if (/\.com|\.org|\.bi|\.cc|gas\s*free|airdrop|claim|http|www\./i.test(s)) return true;
  if (/^\d{2,}[A-Z]{2,}/i.test(s) && s.length <= 16) return true;
  return false;
}

function amlIsExposureJunk(tok) {
  if (!tok) return true;
  if (tok.secLevel === 'spam') return true;
  if (amlLooksLikeSpamTokenSymbol(tok.symbol)) return true;
  const usd = tok.usd;
  if (usd == null || !Number.isFinite(usd) || usd < 1) return true;
  return false;
}

function amlTokensPanel(parsedTokens) {
  const visible = (parsedTokens || []).filter(tok => !amlIsExposureJunk(tok));
  const junkCount = (parsedTokens || []).length - visible.length;
  if (!visible.length) {
    const emptyMsg = junkCount > 0
      ? t('No significant TRC20 holdings — spam airdrops ignored')
      : t('No TRC20 balances detected');
    return amlBlock(t('Token exposure'), '<div class="aml-empty">' + esc(emptyMsg) + '</div>');
  }
  const rows = visible.map(tok => {
    const balFmt = tok.balance >= 1e6 ? (tok.balance / 1e6).toFixed(2) + 'M'
      : tok.balance >= 1e3 ? (tok.balance / 1e3).toFixed(2) + 'K'
      : tok.balance.toFixed(Math.min(4, tok.decimals));
    const usdStr = tok.usd != null ? `$${tok.usd.toFixed(2)}` : '';
    const secBadge = tok.secLevel === 'flagged'
      ? `<span class="badge b-red aml-token-sec">${esc(t('High risk'))}</span>`
      : tok.secLevel === 'warnings'
        ? `<span class="badge b-amber aml-token-sec">${esc(t('Warnings'))}</span>`
        : '';
    return `<div class="aml-row aml-row--compact${tok.secLevel === 'flagged' ? ' is-risk is-high' : ''}">
      <div class="aml-row-icon aml-row-icon--token">${esc(tok.symbol.slice(0, 3).toUpperCase())}</div>
      <div class="aml-row-body">
        <div class="aml-row-title"><span class="aml-token-name">${esc(tok.symbol)}</span>${secBadge}${tok.addr ? amlAddrLink(tok.addr) : ''}</div>
        <div class="aml-row-meta">${balFmt} tokens${usdStr ? ` · ${usdStr}` : ''}${tok.secNote ? ` · ${esc(tok.secNote)}` : ''}</div>
      </div>
    </div>`;
  }).join('');
  const note = junkCount > 0
    ? esc(junkCount === 1
      ? t('1 spam-like token hidden')
      : t('{count} spam-like tokens hidden', { count: junkCount }))
    : '';
  return amlRowsBlock(
    `Token exposure <span>· ${visible.length}</span>`,
    rows,
    t('TronScan token security'),
    '',
    note,
  );
}

function amlSourceBadge(level) {
  switch (level) {
    case 'flagged': return `<span class="badge b-red">${tt('flagged')}</span>`;
    case 'warnings': return badge('b-amber', 'Warnings');
    case 'clean': return badge('b-green', 'No flags');
    default: return badge('b-ghost', t('Unavailable'));
  }
}

function buildAmlViewParts(report, graphPayload, opts = {}) {
  const peersPending = !!opts.peersPending;
  const addr = report.addr;
  const {
    finalScore, status, statusLabel, isFlagged, hasHardSignals, hardFlags = [], peerFlags = [],
    dustPeers = [],
    peerTagAlerts = [],
    scoreFactors = [], txCount = 0, dtCount = 0, concentration = 0, uniquePeers = 0,
    ageDays, knownEntityCount = 0, balanceTrx, accCreated, activityWindow,
    tronTags = [], parsedTokens = [], topPeers = [], topContracts = [],
    peerSecurityScreened = [],
    secAccLevel = 'unavailable', secTokenLevel = 'unavailable', incompleteHistory = false,
    flagSources = { secAcc: [], tags: [], tokens: [], sanctions: [], labels: [] },
    exposureBreakdown = [], subjectCategories = [], peerCategories = [],
    firstFunder = null, inboundCount = 0, outboundCount = 0, flowRatio = null,
    sanctionPeerAddrs = [], indirectSanctionLinks = [],
    sanctionMeta = null, sanctionUnavailable = false,
  } = report;

  const peerCatMap = typeof amlPeerCategoryIndex === 'function'
    ? amlPeerCategoryIndex(peerCategories)
    : new Map();

  const screenedSet = new Set(
    (peerSecurityScreened.length
      ? peerSecurityScreened
      : topPeers.slice(0, AML_PEER_SECURITY_LIMIT).map((p) => p[0]).filter(isValidTron))
  );

  const headTagsHtml = [
    amlStatusBadge(status, isFlagged),
    ...tronTags.slice(0, 4).map(tag => badge('b-cyan', tag)),
  ].filter(Boolean).join('');

  let alertsInner = '';
  if (hardFlags.length) {
    alertsInner += amlFlagSourceAlerts(flagSources, peerFlags, peersPending);
  }
  if (incompleteHistory) {
    alertsInner += amlAlertInline('amber', t('Security flags detected, but recent transaction history could not be loaded — activity metrics below may be incomplete.'));
  }
  const sanctionPeerSet = new Set(sanctionPeerAddrs);
  const tronScanPeerFlags = peerFlags.filter((a) => !sanctionPeerSet.has(a));
  if (!peersPending && tronScanPeerFlags.length > 0) {
    alertsInner += amlAlertList('amber', t('Flagged counterparties (TronScan security)'), tronScanPeerFlags.map(a => amlAddrLink(a)));
  }
  if (!peersPending && sanctionPeerAddrs.length > 0) {
    alertsInner += amlAlertList('red', t('Sanctions list counterparties'), sanctionPeerAddrs.map(a => amlAddrLink(a)));
  }
  if (!peersPending && indirectSanctionLinks.length > 0) {
    alertsInner += amlAlertList('amber', t('Indirect sanctions exposure'), indirectSanctionLinks.map((link) =>
      esc(t('{peer} · via {sanctioned}', { peer: addrLabel(link.peer), sanctioned: addrLabel(link.sanctioned) }))
    ));
  }
  if (!peersPending && peerTagAlerts.length > 0) {
    alertsInner += amlAlertList('amber', t('Counterparty public tags'), peerTagAlerts.map(item =>
      esc(t('Peer flagged by public tag: {tag} — {addr}', { tag: item.tag, addr: addrLabel(item.addr) }))
    ));
  }
  const alertsHtml = alertsInner ? `<div class="aml-alerts">${alertsInner}</div>` : '';

  const concCls = concentration > 0.7 ? 'is-red' : concentration > 0.5 ? 'is-amber' : 'is-info';
  const ageSub = knownEntityCount > 0
    ? `${knownEntityCount} known ${tt('entity')}${knownEntityCount > 1 ? 's' : ''}`
    : peersPending
      ? t('Checking counterparties…')
      : t('latest {count} transactions', { count: amlSampleCount() });

  const heroHtml = `
    ${amlRiskStat(status, statusLabel, finalScore, isFlagged, hasHardSignals)}
    <div class="an-stat">
      <div class="an-stat-label">${t('Transactions')}</div>
      <div class="an-stat-value is-info">${txCount}</div>
      <div class="an-stat-sub">${dtCount} ${t('direct')} · ${txCount - dtCount} ${t('contract')}</div>
    </div>
    <div class="an-stat">
      <div class="an-stat-label">${tt('concentration')}</div>
      <div class="an-stat-value ${dtCount > 0 ? concCls : 'is-neutral'}">${dtCount > 0 ? (concentration * 100).toFixed(0) : '—'}${dtCount > 0 ? '<span class="aml-score-unit">%</span>' : ''}</div>
      <div class="an-stat-sub">${uniquePeers} ${tt('counterparty')}s</div>
    </div>
    <div class="an-stat">
      <div class="an-stat-label">${t('Account age')}</div>
      <div class="an-stat-value is-amber">${ageDays !== null && ageDays !== undefined ? ageDays + '<span class="aml-score-unit">d</span>' : '—'}</div>
      <div class="an-stat-sub">${ageSub}</div>
    </div>`;

  let assessmentHtml;
  if (isFlagged) {
    assessmentHtml = amlAlertInline('red', `<strong>${tt('flagged')}</strong> — ${esc(t(hardFlags[0] || 'Security flags detected'))}`);
  } else if (status === 'unusual') {
    assessmentHtml = amlAlertInline('amber', t('Unusual activity — review counterparties and transaction history below.'));
  } else if (status === 'insufficient') {
    assessmentHtml = amlAlertInline('amber', t('Insufficient transaction data to evaluate activity risk.'));
  } else {
    assessmentHtml = amlAlertInline('green', t('No flags found — address appears to be a regular wallet.'));
  }

  const sourceRows = [
    amlKvRow(tt('aml'), amlSourceSecAccValue(secAccLevel, flagSources.secAcc)),
    amlKvRow(t('Sanctions lists'), amlSanctionsSourceValue(sanctionMeta, sanctionUnavailable, flagSources.sanctions)),
    amlKvRow(t('TRONSEC labels'), flagSources.labels?.length
      ? `<div class="aml-flag-list">${flagSources.labels.map((e) => esc(typeof e.label === 'string' ? t(e.label) : e.label)).join('<br>')}</div>`
      : amlSourceBadge('clean')),
    amlKvRow(tt('shield'), amlSourceBadge(secTokenLevel), true),
  ];
  const sourcesHtml = amlPanel(t('Sources checked'), sourceRows.join(''));

  const flowRatioHtml = (inboundCount > 0 || outboundCount > 0)
    ? amlKvRow(t('Inbound/outbound ratio'), `<span class="kv-muted">${inboundCount} / ${outboundCount}${flowRatio != null && outboundCount > 0 ? ` (${Number(flowRatio).toFixed(1)}×)` : ''}</span>`)
    : '';
  const firstFunderHtml = firstFunder?.addr
    ? amlKvRow(t('First funder'), `${amlAddrLink(firstFunder.addr)} <span class="kv-muted">· ${esc(firstFunder.asset || 'TRX')}${firstFunder.time ? ` · ${ago(firstFunder.time)}` : ''}</span>`)
    : '';

  const onchainHtml = balanceTrx !== null || txCount > 0 || accCreated || activityWindow || flowRatioHtml || firstFunderHtml
    ? amlPanel(t('On-chain data'), `
        ${balanceTrx !== null ? amlKvRow(t('Balance'), `<span class="is-info">${balanceTrx.toFixed(2)} TRX</span>`) : ''}
        ${amlKvRow(t('Sample analyzed'), `${fmtNum(txCount)} txs`)}
        ${flowRatioHtml}
        ${firstFunderHtml}
        ${activityWindow ? amlKvRow(t('Activity window'), `<span class="kv-muted">${activityWindow}</span>`) : ''}
        ${accCreated ? amlKvRow(t('Account created'), esc(accCreated), true) : amlKvRow(t('Account created'), `<span class="kv-muted">${t('Unknown')}</span>`, true)}
      `)
    : '';

  const signalsHtml = amlSignalsPanel(scoreFactors, finalScore, status);
  const exposureCatsHtml = typeof amlExposurePanel === 'function'
    ? amlExposurePanel(exposureBreakdown, peersPending)
    : '';
  const peersMeta = peersPending
    ? t('Security screening…')
    : { key: 'Top {count} by direct transfers · TronScan security API', vars: { count: AML_PEER_SECURITY_LIMIT } };
  const peersNoteBase = t('These addresses sent or received the most direct TRX/TRC-20 transfers in the analyzed sample. Each is checked against TronScan security data (blacklist, fraud, token abuse).');
  const peersNote = !peersPending && peerFlags.length === 0 && (flagSources.secAcc?.length || flagSources.tags?.length)
    ? `${peersNoteBase} ${t('No flagged counterparties here — risk comes from the scanned address itself (TronScan account security).')}`
    : peersNoteBase;
  const directTransfers = graphPayload?.directTransfers || [];
  const trxPriceUsd = graphPayload?.trxPriceUsd ?? (typeof TRX_PRICE === 'number' ? TRX_PRICE : null);
  const peersHtml = amlPeersPanel(topPeers, {
    peersPending,
    peerFlags,
    dustPeers,
    peerCatMap,
    screenedSet,
    directTransfers,
    trxPriceUsd,
    peerSecurityLimit: AML_PEER_SECURITY_LIMIT,
    noteHtml: esc(peersNote),
    meta: peersMeta,
  });

  const contractsHtml = topContracts.length > 0
    ? amlRowsBlock(
        `Top contracts <span>· ${topContracts.length}</span>`,
        topContracts.map(([a, c]) => `
          <div class="aml-row aml-row--compact">
            <div class="aml-row-body">
              <div class="aml-row-title">${amlAddrLink(a)}</div>
              <div class="aml-row-meta">${c} contract calls</div>
            </div>
          </div>`).join('')
      )
    : '';

  const graphHtml = topPeers.length > 0
    ? amlBlock(`${tt('counterparty')} graph`, '<div class="aml-graph-root"><div class="aml-graph-wrap" id="aml-graph-container"></div></div>', `${addrLabel(addr)} · last ${txCount} txs`)
    : '';

  const detailsGrid = [signalsHtml, onchainHtml].filter(Boolean).join('');
  const exposureGrid = [exposureCatsHtml, sourcesHtml].filter(Boolean).join('');

  return {
    addr,
    headTagsHtml,
    alertsHtml,
    heroHtml,
    assessmentHtml,
    detailsGrid,
    exposureGrid,
    graphHtml,
    peersHtml,
    contractsHtml,
    graphPayload,
  };
}

function renderAmlScanFromReport(report, graphPayload, fromCache = false, opts = {}) {
  if (!report?.addr) return false;
  const addr = report.addr;
  amlFromCache = fromCache;
  amlLastAddr = addr;
  window._amlLastReport = report;
  hideScanEmpty(amlEmpty, { instant: true });

  const parts = buildAmlViewParts(report, graphPayload, opts);
  const headHtml = amlHeadCard(addr, parts.headTagsHtml, fromCache);

  amlRes.innerHTML = `
    <div class="aml-scan">
      ${headHtml}
      <div id="aml-live-alerts"${parts.alertsHtml ? '' : ' hidden'}>${parts.alertsHtml}</div>
      <div class="an-stat-grid an-stat-grid--4 scan-hero-grid" id="aml-live-hero">${parts.heroHtml}</div>
      <div class="aml-assessment" id="aml-live-assessment">${parts.assessmentHtml}</div>
      ${typeof tronsecDeepAnalysisPromptHtml === 'function' ? tronsecDeepAnalysisPromptHtml('aml') : ''}
      ${parts.detailsGrid ? `<div class="aml-grid-2" id="aml-live-details">${parts.detailsGrid}</div>` : ''}
      <div class="aml-grid-2" id="aml-live-exposure">${parts.exposureGrid}</div>
      ${parts.graphHtml ? `<div id="aml-live-graph">${parts.graphHtml}</div>` : ''}
      <div id="aml-live-peers">${parts.peersHtml}</div>
      ${parts.contractsHtml}
      <p class="aml-disclaimer">${amlDisclaimerText()}</p>
    </div>`;

  bindAmlActions(addr);
  if (graphPayload?.topPeers?.length) {
    renderAMLGraph(
      'aml-graph-container',
      graphPayload.addr,
      graphPayload.topPeers,
      graphPayload.peerFlags,
      graphPayload.directTransfers,
      graphPayload.txCount,
      {
        selfFlagged: !!graphPayload.selfFlagged,
        peerCategories: graphPayload.peerCategories || [],
        trxPriceUsd: graphPayload.trxPriceUsd ?? null,
      },
    );
  }
  if (typeof syncModuleNavState === 'function') syncModuleNavState('aml-check');
  if (window.lucide) lucide.createIcons();
  mountScanMotion(amlRes, { fromCache: fromCache || opts.skipMotion });
  return true;
}

function patchAmlProgressiveFinish(report, graphPayload, gen) {
  if (gen !== amlScanGen || !report?.addr || amlLastAddr !== report.addr) return false;
  window._amlLastReport = report;

  const parts = buildAmlViewParts(report, graphPayload, { peersPending: false });
  const tagsEl = amlRes?.querySelector('.wallet-head-tags');
  if (tagsEl) tagsEl.innerHTML = parts.headTagsHtml;

  const alertsEl = document.getElementById('aml-live-alerts');
  if (alertsEl) {
    alertsEl.innerHTML = parts.alertsHtml;
    alertsEl.hidden = !parts.alertsHtml;
  }

  const heroEl = document.getElementById('aml-live-hero');
  if (heroEl) {
    const prevScoreEl = heroEl.querySelector('[data-score-value]');
    const prevScore = prevScoreEl ? Number(prevScoreEl.textContent) : null;
    heroEl.innerHTML = parts.heroHtml;
    const nextScoreEl = heroEl.querySelector('[data-score-value]');
    if (nextScoreEl) {
      if (Number.isFinite(prevScore) && prevScore !== report.finalScore) {
        animateScore(nextScoreEl, prevScore, report.finalScore, 450);
      } else {
        nextScoreEl.textContent = String(report.finalScore);
      }
    }
    const meterEl = heroEl.querySelector('.aml-risk-meter-fill[data-score-pct]');
    if (meterEl) {
      const pct = Number(meterEl.dataset.scorePct);
      if (Number.isFinite(pct)) {
        meterEl.style.width = '4%';
        requestAnimationFrame(() => {
          meterEl.classList.add('is-animated');
          meterEl.style.width = `${Math.max(4, pct)}%`;
        });
      }
    }
  }

  const assessmentEl = document.getElementById('aml-live-assessment');
  if (assessmentEl) assessmentEl.innerHTML = parts.assessmentHtml;

  const detailsEl = document.getElementById('aml-live-details');
  if (detailsEl && parts.detailsGrid) detailsEl.innerHTML = parts.detailsGrid;

  const exposureEl = document.getElementById('aml-live-exposure');
  if (exposureEl) exposureEl.innerHTML = parts.exposureGrid;

  const peersEl = document.getElementById('aml-live-peers');
  if (peersEl) peersEl.innerHTML = parts.peersHtml;

  if (graphPayload?.topPeers?.length) {
    renderAMLGraph(
      'aml-graph-container',
      graphPayload.addr,
      graphPayload.topPeers,
      graphPayload.peerFlags,
      graphPayload.directTransfers,
      graphPayload.txCount,
      {
        selfFlagged: !!graphPayload.selfFlagged,
        peerCategories: graphPayload.peerCategories || [],
        trxPriceUsd: graphPayload.trxPriceUsd ?? null,
      },
    );
  }

  if (window.lucide) lucide.createIcons();
  amlRes.dataset.amlBindAddr = report.addr;
  return true;
}


function escapeToken(t) { return esc(t?.tokenAbbr || t?.tokenName || t?.tokenId || t?.tokenContractAddress || '-'); }


// -- Known DEX / CEX / issuer contracts (excluded from concentration heuristics) --
const AML_STABLE_CONTRACTS = new Set([
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT
  'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', // USDC
  'TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4', // TUSD
  'TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT', // USDJ
].map((a) => a.toLowerCase()));

const AML_EXCLUDED_PEERS = new Set([
  'TNJVzGqKBWkJxJB5XYSqGAwUTV15U24pPq', // SunSwap V2 Router
  'TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax', // SunSwap V2 Router (legacy)
  'TKWJdrQkqHisa1X8HUdHEfREvTzw4pMAaY', // SunSwap V2 Factory
  'TCFNp179Lg46D16zKoumd4Poa2WFFdtqYj', // SUN.io Smart Router
  'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S', // SUN token / pool
  'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9', // JST
  'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7', // WIN
  'TNUC9Qb1rRpN8skWv9nHQLdGAWZWjUEYue', // WTRX
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT
  'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', // USDC
  'TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4', // TUSD
  'TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT', // USDJ
  'TJ4NNy8x6a2KJ4Ap9R9YTkPJ73R2JvN8xq', // Binance hot
  'THPvaUhoh4q8SF59m74avMWz642aZ6m5c5', // Binance
  'TKHuVq1oKQLXTkdQ59xKf7g4v6pKgjL1ug', // HTX / Huobi
  'TQrY8tryqsYHD76AMAxYcVp9dLXqXpU3f', // OKX
  'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', // Poloniex
  'TYASr5UV6HEcXatwdFQfmLVUqQQzvNgz9i', // KuCoin
  'TAUUPGQqR8WCVL88Ap9qoHk5XGrHsmNGJQ', // Allbridge
  'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt', // WBTT
  'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4', // BTT
].map((a) => a.toLowerCase()));

// -- Method signature lookup --
const SIG_TRANSFER     = 'a9059cbb'; // transfer(address,uint256)
const SIG_TRANSFER_FROM = '23b872dd'; // transferFrom(address,address,uint256)

function isKnownDex(addrBase58) {
  return isAmlExcludedPeer(addrBase58);
}

function isAmlExcludedPeer(addrBase58) {
  return AML_EXCLUDED_PEERS.has(String(addrBase58 || '').toLowerCase());
}

function amlStableAssetLabel(contractAddr) {
  const key = String(contractAddr || '').toLowerCase();
  if (key === 'tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t') return 'USDT';
  if (key === 'tekxitehnzsmse2xqrbj4w32run966rdz8') return 'USDC';
  if (key === 'tupmherzl2fhh4svnulabnkloks4gjc1f4') return 'TUSD';
  if (key === 'tmwfhyxljarupew6421aqxl4zezprfgkgt') return 'USDJ';
  return AML_STABLE_CONTRACTS.has(key) ? 'stablecoin' : '';
}

// Extract hex address from padded 32-byte encoding in calldata
function decodeAddressFromData(data, byteOffset) {
  const start = byteOffset * 2 + 24; // skip 12 zero bytes padding
  return '41' + data.slice(start, start + 40).toLowerCase();
}

// Try to extract TRC20 transfer recipient from tx data
function getTRC20Recipient(tx) {
  const data = tx.raw_data?.contract?.[0]?.parameter?.value?.data || '';
  const sig = data.slice(0, 8).toLowerCase();
  if (sig === SIG_TRANSFER) {
    return decodeAddressFromData(data, 4); // offset 4 bytes = param 1
  }
  if (sig === SIG_TRANSFER_FROM) {
    return decodeAddressFromData(data, 36); // offset 36 bytes = param 2 (to)
  }
  return null;
}

function decodeTrc20AmountFromData(data, sig) {
  if (!data || data.length < 72) return 0;
  let hex = '';
  if (sig === SIG_TRANSFER && data.length >= 136) hex = data.slice(72, 136);
  else if (sig === SIG_TRANSFER_FROM && data.length >= 200) hex = data.slice(136, 200);
  if (!hex) return 0;
  try {
    return Number(BigInt('0x' + hex));
  } catch (_) {
    return parseInt(hex, 16) || 0;
  }
}

function amlTriggerTransferAmount(tx, val, isTrc20) {
  const rawAmt = Number(val?.amount || val?.call_value || 0) || 0;
  if (isTrc20 && rawAmt > 0) return rawAmt;
  const data = val?.data || '';
  const sig = data.slice(0, 8).toLowerCase();
  if (sig === SIG_TRANSFER || sig === SIG_TRANSFER_FROM) {
    const decoded = decodeTrc20AmountFromData(data, sig);
    if (decoded > 0) return decoded;
  }
  return rawAmt;
}

function buildAmlHardFlags(secAcc, tagAcc) {
  return [
    ...amlSecAccFlagEntries(secAcc),
    ...amlTagFlagEntries(tagAcc),
  ].map((entry) => entry.label);
}

function amlSanctionHitLabel(hit) {
  const entity = hit?.entity || t('Listed entity');
  switch (hit?.source) {
    case 'uk_ofsi': return t('UK OFSI listed: {entity}', { entity });
    case 'eu_sanctions': return t('EU sanctions listed: {entity}', { entity });
    case 'ofac_sdn': return t('OFAC SDN listed: {entity}', { entity });
    default: return t('Sanctions listed: {entity}', { entity });
  }
}

function amlSanctionHitHint(hit) {
  const programs = (hit?.programs || []).join(', ') || '—';
  switch (hit?.source) {
    case 'uk_ofsi': return t('UK OFSI consolidated list · {programs}', { programs });
    case 'eu_sanctions': return t('EU consolidated sanctions · {programs}', { programs });
    case 'ofac_sdn': return t('U.S. Treasury SDN · programs: {programs}', { programs });
    default: return t('Sanctions list · {programs}', { programs });
  }
}

function amlLabelHitLabel(hit) {
  return t('TRONSEC label: {label}', { label: hit?.label || hit?.entity || t('Listed entity') });
}

function amlLabelHitHint(hit) {
  return hit?.remarks || t('Internal TRONSEC AML label — not a government sanctions list.');
}

function amlScreenFlagEntries(hits, subjectAddr) {
  return (hits || [])
    .filter((h) => sameTronAddr(h.addr, subjectAddr))
    .map((h) => {
      if (h.source === 'tronsec_label') {
        return {
          label: amlLabelHitLabel(h),
          hint: amlLabelHitHint(h),
          source: h.source,
          category: h.category,
        };
      }
      return {
        label: amlSanctionHitLabel(h),
        hint: amlSanctionHitHint(h),
        source: h.source,
      };
    });
}

function mergeAmlScreeningResults({
  addr,
  peerAddrs = [],
  sanctionRes,
  subjectCategories = [],
  peerCategories = [],
  peerFlags = [],
  hardFlags = [],
}) {
  const hits = sanctionRes?.hits || [];
  const meta = sanctionRes?.meta || {};
  const subjectCats = [...subjectCategories];
  const peerCats = [...peerCategories];
  const flags = [...peerFlags];
  const hard = [...hardFlags];
  const screenEntries = amlScreenFlagEntries(hits, addr);
  const sanctionPeerAddrs = [];
  const peerSet = new Set((peerAddrs || []).map((a) => String(a).toLowerCase()));

  for (const hit of hits || []) {
    if (sameTronAddr(hit.addr, addr)) {
      if (hit.source === 'tronsec_label') {
        const cat = hit.category || 'unknown_risk';
        if (!subjectCats.some((c) => c.category === cat && c.source === 'tronsec_label')) {
          subjectCats.push({ category: cat, source: 'tronsec_label', detail: hit.label || hit.entity });
        }
        const label = amlLabelHitLabel(hit);
        if (!hard.includes(label)) hard.push(label);
      } else if (isAmlSanctionHit(hit)) {
        const detail = hit.programs?.length
          ? `${hit.source} · ${hit.programs.join(', ')}`
          : hit.source;
        if (!subjectCats.some((c) => c.category === 'sanctions' && c.source === hit.source)) {
          subjectCats.push({ category: 'sanctions', source: hit.source, detail });
        }
        const label = amlSanctionHitLabel(hit);
        if (!hard.includes(label)) hard.push(label);
      }
      continue;
    }
