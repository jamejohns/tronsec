(function() {
  'use strict';

  var cmdActive = false;
  var cmdIdx = 0;
  var currentItems = [];

  var TRON_ADDR_RE = /\b(T[1-9A-HJ-NP-Za-km-z]{33})\b/;
  var URL_RE = /\b(https?:\/\/[^\s]+)\b/i;
  var DOMAIN_RE = /\b((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?)\b/i;
  var TX_RE = /\b([0-9a-fA-F]{64})\b/;

const CP_FINGERPRINT = 'path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"';
const CP_KEY_ICON = 'path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"';
const CP_SEARCH = 'circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"';
const CP_LOCK = 'rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"';
const CP_FILE = 'path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><circle cx="11.5" cy="14.5" r="2.5"';
const CP_GLOBE = 'circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"';
const CP_CODE = 'path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"';
const CP_BARS = 'line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"';
const CP_WAND = 'path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"';
const CP_FLAG = 'path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"';

  function cpIconHtml(icon) {
    return '<span class="cp-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><' + icon + '/></svg></span>';
  }

  var ADDR_ACTIONS = [
    { id: 'wallet',    tab: 'scanner',      name: 'Wallet scanner', desc: 'Portfolio, tokens, staking & transactions',    file: 'scanner.sh',       inputId: 'wallet-input',   scanFn: 'walletScan',     icon: CP_FINGERPRINT },
    { id: 'aml',       tab: 'aml-check',     name: 'AML check',         desc: 'Risk scoring & counterparty analysis',        file: 'aml_check.log',    inputId: 'aml-input',      scanFn: 'amlScan',       icon: CP_SEARCH },
    { id: 'approvals', tab: 'approvals',     name: 'Approvals monitor',       desc: 'TRC20 token allowances & unlimited approvals', file: 'approvals.py',     inputId: 'approvals-input', scanFn: 'approvalsScan',  icon: CP_LOCK },
    { id: 'permissions', tab: 'permissions', name: 'Permission auditor',     desc: 'Account Permission Auditor', file: 'permissions.keys', inputId: 'permissions-input', scanFn: 'permissionsScan', icon: CP_KEY_ICON },
    { id: 'contract',  tab: 'contract-scan', name: 'Contract scan',        desc: 'Smart contract risk analysis',               file: 'contract_scan.sh', inputId: 'contract-input',  scanFn: 'contractScan',   icon: CP_FILE },
  ];

  var URL_ACTIONS = [
    { id: 'phish', tab: 'scan-url', name: 'URL Phishing Scanner', desc: 'VirusTotal + heuristics + typosquatting', file: 'scan_url.sh', inputId: 'phish-input', scanFn: 'phishCheck', icon: CP_GLOBE },
  ];

  var TX_ACTIONS = [
    { id: 'txdec', tab: 'tx-decoder', name: 'TX Decoder', desc: 'Decode transaction hex or TXID', file: 'tx_decoder.hex', inputId: 'tx-input', scanFn: 'txDecode', icon: CP_CODE },
  ];

  var MODULES = [
    { id: 'scanner',       tab: 'scanner',      name: 'Wallet scanner',       file: 'scanner.sh',       desc: 'Wallet Portfolio',         icon: CP_FINGERPRINT },
    { id: 'analytics',     tab: 'analytics',     name: 'Analytics',   file: 'analytics.dash',   desc: 'TRON Chain Tracker',       icon: CP_BARS },
    { id: 'approvals-mod', tab: 'approvals',     name: 'Approvals monitor',     file: 'approvals.py',     desc: 'Approvals Monitor',        icon: CP_LOCK },
    { id: 'aml-mod',       tab: 'aml-check',     name: 'AML check',    file: 'aml_check.log',    desc: 'AML Compliance Check',     icon: CP_SEARCH },
    { id: 'permissions-mod', tab: 'permissions', name: 'Permission auditor', file: 'permissions.keys', desc: 'Account Permission Auditor', icon: CP_KEY_ICON },
    { id: 'url-mod',       tab: 'scan-url',      name: 'URL scanner',      file: 'scan_url.sh',      desc: 'URL Phishing Scanner',     icon: CP_GLOBE },
    { id: 'contract-mod',  tab: 'contract-scan', name: 'Contract scan', file: 'contract_scan.sh', desc: 'Contract Scan Engine',      icon: CP_FILE },
    { id: 'txdecoder-mod', tab: 'tx-decoder',    name: 'TX decoder',   file: 'tx_decoder.hex',   desc: 'TX Decoder',               icon: CP_CODE },
    { id: 'vanity-mod',    tab: 'vanity',        name: 'Vanity Address Generator',       file: 'vanity.gen',       desc: 'Vanity Address Generator', icon: CP_WAND },
    { id: 'report-mod',    tab: 'report',        name: 'Report scam',   file: 'report_scam.md',   desc: 'Report Scam',              icon: CP_FLAG },
  ];

  function detectContent(text) {
    if (!text || !text.trim()) return { type: 'empty', value: null, query: '' };
    var t = text.trim();

    var m = t.match(TRON_ADDR_RE);
    if (m) return { type: 'address', value: m[1], query: t.replace(m[1], '').trim() };

    m = t.match(URL_RE);
    if (m) return { type: 'url', value: m[1], query: t.replace(m[1], '').trim() };

    m = t.match(DOMAIN_RE);
    if (m) return { type: 'url', value: m[1], query: t.replace(m[1], '').trim() };

    m = t.match(TX_RE);
    if (m) return { type: 'tx', value: m[1], query: t.replace(m[1], '').trim() };

    return { type: 'text', value: t, query: '' };
  }

  function buildResults(text) {
    var detected = detectContent(text);
    var items = [];

    if (detected.type === 'address') {
      ADDR_ACTIONS.forEach(function(a) {
        items.push({ kind: 'action', data: a, value: detected.value });
      });
      var q = detected.query.toLowerCase();
      var matched = [];
      MODULES.forEach(function(m) {
        if (!q || m.name.toLowerCase().indexOf(q) !== -1 || m.desc.toLowerCase().indexOf(q) !== -1) {
          matched.push({ kind: 'module', data: m, value: null });
        }
      });
      if (matched.length) {
        items.push({ kind: 'sep' });
        matched.forEach(function(m) { items.push(m); });
      }
    } else if (detected.type === 'url') {
      URL_ACTIONS.forEach(function(a) {
        items.push({ kind: 'action', data: a, value: detected.value });
      });
      var uq = detected.query.toLowerCase();
      var umatched = [];
      MODULES.forEach(function(m) {
        if (!uq || m.name.toLowerCase().indexOf(uq) !== -1 || m.desc.toLowerCase().indexOf(uq) !== -1) {
          umatched.push({ kind: 'module', data: m, value: null });
        }
      });
      if (umatched.length) {
        items.push({ kind: 'sep' });
        umatched.forEach(function(m) { items.push(m); });
      }
    } else if (detected.type === 'tx') {
      TX_ACTIONS.forEach(function(a) {
        items.push({ kind: 'action', data: a, value: detected.value });
      });
      var tq = detected.query.toLowerCase();
      var tmatched = [];
      MODULES.forEach(function(m) {
        if (!tq || m.name.toLowerCase().indexOf(tq) !== -1 || m.desc.toLowerCase().indexOf(tq) !== -1) {
          tmatched.push({ kind: 'module', data: m, value: null });
        }
      });
      if (tmatched.length) {
        items.push({ kind: 'sep' });
        tmatched.forEach(function(m) { items.push(m); });
      }
    } else {
      var q = (detected.value || '').toLowerCase();
      MODULES.forEach(function(m) {
        if (!q || m.name.toLowerCase().indexOf(q) !== -1 || m.desc.toLowerCase().indexOf(q) !== -1) {
          items.push({ kind: 'module', data: m, value: null });
        }
      });
    }

    return items;
  }

  function executeItem(item) {
    closeCmd();
    var data = item.data;
    var val = item.value;

    if (typeof switchTab !== 'undefined' && data.tab) switchTab(data.tab);

    if (item.kind === 'action' && val && data.inputId && data.scanFn && window[data.scanFn]) {
      setTimeout(function() {
        var inp = document.getElementById(data.inputId);
        if (inp) inp.value = val;
        setTimeout(function() { window[data.scanFn](); }, 60);
      }, 100);
    }
  }

  function css() {
    /* Command palette styles live in styles-tron.css */
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function createDOM() {
    var o = document.createElement('div'); o.id = 'cp-o';
    var p = document.createElement('div'); p.id = 'cp';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'true');
    p.setAttribute('aria-label', typeof t === 'function' ? t('Quick actions') : 'Quick actions');
    p.innerHTML =
      '<div class="cp-h"><span class="cp-prefix">' + t('Search') + '</span><input id="cp-inp" type="text" placeholder="' + escHtml(t('paste address / TXID / contract / URL or type to filter')) + '" spellcheck="false" autocomplete="off"><span id="cp-badge" class="cp-badge"></span></div>' +
      '<div class="cp-l" id="cp-l"></div>' +
      '<div class="cp-f">' +
        '<span class="cp-f-item"><kbd>\u2191</kbd><kbd>\u2193</kbd><span class="cp-f-label">' + t('navigate') + '</span></span>' +
        '<span class="cp-f-item"><kbd>\u21B5</kbd><span class="cp-f-label">' + t('select') + '</span></span>' +
        '<span class="cp-f-item"><kbd>esc</kbd><span class="cp-f-label">' + t('close') + '</span></span>' +
      '</div>';
    document.body.appendChild(o);
    document.body.appendChild(p);
    return { o: o, p: p };
  }

  function renderList(items, sel) {
    var list = document.getElementById('cp-l');
    list.innerHTML = '';
    var selIdx = 0;

    items.forEach(function(item, realIdx) {
      if (item.kind === 'sep') {
        var sep = document.createElement('div');
        sep.className = 'cp-sep';
        sep.textContent = t('// MODULES');
        list.appendChild(sep);
        return;
      }

      var isSel = (selIdx === sel);
      var d = document.createElement('div');
      if (item.kind === 'wallet') return;

      d.className = 'cp-i' + (isSel ? ' sel' : '');
      d.dataset.idx = realIdx;

      var fileLabel = item.data.file || item.data.id;
      d.innerHTML =
        cpIconHtml(item.data.icon) +
        '<span class="cp-n">' + escHtml(fileLabel) + '</span>' +
        '<span class="cp-d">' + escHtml(t(item.data.desc)) + '</span>';

      d.addEventListener('click', (function(it) {
        return function() { executeItem(it); };
      })(item));

      d.addEventListener('mouseenter', (function(idx) {
        return function() {
          document.querySelectorAll('.cp-i').forEach(function(el) { el.classList.remove('sel'); });
          this.classList.add('sel');
          cmdIdx = idx;
        };
      })(selIdx));

      list.appendChild(d);
      selIdx++;
    });

    if (!list.hasChildNodes()) {
      list.innerHTML = '<div class="cp-empty">' + escHtml(t('No matching results')) + '</div>';
    }
  }

  function countSelectable(items) {
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind !== 'sep') n++;
    }
    return n;
  }

  function openCmd() {
    if (cmdActive) return;
    cmdActive = true;
    cmdIdx = 0;
    currentItems = [];
    window._cpPrevFocus = document.activeElement;

    var els = createDOM();
    window._cpEls = els;

    currentItems = buildResults('');
    renderList(currentItems, 0);

    requestAnimationFrame(function() {
      els.o.classList.add('is-open');
      els.p.classList.add('show');
    });

    var inp = document.getElementById('cp-inp');
    if (!inp) return;
    inp.focus();

    if (typeof trapFocus === 'function') {
      window._cpReleaseFocus = trapFocus(els.p, {
        initialFocus: inp,
        onEscape: closeCmd,
      });
    }

    inp.addEventListener('input', function() {
      currentItems = buildResults(this.value);
      var n = countSelectable(currentItems);
      if (cmdIdx >= n) cmdIdx = Math.max(0, n - 1);
      if (cmdIdx < 0) cmdIdx = 0;
      renderList(currentItems, cmdIdx);

      var badge = document.getElementById('cp-badge');
      if (!badge) return;
      var detected = detectContent(this.value);
      var label = '';
      var cls = '';
      if (detected.type === 'address') { label = t('ADDRESS'); cls = 't-address'; }
      else if (detected.type === 'tx') { label = t('TX'); cls = 't-tx'; }
      else if (detected.type === 'url') {
        if (this.value.match(/^https?:\/\//i)) { label = t('URL'); cls = 't-url'; }
        else { label = t('DOMAIN'); cls = 't-domain'; }
      }
      else if (detected.type === 'text' && detected.value) { label = t('FILTER'); cls = 't-text'; }
      badge.textContent = label;
      badge.className = 'cp-badge' + (label ? ' on ' + cls : '');
    });

    inp.addEventListener('keydown', function(e) {
      var items = document.querySelectorAll('.cp-i');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!items.length) return;
        cmdIdx = (cmdIdx + 1) % items.length;
        items.forEach(function(el) { el.classList.remove('sel'); });
        items[cmdIdx].classList.add('sel');
        items[cmdIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        cmdIdx = (cmdIdx - 1 + items.length) % items.length;
        items.forEach(function(el) { el.classList.remove('sel'); });
        items[cmdIdx].classList.add('sel');
        items[cmdIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var sel = document.querySelector('.cp-i.sel');
        if (sel) {
          var idx = parseInt(sel.dataset.idx);
          if (!isNaN(idx) && currentItems[idx]) {
            executeItem(currentItems[idx]);
          }
        }
      } else if (e.key === 'Escape') {
        closeCmd();
      }
    });

    els.o.addEventListener('click', closeCmd);
  }

  function closeCmd() {
    if (!cmdActive) return;
    cmdActive = false;
    if (typeof window._cpReleaseFocus === 'function') {
      window._cpReleaseFocus();
      window._cpReleaseFocus = null;
    }
    var els = window._cpEls;
    if (els) {
      els.o.classList.remove('is-open');
      els.p.classList.remove('show');
      setTimeout(function() {
        if (els.o && els.o.parentNode) els.o.parentNode.removeChild(els.o);
        if (els.p && els.p.parentNode) els.p.parentNode.removeChild(els.p);
        var prev = window._cpPrevFocus;
        window._cpPrevFocus = null;
        if (prev && typeof prev.focus === 'function') prev.focus();
      }, 180);
      window._cpEls = null;
    }
  }

  document.addEventListener('keydown', function(e) {
    var tag = e.target && e.target.tagName;
    var isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if ((e.key === '/' || e.code === 'Slash') && !isInput && !cmdActive) {
      e.preventDefault();
      openCmd();
      return;
    }

    if (e.key === 'Escape' && cmdActive) {
      e.preventDefault();
      closeCmd();
      return;
    }
  });

  window.openCommandPalette = openCmd;

  function bindMobileCmdBtn() {
    /* Quick actions live in sidebar (desktop) and / hotkey; not in mobile More sheet. */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      css();
      bindMobileCmdBtn();
    });
  } else {
    css();
    bindMobileCmdBtn();
  }
})();
