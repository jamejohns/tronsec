// ============ STATE & DATA ============
const STORAGE_KEY = 'TRONSECState';
function loadAppState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            window.activeTab = saved.activeTab || 'scanner';
        }
    } catch (e) { console.warn(e); }
}

let _switchingTab = false;
let _firstAnalytics = true;

// analytics cache
const analyticsCache = {};
const CACHE_TTL = {
  network: 60000,
  market: 120000,
  fgMarket: 300000,
  fgIndex: 300000,
  token: 120000,
  security: 300000
};
function cacheIsFresh(key) { return analyticsCache[key] && Date.now() - analyticsCache[key] < CACHE_TTL[key]; }
function cacheBust(key) { analyticsCache[key] = Date.now(); }

// ============ TAB SWITCHING ============
const PURGE_FADE_MS = 220;
const PURGE_BTN_MS = 140;

function animateModuleClear(section, onClear) {
    if (!section || section.dataset.purging === '1') return;
    section.dataset.purging = '1';

    const btn = section.querySelector('.module-action-btn');
    const result = section.querySelector('[id$="-result"]');
    const panel = section.querySelector('.report-panel');
    const animTarget = result || panel;
    const hasContent = !!(animTarget && animTarget.innerHTML.trim());
    const btnLabel = btn ? btn.textContent.trim() : '[ CLEAR CACHE ]';

    if (btn) {
        btn.classList.add('is-clearing');
        btn.disabled = true;
        btn.textContent = '[ CLEARING ]';
    }
    if (hasContent && animTarget) animTarget.classList.add('is-purging');

    setTimeout(() => {
        onClear();
        if (animTarget) animTarget.classList.remove('is-purging');

        const empty = section.querySelector('[id$="-empty"]');
        if (empty) {
            empty.style.display = '';
            empty.classList.remove('hidden');
            empty.classList.remove('is-entering');
            void empty.offsetWidth;
            empty.classList.add('is-entering');
        }

        if (btn) {
            btn.classList.remove('is-clearing');
            btn.disabled = false;
            btn.textContent = btnLabel;
        }
        delete section.dataset.purging;
        if (window.lucide) lucide.createIcons();
    }, hasContent ? PURGE_FADE_MS : PURGE_BTN_MS);
}

function purgeTabNow(tabId, section) {
    section.querySelectorAll('input, textarea').forEach(el => { el.value = ''; });
    const err = section.querySelector('[id$="-err"]');
    if (err) err.innerHTML = '';
    const result = section.querySelector('[id$="-result"]');
    if (result) result.innerHTML = '';
    if (tabId === 'contract-scan' && typeof resetContractScanCache === 'function') resetContractScanCache();
    if (tabId === 'scanner' && typeof resetWalletScanCache === 'function') resetWalletScanCache();
}

function purgeTab(tabId) {
    const section = document.getElementById(`tab-${tabId}`);
    if (!section) return;
    if (tabId === 'report') {
        clearReportForm();
        return;
    }
    animateModuleClear(section, () => purgeTabNow(tabId, section));
}
function switchTab(tabId) {
  closeMobileMoreMenu();

  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  const activeTab = document.getElementById(`tab-${tabId}`);
  if (activeTab) activeTab.classList.add('active');

  document.querySelectorAll('[data-tab-btn]').forEach(btn => {
    btn.classList.remove('tab-nav-active', 'text-white', 'bg-panelBorder/40', 'border-hackCyan', 'text-slate-500', 'border-transparent');
  });

  document.querySelectorAll(`[data-tab-btn="${tabId}"]`).forEach(btn => {
    btn.classList.add('tab-nav-active');
  });

  if (tabId === 'analytics') {
    if (_firstAnalytics) { _firstAnalytics = false; refreshAllAnalytics(true); }
    else { refreshAllAnalytics(false); }
  }

  if (window.lucide) lucide.createIcons();

  _switchingTab = true;
  if (tabId === 'scanner') {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
  } else if (window.location.hash !== `#${tabId}`) {
    window.location.hash = tabId;
  }
  _switchingTab = false;
}

// ============ FEAR & GREED ============
function fgSentimentClass(value) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return 'is-neutral';
    if (n >= 55) return 'is-green';
    if (n >= 45) return 'is-info';
    if (n >= 25) return 'is-amber';
    return 'is-red';
}
function fgAsideClass(value) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return 'sidebar-aside-fg-meta';
    if (n >= 55) return 'sidebar-aside-fg-meta is-green';
    if (n >= 45) return 'sidebar-aside-fg-meta is-info';
    if (n >= 25) return 'sidebar-aside-fg-meta is-amber';
    return 'sidebar-aside-fg-meta is-red';
}
function fgAsideSkVal() { return '<span class="sk sidebar-aside-sk-val"></span>'; }
function fgAsideSkMeta() { return '<span class="sk sidebar-aside-sk-meta"></span>'; }
function fgAsideTrack() { return document.querySelector('.sidebar-aside-track'); }
function setFgAsideLoading() {
    const valueEl = document.getElementById('fg-value');
    const sentimentEl = document.getElementById('fg-sentiment');
    const bar = document.getElementById('fg-bar');
    const track = fgAsideTrack();
    if (valueEl) { valueEl.className = 'sidebar-aside-fg-val'; valueEl.innerHTML = fgAsideSkVal(); }
    if (sentimentEl) { sentimentEl.className = 'sidebar-aside-fg-meta'; sentimentEl.innerHTML = fgAsideSkMeta(); }
    if (bar) bar.style.width = '0%';
    if (track) track.classList.add('is-loading');
}
function setFgAsideUnavailable() {
    const valueEl = document.getElementById('fg-value');
    const sentimentEl = document.getElementById('fg-sentiment');
    const bar = document.getElementById('fg-bar');
    const track = fgAsideTrack();
    if (valueEl) { valueEl.textContent = '--'; valueEl.className = 'sidebar-aside-fg-val'; }
    if (sentimentEl) { sentimentEl.textContent = '--'; sentimentEl.className = 'sidebar-aside-fg-meta'; }
    if (bar) bar.style.width = '0%';
    if (track) track.classList.remove('is-loading');
}
function setFgAsideData(value, classification) {
    const valueEl = document.getElementById('fg-value');
    const sentimentEl = document.getElementById('fg-sentiment');
    const bar = document.getElementById('fg-bar');
    const track = fgAsideTrack();
    if (valueEl) { valueEl.textContent = value; valueEl.className = 'sidebar-aside-fg-val'; }
    if (sentimentEl) { sentimentEl.textContent = classification; sentimentEl.className = fgAsideClass(value); }
    if (bar) bar.style.width = `${value}%`;
    if (track) track.classList.remove('is-loading');
}
async function fetchFearGreedIndex() {
    if (!document.getElementById('fg-value')) return;
    setFgAsideLoading();
    try {
        const r = await fetch('https://api.alternative.me/fng/?limit=1');
        const d = await r.json();
        if (d?.data?.[0]) {
            setFgAsideData(d.data[0].value, d.data[0].value_classification);
        } else {
            setFgAsideUnavailable();
        }
        cacheBust('fgIndex');
    } catch (_) {
        setFgAsideUnavailable();
        cacheBust('fgIndex');
    }
}
function setAnStat(id, text, tone) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `an-stat-value is-${tone || 'neutral'}`;
}
function setAnStatLoading(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'an-stat-value';
    el.innerHTML = '<span class="sk an-sk-value an-sk-value--inline"></span>';
}
function showMarketSkeleton() {
    const skVal = () => '<span class="sk an-sk-card-value"></span>';
    const skTag = () => '<span class="sk an-sk-card-tag"></span>';
    const skMini = () => '<span class="sk an-sk-mini"></span>';
    const fgVal = document.getElementById('market-fg-value');
    const fgSent = document.getElementById('market-fg-sentiment');
    const price = document.getElementById('market-trx-price');
    const change = document.getElementById('market-trx-change');
    const mcap = document.getElementById('market-trx-mcap');
    const vol = document.getElementById('market-trx-volume');
    if (fgVal) { fgVal.className = 'an-card-value'; fgVal.innerHTML = skVal(); }
    if (fgSent) { fgSent.className = 'an-card-tag'; fgSent.innerHTML = skTag(); }
    if (document.getElementById('market-fg-bar')) document.getElementById('market-fg-bar').style.width = '0%';
    if (price) { price.className = 'an-card-value'; price.innerHTML = skVal(); }
    if (change) { change.className = 'an-card-change'; change.innerHTML = skMini(); }
    if (mcap) mcap.innerHTML = skMini();
    if (vol) vol.innerHTML = skMini();
}
function showAnalyticsSkeletons() {
    const feeGrid = document.getElementById('tron-fee-grid');
    const netGrid = document.getElementById('tron-network-grid');
    const secGrid = document.getElementById('security-metrics-grid');
    if (feeGrid) feeGrid.innerHTML = SK.analyticsGrid(3);
    if (netGrid) netGrid.innerHTML = SK.analyticsGrid(3);
    if (secGrid) secGrid.innerHTML = SK.analyticsGrid(4);
    showMarketSkeleton();
    setAnStatLoading('usdt-tx-count');
    setAnStatLoading('transfer-volume-24h');
}



// ============ ANALYTICS ============
function refreshAllAnalytics(force) {
    if (force) showAnalyticsSkeletons();
    if (force || !cacheIsFresh('network')) fetchTronNetworkStatus();
    if (force || !cacheIsFresh('market')) fetchMarketData();
    if (force || !cacheIsFresh('fgMarket')) fetchFearGreedForMarket();
    if (force || !cacheIsFresh('token')) fetchTokenActivity();
    if (force || !cacheIsFresh('security')) fetchSecurityMetrics();
}
async function fetchTronNetworkStatus() {
    const feeGrid = document.getElementById('tron-fee-grid');
    const netGrid = document.getElementById('tron-network-grid');
    if (!feeGrid || !netGrid) return;
    if (!feeGrid.querySelector('.an-stat--sk')) feeGrid.innerHTML = SK.analyticsGrid(3);
    if (!netGrid.querySelector('.an-stat--sk')) netGrid.innerHTML = SK.analyticsGrid(3);
    try {
        let energyFee = 420, bwFee = 1000;
        try {
            const c = await scanGet('/chainparameters', {});
            const p = c?.chainParameters || c?.chainParameter || c?.data || [];
            const gp = (k) => { const x = p.find(v => v.key === k || v.parameterKey === k); return x ? (x.value ?? x.parameterValue) : null; };
            energyFee = gp('getEnergyFee') || gp('ENERGY_FEE') || 420;
            bwFee = gp('getTransactionFee') || gp('TRANSACTION_FEE') || 1000;
        } catch (_) {
            try {
                const c = await gridPost('/wallet/getchainparameters', {});
                const p = c?.chainParameter || [];
                const gp = (k) => { const x = p.find(v => v.key === k); return x ? x.value : null; };
                energyFee = gp('getEnergyFee') || 420;
                bwFee = gp('getTransactionFee') || 1000;
            } catch (_) {}
        }
        const [homepage, funds] = await Promise.all([
            scanGet('/homepage', {}).catch(() => null),
            scanGet('/funds', {}).catch(() => null)
        ]);
        const info = homepage?.tron_info;
        feeGrid.innerHTML = `
            ${SK.analyticsStat('Energy', 'tron-stat-energy', 'Sun per unit', 'info')}
            ${SK.analyticsStat('Bandwidth', 'tron-stat-bw', 'Sun per transaction', 'green')}
            ${SK.analyticsStat('Energy price', 'tron-stat-energy-price', 'TRX per 1K energy', 'amber')}`;
        setAnStat('tron-stat-energy', fmtNum(energyFee), 'info');
        setAnStat('tron-stat-bw', fmtNum(bwFee), 'green');
        setAnStat('tron-stat-energy-price', (energyFee / 1000).toFixed(2), 'amber');
        netGrid.innerHTML = `
            ${SK.analyticsStat('Total accounts', 'tron-stat-accounts', 'on-chain addresses', 'green')}
            ${SK.analyticsStat('TRX burned', 'tron-stat-burned', 'fees & resources', 'red')}
            ${SK.analyticsStat('Total staked', 'tron-stat-staked', 'frozen / voted TRX', 'info')}`;
        setAnStat('tron-stat-accounts', fmtNum(info?.account_number || 0), 'green');
        setAnStat('tron-stat-burned', fmtNum(funds?.totalBurnedForResourcesAndFees || 0), 'red');
        setAnStat('tron-stat-staked', fmtNum(info?.freeze_balance || 0), 'info');
        cacheBust('network');
    } catch (_) {
        cacheBust('network');
        feeGrid.innerHTML = `
            ${SK.analyticsStat('Energy', 'tron-stat-energy', 'Sun per unit', 'info')}
            ${SK.analyticsStat('Bandwidth', 'tron-stat-bw', 'Sun per transaction', 'green')}
            ${SK.analyticsStat('Energy price', 'tron-stat-energy-price', 'TRX per 1K energy', 'amber')}`;
        setAnStat('tron-stat-energy', '420', 'info');
        setAnStat('tron-stat-bw', '1,000', 'green');
        setAnStat('tron-stat-energy-price', '0.42', 'amber');
        netGrid.innerHTML = `
            ${SK.analyticsStat('Total accounts', 'tron-stat-accounts', 'on-chain addresses', 'green')}
            ${SK.analyticsStat('TRX burned', 'tron-stat-burned', 'fees & resources', 'red')}
            ${SK.analyticsStat('Total staked', 'tron-stat-staked', 'frozen / voted TRX', 'info')}`;
        setAnStat('tron-stat-accounts', '--', 'neutral');
        setAnStat('tron-stat-burned', '--', 'neutral');
        setAnStat('tron-stat-staked', '--', 'neutral');
    }
}
async function fetchMarketData() {
    const price = document.getElementById('market-trx-price');
    const change = document.getElementById('market-trx-change');
    const mcap = document.getElementById('market-trx-mcap');
    const vol = document.getElementById('market-trx-volume');
    if (price) { price.className = 'an-card-value'; price.innerHTML = '<span class="sk an-sk-card-value"></span>'; }
    if (change) { change.className = 'an-card-change'; change.innerHTML = '<span class="sk an-sk-mini"></span>'; }
    if (mcap) mcap.innerHTML = '<span class="sk an-sk-mini"></span>';
    if (vol) vol.innerHTML = '<span class="sk an-sk-mini"></span>';
    try {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true');
        const d = await r.json();
        if (d.tron) {
            document.getElementById('market-trx-price').innerText = `$${d.tron.usd.toLocaleString()}`;
            document.getElementById('market-trx-price').className = 'an-card-value is-green';
            const ch = d.tron.usd_24h_change?.toFixed(2) || 0;
            const el = document.getElementById('market-trx-change');
            el.innerText = `${ch > 0 ? '+' : ''}${ch}%`;
            el.className = `an-card-change ${ch >= 0 ? 'is-green' : 'is-red'}`;
            document.getElementById('market-trx-mcap').innerText = `$${(d.tron.usd_market_cap / 1e9).toFixed(2)}B`;
            document.getElementById('market-trx-volume').innerText = `$${(d.tron.usd_24h_vol / 1e9).toFixed(2)}B`;
        }
        cacheBust('market');
    } catch (_) {
        cacheBust('market');
        try {
            const f = await scanGet('/funds', {});
            const p = parseFloat(f?.priceInUsd || f?.price || 0);
            if (p) document.getElementById('market-trx-price').innerText = `$${p.toLocaleString()}`;
        } catch (_) {}
    }
}
async function fetchFearGreedForMarket() {
    const fgVal = document.getElementById('market-fg-value');
    const fgSent = document.getElementById('market-fg-sentiment');
    if (fgVal) { fgVal.className = 'an-card-value'; fgVal.innerHTML = '<span class="sk an-sk-card-value"></span>'; }
    if (fgSent) { fgSent.className = 'an-card-tag'; fgSent.innerHTML = '<span class="sk an-sk-card-tag"></span>'; }
    if (document.getElementById('market-fg-bar')) document.getElementById('market-fg-bar').style.width = '0%';
    try {
        const r = await fetch('https://api.alternative.me/fng/?limit=1');
        const d = await r.json();
        if (d?.data?.[0]) {
            document.getElementById('market-fg-value').innerText = d.data[0].value;
            document.getElementById('market-fg-value').className = 'an-card-value';
            const marketSentiment = document.getElementById('market-fg-sentiment');
            marketSentiment.innerText = d.data[0].value_classification;
            marketSentiment.className = 'an-card-tag ' + fgSentimentClass(d.data[0].value);
            document.getElementById('market-fg-bar').style.width = d.data[0].value + '%';
        }
        cacheBust('fgMarket');
    } catch (_) {
        cacheBust('fgMarket');
    }
}
async function fetchTokenActivity() {
    setAnStatLoading('usdt-tx-count');
    setAnStatLoading('transfer-volume-24h');
    try {
        const [stats, hp] = await Promise.all([
            scanGet('/stats/overview', { days: 1 }).catch(() => null),
            scanGet('/homepage', {}).catch(() => null)
        ]);
        const row = stats?.data?.[0];
        if (row) setAnStat('usdt-tx-count', fmtNum(row.usdt_transaction || 0), 'green');
        const vol = hp?.tron_info?.transfer_amount_24h;
        if (vol != null) {
            const v = parseFloat(vol);
            setAnStat('transfer-volume-24h', v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : fmtNum(v), 'info');
        }
        cacheBust('token');
    } catch (_) {
        cacheBust('token');
    }
}
async function fetchSecurityMetrics() {
    const grid = document.getElementById('security-metrics-grid');
    if (!grid) return;
    if (!grid.querySelector('.an-stat--sk')) grid.innerHTML = SK.analyticsGrid(4);
    try {
        const d = await scanGet('/homepage', {}).catch(() => null);
        const info = d?.tron_info;
        if (!info) throw new Error('no data');
        const contracts = info.contract_number || 0;
        const contractCh = info.last_24h_contract_change || 0;
        const nodes = info.data?.nodeNum || 0;
        const peakTps = info.last_24h_max_tps || 0;
        const totalTxs = info.transaction_number || 0;
        grid.innerHTML = `
            ${SK.analyticsStat('Total contracts', 'sec-stat-contracts', `+${fmtNum(contractCh)} today`, 'info')}
            ${SK.analyticsStat('Active nodes', 'sec-stat-nodes', 'full nodes online', 'green')}
            ${SK.analyticsStat('Peak TPS', 'sec-stat-tps', 'max in last 24h', 'amber')}
            ${SK.analyticsStat('Total txns', 'sec-stat-txs', 'all-time on-chain', 'green')}`;
        setAnStat('sec-stat-contracts', fmtNum(contracts), 'info');
        setAnStat('sec-stat-nodes', fmtNum(nodes), 'green');
        setAnStat('sec-stat-tps', fmtNum(peakTps), 'amber');
        setAnStat('sec-stat-txs', fmtNum(totalTxs), 'green');
        cacheBust('security');
    } catch (_) {
        cacheBust('security');
        grid.innerHTML = `
            ${SK.analyticsStat('Total contracts', 'sec-stat-contracts', 'unavailable', 'neutral')}
            ${SK.analyticsStat('Active nodes', 'sec-stat-nodes', 'unavailable', 'neutral')}
            ${SK.analyticsStat('Peak TPS', 'sec-stat-tps', 'unavailable', 'neutral')}
            ${SK.analyticsStat('Total txns', 'sec-stat-txs', 'unavailable', 'neutral')}`;
        ['sec-stat-contracts', 'sec-stat-nodes', 'sec-stat-tps', 'sec-stat-txs'].forEach(id => setAnStat(id, '--', 'neutral'));
    }
}

// ============ MOBILE / TOAST ============
let _mobileMoreMenuGuard = false;
function copyDonate(network) {
    const addr = 'TT1BWYjy3FDxQeGE5dNRAyRVdEkpU7G777';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).then(() => showToast('{network} address copied', { network }));
    }
}
function toggleMobileMoreMenu(ev) {
    if (ev) ev.stopPropagation();
    const menu = document.getElementById('mobile-more-menu');
    const backdrop = document.getElementById('mobile-menu-backdrop');
    if (!menu || !backdrop) return;
    const isOpening = menu.classList.contains('translate-y-full');
    menu.classList.remove('translate-y-full', 'translate-y-0');
    menu.classList.add(isOpening ? 'translate-y-0' : 'translate-y-full');
    backdrop.classList.toggle('is-visible', isOpening);
    backdrop.setAttribute('aria-hidden', isOpening ? 'false' : 'true');
    document.body.classList.toggle('mobile-more-open', isOpening);
    document.body.style.overflow = isOpening ? 'hidden' : '';
    const btn = document.querySelector('[data-tab-btn=more]');
    if (btn) btn.classList.toggle('is-sheet-open', isOpening);
    if (isOpening) {
        _mobileMoreMenuGuard = true;
        requestAnimationFrame(() => { _mobileMoreMenuGuard = false; });
    }
}
function closeMobileMoreMenu() {
    const menu = document.getElementById('mobile-more-menu');
    const backdrop = document.getElementById('mobile-menu-backdrop');
    if (!menu || !backdrop) return;
    menu.classList.remove('translate-y-0');
    menu.classList.add('translate-y-full');
    backdrop.classList.remove('is-visible');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mobile-more-open');
    document.body.style.overflow = '';
    const btn = document.querySelector('[data-tab-btn=more]');
    if (btn) btn.classList.remove('is-sheet-open');
}
document.addEventListener('click', function(e) {
    if (_mobileMoreMenuGuard) return;
    const menu = document.getElementById('mobile-more-menu');
    const btn = document.querySelector('[data-tab-btn=more]');
    if (!menu) return;
    if (!menu.classList.contains('translate-y-0')) return;
    if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
    closeMobileMoreMenu();
});
function showToast(text, vars) {
    const toast = document.getElementById('toast');
    toast.style.opacity = '';
    toast.style.pointerEvents = '';
    document.getElementById('toast-text').innerText = t(text, vars);
    toast.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
    toast.classList.add('opacity-100', 'translate-y-0');
    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
    }, 2200);
}

// ============ THEME TOGGLE ============
const THEME_TRANSITION_MS = 360;

function runThemeTransition() {
    const root = document.documentElement;
    root.classList.remove('theme-transition');
    void root.offsetWidth;
    root.classList.add('theme-transition');
    window.clearTimeout(runThemeTransition._t);
    runThemeTransition._t = window.setTimeout(() => {
        root.classList.remove('theme-transition');
    }, THEME_TRANSITION_MS);
}

function applyTheme(isLight, options = {}) {
    const animate = options.animate !== false;
    const themeBtn = document.querySelector('.app-header-icon[title="Toggle theme"]');

    if (animate) runThemeTransition();
    document.body.classList.toggle('light-theme', isLight);
    document.documentElement.classList.toggle('dark', !isLight);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
    if (animate && themeBtn) {
        themeBtn.classList.add('is-theme-switching');
        window.setTimeout(() => themeBtn.classList.remove('is-theme-switching'), 460);
    }
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    if (window.lucide) lucide.createIcons();
}
function toggleTheme() {
    applyTheme(!document.body.classList.contains('light-theme'));
}

function normLangCode(l) {
    l = (l || 'en').toLowerCase();
    if (l === 'pt-br' || l === 'pt') return 'pt';
    if (l.startsWith('zh')) return 'zh';
    if (l.startsWith('ru')) return 'ru';
    if (l.startsWith('es')) return 'es';
    if (l.startsWith('vi')) return 'vi';
    if (l.startsWith('tr')) return 'tr';
    if (l.startsWith('id')) return 'id';
    return l;
}

function markActiveLangOption() {
    const lang = normLangCode(document.documentElement.getAttribute('lang'));
    document.querySelectorAll('.lang-opt').forEach((opt) => {
        opt.classList.toggle('lang-opt-active', normLangCode(opt.getAttribute('data-lang')) === lang);
    });
}

function appLocalePrefix() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const localePaths = ['ru', 'zh', 'es', 'pt-BR', 'vi', 'tr', 'id'];
    if (parts.length >= 2 && parts[1] === 'app' && localePaths.includes(parts[0])) {
        return `/${parts[0]}/`;
    }
    return '/';
}

function syncAppBrandLink() {
    if (typeof syncTronsecBrandLinks === 'function') syncTronsecBrandLinks();
}

function initLangSwitcher() {
    const wrap = document.getElementById('lang-switcher');
    const dd = document.getElementById('lang-dd');
    const btn = document.getElementById('lang-switcher-btn');
    if (!wrap || !dd || !btn) return;

    markActiveLangOption();
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const k = el.getAttribute('data-i18n');
        if (k && typeof t === 'function') el.textContent = t(k);
    });

    let hoverTimer = null;
    const isDesktop = () => window.matchMedia('(min-width: 769px)').matches;
    const open = () => {
        dd.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
        dd.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dd.classList.contains('hidden')) open();
        else close();
    });

    wrap.addEventListener('mouseenter', () => {
        if (!isDesktop()) return;
        clearTimeout(hoverTimer);
        open();
    });
    wrap.addEventListener('mouseleave', () => {
        if (!isDesktop()) return;
        hoverTimer = setTimeout(close, 120);
    });
    dd.addEventListener('mouseenter', () => clearTimeout(hoverTimer));
    dd.addEventListener('mouseleave', () => {
        if (!isDesktop()) return;
        hoverTimer = setTimeout(close, 120);
    });

    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
}

function loadSavedTheme() {
    applyTheme(localStorage.getItem('theme') === 'light', { animate: false });
}

// ============ CAPTCHA SYSTEM ============
let _captchaCallback = null;
let _captchaRequired = 3;
const CAPTCHA_BTN_OFF = 'captcha-btn captcha-btn--disabled';
const CAPTCHA_BTN_ON = 'captcha-btn captcha-btn--primary';
const CAPTCHA_LOG = [
  { text: '[ BOOT ] tronsec-gate v1.0', ok: true },
  { text: '[ SCAN ] bot heuristics......... pass', ok: true },
  { text: '[ SCAN ] request fingerprint..... pass', ok: true },
  { text: '[ SCAN ] rate limit bucket...... pass', ok: true },
  { text: '[ CHALLENGE ] issue interactive proof', ok: false },
];
const CAPTCHA_B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CAPTCHA_SHAPES = [
  { id: 'shield', label: 'SHIELD' },
  { id: 'lock', label: 'LOCK' },
  { id: 'key', label: 'KEY' },
  { id: 'hex', label: 'HEX' },
  { id: 'zap', label: 'ZAP' },
  { id: 'eye', label: 'EYE' },
];

function setCaptchaBtn(enabled) {
  const vbtn = document.getElementById('captcha-verify-btn');
  if (!vbtn) return;
  vbtn.disabled = !enabled;
  vbtn.className = enabled ? CAPTCHA_BTN_ON : CAPTCHA_BTN_OFF;
}

function captchaSessionId() {
  return Array.from({ length: 8 }, () => CAPTCHA_B58[Math.floor(Math.random() * CAPTCHA_B58.length)]).join('');
}

function updateCaptchaMeta(selected, required) {
  const meta = document.getElementById('captcha-puzzle-meta');
  if (meta) meta.textContent = t('{selected} / {required} selected', { selected, required });
}

function applyCaptchaI18n() {
  const setText = (sel, key) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = t(key);
  };

  setText('.captcha-head-title', '[ ACCESS GATE ]');

  const closeBtn = document.querySelector('.captcha-close');
  if (closeBtn) closeBtn.setAttribute('aria-label', t('Close'));

  const intro = document.getElementById('captcha-intro');
  if (intro) {
    const lines = intro.querySelectorAll('.captcha-line');
    if (lines[0]) lines[0].textContent = t('// tronsec human verification');
    if (lines[1]) lines[1].textContent = t('module: gatekeeper.sh');
    if (lines[2]) {
      const sid = document.getElementById('captcha-session-id');
      const sessionText = sid ? sid.textContent : '--------';
      lines[2].textContent = '';
      lines[2].append(document.createTextNode(`${t('session:')} `));
      const span = document.createElement('span');
      span.id = 'captcha-session-id';
      span.textContent = sessionText;
      lines[2].append(span);
    }
  }

  setText('#captcha-start-btn', '[ RUN CHECK ]');
  setText('.captcha-success-icon', '[ OK ]');
  setText('.captcha-success-title', 'ACCESS GRANTED');
  setText('.captcha-success-sub', 'session verified · proceeding');
  setText('.captcha-footnote-tag', 'protected');

  const vbtn = document.getElementById('captcha-verify-btn');
  if (vbtn) vbtn.textContent = t('[ VERIFY ]');

  const puzzle = document.getElementById('captcha-puzzle');
  const meta = document.getElementById('captcha-puzzle-meta');
  if (meta && puzzle && puzzle.classList.contains('hidden')) {
    meta.textContent = t('0 selected');
  }
}

function requireCaptcha(callback) {
  _captchaCallback = callback;
  const modal = document.getElementById('captcha-modal');
  resetCaptcha();
  modal.classList.remove('is-closing');
  modal.classList.remove('is-open');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => modal.classList.add('is-open'));
  });
}

function resetCaptcha() {
  const session = document.getElementById('captcha-session-id');
  if (session) session.textContent = captchaSessionId();
  document.getElementById('captcha-intro').classList.remove('hidden');
  document.getElementById('captcha-loading').classList.add('hidden');
  document.getElementById('captcha-puzzle').classList.add('hidden');
  document.getElementById('captcha-success').classList.add('hidden');
  const log = document.getElementById('captcha-log');
  if (log) log.innerHTML = '';
  document.getElementById('captcha-progress').style.width = '0%';
  setCaptchaBtn(false);
  applyCaptchaI18n();
}

function closeCaptcha(afterClose) {
  const modal = document.getElementById('captcha-modal');
  if (!modal.classList.contains('is-open') && !modal.classList.contains('is-closing')) {
    if (typeof afterClose === 'function') afterClose();
    return;
  }
  modal.classList.remove('is-open');
  modal.classList.add('is-closing');
  setTimeout(() => {
    modal.classList.remove('is-closing');
    _captchaCallback = null;
    if (typeof afterClose === 'function') afterClose();
  }, 320);
}

function startCaptchaCheck() {
  document.getElementById('captcha-intro').classList.add('hidden');
  const loading = document.getElementById('captcha-loading');
  const log = document.getElementById('captcha-log');
  const bar = document.getElementById('captcha-progress');
  loading.classList.remove('hidden');
  log.innerHTML = '';
  bar.style.width = '0%';
  let step = 0;
  const tick = () => {
    if (step >= CAPTCHA_LOG.length) {
      bar.style.width = '100%';
      setTimeout(generatePuzzle, 220);
      return;
    }
    const line = document.createElement('div');
    line.className = `captcha-log-line${CAPTCHA_LOG[step].ok ? ' is-ok' : ' is-warn'}`;
    line.textContent = t(CAPTCHA_LOG[step].text);
    log.appendChild(line);
    bar.style.width = `${Math.round(((step + 1) / CAPTCHA_LOG.length) * 100)}%`;
    step += 1;
    setTimeout(tick, 380 + Math.random() * 220);
  };
  tick();
}

function bindPuzzleBtn(btn, onToggle) {
  btn.addEventListener('click', () => {
    btn.classList.toggle('selected');
    onToggle();
  });
}

function generateIconPuzzle() {
  const target = CAPTCHA_SHAPES[Math.floor(Math.random() * CAPTCHA_SHAPES.length)];
  const count = 3 + Math.floor(Math.random() * 2);
  const correctIndices = new Set();
  while (correctIndices.size < count) correctIndices.add(Math.floor(Math.random() * 9));
  _captchaRequired = count;
  document.getElementById('puzzle-instruction').textContent = t('[ SELECT ] all {label} signatures', { label: t(target.label) });
  updateCaptchaMeta(0, count);

  const grid = document.getElementById('captcha-puzzle-grid');
  grid.innerHTML = '';
  setCaptchaBtn(false);
  const others = CAPTCHA_SHAPES.filter(s => s.id !== target.id);

  for (let i = 0; i < 9; i++) {
    const isTarget = correctIndices.has(i);
    const shape = isTarget ? target : others[Math.floor(Math.random() * others.length)];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'captcha-puzzle-btn';
    btn.innerHTML = captchaShapeIcon(shape.id);
    btn.dataset.correct = isTarget ? '1' : '0';
    bindPuzzleBtn(btn, () => {
      const selected = grid.querySelectorAll('.captcha-puzzle-btn.selected').length;
      updateCaptchaMeta(selected, count);
      setCaptchaBtn(selected > 0);
    });
    grid.appendChild(btn);
  }
}

function generatePuzzle() {
  document.getElementById('captcha-loading').classList.add('hidden');
  generateIconPuzzle();
  document.getElementById('captcha-puzzle').classList.remove('hidden');
}

function captchaShapeIcon(shape) {
  const icons = {
    hex: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/></svg>',
    key: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
    lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    zap: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>',
    eye: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  };
  return icons[shape] || icons.shield;
}

function failCaptcha() {
  showToast('[ GATE ] Invalid selection. Retry.');
  const grid = document.getElementById('captcha-puzzle-grid');
  grid.classList.add('captcha-shake');
  setTimeout(() => grid.classList.remove('captcha-shake'), 450);
  generatePuzzle();
}

function verifyCaptcha() {
  const btns = [...document.querySelectorAll('#captcha-puzzle-grid button')];
  const selected = btns.filter(b => b.classList.contains('selected'));
  if (!selected.length) return;

  const correctSelected = selected.filter(b => b.dataset.correct === '1').length;
  const wrongSelected = selected.filter(b => b.dataset.correct !== '1').length;
  const passed = wrongSelected === 0 && correctSelected >= _captchaRequired;
  if (!passed) {
    failCaptcha();
    return;
  }

  const cb = _captchaCallback;
  document.getElementById('captcha-puzzle').classList.add('hidden');
  document.getElementById('captcha-success').classList.remove('hidden');
  setCaptchaBtn(false);
  setTimeout(() => {
    closeCaptcha(() => { if (typeof cb === 'function') cb(); });
  }, 900);
}

// ============ REPORT SCAM ============
let selectedReportType = null;

const REPORT_TYPE_LABELS = {
    scam: 'Scam address',
    phish: 'Phishing URL',
    honeypot: 'Honeypot',
    fakeairdrop: 'Fake airdrop',
    impersonation: 'Impersonation',
    rugpull: 'Rug pull',
    malicious: 'Malicious dApp',
    other: 'Other',
};

function resetReportTypeButtons() {
    document.querySelectorAll('#report-type-group .report-type-btn').forEach(b => {
        b.classList.remove('report-type-active');
    });
}

function selectReportType(el, type) {
    resetReportTypeButtons();
    el.classList.add('report-type-active');
    selectedReportType = type;
}

function updateDescCounter() {
    const el = document.getElementById('report-desc');
    document.getElementById('report-desc-counter').textContent = `${el.value.length} / 500`;
}

function submitReport() {
    const target = document.getElementById('report-target').value.trim();
    if (!target) { flashInput(document.getElementById('report-target')); showToast(' Enter a target address or URL'); return; }
    if (!selectedReportType) { showToast(' Select a report type'); return; }
    const desc = document.getElementById('report-desc').value.trim();
    const links = document.getElementById('report-links').value.trim();
    const contact = document.getElementById('report-contact').value.trim();

    const formFields = document.getElementById('report-form-fields');
    const successBlock = document.getElementById('report-success');

    function clearForm() {
        document.getElementById('report-target').value = '';
        document.getElementById('report-desc').value = '';
        document.getElementById('report-links').value = '';
        document.getElementById('report-contact').value = '';
        document.getElementById('report-desc-counter').textContent = '0 / 500';
        selectedReportType = null;
        resetReportTypeButtons();
        successBlock.classList.add('hidden');
        formFields.classList.remove('hidden');
    }

    requireCaptcha(async () => {
        const lines = [];
        lines.push('<b>[ SCAM REPORT ]</b>');
        lines.push(`<b>Type:</b> ${esc(REPORT_TYPE_LABELS[selectedReportType] || selectedReportType)}`);
        lines.push(`<b>Target:</b> <code>${esc(target)}</code>`);
        if (desc) lines.push(`<b>Description:</b>\n${esc(desc)}`);
        if (links) lines.push(`<b>Evidence:</b>\n${esc(links)}`);
        if (contact) lines.push(`<b>Contact:</b> ${esc(contact)}`);

        const tgToken = (window.TRONSEC_KEYS && window.TRONSEC_KEYS.telegramBotToken) || '';
        const tgChat = (window.TRONSEC_KEYS && window.TRONSEC_KEYS.telegramChatId) || '';
        if (!tgToken || !tgChat) {
            showToast('Report backend not configured (API keys required)');
            return;
        }

        try {
            const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: tgChat,
                    text: lines.join('\n'),
                    parse_mode: 'HTML',
                }),
            });
            if (!res.ok) throw new Error('TG error ' + res.status);
            formFields.classList.add('hidden');
            successBlock.classList.remove('hidden');
            showToast('Report sent ✓');
        } catch (e) {
            showToast('Failed to send report — {message}', { message: e.message });
            clearForm();
        }
    });
}

function clearReportForm() {
    const section = document.getElementById('tab-report');
    animateModuleClear(section, () => {
        document.getElementById('report-target').value = '';
        document.getElementById('report-desc').value = '';
        document.getElementById('report-links').value = '';
        document.getElementById('report-contact').value = '';
        document.getElementById('report-desc-counter').textContent = '0 / 500';
        selectedReportType = null;
        resetReportTypeButtons();
        document.getElementById('report-success').classList.add('hidden');
        document.getElementById('report-form-fields').classList.remove('hidden');
    });
}

// ============ INIT ============
function allEntries() { return []; }

function getInitialTab() {
    const fromHash = window.location.hash.replace(/^#/, '');
    if (fromHash && document.getElementById(`tab-${fromHash}`)) return fromHash;
    loadAppState();
    return window.activeTab || 'scanner';
}

const TAB_PREFILL = {
    scanner: { inputId: 'wallet-input' },
    'aml-check': { inputId: 'aml-input' },
    approvals: { inputId: 'approvals-input' },
    'contract-scan': { inputId: 'contract-input' },
    'scan-url': { inputId: 'phish-input' },
    'tx-decoder': { inputId: 'tx-input' },
};

function applyScanPrefill() {
    let prefill = null;
    let prefillTab = window.location.hash.replace(/^#/, '') || 'scanner';

    try {
        const stored = sessionStorage.getItem('tronsec_scan');
        const storedTab = sessionStorage.getItem('tronsec_scan_tab');
        if (stored) prefill = stored;
        if (storedTab) prefillTab = storedTab;
        sessionStorage.removeItem('tronsec_scan');
        sessionStorage.removeItem('tronsec_scan_tab');
        sessionStorage.removeItem('tronsec_scan_autorun');
    } catch (_) {}

    const params = new URLSearchParams(window.location.search);
    if (!prefill) prefill = params.get('q');

    if (!prefill) return;
    if (!document.getElementById(`tab-${prefillTab}`)) prefillTab = 'scanner';

    switchTab(prefillTab);

    const cfg = TAB_PREFILL[prefillTab];
    if (!cfg) return;

    const applyValue = () => {
        const inp = document.getElementById(cfg.inputId);
        if (!inp) return;
        let val = prefill;
        if (prefillTab === 'scan-url' && val && !/^https?:\/\//i.test(val)) {
            val = 'https://' + val;
        }
        inp.value = val;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
    };

    applyValue();
    requestAnimationFrame(applyValue);

    if (params.has('q')) {
        const clean = window.location.pathname + (window.location.hash || '');
        history.replaceState(null, '', clean);
    }
}

// ============ INIT LOADER ============
function initLoaderSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function runInitLoader() {
    const loader = document.getElementById('init-loader');
    if (!loader) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await initLoaderSleep(reduced ? 320 : 1380);
    loader.classList.add('done');
    loader.setAttribute('aria-hidden', 'true');
    loader.setAttribute('aria-busy', 'false');
    window.setTimeout(() => loader.remove(), reduced ? 100 : 520);
}

window.addEventListener('DOMContentLoaded', () => {
    try {
        loadSavedTheme();
        syncAppBrandLink();
        initLangSwitcher();
        lucide.createIcons();
        switchTab(getInitialTab());

        try {
          applyScanPrefill();
        } catch (_) {}

        fetchFearGreedIndex();
        fetchMarketData();
        setInterval(fetchFearGreedIndex, 300000);
        setInterval(fetchTronNetworkStatus, 60000);
        setInterval(fetchMarketData, 60000);
        setInterval(fetchTokenActivity, 120000);
        setInterval(fetchSecurityMetrics, 300000);
    } finally {
        runInitLoader();
    }
});

window.addEventListener('hashchange', () => {
    if (_switchingTab) return;
    const tab = window.location.hash.replace(/^#/, '');
    if (tab && document.getElementById(`tab-${tab}`)) {
        switchTab(tab);
    }
});