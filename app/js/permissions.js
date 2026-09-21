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
  return { names, labels, count: names.length };
}

async function normalizePermissionBlock(block) {
  if (!block || typeof block !== 'object') return null;
  const keys = await Promise.all((block.keys || []).map(async k => ({
    address: await normalizePermKeyAddress(k.address),
    weight: Number(k.weight) || 0,
  })));
  return {
    ...block,
    threshold: Number(block.threshold) || 0,
    keys: keys.filter(k => k.address),
  };
}

async function fetchAccountPermissions(addr) {
  const accRes = await gridGet(`/v1/accounts/${addr}`).catch(() => null);
  const row = accRes?.data?.[0] || null;
  let owner = row?.owner_permission || null;
  let actives = row?.active_permission || [];
  let witness = row?.witness_permission || null;

  if (!owner && (!actives || !actives.length)) {
    const raw = await gridPost('/wallet/getaccount', { value: addr, visible: true }).catch(() => null);
    if (raw && !raw.Error) {
      owner = raw.owner_permission || owner;
      actives = raw.active_permission || actives;
      witness = raw.witness_permission || witness;
    }
  }

  owner = await normalizePermissionBlock(owner);
  const activeList = Array.isArray(actives) ? actives : (actives ? [actives] : []);
  const normalizedActives = [];
  for (const ap of activeList) {
    const norm = await normalizePermissionBlock(ap);
    if (norm) normalizedActives.push(norm);
  }
  witness = await normalizePermissionBlock(witness);

  return {
    owner,
    actives: normalizedActives,
    witness,
    inactive: !row && !owner && !normalizedActives.length,
    isContract: await probeTronContract(addr).catch(() => false),
    accountRow: row,
  };
}

async function enrichPermissionSigners(selfAddr, owner, actives, witness) {
  const blocks = [owner, ...(actives || []), witness].filter(Boolean);
  const uniq = new Set();
  blocks.forEach(b => (b.keys || []).forEach(k => { if (k.address) uniq.add(k.address); }));
  const meta = {};
  await Promise.all([...uniq].map(async address => {
    meta[address] = {
      isContract: await probeTronContract(address).catch(() => false),
      external: !sameTronAddr(address, selfAddr),
    };
  }));
  return meta;
}

async function fetchPermissionHistory(addr) {
  const res = await gridGet(`/v1/accounts/${addr}/transactions`, {
    limit: 120,
    order_by: 'block_timestamp,desc',
    only_confirmed: true,
  }).catch(() => ({ data: [] }));
  return (res?.data || [])
    .filter(tx => tx.raw_data?.contract?.[0]?.type === 'AccountPermissionUpdateContract')
    .slice(0, 6)
    .map(tx => ({
      hash: tx.txID || tx.transaction_id || tx.hash || '',
      ts: tx.block_timestamp || 0,
    }))
    .filter(row => row.hash);
}

function permissionBlockSignature(block) {
  if (!block?.keys?.length) return '';
  const keys = [...block.keys].map(k => `${k.address}:${k.weight}`).sort().join(',');
  return `${keys}|t${block.threshold || 1}`;
}

function isMultisigInfoFinding(msg) {
  const m = String(msg || '');
  return /Multisig Owner/i.test(m)
    || /is multisig/i.test(m)
    || /Owner threshold .*multiple signatures/i.test(m);
}

function computePermissionRiskScore(analysis, stats) {
  if (analysis.level === 'ok' && !stats.externalSigners) return 0;
  let score = 0;
  if (stats.externalSigners) score += 35 + Math.min(25, stats.externalSigners * 12);
  analysis.findings.forEach(f => {
    if (f.lvl === 'danger') score += 12;
    else if (f.lvl === 'warn') score += 6;
  });
  if (stats.witnessKeys) score += 4;
  return Math.min(100, Math.max(analysis.level === 'ok' ? 0 : 8, score));
}

function analyzeAccountPermissions(addr, owner, actives, witness, signerMeta = {}) {
  const findings = [];
  let level = 'ok';

  const bump = (l) => {
    if (l === 'danger') level = 'danger';
    else if (l === 'warn' && level !== 'danger') level = 'warn';
  };

  const ownerKeys = owner?.keys || [];
  const ownerThreshold = owner?.threshold || 1;
  const ownerClass = classifyPermissionKeys(ownerKeys, addr, ownerThreshold, signerMeta);
  const ownerSig = permissionBlockSignature(owner);
  if (ownerClass.contractExternal.length) {
    findings.push({
      lvl: 'danger',
      msg: t('Contract signer on Owner permission — a third-party contract can control this account.'),
    });
    bump('danger');
  } else if (ownerClass.soloExternal.length) {
    findings.push({
      lvl: 'danger',
      msg: t('External signer can act alone on Owner permission — full account control without this wallet.'),
    });
    bump('danger');
  }
  if (ownerKeys.length > 1) {
    findings.push({
      lvl: 'info',
      msg: t('Multisig Owner — {n} controllers, threshold {t}.', { n: ownerKeys.length, t: ownerThreshold }),
    });
  } else if (ownerThreshold > 1) {
    findings.push({
      lvl: 'info',
      msg: t('Owner threshold {t} — multiple signatures required for owner actions.', { t: ownerThreshold }),
    });
  }

  for (const ap of actives || []) {
    const name = ap.permission_name || t('active');
    const threshold = ap.threshold || 1;
    const activeClass = classifyPermissionKeys(ap.keys, addr, threshold, signerMeta);
    if (activeClass.contractExternal.length) {
      findings.push({
        lvl: 'danger',
        msg: t('Active permission "{name}" includes a contract signer.', { name }),
      });
