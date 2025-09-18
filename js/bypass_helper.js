import { app } from "/scripts/app.js";

const MODE_ALWAYS = 0;
const MODE_NEVER  = 2;
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
  const pin = node.inputs?.[boolInputIndex];
  if (!pin) return null;

  const linkId = pin.link ?? pin.links?.[0];
  if (linkId == null) return null;

  const link = node.graph?.links?.[linkId];
  if (!link) return null;

  const src = node.graph.getNodeById(link.origin_id);
  if (!src) return null;

  const widgets = src.widgets || [];
  for (const w of widgets) {
    const looksBool = w.type === "toggle" || w.type === "checkbox" || typeof w.value === "boolean";
    if (looksBool) return !!w.value;
  }
  if (typeof src.properties?.value === "boolean") return !!src.properties.value;

  return null;
}

function findBoolWidget(node, name) {
  if (!node.widgets) return null;
  return node.widgets.find(w => w.name === name || w.label === name);
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
  w.callback = function(v) {
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

      // If a downstream node connects while active, apply immediately
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