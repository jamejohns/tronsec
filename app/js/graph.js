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
