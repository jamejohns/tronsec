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
  const raw = pattern.trim();
  if (!raw) return 0;
  const slots = TRON_ADDR_LEN - raw.length + 1;
  return slots * Math.pow(58, -raw.length);
}

function vanityIsBothMode(mode) {
  return (mode || vanityGetMode()) === 'both';
}

function vanityBothProbability(prefix, suffix) {
  const rawPrefix = String(prefix || '').trim();
  const rawSuffix = String(suffix || '').trim();
  if (!rawPrefix || !rawSuffix) return 0;
  const effPrefix = vanityEffectivePrefix(rawPrefix);
  if (effPrefix.length + rawSuffix.length > TRON_ADDR_LEN) return 0;
  const pPref = vanityPrefixProbability(effPrefix);
  const pSuf = vanitySuffixProbability(rawSuffix);
  if (pPref <= 0 || pSuf <= 0) return 0;
  return pPref * pSuf;
}

function vanityCollectInput() {
  const mode = vanityGetMode();
  if (vanityIsBothMode(mode)) {
    const prefix = vanityPrefixPatternInput?.value.trim() || '';
    const suffix = vanitySuffixPatternInput?.value.trim() || '';
    const invalid = [...new Set([...vanityInvalidChars(prefix), ...vanityInvalidChars(suffix)])];
    const effPrefix = prefix ? vanityEffectivePrefix(prefix) : '';
    const hasBoth = !!prefix && !!suffix;
    const tooLong = prefix.length > VANITY_MAX_BOTH_PART || suffix.length > VANITY_MAX_BOTH_PART;
    const overlap = hasBoth && effPrefix.length + suffix.length > TRON_ADDR_LEN;
    const probability = vanityBothProbability(prefix, suffix);
    const infeasible = hasBoth && !invalid.length && (overlap || probability <= 0);
    return {
      mode, prefix, suffix, effPrefix, trimmed: hasBoth ? `${prefix}+${suffix}` : prefix || suffix,
      invalid, infeasible, tooLong, hasBoth, overlap, probability, ready: hasBoth && !invalid.length && !infeasible && !tooLong,
    };
  }

  const single = vanityPatternInput?.value.trim() || '';
  const invalid = vanityInvalidChars(single);
  const probability = single ? vanityPatternProbability(single, mode) : 0;
  const infeasible = !!single && !invalid.length && probability <= 0;
  return {
    mode, single, trimmed: single, invalid, infeasible,
    tooLong: single.length > VANITY_MAX_PATTERN,
    hasBoth: !!single, probability, ready: !!single && !invalid.length && !infeasible && single.length <= VANITY_MAX_PATTERN,
  };
}

function vanityPatternProbability(pattern, mode, opts = {}) {
  const raw = String(pattern || '').trim();
  if (!raw) return 0;
  if (mode === 'both') return vanityBothProbability(opts.prefix ?? '', opts.suffix ?? '');
  if (mode === 'prefix') return vanityPrefixProbability(vanityEffectivePrefix(raw));
  if (mode === 'suffix') return vanitySuffixProbability(raw);
  return vanityContainsProbability(raw);
}

function vanityPatternFeasible(pattern, mode, opts = {}) {
  return vanityPatternProbability(pattern, mode, opts) > 0;
}

function vanityInfeasibleReason(input) {
  const state = typeof input === 'object' && input?.mode ? input : vanityCollectInput();
  const { mode, trimmed, prefix, suffix, effPrefix, overlap, invalid } = state;
  if (state.ready || !trimmed) return '';
  if (invalid.length) return '';
  if (vanityIsBothMode(mode)) {
    if (overlap) return t('Prefix and suffix are too long combined (max 34 characters).');
    if (prefix && /^[1-8]/.test(prefix)) {
      return t('TRON addresses cannot use digits 1–8 right after T. Use letters for the prefix part.');
    }
    if (effPrefix && /^T[1-8]/.test(effPrefix)) {
      return t('TRON addresses cannot use digits 1–8 right after T. Use letters for the prefix part.');
    }
    return t('This prefix/suffix pair cannot exist on TRON.');
  }
  if (mode === 'prefix') {
    const eff = vanityEffectivePrefix(trimmed);
    if (/^T[1-8]/.test(eff) || /^[1-8]/.test(trimmed)) {
      return t('TRON addresses cannot use digits 1–8 right after T. Use suffix mode for number patterns.');
    }
  }
  return t('This pattern cannot exist on TRON. Try suffix or contains mode.');
}

function vanityEstimateAttempts(pattern, mode, opts = {}) {
  const raw = String(pattern || '').trim();
  if (mode === 'both') {
    const probability = vanityBothProbability(opts.prefix ?? '', opts.suffix ?? '');
    if (probability <= 0) return Infinity;
    return Math.max(1, Math.round(1 / probability));
  }
  if (!raw) return 1;
  const probability = vanityPatternProbability(raw, mode, opts);
  if (probability <= 0) return Infinity;
  return Math.max(1, Math.round(1 / probability));
}

function vanityEstimateEtaSeconds(pattern, mode, opts) {
  const attempts = vanityIsBothMode(mode)
    ? vanityEstimateAttempts('', mode, opts || {})
    : vanityEstimateAttempts(pattern, mode, opts);
  if (!Number.isFinite(attempts)) return Infinity;
  return attempts / Math.max(vanityExpectedRate(), 500);
}

function vanityDifficultyInfo(state) {
  const input = typeof state === 'object' && state?.mode ? state : vanityCollectInput();
  const { mode, trimmed, prefix, suffix } = input;
  const len = vanityIsBothMode(mode) ? (prefix?.length || 0) + (suffix?.length || 0) : trimmed.length;
  if (!len) return { key: '', label: '—', cls: 'b-ghost', eta: '', attempts: 0 };
  if (!input.ready && input.hasBoth) {
    if (input.infeasible || input.overlap) {
      return { key: 'impossible', label: t('Impossible'), cls: 'b-red', eta: '—', attempts: Infinity };
    }
  }
  if (!vanityIsBothMode(mode) && trimmed && input.infeasible) {
    return { key: 'impossible', label: t('Impossible'), cls: 'b-red', eta: '—', attempts: Infinity };
  }
  const attempts = vanityIsBothMode(mode)
    ? vanityEstimateAttempts('', mode, { prefix, suffix })
    : vanityEstimateAttempts(trimmed, mode);
  const eta = vanityFormatEta(
    vanityEstimateEtaSeconds(trimmed, mode, vanityIsBothMode(mode) ? { prefix, suffix } : undefined));

  if (vanityIsBothMode(mode)) {
    if (attempts < 100000) return { key: 'fast', label: t('Fast'), cls: 'b-green', eta, attempts };
    if (attempts < 5000000) return { key: 'medium', label: t('Medium'), cls: 'b-amber', eta, attempts };
    if (attempts < 1e9) return { key: 'hard', label: t('Hard'), cls: 'b-red', eta, attempts };
    return { key: 'extreme', label: t('Extreme'), cls: 'b-red', eta, attempts };
  }

  if (len <= 2) return { key: 'instant', label: t('Instant'), cls: 'b-green', eta, attempts };
  if (len === 3) return { key: 'fast', label: t('Fast'), cls: 'b-green', eta, attempts };
  if (len === 4) return { key: 'easy', label: t('Easy'), cls: 'b-amber', eta, attempts };
  if (len === 5) return { key: 'medium', label: t('Medium'), cls: 'b-amber', eta, attempts };
  if (len === 6) return { key: 'hard', label: t('Hard'), cls: 'b-red', eta, attempts };
  return { key: 'extreme', label: t('Extreme'), cls: 'b-red', eta, attempts };
}

function vanityFormatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m`;
  if (seconds < 86400) return `~${(seconds / 3600).toFixed(1)}h`;
  return `~${(seconds / 86400).toFixed(1)}d`;
}

function vanitySearchRate(elapsed) {
  const baseline = vanityExpectedRate();
  if (vanityTotalAttempts < 500 || elapsed < 2) return baseline;
  const measured = vanityTotalAttempts / elapsed;
  vanitySmoothedRate = vanitySmoothedRate
    ? vanitySmoothedRate * 0.75 + measured * 0.25
    : measured;
  return Math.max(vanitySmoothedRate, baseline * 0.5);
}

function vanityFormatRate(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M/s`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K/s`;
  return `${Math.round(n)}/s`;
}

/** Bar fill — asymptotic, never reaches 100% until a match is found. */
function vanityProgressPercent(attempts, estTotal) {
  if (!Number.isFinite(estTotal) || estTotal <= 0) return 0;
  const ratio = attempts / estTotal;
  return Math.min(88, 88 * (1 - Math.exp(-ratio)));
}

/** Memoryless search: expected remaining time does not shrink with attempts. */
function vanityEtaRemaining(estTotal, rate) {
  if (!Number.isFinite(estTotal) || estTotal <= 0 || rate <= 0) return Infinity;
  return estTotal / rate;
}

function vanityGetMode() {
  const active = vanityModeGroup?.querySelector('.vanity-mode-btn.is-active');
  return active?.dataset.mode || 'suffix';
}

function vanitySetMode(mode) {
  vanityModeGroup?.querySelectorAll('.vanity-mode-btn').forEach((btn) => {
    const on = btn.dataset.mode === mode;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    btn.setAttribute('tabindex', on ? '0' : '-1');
  });
  vanitySyncInputLayout(mode);
  vanityUpdateFormState();
}

function vanitySyncInputLayout(mode) {
  const both = vanityIsBothMode(mode);
  vanitySingleInput?.classList.toggle('hidden', both);
  vanityDualInput?.classList.toggle('hidden', !both);
  vanityPresetsWrap?.classList.toggle('hidden', both);
  vanityPresetsBothWrap?.classList.toggle('hidden', !both);
  vanityPresets?.classList.toggle('hidden', both);
  vanityPresetsBoth?.classList.toggle('hidden', !both);
  document.querySelector('#tab-vanity .vanity-search-bar')?.classList.toggle('is-dual', both);
  if (window.lucide) lucide.createIcons();
  if (!vanityRunning) {
    if (both) vanityPrefixPatternInput?.focus();
    else if (
      document.activeElement === vanityPrefixPatternInput
      || document.activeElement === vanitySuffixPatternInput
    ) {
      vanityPatternInput?.focus();
    }
  }
}

function vanityModeCaption(state) {
  const input = typeof state === 'object' && state?.mode ? state : vanityCollectInput();
  const { mode, trimmed, prefix, suffix, invalid, effPrefix } = input;
  if (!trimmed) {
    return vanityIsBothMode(mode)
      ? t('Enter prefix and suffix to preview your address')
      : t('Enter a pattern to preview your address');
  }
  if (invalid.length) return t('Remove invalid characters to continue');
  if (input.infeasible) return vanityInfeasibleReason(input);
  if (mode === 'both') {
    return t('Address will start with {prefix}… and end with …{suffix}', {
      prefix: effPrefix || vanityEffectivePrefix(prefix),
      suffix,
    });
  }
  if (mode === 'suffix') return t('Address will end with …{pattern}', { pattern: trimmed });
  if (mode === 'prefix') {
    const eff = vanityEffectivePrefix(trimmed);
    return t('Address will start with {pattern}…', { pattern: eff });
  }
  return t('Address will contain …{pattern}…', { pattern: trimmed });
}

function vanityPreviewDots(n) {
  return '·'.repeat(Math.max(0, n));
}

function vanityMarkPattern(raw) {
  let html = '';
  for (const ch of raw) {
    const bad = !VANITY_BASE58.includes(ch);
    html += bad
      ? `<span class="vanity-preview-match vanity-preview-invalid">${esc(ch)}</span>`
      : `<span class="vanity-preview-match">${esc(ch)}</span>`;
  }
  return html;
}

function vanityBuildPreview(state) {
  const input = typeof state === 'object' && state?.mode ? state : vanityCollectInput();
  const { mode, trimmed, prefix, suffix, effPrefix } = input;
  const len = VANITY_PREVIEW_LEN;
  if (!trimmed) {
    return `<span class="vanity-preview-base">T</span><span class="vanity-preview-fade">${vanityPreviewDots(len - 1)}</span>`;
  }

  if (mode === 'both') {
    const eff = effPrefix || vanityEffectivePrefix(prefix);
    const pad = Math.max(0, len - eff.length - suffix.length);
    const prefixHtml = prefix.startsWith('T')
      ? vanityMarkPattern(eff)
      : `<span class="vanity-preview-base">T</span>${vanityMarkPattern(prefix)}`;
    return `${prefixHtml}<span class="vanity-preview-fade">${vanityPreviewDots(pad)}</span>${vanityMarkPattern(suffix)}`;
  }
  const raw = trimmed;
  if (mode === 'suffix') {
    const pad = Math.max(0, len - 1 - raw.length);
    return `<span class="vanity-preview-base">T</span><span class="vanity-preview-fade">${vanityPreviewDots(pad)}</span>${vanityMarkPattern(raw)}`;
  }
  if (mode === 'prefix') {
    const eff = vanityEffectivePrefix(raw);
    const pad = Math.max(0, len - eff.length);
    if (raw.startsWith('T')) {
      return `${vanityMarkPattern(eff)}<span class="vanity-preview-fade">${vanityPreviewDots(pad)}</span>`;
    }
    return `<span class="vanity-preview-base">T</span>${vanityMarkPattern(raw)}<span class="vanity-preview-fade">${vanityPreviewDots(pad)}</span>`;
  }
  const idx = Math.max(1, Math.floor((len - raw.length) / 2));
  const padR = Math.max(0, len - idx - raw.length);
  return `<span class="vanity-preview-base">T</span><span class="vanity-preview-fade">${vanityPreviewDots(Math.max(0, idx - 1))}</span>${vanityMarkPattern(raw)}<span class="vanity-preview-fade">${vanityPreviewDots(padR)}</span>`;
}

function vanityHighlightAddress(address, pattern, mode, opts = {}) {
  const caseSensitive = !!vanityCaseSensitive?.checked;
  const a = caseSensitive ? address : address.toLowerCase();

