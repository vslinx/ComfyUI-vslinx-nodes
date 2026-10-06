import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

/*
 * vsLinx Image Filter - frontend
 *
 * The backend pauses on the "vslinx-image-filter" websocket event and waits
 * until the selection dialog POSTs the picked indices (in click order) to
 * /vslinx/image_filter/submit. "vslinx-image-filter-done" reports the
 * outcome back so the node can show its status.
 */

const EVENT = "vslinx-image-filter";
const EVENT_DONE = "vslinx-image-filter-done";
const SUBMIT_URL = "/vslinx/image_filter/submit";
const RESET_URL = "/vslinx/image_filter/reset";
const PENDING_URL = "/vslinx/image_filter/pending";
const LS_SIZE = "vslinx.imageFilter.tileSize";

const NONE_MODES = ["Stop run", "Stop branch"];
const SIZES = [["Fit", 0], ["S", 160], ["M", 240], ["L", 360]];
const GAP = 10;

const ICON_EXPAND = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 4.5V1h3.5M11 4.5V1H7.5M1 7.5V11h3.5M11 7.5V11H7.5"/></svg>`;
const ICON_GRID = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 1h4v4H1zM7 1h4v4H7zM1 7h4v4H1zM7 7h4v4H7z"/></svg>`;
const ICON_RESET = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 7a5 5 0 1 0 1.5-3.5M2 1.5V4h2.5"/></svg>`;
const ICON_PREV = `<svg width="12" height="16" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 1L2 6l5 5"/></svg>`;
const ICON_NEXT = `<svg width="12" height="16" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 1l5 5-5 5"/></svg>`;

// { sessionId, node, images, aspects, remaining, timeout, selected, preview, open, overlay, pill, tick, ... }
let active = null;

const fmt = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

const viewURL = (ref) => {
  const params = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder || "", type: ref.type || "temp" });
  return api.apiURL(`/view?${params.toString()}${app.getPreviewFormatParam()}`);
};

const el = (tag, className, html) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
};

const button = (className, html, onClick, title) => {
  const b = el("button", className, html);
  if (title) b.title = title;
  b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return b;
};

const post = (url, body) =>
  api.fetchApi(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/* Execution ids look like "12" in the root graph and "5:12" inside subgraphs. */
const findNode = (id) => {
  const parts = String(id ?? "").split(":");
  let graph = app.rootGraph;
  for (const p of parts.slice(0, -1)) graph = graph?.getNodeById(p)?.subgraph;
  return graph?.getNodeById(parts.at(-1)) ?? null;
};

const readTileSize = () => {
  try {
    const v = Number(localStorage.getItem(LS_SIZE));
    return v >= 0 && v < SIZES.length ? v : 0;
  } catch { return 0; }
};

const writeTileSize = (v) => {
  try { localStorage.setItem(LS_SIZE, String(v)); } catch { /* storage disabled - non-fatal */ }
};

// ----------------------------- node status ------------------------------

const isWaiting = (node) => !!active && !active.resolved && active.node === node;

function renderNodeStatus(node) {
  const panel = node?._vslFilterPanel;
  if (!panel) return;

  const waiting = isWaiting(node);
  const s = node._vslFilterState;
  let title = "Idle";
  let sub = "Opens the selector when images arrive";
  if (waiting) {
    title = "Waiting for selection";
    sub = `${active.images.length} images · ${fmt(active.remaining)} left`;
  } else if (s?.status === "passed") {
    title = "Passed through";
    sub = "Single image sent without selection";
  } else if (s?.status === "sent") {
    title = "Sent";
    sub = `${s.sent} of ${s.total} images passed on`;
  } else if (s?.status === "cancelled") {
    title = "Run cancelled";
    sub = "Nothing was passed on";
  } else if (s?.status === "timedout") {
    title = "Timed out";
    sub = `${s.mode} · ${s.sent} of ${s.total} passed on`;
  }

  panel.root.classList.toggle("vsl-if-waiting", waiting);
  panel.title.textContent = title;
  panel.sub.textContent = sub;
  panel.action.textContent = waiting ? "Open selector" : "Run again";
  panel.action.style.display = waiting || s ? "" : "none";
}

// ------------------------------- dialog ---------------------------------

function closeDialog() {
  if (!active) return;
  clearInterval(active.tick);
  document.removeEventListener("keydown", active.keyHandler, true);
  window.removeEventListener("resize", placePill);
  active.resizeObserver.disconnect();
  active.overlay.remove();
  active.pill.remove();
  const node = active.node;
  active = null;
  renderNodeStatus(node);
}

function resolveDialog(cancelled) {
  if (!active || active.resolved) return;
  active.resolved = true;
  const { sessionId, selected } = active;
  closeDialog();
  post(SUBMIT_URL, { session_id: sessionId, selection: cancelled ? [] : selected, cancelled })
    .catch((err) => console.error("[vsLinx] Image Filter submit failed:", err));
}

/* Keep the waiting pill below ComfyUI's top bars and the floating action bar. */
function placePill() {
  if (!active) return;
  let top = 12;
  for (const e of document.querySelectorAll(`.comfyui-body-top, .workflow-tabs, [data-testid="action-bar-card"]`)) {
    const r = e.getBoundingClientRect();
    if (r.height && r.top < window.innerHeight / 3) top = Math.max(top, r.bottom + 8);
  }
  active.pill.style.top = `${top}px`;
}

function setOpen(open) {
  active.open = open;
  active.overlay.style.display = open ? "" : "none";
  active.pill.style.display = open ? "none" : "";
  if (open) requestAnimationFrame(layoutGrid);
  else placePill();
}

function toggle(i) {
  const sel = active.selected;
  const at = sel.indexOf(i);
  if (at >= 0) sel.splice(at, 1);
  else sel.push(i);
  renderSelection();
}

function setSelection(indices) {
  active.selected = indices;
  renderSelection();
}

function step(d) {
  const n = active.images.length;
  showPreview((active.preview + d + n) % n);
}

function renderTimer() {
  const { remaining, timeout, ui } = active;
  const low = remaining <= 30;
  ui.timerText.textContent = fmt(remaining);
  ui.timerText.classList.toggle("vsl-if-low", low);
  ui.timerBar.classList.toggle("vsl-if-low", low);
  ui.timerBar.style.width = `${Math.round((remaining / timeout) * 100)}%`;
  active.pillSub.textContent = `${active.images.length} images · ${fmt(remaining)}`;
  renderNodeStatus(active.node);
}

function renderSelection() {
  const { selected, images, ui } = active;
  const n = images.length;
  ui.count.textContent = selected.length ? `${selected.length} of ${n} selected` : `${n} images · none selected`;
  ui.send.textContent = selected.length ? `Send ${selected.length}` : "Send none";
  ui.grid.classList.toggle("vsl-if-has-selection", selected.length > 0);
  ui.tiles.forEach((tile, i) => {
    const order = selected.indexOf(i);
    tile.classList.toggle("vsl-if-selected", order >= 0);
    tile._badge.textContent = order >= 0 ? String(order + 1) : "";
  });
  if (active.preview >= 0) renderPreview();
}

function renderPreview() {
  const { preview, selected, images, ui } = active;
  const order = selected.indexOf(preview);
  ui.pvPosition.textContent = `${preview + 1} / ${images.length}`;
  ui.pvImg.src = viewURL(images[preview]);
  ui.pvStage.classList.toggle("vsl-if-selected", order >= 0);
  ui.pvToggle.classList.toggle("vsl-if-selected", order >= 0);
  ui.pvLabel.textContent = order >= 0 ? `Selected · #${order + 1}` : "Select";
}

function showPreview(i) {
  active.preview = i;
  active.ui.gridWrap.style.display = "none";
  active.ui.pvWrap.style.display = "";
  renderPreview();
}

function showGrid() {
  active.preview = -1;
  active.ui.pvWrap.style.display = "none";
  active.ui.gridWrap.style.display = "";
  layoutGrid();
}

/* "Fit" picks the column count that shows the most image area without
   scrolling (images are letterboxed inside their cells); S/M/L use a fixed
   minimum tile width and scroll. */
function layoutGrid() {
  if (!active || active.preview >= 0) return;
  const { ui, aspects } = active;
  const n = aspects.length;
  const W = ui.gridWrap.clientWidth - 40;
  const H = ui.gridWrap.clientHeight - 40;

  let best = null;
  if (SIZES[active.size][1] === 0 && W > 0 && H > 0) {
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const cw = (W - GAP * (c - 1)) / c;
      const ch = (H - GAP * (r - 1)) / r;
      if (cw < 40 || ch < 40) continue;
      let area = 0;
      for (const a of aspects) {
        const dw = Math.min(cw, ch * a);
        area += (dw * dw) / a;
      }
      if (!best || area > best.area) best = { c, ch: Math.floor(ch), area };
    }
    if (best && best.ch < 100) best = null;
  }

  ui.grid.classList.toggle("vsl-if-fit", !!best);
  if (best) {
    ui.grid.style.gridTemplateColumns = `repeat(${best.c}, minmax(0, 1fr))`;
    ui.grid.style.gridAutoRows = `${best.ch}px`;
  } else {
    ui.grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${SIZES[active.size][1] || 240}px, 1fr))`;
    ui.grid.style.gridAutoRows = "auto";
  }
}

function renderSizes() {
  active.ui.sizeButtons.forEach((b, i) => b.classList.toggle("vsl-if-active", i === active.size));
}

function showDialog(data) {
  if (active) { active.resolved = true; closeDialog(); }

  const images = data.images || [];
  const aspects = (data.sizes || []).map(([w, h]) => w / h);
  // Fixed-size tiles take the images' aspect ratio when they all share one, otherwise square.
  const tileAspect = aspects.every((a) => a === aspects[0]) ? `${data.sizes[0][0]} / ${data.sizes[0][1]}` : "1";
  const overlay = el("div", "vsl-if-overlay");
  const ui = {};

  // ── header ──
  const header = el("div", "vsl-if-header");
  const titleBox = el("div", "vsl-if-titlebox");
  titleBox.append(el("div", "vsl-if-title", "Select images"));
  ui.count = el("div", "vsl-if-count");
  titleBox.append(ui.count);

  const sizes = el("div", "vsl-if-sizes");
  ui.sizeButtons = SIZES.map(([label], i) => {
    const b = button("vsl-if-size", label, () => { active.size = i; writeTileSize(i); renderSizes(); layoutGrid(); }, "Tile size");
    sizes.append(b);
    return b;
  });

  const picks = el("div", "vsl-if-group");
  picks.append(
    button("vsl-if-btn", "All", () => setSelection(images.map((_, i) => i))),
    button("vsl-if-btn", "None", () => setSelection([])),
    button("vsl-if-btn", "Invert", () => setSelection(images.map((_, i) => i).filter((i) => !active.selected.includes(i)))),
  );

  const timer = el("div", "vsl-if-timer");
  const timerInfo = el("div", "vsl-if-timer-info");
  ui.timerText = el("div", "vsl-if-timer-text");
  const track = el("div", "vsl-if-timer-track");
  ui.timerBar = el("div", "vsl-if-timer-bar");
  track.append(ui.timerBar);
  timerInfo.append(ui.timerText, track);
  timer.append(timerInfo, button("vsl-if-btn vsl-if-icon", ICON_RESET, async () => {
    const { sessionId } = active;
    const r = await post(RESET_URL, { session_id: sessionId }).then((r) => r.json()).catch(() => null);
    if (r?.ok && active?.sessionId === sessionId) { active.remaining = r.remaining; renderTimer(); }
  }, "Reset timer"));

  const actions = el("div", "vsl-if-group");
  ui.send = button("vsl-if-send", "", () => resolveDialog(false), "Send (Enter)");
  actions.append(
    button("vsl-if-btn vsl-if-lg", "Hide", () => setOpen(false), "Hide (Esc)"),
    button("vsl-if-btn vsl-if-lg", "Cancel run", () => resolveDialog(true)),
    ui.send,
  );

  header.append(titleBox, sizes, el("div", "vsl-if-spacer"), picks, el("div", "vsl-if-spacer"), timer, el("div", "vsl-if-divider"), actions);

  // ── grid ──
  ui.gridWrap = el("div", "vsl-if-grid-wrap");
  ui.grid = el("div", "vsl-if-grid");
  ui.grid.style.setProperty("--vsl-if-aspect", tileAspect);
  ui.tiles = images.map((ref, i) => {
    const tile = el("div", "vsl-if-tile");
    const img = el("img");
    img.src = viewURL(ref);
    img.draggable = false;
    tile._badge = el("div", "vsl-if-check");
    tile.append(img, tile._badge, button("vsl-if-zoom", ICON_EXPAND, () => showPreview(i), "View larger"));
    tile.addEventListener("click", () => toggle(i));
    ui.grid.append(tile);
    return tile;
  });
  ui.gridWrap.append(ui.grid);

  // ── large view ──
  ui.pvWrap = el("div", "vsl-if-preview");
  ui.pvWrap.style.display = "none";
  const pvBar = el("div", "vsl-if-pv-bar");
  ui.pvPosition = el("div", "vsl-if-pv-position");
  ui.pvLabel = el("span");
  ui.pvToggle = button("vsl-if-pv-toggle", `<span class="vsl-if-pv-dot"></span>`, () => toggle(active.preview), "Toggle selection (Space)");
  ui.pvToggle.append(ui.pvLabel);
  pvBar.append(button("vsl-if-btn", `${ICON_GRID} Grid`, showGrid), ui.pvPosition, ui.pvToggle);
  ui.pvStage = el("div", "vsl-if-pv-stage");
  ui.pvImg = el("img");
  ui.pvImg.draggable = false;
  ui.pvStage.append(
    ui.pvImg,
    button("vsl-if-nav vsl-if-prev", ICON_PREV, () => step(-1), "Previous (←)"),
    button("vsl-if-nav vsl-if-next", ICON_NEXT, () => step(1), "Next (→)"),
  );
  ui.pvWrap.append(pvBar, ui.pvStage);

  // ── footer ──
  const footer = el("div", "vsl-if-footer");
  for (const hint of ["Click · select", "Space · select in large view", "← → · browse", "A · all", "Enter · send", "Esc · back / hide"]) {
    footer.append(el("div", null, hint));
  }

  overlay.append(header, ui.gridWrap, ui.pvWrap, footer);

  // ── waiting pill (shown while the dialog is hidden) ──
  const pill = el("div", "vsl-if-pill");
  const pillSub = el("div", "vsl-if-pill-sub");
  pill.append(el("div", "vsl-if-pill-dot"), el("div", "vsl-if-pill-title", "Image Filter is waiting"), pillSub, button("vsl-if-pill-open", "Open selector", () => setOpen(true)));

  const keyHandler = (e) => {
    if (!active?.open) return;
    const pv = active.preview;
    let handled = true;
    if (e.key === "Escape") pv >= 0 ? showGrid() : setOpen(false);
    else if (e.key === "Enter") resolveDialog(false);
    else if ((e.key === "a" || e.key === "A") && !e.ctrlKey && !e.metaKey) setSelection(images.map((_, i) => i));
    else if (pv >= 0 && e.key === " ") toggle(pv);
    else if (pv >= 0 && e.key === "ArrowRight") step(1);
    else if (pv >= 0 && e.key === "ArrowLeft") step(-1);
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  };

  document.body.append(overlay, pill);
  document.addEventListener("keydown", keyHandler, true);
  window.addEventListener("resize", placePill);

  const resizeObserver = new ResizeObserver(layoutGrid);
  resizeObserver.observe(ui.gridWrap);

  active = {
    sessionId: data.session_id,
    node: findNode(data.node_id),
    images,
    aspects,
    timeout: data.timeout,
    remaining: data.remaining ?? data.timeout,
    selected: [],
    preview: -1,
    size: readTileSize(),
    open: true,
    resolved: false,
    overlay, pill, pillSub, ui, keyHandler, resizeObserver,
    tick: setInterval(() => {
      if (active.remaining > 0) active.remaining--;
      renderTimer();
    }, 1000),
  };

  renderSizes();
  renderSelection();
  renderTimer();
  setOpen(true);
}

// ------------------------------ extension -------------------------------

app.registerExtension({
  name: "VSLinx.ImageFilter",

  setup() {
    injectStyles();

    api.addEventListener(EVENT, (e) => showDialog(e.detail));

    api.addEventListener(EVENT_DONE, ({ detail }) => {
      const node = findNode(detail.node_id);
      if (active && active.node === node) {
        active.resolved = true;
        closeDialog();
      }
      if (node) node._vslFilterState = detail;
      renderNodeStatus(node);
    });

    // Run was cancelled/errored elsewhere -> the backend wait already unwound.
    const closeOnEnd = () => {
      if (!active) return;
      if (active.node) active.node._vslFilterState = { status: "cancelled" };
      active.resolved = true;
      closeDialog();
    };
    api.addEventListener("execution_interrupted", closeOnEnd);
    api.addEventListener("execution_error", closeOnEnd);

    // Page was reloaded while the backend is still waiting -> restore.
    api.fetchApi(PENDING_URL)
      .then((r) => r.json())
      .then((d) => { if (d?.pending) showDialog(d.pending); })
      .catch(() => {});
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== "vsLinx_ImageFilter") return;

    const getNoneWidget = (node) => node.widgets?.find((w) => w.name === "on_none");

    const hideWidget = (w) => {
      if (!w) return;
      w.hidden = true;
      w.draw = () => {};
      w.computeSize = () => [0, 0];
    };

    const ensureProps = (node) => {
      node.properties = node.properties || {};
      if (typeof node.properties.on_none === "undefined") {
        node.addProperty?.("on_none", "Stop run", "enum", { values: NONE_MODES });
      }
      if (!NONE_MODES.includes(node.properties.on_none)) node.properties.on_none = "Stop run";

      node.properties_info = node.properties_info || {};
      node.properties_info.on_none = { type: "enum", values: NONE_MODES };
      const ctor = node.constructor;
      if (ctor) {
        ctor.properties_info = ctor.properties_info || {};
        ctor.properties_info.on_none = { type: "enum", values: NONE_MODES };
      }
    };

    const syncNoneWidget = (node) => {
      const w = getNoneWidget(node);
      hideWidget(w);
      if (w) w.value = node.properties.on_none;
    };

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);
      ensureProps(this);
      syncNoneWidget(this);

      const root = el("div", "vsl-if-status");
      const text = el("div", "vsl-if-status-text");
      const head = el("div", "vsl-if-status-head");
      const title = el("div", "vsl-if-status-title");
      head.append(el("div", "vsl-if-status-dot"), title);
      const sub = el("div", "vsl-if-status-sub");
      text.append(head, sub);
      const action = button("vsl-if-status-btn", "", () => (isWaiting(this) ? setOpen(true) : app.queuePrompt(0, 1)));
      root.append(text, action);
      this._vslFilterPanel = { root, title, sub, action };
      this.addDOMWidget("status", "vslinx_filter_status", root, { serialize: false, getMinHeight: () => 64 });
      renderNodeStatus(this);
      return r;
    };

    const origOnPropertyChanged = nodeType.prototype.onPropertyChanged;
    nodeType.prototype.onPropertyChanged = function (name) {
      const r = origOnPropertyChanged?.apply(this, arguments);
      if (name === "on_none") syncNoneWidget(this);
      return r;
    };

    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = origConfigure?.apply(this, arguments);
      ensureProps(this);
      setTimeout(() => syncNoneWidget(this), 0);
      return r;
    };
  },
});

// ── styles ────────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById("vsl-if-styles")) return;
  const s = document.createElement("style");
  s.id = "vsl-if-styles";
  s.textContent = CSS;
  document.head.appendChild(s);
}

const CSS = `
/* ── node status panel ── */
.vsl-if-status {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #242427;
  border: 1px solid #34343a;
  border-radius: 6px;
  color: #d8d8dc;
  font-family: inherit;
}
.vsl-if-status-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.vsl-if-status-head { display: flex; align-items: center; gap: 7px; }
.vsl-if-status-dot { width: 8px; height: 8px; border-radius: 50%; background: #7a7a82; flex-shrink: 0; }
.vsl-if-waiting .vsl-if-status-dot { background: #e3b341; }
.vsl-if-status-title { font-size: 12px; font-weight: 500; color: #e6e6ea; }
.vsl-if-status-sub {
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 11px;
  color: #8a8a92;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vsl-if-status-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #3e3e45;
  border-radius: 4px;
  background: #2f2f34;
  color: #e6e6ea;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.vsl-if-status-btn:hover { background: #3a3a40; }

/* ── overlay ── */
.vsl-if-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(14,14,16,0.94);
  backdrop-filter: blur(6px);
  display: flex;
  flex-direction: column;
  color: #d8d8dc;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.vsl-if-overlay button { font-family: inherit; }
.vsl-if-header {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid #2c2c31;
  background: #18181b;
}
.vsl-if-titlebox { display: flex; flex-direction: column; gap: 1px; min-width: 150px; }
.vsl-if-title { font-size: 15px; font-weight: 600; color: #ececf0; }
.vsl-if-count { font-size: 12px; color: #9a9aa2; }
.vsl-if-spacer { flex: 1; }
.vsl-if-divider { width: 1px; height: 28px; background: #2c2c31; }
.vsl-if-group { display: flex; gap: 4px; }
.vsl-if-group:last-child { gap: 6px; }
.vsl-if-sizes { display: flex; border: 1px solid #34343a; border-radius: 4px; overflow: hidden; }
.vsl-if-size {
  height: 30px;
  min-width: 32px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: #8a8a92;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.vsl-if-size.vsl-if-active { background: #2f2f34; color: #ececf0; }
.vsl-if-btn {
  height: 30px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid #34343a;
  border-radius: 4px;
  background: transparent;
  color: #c8c8ce;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.vsl-if-btn:hover { background: #26262a; }
.vsl-if-btn.vsl-if-icon { width: 30px; padding: 0; justify-content: center; }
.vsl-if-btn.vsl-if-lg { height: 32px; padding: 0 12px; font-size: 13px; }
.vsl-if-send {
  height: 32px;
  min-width: 96px;
  padding: 0 16px;
  border: 0;
  border-radius: 4px;
  background: #4f8fd6;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.vsl-if-send:hover { background: #5f9de2; }
.vsl-if-timer { display: flex; align-items: center; gap: 10px; }
.vsl-if-timer-info { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
.vsl-if-timer-text {
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 13px;
  color: #9a9aa2;
}
.vsl-if-timer-track { width: 96px; height: 3px; background: #2c2c31; border-radius: 2px; overflow: hidden; }
.vsl-if-timer-bar { height: 100%; background: #9a9aa2; transition: width 1s linear; }
.vsl-if-timer-text.vsl-if-low { color: #e3b341; }
.vsl-if-timer-bar.vsl-if-low { background: #e3b341; }

/* ── grid ── */
.vsl-if-grid-wrap { flex: 1; min-height: 0; overflow: auto; padding: 20px; box-sizing: border-box; }
.vsl-if-grid { display: grid; gap: ${GAP}px; }
.vsl-if-tile {
  position: relative;
  aspect-ratio: var(--vsl-if-aspect);
  background: #1c1c1f;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
}
.vsl-if-fit .vsl-if-tile { aspect-ratio: auto; height: 100%; }
.vsl-if-tile img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  transition: opacity 120ms;
}
.vsl-if-has-selection .vsl-if-tile:not(.vsl-if-selected) img { opacity: 0.6; }
.vsl-if-tile.vsl-if-selected { outline: 3px solid #4f8fd6; outline-offset: -3px; }
.vsl-if-check {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 24px;
  height: 24px;
  box-sizing: border-box;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20,20,22,0.55);
  border: 2px solid rgba(255,255,255,0.85);
  color: #fff;
  font: 600 11px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  opacity: 0;
  transition: opacity 120ms;
}
.vsl-if-selected .vsl-if-check { background: #4f8fd6; border-color: #4f8fd6; }
.vsl-if-tile:hover .vsl-if-check,
.vsl-if-selected .vsl-if-check { opacity: 1; }
.vsl-if-zoom {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 4px;
  background: rgba(20,20,22,0.82);
  color: #ececf0;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms;
}
.vsl-if-zoom:hover { background: rgba(60,60,66,0.95); }
.vsl-if-tile:hover .vsl-if-zoom { opacity: 1; }

/* ── large view ── */
.vsl-if-preview { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 16px 20px 20px; }
.vsl-if-pv-bar { display: flex; align-items: center; gap: 10px; }
.vsl-if-pv-position {
  flex: 1;
  text-align: center;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 12px;
  color: #9a9aa2;
}
.vsl-if-pv-toggle {
  height: 30px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid #34343a;
  border-radius: 4px;
  background: transparent;
  color: #ececf0;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.vsl-if-pv-dot {
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 2px solid #9a9aa2;
  background: transparent;
}
.vsl-if-pv-toggle.vsl-if-selected { border-color: #4f8fd6; background: #2a4566; }
.vsl-if-pv-toggle.vsl-if-selected .vsl-if-pv-dot { border-color: #fff; background: #4f8fd6; }
.vsl-if-pv-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  background: #141416;
  border-radius: 6px;
  overflow: hidden;
}
.vsl-if-pv-stage.vsl-if-selected { outline: 3px solid #4f8fd6; outline-offset: -3px; }
.vsl-if-pv-stage img { display: block; width: 100%; height: 100%; object-fit: contain; user-select: none; }
.vsl-if-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  background: rgba(20,20,22,0.7);
  color: #ececf0;
  cursor: pointer;
}
.vsl-if-nav:hover { background: rgba(60,60,66,0.95); }
.vsl-if-prev { left: 12px; }
.vsl-if-next { right: 12px; }

/* ── footer ── */
.vsl-if-footer {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 18px;
  padding: 8px 20px;
  border-top: 1px solid #2c2c31;
  font-size: 11px;
  color: #7a7a82;
}

/* ── waiting pill ── */
.vsl-if-pill {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 6px 6px 14px;
  background: #232326;
  border: 1px solid #3a3a40;
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  white-space: nowrap;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.vsl-if-pill-dot { width: 8px; height: 8px; border-radius: 50%; background: #e3b341; }
.vsl-if-pill-title { font-size: 12px; color: #e6e6ea; font-weight: 500; }
.vsl-if-pill-sub {
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 11px;
  color: #9a9aa2;
}
.vsl-if-pill-open {
  height: 26px;
  padding: 0 12px;
  border: 0;
  border-radius: 13px;
  background: #4f8fd6;
  color: #fff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.vsl-if-pill-open:hover { background: #5f9de2; }
`;
