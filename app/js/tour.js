(function () {
  'use strict';

  if (localStorage.getItem('TRONSEC_tour_done')) return;
  if (localStorage.getItem('TRONSEC_tour_hidden')) return;

  const steps = [
    {
      title: 'Welcome to TRONSEC',
      text: 'Read-only security terminal for TRON. Scan wallets, audit contracts, decode transactions, and check URLs before you sign anything — no wallet connection required.',
      tab: null,
      nav: null,
    },
    {
      title: 'Wallet scanner',
      text: 'Paste any TRON address to view portfolio value, TRC-20 holdings, staking, bandwidth and energy meters, security flags, and recent activity.',
      tab: 'scanner',
      nav: 'scanner',
    },
    {
      title: 'Analytics',
      text: 'Live chain economics, TRX market data, USDT transfer volume, and network health — energy pricing, accounts, nodes, and peak TPS.',
      tab: 'analytics',
      nav: 'analytics',
    },
    {
      title: 'Approvals monitor',
      text: 'Audit active TRC-20 allowances on any wallet. Surface unlimited approvals and unknown spenders before they can move your tokens.',
      tab: 'approvals',
      nav: 'approvals',
    },
    {
      title: 'AML check',
      text: 'Behavioral risk screening on the latest 400 transactions — composite score, concentration, counterparty graph, and watchlist matches.',
      tab: 'aml-check',
      nav: 'aml-check',
    },
    {
      title: 'URL & contract scan',
      text: 'Screen phishing links with multi-engine reputation checks, then audit smart contract ABIs for mint, pause, blacklist, and ownership risks.',
      tab: 'scan-url',
      nav: 'scan-url',
    },
    {
      title: 'TX decoder',
      text: 'Paste a transaction ID to decode TRC-20 transfers, token approvals, contract calls, fees, and automated risk heuristics.',
      tab: 'tx-decoder',
      nav: 'tx-decoder',
    },
    {
      title: 'You\'re all set',
      text: 'Explore modules from the sidebar on desktop or bottom nav on mobile. Press / to open the command palette and jump anywhere instantly.',
      tab: 'scanner',
      nav: null,
    },
  ];

  let currentStep = 0;
  let destroyed = false;
  let card, autoTimer;

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clearHL() {
    document.querySelectorAll('.tour-nav-hl').forEach(el => el.classList.remove('tour-nav-hl'));
  }

  function applyHL(navId) {
    if (!navId) return;
    document.querySelectorAll(`[data-tab-btn="${navId}"]`).forEach(el => {
      el.classList.add('tour-nav-hl');
    });
  }

  function progressPct(idx, total) {
    return Math.max(8, Math.round(((idx + 1) / total) * 100));
  }

  function render() {
    if (destroyed || !card) return;

    const step = steps[currentStep];
    const total = steps.length;
    const isFirst = currentStep === 0;
    const isLast = currentStep === total - 1;
    const pct = progressPct(currentStep, total);

    card.innerHTML = `
      <div class="tour-progress" aria-hidden="true">
        <div class="tour-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="tour-head">
        <span class="tour-kicker">${t('[ ONBOARDING ]')}</span>
        <span class="tour-step">${currentStep + 1} / ${total}</span>
      </div>
      <div class="tour-body">
        <div class="tour-title">${esc(t(step.title))}</div>
        <p class="tour-text">${esc(t(step.text))}</p>
      </div>
      <div class="tour-foot">
        <button type="button" class="tour-btn tour-btn--ghost" data-a="skip">${t('[ SKIP ]')}</button>
        <div class="tour-foot-actions">
          ${isFirst ? '' : '<button type="button" class="tour-btn tour-btn--ghost" data-a="prev">' + t('[ BACK ]') + '</button>'}
          ${isLast
            ? '<button type="button" class="tour-btn tour-btn--primary" data-a="done">' + t('[ DONE ]') + '</button>'
            : '<button type="button" class="tour-btn tour-btn--primary" data-a="next">' + t('[ NEXT ]') + '</button>'}
        </div>
      </div>`;

    card.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const action = btn.getAttribute('data-a');
        if (action === 'next') go(currentStep + 1);
        else if (action === 'prev') go(currentStep - 1);
        else if (action === 'done') destroy();
        else if (action === 'skip') hide();
      });
    });
  }

  function go(idx) {
    if (destroyed) return;
    if (idx < 0 || idx >= steps.length) {
      destroy();
      return;
    }

    clearHL();
    currentStep = idx;
    const step = steps[idx];

    if (step.tab && typeof switchTab === 'function') {
      switchTab(step.tab);
    }

    render();
    applyHL(step.nav);
    resetAutoHide();
  }

  function hide() {
    if (destroyed) return;
    clearHL();
    localStorage.setItem('TRONSEC_tour_hidden', '1');
    closeCard();
  }

  function destroy() {
    if (destroyed) return;
    clearHL();
    destroyed = true;
    localStorage.setItem('TRONSEC_tour_done', '1');
    closeCard();
  }

  function closeCard() {
    clearTimeout(autoTimer);
    if (!card) return;
    card.classList.remove('is-visible');
    setTimeout(() => {
      if (card && card.parentNode) card.parentNode.removeChild(card);
      card = null;
    }, 280);
  }

  function resetAutoHide() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(hide, 45000);
  }

  function start() {
    card = document.createElement('div');
    card.id = 'tour-card';
    card.className = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', t('Product tour'));
    document.body.appendChild(card);

    go(0);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => card.classList.add('is-visible'));
    });

    card.addEventListener('mouseenter', () => clearTimeout(autoTimer));
    card.addEventListener('mouseleave', resetAutoHide);
  }

  function waitAndStart() {
    const loader = document.getElementById('init-loader');
    if (!loader || loader.classList.contains('done')) {
      setTimeout(start, 600);
      return;
    }
    const obs = new MutationObserver(() => {
      if (loader.classList.contains('done')) {
        obs.disconnect();
        setTimeout(start, 600);
      }
    });
    obs.observe(loader, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitAndStart);
  } else {
    waitAndStart();
  }
})();
