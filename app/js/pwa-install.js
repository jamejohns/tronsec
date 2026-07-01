(function () {
  'use strict';

  const DISMISS_KEY = 'tronsec-pwa-install-dismissed';
  const MOBILE_MQ = window.matchMedia('(max-width: 767px)');
  let deferredPrompt = null;
  let modalEl = null;
  let boundBtn = null;

  function translate(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function isIos() {
    const ua = window.navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  }

  function isDismissed() {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function dismissInstall() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch (e) { /* ignore */ }
  }

  function refreshIcons() {
    if (window.lucide) lucide.createIcons();
  }

  function isMobileNav() {
    return MOBILE_MQ.matches;
  }

  function ensureButton() {
    let btn = document.getElementById('pwa-install-btn');
    if (btn) return btn;

    const actions = document.querySelector('.app-header-actions');
    const themeBtn = actions?.querySelector('button[onclick*="toggleTheme"]');
    if (!actions || !themeBtn) return null;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'pwa-install-btn';
    btn.className = 'app-header-btn app-header-icon hidden';
    btn.setAttribute('aria-hidden', 'true');
    btn.innerHTML = '<i data-lucide="layout-grid" class="w-4 h-4"></i>';
    actions.insertBefore(btn, themeBtn);

    const label = translate('Install app');
    btn.title = label;
    btn.setAttribute('aria-label', label);
    return btn;
  }

  function showButton(btn) {
    if (!isMobileNav()) {
      hideButton(btn);
      return;
    }
    btn.classList.remove('hidden');
    btn.setAttribute('aria-hidden', 'false');
    refreshIcons();
  }

  function hideButton(btn) {
    btn.classList.add('hidden');
    btn.setAttribute('aria-hidden', 'true');
  }

  function ensureModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement('div');
    modalEl.id = 'pwa-install-modal';
    modalEl.className = 'pwa-install-overlay';
    modalEl.innerHTML = `
      <div class="pwa-install-card" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
        <button type="button" class="pwa-install-close" aria-label="">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
        <div class="pwa-install-brand">
          <img src="/assets/brand/android-chrome-192x192.png" alt="" width="40" height="40">
        </div>
        <h2 id="pwa-install-title" class="pwa-install-title"></h2>
        <p class="pwa-install-lead"></p>
        <ol class="pwa-install-steps">
          <li><span class="pwa-install-step-num">1</span><span data-pwa-step="1"></span></li>
          <li><span class="pwa-install-step-num">2</span><span data-pwa-step="2"></span></li>
          <li><span class="pwa-install-step-num">3</span><span data-pwa-step="3"></span></li>
        </ol>
        <button type="button" class="pwa-install-cta"></button>
      </div>
    `;
    document.body.appendChild(modalEl);

    const closeBtn = modalEl.querySelector('.pwa-install-close');
    const ctaBtn = modalEl.querySelector('.pwa-install-cta');

    closeBtn.addEventListener('click', closeIosModal);
    ctaBtn.addEventListener('click', closeIosModal);
    modalEl.addEventListener('click', (event) => {
      if (event.target === modalEl) closeIosModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modalEl.classList.contains('is-open')) closeIosModal();
    });

    return modalEl;
  }

  function fillModalCopy() {
    const modal = ensureModal();
    modal.querySelector('.pwa-install-close').setAttribute('aria-label', translate('Close'));
    modal.querySelector('.pwa-install-title').textContent = translate('Install TRONSEC');
    modal.querySelector('.pwa-install-lead').textContent = translate(
      'Add TRONSEC to your home screen for quick access.'
    );
    modal.querySelector('[data-pwa-step="1"]').textContent = translate('Tap the Share button');
    modal.querySelector('[data-pwa-step="2"]').textContent = translate('Select Add to Home Screen');
    modal.querySelector('[data-pwa-step="3"]').textContent = translate('Tap Add');
    modal.querySelector('.pwa-install-cta').textContent = translate('Got it');
    refreshIcons();
  }

  function openIosModal() {
    if (!isMobileNav()) return;
    fillModalCopy();
    modalEl.classList.remove('is-closing');
    modalEl.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    refreshIcons();
  }

  function closeIosModal() {
    if (!modalEl || !modalEl.classList.contains('is-open')) return;
    modalEl.classList.add('is-closing');
    modalEl.classList.remove('is-open');
    document.body.style.overflow = '';
    dismissInstall();
    window.setTimeout(() => {
      if (modalEl) modalEl.classList.remove('is-closing');
    }, 320);
  }

  async function triggerInstall() {
    if (!isMobileNav()) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (e) { /* ignore */ }
      deferredPrompt = null;
      const btn = document.getElementById('pwa-install-btn');
      if (btn) hideButton(btn);
      return;
    }
    if (isIos()) openIosModal();
  }

  function bindButton(btn) {
    if (boundBtn === btn) return;
    boundBtn = btn;
    btn.addEventListener('click', triggerInstall);
  }

  function init() {
    if (isStandalone() || isDismissed()) return;

    const btn = ensureButton();
    if (!btn) return;

    bindButton(btn);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!isMobileNav()) {
          hideButton(btn);
          return;
        }
        if (isIos() || deferredPrompt) showButton(btn);
      }, 120);
    });

    if (!isMobileNav()) return;

    if (isIos()) {
      showButton(btn);
      return;
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      showButton(btn);
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      hideButton(btn);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
