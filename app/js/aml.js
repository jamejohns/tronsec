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
