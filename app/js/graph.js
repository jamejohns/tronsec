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
