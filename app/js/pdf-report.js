/* TRONSEC branded PDF — canvas typography + SVG logo-mark raster */
const TRONSEC_PDF = {
  bg: [0, 0, 0],
  panel: [17, 17, 19],
  panelRaised: [24, 24, 27],
  text: [245, 245, 247],
  text2: [161, 161, 170],
  text3: [113, 113, 122],
  text4: [82, 82, 91],
  line: [38, 38, 42],
  lineSoft: [28, 28, 31],
  red: [251, 113, 133],
  green: [52, 211, 153],
  amber: [251, 191, 36],
  info: [200, 206, 216],
};

const AML_PDF = TRONSEC_PDF;

let _pdfBrandReady = null;
let _pdfLogoCanvas = null;

function pdfBrandAssetUrl(file) {
  const link = document.querySelector('.app-brand img, .init-loader-icon');
  if (link?.src) {
    try {
      return new URL(file, link.src).href;
    } catch (_) {}
  }
  return `../assets/brand/${file}`;
}

function ensurePdfBrandAssets() {
  if (_pdfBrandReady) return _pdfBrandReady;
  _pdfBrandReady = new Promise((resolve) => {
    const finish = (canvas) => {
      _pdfLogoCanvas = canvas;
      resolve();
    };
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      finish(canvas);
    };
    img.onerror = () => {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f5f5f7';
      ctx.beginPath();
      const s = size / 64;
      ctx.moveTo(32 * s, 8 * s);
      ctx.lineTo(12 * s, 18 * s);
      ctx.lineTo(12 * s, 30 * s);
      ctx.bezierCurveTo(12 * s, 40.8 * s, 20.2 * s, 50.8 * s, 32 * s, 54 * s);
      ctx.bezierCurveTo(43.8 * s, 50.8 * s, 52 * s, 40.8 * s, 52 * s, 30 * s);
      ctx.lineTo(52 * s, 18 * s);
      ctx.closePath();
      ctx.fill();
      finish(canvas);
    };
    img.src = `${pdfBrandAssetUrl('logo-mark.svg')}?v=1`;
    setTimeout(() => {
      if (!_pdfLogoCanvas) img.onerror();
    }, 1200);
  });
  return _pdfBrandReady;
}

class TronsecPdfWriter {
  constructor(reportId) {
    this.W = 595.28;
    this.H = 842;
    this.margin = 45;
    this.footerH = 48;
    this.reportId = reportId || '';
    this.pages = [[]];
    this.pageIdx = 0;
    this.cursorY = this.H - this.margin;
    this.images = [];
    this._rasterCanvas = null;
    this._rasterCtx = null;
    this.paintPageBg();
  }

  rgb(c) {
    return `${(c[0] / 255).toFixed(3)} ${(c[1] / 255).toFixed(3)} ${(c[2] / 255).toFixed(3)}`;
  }

  rgbCss(c) {
    return `rgb(${c[0]},${c[1]},${c[2]})`;
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
    this.cursorY = this.H - this.margin - 24;
    this.paintPageBg();
    this.drawCompactHeader();
  }

  need(h) {
    if (this.cursorY - h < this.margin + this.footerH) this.newPage();
  }

  paintPageBg() {
    this.cmd('q');
    this.cmd(`${this.rgb(TRONSEC_PDF.bg)} rg`);
    this.cmd(`0 0 ${this.W} ${this.H} re f`);
    this.cmd('Q');
  }

  _rasterCtx2d() {
    if (!this._rasterCanvas) {
      this._rasterCanvas = document.createElement('canvas');
      this._rasterCtx = this._rasterCanvas.getContext('2d', { willReadFrequently: true });
    }
    return this._rasterCtx;
  }

  _canvasToRgb(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      const a = data[i + 3] / 255;
      rgb[j] = Math.round(data[i] * a);
      rgb[j + 1] = Math.round(data[i + 1] * a);
      rgb[j + 2] = Math.round(data[i + 2] * a);
    }
    return { w, h, rgb };
  }

  _registerRgbImage(w, h, rgbBytes) {
    const id = this.images.length + 1;
    this.images.push({ id, w, h, rgbBytes });
    return id;
  }

  _placeImage(imgId, x, y, w, h) {
    this.cmd('q');
    this.cmd(`${w} 0 0 ${h} ${x} ${y} cm`);
    this.cmd(`/I${imgId} Do`);
    this.cmd('Q');
  }

  _drawCanvasAt(canvas, x, y, w, h) {
    const { w: iw, h: ih, rgb } = this._canvasToRgb(canvas);
    const imgId = this._registerRgbImage(iw, ih, rgb);
    this._placeImage(imgId, x, y, w, h);
  }

  _drawLogoOnCtx(ctx, x, y, size) {
    if (_pdfLogoCanvas) {
      ctx.drawImage(_pdfLogoCanvas, x, y, size, size);
      return;
    }
    const s = size / 64;
    ctx.fillStyle = '#f5f5f7';
    ctx.beginPath();
    ctx.moveTo(x + 32 * s, y + 8 * s);
    ctx.lineTo(x + 12 * s, y + 18 * s);
    ctx.lineTo(x + 12 * s, y + 30 * s);
    ctx.bezierCurveTo(x + 12 * s, y + 40.8 * s, x + 20.2 * s, y + 50.8 * s, x + 32 * s, y + 54 * s);
    ctx.bezierCurveTo(x + 43.8 * s, y + 50.8 * s, x + 52 * s, y + 40.8 * s, x + 52 * s, y + 30 * s);
    ctx.lineTo(x + 52 * s, y + 18 * s);
    ctx.closePath();
    ctx.fill();
  }

  _fontCss(size, font, bold) {
    if (font === 'mono') {
      const w = bold ? 700 : 500;
      return `${w} ${size}px 'JetBrains Mono', ui-monospace, monospace`;
    }
    const w = bold ? 600 : 400;
    return `${w} ${size}px 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
  }

  _needsRaster(str) {
    return /[^\u0000-\u007F]/.test(String(str));
  }

  _vectorWidth(str, size, font) {
    const ratio = font === 'mono' ? 0.6 : 0.5;
    return String(str).length * size * ratio;
  }

  _drawTextVector(x, y, str, size, font, color, bold) {
    const key = font === 'mono' ? 'F2' : (bold ? 'F1b' : 'F1');
    this.cmd('BT');
    this.cmd(`${this.rgb(color)} rg`);
    this.cmd(`/${key} ${size} Tf`);
    this.cmd(`1 0 0 1 ${x} ${y} Tm`);
    this.cmd(`(${this.esc(str)}) Tj`);
    this.cmd('ET');
  }

  _drawTextRaster(x, y, str, size, font, color, bold) {
    const text = String(str);
    const scale = 4;
    const ctx = this._rasterCtx2d();
    const fontCss = this._fontCss(size, font, bold);
    ctx.font = fontCss;
    const logicalW = Math.max(1, Math.ceil(ctx.measureText(text).width) + 4);
    const logicalH = Math.max(1, Math.ceil(size * 1.28));
    this._rasterCanvas.width = logicalW * scale;
    this._rasterCanvas.height = logicalH * scale;
    ctx.scale(scale, scale);
    ctx.font = fontCss;
    ctx.clearRect(0, 0, logicalW, logicalH);
    ctx.fillStyle = this.rgbCss(color);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, 2, size);
    const { w: iw, h: ih, rgb } = this._canvasToRgb(this._rasterCanvas);
    const imgId = this._registerRgbImage(iw, ih, rgb);
    this._placeImage(imgId, x, y - size, logicalW, logicalH);
  }

  text(x, y, str, size, font, color, bold) {
    const plain = amlPdfPlain(str);
    if (!plain) return;
    if (this._needsRaster(plain)) {
      this._drawTextRaster(x, y, plain, size, font, color, bold);
      return;
    }
    this._drawTextVector(x, y, plain, size, font, color, bold);
  }

  textWidth(str, size, font, bold) {
    const plain = amlPdfPlain(str);
    if (!plain) return 0;
    if (this._needsRaster(plain)) {
      const ctx = this._rasterCtx2d();
      ctx.font = this._fontCss(size, font, bold);
      return ctx.measureText(plain).width;
    }
    return this._vectorWidth(plain, size, font);
  }

  textRight(rightX, y, str, size, font, color, bold) {
    this.text(rightX - this.textWidth(str, size, font, bold), y, str, size, font, color, bold);
  }

  wrapText(str, maxWidth, size, font, bold) {
    const words = String(amlPdfPlain(str)).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (this.textWidth(test, size, font, bold) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  drawReportHeader(opts) {
    const m = this.margin;
    const stripW = this.W - m * 2;
    const stripH = 92;
    const scale = 4;
    const title = amlPdfPlain(opts?.title || 'REPORT');
    const stamp = amlPdfPlain(opts?.stamp || '');
    const reportId = amlPdfPlain(opts?.reportId || this.reportId || '');
    const moduleLabel = amlPdfPlain(opts?.moduleLabel || '');
    const tagline = (typeof t === 'function') ? t('TRX SECURITY SCANNER') : 'TRX SECURITY SCANNER';

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(stripW * scale);
    canvas.height = Math.round(stripH * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    ctx.fillStyle = '#111113';
    ctx.fillRect(0, 0, stripW, stripH);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, stripW - 1, stripH - 1);

    const beam = ctx.createLinearGradient(0, 0, stripW * 0.45, 0);
    beam.addColorStop(0, 'rgba(255,255,255,0.42)');
    beam.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, stripW, 2);

    this._drawLogoOnCtx(ctx, 16, 16, 28);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = "700 13px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillStyle = '#f5f5f7';
    ctx.fillText('TRONSEC', 54, 34);

    ctx.font = "500 7px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillStyle = '#52525b';
    ctx.fillText(tagline.toUpperCase(), 54, 46);

    ctx.font = "600 9px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillStyle = '#a1a1aa';
    ctx.fillText(title.toUpperCase(), 16, 66);
    if (moduleLabel) {
      ctx.font = "500 7px 'JetBrains Mono', ui-monospace, monospace";
      ctx.fillStyle = '#52525b';
      ctx.fillText(moduleLabel.toUpperCase(), 16, 78);
    }

    ctx.textAlign = 'right';
    ctx.font = "400 7px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillStyle = '#52525b';
    if (stamp) ctx.fillText(stamp, stripW - 16, 34);
    if (reportId) ctx.fillText(reportId, stripW - 16, 46);

    const stripY = this.H - m - stripH;
    this._drawCanvasAt(canvas, m, stripY, stripW, stripH);
    this.cursorY = stripY - 18;
  }

  drawCompactHeader() {
    const m = this.margin;
    const stripW = this.W - m * 2;
    const stripH = 28;
    const scale = 4;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(stripW * scale);
    canvas.height = Math.round(stripH * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, stripW, stripH);
    this._drawLogoOnCtx(ctx, 0, 4, 16);
    ctx.font = "700 8px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillStyle = '#71717a';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('TRONSEC', 22, 16);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(0, stripH - 1);
    ctx.lineTo(stripW, stripH - 1);
    ctx.stroke();
    const y = this.H - m - stripH;
    this._drawCanvasAt(canvas, m, y, stripW, stripH);
    this.cursorY = y - 14;
  }

  drawScoreCard(opts) {
    const m = this.margin;
    const cardH = 82;
    const scoreColor = opts?.scoreColor || TRONSEC_PDF.text;
    const score = opts?.score != null ? String(opts.score) : '-';
    const statusLabel = amlPdfPlain(opts?.statusLabel || '');
    const subtitle = amlPdfPlain(opts?.subtitle || '');
    const meta = amlPdfPlain(opts?.meta || '');
    const addr = amlPdfPlain(opts?.address || '');
    const addrLabel = amlPdfPlain(opts?.addressLabel || 'SUBJECT ADDRESS');

    this.need(cardH + 24);
    const y = this.cursorY - cardH;

    this.fillRect(m, y, 4, cardH, scoreColor);
    this.panel(m + 4, y, this.W - m * 2 - 4, cardH, TRONSEC_PDF.panel, TRONSEC_PDF.line);

    const scoreBaseline = y + 56;
    this.text(m + 16, scoreBaseline, score, 28, 'mono', scoreColor, true);
    const scoreW = this.textWidth(score, 28, 'mono', true);
    this.text(m + 20 + scoreW, scoreBaseline, '/100', 11, 'mono', TRONSEC_PDF.text3);

    if (statusLabel) this.text(m + 16, y + 38, statusLabel, 10, 'sans', scoreColor, true);
    if (subtitle) this.text(m + 16, y + 24, subtitle, 8, 'sans', TRONSEC_PDF.text4);
    if (meta) this.text(m + 16, y + 12, meta, 7, 'mono', TRONSEC_PDF.text4);

    const addrX = m + 210;
    const addrMaxW = this.W - m - addrX;
    this.text(addrX, y + 70, addrLabel.toUpperCase(), 7, 'mono', TRONSEC_PDF.text4, true);
    if (addr) {
      const addrLines = this.wrapText(addr, addrMaxW, 8, 'mono');
      addrLines.slice(0, 2).forEach((line, i) => {
        this.text(addrX, y + 56 - i * 11, line, 8, 'mono', TRONSEC_PDF.text2);
      });
    }

    this.cursorY = y - 18;
    return y;
  }

  footerCommands(pageNum, pageTotal) {
    const m = this.margin;
    const fy = this.margin + 2;
    const stripW = this.W - m * 2;
    const stripH = 34;
    const scale = 4;
    const domain = (typeof TRONSEC_BRAND !== 'undefined' && TRONSEC_BRAND.domain) ? TRONSEC_BRAND.domain : 'tronsec.io';
    const pageLabel = pageTotal > 1 ? `${pageNum} / ${pageTotal}` : String(pageNum);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(stripW * scale);
    canvas.height = Math.round(stripH * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(0, stripH - 12);
    ctx.lineTo(stripW, stripH - 12);
    ctx.stroke();

    this._drawLogoOnCtx(ctx, 0, 2, 14);
    ctx.font = "700 8px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillStyle = '#f5f5f7';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('TRONSEC', 20, 13);
    ctx.font = "400 6.5px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillStyle = '#52525b';
    ctx.fillText(domain, 20, 22);

    ctx.textAlign = 'right';
    ctx.font = "400 7px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillStyle = '#52525b';
    ctx.fillText(pageLabel, stripW, 14);
    if (this.reportId) ctx.fillText(this.reportId, stripW, 24);

    const { w: iw, h: ih, rgb } = this._canvasToRgb(canvas);
    const imgId = this._registerRgbImage(iw, ih, rgb);
    const cmds = [];
    const push = (line) => cmds.push(line);
    push('q');
    push(`${stripW} 0 0 ${stripH} ${m} ${fy} cm`);
    push(`/I${imgId} Do`);
    push('Q');
    return cmds;
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

  section(title) {
    this.need(26);
    const titleY = this.cursorY;
    this.text(this.margin, titleY, amlPdfPlain(title).toUpperCase(), 8, 'mono', TRONSEC_PDF.text4, true);
    this.cursorY = titleY - 12;
    this.strokeLine(this.cursorY, TRONSEC_PDF.lineSoft);
    this.cursorY -= 10;
  }

  bullet(str, color) {
    const lines = this.wrapText(str, this.W - this.margin * 2 - 16, 9, 'sans');
    this.need(lines.length * 12 + 4);
    lines.forEach((line, i) => {
      if (i === 0) this.text(this.margin, this.cursorY, '-', 9, 'mono', TRONSEC_PDF.text4);
      this.text(this.margin + 10, this.cursorY, line, 9, 'sans', color || TRONSEC_PDF.text2);
      this.cursorY -= 12;
    });
    this.cursorY -= 2;
  }

  row(label, value, valueColor) {
    this.need(14);
    const y = this.cursorY;
    this.text(this.margin, y, label, 9, 'sans', TRONSEC_PDF.text3);
    this.textRight(this.W - this.margin, y, String(value), 9, 'mono', valueColor || TRONSEC_PDF.text);
    this.cursorY = y - 14;
  }

  disclaimerBox(text) {
    const lines = this.wrapText(text, this.W - this.margin * 2 - 20, 7.5, 'sans');
    const boxH = lines.length * 11 + 20;
    this.need(boxH + 14);
    const boxY = this.cursorY - boxH;
    this.panel(this.margin, boxY, this.W - this.margin * 2, boxH, TRONSEC_PDF.panel, TRONSEC_PDF.line);
    this.text(this.margin + 10, this.cursorY - 12, 'DISCLAIMER', 7, 'mono', TRONSEC_PDF.text4, true);
    let ly = this.cursorY - 24;
    lines.forEach((line) => {
      this.text(this.margin + 10, ly, line, 7.5, 'sans', TRONSEC_PDF.text3);
      ly -= 11;
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
    const pageTotal = this.pages.length;
    const pagesWithFooters = this.pages.map((page, i) => [...page, ...this.footerCommands(i + 1, pageTotal)]);

    const objs = [''];
    const add = (body) => { objs.push(body); return objs.length - 1; };

    const fontSans = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const fontSansBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const fontMono = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

    const imageIds = this.images.map((img) => {
      let hex = '';
      for (let i = 0; i < img.rgbBytes.length; i++) {
        hex += img.rgbBytes[i].toString(16).padStart(2, '0');
      }
      hex += '>';
      return add(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${hex.length} /Filter /ASCIIHexDecode >>\nstream\n${hex}\nendstream`);
    });

    const xObjectMap = imageIds.map((id, i) => `/I${this.images[i].id} ${id} 0 R`).join(' ');
    const xObjectBlock = imageIds.length ? ` /XObject << ${xObjectMap} >>` : '';

    const contentIds = pagesWithFooters.map((page) => {
      const stream = page.join('\n');
      return add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    const pageIds = contentIds.map(() => add('PLACEHOLDER'));
    const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);

    pageIds.forEach((pageId, i) => {
      objs[pageId] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontSans} 0 R /F1b ${fontSansBold} 0 R /F2 ${fontMono} 0 R >>${xObjectBlock} >> >>`;
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

const AmlPdfWriter = TronsecPdfWriter;

function amlPdfStatusColor(status, isFlagged) {
  if (isFlagged || status === 'flagged') return TRONSEC_PDF.red;
  if (status === 'unusual') return TRONSEC_PDF.amber;
  if (status === 'insufficient') return TRONSEC_PDF.text3;
  return TRONSEC_PDF.green;
}

window.tronsecAmlPdf = {
  AmlPdfWriter,
  TronsecPdfWriter,
  TRONSEC_PDF,
  AML_PDF,
  amlPdfStatusColor,
  ensurePdfBrandAssets,
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => { ensurePdfBrandAssets(); }, { once: true });
}
