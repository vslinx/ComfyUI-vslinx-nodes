import { app } from "../../../scripts/app.js";

// Anima LLLite Tiled ControlNet Sampler: the tiled-VAE-decode widgets only
// apply in multidiffusion mode (per_tile decodes each small tile on its own),
// so hide them unless sampling_mode === "multidiffusion".

const NODE_CLASS = "vsLinx_AnimaLLLiteTiledSampler";
const MODE_WIDGET = "sampling_mode";
const MULTIDIFFUSION = "multidiffusion";
const TILED_WIDGETS = ["vae_decode_tiled", "vae_decode_tile_size"];
const HIDDEN_TYPE = "vslinxhidden";

const findWidget = (node, name) => node.widgets?.find((w) => w.name === name);

const hideWidget = (w) => {
  if (!w || w.type === HIDDEN_TYPE) return;
  w._origType = w.type;
  w._origComputeSize = w.computeSize;
  w.type = HIDDEN_TYPE;
  // [0, -4] cancels the inter-widget spacing so no gap is left behind.
  w.computeSize = () => [0, -4];
  w.hidden = true;
};

const showWidget = (w) => {
  if (!w || w.type !== HIDDEN_TYPE) return;
  w.type = w._origType;
  w.computeSize = w._origComputeSize;
  w.hidden = false;
};

const updateVisibility = (node) => {
  const show = findWidget(node, MODE_WIDGET)?.value === MULTIDIFFUSION;
  for (const name of TILED_WIDGETS) {
    const w = findWidget(node, name);
    show ? showWidget(w) : hideWidget(w);
  }
  // Recompute height (keep the user's width) so the node shrinks/grows to fit.
  node.setSize([node.size[0], node.computeSize()[1]]);
  node.setDirtyCanvas(true, true);
};

app.registerExtension({
  name: "vslinx.animaTiledSampler.tiledVaeToggle",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_CLASS) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      const node = this;
      const mode = findWidget(node, MODE_WIDGET);
      if (mode) {
        const origCallback = mode.callback;
        mode.callback = function () {
          const ret = origCallback?.apply(this, arguments);
          updateVisibility(node);
          return ret;
        };
      }
      // Defer so widgets are fully in place on a freshly added node.
      requestAnimationFrame(() => updateVisibility(node));
      return r;
    };

    // Re-apply after a saved workflow restores widget values.
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      requestAnimationFrame(() => updateVisibility(this));
      return r;
    };
  },
});
