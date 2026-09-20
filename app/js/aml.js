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
