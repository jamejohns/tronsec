// -- Interactive force-directed counterparty graph --
function renderAMLGraph(containerId, targetAddr, peers, peerFlags, directTransfers, txCount) {
  const container = document.getElementById(containerId);
  if (!container || peers.length < 1) return;

  const root = container.closest('.aml-graph-root') || container.parentElement;
  root.querySelectorAll('.aml-graph-stats, .aml-graph-foot').forEach(el => el.remove());
  if (container._simCleanup) container._simCleanup();
  container.innerHTML = '';
  container.style.position = 'relative';

  const volMap = {};
  for (const d of directTransfers) {
    if (d.isTrc20) continue;
    const amt = Number(d.amount) || 0;
    if (!amt) continue;
    volMap[d.peer] = (volMap[d.peer] || 0) + amt;
  }

  const shortAddr = a => a.slice(0, 6) + '...' + a.slice(-4);
  const flaggedSet = new Set(peerFlags);
  const maxTx = Math.max(1, ...peers.map(p => p[1]));
  const colors = { center: '#f5f5f7', danger: '#fb7185', warn: '#fbbf24', safe: '#34d399' };

  let filtered = false;
  function nodeType(addr, count) {
    if (addr === targetAddr) return 'center';
    if (flaggedSet.has(addr)) return 'danger';
    if (count > 20) return 'warn';
    return 'safe';
  }

  let nodes = [{ id: targetAddr, label: t('You'), type: 'center', txCount: 0, volume: 0 }];
  for (const [addr, count] of peers) {
    nodes.push({
      id: addr,
      label: shortAddr(addr),
      type: nodeType(addr, count),
      txCount: count,
      volume: volMap[addr] || 0,
    });
  }

  let links = peers.map(([addr, count]) => ({
    source: targetAddr,
    target: addr,
    value: count,
    volume: volMap[addr] || 0,
  }));

  const rect = container.getBoundingClientRect();
  let width = rect.width || 600;
  const height = Math.max(280, Math.min(400, width * 0.55));

  function applyFilter() {
    nodeG.attr('opacity', d => (filtered && d.type === 'safe' && d.type !== 'center') ? 0.12 : 1);
    nodeG.selectAll('circle, text').attr('pointer-events', d => (filtered && d.type === 'safe') ? 'none' : 'auto');
    link.attr('opacity', d => (filtered && d.target.type === 'safe') ? 0.06 : 0.45);
    linkLabel.attr('opacity', d => (filtered && d.target.type === 'safe') ? 0 : 0.85);
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
    .attr('stroke', d => colors[d.target.type] || '#52525b')
    .attr('stroke-width', d => Math.max(1.5, (d.value / maxTx) * 4))
    .attr('stroke-opacity', 0.45)
    .attr('stroke-dasharray', d => d.target.type === 'warn' ? '4,4' : null);

  const linkLabel = g.selectAll('text.link-label')
    .data(links)
    .enter().append('text')
    .attr('class', 'link-label')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', '9px')
    .attr('font-family', 'var(--mono)')
    .attr('fill', '#71717a')
    .text(d => d.value + ' tx' + (d.volume > 0 ? ' · ' + fmtVolume(d.volume) : ''));

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
    .attr('fill', d => d.type === 'center' ? 'rgba(255,255,255,.95)' : colors[d.type])
    .attr('fill-opacity', d => d.type === 'center' ? 1 : 0.1)
    .attr('stroke', d => d.type === 'center' ? 'rgba(255,255,255,.2)' : colors[d.type])
    .attr('stroke-width', d => d.type === 'center' ? 1.5 : 1.25);

  nodeG.append('text')
    .attr('class', 'node-inner')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', d => d.type === 'center' ? '11px' : '10px')
    .attr('font-weight', '600')
    .attr('font-family', 'var(--mono)')
    .attr('fill', d => d.type === 'center' ? '#111113' : colors[d.type])
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
    .attr('fill', d => d.type === 'center' ? '#52525b' : (colors[d.type] || '#52525b'))
    .attr('dy', d => rScale(d) + 17)
    .text(d => d.type === 'center' ? t('Target') :
      d.type === 'danger' ? t('Flagged') :
      d.type === 'warn' ? t('Watch') : t('OK'));

  nodeG.on('mouseenter', (event, d) => {
    if (filtered && d.type === 'safe') return;
    const vol = d.volume > 0 ? fmtVolume(d.volume) + ' TRX' : null;
    tooltip
      .style('opacity', '1')
      .html(`<strong>${esc(d.id)}</strong>` +
        (vol ? `<span>${vol}</span>` : '') +
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
    if (filtered && d.type === 'safe') return;
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

  const highRisk = peers.filter(p => nodeType(p[0], p[1]) !== 'safe').length;
  const totalVol = Object.values(volMap).reduce((s, v) => s + (Number(v) || 0), 0);
  const totalPeerTx = peers.reduce((s, p) => s + p[1], 0);

  const statsEl = document.createElement('div');
  statsEl.className = 'aml-graph-stats an-stat-grid an-stat-grid--4';
  statsEl.innerHTML = `
    <div class="an-stat an-stat--mini">
      <div class="an-stat-label">${t('Counterparties')}</div>
      <div class="an-stat-value is-info">${peers.length}</div>
    </div>
    <div class="an-stat an-stat--mini">
      <div class="an-stat-label">${t('High-risk links')}</div>
      <div class="an-stat-value ${highRisk > 0 ? 'is-red' : 'is-green'}">${highRisk}</div>
    </div>
    <div class="an-stat an-stat--mini">
      <div class="an-stat-label">${t('Total volume')}</div>
      <div class="an-stat-value is-amber">${totalVol > 0 ? fmtVolume(totalVol) : '—'}</div>
    </div>
    <div class="an-stat an-stat--mini">
      <div class="an-stat-label">${t('Peer transactions')}</div>
      <div class="an-stat-value is-neutral">${totalPeerTx}</div>
    </div>`;
  root.insertBefore(statsEl, container);

  const foot = document.createElement('div');
  foot.className = 'aml-graph-foot';
  foot.innerHTML = `
    <div class="aml-graph-legend">
      <span class="aml-graph-legend-item"><i class="aml-graph-dot aml-graph-dot--center"></i>${t('Target')}</span>
      <span class="aml-graph-legend-item"><i class="aml-graph-dot aml-graph-dot--danger"></i>${t('Flagged')}</span>
      <span class="aml-graph-legend-item"><i class="aml-graph-dot aml-graph-dot--warn"></i>${t('Watch')}</span>
      <span class="aml-graph-legend-item"><i class="aml-graph-dot aml-graph-dot--safe"></i>${t('OK')}</span>
      <span class="aml-graph-legend-hint">${t('Line width = tx count · drag nodes · scroll to zoom')}</span>
    </div>
    <button type="button" id="graph-filter-btn" class="wallet-action-btn wallet-action-btn--ghost aml-graph-filter">${t('Show flagged only')}</button>`;
  root.appendChild(foot);

  const filterBtn = foot.querySelector('#graph-filter-btn');
  filterBtn?.addEventListener('click', () => {
    filtered = !filtered;
    filterBtn.textContent = filtered ? t('Show all') : t('Show flagged only');
    filterBtn.classList.toggle('is-active', filtered);
    applyFilter();
  });

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
