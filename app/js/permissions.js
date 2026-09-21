// ==================================
//  ACCOUNT PERMISSION AUDITOR
// ==================================
const permissionsInput = document.getElementById('permissions-input');
const permissionsBtn   = document.getElementById('permissions-scan-btn');
const permissionsErr   = document.getElementById('permissions-err');
const permissionsRes   = document.getElementById('permissions-result');
const permissionsEmpty = document.getElementById('permissions-empty');

let permissionsScanBusy = false;
let permissionsScanGen = 0;
let permissionsLastAddr = '';
let permissionsData = null;
let permissionsFromCache = false;

const PERMISSIONS_CACHE_TTL = 12 * 60 * 1000;

const PERMISSION_CONTRACT_TYPES = [
  'AccountCreateContract', 'TransferContract', 'TransferAssetContract', 'VoteAssetContract',
  'VoteWitnessContract', 'WitnessCreateContract', 'AssetIssueContract', 'WitnessUpdateContract',
  'ParticipateAssetIssueContract', 'AccountUpdateContract', 'FreezeBalanceContract',
  'UnfreezeBalanceContract', 'WithdrawBalanceContract', 'UnfreezeAssetContract', 'UpdateAssetContract',
  'ProposalCreateContract', 'ProposalApproveContract', 'ProposalDeleteContract', 'SetAccountIdContract',
  'CustomContract', 'CreateSmartContract', 'TriggerSmartContract', 'GetContract', 'UpdateSettingContract',
  'ExchangeCreateContract', 'ExchangeInjectContract', 'ExchangeWithdrawContract', 'ExchangeTransactionContract',
  'UpdateEnergyLimitContract', 'AccountPermissionUpdateContract', 'ClearABIContract', 'UpdateBrokerageContract',
  'ShieldedTransferContract', 'MarketSellAssetContract', 'MarketCancelOrderContract', 'FreezeBalanceV2Contract',
  'UnfreezeBalanceV2Contract', 'WithdrawExpireUnfreezeContract', 'DelegateResourceContract',
  'UnDelegateResourceContract', 'CancelAllUnfreezeV2Contract', 'WithdrawRewardContract',
];

const PERMISSION_OP_LABELS = {
  TransferContract: 'TRX transfers',
  TransferAssetContract: 'TRC-10 transfers',
  TriggerSmartContract: 'Smart contract calls',
  AccountPermissionUpdateContract: 'Change account permissions',
  WithdrawBalanceContract: 'Claim voting rewards',
  VoteWitnessContract: 'Vote for SR',
  FreezeBalanceV2Contract: 'Stake TRX (v2)',
  UnfreezeBalanceV2Contract: 'Unstake TRX (v2)',
  DelegateResourceContract: 'Delegate energy/bandwidth',
  CreateSmartContract: 'Deploy contracts',
};

const PERMISSION_OP_RISK = new Set([
  'AccountPermissionUpdateContract',
  'TransferContract',
  'TriggerSmartContract',
  'WithdrawBalanceContract',
  'DelegateResourceContract',
]);

function permissionsCacheKey(addr) {
  return `tronsec_permissions_scan:${addr}`;
}

function readPermissionsSessionCache(addr) {
  return readSessionCache('permissions', addr, {
    ttl: PERMISSIONS_CACHE_TTL,
    legacyKey: permissionsCacheKey,
    validate: (p) => p.addr === addr && p.data,
  });
}

function writePermissionsSessionCache(snapshot) {
  if (!snapshot?.addr) return;
  writeSessionCache('permissions', snapshot.addr, snapshot, { legacyKey: permissionsCacheKey });
}

function clearPermissionsSessionCache(addr) {
  clearSessionCache('permissions', addr, { legacyKey: permissionsCacheKey });
}

const PERMISSION_OP_SENSITIVE_DISPLAY = new Set([
  'AccountPermissionUpdateContract',
]);

function resetPermissionsScanCache() {
  if (permissionsLastAddr) clearPermissionsSessionCache(permissionsLastAddr);
  permissionsData = null;
  permissionsLastAddr = '';
  permissionsFromCache = false;
}

function setPermissionsScanLocked(locked) {
  permissionsScanBusy = locked;
  if (locked) {
    spinBtn(permissionsBtn, true);
    if (permissionsBtn) permissionsBtn.setAttribute('aria-busy', 'true');
    lockScanInput(permissionsInput, true);
  } else {
    endScanUI({ btn: permissionsBtn, input: permissionsInput });
  }
}

permissionsInput?.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (permissionsScanBusy) return;
  permissionsScan();
});
permissionsBtn?.addEventListener('click', permissionsScan);

permissionsRes?.addEventListener('click', e => {
  const btn = e.target.closest('[data-perm-ops-toggle]');
  if (!btn || !permissionsRes.contains(btn)) return;
  e.preventDefault();
  const id = btn.getAttribute('data-perm-ops-toggle');
  const panel = id ? document.getElementById(id) : null;
  if (!panel) return;
  const open = !panel.classList.contains('is-open');
  panel.classList.toggle('is-open', open);
  panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  const n = panel.querySelectorAll('.module-desc-tag').length;
  btn.innerHTML = open
    ? `${icSVG('M18 15l-6-6-6 6', 14)}<span>${t('Hide operations')}</span>`
    : `${icSVG(IC.arrowDown, 14)}<span>${t('Show all {n} operations', { n })}</span>`;
});

(function () {
  const u = new URLSearchParams(location.search).get('address') || new URLSearchParams(location.search).get('q');
  if (u && isValidTron(u) && permissionsInput) {
    permissionsInput.value = u;
    permissionsScan();
  }
})();

async function normalizePermKeyAddress(addr) {
  if (!addr) return null;
  if (isValidTron(addr)) return addr;
  let clean = String(addr).replace(/^0x/i, '');
  if (clean.length >= 40) clean = '41' + clean.slice(-40);
  if (clean.length === 42) return hexToTronAddress(clean).catch(() => null);
  return null;
}

function decodePermissionOperations(hex) {
  if (!hex) return { names: [], labels: [], count: 0 };
  const clean = String(hex).replace(/^0x/i, '').toLowerCase();
  if (!clean) return { names: [], labels: [], count: 0 };
  const names = [];
  for (let bit = 0; bit < 256; bit++) {
    const byteIdx = Math.floor(bit / 8);
    const charIdx = byteIdx * 2;
    if (charIdx + 1 >= clean.length) break;
    const byte = parseInt(clean.slice(charIdx, charIdx + 2), 16) || 0;
    const bitIdx = 7 - (bit % 8);
    if ((byte >> bitIdx) & 1) {
      names.push(PERMISSION_CONTRACT_TYPES[bit] || `ContractType#${bit}`);
    }
  }
  const labels = names.map(n => PERMISSION_OP_LABELS[n] || n.replace(/Contract$/, ''));
