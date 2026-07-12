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

const AML_DISCLAIMER_KEY = 'This report is a risk analysis based on the latest {count} on-chain transactions and public security tags. It is not a legal or compliance determination.';

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
      const { addr, topPeers, peerFlags, directTransfers, txCount } = cached.graphPayload;
      renderAMLGraph('aml-graph-container', addr, topPeers, peerFlags, directTransfers, txCount);
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

const AML_PDF = {
  bg: [10, 10, 11],
  panel: [17, 17, 19],
  text: [245, 245, 247],
  text2: [161, 161, 170],
  text3: [113, 113, 122],
  text4: [82, 82, 91],
  line: [38, 38, 42],
  red: [251, 113, 133],
  green: [52, 211, 153],
  amber: [251, 191, 36],
  info: [200, 206, 216],
};

class AmlPdfWriter {
  constructor(reportId) {
    this.W = 595.28;
    this.H = 842;
    this.margin = 45;
    this.reportId = reportId || '';
    this.pages = [[]];
    this.pageIdx = 0;
    this.cursorY = this.H - this.margin;
    this.paintPageBg(this.reportId);
  }

  rgb(c) {
    return `${(c[0] / 255).toFixed(3)} ${(c[1] / 255).toFixed(3)} ${(c[2] / 255).toFixed(3)}`;
  }

  esc(text) {
    return amlPdfPlain(text)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  cmd(line) {
    this.pages[this.pageIdx].push(line);
  }

  newPage() {
    this.pageIdx += 1;
    this.pages.push([]);
    this.cursorY = this.H - this.margin - 30;
    this.paintPageBg(this.reportId);
  }

  need(h) {
    if (this.cursorY - h < this.margin + 52) this.newPage();
  }

  paintPageBg(reportId) {
    this.cmd('q');
    this.cmd(`${this.rgb(AML_PDF.bg)} rg`);
    this.cmd(`0 0 ${this.W} ${this.H} re f`);
    this.cmd('Q');
    this.drawFooter(reportId);
  }

  drawFooter(reportId) {
    const fy = this.margin + 4;
    this.strokeLine(fy + 16, AML_PDF.line);
    this.drawShield(this.margin, fy + 1, 13);
    this.text(this.margin + 18, fy + 10, 'TRONSEC', 8, 'sans', AML_PDF.text, true);
    this.text(this.margin + 18, fy + 2, 'AML Screening', 6.5, 'mono', AML_PDF.text4);
    if (reportId) {
      this.textRight(this.W - this.margin, fy + 8, reportId, 7, 'mono', AML_PDF.text4);
    }
  }

  fillRect(x, y, w, h, color) {
    this.cmd('q');
    this.cmd(`${this.rgb(color)} rg`);
    this.cmd(`${x} ${y} ${w} ${h} re f`);
    this.cmd('Q');
  }

  strokeLine(y, color) {
    this.cmd('q');
    this.cmd(`${this.rgb(color)} RG`);
    this.cmd('0.4 w');
    this.cmd(`${this.margin} ${y} m ${this.W - this.margin} ${y} l S`);
    this.cmd('Q');
  }

  strokeRect(x, y, w, h, color, width) {
    this.cmd('q');
    this.cmd(`${this.rgb(color)} RG`);
    this.cmd(`${width || 0.5} w`);
    this.cmd(`${x} ${y} ${w} ${h} re S`);
    this.cmd('Q');
  }

  panel(x, y, w, h, fill, border) {
    if (fill) this.fillRect(x, y, w, h, fill);
    if (border) this.strokeRect(x, y, w, h, border, 0.5);
  }

  text(x, y, str, size, font, color, bold) {
    const key = font === 'mono' ? 'F2' : (bold ? 'F1b' : 'F1');
    this.cmd('BT');
    this.cmd(`${this.rgb(color)} rg`);
    this.cmd(`/${key} ${size} Tf`);
    this.cmd(`1 0 0 1 ${x} ${y} Tm`);
    this.cmd(`(${this.esc(str)}) Tj`);
    this.cmd('ET');
  }

  textWidth(str, size, font) {
    const ratio = font === 'mono' ? 0.6 : 0.48;
    return String(str).length * size * ratio;
  }

  textRight(rightX, y, str, size, font, color, bold) {
    this.text(rightX - this.textWidth(str, size, font), y, str, size, font, color, bold);
  }

  wrapText(str, maxWidth, size, font) {
    const words = String(str).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (this.textWidth(test, size, font) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  drawShield(x, y, size) {
    const w = size * 0.82;
    const h = size;
    const mx = (v) => x + (v / 64) * w;
    const my = (v) => y + h - (v / 64) * h;
    this.cmd('q');
    this.cmd(`${this.rgb(AML_PDF.text)} rg`);
    this.cmd(`${mx(32)} ${my(8)} m`);
    this.cmd(`${mx(12)} ${my(18)} l`);
    this.cmd(`${mx(12)} ${my(30)} l`);
    this.cmd(`${mx(12)} ${my(40.8)} ${mx(20.2)} ${my(50.8)} ${mx(32)} ${my(54)} c`);
    this.cmd(`${mx(43.8)} ${my(50.8)} ${mx(52)} ${my(40.8)} ${mx(52)} ${my(30)} c`);
    this.cmd(`${mx(52)} ${my(18)} l`);
    this.cmd(`${mx(32)} ${my(8)} l`);
    this.cmd('h f');
    this.cmd('Q');
  }

  section(title) {
    this.need(28);
    this.strokeLine(this.cursorY, AML_PDF.line);
    this.cursorY -= 18;
    this.text(this.margin, this.cursorY, amlPdfPlain(title).toUpperCase(), 8, 'sans', AML_PDF.text4, true);
    this.cursorY -= 14;
  }

  bullet(str, color) {
    const lines = this.wrapText(str, this.W - this.margin * 2 - 16, 9, 'sans');
    this.need(lines.length * 12 + 4);
    lines.forEach((line, i) => {
      if (i === 0) this.text(this.margin, this.cursorY, '-', 9, 'mono', AML_PDF.text4);
      this.text(this.margin + 10, this.cursorY, line, 9, 'sans', color || AML_PDF.text2);
      this.cursorY -= 12;
    });
    this.cursorY -= 2;
  }

  row(label, value, valueColor) {
    this.need(14);
    this.text(this.margin, this.cursorY, label, 9, 'sans', AML_PDF.text3);
    this.text(this.margin + 150, this.cursorY, String(value), 9, 'mono', valueColor || AML_PDF.text);
    this.cursorY -= 14;
  }

  disclaimerBox(text) {
    const lines = this.wrapText(text, this.W - this.margin * 2 - 20, 7.5, 'sans');
    const boxH = lines.length * 10 + 18;
    this.need(boxH + 14);
    const boxY = this.cursorY - boxH;
    this.panel(this.margin, boxY, this.W - this.margin * 2, boxH, AML_PDF.panel, AML_PDF.line);
    this.text(this.margin + 10, this.cursorY - 12, 'DISCLAIMER', 7, 'mono', AML_PDF.text4, true);
    let ly = this.cursorY - 24;
    lines.forEach(line => {
      this.text(this.margin + 10, ly, line, 7.5, 'sans', AML_PDF.text3);
      ly -= 10;
    });
    this.cursorY = boxY - 14;
  }

  download(filename) {
    const blob = new Blob([this.build()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  build() {
    const objs = [''];
    const add = (body) => { objs.push(body); return objs.length - 1; };

    const fontSans = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const fontSansBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const fontMono = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

    const contentIds = this.pages.map((page) => {
      const stream = page.join('\n');
      return add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    const pageIds = contentIds.map(() => add('PLACEHOLDER'));
    const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);

    pageIds.forEach((pageId, i) => {
      objs[pageId] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontSans} 0 R /F1b ${fontSansBold} 0 R /F2 ${fontMono} 0 R >> >> >>`;
    });

    const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let i = 1; i < objs.length; i++) {
      offsets.push(pdf.length);
      pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xrefPos = pdf.length;
    pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objs.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objs.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    return pdf;
  }
}

function amlPdfStatusColor(status, isFlagged) {
  if (isFlagged || status === 'flagged') return AML_PDF.red;
  if (status === 'unusual') return AML_PDF.amber;
  if (status === 'insufficient') return AML_PDF.text3;
  return AML_PDF.green;
}

function amlExportPdf(report) {
  const btn = document.getElementById('aml-export-pdf-btn');
  if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
  try {
    const reportId = `ID ${report.addr.slice(-8).toUpperCase()}`;
    const pdf = new AmlPdfWriter(reportId);
    const m = pdf.margin;
    const scoreColor = amlPdfStatusColor(report.status, report.isFlagged);
    const top = pdf.H - m;

    pdf.text(m, top - 16, 'TRONSEC', 22, 'sans', AML_PDF.text, true);
    pdf.text(m, top - 30, 'AML SCREENING REPORT', 9, 'mono', AML_PDF.text4, true);

    const stamp = new Date(report.scannedAt).toUTCString().replace(' GMT', ' UTC');
    pdf.textRight(pdf.W - m, top - 16, stamp, 7.5, 'mono', AML_PDF.text4);
    pdf.textRight(pdf.W - m, top - 28, reportId, 7.5, 'mono', AML_PDF.text4);

    pdf.strokeLine(top - 40, AML_PDF.line);

    const cardH = 78;
    const cardY = top - 40 - cardH;
    pdf.fillRect(m, cardY, 4, cardH, scoreColor);
    pdf.panel(m + 4, cardY, pdf.W - m * 2 - 4, cardH, AML_PDF.panel, AML_PDF.line);

    pdf.text(m + 18, cardY + 54, String(report.finalScore), 28, 'mono', scoreColor, true);
    pdf.text(m + 46, cardY + 54, '/100', 11, 'mono', AML_PDF.text3);
    pdf.text(m + 18, cardY + 36, t(report.statusLabel), 11, 'sans', scoreColor, true);
    pdf.text(m + 18, cardY + 22, report.hasHardSignals ? t('Composite risk signal') : t('Activity risk signal'), 8, 'sans', AML_PDF.text4);
    pdf.text(m + 18, cardY + 10, t('Sample: latest {count} transactions', { count: amlSampleCount() }), 7, 'mono', AML_PDF.text4);

    pdf.text(m + 200, cardY + 62, t('SUBJECT ADDRESS'), 7, 'mono', AML_PDF.text4, true);
    const addrLines = pdf.wrapText(report.addr, pdf.W - m * 2 - 212, 8.5, 'mono');
    addrLines.slice(0, 2).forEach((line, i) => {
      pdf.text(m + 200, cardY + 48 - i * 12, line, 8.5, 'mono', AML_PDF.text2);
    });

    pdf.cursorY = cardY - 22;

    if (report.assessmentText) {
      pdf.section(t('Assessment'));
      pdf.bullet(t(report.assessmentText), scoreColor);
    }
    if (report.hardFlags?.length) {
      pdf.section(t('Security flags'));
      report.hardFlags.forEach(flag => pdf.bullet(t(flag), AML_PDF.red));
    }
    if (report.peerFlags?.length) {
      pdf.section(t('Flagged counterparties (TronScan security)'));
      report.peerFlags.slice(0, 8).forEach(p => pdf.bullet(p, AML_PDF.amber));
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

    if (report.parsedTokens?.length) {
      pdf.section(t('Token exposure'));
      report.parsedTokens.slice(0, 6).forEach(tok => {
        const val = tok.usd != null ? `$${tok.usd.toFixed(2)}` : tok.balance.toFixed(4);
        pdf.row(tok.symbol, `${val} / bal ${tok.balance.toFixed(4)}`);
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

function amlShieldIcon(riskScore, size, isFlagged) {
  return riskShieldIcon(riskScore, size, { flagged: isFlagged, className: 'risk-shield-icon aml-risk-icon' });
}

function amlHardFlagPoints(label) {
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
    : amlShieldIcon(finalScore, 40, isFlagged);
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

function amlPeerActionBadge(secState, count) {
  if (secState === 'flagged') return { cls: 'b-red', label: ttLabel('flagged') };
  if (secState === 'pending') return { cls: 'b-ghost', label: '…' };
  // Match graph.js nodeType: count > 20 → warn (amber), even when TronScan is clean
  if (count > 20) return { cls: 'b-amber', label: 'watch' };
  if (secState === 'screened') return { cls: 'b-green', label: 'ok' };
  if (count > 5) return { cls: 'b-amber', label: 'watch' };
  return { cls: 'b-ghost', label: 'Not screened' };
}

function amlPeerRow(addr, count, volCls, volLabel, secState = 'unscreened') {
  const initials = addr.slice(1, 4).toUpperCase() || 'ADR';
  const isFlaggedPeer = secState === 'flagged';
  const isWatchPeer = !isFlaggedPeer && count > 20;
  let securityMeta = '';
  if (secState === 'flagged') {
    securityMeta = `<span class="aml-peer-security is-flagged">${esc(t('TronScan security · flagged'))}</span>`;
  } else if (secState === 'screened') {
    securityMeta = isWatchPeer
      ? `<span class="aml-peer-security is-watch">${esc(t('TronScan security · no flags'))} · ${esc(t('High transfer volume'))}</span>`
      : `<span class="aml-peer-security is-clear">${esc(t('TronScan security · no flags'))}</span>`;
  } else if (secState === 'pending') {
    securityMeta = `<span class="aml-peer-security is-pending">${esc(t('TronScan security · checking…'))}</span>`;
  } else {
    securityMeta = `<span class="aml-peer-security is-muted">${esc(t('Not screened'))}</span>`;
  }
  return `<div class="aml-row risk-row${isFlaggedPeer ? ' is-risk is-high' : isWatchPeer ? ' is-risk is-med' : ''}">
    <div class="aml-row-icon">${esc(initials)}</div>
    <div class="aml-row-body">
      <div class="aml-row-title">${amlAddrLink(addr)}</div>
      <div class="aml-row-meta">${t('{count} direct transfers', { count })}</div>
      ${securityMeta}
    </div>
    <div class="aml-row-action">${badge(volCls, volLabel)}</div>
  </div>`;
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

function amlTokensPanel(parsedTokens) {
  if (!parsedTokens.length) {
    return amlBlock(t('Token exposure'), '<div class="aml-empty">' + esc(t('No TRC20 balances detected')) + '</div>');
  }
  const rows = parsedTokens.map(tok => {
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
  return amlRowsBlock(`Token exposure <span>· ${parsedTokens.length}</span>`, rows, t('TronScan token security'));
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
    peerTagAlerts = [],
    scoreFactors = [], txCount = 0, dtCount = 0, concentration = 0, uniquePeers = 0,
    ageDays, knownEntityCount = 0, balanceTrx, accCreated, activityWindow,
    tronTags = [], parsedTokens = [], topPeers = [], topContracts = [],
    peerSecurityScreened = [],
    secAccLevel = 'unavailable', secTokenLevel = 'unavailable', incompleteHistory = false,
    firstFunder = null, inboundCount = 0, outboundCount = 0, flowRatio = null,
  } = report;

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
  if (isFlagged && hardFlags.length) {
    alertsInner += amlAlertList('red', 'Security flags', hardFlags.map(f => esc(t(f))));
  }
  if (incompleteHistory) {
    alertsInner += amlAlertInline('amber', t('Security flags detected, but recent transaction history could not be loaded — activity metrics below may be incomplete.'));
  }
  if (!peersPending && peerFlags.length > 0) {
    alertsInner += amlAlertList('amber', t('Flagged counterparties (TronScan security)'), peerFlags.map(a => amlAddrLink(a)));
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
    amlKvRow(tt('aml'), amlSourceBadge(secAccLevel)),
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
  const tokensHtml = amlTokensPanel(parsedTokens);
  const peersMeta = peersPending
    ? t('Security screening…')
    : { key: 'Top {count} by direct transfers · TronScan security API', vars: { count: AML_PEER_SECURITY_LIMIT } };
  const peersHtml = amlRowsBlock(
    `${esc(t('Top counterparties (security screened)'))} <span>· ${topPeers.length}</span>`,
    topPeers.map(([a, c]) => {
      const secState = peersPending
        ? 'pending'
        : peerFlags.includes(a)
          ? 'flagged'
          : (screenedSet.has(a) ? 'screened' : 'unscreened');
      const { cls: flag, label: flagLabel } = amlPeerActionBadge(secState, c);
      return amlPeerRow(a, c, flag, flagLabel, secState);
    }).join(''),
    peersMeta,
    'No direct transfers found in analyzed history',
    esc(t('These addresses sent or received the most direct TRX/TRC-20 transfers in the analyzed sample. Each is checked against TronScan security data (blacklist, fraud, token abuse).'))
  );

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
  const exposureGrid = [sourcesHtml, tokensHtml].join('');

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
      graphPayload.txCount
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
      graphPayload.txCount
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

function buildAmlHardFlags(secAcc, tagAcc) {
  const hardFlags = [];
  if (secAcc) {
    const redTag = String(secAcc.red_tag || secAcc.redTag || '').trim();
    if (/suspicious/i.test(redTag)) {
      hardFlags.push('TronScan flagged as Suspicious');
    }
    if (secAcc.is_black_list)           hardFlags.push('Blacklisted by stablecoin issuer (USDT/USDC)');
    if (secAcc.has_fraud_transaction)   hardFlags.push('Has flagged fraud transactions');
    if (secAcc.has_cheat_transaction)   hardFlags.push('Suspicious cheat transactions');
    if (secAcc.fraud_token_creator)     hardFlags.push('Created fraud tokens');
    if (secAcc.send_ad_by_memo)         hardFlags.push('Frequently sends advertising/spam');
  }
  if (tagAcc) {
    const tags = normalizeTagList(tagAcc);
    for (const tag of tags) {
      const tagName = (typeof tag === 'string' ? tag : (tag.tagName || tag.tag || tag.label || ''));
      if (!tagName) continue;
      if (AML_SANCTION_TAG_RE.test(tagName)) {
        hardFlags.push(t('Sanctioned (public tag): {tag}', { tag: tagName }));
      } else if (AML_RISK_TAG_RE.test(tagName)) {
        hardFlags.push(t('Security tag: ') + tagName);
      }
    }
  }
  return hardFlags;
}

function classifyAmlTokenSecurity(secToken) {
  if (!secToken) return 'unavailable';
  const level = secToken.token_level;
  if (level === '3' || level === 3) return 'flagged';
  if (secToken.increase_total_supply || secToken.black_list_type) return 'warnings';
  if (level === '2' || level === 2) return 'warnings';
  return 'clean';
}

function amlTokenSecurityNote(secToken) {
  if (!secToken) return '';
  if (secToken.token_level === '3' || secToken.token_level === 3) return t('TronScan level 3');
  if (secToken.increase_total_supply) return t('Mintable supply');
  if (secToken.black_list_type) return t('Blacklist function');
  if (secToken.token_level === '2' || secToken.token_level === 2) return t('TronScan level 2');
  return '';
}

async function fetchAmlTokenSecurity(parsedTokens) {
  const tokens = (parsedTokens || []).slice(0, AML_TOKEN_SECURITY_LIMIT);
  const addrs = tokens.map(tok => tok.addr).filter(isValidTron);
  if (!addrs.length) {
    return { level: 'unavailable', flags: [], tokens: parsedTokens || [] };
  }

  const results = await Promise.all(
    addrs.map(addr => scanGet('/security/token/data', { address: addr }).catch(() => null)),
  );

  let worstLevel = 'clean';
  const flags = [];
  const enriched = (parsedTokens || []).map(tok => {
    const idx = addrs.indexOf(tok.addr);
    if (idx < 0) return tok;
    const sec = results[idx];
    const secLevel = classifyAmlTokenSecurity(sec);
    const secNote = amlTokenSecurityNote(sec);
    if (secLevel === 'flagged') {
      worstLevel = 'flagged';
      if (!flags.some(f => f.includes(tok.symbol))) {
        flags.push(t('High-risk token held: {symbol}', { symbol: tok.symbol }));
      }
    } else if (secLevel === 'warnings' && worstLevel !== 'flagged') {
      worstLevel = 'warnings';
    }
    return { ...tok, secLevel, secNote, secToken: sec };
  });

  return { level: worstLevel, flags, tokens: enriched };
}

function parseAmlExposureTokens(tokens) {
  return (tokens || []).map(tok => {
    const decimals = parseInt(tok.tokenDecimal || 6);
    const balance = parseFloat(tok.balance || 0) / Math.pow(10, decimals);
    const priceInUsd = parseFloat(tok.priceInUsd || tok.tokenPriceInUsd || 0);
    return {
      symbol: tok.tokenAbbr || tok.tokenName || '—',
      decimals,
      balance,
      usd: priceInUsd > 0 ? balance * priceInUsd : null,
      addr: tok.tokenId || tok.tokenContractAddress || '',
    };
  }).filter(tok => tok.balance > 0)
    .sort((a, b) => (b.usd || b.balance) - (a.usd || a.balance))
    .slice(0, 5);
}

async function analyzeAmlTransactions(addr, txs) {
  const hexSet = new Set();
  const txMeta = [];

  for (const tx of txs) {
    const c = tx.raw_data?.contract?.[0];
    const val = c?.parameter?.value;
    const tType = c?.type || '';
    const fromHex = val?.owner_address || val?.from || null;
    const toHex = val?.to || val?.to_address || null;
    const contractAddrHex = val?.contract_address || null;
    const amount = val?.amount || val?.call_value || 0;
    const time = tx.block_timestamp || 0;

    if (tType === 'TransferContract') {
      trackResolveAddr(hexSet, fromHex);
      trackResolveAddr(hexSet, toHex);
      txMeta.push({ type: 'direct', fromHex, toHex, contractHex: null, isDex: false, amount, time, isTrc20: false });
    } else if (tType === 'TriggerSmartContract') {
      const trc20From = tx._trc20From || fromHex || null;
      const trc20To = tx._trc20To || val?.to_address || getTRC20Recipient(tx) || tx._scanTrc20Peer || null;
      trackResolveAddr(hexSet, contractAddrHex);
      trackResolveAddr(hexSet, trc20From);
      trackResolveAddr(hexSet, trc20To);
      txMeta.push({ type: 'trigger', fromHex: trc20From, toHex: trc20To, peerHex: trc20To, contractHex: contractAddrHex, isDex: null, amount, time, isTrc20: !!tx._isTrc20 });
    }
  }

  const hexEntries = await Promise.all([...hexSet].map(async h => {
    const resolved = await hexToTronAddress(h);
    const final = sameTronAddr(resolved, addr) ? addr : resolved;
    return [addrLookupKey(h), final];
  }));
  const hexMap = new Map(hexEntries);
  const resolve = (a) => lookupResolvedAddr(hexMap, a, addr);

  const directTransfers = [];
  const contractInteractions = new Map();

  for (const m of txMeta) {
    if (m.type === 'direct') {
      const from = resolve(m.fromHex);
      const to = resolve(m.toHex);
      const inbound = sameTronAddr(to, addr);
      const outbound = sameTronAddr(from, addr);
      const peer = inbound ? from : (outbound ? to : (to || from));
      if (peer && !sameTronAddr(peer, addr) && !isAmlExcludedPeer(peer)) {
        directTransfers.push({
          peer,
          amount: Number(m.amount) || 0,
          time: m.time,
          isTrc20: false,
          inbound,
          outbound,
          asset: 'TRX',
        });
      }
    } else if (m.type === 'trigger') {
      const contractAddr = resolve(m.contractHex);
      const isDex = contractAddr ? isAmlExcludedPeer(contractAddr) : false;
      m.isDex = isDex;

      const from = resolve(m.fromHex);
      const to = resolve(m.toHex || m.peerHex);
      const isInbound = sameTronAddr(to, addr);
      const isOutbound = sameTronAddr(from, addr);
      const peer = isInbound ? from : (isOutbound ? to : (to || (m.peerHex ? resolve(m.peerHex) : null)));
      if (peer && !sameTronAddr(peer, addr) && !isDex && isValidTron(peer) && !isAmlExcludedPeer(peer)) {
        const stableLabel = amlStableAssetLabel(contractAddr);
        directTransfers.push({
          peer,
          amount: 0,
          time: m.time,
          isTrc20: !!m.isTrc20,
          inbound: isInbound,
          outbound: isOutbound,
          asset: stableLabel || (m.isTrc20 ? 'TRC20' : 'TRX'),
          isStable: !!stableLabel,
        });
      }

      if (contractAddr && isValidTron(contractAddr) && !isAmlExcludedPeer(contractAddr)) {
        const cKey = addrLookupKey(contractAddr);
        const prev = contractInteractions.get(cKey);
        contractInteractions.set(cKey, {
          addr: (prev?.addr && isValidTron(prev.addr)) ? prev.addr : contractAddr,
          count: (prev?.count || 0) + 1,
        });
      }
    }
  }

  const peerCounts = {};
  const peerDisplay = {};
  for (const d of directTransfers) {
    const k = addrLookupKey(d.peer);
    peerCounts[k] = (peerCounts[k] || 0) + 1;
    if (!peerDisplay[k] || isValidTron(d.peer)) peerDisplay[k] = d.peer;
  }
  const uniquePeers = Object.keys(peerCounts).length;
  const maxToSingle = Math.max(0, ...Object.values(peerCounts));
  const dtCount = directTransfers.length;
  const concentration = dtCount > 0 ? (maxToSingle / dtCount) : 0;
  const topPeers = Object.entries(peerCounts)
    .map(([k, c]) => [peerDisplay[k], c])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topContracts = [...contractInteractions.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map(v => [v.addr, v.count]);

  let inboundCount = 0;
  let outboundCount = 0;
  let stableInbound = 0;
  let stableOutbound = 0;
  let firstFunder = null;
  for (const d of directTransfers) {
    if (d.inbound) {
      inboundCount += 1;
      if (d.isStable) stableInbound += 1;
      if (d.time && (!firstFunder || d.time < firstFunder.time)) {
        firstFunder = { addr: d.peer, time: d.time, asset: d.asset || 'TRX' };
      }
    }
    if (d.outbound) {
      outboundCount += 1;
      if (d.isStable) stableOutbound += 1;
    }
  }

  const flowRatio = outboundCount > 0 ? inboundCount / outboundCount : (inboundCount > 0 ? inboundCount : null);

  return {
    directTransfers,
    topPeers,
    topContracts,
    dtCount,
    txCount: txs.length,
    concentration,
    uniquePeers,
    inboundCount,
    outboundCount,
    stableInbound,
    stableOutbound,
    flowRatio,
    firstFunder,
  };
}

async function fetchAmlPeerIntel(topPeers, tagAcc) {
  const peerFlags = [];
  const peerTagAlerts = [];
  const topPeerAddrs = topPeers.slice(0, AML_PEER_SECURITY_LIMIT).map(p => p[0]).filter(isValidTron);
  const peerTagAddrs = topPeers.map((p) => p[0]).filter(isValidTron);
  let knownEntityCount = 0;

  if (topPeerAddrs.length === 0 && peerTagAddrs.length === 0) {
    return { peerFlags, peerTagAlerts, knownEntityCount, topPeerAddrs };
  }

  const peerFetchResults = await Promise.all([
    ...topPeerAddrs.map((pAddr) =>
      scanGet('/security/account/data', { address: pAddr }).catch(() => null),
    ),
    ...peerTagAddrs.map((pAddr) =>
      scanGet('/account/tag', { address: pAddr }).catch(() => null),
    ),
  ]);
  const peerSecResults = peerFetchResults.slice(0, topPeerAddrs.length);
  const peerTagResults = peerFetchResults.slice(topPeerAddrs.length);

  for (let i = 0; i < topPeerAddrs.length; i++) {
    const ps = peerSecResults[i];
    if (!ps) continue;
    if (ps.is_black_list || ps.has_fraud_transaction || ps.fraud_token_creator || ps.has_cheat_transaction) {
      peerFlags.push(topPeerAddrs[i]);
    }
  }

  for (let i = 0; i < peerTagAddrs.length; i++) {
    const pTag = peerTagResults[i];
    const pAddr = peerTagAddrs[i];
    if (!pTag) continue;
    const tagList = normalizeTagList(pTag);
    let known = false;
    let flagged = false;
    for (const tag of tagList) {
      const tn = (typeof tag === 'string' ? tag : (tag.tagName || tag.tag || tag.label || ''));
      const tl = tn.toLowerCase();
      if (/exchange|cex|dex|verified|known|legit|bridge|protocol/i.test(tl)) {
        known = true;
      }
      if (AML_RISK_TAG_RE.test(tn)) {
        flagged = true;
        peerTagAlerts.push({ tag: tn, addr: pAddr });
      }
    }
    if (flagged && !peerFlags.includes(pAddr)) peerFlags.push(pAddr);
    if (known) knownEntityCount++;
  }

  return { peerFlags, peerTagAlerts, knownEntityCount, topPeerAddrs };
}

function computeAmlActivityScore({
  dtCount, txCount, ageDays, concentration, uniquePeers,
  knownEntityCount = 0, peerFlags = [], hardFlags = [], isFlagged = false,
  inboundCount = 0, outboundCount = 0, stableInbound = 0, stableOutbound = 0,
}) {
  let score = 0;
  const scoreFactors = [];

  if (dtCount === 0 && txCount === 0 && ageDays === null) {
    score = 0;
  } else {
    if (dtCount > 0 || txCount > 0) {
      if (ageDays !== null) {
        if (ageDays < 7) { score += 10; scoreFactors.push({ label: 'Account age under 7 days', pts: 10 }); }
        else if (ageDays < 30) { score += 5; scoreFactors.push({ label: 'Account age under 30 days', pts: 5 }); }
      } else {
        score += 5;
        scoreFactors.push({ label: 'Account creation date unknown', pts: 5 });
      }
    }

    if (dtCount > 50) { score += 15; scoreFactors.push({ label: 'High direct transfer volume (50+)', pts: 15 }); }
    else if (dtCount > 20) { score += 8; scoreFactors.push({ label: 'Elevated direct transfers (20+)', pts: 8 }); }
    else if (dtCount > 10) { score += 3; scoreFactors.push({ label: 'Moderate direct transfers (10+)', pts: 3 }); }

    if (concentration > 0.7 && uniquePeers >= 3) {
      score += 25;
      scoreFactors.push({ label: `High ${GLOSSARY.concentration?.lbl?.toLowerCase() || 'concentration'} (${(concentration * 100).toFixed(0)}%)`, pts: 25 });
    } else if (concentration > 0.5 && uniquePeers >= 3) {
      score += 10;
      scoreFactors.push({ label: `Elevated concentration (${(concentration * 100).toFixed(0)}%)`, pts: 10 });
    }

    if (uniquePeers < 3 && dtCount > 10) {
      score += 15;
      scoreFactors.push({ label: 'Low counterparty diversity', pts: 15 });
    }

    if (knownEntityCount > 0) {
      const pts = knownEntityCount * 8;
      score -= pts;
      scoreFactors.push({ label: `${knownEntityCount} known entity peer${knownEntityCount > 1 ? 's' : ''}`, pts: -pts });
    }

    if (peerFlags.length > 0) {
      score += peerFlags.length * 12;
      scoreFactors.push({ label: `${peerFlags.length} flagged counterparty${peerFlags.length > 1 ? ' addresses' : ''}`, pts: peerFlags.length * 12 });
    }

    if (inboundCount >= 5 && outboundCount > 0) {
      const ratio = inboundCount / outboundCount;
      if (ratio >= 3) {
        score += 15;
        scoreFactors.push({
          label: 'Heavy inbound flow ({ratio}× more receives than sends)',
          labelVars: { ratio: ratio.toFixed(1) },
          pts: 15,
        });
      }
    } else if (inboundCount >= 10 && outboundCount === 0) {
      score += 12;
      scoreFactors.push({ label: 'Inbound-only transfer pattern in sample', pts: 12 });
    }

    if (stableInbound >= 5 && stableOutbound <= 1 && inboundCount >= 8) {
      score += 12;
      scoreFactors.push({ label: 'Stablecoin inflow without matching outflow', pts: 12 });
    }

    score = Math.max(0, score);
  }

  score += amlAddHardSignals(hardFlags, scoreFactors);
  score = Math.max(0, score);

  const finalScore = Math.min(100, Math.round(score));
  const hasHardSignals = hardFlags.length > 0;

  let status;
  let statusLabel;
  if (isFlagged) {
    status = 'flagged';
    statusLabel = 'Flagged';
  } else if (dtCount === 0 && txCount === 0) {
    status = 'insufficient';
    statusLabel = 'Insufficient data';
  } else if (finalScore >= 40) {
    status = 'unusual';
    statusLabel = 'Unusual activity';
  } else {
    status = 'clean';
    statusLabel = 'No flags found';
  }

  let assessmentText;
  if (isFlagged) {
    assessmentText = `${ttLabel('flagged')} - ${t(hardFlags[0] || 'Security flags detected')}`;
  } else if (status === 'unusual') {
    assessmentText = t('Unusual activity — review counterparties and transaction history below.');
  } else if (status === 'insufficient') {
    assessmentText = t('Insufficient transaction data to evaluate activity risk.');
  } else {
    assessmentText = t('No flags found — address appears to be a regular wallet.');
  }

  return { finalScore, scoreFactors, status, statusLabel, hasHardSignals, assessmentText };
}

function assembleAmlReport({
  addr, hardFlags, isFlagged, analysis, score, peerFlags, topPeerAddrs,
  knownEntityCount, parsedTokens, tronTags, activityWindow, balanceTrx,
  accCreated, ageDays, secAcc, tokens, scanProfile, peersPending = false,
  secTokenLevel = 'unavailable', peerTagAlerts = [],
  firstFunder = null, inboundCount = 0, outboundCount = 0, flowRatio = null,
}) {
  const secAccRedTag = secAcc && /suspicious/i.test(String(secAcc.red_tag || secAcc.redTag || '').trim());
  const secAccDanger = secAcc && (secAccRedTag || secAcc.is_black_list || secAcc.has_fraud_transaction || secAcc.fraud_token_creator || secAcc.has_cheat_transaction);
  const secAccWarn = secAcc && secAcc.send_ad_by_memo;
  const incompleteHistory = !!(isFlagged && analysis.txCount === 0 && (tokens.length > 0 || scanProfile.totalTransactionCount || scanProfile.transactions));

  return {
    addr,
    scannedAt: new Date().toISOString(),
    finalScore: score.finalScore,
    status: score.status,
    statusLabel: score.statusLabel,
    isFlagged,
    hasHardSignals: score.hasHardSignals,
    hardFlags: [...hardFlags],
    peerFlags: [...peerFlags],
    peerTagAlerts: [...peerTagAlerts],
    peerSecurityScreened: [...topPeerAddrs],
    peerSecurityLimit: AML_PEER_SECURITY_LIMIT,
    peersPending: !!peersPending,
    scoreFactors: score.scoreFactors.map(f => ({ label: f.label, labelVars: f.labelVars, pts: f.pts, tier: f.tier })),
    txCount: analysis.txCount,
    dtCount: analysis.dtCount,
    concentration: analysis.concentration,
    uniquePeers: analysis.uniquePeers,
    ageDays,
    knownEntityCount,
    balanceTrx,
    accCreated,
    activityWindow,
    tronTags,
    parsedTokens,
    topPeers: analysis.topPeers.slice(0, 10),
    topContracts: analysis.topContracts.slice(0, 5),
    assessmentText: score.assessmentText,
    secAccLevel: !secAcc ? 'unavailable' : secAccDanger ? 'flagged' : secAccWarn ? 'warnings' : 'clean',
    secTokenLevel,
    firstFunder,
    inboundCount,
    outboundCount,
    flowRatio,
    incompleteHistory,
  };
}

async function amlScan(opts = {}) {
  if (amlScanBusy) return;
  const force = opts.force === true;
  const addr = amlInput.value.trim();
  setError(amlErr, '');
  if (!addr) { flashInput(amlInput); showToast(t('Enter a TRON address')); return; }
  if (!isValidTron(addr)) { flashInput(amlInput); showToast(t('Invalid TRON address — must start with T, 34 chars.')); return; }

  amlLastAddr = addr;

  if (!force) {
    const cached = readAmlSessionCache(addr);
    if (cached) {
      restoreAmlFromCache(cached);
      return;
    }
  } else {
    clearAmlSessionCache(addr);
  }

  try {
    if (await probeTronContract(addr)) {
      amlFromCache = false;
      hideScanEmpty(amlEmpty);
      amlRes.innerHTML = await renderAmlContractRedirect(addr);
      bindAmlContractRedirect(addr);
      return;
    }
  } catch (_) {}

  requireCaptcha(async () => {
    const gen = ++amlScanGen;
    amlFromCache = false;
    setAmlScanLocked(true);
    hideScanEmpty(amlEmpty);
    amlRes.innerHTML = SK.aml();

    try {
    const [accRes, tokenRes, secAcc, tagAcc, scanAcc, txs] = await Promise.all([
      gridGet(`/v1/accounts/${addr}`).catch(() => null),
      scanGet('/account/tokens', {address: addr, start: 0, limit: 200}).catch(()=>null),
      scanGet('/security/account/data', {address: addr}).catch(() => null),
      scanGet('/account/tag', {address: addr}).catch(() => null),
      scanGet('/account', { address: addr }).catch(() => null),
      fetchAmlTxHistory(addr),
    ]);
    if (gen !== amlScanGen) return;

    const scanProfile = scanAcc?.data?.[0] || scanAcc || {};
    const acc = accRes?.data?.length
      ? normalizeAccountRecord(accRes.data[0])
      : buildInactiveAccount(scanProfile);
    const tokens = (tokenRes?.data || []).filter(tok => tok.tokenType === 'trc20' && parseFloat(tok.balance || 0) > 0);
    const ageDays = acc.create_time ? Math.round((Date.now() - acc.create_time) / 86400000) : null;
    const balanceTrx = acc.balance != null ? (acc.balance / 1_000_000) : null;
    const accCreated = acc.create_time
      ? new Date(acc.create_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : null;

    let hardFlags = buildAmlHardFlags(secAcc, tagAcc);
    let isFlagged = hardFlags.length > 0;
    const analysis = await analyzeAmlTransactions(addr, txs);
    const parsedTokens = parseAmlExposureTokens(tokens);
    const tronTags = amlExtractTags(tagAcc);
    const lastTxTs = txs[0]?.block_timestamp || null;
    const oldestTxTs = txs.length > 1 ? txs[txs.length - 1]?.block_timestamp : lastTxTs;
    const activityWindow = txs.length >= 2 && lastTxTs && oldestTxTs
      ? `${ago(oldestTxTs)} → ${ago(lastTxTs)}`
      : lastTxTs ? ago(lastTxTs) : null;

    const topPeerAddrsPreview = analysis.topPeers.slice(0, AML_PEER_SECURITY_LIMIT).map(p => p[0]).filter(isValidTron);
    const needsPeerIntel = topPeerAddrsPreview.length > 0 || analysis.topPeers.length > 0;
    const needsTokenIntel = parsedTokens.length > 0;

    const phase1Score = computeAmlActivityScore({
      dtCount: analysis.dtCount,
      txCount: analysis.txCount,
      ageDays,
      concentration: analysis.concentration,
      uniquePeers: analysis.uniquePeers,
      knownEntityCount: 0,
      peerFlags: [],
      hardFlags,
      isFlagged,
      inboundCount: analysis.inboundCount,
      outboundCount: analysis.outboundCount,
      stableInbound: analysis.stableInbound,
      stableOutbound: analysis.stableOutbound,
    });

    const phase1Report = assembleAmlReport({
      addr,
      hardFlags,
      isFlagged,
      analysis,
      score: phase1Score,
      peerFlags: [],
      topPeerAddrs: topPeerAddrsPreview,
      knownEntityCount: 0,
      parsedTokens,
      tronTags,
      activityWindow,
      balanceTrx,
      accCreated,
      ageDays,
      secAcc,
      tokens,
      scanProfile,
      peersPending: needsPeerIntel || needsTokenIntel,
      firstFunder: analysis.firstFunder,
      inboundCount: analysis.inboundCount,
      outboundCount: analysis.outboundCount,
      flowRatio: analysis.flowRatio,
    });

    const phase1Graph = analysis.topPeers.length > 0
      ? {
          addr,
          topPeers: analysis.topPeers,
          peerFlags: [],
          directTransfers: analysis.directTransfers,
          txCount: analysis.txCount,
        }
      : null;

    if (gen !== amlScanGen) return;
    renderAmlScanFromReport(phase1Report, phase1Graph, false, { peersPending: needsPeerIntel || needsTokenIntel });
    setAmlScanLocked(false);

    let peerFlags = [];
    let peerTagAlerts = [];
    let knownEntityCount = 0;
    let topPeerAddrs = topPeerAddrsPreview;
    let parsedTokensFinal = parsedTokens;
    let secTokenLevel = 'unavailable';
    let hardFlagsFinal = [...hardFlags];

    const [peerIntel, tokenIntel] = await Promise.all([
      needsPeerIntel ? fetchAmlPeerIntel(analysis.topPeers, tagAcc) : Promise.resolve(null),
      needsTokenIntel ? fetchAmlTokenSecurity(parsedTokens) : Promise.resolve(null),
    ]);
    if (gen !== amlScanGen) return;

    if (peerIntel) {
      peerFlags = peerIntel.peerFlags;
      peerTagAlerts = peerIntel.peerTagAlerts;
      knownEntityCount = peerIntel.knownEntityCount;
      topPeerAddrs = peerIntel.topPeerAddrs;
    }
    if (tokenIntel) {
      parsedTokensFinal = tokenIntel.tokens;
      secTokenLevel = tokenIntel.level;
      if (tokenIntel.flags.length) {
        hardFlagsFinal = [...hardFlagsFinal, ...tokenIntel.flags];
        isFlagged = hardFlagsFinal.length > 0;
      }
    }

    const finalScoreResult = computeAmlActivityScore({
      dtCount: analysis.dtCount,
      txCount: analysis.txCount,
      ageDays,
      concentration: analysis.concentration,
      uniquePeers: analysis.uniquePeers,
      knownEntityCount,
      peerFlags,
      hardFlags: hardFlagsFinal,
      isFlagged,
      inboundCount: analysis.inboundCount,
      outboundCount: analysis.outboundCount,
      stableInbound: analysis.stableInbound,
      stableOutbound: analysis.stableOutbound,
    });

    const report = assembleAmlReport({
      addr,
      hardFlags: hardFlagsFinal,
      isFlagged,
      analysis,
      score: finalScoreResult,
      peerFlags,
      topPeerAddrs,
      knownEntityCount,
      parsedTokens: parsedTokensFinal,
      tronTags,
      activityWindow,
      balanceTrx,
      accCreated,
      ageDays,
      secAcc,
      tokens,
      scanProfile,
      peersPending: false,
      secTokenLevel,
      peerTagAlerts,
      firstFunder: analysis.firstFunder,
      inboundCount: analysis.inboundCount,
      outboundCount: analysis.outboundCount,
      flowRatio: analysis.flowRatio,
    });

    const graphPayload = analysis.topPeers.length > 0
      ? {
          addr,
          topPeers: analysis.topPeers,
          peerFlags: [...peerFlags],
          directTransfers: analysis.directTransfers,
          txCount: analysis.txCount,
        }
      : null;

    if (gen !== amlScanGen) return;

    if (needsPeerIntel || needsTokenIntel) {
      patchAmlProgressiveFinish(report, graphPayload, gen);
    } else {
      window._amlLastReport = report;
      renderAmlScanFromReport(report, graphPayload, false);
    }

    writeAmlSessionCache({ addr, report: window._amlLastReport, graphPayload });


  } catch (e) {
    amlRes.innerHTML = '';
    setError(amlErr, userFriendlyFetchError(e));
  } finally {
    if (gen === amlScanGen) setAmlScanLocked(false);
  }
  }, () => {
    setAmlScanLocked(false);
    if (!amlRes.innerHTML.trim() && !amlErr?.innerHTML?.trim()) {
      showScanEmpty(amlEmpty);
    }
  });
}

window.tronsecAmlPdf = {
  AmlPdfWriter,
  AML_PDF,
  amlPdfStatusColor,
};

function resetAmlScanCache() {
  const addr = amlInput?.value?.trim() || amlLastAddr;
  if (addr) clearAmlSessionCache(addr);
  amlLastAddr = '';
  amlFromCache = false;
  amlScanBusy = false;
  amlScanGen++;
  window._amlLastReport = null;
  if (amlRes) {
    delete amlRes.dataset.amlBindAddr;
    delete amlRes.dataset.amlActionsBound;
  }
  setAmlScanLocked(false);
  if (typeof clearApiCaches === 'function') clearApiCaches();
  else if (typeof clearScanApiCache === 'function') clearScanApiCache();
}

