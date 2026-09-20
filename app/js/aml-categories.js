// AML risk category taxonomy — TronScan tags, secAcc flags, known addresses.
(function () {
  'use strict';

  const AML_CATEGORY_ORDER = [
    'sanctions', 'scam_fraud', 'mixer', 'hack_exploit', 'blacklisted', 'fraud_onchain',
    'gambling', 'unknown_risk', 'exchange', 'defi', 'bridge', 'spam_dust',
  ];

  const AML_CATEGORY_META = {
    sanctions:      { severity: 'critical', badge: 'b-red',   label: 'Sanctions',      color: '#ef4444' },
    scam_fraud:     { severity: 'high',     badge: 'b-red',   label: 'Scam / fraud',   color: '#fb7185' },
    mixer:          { severity: 'high',     badge: 'b-red',   label: 'Mixer / privacy', color: '#f43f5e' },
    hack_exploit:   { severity: 'high',     badge: 'b-red',   label: 'Hack / exploit', color: '#e11d48' },
    blacklisted:    { severity: 'high',     badge: 'b-red',   label: 'Stablecoin blacklist', color: '#dc2626' },
    fraud_onchain:  { severity: 'high',     badge: 'b-red',   label: 'Fraud activity', color: '#f87171' },
    gambling:       { severity: 'medium',   badge: 'b-amber', label: 'Gambling',       color: '#f59e0b' },
    unknown_risk:   { severity: 'medium',   badge: 'b-amber', label: 'Security flag',  color: '#fbbf24' },
    exchange:       { severity: 'info',     badge: 'b-cyan',  label: 'Exchange',       color: '#22d3ee' },
    defi:           { severity: 'info',     badge: 'b-cyan',  label: 'DeFi / DEX',     color: '#38bdf8' },
    bridge:         { severity: 'info',     badge: 'b-cyan',  label: 'Bridge',         color: '#06b6d4' },
    spam_dust:      { severity: 'low',      badge: 'b-ghost', label: 'Spam / dust',    color: '#71717a' },
  };

  const AML_GRAPH_FALLBACK = {
    danger: '#fb7185',
    warn: '#fbbf24',
    safe: '#34d399',
    center: '#f5f5f7',
  };

  const AML_RISK_TAG_RE = /scam|phish|fraud|blacklist|sanction|malicious|hack|exploit|mixer|rug|drain|honeypot/i;
  const AML_SANCTION_TAG_RE = /ofac|sdn|sanction/i;

  const AML_ADDRESS_BOOK_ENTRIES = [
    ['TNJVzGqKBWkJxJB5XYSqGAwUTV15U24pPq', { category: 'defi', label: 'SunSwap Router' }],
    ['TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax', { category: 'defi', label: 'SunSwap Router' }],
    ['TKWJdrQkqHisa1X8HUdHEfREvTzw4pMAaY', { category: 'defi', label: 'SunSwap Factory' }],
    ['TCFNp179Lg46D16zKoumd4Poa2WFFdtqYj', { category: 'defi', label: 'SUN Smart Router' }],
    ['TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S', { category: 'defi', label: 'SUN' }],
    ['TJ4NNy8x6a2KJ4Ap9R9YTkPJ73R2JvN8xq', { category: 'exchange', label: 'Binance' }],
    ['THPvaUhoh4q8SF59m74avMWz642aZ6m5c5', { category: 'exchange', label: 'Binance' }],
    ['TKHuVq1oKQLXTkdQ59xKf7g4v6pKgjL1ug', { category: 'exchange', label: 'HTX' }],
    ['TQrY8tryqsYHD76AMAxYcVp9dLXqXpU3f', { category: 'exchange', label: 'OKX' }],
    ['TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', { category: 'exchange', label: 'Poloniex' }],
    ['TYASr5UV6HEcXatwdFQfmLVUqQQzvNgz9i', { category: 'exchange', label: 'KuCoin' }],
    ['TAUUPGQqR8WCVL88Ap9qoHk5XGrHsmNGJQ', { category: 'bridge', label: 'Allbridge' }],
  ];
  const AML_ADDRESS_BOOK = new Map(
    AML_ADDRESS_BOOK_ENTRIES.map(([addr, meta]) => [addr.toLowerCase(), meta]),
  );

  function amlCategoryMeta(id) {
    return AML_CATEGORY_META[id] || null;
  }

  function amlCatLabel(id) {
    const meta = amlCategoryMeta(id);
    return meta ? t(meta.label) : id;
  }

  function amlCategoryColor(id) {
    return amlCategoryMeta(id)?.color || AML_GRAPH_FALLBACK.safe;
  }

  const AML_MAX_SINGLE_TRANSFER_USD = 500_000_000;

  function amlFormatExposureUsd(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 1e15) return '';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    if (n >= 100) return '$' + Math.round(n);
    if (n >= 1) return '$' + n.toFixed(0);
    return '$' + n.toFixed(2);
  }

  function amlRawAmountToNumber(amount, decimals) {
    if (amount == null || amount === '') return null;
    const dec = Math.min(Math.max(parseInt(decimals, 10) || 6, 0), 18);
    if (typeof isUnlimitedApproval === 'function' && isUnlimitedApproval(amount, dec)) return null;
    try {
      const big = typeof amount === 'bigint' ? amount : BigInt(String(amount));
      if (big <= 0n) return null;
      const scale = BigInt(10 ** dec);
      const whole = Number(big / scale);
      const frac = Number(big % scale) / Number(scale);
      const out = whole + frac;
      return Number.isFinite(out) && out > 0 ? out : null;
    } catch (_) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n / Math.pow(10, dec);
    }
  }

  function amlTransferVolumeUsd(dt, trxPriceUsd) {
    if (!dt) return null;
    if (dt.isStable) {
      const usd = amlRawAmountToNumber(dt.amount, dt.tokenDecimals ?? 6);
      if (usd == null || usd > AML_MAX_SINGLE_TRANSFER_USD) return null;
      return usd;
    }
    if (!dt.isTrc20) {
      const sun = Number(dt.amount) || 0;
      if (!sun) return null;
      const px = Number(trxPriceUsd);
      if (!Number.isFinite(px) || px <= 0) return null;
      const usd = (sun / 1e6) * px;
      if (!Number.isFinite(usd) || usd <= 0 || usd > AML_MAX_SINGLE_TRANSFER_USD) return null;
      return usd;
    }
    return null;
  }

  function amlCategoryRank(id) {
    const idx = AML_CATEGORY_ORDER.indexOf(id);
    return idx >= 0 ? AML_CATEGORY_ORDER.length - idx : 0;
  }

  function isAmlHighRiskCategory(id) {
    const sev = amlCategoryMeta(id)?.severity;
    return sev === 'critical' || sev === 'high';
  }

  function isAmlKnownEntityCategory(id) {
    return id === 'exchange' || id === 'defi' || id === 'bridge';
  }

  function classifyAmlTagText(tagName) {
    const s = String(tagName || '').trim();
    if (!s) return null;
    const tl = s.toLowerCase();
    if (AML_SANCTION_TAG_RE.test(tl)) return 'sanctions';
    if (/mixer|tumbler|privacy\s*pool|coinjoin|coin\s*join/i.test(tl)) return 'mixer';
    if (/scam|phish|fraud|rug|honeypot|drain|drainer|fake/i.test(tl)) return 'scam_fraud';
    if (/hack|exploit|steal|stolen|malicious/i.test(tl)) return 'hack_exploit';
    if (/casino|gambl|betting|lottery|wager/i.test(tl)) return 'gambling';
    if (/blacklist/i.test(tl)) return 'blacklisted';
    if (/spam|airdrop|advert|memo/i.test(tl)) return 'spam_dust';
    if (/exchange|cex|hot\s*wallet|deposit|withdraw/i.test(tl)) return 'exchange';
    if (/bridge|cross.?chain/i.test(tl)) return 'bridge';
    if (/dex|swap|defi|protocol|liquidity/i.test(tl)) return 'defi';
    if (AML_RISK_TAG_RE.test(s)) return 'unknown_risk';
    if (/verified|known|legit/i.test(tl)) return 'exchange';
    return null;
  }

  function isAmlTransferDust(d) {
    if (!d) return false;
    if (d.isStable) return false;
    if (d.isTrc20) return true;
    return typeof isMicroTrxSun === 'function' && isMicroTrxSun(d.amount);
  }

  function amlPeerTransferProfile(peerAddr, directTransfers) {
    const rows = (directTransfers || []).filter((d) => sameTronAddr(d.peer, peerAddr));
    let inbound = 0;
    let outbound = 0;
    let allInboundDust = true;
    for (const d of rows) {
      if (d.inbound) {
        inbound += 1;
        if (!isAmlTransferDust(d)) allInboundDust = false;
      }
      if (d.outbound) outbound += 1;
    }
    return {
      inbound,
      outbound,
      inboundOnly: inbound > 0 && outbound === 0,
      allInboundDust: inbound > 0 && allInboundDust,
      hasInteraction: rows.length > 0,
    };
  }

  /** TronScan has_fraud_transaction often marks mass-dust senders — not a real counterparty risk. */
  function isAmlPeerLikelyDustSpammer(secAcc, peerAddr, directTransfers) {
    if (!secAcc) return false;
    if (secAcc.send_ad_by_memo || secAcc.has_cheat_transaction) return true;
    if (!secAcc.has_fraud_transaction || secAcc.fraud_token_creator) return false;
    if (typeof isAmlPeerInboundDustHeavy === 'function' && isAmlPeerInboundDustHeavy(peerAddr, directTransfers)) {
      return true;
    }
    const prof = amlPeerTransferProfile(peerAddr, directTransfers);
    if (!prof.hasInteraction) return true;
    if (prof.inboundOnly && prof.allInboundDust) return true;
    return false;
  }

  function isAmlSubjectDustVictim(secAcc) {
    if (!secAcc?.has_fraud_transaction || secAcc.fraud_token_creator) return false;
    return !!(secAcc.send_ad_by_memo || secAcc.has_cheat_transaction);
  }

  function classifyAmlSecAccHits(secAcc) {
    const hits = [];
    if (!secAcc) return hits;
    const redTag = String(secAcc.red_tag || secAcc.redTag || '').trim();
    if (/suspicious/i.test(redTag)) {
      hits.push({ category: 'scam_fraud', source: 'secAcc', detail: redTag || 'Suspicious' });
    }
    if (secAcc.is_black_list) {
      hits.push({ category: 'blacklisted', source: 'secAcc', detail: 'USDT/USDC blacklist' });
    }
    if (secAcc.has_fraud_transaction && !isAmlSubjectDustVictim(secAcc)) {
      hits.push({ category: 'fraud_onchain', source: 'secAcc', detail: 'fraud transactions' });
    }
    if (secAcc.fraud_token_creator) {
      hits.push({ category: 'fraud_onchain', source: 'secAcc', detail: 'fraud token creator' });
    }
    if (secAcc.has_cheat_transaction || secAcc.send_ad_by_memo || isAmlSubjectDustVictim(secAcc)) {
      hits.push({ category: 'spam_dust', source: 'secAcc', detail: 'spam / ad activity' });
    }
    return hits;
  }

  function classifyAmlPeerSecAccHits(secAcc, peerAddr, directTransfers) {
    const hits = [];
    if (!secAcc) return hits;
    const dustSpammer = isAmlPeerLikelyDustSpammer(secAcc, peerAddr, directTransfers);
    const redTag = String(secAcc.red_tag || secAcc.redTag || '').trim();
    if (/suspicious/i.test(redTag)) {
      hits.push({ category: 'scam_fraud', source: 'secAcc', detail: redTag || 'Suspicious' });
    }
    if (secAcc.is_black_list) {
      hits.push({ category: 'blacklisted', source: 'secAcc', detail: 'USDT/USDC blacklist' });
    }
    if (secAcc.has_fraud_transaction) {
      if (dustSpammer && !secAcc.fraud_token_creator) {
        hits.push({ category: 'spam_dust', source: 'secAcc', detail: 'dust broadcaster' });
      } else {
        hits.push({ category: 'fraud_onchain', source: 'secAcc', detail: 'fraud transactions' });
      }
    }
    if (secAcc.fraud_token_creator) {
      hits.push({ category: 'fraud_onchain', source: 'secAcc', detail: 'fraud token creator' });
    }
    if (secAcc.has_cheat_transaction || secAcc.send_ad_by_memo) {
      if (!hits.some((h) => h.category === 'spam_dust')) {
        hits.push({ category: 'spam_dust', source: 'secAcc', detail: 'spam / ad activity' });
      }
    }
    return hits;
  }

  function shouldPreferSpamOverPeerFraud(entry) {
    return entry?.category === 'fraud_onchain' && entry.detail === 'fraud transactions';
  }

  function getAmlAddressBookEntry(addr) {
    const key = String(addr || '').toLowerCase();
    return AML_ADDRESS_BOOK.get(key) || null;
  }

  function buildAmlSubjectCategories(secAcc, tagAcc) {
    const hits = [...classifyAmlSecAccHits(secAcc)];
    for (const tag of normalizeTagList(tagAcc)) {
      const tagName = (typeof tag === 'string' ? tag : (tag.tagName || tag.tag || tag.label || ''));
      const cat = classifyAmlTagText(tagName);
      if (cat) hits.push({ category: cat, source: 'tag', detail: tagName });
    }
    const seen = new Set();
    return hits.filter((h) => {
      if (seen.has(h.category)) return false;
      seen.add(h.category);
      return true;
    });
  }

  function buildAmlPeerCategoryHits(addr, secAcc, tagAcc, directTransfers = []) {
    const hits = [];
    const book = getAmlAddressBookEntry(addr);
    if (book) {
      hits.push({ addr, category: book.category, source: 'addressBook', detail: book.label });
    }
    for (const h of classifyAmlPeerSecAccHits(secAcc, addr, directTransfers)) {
      hits.push({ addr, category: h.category, source: h.source, detail: h.detail });
    }
    for (const tag of normalizeTagList(tagAcc)) {
      const tagName = (typeof tag === 'string' ? tag : (tag.tagName || tag.tag || tag.label || ''));
      const cat = classifyAmlTagText(tagName);
      if (cat) hits.push({ addr, category: cat, source: 'tag', detail: tagName });
    }
    return hits;
  }

  function amlPeerCategoryIndex(peerCategories) {
    const byAddr = new Map();
    for (const pc of peerCategories || []) {
      if (!pc?.addr || !pc.category) continue;
      const prev = byAddr.get(pc.addr);
      if (!prev) {
        byAddr.set(pc.addr, pc);
        continue;
      }
      if (pc.category === 'spam_dust' && shouldPreferSpamOverPeerFraud(prev)) {
        byAddr.set(pc.addr, pc);
        continue;
      }
      if (prev.category === 'spam_dust' && shouldPreferSpamOverPeerFraud(pc)) {
        continue;
      }
      if (amlCategoryRank(pc.category) > amlCategoryRank(prev.category)) {
        byAddr.set(pc.addr, pc);
      }
    }
    return byAddr;
  }

  function buildAmlExposureBreakdown({
    subjectCategories = [], peerCategories = [], directTransfers = [], dustPeers = [],
    trxPriceUsd = null,
  }) {
    const buckets = Object.fromEntries(AML_CATEGORY_ORDER.map((id) => [id, {
      id,
      peerAddrs: new Set(),
      transferCount: 0,
      volumeUsd: 0,
      subject: false,
    }]));

    for (const sc of subjectCategories) {
      if (buckets[sc.category]) buckets[sc.category].subject = true;
    }

    const peerByAddr = amlPeerCategoryIndex(peerCategories);
    for (const [addr, pc] of peerByAddr) {
      if (buckets[pc.category]) buckets[pc.category].peerAddrs.add(addr);
    }

    for (const addr of dustPeers || []) {
      if (buckets.spam_dust) buckets.spam_dust.peerAddrs.add(addr);
    }

    const addrCats = new Map(peerByAddr);
    for (const dt of directTransfers || []) {
      const peer = dt?.peer;
      if (!peer) continue;
      const pc = addrCats.get(peer);
      const cat = pc?.category || (dustPeers?.includes(peer) ? 'spam_dust' : null);
      if (!cat || !buckets[cat]) continue;
      buckets[cat].transferCount += 1;
      const usd = amlTransferVolumeUsd(dt, trxPriceUsd);
      if (usd != null && usd > 0) buckets[cat].volumeUsd += usd;
    }

    const rows = AML_CATEGORY_ORDER
      .map((id) => {
        const b = buckets[id];
        const meta = amlCategoryMeta(id);
        return {
          id,
          label: amlCatLabel(id),
          severity: meta?.severity || 'info',
          badge: meta?.badge || 'b-ghost',
          color: meta?.color || AML_GRAPH_FALLBACK.safe,
          peerCount: b.peerAddrs.size,
          transferCount: b.transferCount,
          volumeUsd: b.volumeUsd,
          subject: b.subject,
        };
      })
      .filter((row) => row.subject || row.peerCount > 0 || row.transferCount > 0 || row.volumeUsd > 0);

    const totalVolumeUsd = rows.reduce((sum, row) => sum + (row.volumeUsd || 0), 0);
    if (totalVolumeUsd > 0) {
      for (const row of rows) {
        row.volumeShare = row.volumeUsd > 0 ? row.volumeUsd / totalVolumeUsd : 0;
      }
    }
    return rows;
  }

  function amlExposureSeverityClass(severity) {
    if (severity === 'critical' || severity === 'high') return 'is-high';
    if (severity === 'medium') return 'is-med';
    if (severity === 'info') return 'is-info';
    return 'is-muted';
  }

  function amlExposurePanel(breakdown, peersPending) {
    const subtitle = t('Category breakdown · volume in analyzed sample');
    if (peersPending) {
      return amlBlock(
        t('Risk exposure'),
        '<div class="aml-empty">' + esc(t('Analyzing counterparties…')) + '</div>',
        subtitle,
      );
    }
    if (!breakdown?.length) {
      return amlBlock(
        t('Risk exposure'),
        '<div class="aml-empty">' + esc(t('No categorized risk exposure in the analyzed sample')) + '</div>',
        subtitle,
      );
    }
    const totalVolumeUsd = breakdown.reduce((sum, row) => sum + (row.volumeUsd || 0), 0);
    const hasVolume = totalVolumeUsd > 0;
    const rows = breakdown.map((row) => {
      const sevCls = amlExposureSeverityClass(row.severity);
      const stats = [];
      if (row.volumeUsd > 0) stats.push(amlFormatExposureUsd(row.volumeUsd));
      if (row.subject) stats.push(t('This address'));
      if (row.peerCount > 0) {
        stats.push(row.peerCount === 1
          ? t('1 counterparty')
          : t('{count} counterparties', { count: row.peerCount }));
      }
      if (row.transferCount > 0) {
        stats.push(row.transferCount === 1
          ? t('1 transfer')
          : t('{count} transfers', { count: row.transferCount }));
      }
      const barPct = hasVolume && row.volumeShare > 0
        ? Math.max(4, Math.round(row.volumeShare * 100))
        : 0;
      const barHtml = barPct
        ? `<div class="aml-exposure-bar" aria-hidden="true"><span style="width:${barPct}%;background:${esc(row.color || amlCategoryColor(row.id))}"></span></div>`
        : '';
      return `<div class="aml-exposure-row ${sevCls}">
        <span class="aml-exposure-dot" aria-hidden="true" style="background:${esc(row.color || amlCategoryColor(row.id))}"></span>
        <div class="aml-exposure-main">
          <div class="aml-exposure-head">
            <span class="aml-exposure-label">${esc(row.label)}</span>
            <span class="aml-exposure-stats">${esc(stats.join(' · ') || '—')}</span>
          </div>
          ${barHtml}
        </div>
      </div>`;
    }).join('');
    return amlBlock(
      t('Risk exposure'),
      `<div class="aml-exposure-list">${rows}</div>`,
      subtitle,
    );
  }

  function isGraphBenignCategory(categoryId) {
    return categoryId === 'exchange' || categoryId === 'defi' || categoryId === 'bridge';
  }

  function resolveAmlGraphNodeStyle(addr, count, flaggedSet, categoryMap, targetAddr) {
    if (addr === targetAddr) {
      return {
        type: 'center',
        color: AML_GRAPH_FALLBACK.center,
        category: null,
        tag: null,
        benign: false,
      };
    }
    const catEntry = categoryMap?.get(addr);
    const category = catEntry?.category || null;
    if (category) {
      return {
        type: 'cat-' + category,
        color: amlCategoryColor(category),
        category,
        tag: amlCatLabel(category),
        benign: isGraphBenignCategory(category),
      };
    }
    if (flaggedSet.has(addr)) {
      return {
        type: 'danger',
        color: AML_GRAPH_FALLBACK.danger,
        category: null,
        tag: t('Flagged'),
        benign: false,
      };
    }
    if (count > 20) {
      return {
        type: 'warn',
        color: AML_GRAPH_FALLBACK.warn,
        category: null,
        tag: t('Watch'),
        benign: false,
      };
    }
    return {
      type: 'safe',
      color: AML_GRAPH_FALLBACK.safe,
      category: null,
      tag: t('OK'),
      benign: true,
    };
  }

  function amlPeerCategoryBadge(categoryId) {
    if (!categoryId) return '';
    const meta = amlCategoryMeta(categoryId);
    if (!meta) return '';
    return `<span class="badge ${meta.badge} aml-peer-cat">${esc(amlCatLabel(categoryId))}</span>`;
  }

  window.AML_CATEGORY_ORDER = AML_CATEGORY_ORDER;
  window.AML_CATEGORY_META = AML_CATEGORY_META;
  window.classifyAmlTagText = classifyAmlTagText;
  window.classifyAmlSecAccHits = classifyAmlSecAccHits;
  window.classifyAmlPeerSecAccHits = classifyAmlPeerSecAccHits;
  window.isAmlPeerLikelyDustSpammer = isAmlPeerLikelyDustSpammer;
  window.isAmlSubjectDustVictim = isAmlSubjectDustVictim;
  window.buildAmlSubjectCategories = buildAmlSubjectCategories;
  window.buildAmlPeerCategoryHits = buildAmlPeerCategoryHits;
  window.buildAmlExposureBreakdown = buildAmlExposureBreakdown;
  window.amlPeerCategoryIndex = amlPeerCategoryIndex;
  window.getAmlAddressBookEntry = getAmlAddressBookEntry;
  window.isAmlHighRiskCategory = isAmlHighRiskCategory;
  window.isAmlKnownEntityCategory = isAmlKnownEntityCategory;
  window.amlExposurePanel = amlExposurePanel;
  window.amlPeerCategoryBadge = amlPeerCategoryBadge;
  window.amlCatLabel = amlCatLabel;
  window.amlCategoryColor = amlCategoryColor;
  window.amlFormatExposureUsd = amlFormatExposureUsd;
  window.amlTransferVolumeUsd = amlTransferVolumeUsd;
  window.isGraphBenignCategory = isGraphBenignCategory;
  window.resolveAmlGraphNodeStyle = resolveAmlGraphNodeStyle;
  window.AML_GRAPH_FALLBACK = AML_GRAPH_FALLBACK;
})();
