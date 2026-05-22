console.log('[Controller] Starting plugin and showing UI');
figma.showUI(__html__, { width: 360, height: 620 });

function nodeIsOrInsideFrame(node) {
  let current = node;
  while (current) {
    if (current.type === 'FRAME') return true;
    current = current.parent;
  }
  return false;
}

function getAncestorFrame(node) {
  let current = node;
  while (current) {
    if (current.type === 'FRAME') return current;
    current = current.parent;
  }
  return null;
}

function getRootFrame(node) {
  let root = null;
  let current = node;
  while (current) {
    if (current.type === 'FRAME') root = current;
    current = current.parent;
  }
  return root;
}

/**
 * Summary cache: { [frameId]: { bound, totalText, updatedAt, frameId } }
 */
const summaryCache = new Map();

function readFrameSummaryFromData(frame) {
  try {
    const raw = frame.getSharedPluginData('polylingo', 'summary');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.frameId === frame.id ? parsed : null;
  } catch (err) {
    return null;
  }
}

function writeFrameSummaryToData(frame, summary) {
  try {
    frame.setSharedPluginData('polylingo', 'summary', JSON.stringify(summary));
  } catch (err) {
    // ignore
  }
}

function summarizeFrame(frame) {
  const textNodes = frame.findAllWithCriteria({ types: ['TEXT'] });
  let bound = 0;
  const boundNodes = [];
  const unboundNodes = [];
  const boundKeys = [];
  for (const node of textNodes) {
    const key = node.getSharedPluginData('polylingo', 'key');
    if (key) {
      bound++;
      boundNodes.push({ id: node.id, name: node.name });
      if (!boundKeys.includes(key)) boundKeys.push(key);
    } else {
      unboundNodes.push({ id: node.id, name: node.name });
    }
  }
  const summary = {
    frameId: frame.id,
    totalText: textNodes.length,
    bound,
    unbound: textNodes.length - bound,
    updatedAt: Date.now(),
  };
  summaryCache.set(frame.id, summary);
  writeFrameSummaryToData(frame, summary);
  return { summary, boundNodes, unboundNodes, boundKeys };
}

function getFrameSummary(frame, forceRescan = false) {
  if (!forceRescan) {
    const cached = summaryCache.get(frame.id) || readFrameSummaryFromData(frame);
    if (cached) {
      summaryCache.set(frame.id, cached);
      return { summary: cached };
    }
  }
  return summarizeFrame(frame);
}

function sendSelectionState() {
  const selectionSummary = figma.currentPage.selection.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.type,
    parentType: n.parent ? n.parent.type : undefined,
  }))
  // Invalidate bindings that were manually edited since last apply
  for (const n of figma.currentPage.selection) {
    if (n.type === 'TEXT') {
      try {
        const key = n.getSharedPluginData('polylingo', 'key')
        if (key) {
          const last = n.getSharedPluginData('polylingo', 'lastText')
          if (last && String(last) !== String(n.characters)) {
            n.setSharedPluginData('polylingo', 'key', '')
            n.setSharedPluginData('polylingo', 'lastText', '')
            console.log('[Controller] Unbound due to manual edit', { id: n.id, name: n.name })
          }
        }
      } catch (_) {}
    }
  }
  const hasFrame = figma.currentPage.selection.some(nodeIsOrInsideFrame)
  let frameId = undefined;
  if (hasFrame) {
    // choose the first selected node's ancestor frame
    const first = figma.currentPage.selection.find(nodeIsOrInsideFrame);
    // Prefer the outermost (root) frame to keep a stable screen context
    const frame = getRootFrame(first);
    frameId = frame ? frame.id : undefined;
  }
  console.log('[Controller] sendSelectionState', { selection: selectionSummary, hasFrame, frameId })
  figma.ui.postMessage({ type: 'selection', hasFrame, frameId })
}

console.log('[Controller] Initial selection check...')
sendSelectionState()

figma.on('selectionchange', () => {
  console.log('[Controller] selectionchange event fired')
  sendSelectionState()
})

figma.ui.onmessage = async (msg) => {
  try {
    console.log('[Controller] UI message received', msg)
  } catch (err) {}
  if (msg && msg.type === 'close') {
    figma.closePlugin();
  } else if (msg && msg.type === 'ping') {
    try { console.log('[Controller] ping -> pong') } catch (_) {}
  } else if (msg && msg.type === 'notify') {
    try { console.log('[Controller] notify', String(msg.message || '')) } catch (_) {}
  } else if (msg && msg.type === 'ready') {
    // UI is ready; send the current selection state again
    console.log('[Controller] UI reported ready; resending selection state')
    sendSelectionState()
  } else if (msg && msg.type === 'requestSummary') {
    const { frameId, forceRescan } = msg;
    const frame = frameId ? await figma.getNodeByIdAsync(frameId) : null;
    if (frame && frame.type === 'FRAME') {
      const result = getFrameSummary(frame, !!forceRescan);
      const payload = { type: 'summary', frameId: frame.id, summary: result.summary };
      if (result.boundNodes) payload.boundNodes = result.boundNodes;
      if (result.unboundNodes) payload.unboundNodes = result.unboundNodes;
      // Always include current bound keys and counts in frame
      try {
        const keys = [];
        const counts = {};
        const nodes = frame.findAllWithCriteria({ types: ['TEXT'] });
        for (const n of nodes) {
          const k = n.getSharedPluginData('polylingo', 'key');
          if (!k) continue;
          if (!keys.includes(k)) keys.push(k);
          counts[k] = (counts[k] || 0) + 1;
        }
        payload.boundKeys = keys;
        payload.boundKeyCounts = counts;
      } catch (_) {}
      figma.ui.postMessage(payload);
    } else {
      figma.ui.postMessage({ type: 'summary', error: 'FRAME_NOT_FOUND', frameId });
    }
  } else if (msg && msg.type === 'toggleHighlight') {
    const { frameId, on } = msg;
    const frame = frameId ? await figma.getNodeByIdAsync(frameId) : null;
    if (!frame || frame.type !== 'FRAME') return;
    if (on) {
      createHighlightsForFrame(frame);
    } else {
      removeHighlightsForFrame(frame);
    }
  } else if (msg && msg.type === 'bind') {
    const key = String(msg.key || '').trim();
    const newText = typeof msg.text === 'string' ? msg.text : undefined
    const forceText = Boolean(msg.forceText)
    try { console.log('[Controller] bind request', { key, hasText: Boolean(newText), forceText }) } catch (_) {}
    const selection = figma.currentPage.selection
    const selectedSummary = selection.map(n => ({ id: n.id, name: n.name, type: n.type }))
    try { console.log('[Controller] current selection', selectedSummary) } catch (_) {}
    const textNodes = selection.filter(n => n.type === 'TEXT')
    if (!key) {
      figma.notify('Provide a key to bind')
      figma.ui.postMessage({ type: 'bindResult', success: false, reason: 'EMPTY_KEY', count: 0 })
      return
    }
    if (textNodes.length === 0) {
      figma.notify('Select at least one Text layer to bind')
      figma.ui.postMessage({ type: 'bindResult', success: false, reason: 'NO_TEXT_SELECTED', count: 0 })
      return
    }
    const node = textNodes[0]
    const affected = []
    try {
      node.setSharedPluginData('polylingo', 'key', key)
      affected.push({ id: node.id, name: node.name })
      if (newText) {
        const res = await maybeApplyTextToNode(node, newText, { force: forceText })
        console.log('[Controller] optional text update result', { nodeId: node.id, name: node.name, res })
      }
      try { node.setSharedPluginData('polylingo', 'lastText', node.characters || '') } catch (_) {}
       try { console.log('[Controller] bind result', { key, successCount: 1, totalTextSelected: textNodes.length, affected, updatedText: Boolean(newText) }) } catch (_) {}
      // Immediately send updated summary including boundKeys so UI filters refresh
      const frame = getAncestorFrame(node)
      if (frame) {
        const result = getFrameSummary(frame, true)
        const payload = { type: 'summary', frameId: frame.id, summary: result.summary }
        if (result.boundNodes) payload.boundNodes = result.boundNodes
        if (result.unboundNodes) payload.unboundNodes = result.unboundNodes
        try {
          const keys = []
          const counts = {}
          const nodes = frame.findAllWithCriteria({ types: ['TEXT'] })
          for (const n of nodes) {
            const k = n.getSharedPluginData('polylingo', 'key')
            if (!k) continue
            if (!keys.includes(k)) keys.push(k)
            counts[k] = (counts[k] || 0) + 1
          }
          payload.boundKeys = keys
          payload.boundKeyCounts = counts
        } catch (_) {}
        figma.ui.postMessage(payload)
      }
      figma.ui.postMessage({ type: 'bindResult', success: true, key, count: 1, affected })
    } catch (err) {
      console.log('[Controller] bind: failed to set data on node', { id: node.id, name: node.name, err: String(err) })
      figma.notify('Failed to bind')
      figma.ui.postMessage({ type: 'bindResult', success: false, key, count: 0, affected: [] })
    }
  } else if (msg && msg.type === 'unbind') {
    console.log('[Controller] unbind request')
    const frameId = msg.frameId
    const keyToUnbind = typeof msg.key === 'string' ? msg.key : ''
    // If key is provided, unbind all nodes with that key within the frame; otherwise, fall back to selected text node
    if (frameId && keyToUnbind) {
      const frame = await figma.getNodeByIdAsync(frameId)
      if (!frame || (frame.type !== 'FRAME' && frame.type !== 'COMPONENT' && frame.type !== 'INSTANCE' && frame.type !== 'COMPONENT_SET')) {
        figma.ui.postMessage({ type: 'unbindResult', success: false, reason: 'FRAME_NOT_FOUND', count: 0 })
      } else {
        const nodes = frame.findAll(n => n.type === 'TEXT' && n.getSharedPluginData('polylingo', 'key') === keyToUnbind)
        let count = 0
        for (const node of nodes) {
          try { node.setSharedPluginData('polylingo', 'key', ''); node.setSharedPluginData('polylingo', 'lastText', ''); count++ } catch (_) {}
        }
        try { console.log('[Controller] unbind frame/key result', { key: keyToUnbind, count }) } catch (_) {}
        // refresh summary
        const result = getFrameSummary(frame, true)
        const payload = { type: 'summary', frameId: frame.id, summary: result.summary }
        try {
          const keys = []
          const counts = {}
          const all = frame.findAllWithCriteria({ types: ['TEXT'] })
          for (const n of all) {
            const k = n.getSharedPluginData('polylingo', 'key')
            if (!k) continue
            if (!keys.includes(k)) keys.push(k)
            counts[k] = (counts[k] || 0) + 1
          }
          payload.boundKeys = keys
          payload.boundKeyCounts = counts
        } catch (_) {}
        figma.ui.postMessage(payload)
        figma.ui.postMessage({ type: 'unbindResult', success: true, count })
      }
      return
    }
    const selection = figma.currentPage.selection
    const textNodes = selection.filter(n => n.type === 'TEXT')
    if (textNodes.length === 0) {
      figma.notify('Select at least one Text layer to unbind')
      figma.ui.postMessage({ type: 'unbindResult', success: false, reason: 'NO_TEXT_SELECTED', count: 0 })
      return
    }
    const node = textNodes[0]
    const affected = []
    try {
      node.setSharedPluginData('polylingo', 'key', '')
      try { node.setSharedPluginData('polylingo', 'lastText', '') } catch (_) {}
      affected.push({ id: node.id, name: node.name })
    try { console.log('[Controller] unbind result', { successCount: 1, totalTextSelected: textNodes.length, affected }) } catch (_) {}
      // Immediately send updated summary including boundKeys so UI filters refresh
      const frame = getAncestorFrame(node)
      if (frame) {
        const result = getFrameSummary(frame, true)
        const payload = { type: 'summary', frameId: frame.id, summary: result.summary }
        if (result.boundNodes) payload.boundNodes = result.boundNodes
        if (result.unboundNodes) payload.unboundNodes = result.unboundNodes
        try {
          const keys = []
          const counts = {}
          const nodes = frame.findAllWithCriteria({ types: ['TEXT'] })
          for (const n of nodes) {
            const k = n.getSharedPluginData('polylingo', 'key')
            if (!k) continue
            if (!keys.includes(k)) keys.push(k)
            counts[k] = (counts[k] || 0) + 1
          }
          payload.boundKeys = keys
          payload.boundKeyCounts = counts
        } catch (_) {}
        figma.ui.postMessage(payload)
      }
      figma.ui.postMessage({ type: 'unbindResult', success: true, count: 1, affected })
    } catch (err) {
      console.log('[Controller] unbind: failed to clear data on node', { id: node.id, name: node.name, err: String(err) })
      figma.notify('Failed to unbind')
      figma.ui.postMessage({ type: 'unbindResult', success: false, count: 0, affected: [] })
    }
  } else if (msg && (msg.type === 'getBinding' || msg.type === 'readBinding')) {
    try { console.log('[Controller] getBinding request') } catch (_) {}
    const selection = figma.currentPage.selection
    const firstText = selection.find(n => n.type === 'TEXT')
    if (!firstText) {
      figma.ui.postMessage({ type: 'bindingInfo', error: 'NO_TEXT_SELECTED' })
      figma.notify('Select a Text layer to read binding')
      return
    }
    const key = firstText.getSharedPluginData('polylingo', 'key') || ''
    console.log('[Controller] getBinding result', { nodeId: firstText.id, name: firstText.name, key })
    figma.ui.postMessage({ type: 'bindingInfo', nodeId: firstText.id, name: firstText.name, key })
  } else if (msg && msg.type === 'selectByKey') {
    try {
      const key = String(msg.key || '').trim()
      const frameId = msg.frameId
      const mode = msg.mode || 'first'
      if (!key || !frameId) {
       try { console.log('[Controller] Nothing to select') } catch (_) {}
        return
      }
      const frame = await figma.getNodeByIdAsync(frameId)
      if (!frame || (frame.type !== 'FRAME' && frame.type !== 'COMPONENT' && frame.type !== 'INSTANCE' && frame.type !== 'COMPONENT_SET')) {
        figma.notify('Frame not found')
        return
      }
      const nodes = frame.findAll(n => n.type === 'TEXT' && n.getSharedPluginData('polylingo', 'key') === key)
      if (nodes.length === 0) {
        figma.notify('No layers found for key')
        return
      }
      const selected = mode === 'all' ? nodes : [nodes[0]]
      figma.currentPage.selection = selected
      try { figma.viewport.scrollAndZoomIntoView(selected) } catch (_) {}
      // Keep UI responsive: rely on selectionchange -> sendSelectionState and UI's requestSummary
      try { sendSelectionState() } catch (_) {}
      try { console.log('[Controller] selected layers for key', { key, count: selected.length }) } catch (_) {}
    } catch (err) {
      console.log('[Controller] selectByKey error', String(err))
    }
  } else if (msg && msg.type === 'applyLanguage') {
    try {
      const frameId = msg.frameId
      const lang = msg.lang
      const translations = msg.translations
      const base = msg.base
    try { console.log('[Controller] applyLanguage request', { frameId, lang, keys: translations ? Object.keys(translations).length : 0 }) } catch (_) {}
      const frame = frameId ? await figma.getNodeByIdAsync(frameId) : null
      if (!frame || (frame.type !== 'FRAME' && frame.type !== 'COMPONENT' && frame.type !== 'INSTANCE' && frame.type !== 'COMPONENT_SET')) {
        figma.notify('No valid frame to apply language')
        return
      }
      const textNodes = frame.findAll(n => n.type === 'TEXT')
      let updated = 0
      for (const node of textNodes) {
        try {
          const key = node.getSharedPluginData('polylingo', 'key')
          if (!key) continue
          const value = (translations && translations[key]) || (base && base[key]) || null
          if (value == null) continue
          const res = await maybeApplyTextToNode(node, value, { force: true })
          if (res && res.updated) updated++
          try { node.setSharedPluginData('polylingo', 'lastText', node.characters || '') } catch (_) {}
        } catch (err) {
          console.log('[Controller] applyLanguage: failed for node', { id: node.id, name: node.name, err: String(err) })
        }
      }
      try { console.log('[Controller] applyLanguage result', { updated, total: textNodes.length }) } catch (_) {}
    } catch (err) {
      console.log('[Controller] applyLanguage: error', String(err))
      figma.notify('Failed to apply language')
    }
  }
  else if (msg && msg.type === 'focusUnbound') {
    try {
      const frameId = msg.frameId
      const direction = msg.direction === 'prev' ? 'prev' : 'next'
      let fromNodeId = typeof msg.fromNodeId === 'string' ? msg.fromNodeId : null
      const targetNodeId = typeof msg.targetNodeId === 'string' ? msg.targetNodeId : null
      const frame = frameId ? await figma.getNodeByIdAsync(frameId) : null
      if (!frame || (frame.type !== 'FRAME' && frame.type !== 'COMPONENT' && frame.type !== 'INSTANCE' && frame.type !== 'COMPONENT_SET')) {
        figma.notify('Frame not found')
        return
      }
      const unbound = frame.findAll(n => n.type === 'TEXT' && !n.getSharedPluginData('polylingo', 'key'))
      if (unbound.length === 0) {
        figma.notify('No unbound text layers')
        return
      }
      // If no fromNodeId provided, try to use currently selected first TEXT node
      if (!fromNodeId) {
        const selText = figma.currentPage.selection.find(n => n.type === 'TEXT')
        if (selText) fromNodeId = selText.id
      }
      // Stable order: top-to-bottom then left-to-right
      unbound.sort((a, b) => {
        const ay = a.absoluteTransform[1][2]
        const by = b.absoluteTransform[1][2]
        if (ay !== by) return ay - by
        const ax = a.absoluteTransform[0][2]
        const bx = b.absoluteTransform[0][2]
        return ax - bx
      })
      let target = null
      if (targetNodeId) {
        const direct = unbound.find(n => n.id === targetNodeId)
        if (direct) target = direct
      }
      if (!target) {
        let index = 0
        if (fromNodeId) {
          const i = unbound.findIndex(n => n.id === fromNodeId)
          if (i >= 0) {
            index = direction === 'prev' ? (i - 1 + unbound.length) % unbound.length : (i + 1) % unbound.length
          } else {
            index = 0
          }
        } else {
          index = direction === 'prev' ? unbound.length - 1 : 0
        }
        target = unbound[index]
      }
      if (!target) {
      try { console.log('[Controller] No target to focus') } catch (_) {}
        return
      }
      figma.currentPage.selection = [target]
      try { figma.viewport.scrollAndZoomIntoView([target]) } catch (_) {}
      try { sendSelectionState() } catch (_) {}
      // silent success; keep console for debugging if needed
      try { const idx = unbound.findIndex(n => n.id === target.id); console.log('[Controller] focusUnbound', { index: idx + 1, total: unbound.length, name: target.name }) } catch (_) {}
    } catch (err) {
      try { console.log('[Controller] focusUnbound error', String(err)) } catch (_) {}
    }
  }
};

const HIGHLIGHT_CONTAINER_PREFIX = 'POLYLINGO_HIGHLIGHTS_';

function removeHighlightsForFrame(frame) {
  const name = HIGHLIGHT_CONTAINER_PREFIX + frame.id;
  const existing = figma.currentPage.findOne(n => n.type === 'FRAME' && n.name === name);
  if (existing && existing.type === 'FRAME') {
    existing.remove();
  }
}

function createHighlightsForFrame(frame) {
  removeHighlightsForFrame(frame);
  const name = HIGHLIGHT_CONTAINER_PREFIX + frame.id;
  const container = figma.createFrame();
  container.name = name;
  container.expanded = false;
  container.locked = true;
  container.opacity = 1;
  container.fills = [];
  container.strokes = [];
  container.resizeWithoutConstraints(figma.viewport.bounds.width, figma.viewport.bounds.height);
  figma.currentPage.appendChild(container);

  const textNodes = frame.findAllWithCriteria({ types: ['TEXT'] });
  for (const node of textNodes) {
    const key = node.getSharedPluginData('polylingo', 'key');
    if (!key) continue; // highlight only bound if desired
    const rect = figma.createRectangle();
    rect.name = 'POLYLINGO_HIGHLIGHT';
    rect.cornerRadius = 6;
    rect.fills = [];
    rect.strokes = [{ type: 'SOLID', color: { r: 0.0, g: 0.8, b: 0.4 } }];
    rect.strokeWeight = 2;
    rect.dashPattern = [6, 6];
    // Position using absoluteTransform
    const t = node.absoluteTransform;
    const x = t[0][2];
    const y = t[1][2];
    rect.resize(node.width, node.height);
    rect.x = x;
    rect.y = y;
    container.appendChild(rect);
  }
}

// Note: documentchange requires loading all pages in incremental mode.
// To keep the plugin lightweight, we skip it and rely on the explicit "Rescan" action
// and selection changes to refresh summaries.

// ---------- Text update helpers (optional) ----------
async function loadAllFontsForNode(node) {
  const result = { uniqueFonts: [], loaded: 0, hadError: false };
  try {
    const fullLength = (node.characters || '').length;
    let fonts = [];
    try {
      fonts = node.getRangeAllFontNames(0, fullLength) || [];
    } catch (err) {
      // Fallback: single fontName if available
      try { fonts = [node.fontName].filter(Boolean); } catch (_) {}
    }
    const seen = new Set();
    for (const f of fonts) {
      const key = `${f.family}__${f.style}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.uniqueFonts.push(f);
    }
    for (const f of result.uniqueFonts) {
      try { await figma.loadFontAsync(f); result.loaded++; }
      catch (err) { result.hadError = true; console.log('[Controller] loadFontAsync failed', f, String(err)); }
    }
  } catch (err) {
    result.hadError = true;
    console.log('[Controller] loadAllFontsForNode error', String(err));
  }
  return result;
}

async function maybeApplyTextToNode(node, newText, options) {
  const { force = false } = options || {};
  const length = (node.characters || '').length;
  let fontRanges = [];
  try { fontRanges = node.getRangeAllFontNames(0, length) || [] } catch (_) {}
  const mixedFonts = (fontRanges || []).length > 1;
  if (mixedFonts && !force) {
    console.log('[Controller] skip text update to preserve mixed formatting', { nodeId: node.id, name: node.name, ranges: fontRanges.length })
    return { updated: false, reason: 'MIXED_FONTS' };
  }
  const load = await loadAllFontsForNode(node);
  console.log('[Controller] fonts for node', { nodeId: node.id, name: node.name, uniqueFonts: load.uniqueFonts.length, loaded: load.loaded, hadError: load.hadError })
  try {
    node.characters = String(newText);
    return { updated: true };
  } catch (err) {
    console.log('[Controller] failed to set characters', { nodeId: node.id, name: node.name, err: String(err) })
    return { updated: false, reason: 'SET_CHARACTERS_ERROR' };
  }
}
