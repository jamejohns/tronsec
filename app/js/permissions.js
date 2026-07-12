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
      bump('danger');
    } else if (activeClass.soloExternal.length) {
      findings.push({
        lvl: 'danger',
        msg: t('Active permission "{name}" — external signer can act without this wallet.', { name }),
      });
      bump('danger');
    }
    if ((ap.keys || []).length > 1) {
      const sig = permissionBlockSignature(ap);
      if (sig !== ownerSig) {
        findings.push({
          lvl: 'info',
          msg: t('Active "{name}" is multisig ({n} keys, threshold {t}).', {
            name, n: ap.keys.length, t: threshold,
          }),
        });
      }
    }
    const ops = decodePermissionOperations(ap.operations);
    if (ops.names.includes('AccountPermissionUpdateContract') && activeClass.riskyAddresses.size) {
      findings.push({
        lvl: 'danger',
        msg: t('Active "{name}" can modify account permissions via an external controller.', { name }),
      });
      bump('danger');
    }
  }

  if (witness?.keys?.length) {
    findings.push({
      lvl: 'info',
      msg: t('Witness (Super Representative) permission is configured on this account.'),
    });
  }

  if (!findings.some(f => f.lvl === 'danger' || f.lvl === 'warn')) {
    if (!findings.length) {
      findings.unshift({
        lvl: 'ok',
        msg: t('Standard layout — only this address holds owner/active signing keys with threshold 1.'),
      });
    } else if (!findings.some(f => f.lvl === 'info')) {
      findings.unshift({
        lvl: 'ok',
        msg: t('No permission risks detected — review signers and operation scopes below.'),
      });
    }
  }

  return { level, findings };
}

function permissionStats(addr, owner, actives, witness, signerMeta = {}) {
  const blocks = [owner, ...(actives || []), witness].filter(Boolean);
  const riskyExternal = new Set();
  const coSigners = new Set();
  blocks.forEach(b => {
    const cls = classifyPermissionKeys(b.keys, addr, b.threshold || 1, signerMeta);
    cls.riskyAddresses.forEach(a => riskyExternal.add(a));
    cls.coSigners.forEach(k => coSigners.add(k.address));
  });
  const multisigGroups = blocks.filter(b => (b.keys?.length || 0) > 1 || (b.threshold || 1) > 1).length;
  return {
    ownerSigners: owner?.keys?.length || 0,
    activeGroups: actives?.length || 0,
    externalSigners: riskyExternal.size,
    coSigners: coSigners.size,
    multisigGroups,
    witnessKeys: witness?.keys?.length || 0,
    riskyExternalAddresses: [...riskyExternal],
  };
}

const PERM_OP_GROUPS = {
  transfers: {
    label: 'Transfers',
    types: ['TransferContract', 'TransferAssetContract', 'ShieldedTransferContract'],
  },
  contracts: {
    label: 'Smart contracts',
    types: ['TriggerSmartContract', 'CreateSmartContract', 'ClearABIContract', 'UpdateSettingContract'],
  },
  staking: {
    label: 'Stake & resources',
    types: ['FreezeBalanceContract', 'UnfreezeBalanceContract', 'FreezeBalanceV2Contract', 'UnfreezeBalanceV2Contract', 'DelegateResourceContract', 'UnDelegateResourceContract', 'WithdrawExpireUnfreezeContract', 'CancelAllUnfreezeV2Contract'],
  },
  governance: {
    label: 'Governance & votes',
    types: ['VoteWitnessContract', 'WithdrawBalanceContract', 'WithdrawRewardContract', 'ProposalCreateContract', 'ProposalApproveContract', 'ProposalDeleteContract'],
  },
  permissions: {
    label: 'Permission admin',
    types: ['AccountPermissionUpdateContract', 'AccountUpdateContract', 'SetAccountIdContract'],
  },
};

function summarizeOperations(hex) {
  const ops = decodePermissionOperations(hex);
  const groups = [];
  const used = new Set();
  for (const group of Object.values(PERM_OP_GROUPS)) {
    const hits = ops.names.filter(n => group.types.includes(n));
    if (!hits.length) continue;
    hits.forEach(n => used.add(n));
    groups.push({
      label: group.label,
      count: hits.length,
      risky: hits.some(n => PERMISSION_OP_RISK.has(n)),
    });
  }
  const other = ops.names.filter(n => !used.has(n)).length;
  if (other > 0) {
    groups.push({ label: 'Other on-chain ops', count: other, risky: false });
  }
  return { total: ops.count, groups, risky: ops.names.filter(n => PERMISSION_OP_RISK.has(n)) };
}

function permKvRow(label, valueHtml, last) {
  return `<div class="kv-row${last ? ' kv-row--last' : ''}">
    <span class="kv-label">${kvLabel(label)}</span>
    <span class="kv-val">${valueHtml}</span>
  </div>`;
}

function permHeadCard(addr, tagsHtml, fromCache) {
  return scanHeadCard({
    leadHtml: `<div class="wallet-head-addr">${esc(addr)}</div>`,
    actionsHtml: `
      ${scanActionBtn({ id: 'perm-copy-summary-btn', label: 'Copy summary', icon: IC.copy })}
      ${scanActionBtn({ id: 'perm-refresh-btn', label: 'Refresh scan', icon: IC.refresh })}
      ${scanActionBtn({ id: 'perm-tronscan-btn', label: 'TronScan', icon: IC.external, href: `https://tronscan.org/#/address/${addr}/permissions`, variant: 'ext' })}
    `,
    tagsHtml: `${tagsHtml}${fromCache ? permTag(t('session cache'), 'name') : ''}`,
  });
}

function permTag(text, variant) {
  return `<span class="wallet-tag${variant ? ` is-${variant}` : ''}">${esc(t(text))}</span>`;
}

function permAssessment(analysis, isContract, stats) {
  const danger = analysis.findings.filter(f => f.lvl === 'danger');
  const warn = analysis.findings.filter(f => f.lvl === 'warn');
  if (isContract) {
    return amlAlertInline('amber', `<strong>${t('Contract address')}</strong> — ${t('Account permission keys usually belong to wallets; on-chain data shown if present.')}`);
  }
  if (danger.length) {
    return amlAlertInline('red', `<strong>${t('High-risk permission layout')}</strong> — ${esc(danger[0].msg)}${danger.length > 1 ? ` (+${danger.length - 1})` : ''}`);
  }
  if (warn.length) {
    return amlAlertInline('amber', `<strong>${t('Review recommended')}</strong> — ${esc(warn[0].msg)}${warn.length > 1 ? ` (+${warn.length - 1})` : ''}`);
  }
  if (stats?.multisigGroups) {
    return amlAlertInline('green', `<strong>${t('Multisig permissions')}</strong> — ${t('Co-signed layout — review signers and thresholds below.')}`);
  }
  return amlAlertInline('green', `<strong>${t('Standard permissions')}</strong> — ${t('Only this address controls owner and active keys with threshold 1.')}`);
}

function permSignerRow(key, selfAddr, signerMeta, threshold) {
  const self = sameTronAddr(key.address, selfAddr);
  const meta = signerMeta?.[key.address] || {};
  const external = !self && !!key.address;
  const soloRisk = external && externalCanActAlone(key, threshold);
  const contractRisk = external && meta.isContract;
  const coSigner = external && !soloRisk && !contractRisk;
  const tone = soloRisk || contractRisk ? 'is-risk' : (coSigner ? 'is-cosigner' : 'is-ok');
  const icon = soloRisk || contractRisk
    ? icSVG('M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01', 18)
    : coSigner
      ? icSVG('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75', 18)
      : icSVG('M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4', 18);
  const kind = self
    ? t('This account')
    : (meta.isContract ? t('Contract signer') : t('Wallet signer'));
  const roleNote = soloRisk || contractRisk
    ? t('External controller')
    : (coSigner ? t('Co-signer wallet') : '');
  const addrBtn = typeof walletContractScanBtn === 'function'
    ? walletContractScanBtn(key.address)
    : txAddrLink(key.address);
  const weightPct = threshold > 0 ? Math.min(100, Math.round((key.weight / threshold) * 100)) : 100;
  return `<div class="perm-signer risk-row ${tone}">
    <div class="perm-signer-icon">${icon}</div>
    <div class="perm-signer-body">
      <div class="perm-signer-addr">${addrBtn}</div>
      <div class="perm-signer-meta">${esc(kind)}${roleNote ? ` · ${esc(roleNote)}` : ''}</div>
      ${threshold > 1 ? `<div class="perm-weight-bar" aria-hidden="true"><div class="perm-weight-bar-fill" style="width:${weightPct}%"></div></div>` : ''}
    </div>
    <div class="perm-signer-weight">
      <span class="mono">${esc(String(key.weight))}</span>
      <span class="perm-signer-weight-label">${t('Weight')}${threshold > 1 ? ` / ${threshold}` : ''}</span>
    </div>
  </div>`;
}

function permOpsSummary(hex, { highlightSensitive = true } = {}) {
  const summary = summarizeOperations(hex);
  if (!summary.total) return `<p class="kv-muted perm-ops-empty">${t('No operation scope on record')}</p>`;
  const rows = summary.groups.map((g, i) => permKvRow(
    g.label,
    `<span>${g.count} ${t('ops')}</span>`,
    i === summary.groups.length - 1,
  )).join('');
  const sensitive = summary.risky
    .filter(n => PERMISSION_OP_SENSITIVE_DISPLAY.has(n))
    .map(n => PERMISSION_OP_LABELS[n] || n.replace(/Contract$/, ''));
  const riskyHtml = highlightSensitive && sensitive.length
    ? `<div class="perm-ops-note">${t('Permission-changing scopes')}: ${sensitive.map(l => `<span class="badge b-ghost">${esc(t(l))}</span>`).join(' ')}</div>`
    : '';
  return `<div class="aml-kv-list perm-ops-kv">${rows}</div>${riskyHtml}`;
}

function permOpsExpandable(hex, sectionId) {
  const summary = summarizeOperations(hex);
  const body = permOpsSummary(hex);
  if (summary.total <= 8) return body;
  const labels = decodePermissionOperations(hex).labels;
  const fullList = labels.map(l => `<span class="module-desc-tag">${esc(t(l))}</span>`).join('');
  return `${body}
    <button type="button" class="wallet-load-more-btn perm-ops-toggle" data-perm-ops-toggle="${esc(sectionId)}" aria-expanded="false" aria-controls="${esc(sectionId)}">
      ${icSVG(IC.arrowDown, 14)}<span>${t('Show all {n} operations', { n: summary.total })}</span>
    </button>
    <div class="perm-ops-full module-desc-tags" id="${esc(sectionId)}" aria-hidden="true">${fullList}</div>`;
}

function permThresholdBadge(block) {
  const keys = block?.keys || [];
  const threshold = block?.threshold || 1;
  if (keys.length <= 1 && threshold <= 1) return '';
  const totalWeight = keys.reduce((sum, k) => sum + (Number(k.weight) || 0), 0);
  const ok = totalWeight >= threshold;
  return permTag(
    ok ? t('Threshold reachable ({w}/{t})', { w: totalWeight, t: threshold }) : t('Below threshold ({w}/{t})', { w: totalWeight, t: threshold }),
    ok ? 'live' : 'bad',
  );
}

function permSectionLabel(baseTitle, block, index) {
  const idx = index > 0 ? ` ${index}` : '';
  const name = block?.permission_name;
  if (name) return `${baseTitle} · ${name}${idx}`;
  return `${baseTitle}${idx}`;
}

function permSection(title, block, selfAddr, signerMeta, { showOps = false, index = 0, sectionKey = '' } = {}) {
  if (!block) return '';
  const keys = block.keys || [];
  const threshold = block.threshold || 1;
  const multisig = keys.length > 1 || threshold > 1;
  const keyClass = classifyPermissionKeys(keys, selfAddr, threshold, signerMeta);
  const badgeTone = keyClass.riskyAddresses.size ? 'bad' : (multisig ? 'name' : 'live');
  const sectionTitle = permSectionLabel(title, block, index);
  const signers = keys.length
    ? `<div class="perm-signer-list">${keys.map(k => permSignerRow(k, selfAddr, signerMeta, threshold)).join('')}</div>`
    : `<p class="kv-muted perm-empty-inline">${t('No signing keys')}</p>`;
  const opsId = sectionKey ? `perm-ops-${sectionKey}` : '';

  return `<div class="scan-section perm-section">
    <div class="scan-section-head perm-section-head">
      <span class="scan-section-title">${esc(sectionTitle)}</span>
      <div class="scan-section-badges perm-section-badges">
        ${permTag(multisig ? t('Multisig') : t('Single signer'), badgeTone)}
        ${permThresholdBadge(block)}
      </div>
    </div>
    <div class="perm-meta-strip">
      <span>${t('Threshold')}: <strong class="mono">${esc(String(threshold))}</strong></span>
      <span>${t('Signers')}: <strong class="mono">${keys.length}</strong></span>
      ${block.permission_name ? `<span>${t('Name')}: <strong class="mono">${esc(block.permission_name)}</strong></span>` : ''}
      ${block.id != null ? `<span>ID: <strong class="mono">${esc(String(block.id))}</strong></span>` : ''}
    </div>
    ${signers}
    ${showOps ? `<div class="perm-ops-block">
      <div class="perm-ops-title">${t('Allowed operations')} <span>· ${summarizeOperations(block.operations).total}</span></div>
      ${permOpsExpandable(block.operations, opsId)}
    </div>` : ''}
  </div>`;
}

function permHistorySection(history) {
  if (!history?.length) return '';
  const rows = history.map(row => {
    const txBtn = typeof walletTxHashBtn === 'function' ? walletTxHashBtn(row.hash) : esc(addrLabel(row.hash));
    return `<div class="perm-history-row">
      <div class="perm-history-when">${esc(row.ts ? ago(row.ts) : '—')}</div>
      <div class="perm-history-tx">${txBtn}</div>
      <a class="wallet-action-btn wallet-action-btn--ext perm-history-link" href="https://tronscan.org/#/transaction/${esc(row.hash)}" target="_blank" rel="noopener">${icSVG(IC.external, 12)}<span>TronScan</span></a>
    </div>`;
  }).join('');
  return `<div class="aml-block perm-history-block">
    <div class="aml-block-head">
      <span class="aml-block-title">${t('Permission changes')}</span>
      <span class="aml-block-meta">${history.length}</span>
    </div>
    <div class="aml-block-body aml-block-body--flush">
      <div class="perm-history-list">${rows}</div>
    </div>
  </div>`;
}

function buildPermissionNextSteps(addr, stats, history) {
  const steps = [];
  const risky = stats?.riskyExternalAddresses || [];
  if (risky.length) {
    steps.push({
      tone: 'red',
      title: t('External controller detected'),
      desc: t('A third-party address can act without this wallet — scan it before trusting this account.'),
      action: 'scan-external',
      addr: risky[0],
      label: t('Scan controller'),
      primary: true,
    });
  }
  if (history?.length) {
    steps.push({
      tone: 'amber',
      title: t('Recent permission update on-chain'),
      desc: t('Decode the latest AccountPermissionUpdate transaction to see what changed.'),
      action: 'tx',
      hash: history[0].hash,
      label: t('Decode latest TX'),
      primary: !steps.length,
    });
  }
  if (!steps.length) return '';
  const rows = steps.map(step => `
    <div class="wallet-next-step is-${step.tone}${step.primary ? ' is-primary' : ''}">
      <div class="wallet-next-step-body">
        <div class="wallet-next-step-title">${esc(step.title)}</div>
        <div class="wallet-next-step-desc">${esc(step.desc)}</div>
      </div>
      <button type="button" class="wallet-action-btn wallet-go-btn wallet-go-btn--${step.tone}" data-perm-step="${step.action}" data-perm-addr="${esc(step.addr || '')}" data-perm-hash="${esc(step.hash || '')}">
        <span>${esc(step.label)}</span>${icSVG(IC.link, 12)}
      </button>
    </div>`).join('');
  return `<div class="wallet-next-steps perm-next-steps">
    <div class="wallet-next-steps-head">
      <span class="wallet-next-steps-title">${t('Recommended next steps')}</span>
    </div>
    <div class="wallet-next-steps-list">${rows}</div>
  </div>`;
}

function buildPermissionSummaryText(data) {
  const { addr, owner, actives, witness, analysis, riskScore, stats, history, signerMeta } = data;
  const lines = [
    'TRONSEC Permission Audit',
    `${t('Address')}: ${addr}`,
    `${t('Permission risk')}: ${riskScore}/100 (${analysis.level})`,
    '',
    `${t('Owner signers')}: ${stats.ownerSigners} (${t('Threshold')} ${owner?.threshold || 1})`,
    `${t('Active groups')}: ${stats.activeGroups}`,
    `${t('External controllers')}: ${stats.externalSigners}`,
    `${t('Co-signer wallet')}: ${stats.coSigners || 0}`,
    '',
    `${t('Findings')}:`,
    ...analysis.findings.map(f => `- [${f.lvl}] ${f.msg}`),
  ];
  const dumpKeys = (title, block) => {
    if (!block?.keys?.length) return;
    lines.push('', `${title}:`);
    block.keys.forEach(k => {
      const m = signerMeta?.[k.address] || {};
      const tag = m.external ? 'external' : (m.isContract ? 'contract' : 'wallet');
      lines.push(`  - ${k.address} (weight ${k.weight}, ${tag})`);
    });
  };
  dumpKeys('Owner', owner);
  (actives || []).forEach((ap, i) => dumpKeys(`Active ${i + 1}`, ap));
  dumpKeys('Witness', witness);
  if (history?.length) {
    lines.push('', 'Recent permission updates:');
    history.forEach(h => lines.push(`  - ${h.hash}`));
  }
  lines.push('', 'https://tronsec.io/app/#permissions');
  return lines.join('\n');
}

function permRiskStat(score, level) {
  const cls = level === 'danger' ? 'is-red' : (level === 'warn' ? 'is-amber' : 'is-green');
  return `<div class="an-stat perm-risk-stat">
    <div class="an-stat-label">${t('Permission risk')}</div>
    <div class="an-stat-value ${cls}">${score}<span class="aml-score-unit">/100</span></div>
    <div class="an-stat-sub">${t('Heuristic score — not an AML check')}</div>
  </div>`;
}

function permFindingRows(findings, analysisLevel) {
  const risks = findings.filter(f => f.lvl === 'danger' || f.lvl === 'warn');
  let notes = findings.filter(f => f.lvl === 'info');
  const oks = findings.filter(f => f.lvl === 'ok');

  if (!risks.length && analysisLevel === 'ok') {
    notes = notes.filter(f => !isMultisigInfoFinding(f.msg));
  }

  const rows = risks.length ? risks : (oks.length === 1 && !notes.length ? oks : notes);
  if (!rows.length) return '';

  const blockTitle = risks.length ? t('Findings') : t('Notes');
  return `<div class="aml-block perm-findings-block${risks.length ? '' : ' perm-notes-block'}">
    <div class="aml-block-head">
      <span class="aml-block-title">${blockTitle}</span>
      ${rows.length > 1 ? `<span class="aml-block-meta">${rows.length}</span>` : ''}
    </div>
    <div class="aml-block-body aml-block-body--flush">
      <div class="contract-risks">
        ${rows.map(f => {
          const cls = f.lvl === 'danger' ? 'is-high' : (f.lvl === 'warn' ? 'is-med' : 'is-info');
          const cat = f.lvl === 'danger' ? t('Risk') : (f.lvl === 'warn' ? t('Warning') : t('Note'));
          return `<div class="contract-risk ${cls}">
            <div class="contract-risk-body">
              <div class="contract-risk-cat">${esc(cat)}</div>
              <div class="contract-risk-msg">${esc(f.msg)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

function bindPermActions(addr) {
  document.getElementById('perm-refresh-btn')?.addEventListener('click', () => permissionsScan({ force: true }));
  const summaryBtn = document.getElementById('perm-copy-summary-btn');
  if (summaryBtn && permissionsData) {
    summaryBtn.addEventListener('click', () => {
      const text = buildPermissionSummaryText(permissionsData);
      navigator.clipboard?.writeText(text).then(() => showToast(t('Summary copied'))).catch(() => showToast(t('Copy failed')));
    });
  }
  permissionsRes.querySelectorAll('.wallet-contract-scan-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (typeof openAddressScan === 'function') openAddressScan(btn.getAttribute('data-addr'));
    });
  });
  permissionsRes.querySelectorAll('.wallet-tx-decode-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (typeof openTxDecoder === 'function') openTxDecoder(btn.getAttribute('data-hash'));
    });
  });
  permissionsRes.querySelectorAll('[data-perm-step]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const action = btn.getAttribute('data-perm-step');
      const targetAddr = btn.getAttribute('data-perm-addr');
      const hash = btn.getAttribute('data-perm-hash');
      if (action === 'scan-external' && targetAddr && typeof openWalletScan === 'function') openWalletScan(targetAddr);
      else if (action === 'wallet' && typeof openWalletScan === 'function') openWalletScan(addr);
      else if (action === 'tx' && hash && typeof openTxDecoder === 'function') openTxDecoder(hash);
    });
  });
}

function renderPermissions() {
  const { addr, owner, actives, witness, analysis, isContract, riskScore, stats, history, signerMeta } = permissionsData;
  const statBlock = stats || permissionStats(addr, owner, actives, witness, signerMeta);

  const headTags = [
    statBlock.externalSigners ? permTag(t('{n} external controller(s)', { n: statBlock.externalSigners }), 'bad') : '',
    statBlock.coSigners ? permTag(t('{n} co-signer(s)', { n: statBlock.coSigners }), 'name') : '',
    statBlock.multisigGroups ? permTag(t('{n} multisig group(s)', { n: statBlock.multisigGroups }), 'name') : '',
    statBlock.witnessKeys ? permTag(t('Witness keys'), 'warn') : '',
    history?.length ? permTag(t('{n} recent permission TX', { n: history.length }), 'warn') : '',
    isContract ? permTag(t('Contract'), 'name') : permTag(t('Wallet'), 'live'),
  ].filter(Boolean).join('');

  const heroHtml = `
    ${permRiskStat(riskScore ?? 0, analysis.level)}
    <div class="an-stat">
      <div class="an-stat-label">${t('Active groups')}</div>
      <div class="an-stat-value is-info">${statBlock.activeGroups}</div>
      <div class="an-stat-sub">${t('custom operation scopes')}</div>
    </div>
    <div class="an-stat">
      <div class="an-stat-label">${t('Owner signers')}</div>
      <div class="an-stat-value is-green">${statBlock.ownerSigners}</div>
      <div class="an-stat-sub">${owner?.threshold > 1 ? t('threshold {t}', { t: owner.threshold }) : t('full account control')}</div>
    </div>
    <div class="an-stat">
      <div class="an-stat-label">${t('External controllers')}</div>
      <div class="an-stat-value ${statBlock.externalSigners ? 'is-red' : 'is-green'}">${statBlock.externalSigners}</div>
      <div class="an-stat-sub">${statBlock.externalSigners ? t('can act without this wallet') : (statBlock.coSigners ? t('{n} co-signer(s) only', { n: statBlock.coSigners }) : t('none detected'))}</div>
    </div>`;

  const sections = [
    ...(actives || []).map((ap, i) => permSection(t('Active permission'), ap, addr, signerMeta, {
      showOps: true,
      index: actives.length > 1 ? i + 1 : 0,
      sectionKey: `active-${i}`,
    })),
    permSection(t('Owner permission'), owner, addr, signerMeta, { showOps: true, sectionKey: 'owner' }),
    witness?.keys?.length ? permSection(t('Witness permission'), witness, addr, signerMeta, { sectionKey: 'witness' }) : '',
  ].filter(Boolean).join('');

  permissionsRes.innerHTML = `<div class="perm-scan">
    ${permHeadCard(addr, headTags, permissionsFromCache)}
    <div class="an-stat-grid an-stat-grid--4 scan-hero-grid">${heroHtml}</div>
    <div class="perm-assessment">${permAssessment(analysis, isContract, statBlock)}</div>
    ${buildPermissionNextSteps(addr, statBlock, history)}
    ${permFindingRows(analysis.findings, analysis.level)}
    <div class="perm-sections">${sections}</div>
    ${permHistorySection(history)}
    <p class="aml-disclaimer perm-disclaimer">${t('Permission audit uses public on-chain data and heuristics. Co-signer wallets are not AML-screened — verify you trust every signer.')}</p>
  </div>`;

  bindPermActions(addr);
  if (window.lucide) lucide.createIcons();
  if (typeof syncModuleNavState === 'function') syncModuleNavState('permissions');
}

async function permissionsScan(opts = {}) {
  if (permissionsScanBusy) return;
  const force = opts.force === true;
  const addr = permissionsInput.value.trim();
  setError(permissionsErr, '');
  if (!addr) { flashInput(permissionsInput); showToast(t('Enter a TRON address')); return; }
  if (!isValidTron(addr)) { flashInput(permissionsInput); showToast(t('Invalid TRON address — must start with T, 34 chars.')); return; }

  permissionsLastAddr = addr;

  if (!force) {
    const cached = readPermissionsSessionCache(addr);
    if (cached?.data) {
      permissionsData = cached.data;
      permissionsFromCache = true;
      hideScanEmpty(permissionsEmpty, { instant: true });
      renderPermissions();
      showToast(t('Loaded from session cache'));
      return;
    }
  } else {
    clearPermissionsSessionCache(addr);
  }

  const gen = ++permissionsScanGen;
  setPermissionsScanLocked(true);
  permissionsFromCache = false;
  hideScanEmpty(permissionsEmpty);
  permissionsRes.innerHTML = SK.permissions();

  try {
    const [payload, history] = await Promise.all([
      fetchAccountPermissions(addr),
      fetchPermissionHistory(addr),
    ]);
    if (gen !== permissionsScanGen) return;

    if (payload.inactive && !payload.owner && !payload.actives.length) {
      permissionsRes.innerHTML = '';
      setError(permissionsErr, t('Address not found or unactivated — no on-chain account for that address. Please check the address format and try again.'));
      return;
    }

    const signerMeta = await enrichPermissionSigners(addr, payload.owner, payload.actives, payload.witness);
    if (gen !== permissionsScanGen) return;

    const analysis = analyzeAccountPermissions(addr, payload.owner, payload.actives, payload.witness, signerMeta);
    const stats = permissionStats(addr, payload.owner, payload.actives, payload.witness, signerMeta);
    const riskScore = computePermissionRiskScore(analysis, stats);
    permissionsData = { addr, ...payload, analysis, history, signerMeta, riskScore, stats };
    renderPermissions();
    writePermissionsSessionCache({ addr, data: permissionsData });
  } catch (e) {
    if (gen !== permissionsScanGen) return;
    permissionsRes.innerHTML = '';
    setError(permissionsErr, userFriendlyFetchError(e));
  } finally {
    if (gen === permissionsScanGen) setPermissionsScanLocked(false);
  }
}
