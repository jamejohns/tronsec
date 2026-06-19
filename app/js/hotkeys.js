(function() {
  'use strict';

  var cmdActive = false;
  var cmdIdx = 0;
  var currentItems = [];

  var TRON_ADDR_RE = /\b(T[1-9A-HJ-NP-Za-km-z]{33})\b/;
  var URL_RE = /\b(https?:\/\/[^\s]+)\b/i;
  var DOMAIN_RE = /\b((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?)\b/i;
  var TX_RE = /\b([0-9a-fA-F]{64})\b/;

  var ADDR_ACTIONS = [
    { id: 'wallet',    tab: 'scanner',      name: 'Scan Wallet Portfolio', desc: 'Portfolio, tokens, staking & transactions',    inputId: 'wallet-input',   scanFn: 'walletScan',     icon: 'path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"', },
    { id: 'aml',       tab: 'aml-check',     name: 'Run AML Check',         desc: 'Risk scoring & counterparty analysis',        inputId: 'aml-input',      scanFn: 'amlScan',       icon: 'circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"' },
    { id: 'approvals', tab: 'approvals',     name: 'Check Approvals',       desc: 'TRC20 token allowances & unlimited approvals', inputId: 'approvals-input', scanFn: 'approvalsScan',  icon: 'rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"' },
    { id: 'contract',  tab: 'contract-scan', name: 'Audit Contract',        desc: 'Smart contract risk analysis',               inputId: 'contract-input',  scanFn: 'contractScan',   icon: 'path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><circle cx="11.5" cy="14.5" r="2.5"' },
  ];

  var URL_ACTIONS = [
    { id: 'phish', tab: 'scan-url', name: 'URL Phishing Scanner', desc: 'VirusTotal + heuristics + typosquatting', inputId: 'phish-input', scanFn: 'phishCheck', icon: 'circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"' },
  ];

  var TX_ACTIONS = [
    { id: 'txdec', tab: 'tx-decoder', name: 'TX Decoder', desc: 'Decode transaction hex or TXID', inputId: 'tx-input', scanFn: 'txDecode', icon: 'path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"', },
  ];

  var MODULES = [
    { id: 'scanner',       tab: 'scanner',      name: 'scanner.sh',       desc: 'Wallet Portfolio',         icon: 'path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"', },
    { id: 'analytics',     tab: 'analytics',     name: 'analytics.dash',   desc: 'TRON Chain Tracker',       icon: 'line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"' },
    { id: 'approvals-mod', tab: 'approvals',     name: 'approvals.py',     desc: 'Approvals Monitor',        icon: 'rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"' },
    { id: 'aml-mod',       tab: 'aml-check',     name: 'aml_check.log',    desc: 'AML Compliance Check',     icon: 'circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"' },
    { id: 'url-mod',       tab: 'scan-url',      name: 'scan_url.sh',      desc: 'URL Phishing Scanner',     icon: 'circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"' },
    { id: 'contract-mod',  tab: 'contract-scan', name: 'contract_scan.sh', desc: 'Contract Scan Engine',      icon: 'path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><circle cx="11.5" cy="14.5" r="2.5"' },
    { id: 'txdecoder-mod', tab: 'tx-decoder',    name: 'tx_decoder.hex',   desc: 'TX Decoder',               icon: 'path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"', },
    { id: 'report-mod',    tab: 'report',        name: 'report_scam.md',   desc: 'Report Scam',              icon: 'path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"' },
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
      if (!q || q.indexOf('connect') !== -1 || q.indexOf('wallet') !== -1) {
        items.push({ kind: 'wallet', data: { id: 'wallet-conn' } });
      }
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
    var s = document.createElement('style');
    s.textContent =
      '#cp-o{position:fixed;inset:0;z-index:9995;background:rgba(0,0,0,.55);backdrop-filter:blur(8px)}' +
      '#cp{position:fixed;top:15%;left:50%;transform:translateX(-50%);z-index:9996;' +
        'width:540px;max-width:calc(100vw - 32px);background:#111113;' +
        'border:1px solid rgba(255,255,255,.1);border-radius:12px;' +
        'box-shadow:0 24px 64px rgba(0,0,0,.5);' +
        'font-family:Inter,system-ui,sans-serif;' +
        'opacity:0;transform:translateX(-50%) translateY(-8px);' +
        'transition:opacity .15s,transform .15s;pointer-events:none}' +
      '#cp.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}' +
      '#cp .cp-h{padding:12px 16px;display:flex;align-items:center;gap:8px;' +
        'border-bottom:1px solid rgba(255,255,255,.06)}' +
      '#cp .cp-h .cp-prefix{font-size:13px;color:#a1a1aa;font-weight:500;white-space:nowrap;font-family:"JetBrains Mono",monospace}' +
      '#cp .cp-h input{flex:1;background:transparent;border:none;outline:none;' +
        'font-family:inherit;font-size:14px;color:#f5f5f7;font-weight:400}' +
      '#cp .cp-h input::placeholder{color:#52525b}' +
      '#cp .cp-badge{font-size:9px;font-weight:700;letter-spacing:.5px;padding:2px 6px;border-radius:3px;white-space:nowrap;display:none}' +
      '#cp .cp-badge.on{display:inline-block}' +
      '#cp .cp-badge.t-address{background:rgba(255,255,255,.08);color:#f5f5f7}' +
      '#cp .cp-badge.t-tx{background:rgba(168,85,247,0.12);color:#a855f7}' +
      '#cp .cp-badge.t-url{background:rgba(34,197,94,0.12);color:#22c55e}' +
      '#cp .cp-badge.t-domain{background:rgba(34,197,94,0.12);color:#22c55e}' +
      '#cp .cp-badge.t-text{background:rgba(148,163,184,0.12);color:#94a3b8}' +
      '#cp .cp-l{max-height:380px;overflow-y:auto;padding:6px 0}' +
      '#cp .cp-l::-webkit-scrollbar{width:5px}' +
      '#cp .cp-l::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:99px}' +
      '#cp .cp-i{padding:10px 16px;display:flex;align-items:center;gap:12px;' +
        'cursor:pointer;transition:all .1s;border-radius:8px;margin:0 6px}' +
      '#cp .cp-i:hover{background:rgba(255,255,255,.04)}' +
      '#cp .cp-i.sel{background:rgba(255,255,255,.06)}' +
      '#cp .cp-i .cp-ic{width:18px;height:18px;flex-shrink:0;color:#71717a}' +
      '#cp .cp-i .cp-ic svg{width:100%;height:100%}' +
      '#cp .cp-i.sel .cp-ic{color:#f5f5f7}' +
      '#cp .cp-i .cp-n{font-size:13px;font-weight:500;color:#f5f5f7;letter-spacing:-.01em}' +
      '#cp .cp-i .cp-d{font-size:12px;color:#71717a;margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;font-family:"JetBrains Mono",monospace}' +
      '#cp .cp-i.sel .cp-d{color:#a1a1aa}' +
      '#cp .cp-sep{padding:8px 16px 4px;font-size:11px;color:#52525b;font-weight:500;letter-spacing:.04em;text-transform:uppercase}' +
      '#cp .cp-empty{padding:20px 16px;font-size:13px;color:#71717a;text-align:center}' +
      '#cp .cp-f{padding:8px 16px;border-top:1px solid rgba(255,255,255,.06);display:flex;gap:16px}' +
      '#cp .cp-f span{font-size:9px;color:#475569;display:flex;align-items:center;gap:5px}' +
      '#cp .cp-f .cp-wallet-on{color:#22c55e;font-weight:700}' +
      '#cp .cp-f .cp-wallet-off{color:#64748b}' +
      '#cp .cp-f span kbd{font-family:inherit;font-size:8px;color:#64748b;' +
        'border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:2px 6px;font-weight:600}' +

      // light theme
      '.light-theme #cp-o{background:rgba(0,0,0,0.15)}' +
      '.light-theme #cp{background:#fff;border-color:#cbd5e1;box-shadow:none}' +
      '.light-theme #cp .cp-h{border-bottom-color:#cbd5e1}' +
      '.light-theme #cp .cp-h .cp-prefix{color:#52525b}' +
      '.light-theme #cp .cp-h input{color:#1e293b}' +
      '.light-theme #cp .cp-h input::placeholder{color:#94a3b8}' +
      '.light-theme #cp .cp-badge.t-address{background:rgba(0,0,0,.06);color:#52525b}' +
      '.light-theme #cp .cp-badge.t-tx{background:rgba(147,51,234,0.12);color:#9333ea}' +
      '.light-theme #cp .cp-badge.t-url,.light-theme #cp .cp-badge.t-domain{background:rgba(22,163,74,0.12);color:#16a34a}' +
      '.light-theme #cp .cp-badge.t-text{background:rgba(100,116,139,0.12);color:#64748b}' +
      '.light-theme #cp .cp-l::-webkit-scrollbar-thumb{background:#cbd5e1}' +
      '.light-theme #cp .cp-i:hover{background:rgba(0,0,0,.04)}' +
      '.light-theme #cp .cp-i.sel{background:rgba(0,0,0,.06)}' +
      '.light-theme #cp .cp-i .cp-ic{color:#94a3b8}' +
      '.light-theme #cp .cp-i.sel .cp-ic{color:#18181b}' +
      '.light-theme #cp .cp-i .cp-n{color:#1e293b}' +
      '.light-theme #cp .cp-i .cp-d{color:#94a3b8}' +
      '.light-theme #cp .cp-i.sel .cp-d{color:#52525b}' +
      '.light-theme #cp .cp-sep{color:#94a3b8}' +
      '.light-theme #cp .cp-empty{color:#94a3b8}' +
      '.light-theme #cp .cp-f{border-top-color:#cbd5e1}' +
      '.light-theme #cp .cp-f span{color:#94a3b8}' +
      '.light-theme #cp .cp-f span kbd{color:#64748b;border-color:#cbd5e1}';
    document.head.appendChild(s);
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function createDOM() {
    var o = document.createElement('div'); o.id = 'cp-o';
    var p = document.createElement('div'); p.id = 'cp';
    p.innerHTML =
      '<div class="cp-h"><span class="cp-prefix">' + t('Search') + '</span><input id="cp-inp" type="text" placeholder="' + escHtml(t('paste address / TXID / contract / URL or type to filter')) + '" spellcheck="false" autocomplete="off"><span id="cp-badge" class="cp-badge"></span></div>' +
      '<div class="cp-l" id="cp-l"></div>' +
      '<div class="cp-f"><span><kbd>\u2191</kbd><kbd>\u2193</kbd> ' + t('navigate') + '</span><span><kbd>\u21B5</kbd> ' + t('select') + '</span><span><kbd>esc</kbd> ' + t('close') + '</span></div>';
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
      if (item.kind === 'wallet') {
        d.className = 'cp-i tron-cnnctAprBtn' + (isSel ? ' sel' : '');
        d.innerHTML =
          '<span class="cp-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg></span>' +
          '<span class="cp-n">' + t('wallet.connect') + '</span>' +
          '<span class="cp-d">' + t('Connect TRON wallet') + '</span>';
        d.dataset.idx = realIdx;
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
        return;
      }

      d.className = 'cp-i' + (isSel ? ' sel' : '');
      d.dataset.idx = realIdx;

      d.innerHTML =
        '<span class="cp-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><' + item.data.icon + '/></svg></span>' +
        '<span class="cp-n">' + escHtml(t(item.data.name)) + '</span>' +
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

    var els = createDOM();
    window._cpEls = els;

    currentItems = buildResults('');
    renderList(currentItems, 0);

    setTimeout(function() { els.p.classList.add('show'); }, 10);

    var inp = document.getElementById('cp-inp');
    if (!inp) return;
    inp.focus();

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
    var els = window._cpEls;
    if (els) {
      els.p.classList.remove('show');
      setTimeout(function() {
        if (els.o && els.o.parentNode) els.o.parentNode.removeChild(els.o);
        if (els.p && els.p.parentNode) els.p.parentNode.removeChild(els.p);
      }, 150);
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', css);
  } else {
    css();
  }
})();
