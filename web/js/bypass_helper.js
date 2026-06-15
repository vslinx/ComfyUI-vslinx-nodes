import { app } from "/scripts/app.js";

const MODE_ALWAYS = 0;
const MODE_NEVER = 2;
const MODE_BYPASS = 4;


const CONFIGS = {
  vsLinx_BypassOnBool: {
    boolInputIndex: 1,
    readWidgetName: "bypass",
    trueMode: MODE_BYPASS,
  },
  vsLinx_MuteOnBool: {
    boolInputIndex: 1,
    readWidgetName: "mute",
    trueMode: MODE_NEVER,
  },
};

// State-mirror nodes: instead of a boolean, they read the mode of the node
// wired into a "trigger" input and mirror it onto their downstream nodes
// (bypass -> bypass, mute -> mute, anything else -> normal).
const STATE_CONFIGS = {
  vsLinx_BypassMuteOnState: {
    triggerInputIndex: 1,
  },
};

const POLL_MS = 200;

function inferType(node) {

  if (node.inputs?.[0]) {
    const inp = node.inputs[0];
    const linkIds = inp.link != null ? [inp.link] : (inp.links || []);
    for (const lid of linkIds) {
      const link = node.graph?.links?.[lid];
      if (!link) continue;
      const src = node.graph.getNodeById(link.origin_id);
      const outSlot = src?.outputs?.[link.origin_slot];
      const t = outSlot?.type;
      if (t && t !== "*") return t;
    }
  }

  if (node.outputs?.[0]) {
    const out = node.outputs[0];
    const linkIds = out.links || [];
    for (const lid of linkIds) {
      const link = node.graph?.links?.[lid];
      if (!link) continue;
      const dst = node.graph.getNodeById(link.target_id);
      const inSlot = dst?.inputs?.[link.target_slot];
      const t = inSlot?.type;
      if (t && t !== "*") return t;
    }
  }
  return "*";
}

function applyType(node, t) {
  const type = t || "*";
  if (node.inputs?.[0]) node.inputs[0].type = type;
  if (!node.outputs?.length) node.addOutput("out", type);
  node.outputs[0].type = type;
  node.outputs[0].label = type === "*" ? "out" : String(type);
  node.setDirtyCanvas(true, true);
}

function scheduleType(node) {
  clearTimeout(node.__vl_type_t);
  node.__vl_type_t = setTimeout(() => applyType(node, inferType(node)), 30);
}

// When the bypass node's output feeds into an AnyToPipe slot, follow the pipe
// through to PipeToAny and apply the mode to its real downstream nodes instead
// of setting it on the AnyToPipe node itself.
function applyModeViaPipe(anyToPipeNode, slotIndex, graph, modeWhenTrue, on) {
  const pipeOut = anyToPipeNode.outputs?.[0];
  if (!pipeOut) return;
  for (const lid of (pipeOut.links || [])) {
    const link = graph?.links?.[lid];
    if (!link || link.target_id < 0) continue;
    const pipeToAny = graph.getNodeById(link.target_id);
    if (!pipeToAny || pipeToAny.type !== "vsLinx_PipeToAny") continue;
    const outSlot = pipeToAny.outputs?.[slotIndex];
    if (!outSlot) continue;
    for (const outLid of (outSlot.links || [])) {
      const outLink = graph?.links?.[outLid];
      if (!outLink || outLink.target_id < 0) continue;
      const target = graph.getNodeById(outLink.target_id);
      if (!target) continue;
      target.mode = on ? modeWhenTrue : MODE_ALWAYS;
      if (typeof target.setDirtyCanvas === "function") target.setDirtyCanvas(true, true);
    }
  }
}

function setDownstreamMode(node, modeWhenTrue, on) {
  if (!node.outputs?.[0]) return;
  const out = node.outputs[0];
  const links = out.links || [];
  for (const lid of links) {
    const link = node.graph?.links?.[lid];
    if (!link) continue;

    // Subgraph output boundary: target_id < 0 means the link exits the subgraph.
    // target_slot is the index of the outer group node's output slot — follow
    // that slot's links in the outer graph to reach the real downstream nodes.
    if (link.target_id < 0) {
      const parent = findParentNode(node.graph);
      if (!parent) continue;
      const outerOut = parent.node.outputs?.[link.target_slot];
      for (const outerLid of (outerOut?.links || [])) {
        const outerLink = parent.graph?.links?.[outerLid];
        if (!outerLink) continue;
        const target = parent.graph.getNodeById(outerLink.target_id);
        if (!target) continue;
        target.mode = on ? modeWhenTrue : MODE_ALWAYS;
        if (typeof target.setDirtyCanvas === "function") target.setDirtyCanvas(true, true);
      }
      continue;
    }

    const target = node.graph.getNodeById(link.target_id);
    if (!target) continue;

    // Pipe transparency: if the bypass node's output lands on an AnyToPipe slot,
    // skip setting mode on AnyToPipe itself and instead apply it to the nodes
    // downstream of the corresponding PipeToAny output slot.
    if (target.type === "vsLinx_AnyToPipe") {
      applyModeViaPipe(target, link.target_slot, node.graph, modeWhenTrue, on);
      continue;
    }

    target.mode = on ? modeWhenTrue : MODE_ALWAYS;
    if (typeof target.setDirtyCanvas === "function") target.setDirtyCanvas(true, true);
  }
}

function readUpstreamBoolean(node, boolInputIndex) {
  const linkId = getFirstIncomingLinkId(node, boolInputIndex);
  if (linkId == null) return null;
  return resolveBooleanAtLink(node.graph, linkId);
}


function findBoolWidget(node, name) {
  if (!node.widgets) return null;
  return node.widgets.find(w => w.name === name || w.label === name);
}


function getFirstIncomingLinkId(node, inputIndex) {
  const pin = node.inputs?.[inputIndex];
  if (!pin) return null;
  return pin.link ?? (pin.links?.length ? pin.links[0] : null);
}

function readNodeBooleanWidget(node) {
  const widgets = node.widgets || [];
  for (const w of widgets) {
    const looksBool = w.type === "toggle" || w.type === "checkbox" || typeof w.value === "boolean";
    if (looksBool) return !!w.value;
  }
  if (typeof node.properties?.value === "boolean") return !!node.properties.value;
  return null;
}

function findWidgetForInput(node, inputIndex) {
  const widgets = node.widgets || [];
  if (!widgets.length) return null;

  const pin = node.inputs?.[inputIndex];
  const pinName = pin?.name?.toLowerCase();

  if (pinName) {
    const byName = widgets.find(w =>
      (w.name && String(w.name).toLowerCase() === pinName) ||
      (w.label && String(w.label).toLowerCase() === pinName)
    );
    if (byName) return byName;
  }

  const boolWidgets = widgets.filter(w => w.type === "toggle" || w.type === "checkbox" || typeof w.value === "boolean");
  return boolWidgets[inputIndex] || null;
}

function readBooleanInputValue(node, idx, resolveUpstream) {
  const inLink = getFirstIncomingLinkId(node, idx);
  if (inLink != null) {
    return resolveUpstream(node.graph, inLink);
  }
  const w = findWidgetForInput(node, idx);
  if (w && typeof w.value === "boolean") return !!w.value;
  const name = node.inputs?.[idx]?.name;
  if (name && typeof node.properties?.[name] === "boolean") return !!node.properties[name];
  return null;
}

const BOOLEAN_NODE_EVAL = {
  // When a boolean travels through a pipe (AnyToPipe → PipeToAny), resolve it
  // at the exact slot the link came from rather than scanning all 5 slots blindly.
  "vsLinx_PipeToAny"(node, originSlot, resolveUpstream) {
    const pipeLinkId = getFirstIncomingLinkId(node, 0); // pipe is always input[0]
    if (pipeLinkId == null) return null;
    const pipeLink = node.graph?.links?.[pipeLinkId];
    if (!pipeLink) return null;
    const anyToPipe = node.graph?.getNodeById(pipeLink.origin_id);
    if (!anyToPipe || anyToPipe.type !== "vsLinx_AnyToPipe") return null;
    // originSlot 0-4 maps 1:1 to AnyToPipe's input slots 0-4 (slot_1..slot_5)
    const slotLinkId = getFirstIncomingLinkId(anyToPipe, originSlot);
    if (slotLinkId == null) return null;
    return resolveUpstream(node.graph, slotLinkId);
  },
  "vsLinx_BooleanFlip"(node, originSlot, resolveUpstream) {
    const inLink = getFirstIncomingLinkId(node, 0);
    if (inLink == null) return null;
    const v = resolveUpstream(node.graph, inLink);
    return (v == null) ? null : !v;
  },
  "vsLinx_BooleanAndOperator"(node, originSlot, resolveUpstream) {
    const a = readBooleanInputValue(node, 0, resolveUpstream);
    const b = readBooleanInputValue(node, 1, resolveUpstream);
    if (a == null || b == null) return null;
    return !!a && !!b;
  },
  "vsLinx_BooleanOrOperator"(node, originSlot, resolveUpstream) {
    const a = readBooleanInputValue(node, 0, resolveUpstream);
    const b = readBooleanInputValue(node, 1, resolveUpstream);
    if (a == null || b == null) return null;
    return !!a || !!b;
  },

};

// Find the outer group node that contains the given subgraph.
// Tries a back-reference first, then falls back to a root search.
function findParentNode(subgraph) {
  if (subgraph._subgraph_node) {
    const n = subgraph._subgraph_node;
    return { node: n, graph: n.graph };
  }
  function search(g) {
    for (const n of (g._nodes || [])) {
      if (n.subgraph === subgraph) return { node: n, graph: g };
      if (n.subgraph) {
        const found = search(n.subgraph);
        if (found) return found;
      }
    }
    return null;
  }
  return search(app.graph);
}

function resolveBooleanAtLink(graph, linkId, seen = new Set()) {
  const link = graph?.links?.[linkId];
  if (!link) return null;

  // Subgraph boundary: ComfyUI uses a negative origin_id (e.g. -10) on links
  // that come from the outer graph. origin_slot is the outer node's input index.
  if (link.origin_id < 0) {
    const parent = findParentNode(graph);
    if (!parent) return null;
    const outerInput = parent.node.inputs?.[link.origin_slot];
    if (!outerInput || outerInput.link == null) return null;
    return resolveBooleanAtLink(parent.graph, outerInput.link, new Set(seen));
  }

  const src = graph.getNodeById(link.origin_id);
  if (!src) return null;

  const key = `${src.id}:${link.origin_slot}`;
  if (seen.has(key)) return null;
  seen.add(key);

  // 1. Known vsLinx logic nodes (AND / OR / Flip)
  const evalFn = BOOLEAN_NODE_EVAL[src.type];
  if (typeof evalFn === "function") {
    const v = evalFn(src, link.origin_slot, (g, lid) => resolveBooleanAtLink(g, lid, seen));
    if (v != null) return !!v;
  }

  // 2. Unknown node type: recursively walk its own inputs.
  //    This handles any depth of pass-through / relay nodes.
  //    Use a fresh copy of `seen` per branch so sibling inputs don't
  //    block each other, but cycles within a single path are still caught.
  for (const inp of (src.inputs || [])) {
    const inLinkId = inp.link ?? (inp.links?.[0] ?? null);
    if (inLinkId == null) continue;
    const v = resolveBooleanAtLink(graph, inLinkId, new Set(seen));
    if (v != null) return !!v;
  }

  // 3. Widget value — covers primitive nodes and any node whose upstream
  //    chain couldn't be resolved but has a local toggle/checkbox.
  const widgetVal = readNodeBooleanWidget(src);
  if (widgetVal != null) return !!widgetVal;

  // 4. Slot value as last resort
  const outSlot = src.outputs?.[link.origin_slot];
  if (outSlot && typeof outSlot.value === "boolean") return !!outSlot.value;

  return null;
}


function startPolling(node, cfg) {
  stopPolling(node);
  node.__vl_bool_poll = setInterval(() => {
    const v = readUpstreamBoolean(node, cfg.boolInputIndex);
    if (v === null) return;
    const w = findBoolWidget(node, cfg.readWidgetName);
    if (w && w.value !== !!v) {
      w.value = !!v;
      node.setDirtyCanvas(true, true);
    }
    setDownstreamMode(node, cfg.trueMode, !!v);
  }, POLL_MS);
}

function stopPolling(node) {
  if (node.__vl_bool_poll) {
    clearInterval(node.__vl_bool_poll);
    node.__vl_bool_poll = null;
  }
}

// ----------------------- state-mirror node logic -----------------------

function isInputLinked(node, idx) {
  const pin = node.inputs?.[idx];
  return !!(pin && (pin.link != null || (pin.links?.length)));
}

function readIgnoreBoundary(node) {
  const w = node.widgets?.find(x => x.name === "ignore_subgraph_boundary");
  return !!(w && w.value);
}

// Find the inner link inside a subgraph that feeds the given output boundary
// slot (target_id < 0 marks a link exiting the subgraph through its output pin).
function findSubgraphOutputLink(subgraph, outputSlot) {
  const links = subgraph?.links;
  if (!links) return null;
  const vals = (typeof links.values === "function") ? links.values() : Object.values(links);
  for (const l of vals) {
    if (l && l.target_id < 0 && l.target_slot === outputSlot) return l;
  }
  return null;
}

// Walk a trigger link across subgraph boundaries until a real (non-container)
// node is reached. Crosses inbound boundaries (origin_id < 0 -> the subgraph's
// own input pin -> resolve in the parent graph) and outbound boundaries (source
// is a subgraph container node -> drill into the inner node feeding that output).
function resolveTriggerNodeByLink(graph, link, seen) {
  if (!link || seen.has(link)) return null;
  seen.add(link);

  if (link.origin_id < 0) {
    const parent = findParentNode(graph);
    if (!parent) return null;
    const outerInput = parent.node.inputs?.[link.origin_slot];
    const olid = outerInput?.link;
    if (olid == null) return null;
    return resolveTriggerNodeByLink(parent.graph, parent.graph?.links?.[olid], seen);
  }

  const src = graph.getNodeById(link.origin_id);
  if (!src) return null;

  if (src.subgraph) {
    const ilink = findSubgraphOutputLink(src.subgraph, link.origin_slot);
    if (!ilink) return null;
    return resolveTriggerNodeByLink(src.subgraph, ilink, seen);
  }

  return src;
}

// Read the mode (0 = normal, 2 = mute/never, 4 = bypass) of the node connected
// to the trigger input. Returns null when nothing is connected (or the source
// can't be resolved), which the caller treats as "do nothing". When
// crossBoundary is true, subgraph boundaries are followed until a real node.
function readTriggerMode(node, triggerInputIndex, crossBoundary) {
  const linkId = getFirstIncomingLinkId(node, triggerInputIndex);
  if (linkId == null) return null;
  const link = node.graph?.links?.[linkId];
  if (!link) return null;

  if (crossBoundary) {
    const src = resolveTriggerNodeByLink(node.graph, link, new Set());
    return src ? (src.mode ?? MODE_ALWAYS) : null;
  }

  // Direct node only: don't follow links crossing a subgraph boundary.
  if (link.origin_id < 0) return null;
  const src = node.graph.getNodeById(link.origin_id);
  if (!src) return null;
  return src.mode ?? MODE_ALWAYS;
}

function readMirrorOwn(node) {
  const w = node.widgets?.find(x => x.name === "mirror_own_state");
  return !!(w && w.value);
}

// Only BYPASS and NEVER are mirrored; everything else means "normal".
function isMirroredMode(mode) {
  return mode === MODE_BYPASS || mode === MODE_NEVER;
}

// Compute the mode the downstream node(s) should have and apply it. The node's
// own bypass/mute state (when "mirror_own_state" is on) takes precedence over
// the trigger node's state; if neither is active the downstream runs normally.
function evaluateState(node, cfg) {
  let mode = MODE_ALWAYS;

  if (readMirrorOwn(node) && isMirroredMode(node.mode)) {
    mode = node.mode;
  } else if (isInputLinked(node, cfg.triggerInputIndex)) {
    const m = readTriggerMode(node, cfg.triggerInputIndex, readIgnoreBoundary(node));
    if (isMirroredMode(m)) mode = m;
  }

  const on = isMirroredMode(mode);
  setDownstreamMode(node, on ? mode : MODE_ALWAYS, on);
}

function startStatePolling(node, cfg) {
  stopStatePolling(node);
  node.__vl_state_poll = setInterval(() => evaluateState(node, cfg), POLL_MS);
}

function stopStatePolling(node) {
  if (node.__vl_state_poll) {
    clearInterval(node.__vl_state_poll);
    node.__vl_state_poll = null;
  }
}

// (Re)evaluate a state-mirror node. We poll while a trigger is connected or
// while "mirror_own_state" is on (the node's own mode can change at any time);
// otherwise we stop and force the downstream node(s) back to normal.
function refreshState(node, cfg) {
  if (isInputLinked(node, cfg.triggerInputIndex) || readMirrorOwn(node)) {
    startStatePolling(node, cfg);
  } else {
    stopStatePolling(node);
  }
  evaluateState(node, cfg);
}

// Friendly display labels for the toggles (the widget *names* stay as valid
// Python identifiers; litegraph draws `label` when present, else `name`).
const STATE_WIDGET_LABELS = {
  ignore_subgraph_boundary: "Ignore subgraph boundary",
  mirror_own_state: "Mirror this node's own bypass/mute",
};

function setStateLabels(node) {
  for (const w of (node.widgets || [])) {
    if (STATE_WIDGET_LABELS[w.name]) w.label = STATE_WIDGET_LABELS[w.name];
  }
}

// Re-evaluate immediately when either toggle changes (polling would also catch
// it within POLL_MS, this just makes it snappy).
function hookStateWidget(node, cfg) {
  for (const name of ["ignore_subgraph_boundary", "mirror_own_state"]) {
    const w = node.widgets?.find(x => x.name === name);
    if (!w || w.__vl_hooked) continue;
    w.__vl_hooked = true;
    const old = w.callback;
    w.callback = function () {
      try {
        return (typeof old === "function") ? old.apply(this, arguments) : undefined;
      } finally {
        refreshState(node, cfg);
      }
    };
  }
}

function hookLocalWidget(node, cfg) {
  const w = findBoolWidget(node, cfg.readWidgetName);
  if (!w) return;
  const old = w.callback;
  w.callback = function (v) {
    try {
      const linked = !!(node.inputs?.[cfg.boolInputIndex] &&
        (node.inputs[cfg.boolInputIndex].link != null || (node.inputs[cfg.boolInputIndex].links?.length)));
      if (!linked) setDownstreamMode(node, cfg.trueMode, !!v);
    } finally {
      if (typeof old === "function") old.apply(this, arguments);
    }
  };
}

app.registerExtension({
  name: "vsLinx.bool_flow",
  beforeRegisterNodeDef(nodeType, nodeData, _app) {
    const scfg = STATE_CONFIGS[nodeData?.name];
    if (scfg) {
      const onNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        const r = onNodeCreated?.apply(this, arguments);
        this.serialize_widgets = true;
        setStateLabels(this);
        hookStateWidget(this, scfg);
        scheduleType(this);
        refreshState(this, scfg);
        return r;
      };

      const onConnectionsChange = nodeType.prototype.onConnectionsChange;
      nodeType.prototype.onConnectionsChange = function () {
        const r = onConnectionsChange?.apply(this, arguments);
        scheduleType(this);
        refreshState(this, scfg);
        return r;
      };

      const onConfigure = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function () {
        const r = onConfigure?.apply(this, arguments);
        setStateLabels(this);
        hookStateWidget(this, scfg);
        scheduleType(this);
        refreshState(this, scfg);
        return r;
      };

      const onRemoved = nodeType.prototype.onRemoved;
      nodeType.prototype.onRemoved = function () {
        stopStatePolling(this);
        return onRemoved?.apply(this, arguments);
      };
      return;
    }

    const cfg = CONFIGS[nodeData?.name];
    if (!cfg) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);

      this.serialize_widgets = true;
      hookLocalWidget(this, cfg);

      scheduleType(this);

      const linked = !!(this.inputs?.[cfg.boolInputIndex] &&
        (this.inputs[cfg.boolInputIndex].link != null || (this.inputs[cfg.boolInputIndex].links?.length)));
      if (linked) startPolling(this, cfg);
      else {
        stopPolling(this);
        const w = findBoolWidget(this, cfg.readWidgetName);
        if (w) setDownstreamMode(this, cfg.trueMode, !!w.value);
      }
      return r;
    };

    const onConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function (type, _slotIndex, isConnected) {
      const r = onConnectionsChange?.apply(this, arguments);

      scheduleType(this);

      const linked = !!(this.inputs?.[cfg.boolInputIndex] &&
        (this.inputs[cfg.boolInputIndex].link != null || (this.inputs[cfg.boolInputIndex].links?.length)));
      if (linked) startPolling(this, cfg);
      else {
        stopPolling(this);
        const w = findBoolWidget(this, cfg.readWidgetName);
        if (w) setDownstreamMode(this, cfg.trueMode, !!w.value);
      }

      if (type === LiteGraph.OUTPUT && isConnected) {
        const w = findBoolWidget(this, cfg.readWidgetName);
        if (w && w.value) setDownstreamMode(this, cfg.trueMode, true);
      }

      return r;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);

      hookLocalWidget(this, cfg);
      scheduleType(this);

      const linked = !!(this.inputs?.[cfg.boolInputIndex] &&
        (this.inputs[cfg.boolInputIndex].link != null || (this.inputs[cfg.boolInputIndex].links?.length)));
      if (linked) startPolling(this, cfg);
      else {
        stopPolling(this);
        const w = findBoolWidget(this, cfg.readWidgetName);
        if (w) setDownstreamMode(this, cfg.trueMode, !!w.value);
      }

      return r;
    };
  },
});
