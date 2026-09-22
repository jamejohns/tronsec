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

