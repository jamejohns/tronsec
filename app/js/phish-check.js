// ==================================
//  PHISHING URL CHECKER
// ==================================

function vtEndpoint(path) {
  return window.tronsecProxyUrl('/vt' + path);
}

function vtRequestHeaders(contentType) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

// -- DOM refs ----------------------------------------------------------
const phishInput = document.getElementById('phish-input');
const phishBtn   = document.getElementById('phish-btn');
const phishErr   = document.getElementById('phish-err');
const phishRes   = document.getElementById('phish-result');
const phishEmpty = document.getElementById('phish-empty');

phishInput.addEventListener('keydown', e => { if (e.key === 'Enter') phishCheck(); });
phishBtn.addEventListener('click', phishCheck);

(function () {
  const u = new URLSearchParams(location.search).get('url');
  if (u) { phishInput.value = u; phishCheck(); }
})();

async function vtSubmitUrl(url) {
  const body = new URLSearchParams({ url });
  const res = await fetch(vtEndpoint('/urls'), {
    method:  'POST',
    headers: vtRequestHeaders('application/x-www-form-urlencoded'),
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `VT submit error ${res.status}`);
  }
  const data = await res.json();
  return data?.data?.id;
}

async function vtGetAnalysis(analysisId) {
  const res = await fetch(vtEndpoint(`/analyses/${analysisId}`), {
    headers: vtRequestHeaders(),
  });
  if (!res.ok) throw new Error(`VT analysis error ${res.status}`);
  return res.json();
}

async function vtGetUrlReport(urlId) {
  const res = await fetch(vtEndpoint(`/urls/${urlId}`), {
    headers: vtRequestHeaders(),
  });
  if (!res.ok) throw new Error(`VT url report error ${res.status}`);
  return res.json();
}

async function vtPollAnalysis(analysisId, onProgress) {
  // Poll up to 10 times with 2s delay = max ~20s
  for (let i = 0; i < 10; i++) {
    const data = await vtGetAnalysis(analysisId);
    const status = data?.data?.attributes?.status;
    if (status === 'completed') return data;
    onProgress && onProgress(i);
    await new Promise(r => setTimeout(r, 2000));
  }
  // Return whatever we have even if not completed
  return vtGetAnalysis(analysisId);
}

function parseVtAttrs(attrs) {
  // /analyses/{id} > attrs.stats + attrs.results
  // /urls/{id}     > attrs.last_analysis_stats + attrs.last_analysis_results
  const stats = attrs?.stats || attrs?.last_analysis_stats;
  const engines = attrs?.results || attrs?.last_analysis_results || {};

  if (!stats) return null;

  const malicious  = stats.malicious  || 0;
  const suspicious = stats.suspicious || 0;
  const harmless   = stats.harmless   || 0;
  const undetected = stats.undetected || 0;
  const total      = malicious + suspicious + harmless + undetected;

  if (total === 0) return null; // ??? ?? ??????????????

  const flaggedBy = Object.entries(engines)
    .filter(([, v]) => v.category === 'malicious' || v.category === 'suspicious')
    .map(([engine, v]) => `${engine} (${v.result || v.category})`)
    .slice(0, 5);

  let status, detail;
  if (malicious >= 3) {
    status = 'phishing';
    detail = `${malicious}/${total} engines flagged as malicious` +
             (flaggedBy.length ? ` — ${flaggedBy.join(', ')}` : '');
  } else if (malicious >= 1 || suspicious >= 2) {
    status = 'suspicious';
    detail = `${malicious} malicious, ${suspicious} suspicious out of ${total} engines`;
  } else {
    status = 'clean';
    detail = `${harmless} clean, ${undetected} undetected — ${malicious} malicious out of ${total} engines`;
  }

  return { status, detail, stats, flaggedBy, total };
}

async function checkVirusTotal(url, onProgress) {
  try {
    // ??? 1: ???????? URL, ???????? analysis id
    const analysisId = await vtSubmitUrl(url);
    if (!analysisId) return { status: 'error', detail: 'No analysis ID returned' };

    // ??? 2: ??????? GET /urls/{url_id} ? ??? ????? ???????????? ?????????? (??????)
    try {
      const urlId = btoa(url).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const cached = await vtGetUrlReport(urlId);
      const parsed = parseVtAttrs(cached?.data?.attributes);
      if (parsed) return parsed;
    } catch(_) {}

    // ??? 3: polling /analyses/{id} ? ??? ???? ?????? ??????????? (?? 20s)
    onProgress && onProgress(0);
    const result = await vtPollAnalysis(analysisId, onProgress);
    const parsed = parseVtAttrs(result?.data?.attributes);
    if (parsed) return parsed;

    return { status: 'error', detail: 'Scan timed out — try opening the Full report link' };
  } catch(e) {
    return { status: 'error', detail: e.message || 'VirusTotal request failed' };
  }
}

// -- MetaMask eth-phishing-detect --------------------------------------
const PHISHING_DB_URL = 'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json';
let _phishingDB = null;

async function fetchPhishingDB() {
  if (_phishingDB) return _phishingDB;
  try {
    const res = await fetch(PHISHING_DB_URL);
    _phishingDB = await res.json();
  } catch(_) { _phishingDB = { blacklist: [], fuzzylist: [], whitelist: [], tolerance: 1 }; }
  return _phishingDB;
}

function checkPhishingDB(hostname) {
  const db = _phishingDB;
  if (!db || !db.blacklist?.length) return null;

  if (db.whitelist?.some(d => hostname === d || hostname.endsWith('.' + d))) return null;

  if (db.blacklist.some(d => hostname === d || hostname.endsWith('.' + d)))
    return { risk: 'high', reason: 'Domain on community phishing blocklist', source: 'metamask' };

  const nameOnly = hostname.split('.').slice(0, -1).join('.');
  const tol = db.tolerance ?? 1;
  for (const legit of db.fuzzylist || []) {
    const legitName = legit.split('.').slice(0, -1).join('.') || legit;
    if (levenshtein(nameOnly, legitName) <= tol)
      return { risk: 'high', reason: 'Typosquatting "{legit}" (edit distance {dist})', reasonVars: { legit, dist: levenshtein(nameOnly, legitName) }, source: 'metamask' };
  }

  return null;
}

// -- TRON-specific heuristics ------------------------------------------
const LEGIT_DOMAINS = new Set([
  'tron.network', 'tronscan.org', 'tronscan.io', 'trongrid.io',
  'sun.io', 'just.network', 'justlend.org', 'sunswap.com',
  'poloniex.com', 'htx.com', 'huobi.com', 'binance.com',
  'coinbase.com', 'okx.com', 'bybit.com', 'kucoin.com',
  'gate.io', 'crypto.com', 'trx.market', 'nile.trongrid.io',
]);

const PHISH_KEYWORDS = [
  { pattern: /tron.*(airdrop|claim|bonus|free|gift|reward|giveaway)/i, risk: 'high', reason: 'Fake TRON airdrop / giveaway' },
  { pattern: /(airdrop|claim|bonus|free|gift|reward|giveaway).*tron/i, risk: 'high', reason: 'Fake TRON airdrop / giveaway' },
  { pattern: /tr[o0]n.*wallet/i,                                        risk: 'high', reason: 'Fake TRON wallet site' },
  { pattern: /trx.*(airdrop|claim|bonus|free|gift)/i,                   risk: 'high', reason: 'Fake TRX airdrop' },
  { pattern: /(airdrop|claim).*trx/i,                                   risk: 'high', reason: 'Fake TRX airdrop' },
  { pattern: /usdt.*(claim|airdrop|bonus|free)/i,                       risk: 'high', reason: 'Fake USDT claim' },
  { pattern: /tronlink.*(official|secure|verify|support|download)/i,    risk: 'high', reason: 'Fake TronLink site' },
  { pattern: /tronscan.*(official|secure|verify|login)/i,               risk: 'high', reason: 'Fake TronScan site' },
  { pattern: /connect.?wallet/i,                                        risk: 'high', reason: 'Wallet drainer — "connect wallet" lure' },
  { pattern: /wallet.?connect.*\.(top|xyz|click|live|vip|ink|cc|pw)/i, risk: 'high', reason: 'WalletConnect phishing on suspicious TLD' },
  { pattern: /crypto.*(recovery|recover|support|helpdesk)/i,            risk: 'high', reason: 'Crypto recovery scam' },
  { pattern: /(metamask|trustwallet|tronlink).*(support|help|official)/i, risk: 'high', reason: 'Fake wallet support site' },
  { pattern: /secure.*account.*verify/i,                                risk: 'med',  reason: 'Fake account verification' },
  { pattern: /verify.*account/i,                                        risk: 'med',  reason: 'Suspicious account verification flow' },
  { pattern: /tr[o0][mn]sc[a4]n/i,  risk: 'high', reason: 'Typosquatting TronScan (character substitution)' },
  { pattern: /tr[o0]nl[i1]nk/i,     risk: 'high', reason: 'Typosquatting TronLink (character substitution)' },
  { pattern: /tr[o0]ngr[i1]d/i,     risk: 'high', reason: 'Typosquatting TronGrid (character substitution)' },
  { pattern: /[^a-z]tron[^a-z.]/i,  risk: 'low',  reason: 'Contains "tron" — verify this is a legitimate domain' },
];

const SUSPICIOUS_TLDS = new Set([
  'xyz', 'top', 'click', 'live', 'vip', 'ink', 'cc', 'pw',
  'tk', 'ml', 'ga', 'cf', 'gq', 'work', 'date', 'racing', 'download',
  'win', 'loan', 'party', 'review', 'science', 'stream', 'trade',
  'accountant', 'cricket', 'faith', 'men', 'bid', 'webcam',
]);

const PATH_PATTERNS = [
  { pattern: /\/connect\//i,          risk: 'med',  reason: 'Path suggests wallet-connect flow' },
  { pattern: /\/(claim|airdrop)\//i,  risk: 'high', reason: 'Path suggests fake airdrop claim' },
  { pattern: /\/seed(-?phrase)?/i,    risk: 'high', reason: 'Path requests seed phrase — never enter yours anywhere' },
  { pattern: /\/mnemonic/i,           risk: 'high', reason: 'Path requests mnemonic — this is always a scam' },
  { pattern: /\/private(-?key)?/i,    risk: 'high', reason: 'Path requests private key — never share this' },
];

function getTld(hostname) {
  const parts = hostname.split('.');
  return parts[parts.length - 1];
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

const BRAND_TARGETS = ['tronscan', 'tronlink', 'trongrid', 'justlend', 'sunswap', 'binance', 'coinbase', 'metamask', 'trustwallet'];

function checkTyposquatting(hostname) {
  const nameOnly = hostname.split('.').slice(0, -1).join('.');
  return BRAND_TARGETS
    .map(brand => ({ brand, dist: levenshtein(nameOnly, brand) }))
    .filter(({ brand, dist }) => dist > 0 && dist <= 2 && nameOnly !== brand)
    .map(({ brand, dist }) => ({
      risk: 'high',
      reason: 'Typosquatting detected — very similar to "{brand}" (edit distance {dist})',
      reasonVars: { brand, dist },
      source: 'typosquat',
    }));
}

function runHeuristics(parsed) {
  const { hostname, full, path } = parsed;
  for (const legit of LEGIT_DOMAINS)
    if (hostname === legit || hostname.endsWith('.' + legit)) return [];

  const flags = [];
  for (const { pattern, risk, reason } of PHISH_KEYWORDS)
    if (pattern.test(hostname)) flags.push({ risk, reason, source: 'heuristic' });

  for (const { pattern, risk, reason } of PATH_PATTERNS)
    if (pattern.test(path)) flags.push({ risk, reason, source: 'heuristic' });

  const tld = getTld(hostname);
  if (SUSPICIOUS_TLDS.has(tld))
    flags.push({ risk: 'med', reason: 'Suspicious TLD ".{tld}" — commonly used for phishing sites', reasonVars: { tld }, source: 'heuristic' });

  flags.push(...checkTyposquatting(hostname));

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname))
    flags.push({ risk: 'high', reason: 'URL uses a raw IP address — unusual for legit crypto sites', source: 'heuristic' });

  const subCount = full.split('.').length - 2;
  if (subCount >= 3)
    flags.push({ risk: 'med', reason: 'Deep subdomain structure ({subCount} levels) — often used to hide real domain', reasonVars: { subCount }, source: 'heuristic' });

  if (hostname.length > 40)
    flags.push({ risk: 'med', reason: 'Unusually long domain name — phishing sites often use long random strings', source: 'heuristic' });

  return flags;
}

// -- Verdict helpers ---------------------------------------------------
function maxRisk(flags) {
  if (flags.some(f => f.risk === 'high')) return 'high';
  if (flags.some(f => f.risk === 'med'))  return 'med';
  if (flags.some(f => f.risk === 'low'))  return 'low';
  return 'none';
}

function phIcon(d, size) { return icSVG(d, size || 13); }

function phishActionBtn({ id, label, icon, href, variant }) {
  const cls = `wallet-action-btn${variant ? ` wallet-action-btn--${variant}` : ''}`;
  const inner = `${icSVG(icon, 14)}<span>${esc(t(label))}</span>`;
  if (href) return `<a class="${cls}" id="${id}" href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`;
  return `<button type="button" class="${cls}" id="${id}">${inner}</button>`;
}

function phishBlock(titleHtml, bodyHtml, meta = '') {
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

function phishKvRow(label, valueHtml, last) {
  return `<div class="kv-row${last ? ' kv-row--last' : ''}">
    <span class="kv-label">${kvLabel(label)}</span>
    <span class="kv-val">${valueHtml}</span>
  </div>`;
}

function phishPanel(titleHtml, rowsHtml, meta = '') {
  return phishBlock(titleHtml, `<div class="aml-kv-list">${rowsHtml}</div>`, meta);
}

function phishVerdictClass(cls) {
  if (cls === 'red') return 'is-red';
  if (cls === 'amber') return 'is-amber';
  return 'is-green';
}

function phishHeadCard(url, hostname, tagsHtml) {
  return `<div class="aml-head-card phish-head-card">
    <div class="wallet-head-top">
      <div class="wallet-head-addr phish-head-url">${esc(url)}</div>
      <div class="wallet-head-actions">
        ${phishActionBtn({ id: 'phish-copy-url-btn', label: 'Copy', icon: IC.copy })}
        ${phishActionBtn({ id: 'phish-open-url-btn', label: 'Open', icon: IC.external, href: url, variant: 'ext' })}
      </div>
    </div>
    ${tagsHtml ? `<div class="wallet-head-tags">${tagsHtml}</div>` : ''}
  </div>`;
}

function bindPhishActions(url) {
  document.getElementById('phish-copy-url-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('phish-copy-url-btn');
      if (!btn) return;
      btn.classList.add('is-copied');
      btn.innerHTML = `${icSVG(IC.check, 14)}<span>${t('Copied')}</span>`;
      setTimeout(() => {
        btn.classList.remove('is-copied');
        btn.innerHTML = `${icSVG(IC.copy, 14)}<span>${t('Copy')}</span>`;
      }, 2000);
    });
  });
}

function phishHeroStat(label, valueHtml, sub, cls) {
  const subHtml = sub ? `<div class="an-stat-sub">${typeof sub === 'string' && !sub.includes('<') ? esc(sub) : sub}</div>` : '';
  return `<div class="an-stat">
    <div class="an-stat-label">${t(label)}</div>
    <div class="an-stat-value ${cls || 'is-neutral'}">${valueHtml}</div>
    ${subHtml}
  </div>`;
}

function phishFlagRows(flags) {
  if (!flags.length) {
    return `<div class="aml-empty">${t('No suspicious patterns detected')}</div>`;
  }
  return `<div class="phish-flags">${flags.map(f => {
    const tier = f.risk === 'high' ? 'is-high' : f.risk === 'med' ? 'is-med' : 'is-low';
    const flagBadge = f.risk === 'high' ? badge('b-red', t('High')) : f.risk === 'med' ? badge('b-amber', t('Medium')) : badge('b-ghost', t('Low'));
    return `<div class="phish-flag ${tier}">
      <div class="phish-flag-body">
        <div class="phish-flag-reason">${esc(t(f.reason, f.reasonVars))}</div>
      </div>
      <div class="phish-flag-badge">${flagBadge}</div>
    </div>`;
  }).join('')}</div>`;
}

function mmStatusBadge(mmStatus) {
  switch (mmStatus) {
    case 'flagged':     return badge('b-red', t('Flagged'));
    case 'whitelisted': return badge('b-green', t('Whitelisted'));
    case 'clean':       return badge('b-green', t('Clean'));
    default:            return badge('b-ghost', t('Unavailable'));
  }
}

function overallVerdict(vtResult, hFlags) {
  const vtHit = vtResult.status === 'phishing';
  const vtSus = vtResult.status === 'suspicious';
  const hRisk = maxRisk(hFlags);

  const big = (d) => icSVG(d, 22);
  if (vtHit)             return { cls: 'red',   icon: big('M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10zM15 9l-6 6m0-6l6 6'), label: 'Confirmed phishing' };
  if (vtSus && hRisk === 'high') return { cls: 'red',   icon: big('M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zM12 9v4M12 17h.01'), label: 'High-risk — multiple sources flagged' };
  if (vtSus || hRisk === 'high') return { cls: 'red',   icon: big('M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01'), label: 'High-risk indicators' };
  if (hRisk === 'med')   return { cls: 'amber', icon: big('M13 2L3 14h9l-1 8 10-12h-9l1-8z'), label: 'Suspicious patterns' };
  if (hRisk === 'low')   return { cls: 'amber', icon: big('M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16v-4m0-4h.01'), label: 'Minor flags — verify manually' };
  return                        { cls: 'green', icon: big('M20 6L9 17l-5-5'), label: 'No threats detected' };
}

function vtStatusBadge(status) {
  switch(status) {
    case 'phishing':   return `<span class="badge b-red">${phIcon('M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10zM15 9l-6 6m0-6l6 6')} ${t('Malicious')}</span>`;
    case 'suspicious': return `<span class="badge b-amber">${phIcon('M13 2L3 14h9l-1 8 10-12h-9l1-8z')} ${t('Suspicious')}</span>`;
    case 'clean':      return `<span class="badge b-green">${phIcon('M20 6L9 17l-5-5')} ${t('Clean')}</span>`;
    case 'error':      return `<span class="badge b-amber">${phIcon('M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01')} ${t('Error')}</span>`;
    default:           return `<span class="badge b-ghost">? ${esc(status)}</span>`;
  }
}

// -- VT stats bar (legacy inline helper removed; hero grid used instead) --

// -- Main check --------------------------------------------------------
// -- Domain parser -----------------------------------------------------
function parseDomain(raw) {
  try {
    let s = raw.trim();
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (!host.includes('.')) return null;
    return {
      href:     u.href,
      hostname: host.replace(/^www\./, ''),
      full:     host,
      path:     u.pathname + u.search,
    };
  } catch(_) { return null; }
}

async function phishCheck() {
  const raw = phishInput.value.trim();
  setError(phishErr, '');
  phishEmpty.style.display = 'none';

  if (!raw) { flashInput(phishInput); showToast('Enter a URL'); return; }

  if (!window.tronsecVtConfigured()) {
    setError(phishErr, 'Phishing scan requires TRONSEC_PROXY.base in secrets.local.js (Cloudflare Worker with VIRUSTOTAL_API_KEY).');
    showToast('Configure Cloudflare Worker proxy — see workers/tronsec-api-proxy/README.md');
    return;
  }

  const parsed = parseDomain(raw);
  if (!parsed) {
    flashInput(phishInput);
    showToast('Enter a valid website URL (e.g. https://example.com).');
    return;
  }

  requireCaptcha(async () => {
    phishRes.innerHTML = SK.phishCheck();
    spinBtn(phishBtn, true);

    const steps = [
      'Loading blocklists?',
      'Waiting for scan engines?',
      'Engines scanning (this takes ~10s)?',
      'Still scanning?',
      'Almost done?',
    ];
    let stepIdx = 0;

    function showProgress(i) {
      if (i < 0) return;
      stepIdx = Math.min(i + 1, steps.length - 1);
      const el = document.getElementById('phish-skel-status');
      const text = el?.querySelector('.sk-status-text');
      if (text) text.textContent = `[ ${steps[stepIdx].toUpperCase()} ]`;
    }

    const [vtResult, hFlags, _db] = await Promise.all([
      checkVirusTotal(parsed.href, showProgress),
      Promise.resolve(runHeuristics(parsed)),
      fetchPhishingDB(),
    ]);

    const mmFlag = checkPhishingDB(parsed.hostname);
    if (mmFlag) hFlags.push(mmFlag);

    const mmStatus = (() => {
      if (!_phishingDB || !_phishingDB.blacklist) return 'unavailable';
      if (mmFlag) return 'flagged';
      if (_phishingDB.whitelist?.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) return 'whitelisted';
      return 'clean';
    })();

    const verdict = overallVerdict(vtResult, hFlags);
    const vCls = phishVerdictClass(verdict.cls);
    const stats = vtResult.stats || {};
    const mal = stats.malicious || 0;
    const sus = stats.suspicious || 0;
    const hrm = stats.harmless || 0;
    const total = vtResult.total || 0;
    const heurCount = hFlags.filter(f => f.source !== 'metamask').length;
    const vtScanLink = `https://www.virustotal.com/gui/url/${btoa(parsed.href).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}`;

    const headTags = [
      vtStatusBadge(vtResult.status),
      verdict.cls === 'red' ? badge('b-red', t('High risk')) :
      verdict.cls === 'amber' ? badge('b-amber', t('Review')) : badge('b-green', t('Clean')),
    ].join('');

    const heroHtml = `
      ${phishHeroStat('Verdict', `<span class="phish-verdict-inline">${verdict.icon}<span>${esc(t(verdict.label))}</span></span>`, vtResult.detail ? esc(vtResult.detail).slice(0, 80) : '', vCls)}
      ${phishHeroStat('Malicious', String(mal), total ? t('{total} engines', { total }) : t('scan engines'), mal > 0 ? 'is-red' : 'is-neutral')}
      ${phishHeroStat('Suspicious', String(sus), hrm ? t('{count} clean', { count: hrm }) : '', sus > 0 ? 'is-amber' : 'is-neutral')}
      ${phishHeroStat('Pattern flags', String(hFlags.length), heurCount ? t('{count} heuristic', { count: heurCount }) : t('none detected'), hFlags.length ? 'is-amber' : 'is-green')}`;

    let assessmentHtml;
    if (verdict.cls === 'red') {
      assessmentHtml = amlAlertInline('red', t('High risk — do not connect a wallet or enter credentials on this site.'));
    } else if (verdict.cls === 'amber') {
      assessmentHtml = amlAlertInline('amber', t('Review recommended — suspicious patterns detected. Verify the domain before interacting.'));
    } else {
      assessmentHtml = amlAlertInline('green', t('No threats detected — no major flags from scan engines or pattern checks.'));
    }

    const sourcesHtml = phishPanel('Sources checked', `
      ${phishKvRow(tt('scanEngines'), vtStatusBadge(vtResult.status))}
      ${phishKvRow(tt('communityBlocklist'), mmStatusBadge(mmStatus))}
      ${phishKvRow(tt('heuristics'), `<span class="badge ${heurCount ? 'b-amber' : 'b-green'}">${t(heurCount === 1 ? '{count} flag' : '{count} flags', { count: heurCount })}</span>`, true)}
    `);

    const domainHtml = phishPanel('Domain info', `
      ${phishKvRow('Domain', `<span class="mono">${esc(parsed.hostname)}</span>`)}
      ${phishKvRow('Protocol', parsed.href.startsWith('https') ? '<span class="is-green">HTTPS</span>' : '<span class="is-red">HTTP</span>')}
      ${phishKvRow('TLD', `.${esc(getTld(parsed.hostname))}${SUSPICIOUS_TLDS.has(getTld(parsed.hostname)) ? ` <span class="badge b-amber">${t('risky')}</span>` : ''}`)}
      ${phishKvRow('Subdomains', (() => { const c = parsed.full.split('.').length - 2; return c === 0 ? t('None') : t(c === 1 ? '{count} level' : '{count} levels', { count: c }); })())}
      ${phishKvRow('Domain length', t('{length} chars', { length: parsed.hostname.length }))}
      ${phishKvRow('Full report', `<a class="a-link a-link-inline" href="${esc(vtScanLink)}" target="_blank" rel="noopener"><span>${t('View scan report')}</span>${icSVG(IC.link, 9)}</a>`, true)}
    `);

    phishRes.innerHTML = `
      <div class="phish-scan">
        ${phishHeadCard(parsed.href, parsed.hostname, headTags)}
        <div class="an-stat-grid an-stat-grid--4 phish-hero-grid">${heroHtml}</div>
        <div class="phish-assessment">${assessmentHtml}</div>
        <div class="aml-grid-2">
          ${phishBlock('Pattern flags', phishFlagRows(hFlags), `${hFlags.length} total`)}
          ${sourcesHtml}
        </div>
        ${domainHtml}
        ${verdict.cls !== 'green' ? amlAlertInline('red', `<strong>${t('Safety reminder:')}</strong> ${t('Never enter your seed phrase, private key, or approve wallet connections on unfamiliar sites.')}`) : ''}
        <p class="aml-disclaimer">${t('Automated URL screening — always verify official domains manually before signing transactions.')}</p>
      </div>`;

    bindPhishActions(parsed.href);
    spinBtn(phishBtn, false);
  });
}
