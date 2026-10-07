import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const BUTTON_OPTIONS = ["On hover", "Always"];

const ICON_EXPAND = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 4.5V1h3.5M11 4.5V1H7.5M1 7.5V11h3.5M11 7.5V11H7.5"/></svg>`;
const ICON_OPEN = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 1h4v4M11 1L5.5 6.5M9 7.5V11H1V3h3.5"/></svg>`;
const ICON_GRID = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 1h4v4H1zM7 1h4v4H7zM1 7h4v4H1zM7 7h4v4H7z"/></svg>`;
const ICON_PREV = `<svg width="10" height="12" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 1L2 6l5 5"/></svg>`;
const ICON_NEXT = `<svg width="10" height="12" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 1l5 5-5 5"/></svg>`;

const viewURL = (ref, preview = false) => {
  const params = new URLSearchParams({ filename: ref.filename, type: ref.type ?? "temp", subfolder: ref.subfolder ?? "" });
  return api.apiURL(`/view?${params.toString()}${preview ? app.getPreviewFormatParam() : ""}`);
};

const openInTab = (ref) => window.open(viewURL(ref), "_blank", "noopener");

const el = (tag, className, html) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
};

const iconButton = (className, icon, title, onClick, label) => {
  const b = el("button", className, icon);
  b.title = title;
  if (label) b.append(label);
  b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return b;
};

/* Key used by the frontend for node outputs: plain id in the root graph,
   "<subgraph id>:<node id>" inside a subgraph. */
const outputKey = (node) =>
  node.graph && node.graph !== app.rootGraph ? `${node.graph.id}:${node.id}` : String(node.id);

app.registerExtension({
  name: "VSLinx.BetterImagePreview",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== "vsLinx_BetterImagePreview") return;

    injectStyles();

    const ensureProps = (node) => {
      node.properties = node.properties || {};
      if (typeof node.properties.show_buttons === "undefined") {
        node.addProperty?.("show_buttons", "On hover", "enum", { values: BUTTON_OPTIONS });
      }
      if (!BUTTON_OPTIONS.includes(node.properties.show_buttons)) node.properties.show_buttons = "On hover";

      node.properties_info = node.properties_info || {};
      node.properties_info.show_buttons = { type: "enum", values: BUTTON_OPTIONS };
      const ctor = node.constructor;
      if (ctor) {
        ctor.properties_info = ctor.properties_info || {};
        ctor.properties_info.show_buttons = { type: "enum", values: BUTTON_OPTIONS };
      }
    };

    const applyButtonMode = (node) => {
      node._vslGallery?.root.classList.toggle("vsl-bip-always", node.properties.show_buttons === "Always");
    };

    /* ── grid view ── */
    /* Same layout as the built-in preview: pick the column count that shows the
       most image area, never scaling an image above its natural size. */
    const layoutGrid = (node) => {
      const g = node._vslGallery;
      const first = node.imgs?.[0];
      if (!g.grid || !first?.naturalWidth) return;
      const { naturalWidth: w, naturalHeight: h } = first;
      const n = g.images.length;
      let best = null;
      for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        const scale = Math.min(g.grid.clientWidth / cols / w, g.grid.clientHeight / rows / h, 1);
        if (!best || scale > best.scale) best = { cols, scale };
      }
      const cw = Math.floor(w * best.scale);
      const ch = Math.floor(h * best.scale);
      g.grid.style.gridTemplateColumns = `repeat(${best.cols}, ${cw}px)`;
      g.grid.style.gridAutoRows = `${ch}px`;
      g.grid.classList.toggle("vsl-bip-small", Math.min(cw, ch) < 70);
    };

    const renderGrid = (node) => {
      const g = node._vslGallery;
      g.full = null;
      g.root.replaceChildren();
      g.grid = el("div", "vsl-bip-grid");
      g.images.forEach((ref, i) => {
        const cell = el("div", "vsl-bip-cell");
        cell.title = "Click to view";
        const img = el("img");
        img.src = viewURL(ref, true);
        img.draggable = false;
        const actions = el("div", "vsl-bip-actions");
        actions.append(
          iconButton("vsl-bip-icon-btn", ICON_EXPAND, "View in node", () => showFull(node, i)),
          iconButton("vsl-bip-icon-btn", ICON_OPEN, "Open in new tab", () => openInTab(ref)),
        );
        cell.append(img, actions);
        cell.addEventListener("click", () => showFull(node, i));
        cell.addEventListener("mouseenter", () => { node.overIndex = i; });
        cell.addEventListener("mouseleave", () => { node.overIndex = null; });
        g.grid.appendChild(cell);
      });
      g.root.appendChild(g.grid);
      layoutGrid(node);
    };

    /* ── full view ── */
    const buildFull = (node) => {
      const g = node._vslGallery;
      const multi = g.images.length > 1;
      g.grid = null;
      g.root.replaceChildren();

      const toolbar = el("div", "vsl-bip-toolbar");
      if (multi) toolbar.appendChild(iconButton("vsl-bip-btn", ICON_GRID, "Back to grid (Esc)", () => showGrid(node), "Grid"));
      const position = el("div", "vsl-bip-position");
      toolbar.append(position, iconButton("vsl-bip-btn", ICON_OPEN, "Open in new tab", () => openInTab(g.images[g.index]), "Open"));

      const stage = el("div", "vsl-bip-stage");
      const img = el("img");
      img.draggable = false;
      stage.appendChild(img);

      let strip = null;
      if (multi) {
        stage.append(
          iconButton("vsl-bip-nav vsl-bip-prev", ICON_PREV, "Previous (←)", () => step(node, -1)),
          iconButton("vsl-bip-nav vsl-bip-next", ICON_NEXT, "Next (→)", () => step(node, 1)),
        );
        strip = el("div", "vsl-bip-strip");
        g.images.forEach((ref, i) => {
          const thumb = el("div", "vsl-bip-thumb");
          const t = el("img");
          t.src = viewURL(ref, true);
          t.draggable = false;
          thumb.appendChild(t);
          thumb.addEventListener("click", () => showFull(node, i));
          strip.appendChild(thumb);
        });
      }

      g.root.append(toolbar, stage);
      if (strip) g.root.appendChild(strip);
      g.full = { position, img, strip };
    };

    const showFull = (node, index) => {
      const g = node._vslGallery;
      const n = g.images.length;
      g.index = Math.max(0, Math.min(index, n - 1));
      node.imageIndex = g.index;
      if (!g.full) buildFull(node);

      const { position, img, strip } = g.full;
      img.src = viewURL(g.images[g.index], true);
      position.textContent = n > 1 ? `${g.index + 1} / ${n}` : "";
      if (strip) {
        [...strip.children].forEach((t, i) => t.classList.toggle("vsl-bip-current", i === g.index));
        const cur = strip.children[g.index];
        strip.scrollTo({ left: cur.offsetLeft - strip.clientWidth / 2 + cur.offsetWidth / 2, behavior: "smooth" });
      }
    };

    const showGrid = (node) => {
      const g = node._vslGallery;
      g.index = -1;
      node.imageIndex = null;
      renderGrid(node);
    };

    const step = (node, d) => {
      const g = node._vslGallery;
      const n = g.images.length;
      showFull(node, (g.index + d + n) % n);
    };

    const setImages = (node, images) => {
      const g = node._vslGallery;
      g.images = images ?? [];
      g.full = null;
      g.grid = null;
      node.overIndex = null;
      node.imgs = g.images.map((ref) => {
        const img = new Image();
        img.src = viewURL(ref, true);
        return img;
      });
      node.imgs[0]?.addEventListener("load", () => layoutGrid(node));
      if (!g.images.length) {
        g.index = -1;
        node.imageIndex = null;
        g.root.replaceChildren();
      } else if (g.images.length === 1) {
        showFull(node, 0);
      } else {
        // New images always start in the grid, like the built-in preview.
        showGrid(node);
      }
    };

    /* ── lifecycle ── */
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);
      ensureProps(this);

      // The gallery replaces the frontend's own image preview.
      this.hideOutputImages = true;

      const root = el("div", "vsl-bip");
      this._vslGallery = { root, images: [], index: -1, grid: null, full: null };
      this.addDOMWidget("gallery", "vslinx_gallery", root, { serialize: false, getMinHeight: () => 140 });
      applyButtonMode(this);

      // Show ComfyUI's node menu (incl. Open/Copy/Save Image) instead of the browser's.
      root.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        [e.canvasX, e.canvasY] = app.canvas.convertEventToCanvasOffset(e);
        app.canvas.processContextMenu(this, e);
      });

      // Hand middle-button drags to the canvas so panning works over the images too.
      const forwardMiddle = (e) => {
        if (e.type === "pointermove" ? !(e.buttons & 4) : e.button !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        app.canvas.canvas.dispatchEvent(new PointerEvent(e.type, e));
      };
      for (const type of ["pointerdown", "pointermove", "pointerup"]) root.addEventListener(type, forwardMiddle);

      this._vslResize = new ResizeObserver(() => layoutGrid(this));
      this._vslResize.observe(root);

      const [w, h] = this.size;
      this.setSize([Math.max(w, 320), Math.max(h, 360)]);
      return r;
    };

    // Skip the frontend's canvas preview; the gallery draws the images instead.
    nodeType.prototype.onDrawBackground = function () {};

    const origExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      const r = origExecuted?.apply(this, arguments);
      setImages(this, message?.images);
      return r;
    };

    const origKeyDown = nodeType.prototype.onKeyDown;
    nodeType.prototype.onKeyDown = function (e) {
      const g = this._vslGallery;
      if (g?.images.length && ["Escape", "ArrowRight", "ArrowLeft"].includes(e.key)) {
        if (!g.full || g.images.length < 2) return;
        if (e.key === "Escape") return showGrid(this);
        return step(this, e.key === "ArrowRight" ? 1 : -1);
      }
      return origKeyDown?.apply(this, arguments);
    };

    const origOnPropertyChanged = nodeType.prototype.onPropertyChanged;
    nodeType.prototype.onPropertyChanged = function (name) {
      const r = origOnPropertyChanged?.apply(this, arguments);
      if (name === "show_buttons") applyButtonMode(this);
      return r;
    };

    /* Restore the last outputs after a tab switch (the node is recreated,
       but the frontend keeps its outputs). */
    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = origConfigure?.apply(this, arguments);
      ensureProps(this);
      applyButtonMode(this);
      setTimeout(() => {
        const images = app.nodeOutputs?.[outputKey(this)]?.images;
        if (images?.length) setImages(this, images);
      }, 0);
      return r;
    };

    const origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      this._vslResize?.disconnect();
      return origRemoved?.apply(this, arguments);
    };
  },
});

// ── styles ────────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById("vsl-bip-styles")) return;
  const s = document.createElement("style");
  s.id = "vsl-bip-styles";
  s.textContent = CSS;
  document.head.appendChild(s);
}

const CSS = `
.vsl-bip {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #d8d8dc;
  font-family: inherit;
}
.vsl-bip img { display: block; width: 100%; height: 100%; user-select: none; }

/* ── grid ── */
.vsl-bip-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  justify-content: center;
  align-content: start;
}
.vsl-bip-cell {
  position: relative;
  overflow: hidden;
  cursor: zoom-in;
}
.vsl-bip-cell img { object-fit: contain; }
.vsl-bip-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 120ms;
}
.vsl-bip-cell:hover .vsl-bip-actions,
.vsl-bip-always .vsl-bip-actions { opacity: 1; }
.vsl-bip-icon-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 4px;
  background: rgba(20,20,22,0.82);
  color: #ececf0;
  cursor: pointer;
}
.vsl-bip-icon-btn:hover { background: rgba(60,60,66,0.95); }
.vsl-bip-small .vsl-bip-actions { top: 3px; right: 3px; }
.vsl-bip-small .vsl-bip-icon-btn { width: 20px; height: 20px; }

/* ── full view ── */
.vsl-bip-toolbar { display: flex; align-items: center; gap: 6px; }
.vsl-bip-position {
  flex: 1;
  text-align: center;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 11px;
  color: #9a9aa2;
}
.vsl-bip-btn {
  height: 26px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid #3e3e45;
  border-radius: 4px;
  background: #232326;
  color: #d8d8dc;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.vsl-bip-btn:hover { background: #33333a; }
.vsl-bip-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.vsl-bip-stage img { object-fit: contain; }
.vsl-bip-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  background: rgba(20,20,22,0.7);
  color: #ececf0;
  cursor: pointer;
}
.vsl-bip-nav:hover { background: rgba(60,60,66,0.95); }
.vsl-bip-prev { left: 6px; }
.vsl-bip-next { right: 6px; }
.vsl-bip-strip {
  flex: 0 0 auto;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: thin;
  scrollbar-color: #45454c transparent;
}
.vsl-bip-thumb {
  flex: 0 0 44px;
  height: 44px;
  border-radius: 3px;
  overflow: hidden;
  cursor: pointer;
  opacity: 0.55;
}
.vsl-bip-thumb img { object-fit: cover; }
.vsl-bip-thumb.vsl-bip-current { opacity: 1; outline: 2px solid #64b5f6; outline-offset: -2px; }
`;
