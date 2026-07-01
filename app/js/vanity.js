// ==================================
//  VANITY ADDRESS GENERATOR
// ==================================

const VANITY_BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const VANITY_MAX_PATTERN = 7;
const VANITY_MAX_BOTH_PART = 4;
const VANITY_PREFS_KEY = 'TRONSEC_vanity_prefs';
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
const vanityEmpty = document.getElementById('vanity-empty');
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
const vanityPresetsBoth = document.getElementById('vanity-presets-both');
const vanityCharCount = document.getElementById('vanity-char-count');
const vanityMetaTag2 = document.getElementById('vanity-meta-tag-2');
const vanityCaseToggle = document.getElementById('vanity-case-toggle');
const vanityMetaBar = document.getElementById('vanity-meta-bar');
const vanityMetaIdle = document.getElementById('vanity-meta-idle');

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
  if (!len) return { label: '—', cls: 'b-ghost', eta: '', attempts: 0 };
  if (!input.ready && input.hasBoth) {
    if (input.infeasible || input.overlap) {
      return { label: t('Impossible'), cls: 'b-red', eta: '—', attempts: Infinity };
    }
  }
  if (!vanityIsBothMode(mode) && trimmed && input.infeasible) {
    return { label: t('Impossible'), cls: 'b-red', eta: '—', attempts: Infinity };
  }
  const attempts = vanityIsBothMode(mode)
    ? vanityEstimateAttempts('', mode, { prefix, suffix })
    : vanityEstimateAttempts(trimmed, mode);
  const eta = vanityFormatEta(
    vanityEstimateEtaSeconds(trimmed, mode, vanityIsBothMode(mode) ? { prefix, suffix } : undefined),
  );

  if (vanityIsBothMode(mode)) {
    if (attempts < 100000) return { label: t('Fast'), cls: 'b-green', eta, attempts };
    if (attempts < 5000000) return { label: t('Medium'), cls: 'b-amber', eta, attempts };
    if (attempts < 1e9) return { label: t('Hard'), cls: 'b-red', eta, attempts };
    return { label: t('Extreme'), cls: 'b-red', eta, attempts };
  }

  if (len <= 2) return { label: t('Instant'), cls: 'b-green', eta, attempts };
  if (len === 3) return { label: t('Fast'), cls: 'b-green', eta, attempts };
  if (len === 4) return { label: t('Easy'), cls: 'b-amber', eta, attempts };
  if (len === 5) return { label: t('Medium'), cls: 'b-amber', eta, attempts };
  if (len === 6) return { label: t('Hard'), cls: 'b-red', eta, attempts };
  return { label: t('Extreme'), cls: 'b-red', eta, attempts };
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
  });
  vanitySyncInputLayout(mode);
  vanityUpdateFormState();
}

function vanitySyncInputLayout(mode) {
  const both = vanityIsBothMode(mode);
  vanitySingleInput?.classList.toggle('hidden', both);
  vanityDualInput?.classList.toggle('hidden', !both);
  vanityPresets?.classList.toggle('hidden', both);
  vanityPresetsBoth?.classList.toggle('hidden', !both);
  document.querySelector('#tab-vanity .vanity-search-bar')?.classList.toggle('is-dual', both);
  vanitySyncMetaIdle(mode);
  if (vanityMetaTag2) {
    vanityMetaTag2.textContent = both ? t('4+4 max') : `Max ${VANITY_MAX_PATTERN}`;
  }
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

function vanitySyncMetaIdle(mode) {
  if (!vanityMetaIdle || vanityPatternInput?.value.trim() || vanityPrefixPatternInput?.value.trim()) return;
  if (vanityMetaTag2) {
    vanityMetaTag2.textContent = vanityIsBothMode(mode) ? t('4+4 max') : `Max ${VANITY_MAX_PATTERN}`;
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

  if (mode === 'both') {
    const prefix = opts.prefix ?? '';
    const suffix = opts.suffix ?? '';
    const eff = vanityEffectivePrefix(prefix);
    const p = caseSensitive ? eff : eff.toLowerCase();
    const s = caseSensitive ? suffix : suffix.toLowerCase();
    if (!a.startsWith(p) || !a.endsWith(s)) return esc(address);
    const pre = esc(address.slice(0, eff.length));
    const mid = esc(address.slice(eff.length, address.length - suffix.length));
    const suf = esc(address.slice(address.length - suffix.length));
    return `<mark class="vanity-match">${pre}</mark>${mid}<mark class="vanity-match">${suf}</mark>`;
  }

  const raw = pattern.trim();
  if (!raw) return esc(address);

  let start = 0;
  let len = raw.length;

  if (mode === 'suffix') {
    start = address.length - raw.length;
  } else if (mode === 'prefix') {
    const eff = vanityEffectivePrefix(raw);
    len = eff.length;
    const p = caseSensitive ? eff : eff.toLowerCase();
    if (!a.startsWith(p)) start = 0;
    else start = 0;
  } else {
    const p = caseSensitive ? raw : raw.toLowerCase();
    const idx = a.indexOf(p);
    start = idx >= 0 ? idx : 0;
  }

  const before = esc(address.slice(0, start));
  const match = esc(address.slice(start, start + len));
  const after = esc(address.slice(start + len));
  return `${before}<mark class="vanity-match">${match}</mark>${after}`;
}

function vanitySavePrefs() {
  try {
    localStorage.setItem(VANITY_PREFS_KEY, JSON.stringify({
      pattern: vanityPatternInput?.value || '',
      prefix: vanityPrefixPatternInput?.value || '',
      suffix: vanitySuffixPatternInput?.value || '',
      mode: vanityGetMode(),
      caseSensitive: !!vanityCaseSensitive?.checked,
    }));
  } catch (_) { /* ignore */ }
}

function vanityLoadPrefs() {
  try {
    const raw = localStorage.getItem(VANITY_PREFS_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (prefs.pattern && vanityPatternInput) {
      const cleaned = [...prefs.pattern.trim()].filter((ch) => VANITY_BASE58.includes(ch)).join('');
      vanityPatternInput.value = cleaned.slice(0, VANITY_MAX_PATTERN);
    }
    if (prefs.prefix && vanityPrefixPatternInput) {
      const cleaned = [...prefs.prefix.trim()].filter((ch) => VANITY_BASE58.includes(ch)).join('');
      vanityPrefixPatternInput.value = cleaned.slice(0, VANITY_MAX_BOTH_PART);
    }
    if (prefs.suffix && vanitySuffixPatternInput) {
      const cleaned = [...prefs.suffix.trim()].filter((ch) => VANITY_BASE58.includes(ch)).join('');
      vanitySuffixPatternInput.value = cleaned.slice(0, VANITY_MAX_BOTH_PART);
    }
    if (prefs.mode) vanitySetMode(prefs.mode);
    if (vanityCaseSensitive && typeof prefs.caseSensitive === 'boolean') {
      vanityCaseSensitive.checked = prefs.caseSensitive;
    }
  } catch (_) { /* ignore */ }
}

function vanitySetGenerateEnabled(enabled) {
  if (!vanityStartBtn) return;
  vanityStartBtn.disabled = !enabled;
  vanityStartBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  vanityStartBtn.classList.toggle('is-disabled', !enabled);
}

function vanitySyncCaseToggle() {
  const on = !!vanityCaseSensitive?.checked;
  vanityCaseToggle?.classList.toggle('is-active', on);
  vanityCaseToggle?.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function vanityUpdateFormState() {
  const input = vanityCollectInput();
  const { mode, trimmed, invalid, infeasible, tooLong, ready, prefix, suffix } = input;
  const diff = vanityDifficultyInfo(input);

  if (vanityPreviewAddr) vanityPreviewAddr.innerHTML = vanityBuildPreview(input);
  if (vanityHeroCaption) vanityHeroCaption.textContent = vanityModeCaption(input);
  if (vanityPreview) {
    vanityPreview.classList.toggle('is-invalid', invalid.length > 0 || infeasible || tooLong);
    vanityPreview.classList.toggle('is-ready', ready);
  }
  if (vanityInputWrap) vanityInputWrap.classList.toggle('is-invalid', invalid.length > 0 || infeasible || tooLong);
  document.getElementById('vanity-prefix-wrap')?.classList.toggle('is-invalid', invalid.length > 0 || infeasible || tooLong);
  document.getElementById('vanity-suffix-wrap')?.classList.toggle('is-invalid', invalid.length > 0 || infeasible || tooLong);
  vanityMetaBar?.classList.toggle('has-pattern', ready);

  if (invalid.length) {
    const toastKey = invalid.join('');
    if (toastKey !== vanityLastInvalidToast) {
      vanityLastInvalidToast = toastKey;
      showToast(t('Invalid Base58 characters: {chars}', { chars: invalid.join(' ') }));
    }
  } else {
    vanityLastInvalidToast = '';
  }

  if (infeasible || tooLong) {
    const toastKey = tooLong ? `long:${mode}:${trimmed}` : `${mode}:${trimmed}`;
    if (toastKey !== vanityLastInfeasibleToast) {
      vanityLastInfeasibleToast = toastKey;
      if (tooLong) {
        showToast(t('Each part max {n} characters in prefix+suffix mode.', { n: VANITY_MAX_BOTH_PART }));
      } else {
        showToast(vanityInfeasibleReason(input));
      }
    }
  } else {
    vanityLastInfeasibleToast = '';
  }

  if (vanityMetaIdle) vanityMetaIdle.classList.toggle('hidden', !!trimmed);
  if (vanityStatusText) {
    vanityStatusText.classList.toggle('hidden', !ready);
    if (ready) {
      const lenText = vanityIsBothMode(mode)
        ? `${prefix.length}+${suffix.length}`
        : `${trimmed.length}/${VANITY_MAX_PATTERN}`;
      vanityStatusText.textContent = `${diff.label} · ${diff.eta} ${t('avg')} · ${lenText}`;
    }
  }

  if (vanityDifficulty) {
    const showBadge = !!trimmed && !invalid.length;
    const showOk = ready;
    vanityDifficulty.hidden = !showBadge;
    vanityDifficulty.classList.toggle('hidden', !showBadge);
    if (infeasible || tooLong) {
      vanityDifficulty.className = 'badge b-red vanity-diff-badge';
      vanityDifficulty.textContent = t('Impossible');
      vanityDifficulty.title = tooLong
        ? t('Each part max {n} characters in prefix+suffix mode.', { n: VANITY_MAX_BOTH_PART })
        : vanityInfeasibleReason(input);
    } else if (showOk) {
      vanityDifficulty.className = `badge ${diff.cls} vanity-diff-badge`;
      vanityDifficulty.textContent = diff.label;
      vanityDifficulty.title = diff.eta ? `${t('Avg. wait')} ${diff.eta}` : '';
    } else {
      vanityDifficulty.className = 'badge b-ghost vanity-diff-badge hidden';
      vanityDifficulty.textContent = '—';
      vanityDifficulty.title = '';
    }
  }

  if (!vanityIsBothMode(mode)) {
    vanityPresets?.querySelectorAll('.vanity-preset:not(.vanity-preset-both)').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.pattern === trimmed);
    });
  } else {
    vanityPresetsBoth?.querySelectorAll('.vanity-preset-both').forEach((btn) => {
      const on = btn.dataset.prefix === prefix && btn.dataset.suffix === suffix;
      btn.classList.toggle('is-active', on);
    });
  }

  if (vanityCharCount) {
    if (vanityIsBothMode(mode)) {
      vanityCharCount.textContent = '';
      vanityCharCount.classList.add('hidden');
    } else {
      const len = trimmed.length;
      vanityCharCount.textContent = len ? `${len}/${VANITY_MAX_PATTERN}` : '';
      vanityCharCount.classList.toggle('hidden', !len);
    }
  }

  const canStart = ready && !vanityRunning;
  vanitySetGenerateEnabled(canStart);
  if (!vanityRunning) vanitySavePrefs();
}

function vanitySetFlowState(state) {
  if (vanityCompose) vanityCompose.classList.toggle('is-searching', state === 'searching');
  document.body.classList.toggle('vanity-is-searching', state === 'searching');
}

function vanitySetRunning(busy) {
  vanityRunning = busy;
  if (vanityPatternInput) vanityPatternInput.disabled = busy;
  if (vanityPrefixPatternInput) vanityPrefixPatternInput.disabled = busy;
  if (vanitySuffixPatternInput) vanitySuffixPatternInput.disabled = busy;
  vanityModeGroup?.querySelectorAll('.vanity-mode-btn').forEach((b) => { b.disabled = busy; });
  if (vanityCaseSensitive) vanityCaseSensitive.disabled = busy;
  if (vanityCaseToggle) vanityCaseToggle.disabled = busy;
  vanityPresets?.querySelectorAll('.vanity-preset').forEach((b) => { b.disabled = busy; });
  spinBtn(vanityStartBtn, busy);
  vanitySetFlowState(busy ? 'searching' : 'idle');
  vanityUpdateFormState();
}

function vanityEnsureProgressDOM() {
  if (!vanityProgress || vanityProgressReady) return;
  vanityProgress.innerHTML = `
    <div class="vanity-searching-card">
      <div class="vanity-searching-head">
        <div class="vanity-searching-title">
          <span class="sidebar-nav-state is-cached vanity-searching-pulse" aria-hidden="true"></span>
          <span>${t('Searching for match')}</span>
        </div>
        <button type="button" id="vanity-stop-btn" class="vanity-stop-inline">${t('Stop')}</button>
      </div>
      <div class="vanity-progress-bar-wrap" id="vanity-progress-bar-wrap" aria-hidden="true">
        <div class="vanity-progress-bar" id="vanity-progress-bar">
          <span class="vanity-progress-bar-shine" aria-hidden="true"></span>
        </div>
        <span class="vanity-progress-avg-mark" id="vanity-progress-avg-mark" aria-hidden="true"></span>
      </div>
      <div class="vanity-searching-stats">
        <div class="vanity-searching-stat">
          <span class="vanity-searching-stat-val mono" id="vanity-stat-speed">—</span>
          <span class="vanity-searching-stat-label">${t('Speed')}</span>
        </div>
        <div class="vanity-searching-stat">
          <span class="vanity-searching-stat-val mono" id="vanity-stat-attempts">0</span>
          <span class="vanity-searching-stat-label">${t('Attempts')}</span>
        </div>
        <div class="vanity-searching-stat">
          <span class="vanity-searching-stat-val mono" id="vanity-stat-eta">—</span>
          <span class="vanity-searching-stat-label">${t('Est. remaining')}</span>
        </div>
      </div>
      <p class="vanity-progress-hint" id="vanity-progress-hint"></p>
    </div>`;
  document.getElementById('vanity-stop-btn')?.addEventListener('click', vanityStop);
  vanityProgressReady = true;
}

function vanityClearProgressDOM() {
  if (!vanityProgress) return;
  vanityProgress.innerHTML = '';
  vanityProgressReady = false;
}

function vanityUpdateProgressUI() {
  if (!vanityProgress || !vanityRunning) return;
  vanityEnsureProgressDOM();

  const elapsed = Math.max(0.001, (Date.now() - vanityStartedAt) / 1000);
  const input = vanityCollectInput();
  const estTotal = vanityIsBothMode(input.mode)
    ? vanityEstimateAttempts('', input.mode, { prefix: input.prefix, suffix: input.suffix })
    : vanityEstimateAttempts(input.trimmed, input.mode);
  const rate = vanitySearchRate(elapsed);
  const eta = vanityEtaRemaining(estTotal, rate);
  const pct = vanityProgressPercent(vanityTotalAttempts, estTotal);
  const avgRatio = estTotal > 0 ? vanityTotalAttempts / estTotal : 0;
  const pastAvg = avgRatio >= 1;
  const pattern = input.trimmed;
  const mode = input.mode;

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const displayRate = vanityTotalAttempts > 0 ? vanityTotalAttempts / elapsed : rate;
  set('vanity-stat-speed', vanityFormatRate(displayRate));
  set('vanity-stat-attempts', fmtNum(vanityTotalAttempts));
  set('vanity-stat-eta', vanityFormatEta(eta));

  const card = vanityProgress?.querySelector('.vanity-searching-card');
  card?.classList.toggle('is-past-avg', pastAvg);

  const wrap = document.getElementById('vanity-progress-bar-wrap');
  wrap?.classList.toggle('is-past-avg', pastAvg);

  const bar = document.getElementById('vanity-progress-bar');
  if (bar) bar.style.width = `${pct}%`;

  const avgMark = document.getElementById('vanity-progress-avg-mark');
  if (avgMark) avgMark.style.left = `${vanityProgressPercent(estTotal, estTotal)}%`;

  const hint = document.getElementById('vanity-progress-hint');
  if (hint) {
    if (pastAvg) {
      hint.textContent = t('Past average — still searching ({ratio}× avg, {attempts} attempts)', {
        ratio: avgRatio.toFixed(1),
        attempts: fmtNum(vanityTotalAttempts),
      });
    } else {
      hint.textContent = t('{pattern} · {mode} · {rate} · {elapsed}s', {
        pattern,
        mode,
        rate: vanityFormatRate(displayRate),
        elapsed: Math.floor(elapsed),
      });
    }
  }
}

function vanityStopWorkers() {
  vanityWorkers.forEach((w) => {
    try { w.postMessage({ type: 'stop' }); } catch (_) { /* ignore */ }
    w.terminate();
  });
  vanityWorkers = [];
  if (vanityProgressTimer) {
    clearInterval(vanityProgressTimer);
    vanityProgressTimer = null;
  }
}

function resetVanityGen() {
  vanityStopWorkers();
  vanityFound = false;
  vanityTotalAttempts = 0;
  vanitySetRunning(false);
  vanitySetFlowState('idle');
  vanityClearProgressDOM();
  if (vanityResult) vanityResult.innerHTML = '';
  if (vanityEmpty) vanityEmpty.style.display = '';
  setError(vanityErr, '');
  vanityUpdateFormState();
  if (typeof syncModuleNavState === 'function') syncModuleNavState('vanity');
}

function vanityScrollTo(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function vanityRenderFound(address, privateKey, attempts) {
  vanityFound = true;
  const elapsed = ((Date.now() - vanityStartedAt) / 1000).toFixed(1);
  vanityClearProgressDOM();
  vanityLastMode = vanityGetMode();
  vanityLastPattern = vanityPatternInput?.value.trim() || '';
  vanityLastPrefix = vanityPrefixPatternInput?.value.trim() || '';
  vanityLastSuffix = vanitySuffixPatternInput?.value.trim() || '';

  const highlighted = vanityLastMode === 'both'
    ? vanityHighlightAddress(address, '', 'both', { prefix: vanityLastPrefix, suffix: vanityLastSuffix })
    : vanityHighlightAddress(address, vanityLastPattern, vanityLastMode);

  vanityResult.innerHTML = `
    <div class="vanity-success-card is-entering">
      <div class="vanity-success-head">
        <div class="vanity-success-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <div>
          <p class="vanity-success-title">${t('Address generated')}</p>
          <p class="vanity-success-meta mono">${fmtNum(attempts)} ${t('attempts')} · ${elapsed}s</p>
        </div>
      </div>
      <div class="vanity-address-card">
        <div class="vanity-address-card-head">
          <span class="vanity-address-label">${t('Address')}</span>
          <button type="button" class="wallet-action-btn vanity-copy-addr">${icSVG(IC.copy, 14)}<span>${t('Copy')}</span></button>
        </div>
        <code class="mono vanity-address-value">${highlighted}</code>
      </div>
      <div class="vanity-secret-card">
        <div class="vanity-secret-head">
          <span class="vanity-secret-label">${t('Private key')}</span>
          <span class="vanity-secret-actions">
            <button type="button" class="wallet-action-btn" id="vanity-reveal-btn"><span>${t('Reveal')}</span></button>
            <button type="button" class="wallet-action-btn vanity-copy-key">${icSVG(IC.copy, 14)}<span>${t('Copy')}</span></button>
          </span>
        </div>
        <code class="mono vanity-key is-blurred" id="vanity-priv-display">${esc(privateKey)}</code>
      </div>
      <div class="vanity-result-actions">
        <button type="button" class="wallet-action-btn" id="vanity-generate-another-btn">${icSVG(IC.activity, 14)}<span>${t('Generate another')}</span></button>
      </div>
      <p class="aml-disclaimer vanity-result-disclaimer">${t('Save the private key offline now. Anyone with this key controls the wallet. TRONSEC does not store it.')}</p>
    </div>`;

  vanityResult.querySelector('.vanity-copy-addr')?.addEventListener('click', () => {
    navigator.clipboard.writeText(address).then(() => showToast(t('Address copied')));
  });
  vanityResult.querySelector('.vanity-copy-key')?.addEventListener('click', () => {
    navigator.clipboard.writeText(privateKey).then(() => showToast(t('Private key copied')));
  });

  const revealBtn = document.getElementById('vanity-reveal-btn');
  const privEl = document.getElementById('vanity-priv-display');
  revealBtn?.addEventListener('click', () => {
    if (!privEl || !revealBtn) return;
    const hidden = privEl.classList.toggle('is-blurred');
    revealBtn.querySelector('span').textContent = hidden ? t('Reveal') : t('Hide');
  });

  document.getElementById('vanity-generate-another-btn')?.addEventListener('click', () => {
    if (vanityResult) vanityResult.innerHTML = '';
    vanityFound = false;
    vanityTotalAttempts = 0;
    vanitySetFlowState('idle');
    setError(vanityErr, '');
    if (vanityIsBothMode(vanityGetMode())) vanityPrefixPatternInput?.focus();
    else vanityPatternInput?.focus();
    vanityStart();
  });

  vanityScrollTo(vanityResult);
  vanityRecordMeasuredRate();
  if (typeof syncModuleNavState === 'function') syncModuleNavState('vanity');
  if (window.lucide) lucide.createIcons();
}

function vanityWorkerUrl() {
  return new URL('js/vanity-worker.js', window.location.href).href;
}

async function vanityStart() {
  if (vanityRunning || vanityStartBtn?.disabled) return;
  setError(vanityErr, '');

  const input = vanityCollectInput();
  const { mode, trimmed, invalid, infeasible, tooLong, ready, prefix, suffix } = input;

  if (!trimmed) {
    if (vanityIsBothMode(mode)) {
      flashInput(vanityPrefixPatternInput);
      flashInput(vanitySuffixPatternInput);
    } else {
      flashInput(vanityPatternInput);
    }
    showToast(vanityIsBothMode(mode) ? t('Enter prefix and suffix') : t('Enter a pattern'));
    return;
  }

  if (vanityIsBothMode(mode)) {
    if (!prefix || !suffix) {
      if (!prefix) flashInput(vanityPrefixPatternInput);
      if (!suffix) flashInput(vanitySuffixPatternInput);
      showToast(t('Enter prefix and suffix'));
      return;
    }
    if (tooLong) {
      setError(vanityErr, t('Each part max {n} characters in prefix+suffix mode.', { n: VANITY_MAX_BOTH_PART }));
      return;
    }
  } else if (trimmed.length > VANITY_MAX_PATTERN) {
    setError(vanityErr, t('Pattern too long — max {n} characters for browser search.', { n: VANITY_MAX_PATTERN }));
    return;
  }

  if (invalid.length) {
    if (vanityIsBothMode(mode)) {
      flashInput(vanityPrefixPatternInput);
      flashInput(vanitySuffixPatternInput);
    } else {
      flashInput(vanityPatternInput);
    }
    showToast(t('Invalid Base58 characters: {chars}', { chars: invalid.join(' ') }));
    vanityUpdateFormState();
    return;
  }

  if (!ready || infeasible) {
    if (vanityIsBothMode(mode)) {
      flashInput(vanityPrefixPatternInput);
      flashInput(vanitySuffixPatternInput);
    } else {
      flashInput(vanityPatternInput);
    }
    showToast(vanityInfeasibleReason(input));
    vanityUpdateFormState();
    return;
  }

  const diff = vanityDifficultyInfo(input);
  const estAttempts = vanityIsBothMode(mode)
    ? vanityEstimateAttempts('', mode, { prefix, suffix })
    : vanityEstimateAttempts(trimmed, mode);
  if (diff.label === t('Extreme') && !window.confirm(t('This pattern may take a very long time (~{n} attempts on average). Continue?', { n: fmtNum(Math.round(estAttempts)) }))) {
    return;
  }

  vanityStopWorkers();
  vanityTotalAttempts = 0;
  vanityFound = false;
  vanitySmoothedRate = 0;
  vanityStartedAt = Date.now();
  const vanityPatternDesc = vanityIsBothMode(mode)
    ? `prefix:${prefix} suffix:${suffix}`
    : trimmed;
  vanityLastPatternDesc = vanityPatternDesc;
  if (vanityEmpty) vanityEmpty.style.display = 'none';
  if (vanityResult) vanityResult.innerHTML = '';
  vanityClearProgressDOM();
  vanitySetRunning(true);
  vanityUpdateProgressUI();
  vanityProgressTimer = setInterval(vanityUpdateProgressUI, 250);
  vanityScrollTo(vanityProgress);

  const workerCount = vanityWorkerCount();
  vanityActiveWorkers = workerCount;
  let workersReady = 0;
  let workerFailed = false;

  for (let i = 0; i < workerCount; i++) {
    let worker;
    try {
      worker = new Worker(vanityWorkerUrl(), { type: 'module' });
    } catch (err) {
      vanitySetRunning(false);
      setError(vanityErr, t('Worker error: {message}', { message: err.message || String(err) }));
      return;
    }

    worker.onmessage = (e) => vanityOnWorkerMessage(e);
    worker.onerror = (err) => {
      if (workerFailed) return;
      workerFailed = true;
      vanitySetRunning(false);
      vanityStopWorkers();
      setError(vanityErr, t('Worker error: {message}', { message: err.message || 'Failed to load generator' }));
    };
    vanityWorkers.push(worker);
    worker.postMessage({
      type: 'start',
      workerId: i,
      pattern: vanityIsBothMode(mode) ? '' : trimmed,
      prefix: vanityIsBothMode(mode) ? prefix : '',
      suffix: vanityIsBothMode(mode) ? suffix : '',
      mode,
      caseSensitive: !!vanityCaseSensitive?.checked,
    });
    workersReady++;
  }

  if (!workersReady) {
    vanitySetRunning(false);
    setError(vanityErr, t('Could not start search workers'));
  }
}

function vanityOnWorkerMessage(e) {
  const msg = e.data || {};
  if (msg.type === 'progress') {
    vanityTotalAttempts += msg.attempts || 0;
    return;
  }
  if (msg.type === 'error') {
    if (vanityRunning) {
      vanityStopWorkers();
      vanitySetRunning(false);
      setError(vanityErr, t('Worker error: {message}', { message: msg.message || 'Unknown' }));
    }
    return;
  }
  if (msg.type === 'found' && !vanityFound) {
    vanityTotalAttempts += msg.attempts || 0;
    vanityStopWorkers();
    vanityRenderFound(msg.address, msg.privateKey, vanityTotalAttempts);
    vanitySetRunning(false);
    if (msg.address) {
      const elapsed = vanityStartedAt ? ((Date.now() - vanityStartedAt) / 1000).toFixed(1) : '';
    }
    showToast(t('Vanity address found'));
  }
}

function vanityStop() {
  if (!vanityRunning) return;
  vanityRecordMeasuredRate();
  vanityStopWorkers();
  vanitySetRunning(false);
  if (!vanityFound && vanityProgress) {
    vanityClearProgressDOM();
    vanityProgress.innerHTML = `<p class="vanity-stopped-msg">${t('Search stopped')} · ${fmtNum(vanityTotalAttempts)} ${t('attempts')}</p>`;
  }
  showToast(t('Search stopped'));
}

vanityModeGroup?.querySelectorAll('.vanity-mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (vanityRunning) return;
    vanitySetMode(btn.dataset.mode);
  });
});

vanityPresets?.querySelectorAll('.vanity-preset:not(.vanity-preset-both)').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (vanityRunning || !vanityPatternInput || vanityIsBothMode()) return;
    vanityPatternInput.value = btn.dataset.pattern || '';
    vanityUpdateFormState();
    vanityPatternInput.focus();
  });
});

vanityPresetsBoth?.querySelectorAll('.vanity-preset-both').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (vanityRunning || !vanityPrefixPatternInput || !vanitySuffixPatternInput) return;
    if (!vanityIsBothMode()) vanitySetMode('both');
    vanityPrefixPatternInput.value = btn.dataset.prefix || '';
    vanitySuffixPatternInput.value = btn.dataset.suffix || '';
    vanityUpdateFormState();
    vanitySuffixPatternInput.focus();
  });
});

vanityStartBtn?.addEventListener('click', vanityStart);

vanityPatternInput?.addEventListener('input', vanityUpdateFormState);
vanityPrefixPatternInput?.addEventListener('input', vanityUpdateFormState);
vanitySuffixPatternInput?.addEventListener('input', vanityUpdateFormState);
vanityPatternInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!vanityRunning && !vanityStartBtn?.disabled) vanityStart();
  }
  if (e.key === 'Escape' && vanityRunning) vanityStop();
});
[vanityPrefixPatternInput, vanitySuffixPatternInput].forEach((el) => {
  el?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!vanityRunning && !vanityStartBtn?.disabled) vanityStart();
    }
    if (e.key === 'Escape' && vanityRunning) vanityStop();
  });
});

vanityCaseToggle?.addEventListener('click', () => {
  if (vanityRunning || !vanityCaseSensitive) return;
  vanityCaseSensitive.checked = !vanityCaseSensitive.checked;
  vanitySyncCaseToggle();
  vanityUpdateFormState();
});

vanityCaseSensitive?.addEventListener('change', () => {
  vanitySyncCaseToggle();
  vanityUpdateFormState();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !vanityRunning) return;
  const tab = document.getElementById('tab-vanity');
  if (tab?.classList.contains('active')) vanityStop();
});

vanityLoadPrefs();
vanitySyncInputLayout(vanityGetMode());
vanitySyncCaseToggle();
vanitySetRunning(false);
vanityUpdateFormState();
