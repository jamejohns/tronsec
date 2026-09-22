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

let phishLastUrl = '';
let phishFromCache = false;

const PHISH_CACHE_TTL = 12 * 60 * 1000;

function readPhishSessionCache(url) {
  return readSessionCache('phish', url, {
    ttl: PHISH_CACHE_TTL,
    validate: (p) => p.url === url && (p.payload || p.html),
    allowHtml: true,
  });
}

function writePhishSessionCache(snapshot) {
  if (!snapshot?.url) return;
  const { html, ...rest } = snapshot;
  writeSessionCache('phish', snapshot.url, rest);
}

function clearPhishSessionCache(url) {
  clearSessionCache('phish', url);
}

phishInput.addEventListener('keydown', e => { if (e.key === 'Enter') phishCheck(); });
phishBtn.addEventListener('click', () => phishCheck());

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
