import { app } from "/scripts/app.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function getGroups() {
  return app.graph?._groups || [];
}

function getBookmarkNodes() {
  return (app.graph?._nodes || []).filter(
    (n) => n.type === "vsLinx_GroupBookmarks"
  );
}

function collectActiveBookmarks() {
  const seen = new Set();
  const result = [];
  for (const node of getBookmarkNodes()) {
    for (const title of node.properties?.bookmarks || []) {
      if (!seen.has(title)) {
        seen.add(title);
        result.push(title);
      }
    }
  }
  return result;
}

function fitViewToGroup(group) {
  const canvas = app.canvas;
  canvas.centerOnNode(group);
  const zoomX = canvas.canvas.width / group._size[0] - 0.02;
  const zoomY = canvas.canvas.height / group._size[1] - 0.02;
  const currentZoom = canvas.ds?.scale || 1;
  canvas.setZoom(Math.min(currentZoom, zoomX, zoomY), [
    canvas.canvas.width / 2,
    canvas.canvas.height / 2,
  ]);
  canvas.setDirty(true, true);
}

// ── modal ─────────────────────────────────────────────────────────────────────

function openBookmarkModal(node) {
  document.querySelector(".vsl-bm-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "vsl-bm-overlay";
  overlay.innerHTML = `
    <div class="vsl-bm-modal">
      <div class="vsl-bm-header">
        <span class="vsl-bm-title">Manage Group Bookmarks</span>
        <button class="vsl-bm-close" title="Close">✕</button>
      </div>
      <div class="vsl-bm-body">
        <div class="vsl-bm-col">
          <div class="vsl-bm-col-title">All Groups</div>
          <div class="vsl-bm-list" id="vsl-bm-all"></div>
        </div>
        <div class="vsl-bm-divider"></div>
        <div class="vsl-bm-col">
          <div class="vsl-bm-col-title">Active Bookmarks</div>
          <div class="vsl-bm-list vsl-bm-sortable" id="vsl-bm-active"></div>
        </div>
      </div>
      <div class="vsl-bm-footer">
        <button class="vsl-bm-btn-confirm">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const allList = overlay.querySelector("#vsl-bm-all");
  const activeList = overlay.querySelector("#vsl-bm-active");

  let active = [...(node.properties?.bookmarks || [])];

  function renderAll() {
    allList.innerHTML = "";
    const activeTitles = new Set(active);
    const groups = getGroups();

    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "vsl-bm-empty";
      empty.textContent = "No groups found in this workflow.";
      allList.appendChild(empty);
      return;
    }

    for (const g of groups) {
      const title = g.title || "";
      const item = document.createElement("div");
      item.className =
        "vsl-bm-item" + (activeTitles.has(title) ? " vsl-bm-item--selected" : "");
      item.textContent = title || "(untitled)";
      item.title = activeTitles.has(title)
        ? "Click to remove from bookmarks"
        : "Click to add to bookmarks";
      item.addEventListener("click", () => {
        if (activeTitles.has(title)) {
          active = active.filter((x) => x !== title);
        } else {
          active.push(title);
        }
        renderAll();
        renderActive();
      });
      allList.appendChild(item);
    }
  }

  function renderActive() {
    activeList.innerHTML = "";

    if (!active.length) {
      const empty = document.createElement("div");
      empty.className = "vsl-bm-empty";
      empty.textContent = "No bookmarks yet.\nClick groups on the left to add them.";
      activeList.appendChild(empty);
      return;
    }

    for (const title of active) {
      const item = document.createElement("div");
      item.className = "vsl-bm-item vsl-bm-item--drag";
      item.draggable = true;
      item.dataset.title = title;

      const handle = document.createElement("span");
      handle.className = "vsl-bm-drag-handle";
      handle.textContent = "⠿";
      handle.title = "Drag to reorder";

      const label = document.createElement("span");
      label.className = "vsl-bm-item-label";
      label.textContent = title || "(untitled)";

      const removeBtn = document.createElement("button");
      removeBtn.className = "vsl-bm-item-remove";
      removeBtn.textContent = "✕";
      removeBtn.title = "Remove bookmark";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        active = active.filter((x) => x !== title);
        renderAll();
        renderActive();
      });

      item.appendChild(handle);
      item.appendChild(label);
      item.appendChild(removeBtn);

      // ── drag-and-drop reordering ──────────────────────────────────────────
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", title);
        item.classList.add("vsl-bm-item--dragging");
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("vsl-bm-item--dragging");
        activeList
          .querySelectorAll(".vsl-bm-item--dragover")
          .forEach((el) => el.classList.remove("vsl-bm-item--dragover"));
      });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        activeList
          .querySelectorAll(".vsl-bm-item--dragover")
          .forEach((el) => el.classList.remove("vsl-bm-item--dragover"));
        item.classList.add("vsl-bm-item--dragover");
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromTitle = e.dataTransfer.getData("text/plain");
        if (fromTitle === title) return;
        const fromIdx = active.indexOf(fromTitle);
        const toIdx = active.indexOf(title);
        if (fromIdx === -1 || toIdx === -1) return;
        active.splice(fromIdx, 1);
        active.splice(toIdx, 0, fromTitle);
        renderActive();
        renderAll();
      });

      activeList.appendChild(item);
    }
  }

  renderAll();
  renderActive();

  overlay.querySelector(".vsl-bm-close").addEventListener("click", () =>
    overlay.remove()
  );
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector(".vsl-bm-btn-confirm").addEventListener("click", () => {
    node.properties = node.properties || {};
    node.properties.bookmarks = [...active];
    bookmarkPanel?.update();
    overlay.remove();
  });
}

// ── side panel ────────────────────────────────────────────────────────────────

class BookmarkPanel {
  constructor() {
    this._visible = true;
    this._el = null;
    this._list = null;
    this._icon = null;
    this._injectStyles();
    this._build();
  }

  _build() {
    const panel = document.createElement("div");
    panel.id = "vsl-bm-panel";
    panel.className = "vsl-bm-panel";
    panel.innerHTML = `
      <div class="vsl-bm-panel-toggle" id="vsl-bm-toggle" title="Toggle bookmarks panel">
        <span class="vsl-bm-toggle-icon">&#x276F;</span>
      </div>
      <div class="vsl-bm-panel-inner">
        <div class="vsl-bm-panel-header">Bookmarks</div>
        <div class="vsl-bm-panel-list" id="vsl-bm-panel-list"></div>
      </div>
    `;
    document.body.appendChild(panel);

    this._el = panel;
    this._list = panel.querySelector("#vsl-bm-panel-list");
    this._icon = panel.querySelector(".vsl-bm-toggle-icon");

    panel.querySelector("#vsl-bm-toggle").addEventListener("click", () =>
      this._toggle()
    );

    panel.style.display = "none";
  }

  _toggle() {
    this._visible = !this._visible;
    const inner = this._el.querySelector(".vsl-bm-panel-inner");
    inner.style.display = this._visible ? "" : "none";
    // ❯ = panel open (click to collapse rightward)
    // ❮ = panel closed (click to expand leftward)
    this._icon.innerHTML = this._visible ? "&#x276F;" : "&#x276E;";
  }

  update() {
    const bookmarks = collectActiveBookmarks();
    const hasNodes = getBookmarkNodes().length > 0;

    if (!hasNodes || !bookmarks.length) {
      this._el.style.display = "none";
      return;
    }

    this._el.style.display = "";
    this._list.innerHTML = "";

    const groups = getGroups();
    for (const title of bookmarks) {
      const group = groups.find((g) => g.title === title);
      const item = document.createElement("div");
      item.className =
        "vsl-bm-panel-item" + (group ? "" : " vsl-bm-panel-item--missing");
      item.textContent = title || "(untitled)";
      item.title = group
        ? `Jump to group: ${title}`
        : `Group "${title}" not found in current workflow`;
      if (group) {
        item.addEventListener("click", () => fitViewToGroup(group));
      }
      this._list.appendChild(item);
    }
  }

  _injectStyles() {
    if (document.getElementById("vsl-bm-styles")) return;
    const style = document.createElement("style");
    style.id = "vsl-bm-styles";
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }
}

// ── styles ────────────────────────────────────────────────────────────────────

const PANEL_CSS = `
/* ── Side Panel ──────────────────────────────────────────────────── */
#vsl-bm-panel {
  position: fixed;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  display: flex;
  flex-direction: row;
  align-items: stretch;
  z-index: 1000;
  font-family: var(--p-font-family, "Inter", system-ui, sans-serif);
  font-size: 13px;
  pointer-events: all;
}

.vsl-bm-panel-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  background: var(--comfy-menu-bg, #1e1e1e);
  border: 1px solid var(--border-color, #3d3d3d);
  border-right: none;
  border-radius: 6px 0 0 6px;
  cursor: pointer;
  padding: 18px 1px;
  color: var(--input-text, #b0b0b0);
  user-select: none;
  transition: background 0.15s;
  flex-shrink: 0;
}
.vsl-bm-panel-toggle:hover {
  background: var(--comfy-input-bg, #2a2a2a);
  color: #fff;
}
.vsl-bm-toggle-icon {
  font-size: 9px;
  line-height: 1;
}

.vsl-bm-panel-inner {
  width: 170px;
  background: var(--comfy-menu-bg, #1e1e1e);
  border: 1px solid var(--border-color, #3d3d3d);
  border-right: none;
  border-radius: 6px 0 0 6px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 55vh;
}

.vsl-bm-panel-header {
  padding: 7px 10px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--input-text, #888);
  border-bottom: 1px solid var(--border-color, #3d3d3d);
  background: var(--comfy-input-bg, #252525);
  flex-shrink: 0;
}

.vsl-bm-panel-list {
  overflow-y: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color, #444) transparent;
}

.vsl-bm-panel-item {
  padding: 8px 10px;
  color: var(--input-text, #c0c0c0);
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.1s, color 0.1s;
  font-size: 12px;
}
.vsl-bm-panel-item:last-child {
  border-bottom: none;
}
.vsl-bm-panel-item:hover {
  background: var(--comfy-input-bg, #2a2a2a);
  color: #fff;
}
.vsl-bm-panel-item--missing {
  opacity: 0.38;
  cursor: default;
  font-style: italic;
}
.vsl-bm-panel-item--missing:hover {
  background: none;
  color: var(--input-text, #c0c0c0);
}

/* ── Modal Overlay ───────────────────────────────────────────────── */
.vsl-bm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--p-font-family, "Inter", system-ui, sans-serif);
}

.vsl-bm-modal {
  background: var(--comfy-menu-bg, #1e1e1e);
  border: 1px solid var(--border-color, #3d3d3d);
  border-radius: 8px;
  width: 580px;
  max-width: 92vw;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
}

.vsl-bm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border-color, #3d3d3d);
  background: var(--comfy-input-bg, #252525);
  flex-shrink: 0;
}
.vsl-bm-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--input-text, #d0d0d0);
}
.vsl-bm-close {
  background: none;
  border: none;
  color: var(--input-text, #888);
  cursor: pointer;
  font-size: 13px;
  padding: 3px 7px;
  border-radius: 4px;
  line-height: 1;
  transition: background 0.1s, color 0.1s;
}
.vsl-bm-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.vsl-bm-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 240px;
}

.vsl-bm-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.vsl-bm-col-title {
  padding: 7px 12px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 700;
  color: var(--input-text, #888);
  border-bottom: 1px solid var(--border-color, #2e2e2e);
  background: rgba(255, 255, 255, 0.015);
  flex-shrink: 0;
}

.vsl-bm-divider {
  width: 1px;
  background: var(--border-color, #3d3d3d);
  flex-shrink: 0;
}

.vsl-bm-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color, #444) transparent;
}

.vsl-bm-empty {
  padding: 20px 14px;
  color: var(--input-text, #666);
  font-size: 12px;
  font-style: italic;
  white-space: pre-line;
  line-height: 1.5;
}

.vsl-bm-item {
  padding: 8px 12px;
  color: var(--input-text, #c0c0c0);
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.1s;
  font-size: 12px;
  user-select: none;
}
.vsl-bm-item:hover {
  background: var(--comfy-input-bg, #2a2a2a);
}
.vsl-bm-item--selected {
  background: rgba(74, 158, 255, 0.12);
  color: #7fbfff;
}
.vsl-bm-item--selected:hover {
  background: rgba(74, 158, 255, 0.2);
}
.vsl-bm-item--drag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 4px;
  overflow: visible;
}
.vsl-bm-item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vsl-bm-drag-handle {
  color: var(--input-text, #555);
  cursor: grab;
  font-size: 15px;
  padding: 0 3px;
  flex-shrink: 0;
  line-height: 1;
}
.vsl-bm-drag-handle:active {
  cursor: grabbing;
}
.vsl-bm-item--dragging {
  opacity: 0.35;
}
.vsl-bm-item--dragover {
  border-top: 2px solid #4a9eff;
  margin-top: -1px;
}
.vsl-bm-item-remove {
  margin-left: auto;
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--input-text, #666);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  line-height: 1;
  transition: background 0.1s, color 0.1s;
}
.vsl-bm-item-remove:hover {
  background: rgba(255, 80, 80, 0.18);
  color: #ff7070;
}

.vsl-bm-footer {
  padding: 11px 16px;
  border-top: 1px solid var(--border-color, #3d3d3d);
  display: flex;
  justify-content: flex-end;
  background: rgba(255, 255, 255, 0.015);
  flex-shrink: 0;
}
.vsl-bm-btn-confirm {
  background: #4a9eff;
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 7px 22px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.vsl-bm-btn-confirm:hover {
  background: #3a8ef0;
}
.vsl-bm-btn-confirm:active {
  background: #2a7ee0;
}
`;

// ── extension ─────────────────────────────────────────────────────────────────

let bookmarkPanel = null;

app.registerExtension({
  name: "vsLinx.GroupBookmarks",

  async setup() {
    bookmarkPanel = new BookmarkPanel();

    // Update panel after any graph load/configure
    const origLoadGraphData = app.loadGraphData?.bind(app);
    if (typeof origLoadGraphData === "function") {
      app.loadGraphData = async function (...args) {
        const r = await origLoadGraphData(...args);
        setTimeout(() => bookmarkPanel?.update(), 150);
        return r;
      };
    }

    // Also hook graph configure for workflow switches
    const origGraphConfigure = app.graph?.onConfigure;
    if (app.graph) {
      app.graph.onConfigure = function (...args) {
        const r = origGraphConfigure?.apply(this, args);
        setTimeout(() => bookmarkPanel?.update(), 150);
        return r;
      };
    }
  },

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== "vsLinx_GroupBookmarks") return;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);

      this.properties = this.properties || {};
      if (!Array.isArray(this.properties.bookmarks)) {
        this.properties.bookmarks = [];
      }

      this.addWidget("button", "Manage Bookmarks", null, () => {
        openBookmarkModal(this);
      });

      // Notify panel that a bookmark node now exists
      setTimeout(() => bookmarkPanel?.update(), 50);
      return r;
    };

    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (...args) {
      const r = origConfigure?.apply(this, args);
      // Properties are restored by this point
      setTimeout(() => bookmarkPanel?.update(), 50);
      return r;
    };

    const origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function (...args) {
      const r = origRemoved?.apply(this, args);
      bookmarkPanel?.update();
      return r;
    };
  },
});
