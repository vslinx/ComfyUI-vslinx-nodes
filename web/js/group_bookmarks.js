import { app } from "/scripts/app.js";

// ── Data model ────────────────────────────────────────────────────────────────
//
//  node.properties.bookmarks = Array<Item>   (flat, ordered)
//
//  Item =
//    | { type: "group",   title: string }
//    | { type: "node",    nodeId: string|number, name: string, parent: string }
//    | { type: "section", label: string }
//
//  Sections are flat dividers: every item after a section (until the next
//  section) visually belongs to it and is hidden when the section is collapsed.
//  Items before the first section are always shown (top level).
//
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = "#2f6fd0";
const NODE_COLOR = "#d0a85c";
const GROUP_COLOR = "#93b4dd";

// ── graph helpers ───────────────────────────────────────────────────────────────

function getGroups() {
  return app.graph?._groups || [];
}

function getAllNodes() {
  return app.graph?._nodes || [];
}

function getBookmarkNodes() {
  return getAllNodes().filter(n => n.type === "vsLinx_GroupBookmarks");
}

function nodeTitle(n) {
  return (n.title && String(n.title).trim()) || n.type || ("Node #" + n.id);
}

function groupColor(g) {
  return (g && typeof g.color === "string" && g.color) || GROUP_COLOR;
}

// Nodes whose centre falls inside a group's bounding box (matches ComfyUI's own
// group-membership rule). Falls back to a manual centre-in-bounds test on older
// frontends that lack recomputeInsideNodes().
function groupMembers(g) {
  try {
    if (typeof g.recomputeInsideNodes === "function") {
      g.recomputeInsideNodes();
      if (Array.isArray(g._nodes)) return g._nodes;
    }
  } catch (e) { /* fall through to manual computation */ }

  const b = g._bounding || [g.pos?.[0] ?? 0, g.pos?.[1] ?? 0, g.size?.[0] ?? 0, g.size?.[1] ?? 0];
  return getAllNodes().filter(n => {
    const px = n.pos?.[0] ?? 0, py = n.pos?.[1] ?? 0;
    const sw = n.size?.[0] ?? 0, sh = n.size?.[1] ?? 0;
    const cx = px + sw / 2, cy = py + sh / 2;
    return cx >= b[0] && cx <= b[0] + b[2] && cy >= b[1] && cy <= b[1] + b[3];
  });
}

// Build { members: Map<groupIndex, node[]>, ungrouped: node[] } once per modal open.
function computeGraphSnapshot() {
  const groups = getGroups();
  const members = new Map();
  const inGroup = new Set();
  groups.forEach((g, i) => {
    const list = groupMembers(g).filter(n => n.type !== "vsLinx_GroupBookmarks");
    members.set(i, list);
    for (const n of list) inGroup.add(n.id);
  });
  const ungrouped = getAllNodes().filter(
    n => n.type !== "vsLinx_GroupBookmarks" && !inGroup.has(n.id)
  );
  return { groups, members, ungrouped };
}

// ── migration (legacy nested → flat) ────────────────────────────────────────────

function migrateBookmarks(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];

  for (const it of raw) {
    if (!it) continue;

    // very old: bare string
    if (typeof it === "string") { out.push({ type: "group", title: it }); continue; }

    // section / headline (legacy nested had a children array)
    if (it.type === "section" || it.type === "headline") {
      out.push({ type: "section", label: it.label ?? it.name ?? "" });
      if (Array.isArray(it.children)) {
        for (const c of it.children) {
          if (typeof c === "string") out.push({ type: "group", title: c });
          else if (c?.type === "node") out.push({ type: "node", nodeId: c.nodeId, name: c.name ?? "", parent: c.parent ?? "" });
          else if (c?.type === "group" || c?.title != null) out.push({ type: "group", title: c.title ?? "" });
        }
      }
      continue;
    }

    if (it.type === "node") { out.push({ type: "node", nodeId: it.nodeId, name: it.name ?? "", parent: it.parent ?? "" }); continue; }
    if (it.type === "group" || it.title != null) { out.push({ type: "group", title: it.title ?? "" }); continue; }
  }
  return out;
}

// Flat, de-duplicated list across all bookmark nodes (used by the side panel).
function collectFlatItems() {
  const seenG = new Set();
  const seenN = new Set();
  const result = [];
  for (const node of getBookmarkNodes()) {
    for (const item of migrateBookmarks(node.properties?.bookmarks)) {
      if (item.type === "section") {
        result.push({ type: "section", label: item.label });
      } else if (item.type === "node") {
        const key = String(item.nodeId);
        if (item.nodeId == null || seenN.has(key)) continue;
        seenN.add(key);
        result.push({ type: "node", nodeId: item.nodeId, name: item.name, parent: item.parent });
      } else {
        if (seenG.has(item.title)) continue;
        seenG.add(item.title);
        result.push({ type: "group", title: item.title });
      }
    }
  }
  return result;
}

// ── canvas navigation ────────────────────────────────────────────────────────

function fitViewToGroup(group) {
  const canvas = app.canvas;
  canvas.centerOnNode(group);
  const zoomX = canvas.canvas.width / group._size[0] - 0.02;
  const zoomY = canvas.canvas.height / group._size[1] - 0.02;
  canvas.setZoom(Math.min(canvas.ds?.scale || 1, zoomX, zoomY), [
    canvas.canvas.width / 2,
    canvas.canvas.height / 2,
  ]);
  canvas.setDirty(true, true);
}

function fitViewToNode(node) {
  const canvas = app.canvas;
  canvas.centerOnNode(node);
  const cur = canvas.ds?.scale || 1;
  const target = cur < 0.6 ? 0.8 : cur;
  canvas.setZoom(target, [canvas.canvas.width / 2, canvas.canvas.height / 2]);
  try { canvas.selectNode(node); } catch (e) { /* selection is best-effort */ }
  canvas.setDirty(true, true);
}

// ── modal ─────────────────────────────────────────────────────────────────────

function openBookmarkModal(node) {
  document.querySelector(".vsl-bm-overlay")?.remove();

  const snapshot = computeGraphSnapshot();

  const overlay = document.createElement("div");
  overlay.className = "vsl-bm-overlay";
  overlay.innerHTML = `
    <div class="vsl-bm-modal">
      <div class="vsl-bm-header">
        <span class="vsl-bm-title">Manage Bookmarks</span>
        <button class="vsl-bm-close" title="Close">×</button>
      </div>
      <div class="vsl-bm-body">
        <div class="vsl-bm-col vsl-bm-col--left">
          <div class="vsl-bm-col-head">Groups &amp; Nodes</div>
          <div class="vsl-bm-search-wrap">
            <span class="vsl-bm-search-ico">⌕</span>
            <input class="vsl-bm-search" type="text" placeholder="Search groups and nodes…" spellcheck="false" />
            <span class="vsl-bm-search-clear" title="Clear">×</span>
          </div>
          <div class="vsl-bm-tree" id="vsl-bm-tree"></div>
        </div>
        <div class="vsl-bm-col vsl-bm-col--right">
          <div class="vsl-bm-col-head vsl-bm-col-head--right">
            <span>Active Bookmarks</span>
            <span class="vsl-bm-count"></span>
          </div>
          <div class="vsl-bm-active" id="vsl-bm-active"></div>
        </div>
      </div>
      <div class="vsl-bm-footer">
        <button class="vsl-bm-btn-add-section">+ Add Section</button>
        <button class="vsl-bm-btn-confirm">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const treeEl     = overlay.querySelector("#vsl-bm-tree");
  const activeList = overlay.querySelector("#vsl-bm-active");
  const searchEl   = overlay.querySelector(".vsl-bm-search");
  const clearEl    = overlay.querySelector(".vsl-bm-search-clear");
  const countEl    = overlay.querySelector(".vsl-bm-count");

  // Working copy — mutated in place, saved on Confirm
  let items = migrateBookmarks(node.properties?.bookmarks || []);
  const expanded = new Set();   // group indices expanded in the left tree
  let query = "";

  // ── membership / "already added" checks ────────────────────────────────────

  function groupAdded(title) {
    return items.some(b => b.type === "group" && b.title === title);
  }
  function nodeAdded(nodeId) {
    return items.some(b => b.type === "node" && String(b.nodeId) === String(nodeId));
  }
  function addGroup(title) {
    if (!title || groupAdded(title)) return;
    items.push({ type: "group", title });
    renderTree(); renderActive();
  }
  function addNodeBookmark(n, parent) {
    if (nodeAdded(n.id)) return;
    items.push({ type: "node", nodeId: n.id, name: nodeTitle(n), parent: parent || "" });
    renderTree(); renderActive();
  }

  // ── left tree ──────────────────────────────────────────────────────────────

  function makeTreeRow({ pad, chevron, onChevron, dot, label, labelColor, labelBold, count, added, showAdd, onAdd, tip }) {
    const row = document.createElement("div");
    row.className = "vsl-bm-tree-row";
    row.style.paddingLeft = pad;
    if (tip) row.title = tip;

    if (chevron !== null) {
      const c = document.createElement("span");
      c.className = "vsl-bm-tree-chevron";
      c.textContent = chevron;
      c.addEventListener("click", e => { e.stopPropagation(); onChevron?.(); });
      row.appendChild(c);
    } else if (dot) {
      const d = document.createElement("span");
      d.className = "vsl-bm-tree-dot";
      d.textContent = "◦";
      row.appendChild(d);
    }

    const lbl = document.createElement("span");
    lbl.className = "vsl-bm-tree-label";
    lbl.textContent = label;
    lbl.style.color = labelColor;
    if (labelBold) lbl.style.fontWeight = "600";
    if (added) lbl.style.opacity = "0.5";
    if (onAdd) { lbl.style.cursor = "pointer"; lbl.addEventListener("click", onAdd); }
    row.appendChild(lbl);

    if (count != null) {
      const cnt = document.createElement("span");
      cnt.className = "vsl-bm-tree-count";
      cnt.textContent = String(count);
      row.appendChild(cnt);
    }

    const spacer = document.createElement("span");
    spacer.style.flex = "1";
    row.appendChild(spacer);

    if (added) {
      const chk = document.createElement("span");
      chk.className = "vsl-bm-tree-check";
      chk.textContent = "✓";
      chk.title = "Already bookmarked";
      row.appendChild(chk);
    } else if (showAdd) {
      const plus = document.createElement("span");
      plus.className = "vsl-bm-tree-add";
      plus.textContent = "+";
      plus.addEventListener("click", e => { e.stopPropagation(); onAdd?.(); });
      row.appendChild(plus);
    }

    treeEl.appendChild(row);
  }

  function renderTree() {
    treeEl.innerHTML = "";
    const q = query.trim().toLowerCase();
    let anyRow = false;

    const renderGroup = (g, gi, members, loose) => {
      const gName = loose ? "Ungrouped nodes" : (g.title || "(untitled)");
      const gMatch = !q || gName.toLowerCase().includes(q);
      const matched = members.filter(n => nodeTitle(n).toLowerCase().includes(q));
      if (q && !gMatch && matched.length === 0) return;

      anyRow = true;
      const isExpanded = q ? true : expanded.has(gi);
      const gAdded = !loose && groupAdded(gName);

      makeTreeRow({
        pad: "4px",
        chevron: members.length ? (isExpanded ? "▾" : "▸") : "·",
        onChevron: () => { expanded.has(gi) ? expanded.delete(gi) : expanded.add(gi); renderTree(); },
        label: gName,
        labelColor: loose ? "#8b95a5" : groupColor(g),
        labelBold: true,
        count: loose ? null : members.length,
        added: gAdded,
        showAdd: !loose && !gAdded,
        onAdd: loose ? null : () => addGroup(gName),
        tip: loose ? "Ungrouped nodes — bookmark them individually"
                   : (gAdded ? "Group already bookmarked" : "Click to bookmark the whole group"),
      });

      if (isExpanded) {
        const list = (q && !gMatch) ? matched : members;
        for (const n of list) {
          const nAdded = nodeAdded(n.id);
          makeTreeRow({
            pad: "26px",
            chevron: null,
            dot: true,
            label: nodeTitle(n),
            labelColor: "#c2c9d4",
            labelBold: false,
            count: null,
            added: nAdded,
            showAdd: !nAdded,
            onAdd: () => addNodeBookmark(n, loose ? "" : gName),
            tip: nAdded ? "Node already bookmarked" : "Click to bookmark just this node",
          });
        }
      }
    };

    snapshot.groups.forEach((g, gi) => renderGroup(g, gi, snapshot.members.get(gi) || [], false));
    if (snapshot.ungrouped.length) renderGroup(null, "__ungrouped", snapshot.ungrouped, true);

    if (!anyRow) {
      const e = document.createElement("div");
      e.className = "vsl-bm-empty";
      e.textContent = q
        ? `No groups or nodes match “${query}”.`
        : "No groups or nodes in this workflow.";
      treeEl.appendChild(e);
    }
  }

  // ── drag-to-reorder (flat) ─────────────────────────────────────────────────

  const drag = { active: false, fromIdx: -1, ghostEl: null, indicatorEl: null, before: -1 };

  function liveRows() {
    return [...activeList.querySelectorAll("[data-idx]")]
      .filter(r => !r.classList.contains("vsl-bm-row--dragging"));
  }

  // Returns the original index to insert *before*, or items.length for the end.
  function computeBefore(mouseY) {
    for (const r of liveRows()) {
      const rect = r.getBoundingClientRect();
      if (mouseY < rect.top + rect.height / 2) return parseInt(r.dataset.idx);
    }
    return items.length;
  }

  function applyIndicator(before) {
    const ind = drag.indicatorEl;
    if (!ind) return;
    const rows = liveRows();
    if (before >= items.length || !rows.length) {
      activeList.appendChild(ind);
    } else {
      const ref = activeList.querySelector(`[data-idx="${before}"]`);
      ref ? activeList.insertBefore(ind, ref) : activeList.appendChild(ind);
    }
    ind.style.display = "";
  }

  function performMove(fromIdx, before) {
    const [it] = items.splice(fromIdx, 1);
    let target = before > fromIdx ? before - 1 : before;
    target = Math.max(0, Math.min(target, items.length));
    items.splice(target, 0, it);
  }

  function startDrag(e, rowEl, idx) {
    e.preventDefault();
    drag.active = true;
    drag.fromIdx = idx;
    drag.before = -1;

    const ghost = rowEl.cloneNode(true);
    ghost.className = "vsl-bm-drag-ghost";
    ghost.style.width = rowEl.offsetWidth + "px";
    document.body.appendChild(ghost);
    drag.ghostEl = ghost;

    drag.indicatorEl = document.createElement("div");
    drag.indicatorEl.className = "vsl-bm-drop-indicator";
    drag.indicatorEl.style.display = "none";
    activeList.appendChild(drag.indicatorEl);

    const rect = rowEl.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    ghost.style.left = (e.clientX - offX) + "px";
    ghost.style.top  = (e.clientY - offY) + "px";
    rowEl.classList.add("vsl-bm-row--dragging");

    const onMove = ev => {
      ghost.style.left = (ev.clientX - offX) + "px";
      ghost.style.top  = (ev.clientY - offY) + "px";
      drag.before = computeBefore(ev.clientY);
      applyIndicator(drag.before);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      ghost.remove();
      drag.indicatorEl?.remove();
      rowEl.classList.remove("vsl-bm-row--dragging");
      if (drag.before >= 0) performMove(drag.fromIdx, drag.before);
      drag.active = false;
      drag.ghostEl = null;
      drag.indicatorEl = null;
      renderTree(); renderActive();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── right column ────────────────────────────────────────────────────────────

  function makeHandle(rowEl, idx) {
    const h = document.createElement("span");
    h.className = "vsl-bm-drag-handle";
    h.textContent = "⠿";
    h.title = "Drag to reorder";
    h.addEventListener("mousedown", e => startDrag(e, rowEl, idx));
    return h;
  }

  function makeRemoveBtn(cb) {
    const b = document.createElement("button");
    b.className = "vsl-bm-item-remove";
    b.textContent = "×";
    b.title = "Remove";
    b.addEventListener("click", e => { e.stopPropagation(); cb(); });
    return b;
  }

  function renderSectionRow(item, idx) {
    const el = document.createElement("div");
    el.className = "vsl-bm-sec";
    el.dataset.idx = idx;

    const handle = makeHandle(el, idx);

    const label = document.createElement("span");
    label.className = "vsl-bm-sec-label";
    label.contentEditable = "true";
    label.spellcheck = false;
    label.textContent = item.label || "";
    label.title = "Click to rename section";
    label.addEventListener("input", () => { item.label = label.textContent; });
    label.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); label.blur(); } });
    label.addEventListener("mousedown", e => e.stopPropagation());

    const line = document.createElement("span");
    line.className = "vsl-bm-sec-line";

    el.append(handle, label, line, makeRemoveBtn(() => { items.splice(idx, 1); renderTree(); renderActive(); }));
    activeList.appendChild(el);
  }

  function renderItemRow(item, idx) {
    const isGroup = item.type === "group";
    const el = document.createElement("div");
    el.className = "vsl-bm-card";
    el.dataset.idx = idx;

    const handle = makeHandle(el, idx);

    const tag = document.createElement("span");
    tag.className = "vsl-bm-tag " + (isGroup ? "vsl-bm-tag--group" : "vsl-bm-tag--node");
    tag.textContent = isGroup ? "GROUP" : "NODE";

    const body = document.createElement("div");
    body.className = "vsl-bm-card-body";

    const name = document.createElement("div");
    name.className = "vsl-bm-card-name";
    name.textContent = isGroup ? (item.title || "(untitled)") : (item.name || "(untitled)");
    body.appendChild(name);

    if (!isGroup && item.parent) {
      const parent = document.createElement("div");
      parent.className = "vsl-bm-card-parent";
      parent.textContent = "in " + item.parent;
      body.appendChild(parent);
    }

    el.append(handle, tag, body, makeRemoveBtn(() => { items.splice(idx, 1); renderTree(); renderActive(); }));
    activeList.appendChild(el);
  }

  function renderActive() {
    activeList.innerHTML = "";
    const itemCount = items.filter(b => b.type !== "section").length;
    countEl.textContent = itemCount ? (itemCount + (itemCount === 1 ? " item" : " items")) : "";

    if (!items.length) {
      const e = document.createElement("div");
      e.className = "vsl-bm-empty vsl-bm-empty--active";
      e.innerHTML = `No bookmarks yet.<br/>Click a <b style="color:${GROUP_COLOR}">group</b> or expand it to bookmark a single <b style="color:${NODE_COLOR}">node</b>.`;
      activeList.appendChild(e);
      return;
    }

    items.forEach((item, idx) => {
      if (item.type === "section") renderSectionRow(item, idx);
      else renderItemRow(item, idx);
    });
  }

  // ── wire up ──────────────────────────────────────────────────────────────────

  function syncClear() { clearEl.style.display = query ? "" : "none"; }

  searchEl.addEventListener("input", () => { query = searchEl.value; syncClear(); renderTree(); });
  clearEl.addEventListener("click", () => { query = ""; searchEl.value = ""; syncClear(); renderTree(); searchEl.focus(); });
  syncClear();

  overlay.querySelector(".vsl-bm-btn-add-section").addEventListener("click", () => {
    items.push({ type: "section", label: "New Section" });
    renderActive();
    const labels = activeList.querySelectorAll(".vsl-bm-sec-label");
    const last = labels[labels.length - 1];
    if (last) {
      last.focus();
      const range = document.createRange();
      range.selectNodeContents(last);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  overlay.querySelector(".vsl-bm-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector(".vsl-bm-btn-confirm").addEventListener("click", () => {
    node.properties = node.properties || {};
    node.properties.bookmarks = JSON.parse(JSON.stringify(items));
    bookmarkPanel?.update();
    overlay.remove();
  });

  renderTree();
  renderActive();
  searchEl.focus();
}

// ── side panel ────────────────────────────────────────────────────────────────

class BookmarkPanel {
  constructor() {
    this._visible   = true;
    this._el        = null;
    this._list      = null;
    this._icon      = null;
    this._collapsed = new Set();
    this._injectStyles();
    this._build();
  }

  _build() {
    const panel = document.createElement("div");
    panel.id = "vsl-bm-panel";
    panel.innerHTML = `
      <div class="vsl-bm-panel-toggle" title="Toggle bookmarks panel">
        <span class="vsl-bm-toggle-icon">&#x276F;</span>
      </div>
      <div class="vsl-bm-panel-inner">
        <div class="vsl-bm-panel-header">Bookmarks</div>
        <div class="vsl-bm-panel-list"></div>
        <div class="vsl-bm-panel-legend">
          <span class="vsl-bm-legend-item"><span class="vsl-bm-glyph vsl-bm-glyph--group"></span>Group</span>
          <span class="vsl-bm-legend-item"><span class="vsl-bm-glyph vsl-bm-glyph--node"></span>Node</span>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    this._el   = panel;
    this._list = panel.querySelector(".vsl-bm-panel-list");
    this._icon = panel.querySelector(".vsl-bm-toggle-icon");
    panel.querySelector(".vsl-bm-panel-toggle").addEventListener("click", () => this._toggle());
    panel.style.display = "none";
  }

  _toggle() {
    this._visible = !this._visible;
    this._el.querySelector(".vsl-bm-panel-inner").style.display = this._visible ? "" : "none";
    this._icon.innerHTML = this._visible ? "&#x276F;" : "&#x276E;";
    this._saveCollapsed();
  }

  loadCollapsed(node) {
    const src = node || getBookmarkNodes()[0];
    if (!src) return;
    const saved = src.properties?.collapsedSections;
    if (Array.isArray(saved)) this._collapsed = new Set(saved);
    if (typeof src.properties?.panelVisible === "boolean") {
      this._visible = src.properties.panelVisible;
      this._el.querySelector(".vsl-bm-panel-inner").style.display = this._visible ? "" : "none";
      this._icon.innerHTML = this._visible ? "&#x276F;" : "&#x276E;";
    }
  }

  _saveCollapsed() {
    for (const node of getBookmarkNodes()) {
      node.properties = node.properties || {};
      node.properties.collapsedSections = [...this._collapsed];
      node.properties.panelVisible = this._visible;
    }
  }

  update() {
    const flatItems = collectFlatItems();
    const hasNodes  = getBookmarkNodes().length > 0;
    const hasItems  = flatItems.some(i => i.type !== "section");

    if (!hasNodes || !hasItems) { this._el.style.display = "none"; return; }
    this._el.style.display = "";
    this._list.innerHTML = "";

    const groups = getGroups();
    let inSection = false;         // are we currently under a section?
    let sectionCollapsed = false;

    flatItems.forEach(item => {
      if (item.type === "section") {
        const key = item.label || "";
        inSection = true;
        sectionCollapsed = this._collapsed.has(key);

        const el = document.createElement("div");
        el.className = "vsl-bm-panel-headline" + (sectionCollapsed ? " vsl-bm-panel-headline--collapsed" : "");

        const chevron = document.createElement("span");
        chevron.className = "vsl-bm-panel-headline-chevron";
        chevron.textContent = sectionCollapsed ? "▸" : "▾";

        const lbl = document.createElement("span");
        lbl.className = "vsl-bm-panel-headline-label";
        lbl.textContent = key;

        el.append(chevron, lbl);
        el.title = sectionCollapsed ? "Click to expand" : "Click to collapse";
        el.addEventListener("click", () => {
          this._collapsed.has(key) ? this._collapsed.delete(key) : this._collapsed.add(key);
          this._saveCollapsed();
          this.update();
        });
        this._list.appendChild(el);
        return;
      }

      // group / node item
      if (inSection && sectionCollapsed) return;   // hidden under a collapsed section

      const isNode = item.type === "node";
      let target, missing, label;
      if (isNode) {
        target = app.graph?.getNodeById?.(item.nodeId);
        missing = !target;
        label = target ? nodeTitle(target) : (item.name || "(untitled)");
      } else {
        target = groups.find(g => g.title === item.title);
        missing = !target;
        label = item.title || "(untitled)";
      }

      const el = document.createElement("div");
      el.className = "vsl-bm-panel-item" + (missing ? " vsl-bm-panel-item--missing" : "");

      const glyphWrap = document.createElement("span");
      glyphWrap.className = "vsl-bm-glyph-wrap";
      const glyph = document.createElement("span");
      glyph.className = "vsl-bm-glyph " + (isNode ? "vsl-bm-glyph--node" : "vsl-bm-glyph--group");
      glyphWrap.appendChild(glyph);

      const lbl = document.createElement("span");
      lbl.className = "vsl-bm-panel-item-label";
      lbl.textContent = label;

      el.append(glyphWrap, lbl);
      el.title = missing
        ? `"${label}" not found`
        : (isNode ? `Jump to node: ${label}` : `Jump to group: ${label}`);
      if (!missing) {
        el.addEventListener("click", () => isNode ? fitViewToNode(target) : fitViewToGroup(target));
      }
      this._list.appendChild(el);
    });
  }

  _injectStyles() {
    if (document.getElementById("vsl-bm-styles")) return;
    const s = document.createElement("style");
    s.id = "vsl-bm-styles";
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

// ── styles ────────────────────────────────────────────────────────────────────

const CSS = `
/* ── Side Panel ──────────────────────────────────────────────── */
#vsl-bm-panel {
  position: fixed;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  display: flex;
  flex-direction: row;
  align-items: stretch;
  z-index: 1000;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  pointer-events: all;
}
.vsl-bm-panel-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  min-height: 46px;
  background: #252d3a;
  border: 1px solid #38414f;
  border-right: none;
  border-radius: 6px 0 0 6px;
  cursor: pointer;
  color: #aeb7c4;
  font-size: 14px;
  user-select: none;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.vsl-bm-panel-toggle:hover { background: #2d3644; color: #e6ebf2; }
.vsl-bm-toggle-icon { line-height: 1; }

.vsl-bm-panel-inner {
  width: 256px;
  background: #1c2230;
  border: 1px solid #2b3444;
  border-right: none;
  border-radius: 6px 0 0 6px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 55vh;
}
.vsl-bm-panel-header {
  padding: 14px 16px 10px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #8b95a5;
  flex-shrink: 0;
}
.vsl-bm-panel-list {
  overflow-y: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: #38414f transparent;
  padding: 0 7px 12px;
}
/* Items (groups & nodes share the same layout — only the glyph differs) */
.vsl-bm-panel-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 7px 8px 7px 26px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
}
.vsl-bm-panel-item:hover { background: #262d3a; }
.vsl-bm-panel-item-label {
  color: #c9d0da;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vsl-bm-panel-item--missing { opacity: 0.4; cursor: default; font-style: italic; }
.vsl-bm-panel-item--missing:hover { background: none; }

.vsl-bm-glyph-wrap {
  width: 12px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vsl-bm-glyph--group {
  width: 11px; height: 11px;
  border-radius: 3px;
  border: 1.5px solid ${GROUP_COLOR};
}
.vsl-bm-glyph--node {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: ${NODE_COLOR};
}

/* Section headers */
.vsl-bm-panel-headline {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 8px 5px;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.1s;
  overflow: hidden;
}
.vsl-bm-panel-headline:hover { opacity: 0.85; }
.vsl-bm-panel-headline-chevron {
  color: #8b95a5;
  font-size: 14px;
  width: 12px;
  flex: none;
  text-align: center;
  line-height: 1;
}
.vsl-bm-panel-headline-label {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.1em;
  color: #8b95a5;
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vsl-bm-panel-headline--collapsed .vsl-bm-panel-headline-label { color: #6f7a8a; }

/* Legend */
.vsl-bm-panel-legend {
  padding: 9px 12px;
  border-top: 1px solid #2b3444;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}
.vsl-bm-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #7a8598;
  font-size: 11px;
}

/* ── Modal ──────────────────────────────────────────────────────── */
.vsl-bm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.vsl-bm-modal {
  width: 660px;
  max-width: 92vw;
  max-height: 82vh;
  background: #1c2230;
  border: 1px solid #333b47;
  border-radius: 10px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.55);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #d9dee6;
}
.vsl-bm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #252d3a;
  border-bottom: 1px solid #38414f;
  flex-shrink: 0;
}
.vsl-bm-title { font-size: 16px; font-weight: 600; letter-spacing: 0.2px; color: #e6ebf2; }
.vsl-bm-close {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; border-radius: 6px;
  color: #8b95a5; cursor: pointer; font-size: 18px; line-height: 1;
  transition: background 0.1s, color 0.1s;
}
.vsl-bm-close:hover { background: #333b47; color: #cdd4de; }

.vsl-bm-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1;
  min-height: 300px;
  overflow: hidden;
}
.vsl-bm-col { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.vsl-bm-col--left { border-right: 1px solid #333b47; }
.vsl-bm-col-head {
  padding: 12px 14px 10px;
  font-size: 11px; font-weight: 600; letter-spacing: 1.2px;
  color: #6f7a8a; text-transform: uppercase;
  flex-shrink: 0;
}
.vsl-bm-col-head--right {
  padding: 12px 16px 10px;
  display: flex; align-items: center; justify-content: space-between;
}
.vsl-bm-count { font-size: 11px; color: #5f6a7a; letter-spacing: 0; text-transform: none; font-weight: 400; }

/* Search */
.vsl-bm-search-wrap { position: relative; padding: 0 14px 10px; flex-shrink: 0; }
.vsl-bm-search-ico {
  position: absolute; left: 24px; top: 50%; transform: translateY(-60%);
  color: #5f6a7a; font-size: 13px; pointer-events: none;
}
.vsl-bm-search {
  width: 100%;
  background: #141922;
  border: 1px solid #333b47;
  border-radius: 7px;
  padding: 8px 30px 8px 28px;
  color: #cdd4de;
  font-size: 13px;
  outline: none;
  font-family: inherit;
}
.vsl-bm-search:focus { border-color: #3f6fb5; }
.vsl-bm-search::placeholder { color: #5f6a7a; }
.vsl-bm-search-clear {
  position: absolute; right: 23px; top: 50%; transform: translateY(-60%);
  color: #6f7a8a; font-size: 14px; cursor: pointer; line-height: 1;
}
.vsl-bm-search-clear:hover { color: #cdd4de; }

/* Left tree */
.vsl-bm-tree {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 10px;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: #38414f transparent;
}
.vsl-bm-tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 6px 6px 4px;
  border-radius: 6px;
}
.vsl-bm-tree-row:hover { background: #262d3a; }
.vsl-bm-tree-chevron {
  width: 18px; flex: none;
  display: inline-flex; justify-content: center;
  color: #9aa4b2; font-size: 13px; line-height: 1; cursor: pointer;
}
.vsl-bm-tree-chevron:hover { color: #dde3ec; }
.vsl-bm-tree-dot { width: 16px; flex: none; color: #5b6675; text-align: center; font-size: 11px; }
.vsl-bm-tree-label {
  flex: 0 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 13px;
}
.vsl-bm-tree-count { flex: none; font-size: 11px; color: #5f6a7a; }
.vsl-bm-tree-check { flex: none; font-size: 12px; color: #5bbd7b; }
.vsl-bm-tree-add {
  flex: none; width: 20px; text-align: center;
  font-size: 16px; line-height: 1; color: #5f6a7a;
  cursor: pointer; border-radius: 5px;
}
.vsl-bm-tree-add:hover { color: #8fd6a3; background: #233028; }

/* Right column */
.vsl-bm-active {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: #38414f transparent;
  position: relative;
}
.vsl-bm-empty {
  padding: 22px 14px;
  color: #6f7a8a;
  font-size: 13px;
  font-style: italic;
  line-height: 1.6;
}
.vsl-bm-empty--active { padding: 14px 6px; font-size: 13.5px; line-height: 1.7; }

.vsl-bm-card {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 7px;
  margin-bottom: 4px;
  background: rgba(32,40,52,0.6);
  border: 1px solid #2b3444;
}
.vsl-bm-card:hover { border-color: #3d4a5e; }
.vsl-bm-tag {
  flex: none;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.6px;
  padding: 3px 7px; border-radius: 4px;
}
.vsl-bm-tag--group { color: ${GROUP_COLOR}; background: rgba(147,180,221,0.14); }
.vsl-bm-tag--node  { color: ${NODE_COLOR}; background: rgba(208,168,92,0.14); }
.vsl-bm-card-body { flex: 1; min-width: 0; }
.vsl-bm-card-name {
  font-size: 13.5px; color: #dde3ec; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.vsl-bm-card-parent {
  font-size: 11px; color: #6f7a8a; margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.vsl-bm-item-remove {
  flex: none; width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; border-radius: 5px;
  color: #6f7a8a; cursor: pointer; font-size: 15px; line-height: 1;
  transition: background 0.1s, color 0.1s;
}
.vsl-bm-item-remove:hover { background: #3a2a2d; color: #e08585; }

/* Section row (right column) */
.vsl-bm-sec {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 4px 4px;
}
.vsl-bm-sec-label {
  flex: 0 1 auto;
  font-size: 10.5px; font-weight: 700; letter-spacing: 1px;
  color: #7a8598; text-transform: uppercase;
  outline: none; border-radius: 3px; padding: 1px 3px;
  cursor: text; min-width: 20px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;
}
.vsl-bm-sec-label:focus { background: rgba(63,111,181,0.2); color: #cdd9ec; white-space: normal; }
.vsl-bm-sec-line { flex: 1; height: 1px; background: #333b47; }

.vsl-bm-drag-handle {
  flex: none;
  color: #4a5568; cursor: grab;
  font-size: 14px; line-height: 1; padding: 0 2px;
}
.vsl-bm-drag-handle:active { cursor: grabbing; }

.vsl-bm-row--dragging { opacity: 0.3; }
.vsl-bm-drag-ghost {
  position: fixed;
  pointer-events: none;
  z-index: 99999;
  opacity: 0.9;
  background: #232b38;
  border: 1px solid rgba(63,111,181,0.6);
  border-radius: 7px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.5);
  display: flex; align-items: center; gap: 9px;
  padding: 8px 10px;
}
.vsl-bm-drop-indicator {
  height: 2px;
  background: ${ACCENT};
  border-radius: 1px;
  margin: 2px 4px;
  position: relative;
  pointer-events: none;
}
.vsl-bm-drop-indicator::before {
  content: "";
  position: absolute; left: -3px; top: -3px;
  width: 8px; height: 8px; border-radius: 50%;
  background: ${ACCENT};
}

/* Footer */
.vsl-bm-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-top: 1px solid #333b47;
  background: #1a2029;
  flex-shrink: 0;
}
.vsl-bm-btn-add-section {
  background: transparent;
  border: 1px solid #3d4756;
  color: #b8c0cc;
  padding: 8px 14px;
  border-radius: 7px;
  font-size: 13px; font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, border-color 0.15s;
}
.vsl-bm-btn-add-section:hover { background: #262d3a; border-color: #4a5568; }
.vsl-bm-btn-confirm {
  background: ${ACCENT};
  border: none;
  color: #fff;
  padding: 8px 22px;
  border-radius: 7px;
  font-size: 13.5px; font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: filter 0.15s;
}
.vsl-bm-btn-confirm:hover { filter: brightness(1.12); }
.vsl-bm-btn-confirm:active { filter: brightness(0.95); }
`;

// ── extension ─────────────────────────────────────────────────────────────────

let bookmarkPanel = null;

app.registerExtension({
  name: "vsLinx.GroupBookmarks",

  async setup() {
    bookmarkPanel = new BookmarkPanel();

    const origLoad = app.loadGraphData?.bind(app);
    if (typeof origLoad === "function") {
      app.loadGraphData = async function (...args) {
        const r = await origLoad(...args);
        setTimeout(() => bookmarkPanel?.update(), 150);
        return r;
      };
    }
    const origCfg = app.graph?.onConfigure;
    if (app.graph) {
      app.graph.onConfigure = function (...args) {
        const r = origCfg?.apply(this, args);
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
      if (!Array.isArray(this.properties.bookmarks)) this.properties.bookmarks = [];
      const spacer = this.addWidget("button", "_spacer_", null, () => {});
      spacer.draw = () => {};
      spacer.computeSize = () => [0, 8];
      spacer.serialize = false;
      this.addWidget("button", "Manage Bookmarks", null, () => openBookmarkModal(this));
      setTimeout(() => bookmarkPanel?.update(), 50);
      return r;
    };

    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (...args) {
      const r = origConfigure?.apply(this, args);
      const node = this;
      setTimeout(() => {
        bookmarkPanel?.loadCollapsed(node);
        bookmarkPanel?.update();
      }, 50);
      return r;
    };

    const origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function (...args) {
      const r = origRemoved?.apply(this, args);
      // onRemoved fires BEFORE the node is spliced out of graph._nodes, so
      // defer the refresh until after removal — otherwise getBookmarkNodes()
      // still counts this node and the panel wouldn't hide.
      setTimeout(() => bookmarkPanel?.update(), 50);
      return r;
    };
  },
});
