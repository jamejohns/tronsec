const amlInput = document.getElementById('aml-input');
const amlBtn   = document.getElementById('aml-scan-btn');
const amlErr   = document.getElementById('aml-err');
const amlRes   = document.getElementById('aml-result');
const amlEmpty = document.getElementById('aml-empty');

const AML_DISCLAIMER = 'This report is a risk analysis based on the latest 400 on-chain transactions and public security tags. It is not a legal or compliance determination.';

if (amlInput) amlInput.addEventListener('keydown', e => { if (e.key==='Enter') amlScan(); });
if (amlBtn) amlBtn.addEventListener('click', amlScan);

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

function amlActionBtn({ id, label, icon, href, variant }) {
  const cls = `wallet-action-btn${variant ? ` wallet-action-btn--${variant}` : ''}`;
  const inner = `${icSVG(icon, 14)}<span>${esc(t(label))}</span>`;
  if (href) return `<a class="${cls}" id="${id}" href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`;
  return `<button type="button" class="${cls}" id="${id}">${inner}</button>`;
}

function amlExtractTags(tagAcc) {
  if (!tagAcc) return [];
  const raw = Array.isArray(tagAcc) ? tagAcc : (tagAcc.data || (tagAcc.tag ? [tagAcc] : []));
  return raw.map(t => t.tagName || t.tag || t.label || '').filter(Boolean);
}

function amlAlertInline(type, html) {
  return `<div class="aml-alert aml-alert--${type} aml-alert--inline">
    ${icSVG(IC.alert, 14)}
    <div class="aml-alert-body">${html}</div>
  </div>`;
}

function amlAlertList(type, title, items) {
  return `<div class="aml-alert aml-alert--${type}">
    <div class="aml-alert-head">${icSVG(IC.alert, 14)}<span class="aml-alert-title">${esc(title)}</span></div>
    <ul class="aml-alert-list">${items.map(item => `<li>${item}</li>`).join('')}</ul>
  </div>`;
}

function amlHeadCard(addr, tagsHtml) {
  return `<div class="aml-head-card">
    <div class="wallet-head-top">
      <div class="wallet-head-addr">${esc(addr)}</div>
      <div class="wallet-head-actions">
        ${amlActionBtn({ id: 'aml-copy-addr-btn', label: 'Copy', icon: IC.copy })}
        ${amlActionBtn({ id: 'aml-export-pdf-btn', label: 'Export PDF', icon: IC.download })}
        ${amlActionBtn({ id: 'aml-tronscan-btn', label: 'TronScan', icon: IC.external, href: `https://tronscan.org/#/address/${addr}`, variant: 'ext' })}
      </div>
    </div>
    ${tagsHtml ? `<div class="wallet-head-tags">${tagsHtml}</div>` : ''}
  </div>`;
}

function amlStatusBadge(status, isFlagged) {
  if (isFlagged) return badge('b-red', 'Flagged');
  if (status === 'unusual') return badge('b-amber', 'Unusual activity');
  if (status === 'insufficient') return badge('b-ghost', 'Insufficient data');
  return badge('b-green', 'Clean');
}

function bindAmlActions(addr) {
  document.getElementById('aml-copy-addr-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(addr).then(() => {
      const btn = document.getElementById('aml-copy-addr-btn');
      if (!btn) return;
      btn.classList.add('is-copied');
      btn.innerHTML = `${icSVG(IC.check, 14)}<span>${t('Copied')}</span>`;
      setTimeout(() => {
        btn.classList.remove('is-copied');
        btn.innerHTML = `${icSVG(IC.copy, 14)}<span>${t('Copy')}</span>`;
      }, 2000);
    });
  });
  document.getElementById('aml-export-pdf-btn')?.addEventListener('click', () => {
    if (!window._amlLastReport) { showToast('Run a scan first'); return; }
    amlExportPdf(window._amlLastReport);
  });
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
    pdf.text(m + 18, cardY + 36, report.statusLabel, 11, 'sans', scoreColor, true);
    pdf.text(m + 18, cardY + 22, report.hasHardSignals ? 'Composite risk signal' : 'Activity risk signal', 8, 'sans', AML_PDF.text4);
    pdf.text(m + 18, cardY + 10, 'Sample: latest 400 transactions', 7, 'mono', AML_PDF.text4);

    pdf.text(m + 200, cardY + 62, 'SUBJECT ADDRESS', 7, 'mono', AML_PDF.text4, true);
    const addrLines = pdf.wrapText(report.addr, pdf.W - m * 2 - 212, 8.5, 'mono');
    addrLines.slice(0, 2).forEach((line, i) => {
      pdf.text(m + 200, cardY + 48 - i * 12, line, 8.5, 'mono', AML_PDF.text2);
    });

    pdf.cursorY = cardY - 22;

    if (report.assessmentText) {
      pdf.section('Assessment');
      pdf.bullet(report.assessmentText, scoreColor);
    }
    if (report.hardFlags?.length) {
      pdf.section('Security flags');
      report.hardFlags.forEach(flag => pdf.bullet(flag, AML_PDF.red));
    }
    if (report.peerFlags?.length) {
      pdf.section('Flagged counterparties');
      report.peerFlags.slice(0, 8).forEach(p => pdf.bullet(p, AML_PDF.amber));
    }
    if (report.scoreFactors?.length) {
      pdf.section('Signal breakdown');
      report.scoreFactors.forEach(f => {
        const lines = pdf.wrapText(f.label, pdf.W - m * 2 - 70, 8.5, 'sans');
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

    pdf.section('On-chain summary');
    pdf.row('Transactions sampled', `${Math.min(report.txCount, 400)} of latest 400`);
    pdf.row('Direct transfers', String(report.dtCount));
    pdf.row('Concentration', report.dtCount > 0 ? `${(report.concentration * 100).toFixed(0)}% / ${report.uniquePeers} peers` : '-');
    pdf.row('Account age', report.ageDays !== null ? `${report.ageDays} days` : 'Unknown');
    if (report.balanceTrx !== null) pdf.row('Balance', `${report.balanceTrx.toFixed(2)} TRX`, AML_PDF.info);
    if (report.accCreated) pdf.row('Created', report.accCreated);
    if (report.activityWindow) pdf.row('Activity window', report.activityWindow);

    if (report.parsedTokens?.length) {
      pdf.section('Token exposure');
      report.parsedTokens.slice(0, 6).forEach(t => {
        const val = t.usd != null ? `$${t.usd.toFixed(2)}` : t.balance.toFixed(4);
        pdf.row(t.symbol, `${val} / bal ${t.balance.toFixed(4)}`);
      });
    }
    if (report.topPeers?.length) {
      pdf.section('Top counterparties');
      report.topPeers.slice(0, 8).forEach(([a, c]) => pdf.row(addrLabel(a), `${c} direct transfers`));
    }

    pdf.disclaimerBox(t('This report is a risk analysis based on the latest 400 on-chain transactions and public security tags. It is not a legal or compliance determination.'));

    const fname = `TRONSEC-AML-${report.addr.slice(0, 6)}${report.addr.slice(-4)}-${new Date(report.scannedAt).toISOString().slice(0, 10)}.pdf`;
    pdf.download(fname);
    showToast('PDF report downloaded');
  } catch (e) {
    showToast('PDF export failed');
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); }
  }
}

function amlShieldIcon(riskScore, size, isFlagged) {
  return riskShieldIcon(riskScore, size, { flagged: isFlagged, className: 'risk-shield-icon aml-risk-icon' });
}

function amlHardFlagPoints(label) {
  if (/blacklist|Blacklisted/i.test(label)) return 50;
  if (/fraud|scam|phish|Suspicious|malicious|hack|exploit|sanction|Security tag/i.test(label)) return 40;
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
  const scoreText = status === 'insufficient' && !hasHardSignals ? '—' : `${finalScore}<span class="aml-score-unit">/100</span>`;
  const meter = (status !== 'insufficient' || hasHardSignals)
    ? `<div class="aml-risk-meter"><div class="aml-risk-meter-fill ${cls}" style="width:${Math.max(4, finalScore)}%"></div></div>`
    : '';
  const statLabel = hasHardSignals ? 'Composite risk signal' : 'Activity risk signal';
  return `<div class="an-stat aml-risk-stat">
    <div class="an-stat-label">${statLabel}</div>
    <div class="aml-risk-body">
      ${icon}
      <div class="aml-risk-text">
        <div class="an-stat-value ${cls}">${scoreText}</div>
        <div class="an-stat-sub">${esc(statusLabel)}</div>
        ${meter}
      </div>
    </div>
  </div>`;
}

function amlPeerRow(addr, count, flagCls, flagLabel, isFlaggedPeer) {
  const initials = addr.slice(1, 4).toUpperCase() || 'ADR';
  return `<div class="aml-row${isFlaggedPeer ? ' is-risk' : ''}">
    <div class="aml-row-icon">${esc(initials)}</div>
    <div class="aml-row-body">
      <div class="aml-row-title">${amlAddrLink(addr)}</div>
      <div class="aml-row-meta">${count} direct transfers</div>
    </div>
    <div class="aml-row-action">${badge(flagCls, flagLabel)}</div>
  </div>`;
}

function amlBlock(titleHtml, bodyHtml, meta = '') {
  const metaHtml = meta ? `<span class="aml-block-meta">${t(meta)}</span>` : '';
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

function amlRowsBlock(titleHtml, rowsHtml, meta = '', emptyMsg = '') {
  const body = rowsHtml
    ? `<div class="aml-rows">${rowsHtml}</div>`
    : `<div class="aml-empty">${esc(emptyMsg)}</div>`;
  return amlBlock(titleHtml, body, meta);
}

function amlSignalsPanel(factors, finalScore, status) {
  if (!factors.length) {
    return amlBlock('Signal breakdown', '<div class="aml-empty">Not enough data to compute risk factors</div>');
  }
  const body = `<div class="aml-signals">${factors.map(f => `
      <div class="aml-signal${f.tier === 'hard' ? ' is-hard' : ''}${f.pts < 0 ? ' is-positive' : f.pts >= 15 ? ' is-high' : ''}">
        <span class="aml-signal-label">${esc(f.label)}</span>
        <span class="aml-signal-pts ${f.pts < 0 ? 'is-green' : f.pts >= 15 ? 'is-red' : 'is-amber'}">${f.pts > 0 ? '+' : ''}${f.pts}</span>
      </div>`).join('')}
    </div>`;
  return amlBlock('Signal breakdown', body, `${finalScore}/100 composite`);
}

function amlTokensPanel(parsedTokens) {
  if (!parsedTokens.length) {
    return amlBlock('Token exposure', '<div class="aml-empty">No TRC20 balances detected</div>');
  }
  const rows = parsedTokens.map(t => {
    const balFmt = t.balance >= 1e6 ? (t.balance / 1e6).toFixed(2) + 'M'
      : t.balance >= 1e3 ? (t.balance / 1e3).toFixed(2) + 'K'
      : t.balance.toFixed(Math.min(4, t.decimals));
    const usdStr = t.usd != null ? `$${t.usd.toFixed(2)}` : '';
    return `<div class="aml-row aml-row--compact">
      <div class="aml-row-icon aml-row-icon--token">${esc(t.symbol.slice(0, 3).toUpperCase())}</div>
      <div class="aml-row-body">
        <div class="aml-row-title"><span class="aml-token-name">${esc(t.symbol)}</span>${t.addr ? amlAddrLink(t.addr) : ''}</div>
        <div class="aml-row-meta">${balFmt} tokens${usdStr ? ` · ${usdStr}` : ''}</div>
      </div>
    </div>`;
  }).join('');
  return amlRowsBlock(`Token exposure <span>· ${parsedTokens.length}</span>`, rows);
}

function escapeToken(t) { return esc(t?.tokenAbbr || t?.tokenName || t?.tokenId || t?.tokenContractAddress || '-'); }


// -- Known DEX/router/staking contracts (excluded from concentration heuristics) --
const DEX_ADDRS = new Set([
  'TNJVzGqKBWkJxJB5XYSqGAwUTV15U24pPq', // SunSwap V2 Router
  'TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax', // SunSwap V2 Router (deprecated)
  'TKWJdrQkqHisa1X8HUdHEfREvTzw4pMAaY', // SunSwap V2 Factory
  'TCFNp179Lg46D16zKoumd4Poa2WFFdtqYj', // SUN.io Smart Router (aggregator)
].map(a => a.toLowerCase()));

// -- Method signature lookup --
const SIG_TRANSFER     = 'a9059cbb'; // transfer(address,uint256)
const SIG_TRANSFER_FROM = '23b872dd'; // transferFrom(address,address,uint256)

function isKnownDex(addrBase58) {
  return DEX_ADDRS.has(addrBase58.toLowerCase());
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

async function amlScan() {
  const addr = amlInput.value.trim();
  setError(amlErr, '');
  if (!addr) { flashInput(amlInput); showToast('Enter a TRON address'); return; }
  if (!isValidTron(addr)) { flashInput(amlInput); showToast('Invalid TRON address — must start with T, 34 chars.'); return; }
  requireCaptcha(async () => {
    spinBtn(amlBtn, true);
    amlRes.innerHTML = SK.aml();
    amlEmpty.style.display = 'none';

    try {
    const [accRes, tokenRes, secAcc, tagAcc, secToken, scanAcc] = await Promise.all([
      gridGet(`/v1/accounts/${addr}`).catch(() => null),
      scanGet('/account/tokens', {address: addr, start: 0, limit: 200}).catch(()=>null),
      scanGet('/security/account/data', {address: addr}).catch(() => null),
      scanGet('/account/tag', {address: addr}).catch(() => null),
      scanGet('/security/token/data', {address: addr}).catch(() => null),
      scanGet('/account', { address: addr }).catch(() => null),
    ]);

    const txs = await fetchAmlTxHistory(addr);
    const txCount = txs.length;

    const scanProfile = scanAcc?.data?.[0] || scanAcc || {};
    const acc = accRes?.data?.length ? accRes.data[0] : buildInactiveAccount(scanProfile);
    const tokens = (tokenRes?.data || []).filter(t=>t.tokenType==='trc20' && parseFloat(t.balance || 0) > 0);
    const ageDays = acc.create_time ? Math.round((Date.now() - acc.create_time)/86400000) : null;
    const balanceTrx = acc.balance != null ? (acc.balance / 1_000_000) : null;
    const accCreated = acc.create_time
      ? new Date(acc.create_time).toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'})
      : null;
    // -- Hard signals --
    const hardFlags = [];
    if (secAcc) {
      if (secAcc.is_black_list)           hardFlags.push('Blacklisted by stablecoin issuer (USDT/USDC)');
      if (secAcc.has_fraud_transaction)   hardFlags.push('Has flagged fraud transactions');
      if (secAcc.fraud_token_creator)     hardFlags.push('Created fraud tokens');
      if (secAcc.send_ad_by_memo)         hardFlags.push('Frequently sends advertising/spam');
    }
    if (secToken) {
      if (secToken.token_level === '3')              hardFlags.push('Token marked Suspicious');
      if (secToken.token_level === '1')              hardFlags.push('Token marked Unknown / Neutral');
      if (secToken.black_list_type === 1)             hardFlags.push('Token contract has a blacklist function');
      if (secToken.increase_total_supply === 1)       hardFlags.push('Token supply can be increased by owner (mintable)');
    }
    if (tagAcc) {
      const tags = Array.isArray(tagAcc) ? tagAcc : (tagAcc.data || tagAcc.tag ? [tagAcc] : []);
      for (const t of tags) {
        const tagName = t.tagName || t.tag || t.label || '';
        if (tagName && /scam|phish|fraud|blacklist|sanction|malicious|hack|exploit/i.test(tagName)) {
          hardFlags.push('Security tag: ' + tagName);
        }
      }
    }

    const isFlagged = hardFlags.length > 0;

    // -- Performance: collect unique hex addresses, resolve each once --
    const hexSet = new Set();
    const txMeta = []; // { type, peerHex, contractHex, isDex, amount, time }

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
        if (fromHex) hexSet.add(fromHex.toLowerCase());
        if (toHex) hexSet.add(toHex.toLowerCase());
        txMeta.push({ type:'direct', fromHex, toHex, contractHex:null, isDex:false, amount, time });
      } else if (tType === 'TriggerSmartContract') {
        if (contractAddrHex) hexSet.add(contractAddrHex.toLowerCase());
        if (fromHex) hexSet.add(fromHex.toLowerCase());
        const recipientHex = getTRC20Recipient(tx) || tx._scanTrc20Peer || null;
        if (recipientHex) hexSet.add(String(recipientHex).toLowerCase());
        txMeta.push({ type:'trigger', peerHex:recipientHex, contractHex:contractAddrHex, isDex:null, amount, time });
      }
    }

    // Resolve all unique hex addresses in parallel
    const hexEntries = await Promise.all([...hexSet].map(async h => [h, await hexToTronAddress(h)]));
    const hexMap = new Map(hexEntries);

    function resolve(hex) {
      if (!hex) return null;
      return hexMap.get(hex.toLowerCase()) || hex;
    }

    // -- Categorize transactions --
    const directTransfers = [];
    const contractInteractions = new Map(); // contractBase58 -> count

    for (const m of txMeta) {
      if (m.type === 'direct') {
        const from = resolve(m.fromHex);
        const to = resolve(m.toHex);
        const peer = from === addr ? to : (to === addr ? from : (to || from));
        if (peer && peer !== addr) {
          directTransfers.push({ peer, amount:m.amount, time:m.time });
        }
      } else if (m.type === 'trigger') {
        const contractAddr = resolve(m.contractHex);
        const isDex = contractAddr ? isKnownDex(contractAddr) : false;
        m.isDex = isDex;

        if (m.peerHex && !isDex) {
          const peer = resolve(m.peerHex);
          if (peer && peer !== addr) {
            directTransfers.push({ peer, amount:m.amount, time:m.time });
          }
        }

        if (contractAddr) {
          contractInteractions.set(contractAddr, (contractInteractions.get(contractAddr) || 0) + 1);
        }
      }
    }

    // -- Peer concentration (direct transfers only) --
    const peerCounts = {};
    for (const d of directTransfers) {
      peerCounts[d.peer] = (peerCounts[d.peer] || 0) + 1;
    }
    const uniquePeers = Object.keys(peerCounts).length;
    const maxToSingle = Math.max(0, ...Object.values(peerCounts));
    const dtCount = directTransfers.length;
    const concentration = dtCount > 0 ? (maxToSingle / dtCount) : 0;

    const topPeers = Object.entries(peerCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);

    // Top contracts used (from contractInteractions, sorted)
    const topContracts = [...contractInteractions.entries()]
      .sort((a,b) => b[1] - a[1])
      .slice(0, 6);

    // -- Resolve top-5 peer addresses for recursive security check --
    const peerFlags = [];
    const topPeerAddrs = topPeers.slice(0, 5).map(p => p[0]);
    if (topPeerAddrs.length > 0) {
      const peerSecResults = await Promise.all(
        topPeerAddrs.map(pAddr =>
          scanGet('/security/account/data', {address: pAddr}).catch(() => null)
        )
      );
      for (let i = 0; i < topPeerAddrs.length; i++) {
        const ps = peerSecResults[i];
        if (!ps) continue;
        if (ps.is_black_list || ps.has_fraud_transaction || ps.fraud_token_creator) {
          peerFlags.push(topPeerAddrs[i]);
        }
      }
    }

    // -- Positive signal: verified exchange / known entity among peers --
    let knownEntityCount = 0;
    if (tagAcc) {
      for (const p of topPeers) {
        const pTag = await scanGet('/account/tag', {address: p[0]}).catch(() => null);
        if (pTag) {
          const tagList = Array.isArray(pTag) ? pTag : (pTag.data || pTag.tag ? [pTag] : []);
          for (const t of tagList) {
            const tn = (t.tagName || t.tag || t.label || '').toLowerCase();
            if (/exchange|cex|dex|verified|known|legit|bridge|protocol/i.test(tn)) {
              knownEntityCount++;
              break;
            }
          }
        }
      }
    }

    const parsedTokens = tokens.map(t => {
      const decimals = parseInt(t.tokenDecimal || 6);
      const balance = parseFloat(t.balance || 0) / Math.pow(10, decimals);
      const priceInUsd = parseFloat(t.priceInUsd || t.tokenPriceInUsd || 0);
      return {
        symbol: t.tokenAbbr || t.tokenName || '—',
        decimals,
        balance,
        usd: priceInUsd > 0 ? balance * priceInUsd : null,
        addr: t.tokenId || t.tokenContractAddress || '',
      };
    }).filter(t => t.balance > 0)
      .sort((a, b) => (b.usd || b.balance) - (a.usd || a.balance))
      .slice(0, 5);

    const tronTags = amlExtractTags(tagAcc);
    const lastTxTs = txs[0]?.block_timestamp || null;
    const oldestTxTs = txs.length > 1 ? txs[txs.length - 1]?.block_timestamp : lastTxTs;
    const activityWindow = txs.length >= 2 && lastTxTs && oldestTxTs
      ? `${ago(oldestTxTs)} → ${ago(lastTxTs)}`
      : lastTxTs ? ago(lastTxTs) : null;

    // -- Activity risk signal calculation --
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

      score = Math.max(0, score);
    }

    score += amlAddHardSignals(hardFlags, scoreFactors);
    score = Math.max(0, score);

    const finalScore = Math.min(100, Math.round(score));
    const hasHardSignals = hardFlags.length > 0;

    // -- Status determination --
    let status, statusLabel;
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

    // -- Build UI --
    const headTags = [
      amlStatusBadge(status, isFlagged),
      ...tronTags.slice(0, 4).map(t => badge('b-cyan', t)),
    ].filter(Boolean).join('');
    const headHtml = amlHeadCard(addr, headTags);

    let alertsHtml = '';
    if (isFlagged && hardFlags.length) {
      alertsHtml += amlAlertList('red', 'Security flags', hardFlags.map(f => esc(f)));
    }
    if (isFlagged && txCount === 0 && (tokens.length > 0 || scanProfile.totalTransactionCount || scanProfile.transactions)) {
      alertsHtml += amlAlertInline('amber', t('Security flags detected, but recent transaction history could not be loaded — activity metrics below may be incomplete.'));
    }
    if (peerFlags.length > 0) {
      alertsHtml += amlAlertList('amber', 'Flagged counterparties', peerFlags.map(a => amlAddrLink(a)));
    }
    if (alertsHtml) alertsHtml = `<div class="aml-alerts">${alertsHtml}</div>`;

    const concCls = concentration > 0.7 ? 'is-red' : concentration > 0.5 ? 'is-amber' : 'is-info';
    const heroHtml = `
      ${amlRiskStat(status, statusLabel, finalScore, isFlagged, hasHardSignals)}
      <div class="an-stat">
        <div class="an-stat-label">Transactions</div>
        <div class="an-stat-value is-info">${txCount}</div>
        <div class="an-stat-sub">${dtCount} direct · ${txCount - dtCount} contract</div>
      </div>
      <div class="an-stat">
        <div class="an-stat-label">${tt('concentration')}</div>
        <div class="an-stat-value ${dtCount > 0 ? concCls : 'is-neutral'}">${dtCount > 0 ? (concentration * 100).toFixed(0) : '—'}${dtCount > 0 ? '<span class="aml-score-unit">%</span>' : ''}</div>
        <div class="an-stat-sub">${uniquePeers} ${tt('counterparty')}s</div>
      </div>
      <div class="an-stat">
        <div class="an-stat-label">Account age</div>
        <div class="an-stat-value is-amber">${ageDays !== null ? ageDays + '<span class="aml-score-unit">d</span>' : '—'}</div>
        <div class="an-stat-sub">${knownEntityCount > 0 ? knownEntityCount + ' known ' + tt('entity') + (knownEntityCount > 1 ? 's' : '') : 'latest 400 transactions'}</div>
      </div>`;

    let assessmentHtml;
    let assessmentText;
    if (isFlagged) {
      assessmentText = `${ttLabel('flagged')} - ${hardFlags[0] || 'Security flags detected'}`;
      assessmentHtml = amlAlertInline('red', `<strong>${tt('flagged')}</strong> — ${esc(hardFlags[0] || 'Security flags detected')}`);
    } else if (status === 'unusual') {
      assessmentText = 'Unusual activity — review counterparties and transaction history below.';
      assessmentHtml = amlAlertInline('amber', '<strong>Unusual activity</strong> — review counterparties and transaction history below.');
    } else if (status === 'insufficient') {
      assessmentText = 'Insufficient transaction data to evaluate activity risk.';
      assessmentHtml = amlAlertInline('amber', 'Insufficient transaction data to evaluate activity risk.');
    } else {
      assessmentText = 'No flags found — address appears to be a regular wallet.';
      assessmentHtml = amlAlertInline('green', '<strong>No flags found</strong> — address appears to be a regular wallet.');
    }

    const secAccDanger = secAcc && (secAcc.is_black_list || secAcc.has_fraud_transaction || secAcc.fraud_token_creator);
    const secAccWarn   = secAcc && secAcc.send_ad_by_memo;
    const secAccBadge  = !secAcc             ? badge('b-ghost','Unavailable')
                        : secAccDanger        ? `<span class="badge b-red">${tt('flagged')}</span>`
                        : secAccWarn          ? badge('b-amber','Warnings')
                                              : badge('b-green','No flags');
    const secTokenDanger = secToken && secToken.token_level === '3';
    const secTokenWarn   = secToken && (secToken.token_level === '1' || secToken.black_list_type === 1 || secToken.increase_total_supply === 1);
    const secTokenBadge  = !secToken           ? badge('b-ghost','Unavailable')
                         : secTokenDanger      ? `<span class="badge b-red">${tt('flagged')}</span>`
                         : secTokenWarn        ? badge('b-amber','Warnings')
                                               : badge('b-green','No flags');

    const sourcesHtml = amlPanel('Sources checked', `
        ${amlKvRow(tt('aml'), secAccBadge)}
        ${amlKvRow(tt('shield'), secTokenBadge, true)}
      `);

    const onchainHtml = balanceTrx !== null || txCount > 0 || accCreated || activityWindow
      ? amlPanel('On-chain data', `
          ${balanceTrx !== null ? amlKvRow('Balance', `<span class="is-info">${balanceTrx.toFixed(2)} TRX</span>`) : ''}
          ${amlKvRow('Sample analyzed', `${fmtNum(txCount)} txs`)}
          ${activityWindow ? amlKvRow('Activity window', `<span class="kv-muted">${activityWindow}</span>`) : ''}
          ${accCreated ? amlKvRow('Account created', esc(accCreated), true) : amlKvRow('Account created', '<span class="kv-muted">Unknown</span>', true)}
        `)
      : '';

    const signalsHtml = amlSignalsPanel(scoreFactors, finalScore, status);
    const tokensHtml = amlTokensPanel(parsedTokens);

    const peersHtml = amlRowsBlock(
      `Top counterparties <span>· ${topPeers.length}</span>`,
      topPeers.map(([a, c]) => {
        const flag = c > 20 ? 'b-red' : c > 5 ? 'b-amber' : 'b-green';
        const flagLabel = c > 20 ? 'suspicious' : c > 5 ? 'watch' : 'ok';
        return amlPeerRow(a, c, flag, flagLabel, peerFlags.includes(a));
      }).join(''),
      '',
      'No direct transfers found in analyzed history'
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

    window._amlLastReport = {
      addr,
      scannedAt: new Date().toISOString(),
      finalScore,
      status,
      statusLabel,
      isFlagged,
      hasHardSignals,
      hardFlags: [...hardFlags],
      peerFlags: [...peerFlags],
      scoreFactors: scoreFactors.map(f => ({ label: f.label, pts: f.pts, tier: f.tier })),
      txCount,
      dtCount,
      concentration,
      uniquePeers,
      ageDays,
      knownEntityCount,
      balanceTrx,
      accCreated,
      activityWindow,
      tronTags,
      parsedTokens,
      topPeers: topPeers.slice(0, 10),
      topContracts: topContracts.slice(0, 5),
      assessmentText,
    };

    amlRes.innerHTML = `
      <div class="aml-scan">
        ${headHtml}
        ${alertsHtml}
        <div class="an-stat-grid an-stat-grid--4 aml-hero-grid">${heroHtml}</div>
        <div class="aml-assessment">${assessmentHtml}</div>
        ${detailsGrid ? `<div class="aml-grid-2">${detailsGrid}</div>` : ''}
        <div class="aml-grid-2">${exposureGrid}</div>
        ${graphHtml}
        ${peersHtml}
        ${contractsHtml}
        <p class="aml-disclaimer">${t('This report is a risk analysis based on the latest 400 on-chain transactions and public security tags. It is not a legal or compliance determination.')}</p>
      </div>`;

    bindAmlActions(addr);

    if (topPeers.length > 0) {
      renderAMLGraph('aml-graph-container', addr, topPeers, peerFlags, directTransfers, txCount);
    }

  } catch (e) {
    amlRes.innerHTML = ''; setError(amlErr, userFriendlyFetchError(e));
  } finally {
    spinBtn(amlBtn, false);
  }
  });
}

