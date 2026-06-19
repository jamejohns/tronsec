// ==================================
//  APPROVALS PAGE
// ==================================
const approvalsInput = document.getElementById('approvals-input');
const approvalsBtn   = document.getElementById('approvals-scan-btn');
const approvalsErr   = document.getElementById('approvals-err');
const approvalsRes   = document.getElementById('approvals-result');
const approvalsEmpty = document.getElementById('approvals-empty');

approvalsInput.addEventListener('keydown', e => { if (e.key === 'Enter') approvalsScan(); });
approvalsBtn.addEventListener('click', approvalsScan);

approvalsRes.addEventListener('click', e => {
  const oneBtn = e.target.closest('.revoke-one-btn');
  if (!oneBtn) return;
  revokedSet.add(Number(oneBtn.dataset.idx));
  renderApprovals();
});

let approvalsList = [];
let revokedSet = new Set();

function apprRowIcon(symbol) {
  const label = (symbol || '?').replace(/^0x/i, '').slice(0, 3).toUpperCase() || 'TKN';
  return `<div class="appr-row-icon">${esc(label)}</div>`;
}

function apprRevokeBtn(idx) {
  const label = esc(GLOSSARY.revoke?.lbl || 'Revoke');
  return `<button type="button" class="wallet-action-btn wallet-action-btn--danger revoke-one-btn" data-idx="${idx}">${icSVG(IC.trash, 14)}<span>${label}</span></button>`;
}

async function approvalsScan() {
  const addr = approvalsInput.value.trim();
  setError(approvalsErr, '');
  if (!addr) { flashInput(approvalsInput); showToast('Enter a TRON address'); return; }
  if (!isValidTron(addr)) { flashInput(approvalsInput); showToast('Invalid TRON address — must start with T, 34 chars.'); return; }
  spinBtn(approvalsBtn, true);
  approvalsRes.innerHTML = SK.approvals();
  approvalsEmpty.style.display = 'none';
  approvalsList = [];
  revokedSet = new Set();

  try {
    const data = await gridGet(`/v1/accounts/${addr}/transactions/trc20`, { limit: 200, order_by: 'block_timestamp,desc' });
    const txList = data.data || [];
    const approveMap = new Map();

    txList.forEach(tx => {
      if (tx.type === 'Approval') {
        const key = `${tx.token_info?.address}_${tx.to}`;
        if (!approveMap.has(key)) {
          approveMap.set(key, {
            token: tx.token_info?.symbol || '—',
            tokenAddr: tx.token_info?.address || '',
            spender: tx.to,
            amount: tx.value,
            decimals: tx.token_info?.decimals || 6,
            date: tx.block_timestamp,
          });
        }
      }
    });

    if (approveMap.size === 0) {
      const rawData = await gridGet(`/v1/accounts/${addr}/transactions`, { limit: 200, only_confirmed: true });
      const SIG = '095ea7b3';
      (rawData.data || []).forEach(tx => {
        const c = tx.raw_data?.contract?.[0];
        if (c?.type === 'TriggerSmartContract') {
          const dh = c.parameter?.value?.data || '';
          if (dh.startsWith(SIG)) {
            const spenderHex = dh.slice(34, 74);
            const amountHex = dh.slice(74, 138);
            const contractAddr = c.parameter?.value?.contract_address;
            const key = `${contractAddr}_${spenderHex}`;
            if (!approveMap.has(key)) {
              approveMap.set(key, {
                token: short(contractAddr || ''),
                tokenAddr: contractAddr || '',
                spender: '0x' + spenderHex,
                amount: parseInt(amountHex, 16),
                decimals: 6,
                date: tx.block_timestamp,
              });
            }
          }
        }
      });
    }

    approvalsList = Array.from(approveMap.values());
    renderApprovals();
  } catch (e) {
    approvalsRes.innerHTML = '';
    setError(approvalsErr, userFriendlyFetchError(e));
  }
  spinBtn(approvalsBtn, false);
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

  const active = list.filter((_, i) => !revokedSet.has(i));
  const unlimCount = active.filter(a => isUnlimitedApproval(a.amount, a.decimals)).length;
  const alertsHtml = unlimCount > 0
    ? alertBox('red', `<strong>${unlimCount} ${tt('unlimited')} ${tt('allowance')}${unlimCount > 1 ? 's' : ''}</strong> — revoke these first to reduce drainer risk.`)
    : '';

  const rowsHtml = list.map((a, i) => {
    const unlim = isUnlimitedApproval(a.amount, a.decimals);
    const isRev = revokedSet.has(i);
    const spenderShort = short(a.spender?.toString() || '?');
    const tokenLink = a.tokenAddr
      ? `<a class="a-link appr-token-link" href="https://tronscan.org/#/token20/${esc(a.tokenAddr)}" target="_blank" rel="noopener"><span>${esc(a.token)}</span>${icSVG(IC.link, 9)}</a>`
      : `<span class="appr-token-name">${esc(a.token)}</span>`;
    return `<div class="appr-row${isRev ? ' is-revoked' : ''}${unlim && !isRev ? ' is-risk' : ''}">
      ${apprRowIcon(a.token)}
      <div class="appr-row-body">
        <div class="appr-row-title">
          ${tokenLink}
          ${badge(unlim ? 'b-red' : 'b-amber', fmtTokenAmt(a.amount, a.decimals))}
        </div>
        <div class="appr-row-meta">${tt('spender')}: ${esc(spenderShort)} · ${a.date ? ago(a.date) : '—'}</div>
        ${a.tokenAddr ? `<div class="appr-row-addr">${esc(short(a.tokenAddr))}</div>` : ''}
      </div>
      <div class="appr-row-action">
        ${isRev
          ? badge('b-green', 'Revoked')
          : apprRevokeBtn(i)}
      </div>
    </div>`;
  }).join('');

  approvalsRes.innerHTML = `
    <div class="appr-scan">
      ${alertsHtml}
      <div class="an-stat-grid an-stat-grid--2 appr-hero-grid">
        <div class="an-stat">
          <div class="an-stat-label">Active ${tt('allowance')}s</div>
          <div class="an-stat-value is-info">${active.length} <span class="appr-stat-unit">/ ${list.length}</span></div>
          <div class="an-stat-sub">open token permissions</div>
        </div>
        <div class="an-stat">
          <div class="an-stat-label">${tt('unlimited')}</div>
          <div class="an-stat-value ${unlimCount > 0 ? 'is-red' : 'is-green'}">${unlimCount}</div>
          <div class="an-stat-sub">${unlimCount > 0 ? 'high-risk allowances' : 'no unlimited grants'}</div>
        </div>
      </div>
      <div class="appr-section">
        <div class="appr-section-head">
          <span class="appr-section-title">Allowances <span>· ${list.length}</span></span>
        </div>
        <div class="appr-list">${rowsHtml}</div>
      </div>
    </div>`;

}
