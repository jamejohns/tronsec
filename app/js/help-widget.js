// ==================================
//  HELP & SUPPORT
// ==================================

(function () {
  'use strict';

  const SUPPORT_TG = (window.TRONSEC_BRAND && window.TRONSEC_BRAND.founderTelegram)
    || 'https://t.me/tronsec_james';

  let panelOpen = false;
  let closeTimer = null;

  function resetHelpSheetTransform() {
    const panel = getEl('help-widget-panel');
    if (!panel) return;
    panel.classList.remove('is-dragging');
    panel.style.removeProperty('transform');
  }

  function initHelpWidgetDrag() {
    const panel = getEl('help-widget-panel');
    if (!panel || panel.dataset.dragBound === '1') return;
    panel.dataset.dragBound = '1';

    const grab = panel.querySelector('.help-widget-grab');
    const head = panel.querySelector('.help-widget-head');
    if (!grab) return;

    let startY = 0;
    let dragDy = 0;
    let dragging = false;
    let activePointer = null;

    function canStartDrag(target) {
      return target && !target.closest('.help-widget-close');
    }

    function onPointerDown(e) {
      if (!panelOpen || !panel.classList.contains('show')) return;
      if (!canStartDrag(e.target)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      activePointer = e.pointerId;
      startY = e.clientY;
      dragDy = 0;
      panel.classList.add('is-dragging');
      if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
      if (!dragging || e.pointerId !== activePointer) return;
      dragDy = Math.max(0, e.clientY - startY);
      panel.style.transform = `translate3d(0, ${dragDy}px, 0)`;
    }

    function onPointerEnd(e) {
      if (!dragging || e.pointerId !== activePointer) return;
      dragging = false;
      activePointer = null;
      panel.classList.remove('is-dragging');
      if (dragDy > 72) {
        panel.style.removeProperty('transform');
        closeHelpWidget();
        return;
      }
      panel.style.removeProperty('transform');
      dragDy = 0;
    }

    [grab, head].forEach((el) => {
      if (!el) return;
      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerEnd);
      el.addEventListener('pointercancel', onPointerEnd);
    });
  }

  function tSafe(key, vars) {
    if (typeof t !== 'function') return key;
    return t(key, vars || {});
  }

  function escHtml(value) {
    if (typeof window.esc === 'function') return window.esc(value);
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function getShell() {
    const overlay = getEl('help-o');
    const panel = getEl('help-widget-panel');
    return overlay && panel ? { overlay, panel } : null;
  }

  function renderHelpContent() {
    const scroll = getEl('help-widget-scroll');
    if (!scroll) return;

    scroll.innerHTML = `
      <div class="help-support">
        <div class="help-support-card">
          <span class="help-support-kicker">support.desk</span>
          <p class="help-support-text">${escHtml(tSafe("Noticed suspicious activity, missing funds, or a transaction you didn't authorize? Reach out to us on Telegram — our team will help you investigate."))}</p>
          <a id="help-support-link" href="${escHtml(SUPPORT_TG)}" target="_blank" rel="noopener noreferrer" class="wallet-action-btn wallet-action-btn--ext help-support-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
            <span>${escHtml(tSafe('Message us on Telegram'))}</span>
          </a>
        </div>
        <p class="help-support-note">${escHtml(tSafe('Do not send your seed phrase or private key.'))}</p>
      </div>
    `;
  }

  function releaseHelpFocus() {
    if (typeof window._helpReleaseFocus === 'function') {
      window._helpReleaseFocus();
      window._helpReleaseFocus = null;
    }
  }

  function syncHelpBodyLock(open) {
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    document.body.classList.toggle('help-widget-open', !!(open && isMobile));
  }

  function setPanelOpen(open) {
    const shell = getShell();
    if (!shell) return;
    const { overlay, panel } = shell;
    const toggles = document.querySelectorAll('.help-widget-trigger');

    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    if (open) {
      panelOpen = true;
      resetHelpSheetTransform();
      syncHelpBodyLock(true);
      toggles.forEach((btn) => {
        btn.classList.add('is-active');
        btn.setAttribute('aria-expanded', 'true');
      });
      panel.classList.remove('hidden');
      requestAnimationFrame(() => {
        overlay.classList.add('is-open');
        panel.classList.add('show');
      });
      const closeBtn = getEl('help-widget-close');
      if (typeof trapFocus === 'function') {
        window._helpReleaseFocus = trapFocus(panel, {
          initialFocus: closeBtn || panel,
          onEscape: closeHelpWidget,
        });
      }
      return;
    }

    panelOpen = false;
    resetHelpSheetTransform();
    syncHelpBodyLock(false);
    toggles.forEach((btn) => {
      btn.classList.remove('is-active');
      btn.setAttribute('aria-expanded', 'false');
    });
    releaseHelpFocus();
    overlay.classList.remove('is-open');
    panel.classList.remove('show');
    closeTimer = setTimeout(() => {
      if (!panelOpen) panel.classList.add('hidden');
      const prev = window._helpPrevFocus;
      window._helpPrevFocus = null;
      if (prev && typeof prev.focus === 'function') prev.focus();
      closeTimer = null;
    }, 260);
  }

  function closeHelpWidget() {
    if (!panelOpen) return;
    setPanelOpen(false);
  }

  function openHelpWidget() {
    window._helpPrevFocus = document.activeElement;
    renderHelpContent();
    setPanelOpen(true);
  }

  function toggleHelpWidget() {
    if (panelOpen) closeHelpWidget();
    else openHelpWidget();
  }

  function bindActions() {
    const panel = getEl('help-widget-panel');
    if (!panel || panel.dataset.bound === '1') return;
    panel.dataset.bound = '1';

    document.querySelectorAll('.help-widget-trigger').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof closeMobileMoreMenu === 'function') closeMobileMoreMenu();
        toggleHelpWidget();
      });
    });

    getEl('help-widget-close')?.addEventListener('click', closeHelpWidget);
    getEl('help-o')?.addEventListener('click', closeHelpWidget);
  }

  function refreshHelpWidgetI18n() {
    const title = getEl('help-widget-title');
    if (title) title.textContent = tSafe('Help & support');

    document.querySelectorAll('.help-widget-trigger').forEach((btn) => {
      const label = tSafe('Help & support');
      btn.setAttribute('aria-label', label);
      if (btn.id === 'help-widget-toggle') btn.title = label;
    });

    renderHelpContent();
    const supportLink = getEl('help-support-link');
    if (supportLink) supportLink.href = SUPPORT_TG;
  }

  window.openHelpWidget = openHelpWidget;
  window.toggleHelpWidget = toggleHelpWidget;
  window.closeHelpWidget = closeHelpWidget;
  window.initHelpWidget = function initHelpWidget() {
    bindActions();
    initHelpWidgetDrag();
    refreshHelpWidgetI18n();
    const panel = getEl('help-widget-panel');
    if (panel) panel.dataset.ready = '1';
  };

  window.refreshHelpWidgetI18n = refreshHelpWidgetI18n;
}());
