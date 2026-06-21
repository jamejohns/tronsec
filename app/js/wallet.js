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

function setWalletScanLocked(locked) {
  walletScanBusy = locked;
  if (walletBtn) walletBtn.disabled = locked;
  if (walletInput) walletInput.disabled = locked;
  spinBtn(walletBtn, locked);
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
    frozenV2: sp.frozenV2 || sp.frozen || [],
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
  return `<span class="wallet-tag${variant ? ` is-${variant}` : ''}">${esc(text)}</span>`;
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
  if (!tagAcc) return [];
  const raw = Array.isArray(tagAcc) ? tagAcc : (tagAcc.data || (tagAcc.tagName || tagAcc.tag ? [tagAcc] : []));
  return raw.map(t => t.tagName || t.tag || t.label || '').filter(Boolean);
}

function buildWalletSecurity(secAcc, tags, heuristics) {
  const flags = [...heuristics];
  if (secAcc) {
  if (secAcc.is_black_list) flags.push(t('Blacklisted by stablecoin issuer'));
  if (secAcc.has_fraud_transaction) flags.push(t('Flagged fraud transactions'));
  if (secAcc.fraud_token_creator) flags.push(t('Created fraud tokens'));
  if (secAcc.send_ad_by_memo) flags.push(t('Spam / ad memo activity'));
  if (secAcc.has_cheat_transaction) flags.push(t('Suspicious cheat transactions'));
  }
  for (const tag of tags) {
    if (/scam|phish|fraud|blacklist|sanction|malicious|hack|exploit/i.test(tag)) {
      flags.push(t('TronScan tag: {tag}', { tag }));
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
    const isIn = to === addr;
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
    const isIn = type === 'TransferContract' && to === addr;
    const isOut = type === 'TransferContract' && from === addr;
    if (isIn) { iconCls = 'is-in'; iconPath = IC.arrowDown; title = t('Received TRX'); meta = t('from {addr}', { addr: addrLabel(from || '?') }); }
    else if (isOut) { iconCls = 'is-out'; iconPath = IC.arrowUp; title = t('Sent TRX'); meta = t('to {addr}', { addr: addrLabel(to || '?') }); }
    else {
      iconCls = 'is-neutral';
      iconPath = IC.activity;
      title = type.replace('Contract', '').replace(/([A-Z])/g, ' $1').trim() || 'Contract call';
      meta = addrLabel(to || from || '?');
    }
    amountHtml = amount
      ? `<div class="wallet-activity-amt ${isIn ? 'tx-amt-in' : isOut ? 'tx-amt-out' : 'tx-amt-neutral'}">${isIn ? '+' : isOut ? '-' : ''}${toTRX(amount)} TRX</div>`
      : `<div class="wallet-activity-amt tx-amt-neutral">—</div>`;
  }

  const hashBtn = walletTxHashBtn(txHash);
  const metaHtml = hashBtn
    ? `<span>${esc(meta)}</span><span class="wallet-activity-hash">${hashBtn}</span>`
    : esc(meta);

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

function walletActionBtn({ id, label, icon, href, variant }) {
  const cls = `wallet-action-btn${variant ? ` wallet-action-btn--${variant}` : ''}`;
  const inner = `${icSVG(icon, 14)}<span>${esc(t(label))}</span>`;
  if (href) return `<a class="${cls}" id="${id}" href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`;
  return `<button type="button" class="${cls}" id="${id}">${inner}</button>`;
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

function openWalletQr(addr) {
  const overlay = document.createElement('div');
  overlay.className = 'qr-modal-overlay';
  overlay.innerHTML = `
    <div class="qr-modal" role="dialog" aria-label="${t('Address QR code')}">
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

  const close = () => {
    overlay.classList.remove('is-open');
    overlay.classList.add('is-closing');
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = '';
    }, 280);
  };

  document.getElementById('qr-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.getElementById('qr-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(addr).then(() => showToast(t('Address copied')));
  });
  const onEsc = (e) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onEsc);
    }
  };
  document.addEventListener('keydown', onEsc);
}

function kvRow(label, valueHtml, last) {
  return `<div class="kv-row${last ? ' kv-row--last' : ''}">
    <span class="kv-label">${kvLabel(label)}</span>
    <span class="kv-val">${valueHtml}</span>
  </div>`;
}

async function walletScan() {
  if (walletScanBusy) return;
  const addr = walletInput.value.trim();
  setError(walletErr, '');
  if (!addr) { flashInput(walletInput); showToast(t('Enter a TRON address')); return; }
  if (!isValidTron(addr)) { flashInput(walletInput); showToast(t('Invalid TRON address — must start with T, 34 chars.')); return; }

  const gen = ++walletScanGen;
  setWalletScanLocked(true);
  if (walletEmpty) walletEmpty.style.display = 'none';
  walletRes.innerHTML = SK.wallet();
  walletTxs = [];
  walletHasMore = false;
  walletOldestTs = 0;
  txShowCount = 10;

  try {
    const [accRes, txRes, trc20TxRes, tokenRes, scanAcc, secAcc, tagAcc] = await Promise.all([
      gridGet(`/v1/accounts/${addr}`),
      gridGet(`/v1/accounts/${addr}/transactions`, { limit: 50, order_by: 'block_timestamp,desc' }),
      gridGet(`/v1/accounts/${addr}/transactions/trc20`, { limit: 100, order_by: 'block_timestamp,desc' }).catch(() => ({ data: [] })),
      scanGet('/account/tokens', { address: addr, start: 0, limit: 50 }).catch(() => null),
      scanGet('/account', { address: addr }).catch(() => null),
      scanGet('/security/account/data', { address: addr }).catch(() => null),
      scanGet('/account/tag', { address: addr }).catch(() => null),
    ]);
    if (gen !== walletScanGen) return;

    const scanProfile = scanAcc?.data?.[0] || scanAcc || {};
    let acc;
    if (accRes.data?.length) {
      acc = accRes.data[0];
    } else {
      const hasTrc20 = tokenRes?.data?.some(t => parseFloat(t.balance || 0) > 0);
      const hasTxs = (txRes.data || []).length > 0;
      if (!hasTrc20 && !hasTxs) {
        walletRes.innerHTML = '';
        if (walletEmpty) walletEmpty.style.display = '';
        setError(walletErr, t('Address not found or no on-chain activity.'));
        return;
      }
      acc = buildInactiveAccount(scanProfile);
    }

    const nativeTxs = txRes.data || [];
    walletHasMore = nativeTxs.length === 50;
    if (nativeTxs.length) walletOldestTs = nativeTxs[nativeTxs.length - 1].block_timestamp || 0;

    let trc20List = trc20TxRes?.data || [];
    if (!trc20List.length) {
      try {
        const scanFound = await fetchTrc20FromTronScan(addr).catch(() => []);
        if (scanFound.length) trc20List = trc20List.concat(scanFound);
      } catch (_) {}
    }

    const approvalCount = countDistinctApprovals(trc20List, nativeTxs);
    const MAX_U256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
    const normTrc20 = trc20List.filter(t => {
      if (t.type === 'Approval') return false;
      const val = String(t.value || t.amount || t.token_amount || t.transfer_amount || t.transferValue || t['amount_str'] || 0);
      return val !== MAX_U256;
    }).map(t => {
      const owner = t.owner_address || t.ownerAddress || t.owner || t.from || t.from_address || t.fromAddress || t.sender || t.account || null;
      const toAddr = t.to_address || t.toAddress || t.to || t.receiver || t.to_address_hex || null;
      let amount = t.value || t.amount || t.token_amount || t.transfer_amount || t.transferValue || t['amount_str'] || 0;
      const tokenInfo = t.token_info || t.tokenInfo || t.token || t.token_data || {};
      const blockTs = Number(t.block_timestamp || t.timestamp || t.block || t.date || t.time || 0) || 0;
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
    walletData = { acc, trc20, addr, scanProfile, secAcc, tags, approvalCount };
    renderWallet();
  } catch (e) {
    if (gen !== walletScanGen) return;
    walletRes.innerHTML = '';
    if (walletEmpty) walletEmpty.style.display = '';
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
  const { acc, trc20, addr, scanProfile, secAcc, tags, approvalCount } = walletData;
  const res = acc.account_resource || {};
  const bwUsed = acc.free_net_usage ?? res.net_usage ?? scanProfile.freeNetUsed ?? 0;
  const bwTotal = acc.free_net_limit ?? res.free_net_limit ?? scanProfile.freeNetLimit ?? 1500;
  const bwPct = bwTotal > 0 ? Math.round((bwUsed / bwTotal) * 100) : 0;
  const energyUsed = acc.EnergyUsed ?? res.energy_used ?? scanProfile.energyUsed ?? 0;
  const energyLimit = acc.EnergyLimit ?? res.energy_limit ?? scanProfile.energyLimit ?? 0;
  const energyPct = energyLimit > 0 ? Math.round((energyUsed / energyLimit) * 100) : 0;
  const frozen = acc.frozenV2 || [];
  const staked = frozen.reduce((s, f) => s + (f.amount || 0), 0);
  const stakedBw = frozen.filter(f => (f.type || '').includes('BANDWIDTH') || f.type === undefined).reduce((s, f) => s + (f.amount || 0), 0);
  const stakedEnergy = frozen.filter(f => (f.type || '').includes('ENERGY')).reduce((s, f) => s + (f.amount || 0), 0);
  const trxBal = (acc.balance || 0) / 1_000_000;
  const trxUsdVal = TRX_PRICE != null ? trxBal * TRX_PRICE : null;
  const tokenUsd = t => (t.priceInUsd > 0) ? t.balance * t.priceInUsd : null;
  const trc20UsdTotal = trc20.reduce((sum, t) => sum + (tokenUsd(t) || 0), 0);
  const totalPortfolioUsd = (trxUsdVal || 0) + trc20UsdTotal;
  const txs = walletTxs;
  const votes = acc.votes || [];
  const votePower = votes.reduce((s, v) => s + (v.vote_count || 0), 0);
  const isMultisig = (acc.active_permission?.keys?.length > 1) || (acc.owner_permission?.keys?.length > 1);
  const txCount = scanProfile.totalTransactionCount ?? scanProfile.transactions ?? scanProfile.transaction_count ?? txs.length;
  const createdTs = acc.create_time || scanProfile.date_created || scanProfile.createTime;
  const lastActiveTs = acc.latest_opration_time || scanProfile.latest_operation_time || scanProfile.latestOperationTime;
  const created = createdTs ? new Date(createdTs).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const lastActive = lastActiveTs ? ago(lastActiveTs) : '—';
  const ageDays = createdTs ? Math.round((Date.now() - createdTs) / 86400000) : null;
  const addressName = scanProfile.name || scanProfile.addressTag || scanProfile.publicTag || '';

  const heuristics = [];
  if (acc._inactive) heuristics.push(t('Unactivated TRX account record'));
  if (txs.length >= 10) {
    const transfers = txs.filter(t => t.raw_data?.contract?.[0]?.type === 'TransferContract');
    if (transfers.length >= 5) {
      const uniq = new Set(transfers.map(t => t.raw_data?.contract?.[0]?.parameter?.value?.to_address)).size;
      if (uniq === 1) heuristics.push(t('Recent TRX sweep pattern detected'));
    }
  }
  if (bwUsed === 0 && (acc.balance || 0) < 1_000_000) heuristics.push(t('Dormant / low-activity account'));

  const security = buildWalletSecurity(secAcc, tags, heuristics);
  const alertsHtml = security.level === 'bad'
    ? alertBox('red', esc(t(security.flags[0] || 'Address flagged by security checks')))
    : security.level === 'warn' && heuristics.length
      ? alertBox('amber', esc(heuristics[0]))
      : '';

  const showTxs = txs.slice(0, txShowCount);
  const allTxShown = txShowCount >= txs.length && !walletHasMore;
  const sortedTokens = [...trc20].sort((a, b) => (tokenUsd(b) || 0) - (tokenUsd(a) || 0));

  const headTags = [
    acc._inactive ? walletTag(t('inactive account'), 'warn') : walletTag(t('active account'), 'live'),
    addressName ? walletTag(addressName, 'name') : '',
    isMultisig ? walletTag(t('multisig'), 'warn') : '',
    votePower > 0 ? walletTag(`${fmtNum(votePower)} votes · ${votes.length} SR${votes.length !== 1 ? 's' : ''}`) : '',
    approvalCount > 0 ? walletTag(t('{count} distinct approvals', { count: approvalCount }), 'warn') : '',
    ...tags.slice(0, 4).map(t => walletTag(t, /scam|fraud|phish|black/i.test(t) ? 'bad' : '')),
  ].filter(Boolean).join('');

  const securityRows = [
    kvRow('TronScan security', secAcc ? (security.level === 'clean' ? badge('b-green', 'Clean') : security.level === 'warn' ? badge('b-amber', 'Review') : badge('b-red', 'Flagged')) : badge('b-ghost', 'Unavailable')),
    kvRow(tt('blacklist'), secAcc?.is_black_list ? badge('b-red', 'Listed') : badge('b-green', 'Not listed')),
    kvRow('Fraud transactions', secAcc?.has_fraud_transaction ? badge('b-red', 'Detected') : badge('b-green', 'None')),
    kvRow(tt('approvals'), approvalCount > 0
      ? `<span class="mono">${approvalCount}</span> · <button type="button" class="a-link wallet-approvals-link">${t('Check approvals')}</button>`
      : `<span class="mono">0</span>`),
    kvRow(tt('heuristics'), heuristics.length ? esc(heuristics[0]) : `<span class="kv-muted">${t('No patterns')}</span>`),
    kvRow('Public tags', tags.length ? esc(tags.slice(0, 3).join(' · ')) : `<span class="kv-muted">${t('None')}</span>`, true),
  ].join('');

  const profileRows = [
    kvRow('Account created', esc(created) + (ageDays != null ? ` · ${ageDays}d` : '')),
    kvRow('Last active', esc(lastActive)),
    kvRow('Total transactions', fmtNum(txCount)),
    kvRow('TRX balance', `${trxBal.toFixed(2)} TRX${trxUsdVal != null ? ` · $${trxUsdVal.toFixed(2)}` : ''}`),
    kvRow(`${tt('staking')} TRX`, `${toTRX(staked)} TRX · ${frozen.length} lock${frozen.length !== 1 ? 's' : ''}`),
    stakedBw || stakedEnergy
      ? kvRow('Stake split', `${toTRX(stakedBw)} BW · ${toTRX(stakedEnergy)} EN`, true)
      : kvRow('Votes', votePower > 0 ? `${fmtNum(votePower)} to ${votes.length} SR${votes.length !== 1 ? 's' : ''}` : '—', true),
  ].join('');

  const tokenHtml = sortedTokens.length === 0
    ? '<div class="wallet-empty-block">' + t('No TRC20 tokens with balance') + '</div>'
    : sortedTokens.map(t => {
        const uv = tokenUsd(t);
        const balFmt = t.balance >= 1e6
          ? (t.balance / 1e6).toFixed(2) + 'M'
          : t.balance >= 1e3
            ? (t.balance / 1e3).toFixed(2) + 'K'
            : t.balance.toFixed(Math.min(t.decimals, 4));
        return `<div class="wallet-token-row">
          <div class="wallet-token-icon">${esc(t.symbol.slice(0, 3))}</div>
          <div class="wallet-token-body">
            <div class="wallet-token-name">${esc(t.symbol)}${t.name ? ` <span style="color:var(--text-4);font-weight:400">${esc(t.name)}</span>` : ''}</div>
            <div class="wallet-token-meta">${walletContractScanBtn(t.contract)}</div>
          </div>
          <div class="wallet-token-val">
            <div class="wallet-token-usd">${uv && uv > 0 ? '$' + uv.toFixed(2) : '—'}</div>
            <div class="wallet-token-bal">${esc(balFmt)} · ${t.priceInUsd > 0 ? '$' + t.priceInUsd.toFixed(4) : 'no price'}</div>
          </div>
        </div>`;
      }).join('') + (trc20UsdTotal > 0
        ? `<div class="wallet-token-footer"><span>Token holdings</span><strong>$${trc20UsdTotal.toFixed(2)}</strong></div>`
        : '');

  const activityHtml = txs.length === 0
    ? `<div class="wallet-empty-block">${t('No recent transactions')}</div>`
    : showTxs.map(tx => buildActivityItem(tx, addr)).join('');

  walletRes.innerHTML = `
    <div class="wallet-scan">
      ${alertsHtml}

      <div class="wallet-head-card">
        <div class="wallet-head-top">
          <div class="wallet-head-addr">${esc(addr)}</div>
          <div class="wallet-head-actions">
            ${walletActionBtn({ id: 'copy-addr-btn', label: 'Copy', icon: IC.copy })}
            ${walletActionBtn({ id: 'qr-addr-btn', label: 'QR code', icon: IC.qr })}
            ${walletActionBtn({ id: 'tronscan-addr-btn', label: 'TronScan', icon: IC.external, href: `https://tronscan.org/#/address/${addr}`, variant: 'ext' })}
          </div>
        </div>
        <div class="wallet-head-tags">${headTags}</div>
      </div>

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
        <div class="card">
          <div class="card-head"><span class="card-label">${t('On-chain profile')}</span></div>
          ${profileRows}
        </div>
        <div class="card">
          <div class="card-head"><span class="card-label">${t('Security & signals')}</span></div>
          ${securityRows}
        </div>
      </div>

      <div>
        <div class="wallet-section-title">${t('Token holdings')} <span>· ${trc20.length}</span></div>
        <div class="wallet-token-list">${tokenHtml}</div>
      </div>

      ${txs.length > 0 ? `
      <div>
        <div class="wallet-section-title">${t('Recent activity')} <span>· ${Math.min(txShowCount, txs.length)} / ${txs.length}${walletHasMore ? '+' : ''}</span></div>
        <div class="wallet-activity">${activityHtml}</div>
        ${!allTxShown ? walletLoadMoreBtn(loadMoreBusy) : ''}
      </div>` : ''}
    </div>`;

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

  document.getElementById('qr-addr-btn')?.addEventListener('click', () => openWalletQr(addr));

  document.querySelector('.wallet-approvals-link')?.addEventListener('click', () => {
    const inp = document.getElementById('approvals-input');
    if (inp) inp.value = addr;
    switchTab('approvals');
  });

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

function resetWalletScanCache() {
  walletScanGen++;
  walletData = null;
  walletTxs = [];
  walletHasMore = false;
  walletOldestTs = 0;
  txShowCount = 10;
  loadMoreBusy = false;
  setWalletScanLocked(false);
}
