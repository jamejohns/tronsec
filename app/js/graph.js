// -- Interactive force-directed counterparty graph --
function amlGraphLegendId(node) {
  if (!node || node.type === 'center') return '__center__';
  if (node.category) return 'cat:' + node.category;
  if (node.type === 'danger') return 'sig:flagged';
  if (node.type === 'warn') return 'sig:watch';
  return 'sig:uncategorized';
}

function buildAmlGraphLegendEntries(nodes, fallback) {
  const buckets = new Map();
  const catRank = typeof AML_CATEGORY_ORDER !== 'undefined'
    ? (id) => {
      const idx = AML_CATEGORY_ORDER.indexOf(id);
      return idx >= 0 ? AML_CATEGORY_ORDER.length - idx : 0;
    }
    : () => 0;

  for (const n of nodes) {
    if (n.type === 'center') continue;
    const id = amlGraphLegendId(n);
    let label = n.tag || t('OK');
    let isBenign = !!n.benign;
    if (n.category && typeof amlCatLabel === 'function') {
      label = amlCatLabel(n.category);
      isBenign = typeof isGraphBenignCategory === 'function'
        ? isGraphBenignCategory(n.category) || n.category === 'spam_dust'
        : isBenign;
    } else if (id === 'sig:flagged') {
      label = t('Flagged');
      isBenign = false;
    } else if (id === 'sig:watch') {
      label = t('Watch');
      isBenign = false;
    } else if (id === 'sig:uncategorized') {
      label = t('Uncategorized');
      isBenign = true;
    }
    const prev = buckets.get(id) || {
      id,
      label,
      color: n.color || fallback.safe,
      isBenign,
      count: 0,
      sortKey: n.category ? catRank(n.category) + 100 : (isBenign ? 0 : 50),
    };
    prev.count += 1;
    buckets.set(id, prev);
  }

  return [...buckets.values()].sort((a, b) => b.sortKey - a.sortKey || a.label.localeCompare(b.label));
}

function renderAMLGraph(containerId, targetAddr, peers, peerFlags, directTransfers, txCount, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container || peers.length < 1) return;
  const selfFlagged = !!opts.selfFlagged;
  const trxPriceUsd = opts.trxPriceUsd ?? (typeof TRX_PRICE === 'number' ? TRX_PRICE : null);
  const categoryMap = typeof amlPeerCategoryIndex === 'function'
    ? amlPeerCategoryIndex(opts.peerCategories || [])
    : new Map();
  const resolveStyle = typeof resolveAmlGraphNodeStyle === 'function'
    ? resolveAmlGraphNodeStyle
    : null;
  const fallback = typeof AML_GRAPH_FALLBACK !== 'undefined'
    ? AML_GRAPH_FALLBACK
    : { danger: '#fb7185', warn: '#fbbf24', safe: '#34d399', center: '#f5f5f7' };

  const root = container.closest('.aml-graph-root') || container.parentElement;
  root.querySelectorAll('.aml-graph-stats, .aml-graph-foot').forEach(el => el.remove());
  if (container._simCleanup) container._simCleanup();
  container.innerHTML = '';
  container.style.position = 'relative';

  const volMap = {};
  const volUsdMap = {};
  for (const d of directTransfers) {
    const peer = d.peer;
    if (!peer) continue;
    const usd = typeof amlTransferVolumeUsd === 'function'
      ? amlTransferVolumeUsd(d, trxPriceUsd)
      : null;
    if (usd != null && usd > 0) {
      volUsdMap[peer] = (volUsdMap[peer] || 0) + usd;
      continue;
    }
    if (d.isTrc20) continue;
    const amt = Number(d.amount) || 0;
    if (!amt) continue;
    volMap[peer] = (volMap[peer] || 0) + amt;
  }

  const shortAddr = a => a.slice(0, 6) + '...' + a.slice(-4);
  const flaggedSet = new Set(peerFlags);
  const maxTx = Math.max(1, ...peers.map(p => p[1]));

  function nodeStyle(addr, count) {
    if (resolveStyle) return resolveStyle(addr, count, flaggedSet, categoryMap, targetAddr);
    if (addr === targetAddr) return { type: 'center', color: fallback.center, category: null, tag: null, benign: false };
    if (flaggedSet.has(addr)) return { type: 'danger', color: fallback.danger, category: null, tag: t('Flagged'), benign: false };
    if (count > 20) return { type: 'warn', color: fallback.warn, category: null, tag: t('Watch'), benign: false };
    return { type: 'safe', color: fallback.safe, category: null, tag: t('OK'), benign: true };
  }

  const centerStyle = nodeStyle(targetAddr, 0);
  let nodes = [{
    id: targetAddr,
    label: t('You'),
    type: centerStyle.type,
    category: centerStyle.category,
    tag: centerStyle.tag,
    benign: centerStyle.benign,
    color: centerStyle.color,
    txCount: 0,
    volume: 0,
    volumeUsd: 0,
    selfFlagged,
  }];
  for (const [addr, count] of peers) {
    const style = nodeStyle(addr, count);
    nodes.push({
      id: addr,
      label: shortAddr(addr),
      type: style.type,
      category: style.category,
      tag: style.tag,
      benign: style.benign,
      color: style.color,
      txCount: count,
      volume: volMap[addr] || 0,
      volumeUsd: volUsdMap[addr] || 0,
    });
  }

  let links = peers.map(([addr, count]) => {
    const targetNode = nodes.find(n => n.id === addr);
    return {
      source: targetAddr,
      target: addr,
      value: count,
      volume: volMap[addr] || 0,
      volumeUsd: volUsdMap[addr] || 0,
      color: targetNode?.color || fallback.safe,
      dash: targetNode?.type === 'warn',
    };
  });

  const rect = container.getBoundingClientRect();
  let width = rect.width || 600;
  const height = Math.max(280, Math.min(400, width * 0.55));

  const legendEntries = buildAmlGraphLegendEntries(nodes, fallback);
  const disabledLegendIds = new Set();
  let activePreset = 'all';

  function resolveLinkNode(link, end) {
    const ref = link[end];
    return ref && typeof ref === 'object' ? ref : nodes.find((n) => n.id === ref);
  }

  function isHiddenNode(d) {
    if (!d || d.type === 'center') return false;
    return disabledLegendIds.has(amlGraphLegendId(d));
  }

  function visiblePeerCount() {
    return nodes.filter((n) => n.type !== 'center' && !isHiddenNode(n)).length;
  }

  function applyFilter() {
    nodeG.attr('opacity', (d) => (isHiddenNode(d) ? 0.1 : 1));
    nodeG.selectAll('circle, text').attr('pointer-events', (d) => (isHiddenNode(d) ? 'none' : 'auto'));
    link.attr('opacity', (d) => (isHiddenNode(resolveLinkNode(d, 'target')) ? 0.05 : 0.45));
    linkLabel.attr('opacity', (d) => (isHiddenNode(resolveLinkNode(d, 'target')) ? 0 : 0.85));
  }

  function syncLegendUi(footEl) {
    const total = nodes.length - 1;
    const visible = visiblePeerCount();
    const countEl = footEl.querySelector('.aml-graph-visible-count');
    if (countEl) {
      countEl.textContent = t('Showing {visible} of {total}', { visible, total });
    }
    footEl.querySelectorAll('.aml-graph-preset-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.preset === activePreset);
    });
    footEl.querySelectorAll('.aml-graph-legend-chip').forEach((chip) => {
      const off = disabledLegendIds.has(chip.dataset.legendId);
      chip.classList.toggle('is-off', off);
      chip.setAttribute('aria-pressed', off ? 'false' : 'true');
    });
  }

  function setPreset(preset, footEl) {
    activePreset = preset;
    disabledLegendIds.clear();
    if (preset === 'risk') {
      for (const entry of legendEntries) {
        if (entry.isBenign) disabledLegendIds.add(entry.id);
      }
    }
    applyFilter();
    syncLegendUi(footEl);
  }

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])
    .attr('class', 'aml-graph-svg');

  const g = svg.append('g');

  const tooltip = d3.select(container)
    .append('div')
    .attr('class', 'aml-graph-tooltip');

  svg.call(d3.zoom()
    .scaleExtent([0.4, 5])
    .on('zoom', event => { g.attr('transform', event.transform); })
  );

  const link = g.selectAll('line.link')
    .data(links)
    .enter().append('line')
    .attr('class', 'link')
    .attr('stroke', d => d.color || fallback.safe)
    .attr('stroke-width', d => Math.max(1.5, (d.value / maxTx) * 4))
    .attr('stroke-opacity', 0.45)
    .attr('stroke-dasharray', d => d.dash ? '4,4' : null);

  const linkLabel = g.selectAll('text.link-label')
    .data(links)
    .enter().append('text')
    .attr('class', 'link-label')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', '9px')
    .attr('font-family', 'var(--mono)')
    .attr('fill', '#71717a')
    .text(d => {
      const volUsd = d.volumeUsd > 0 && typeof amlFormatExposureUsd === 'function'
        ? amlFormatExposureUsd(d.volumeUsd)
        : '';
      const volTrx = d.volume > 0 ? fmtVolume(d.volume) + ' TRX' : '';
      const volPart = volUsd || volTrx;
      return d.value + ' tx' + (volPart ? ' · ' + volPart : '');
    });

  const nodeG = g.selectAll('g.node')
    .data(nodes)
    .enter().append('g')
    .attr('class', d => `node node--${d.type}`)
    .attr('cursor', d => d.type === 'center' ? 'default' : 'pointer')
    .call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      })
    );

  const rScale = d => d.type === 'center' ? 26 : Math.max(16, Math.min(24, 12 + (d.txCount / maxTx) * 12));

  nodeG.append('circle')
    .attr('class', 'node-circle')
    .attr('r', rScale)
    .attr('fill', d => d.type === 'center' ? 'rgba(255,255,255,.95)' : d.color)
    .attr('fill-opacity', d => d.type === 'center' ? 1 : 0.12)
    .attr('stroke', d => d.type === 'center' ? (d.selfFlagged ? fallback.danger : 'rgba(255,255,255,.2)') : d.color)
    .attr('stroke-width', d => d.type === 'center' ? (d.selfFlagged ? 2.5 : 1.5) : 1.25);

  nodeG.append('text')
    .attr('class', 'node-inner')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', d => d.type === 'center' ? '11px' : '10px')
    .attr('font-weight', '600')
    .attr('font-family', 'var(--mono)')
    .attr('fill', d => d.type === 'center' ? '#111113' : d.color)
    .text(d => d.type === 'center' ? t('You') : d.txCount);

  nodeG.append('text')
    .attr('class', 'node-addr')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'hanging')
    .attr('font-size', '9px')
    .attr('font-family', 'var(--mono)')
    .attr('fill', '#71717a')
    .attr('dy', d => rScale(d) + 5)
    .text(d => d.type === 'center' ? shortAddr(targetAddr) : d.label);

  nodeG.append('text')
    .attr('class', 'node-tag')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'hanging')
    .attr('font-size', '8px')
    .attr('font-family', 'var(--font-ui)')
    .attr('fill', d => d.type === 'center' ? '#52525b' : d.color)
    .attr('dy', d => rScale(d) + 17)
    .text(d => d.type === 'center'
      ? (d.selfFlagged ? t('Flagged') : t('Target'))
      : (d.tag || t('OK')));

  nodeG.on('mouseenter', (event, d) => {
    if (isHiddenNode(d)) return;
    const volUsd = d.volumeUsd > 0 && typeof amlFormatExposureUsd === 'function'
      ? amlFormatExposureUsd(d.volumeUsd)
      : null;
    const volTrx = d.volume > 0 ? fmtVolume(d.volume) + ' TRX' : null;
    const vol = volUsd || volTrx;
    tooltip
      .style('opacity', '1')
      .html(`<strong>${esc(d.id)}</strong>` +
        (d.tag ? `<span>${esc(d.tag)}</span>` : '') +
        (vol ? `<span>${esc(vol)}</span>` : '') +
        `<span class="aml-graph-tooltip-sub">${t('{count} transactions', { count: d.txCount })}</span>`);
  })
  .on('mousemove', event => {
    const cr = container.getBoundingClientRect();
    const tx = event.clientX - cr.left;
    const ty = event.clientY - cr.top;
    tooltip
      .style('left', Math.min(tx + 12, width - 210) + 'px')
      .style('top', Math.max(ty - 40, 8) + 'px');
  })
  .on('mouseleave', () => { tooltip.style('opacity', '0'); });

  nodeG.on('click', (event, d) => {
    if (d.type === 'center') return;
    if (isHiddenNode(d)) return;
    window.open(`https://tronscan.org/#/address/${d.id}`, '_blank');
  });

  const ro = new ResizeObserver(() => {
    const r2 = container.getBoundingClientRect();
    if (r2.width && Math.abs(r2.width - width) > 20) {
      width = r2.width;
      svg.attr('width', width).attr('viewBox', [0, 0, width, height]);
    }
  });
  ro.observe(container);

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(130).strength(0.65))
    .force('charge', d3.forceManyBody().strength(-480))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => rScale(d) + 12))
    .alphaDecay(0.028)
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);
      nodeG.attr('transform', d => `translate(${d.x},${d.y})`);
    });

  const highRisk = nodes.filter(n => n.type !== 'center' && !n.benign).length;
  const totalVolUsd = Object.values(volUsdMap).reduce((s, v) => s + (Number(v) || 0), 0);
  const totalVolTrx = Object.values(volMap).reduce((s, v) => s + (Number(v) || 0), 0);
  const totalPeerTx = peers.reduce((s, p) => s + p[1], 0);
  const volumeLabel = totalVolUsd > 0 && typeof amlFormatExposureUsd === 'function'
    ? amlFormatExposureUsd(totalVolUsd)
    : (totalVolTrx > 0 ? fmtVolume(totalVolTrx) + ' TRX' : '—');

  const statsEl = document.createElement('div');
  statsEl.className = 'aml-graph-stats an-stat-grid an-stat-grid--4';
  statsEl.innerHTML = `
    <div class="an-stat an-stat--mini">
      <div class="an-stat-label">${t('Counterparties')}</div>
      <div class="an-stat-value is-info">${peers.length}</div>
    </div>
    <div class="an-stat an-stat--mini">
      <div class="an-stat-label">${t('Risk links')}</div>
      <div class="an-stat-value ${highRisk > 0 ? 'is-red' : 'is-green'}">${highRisk}</div>
    </div>
    <div class="an-stat an-stat--mini">
      <div class="an-stat-label">${t('Total volume')}</div>
      <div class="an-stat-value is-amber">${volumeLabel}</div>
    </div>
    <div class="an-stat an-stat--mini">
      <div class="an-stat-label">${t('Peer transactions')}</div>
      <div class="an-stat-value is-neutral">${totalPeerTx}</div>
    </div>`;
  root.insertBefore(statsEl, container);

  const legendChips = [
    `<span class="aml-graph-legend-chip aml-graph-legend-chip--static" aria-hidden="true">
      <i class="aml-graph-dot aml-graph-dot--center"></i>${esc(t('Target'))}
    </span>`,
    ...legendEntries.map((entry) =>
      `<button type="button" class="aml-graph-legend-chip" data-legend-id="${esc(entry.id)}" aria-pressed="true" title="${esc(t('Click to toggle'))}">
        <i class="aml-graph-dot" style="background:${esc(entry.color)}"></i>
        <span class="aml-graph-legend-label">${esc(entry.label)}</span>
        <span class="aml-graph-legend-count">${entry.count}</span>
      </button>`),
  ].join('');

  const foot = document.createElement('div');
  foot.className = 'aml-graph-foot';
  foot.innerHTML = `
    <div class="aml-graph-toolbar">
      <div class="aml-graph-toolbar-row aml-graph-toolbar-row--controls">
        <div class="aml-graph-presets" role="group" aria-label="${esc(t('Graph filter'))}">
          <button type="button" class="aml-graph-preset-btn is-active" data-preset="all">${esc(t('All'))}</button>
          <button type="button" class="aml-graph-preset-btn" data-preset="risk">${esc(t('Risk only'))}</button>
        </div>
        <span class="aml-graph-visible-count">${esc(t('Showing {visible} of {total}', { visible: nodes.length - 1, total: nodes.length - 1 }))}</span>
      </div>
      <div class="aml-graph-toolbar-row aml-graph-toolbar-row--legend">
        <div class="aml-graph-legend">${legendChips}</div>
        <span class="aml-graph-legend-hint">${esc(t('Toggle categories · drag nodes · scroll to zoom'))}</span>
      </div>
    </div>`;
  root.appendChild(foot);

  foot.querySelectorAll('.aml-graph-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => setPreset(btn.dataset.preset || 'all', foot));
  });
  foot.querySelectorAll('.aml-graph-legend-chip:not(.aml-graph-legend-chip--static)').forEach((chip) => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.legendId;
      if (!id) return;
      if (disabledLegendIds.has(id)) disabledLegendIds.delete(id);
      else disabledLegendIds.add(id);
      activePreset = 'custom';
      applyFilter();
      syncLegendUi(foot);
    });
  });
  syncLegendUi(foot);

  container._simCleanup = () => {
    sim.stop();
    ro.disconnect();
    tooltip.remove();
  };
}

function fmtVolume(sun) {
  const n = Number(sun);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const trx = n / 1e6;
  if (trx >= 1e6) return (trx / 1e6).toFixed(1) + 'M';
  if (trx >= 1e3) return (trx / 1e3).toFixed(1) + 'K';
  return trx.toFixed(0);
}
