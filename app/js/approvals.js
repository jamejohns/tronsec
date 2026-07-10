// ==================================
//  APPROVALS PAGE
// ==================================
const approvalsInput = document.getElementById('approvals-input');
const approvalsBtn   = document.getElementById('approvals-scan-btn');
const approvalsErr   = document.getElementById('approvals-err');
const approvalsRes   = document.getElementById('approvals-result');
const approvalsEmpty = document.getElementById('approvals-empty');

let approvalsList = [];
let approvalsScanBusy = false;
let approvalsScanGen = 0;
let approvalsLastAddr = '';

const APPROVALS_CACHE_TTL = 12 * 60 * 1000;

function approvalsCacheStorageKey(addr) {
  return `tronsec_approvals_scan:${addr}`;
}

function serializeApprovalsList(list) {
  return (list || []).map(a => ({
    ...a,
    amount: a.amount != null ? String(a.amount) : '0',
  }));
}

function restoreApprovalsList(list) {
  return (list || []).map(a => {
    let amount = BigInt(0);
    try { amount = BigInt(String(a.amount || 0)); } catch (_) {}
    return { ...a, amount };
  });
}

function readApprovalsSessionCache(addr) {
  try {
    const raw = sessionStorage.getItem(approvalsCacheStorageKey(addr));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || parsed.addr !== addr || Date.now() - parsed.ts > APPROVALS_CACHE_TTL) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeApprovalsSessionCache(addr, list) {
  if (!addr) return;
  try {
    sessionStorage.setItem(approvalsCacheStorageKey(addr), JSON.stringify({
      addr,
      list: serializeApprovalsList(list),
      ts: Date.now(),
    }));
  } catch (_) {}
}

function clearApprovalsSessionCache(addr) {
  if (!addr) return;
  try { sessionStorage.removeItem(approvalsCacheStorageKey(addr)); } catch (_) {}
}

function setApprovalsScanLocked(locked) {
  approvalsScanBusy = locked;
  if (approvalsBtn) approvalsBtn.disabled = locked;
  if (approvalsInput) approvalsInput.disabled = locked;
  spinBtn(approvalsBtn, locked);
}

approvalsInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (approvalsScanBusy) return;
  approvalsScan();
});
approvalsBtn.addEventListener('click', approvalsScan);

function apprRowIcon(symbol) {
  const label = (symbol || '?').replace(/^0x/i, '').slice(0, 3).toUpperCase() || 'TKN';
  return `<div class="appr-row-icon">${esc(label)}</div>`;
}

function apprAmountBadge(amount, decimals) {
  const risk = getApprovalRisk(amount, decimals);
  const cls = risk === 'critical' || risk === 'high' ? 'b-red' : (risk === 'warn' ? 'b-amber' : 'b-green');
  return badge(cls, fmtTokenAmt(amount, decimals));
}

function apprRowRiskClass(amount, decimals) {
  const risk = getApprovalRisk(amount, decimals);
  if (risk === 'critical' || risk === 'high') return ' is-risk';
  if (risk === 'warn') return ' is-warn';
  return '';
}

function apprRevokeBtn() {
  const label = esc(GLOSSARY.revoke?.lbl || 'Revoke');
  return `<button type="button" class="wallet-action-btn wallet-action-btn--danger revoke-one-btn">${icSVG(IC.trash, 14)}<span>${label}</span></button>`;
}

async function mergeApprovalCandidates(scanItems, txItems) {
  const map = new Map();
  for (const item of [...scanItems, ...txItems]) {
    const { tokenAddr, spender } = await resolveApprovalAddresses(item);
    if (!tokenAddr || !spender || !isValidTron(tokenAddr) || !isValidTron(spender)) continue;
    const key = `${tokenAddr}_${spender}`;
    if (!map.has(key)) {
      map.set(key, { ...item, tokenAddr, spender });
    }
  }
  return Array.from(map.values());
}


async function approvalsScan(opts = {}) {
  if (approvalsScanBusy) return;
  const force = opts.force === true;
  const addr = approvalsInput.value.trim();
  setError(approvalsErr, '');
  if (!addr) { flashInput(approvalsInput); showToast(t('Enter a TRON address')); return; }
  if (!isValidTron(addr)) { flashInput(approvalsInput); showToast(t('Invalid TRON address — must start with T, 34 chars.')); return; }

  approvalsLastAddr = addr;

  if (!force) {
    const cached = readApprovalsSessionCache(addr);
    if (cached) {
      if (approvalsEmpty) approvalsEmpty.style.display = 'none';
      approvalsList = restoreApprovalsList(cached.list);
      renderApprovals();
      showToast(t('Loaded from session cache'));
      return;
    }
  } else {
    clearApprovalsSessionCache(addr);
  }

  const gen = ++approvalsScanGen;
  setApprovalsScanLocked(true);
  approvalsRes.innerHTML = SK.approvals();
  if (approvalsEmpty) approvalsEmpty.style.display = 'none';
  approvalsList = [];

  try {
    const [trc20Res, nativeRes, scanRaw] = await Promise.all([
      gridGet(`/v1/accounts/${addr}/transactions/trc20`, { limit: 200, order_by: 'block_timestamp,desc' }).catch(() => ({ data: [] })),
      gridGet(`/v1/accounts/${addr}/transactions`, { limit: 200, only_confirmed: true, order_by: 'block_timestamp,desc' }).catch(() => ({ data: [] })),
      fetchTronScanApprovalList(addr).catch(() => []),
    ]);
    if (gen !== approvalsScanGen) return;

    const scanCandidates = (scanRaw || []).map(normalizeTronScanApprovalItem).filter(i => i.tokenAddr && i.spender);
    const txCandidates = collectApprovalCandidates(trc20Res?.data || [], nativeRes?.data || []);
    const merged = await mergeApprovalCandidates(scanCandidates, txCandidates);

    approvalsList = await enrichApprovalsOnChain(addr, merged);
    if (gen !== approvalsScanGen) return;
    renderApprovals();
    writeApprovalsSessionCache(addr, approvalsList);
  } catch (e) {
    if (gen !== approvalsScanGen) return;
    approvalsRes.innerHTML = '';
    if (approvalsEmpty) approvalsEmpty.style.display = '';
    setError(approvalsErr, userFriendlyFetchError(e));
  } finally {
    if (gen === approvalsScanGen) setApprovalsScanLocked(false);
  }
}

function renderApprovals() {
  const list = approvalsList;
  if (list.length === 0) {
    approvalsRes.innerHTML = `
      <div class="appr-scan">
        <div class="appr-empty appr-empty--inline">
          <div class="appr-empty-icon">${icSVG("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4", 40)}</div>
          <p class="appr-empty-title">${t('No approvals found')}</p>
          <p class="appr-empty-hint">${t('This address has no active TRC20 allowances on record')}</p>
        </div>
      </div>`;
    return;
  }

  const active = list;
  const unlimCount = active.filter(a => getApprovalRisk(a.amount, a.decimals) === 'critical').length;
  const excessiveCount = active.filter(a => getApprovalRisk(a.amount, a.decimals) === 'high').length;
  const highRiskCount = unlimCount + excessiveCount;
  const warnCount = active.filter(a => getApprovalRisk(a.amount, a.decimals) === 'warn').length;

  let alertsHtml = '';
  if (highRiskCount > 0) {
    const parts = [];
    if (unlimCount) parts.push(`${unlimCount} ${tt('unlimited')}`);
    if (excessiveCount) parts.push(`${excessiveCount} ${t('excessive')}`);
    const detail = parts.length ? ` (${parts.join(' · ')})` : '';
    alertsHtml = alertBox('red', `<strong>${highRiskCount} ${t('high-risk allowance')}${highRiskCount > 1 ? 's' : ''}</strong>${detail} — ${t('revoke these first to reduce drainer risk.')}`);
  } else if (warnCount > 0) {
    alertsHtml = alertBox('amber', `<strong>${warnCount} ${t('elevated allowance')}${warnCount > 1 ? 's' : ''}</strong> — ${t('review large grants and revoke unused spenders.')}`);
  }

  const rowsHtml = list.map(a => {
    const tokenLink = a.tokenAddr
      ? `<a class="a-link appr-token-link" href="https://tronscan.org/#/token20/${esc(a.tokenAddr)}" target="_blank" rel="noopener"><span>${esc(a.token)}</span>${icSVG(IC.link, 9)}</a>`
      : `<span class="appr-token-name">${esc(a.token)}</span>`;
    return `<div class="appr-row${apprRowRiskClass(a.amount, a.decimals)}">
      ${apprRowIcon(a.token)}
      <div class="appr-row-body">
        <div class="appr-row-title">
          ${tokenLink}
          ${apprAmountBadge(a.amount, a.decimals)}
        </div>
        <div class="appr-row-meta">${tt('spender')}: ${walletContractScanBtn(a.spender)} · ${a.date ? ago(a.date) : '—'}</div>
        ${a.tokenAddr ? `<div class="appr-row-addr">${walletContractScanBtn(a.tokenAddr)}</div>` : ''}
      </div>
      <div class="appr-row-action">
        ${apprRevokeBtn()}
      </div>
    </div>`;
  }).join('');

  approvalsRes.innerHTML = `
    <div class="appr-scan">
      ${alertsHtml}
      <div class="an-stat-grid an-stat-grid--2 appr-hero-grid">
        <div class="an-stat">
          <div class="an-stat-label">${tt('allowance')}</div>
          <div class="an-stat-value is-info">${active.length} <span class="appr-stat-unit">/ ${list.length}</span></div>
          <div class="an-stat-sub">${t('on-chain token permissions')}</div>
        </div>
        <div class="an-stat">
          <div class="an-stat-label">${tt('risk')}</div>
          <div class="an-stat-value ${highRiskCount > 0 ? 'is-red' : (warnCount > 0 ? 'is-amber' : 'is-green')}">${highRiskCount}${warnCount > 0 && highRiskCount === 0 ? ` + ${warnCount}` : ''}</div>
          <div class="an-stat-sub">${highRiskCount > 0
            ? (unlimCount && excessiveCount
              ? `${unlimCount} ${tt('unlimited')} · ${excessiveCount} ${t('excessive')}`
              : unlimCount
                ? `${unlimCount} ${tt('unlimited')}`
                : `${excessiveCount} ${t('excessive')}`)
            : (warnCount > 0 ? t('elevated grants only') : t('no high-risk grants'))}</div>
        </div>
      </div>
      <div class="appr-section">
        <div class="appr-section-head">
          <span class="appr-section-title">${tt('allowance')} <span>· ${list.length}</span></span>
        </div>
        <div class="appr-list">${rowsHtml}</div>
      </div>
    </div>`;

  approvalsRes.querySelectorAll('.wallet-contract-scan-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      openAddressScan(btn.getAttribute('data-addr'));
    });
  });
}

function resetApprovalsScanCache() {
  approvalsScanGen++;
  const addr = approvalsInput?.value?.trim() || approvalsLastAddr;
  if (addr) clearApprovalsSessionCache(addr);
  approvalsLastAddr = '';
  approvalsList = [];
  setApprovalsScanLocked(false);
  if (typeof clearScanApiCache === 'function') clearScanApiCache();
}
