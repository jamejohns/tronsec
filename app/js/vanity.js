// ==================================
//  VANITY ADDRESS GENERATOR
// ==================================

const VANITY_BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const VANITY_MAX_PATTERN = 7;
const VANITY_MAX_BOTH_PART = 4;
const VANITY_PREFS_KEY = 'TRONSEC_vanity_prefs';
const VANITY_DEFAULT_MODE = 'suffix';
const VANITY_DEFAULT_PATTERN = 'TRX';
const VANITY_DEFAULT_PREFIX = 'T';
const VANITY_DEFAULT_SUFFIX = 'RX';
const VANITY_PREVIEW_LEN = 16;
const TRON_ADDR_LEN = 34;
const TRON_MIN_N = 65n * (256n ** 24n);
const TRON_MAX_N = 66n * (256n ** 24n) - 1n;
const TRON_ADDR_SPACE = TRON_MAX_N - TRON_MIN_N + 1n;

const vanityFlow = document.getElementById('vanity-flow');
const vanityCompose = document.getElementById('vanity-compose');
const vanityPatternInput = document.getElementById('vanity-pattern');
const vanityPrefixPatternInput = document.getElementById('vanity-prefix-pattern');
const vanitySuffixPatternInput = document.getElementById('vanity-suffix-pattern');
const vanitySingleInput = document.getElementById('vanity-single-input');
const vanityDualInput = document.getElementById('vanity-dual-input');
const vanityStartBtn = document.getElementById('vanity-start-btn');
const vanityErr = document.getElementById('vanity-err');
const vanityResult = document.getElementById('vanity-result');
const vanityProgress = document.getElementById('vanity-progress');
const vanityModeGroup = document.getElementById('vanity-mode-group');
const vanityCaseSensitive = document.getElementById('vanity-case-sensitive');
const vanityDifficulty = document.getElementById('vanity-difficulty');
const vanityStatusText = document.getElementById('vanity-status-text');
const vanityHeroCaption = document.getElementById('vanity-hero-caption');
const vanityPreviewAddr = document.getElementById('vanity-preview-addr');
const vanityPreview = document.getElementById('vanity-preview');
const vanityInputWrap = document.getElementById('vanity-input-wrap');
const vanityPresets = document.getElementById('vanity-presets');
const vanityPresetsWrap = document.getElementById('vanity-presets-wrap');
const vanityPresetsBoth = document.getElementById('vanity-presets-both');
const vanityPresetsBothWrap = document.getElementById('vanity-presets-both-wrap');
const vanityCharCount = document.getElementById('vanity-char-count');
const vanityCaseToggle = document.getElementById('vanity-case-toggle');
const vanityMetaBar = document.getElementById('vanity-meta-bar');

let vanityLastInvalidToast = '';
let vanityLastInfeasibleToast = '';
const VANITY_RATE_KEY = 'TRONSEC_vanity_rate';
const VANITY_RATE_PER_WORKER = 9000;

let vanityWorkers = [];
let vanityRunning = false;
let vanityTotalAttempts = 0;
let vanityStartedAt = 0;
let vanityProgressTimer = null;
let vanityFound = false;
let vanityActiveWorkers = 0;
let vanityLastMode = 'suffix';
let vanityLastPattern = '';
let vanityLastPatternDesc = '';
let vanityLastPrefix = '';
let vanityLastSuffix = '';
let vanityProgressReady = false;
let vanitySmoothedRate = 0;
let vanityWorkerBlobUrl = null;
let vanityWorkerBlobPromise = null;
function vanityWorkerCount() {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.min(12, Math.max(2, cores));
}

function vanityExpectedRate() {
  try {
    const saved = parseFloat(sessionStorage.getItem(VANITY_RATE_KEY));
    if (Number.isFinite(saved) && saved > 800) return saved;
  } catch (_) { /* ignore */ }
  return vanityWorkerCount() * VANITY_RATE_PER_WORKER;
}

function vanityRecordMeasuredRate() {
  const elapsed = (Date.now() - vanityStartedAt) / 1000;
  if (elapsed < 3 || vanityTotalAttempts < vanityExpectedRate()) return;
  const measured = vanityTotalAttempts / elapsed;
  try {
    const prev = parseFloat(sessionStorage.getItem(VANITY_RATE_KEY));
    const next = Number.isFinite(prev) && prev > 800
      ? Math.round(prev * 0.35 + measured * 0.65)
      : Math.round(measured);
    sessionStorage.setItem(VANITY_RATE_KEY, String(next));
  } catch (_) { /* ignore */ }
}

function vanityEffectivePrefix(pattern) {
  const raw = pattern.trim();
  if (!raw) return '';
  return raw.startsWith('T') ? raw : `T${raw}`;
}

function vanityInvalidChars(pattern) {
  const bad = [];
  for (const ch of pattern) {
    if (!VANITY_BASE58.includes(ch) && !bad.includes(ch)) bad.push(ch);
  }
  return bad;
}

function vanityBase58Index(ch) {
  return VANITY_BASE58.indexOf(ch);
}

function vanityRangeOverlap(lo1, hi1, lo2, hi2) {
  const lo = lo1 > lo2 ? lo1 : lo2;
  const hi = hi1 < hi2 ? hi1 : hi2;
  return lo <= hi ? [lo, hi] : null;
}

function vanityPrefixRange(prefix) {
  const digits = [...prefix].map(vanityBase58Index);
  if (digits.some((d) => d < 0)) return null;
  let head = 0n;
  for (const d of digits) head = head * 58n + BigInt(d);
  const tailPow = 58n ** BigInt(TRON_ADDR_LEN - prefix.length);
  return [head * tailPow, (head + 1n) * tailPow - 1n];
}

function vanityPrefixProbability(prefix) {
  const range = vanityPrefixRange(prefix);
  if (!range) return 0;
  const inter = vanityRangeOverlap(range[0], range[1], TRON_MIN_N, TRON_MAX_N);
  if (!inter) return 0;
  return Number(inter[1] - inter[0] + 1n) / Number(TRON_ADDR_SPACE);
}

function vanitySuffixProbability(suffix) {
  const digits = [...suffix].map(vanityBase58Index);
  if (digits.some((d) => d < 0)) return 0;
  const pow = 58n ** BigInt(suffix.length);
  let tailVal = 0n;
  for (const d of digits) tailVal = tailVal * 58n + BigInt(d);
  let first = TRON_MIN_N - (TRON_MIN_N % pow) + tailVal;
  if (first < TRON_MIN_N) first += pow;
  if (first > TRON_MAX_N) return 0;
  const count = (TRON_MAX_N - first) / pow + 1n;
  return Number(count) / Number(TRON_ADDR_SPACE);
}

function vanityContainsProbability(pattern) {
