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

function setDownstreamMode(node, modeWhenTrue, on) {
  if (!node.outputs?.[0]) return;
  const out = node.outputs[0];
  const links = out.links || [];
  for (const lid of links) {
    const link = node.graph?.links?.[lid];
    if (!link) continue;
    const target = node.graph.getNodeById(link.target_id);
    if (!target) continue;
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

function hasAnyIncomingLinks(node) {
  const ins = node.inputs || [];
  for (const pin of ins) {
    if (!pin) continue;
    const lid = pin.link ?? (pin.links?.length ? pin.links[0] : null);
    if (lid != null) return true;
  }
  return false;
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

function resolveBooleanAtLink(graph, linkId, seen = new Set()) {
  const link = graph?.links?.[linkId];
  if (!link) return null;
  const src = graph.getNodeById(link.origin_id);
  if (!src) return null;

  const key = `${src.id}:${link.origin_slot}`;
  if (seen.has(key)) return null;
  seen.add(key);

  const evalFn = BOOLEAN_NODE_EVAL[src.type];
  if (typeof evalFn === "function") {
    const v = evalFn(src, link.origin_slot, (g, lid) => resolveBooleanAtLink(g, lid, seen));
    if (v != null) return !!v;
  }

  const outSlot = src.outputs?.[link.origin_slot];
  if (outSlot && typeof outSlot.__vl_bool_preview === "boolean") {
    return !!outSlot.__vl_bool_preview;
  }

  if (!hasAnyIncomingLinks(src)) {
    const widgetVal = readNodeBooleanWidget(src);
    if (widgetVal != null) return !!widgetVal;
  }

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
    nodeType.prototype.onConnectionsChange = function (type, slotIndex, isConnected, linkInfo, ioSlot) {
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