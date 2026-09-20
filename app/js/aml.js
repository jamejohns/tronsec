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
