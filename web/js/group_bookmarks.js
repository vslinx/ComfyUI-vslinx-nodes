import { app } from "/scripts/app.js";

// ── Data model ────────────────────────────────────────────────────────────────
//
//  node.properties.bookmarks = Array<RootItem>
//
//  RootItem  = GroupItem | SectionItem
//  GroupItem = { type: "group",   title: string }
//  SectionItem = { type: "section", label: string, children: GroupItem[] }
//
// ─────────────────────────────────────────────────────────────────────────────

// ── helpers ───────────────────────────────────────────────────────────────────

function getGroups() {
  return app.graph?._groups || [];
}

function getBookmarkNodes() {
  return (app.graph?._nodes || []).filter(n => n.type === "vsLinx_GroupBookmarks");
}

// Migrate any legacy format (flat strings / old headline objects) to the new
// nested structure. Called once when the modal opens and on onConfigure.
function migrateBookmarks(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];

  for (const it of raw) {
    if (!it) continue;

    // ── new format already ──────────────────────────────────────────────────
    if (it.type === "section" && Array.isArray(it.children)) {
      out.push({
        type: "section",
        label: it.label ?? "",
        children: it.children
          .filter(c => c?.type === "group" || typeof c === "string")
          .map(c => typeof c === "string" ? { type: "group", title: c } : { type: "group", title: c.title ?? "" }),
      });
      continue;
    }

    // ── old flat headline / section (no children array) ─────────────────────
    if (it.type === "headline" || it.type === "section") {
      out.push({ type: "section", label: it.label ?? "", children: [] });
      continue;
    }

    // ── old group item (may have been "in section" by position) ─────────────
    if (it.type === "group") {
      out.push({ type: "group", title: it.title ?? "" });
      continue;
    }

    // ── bare string (very old format) ────────────────────────────────────────
    if (typeof it === "string") {
      out.push({ type: "group", title: it });
    }
  }
  return out;
}

// Flat representation used by the side panel (sections expand to their children)
function collectFlatItems() {
  const seenGroups = new Set();
  const result = [];
  for (const node of getBookmarkNodes()) {
    for (const item of migrateBookmarks(node.properties?.bookmarks)) {
      if (item.type === "section") {
        result.push({ type: "section", label: item.label });
        for (const child of item.children) {
          if (!seenGroups.has(child.title)) {
            seenGroups.add(child.title);
            result.push({ type: "group", title: child.title, inSection: true });
          }
        }
      } else if (!seenGroups.has(item.title)) {
        seenGroups.add(item.title);
        result.push({ type: "group", title: item.title, inSection: false });
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
  canvas.setZoom(Math.min(canvas.ds?.scale || 1, zoomX, zoomY), [
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
        <button class="vsl-bm-close">✕</button>
      </div>
      <div class="vsl-bm-body">
        <div class="vsl-bm-col">
          <div class="vsl-bm-col-title">All Groups</div>
          <div class="vsl-bm-list" id="vsl-bm-all"></div>
        </div>
        <div class="vsl-bm-divider"></div>
        <div class="vsl-bm-col">
          <div class="vsl-bm-col-title">Active Bookmarks</div>
          <div class="vsl-bm-list" id="vsl-bm-active"></div>
        </div>
      </div>
      <div class="vsl-bm-footer">
        <button class="vsl-bm-btn-add-section">+ Add Section</button>
        <button class="vsl-bm-btn-confirm">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const allList    = overlay.querySelector("#vsl-bm-all");
  const activeList = overlay.querySelector("#vsl-bm-active");

  // Working copy – mutated in place, saved on Confirm
  let items = migrateBookmarks(node.properties?.bookmarks || []);

  // ── left column ────────────────────────────────────────────────────────────

  function usedTitles() {
    const s = new Set();
    for (const it of items) {
      if (it.type === "group") s.add(it.title);
      else for (const c of it.children) s.add(c.title);
    }
    return s;
  }

  function removeTitle(title) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].type === "group" && items[i].title === title) { items.splice(i, 1); return; }
      if (items[i].type === "section") {
        const ci = items[i].children.findIndex(c => c.title === title);
        if (ci !== -1) { items[i].children.splice(ci, 1); return; }
      }
    }
  }

  function renderAll() {
    allList.innerHTML = "";
    const used = usedTitles();
    const groups = getGroups();
    if (!groups.length) {
      const e = document.createElement("div");
      e.className = "vsl-bm-empty";
      e.textContent = "No groups found in this workflow.";
      allList.appendChild(e); return;
    }
    for (const g of groups) {
      const title = g.title || "";
      const active = used.has(title);
      const el = document.createElement("div");
      el.className = "vsl-bm-item" + (active ? " vsl-bm-item--selected" : "");
      el.textContent = title || "(untitled)";
      el.title = active ? "Click to remove" : "Click to add";
      el.addEventListener("click", () => {
        active ? removeTitle(title) : items.push({ type: "group", title });
        renderAll(); renderActive();
      });
      allList.appendChild(el);
    }
  }

  // ── drag state ─────────────────────────────────────────────────────────────

  const drag = {
    active: false,
    item: null,       // the data object being dragged
    isSection: false, // true if dragging a whole section
    path: null,       // { level:"root", idx } | { level:"child", sectionIdx, childIdx }
    ghostEl: null,
    indicatorEl: null,
    dropTarget: null,
  };

  // ── drop target computation ────────────────────────────────────────────────

  // Returns the rendered rows (excluding the dragging row)
  function liveRows() {
    return [...activeList.querySelectorAll("[data-row]")]
      .filter(r => !r.classList.contains("vsl-bm-row--dragging"));
  }

  // Given mouse Y, figure out exactly where to insert
  function computeTarget(mouseY) {
    const rows = liveRows();
    if (!rows.length) return { type: "root", index: 0 };

    // Find the row whose midpoint is closest to mouseY
    let best = rows[0];
    let bestDist = Infinity;
    for (const r of rows) {
      const rect = r.getBoundingClientRect();
      const mid  = rect.top + rect.height / 2;
      const d    = Math.abs(mouseY - mid);
      if (d < bestDist) { bestDist = d; best = r; }
    }

    const rect = best.getBoundingClientRect();
    const relY = Math.max(0, Math.min(1, (mouseY - rect.top) / rect.height));
    const kind = best.dataset.row;

    if (kind === "section") {
      if (drag.isSection) {
        // Sections stay at root — before/after only
        const idx = parseInt(best.dataset.idx);
        return { type: "root", index: relY < 0.5 ? idx : idx + 1 };
      }
      // Upper third → before section; rest → into section
      if (relY < 0.33) return { type: "root", index: parseInt(best.dataset.idx) };
      return { type: "into-section", sectionIdx: parseInt(best.dataset.idx) };
    }

    if (kind === "root-group") {
      const idx = parseInt(best.dataset.idx);
      return { type: "root", index: relY < 0.5 ? idx : idx + 1 };
    }

    if (kind === "child") {
      if (drag.isSection) {
        // Can't nest sections — snap to root level around this section
        const sIdx = parseInt(best.dataset.secIdx);
        return { type: "root", index: relY < 0.5 ? sIdx : sIdx + 1 };
      }
      const sIdx = parseInt(best.dataset.secIdx);
      const cIdx = parseInt(best.dataset.childIdx);
      return { type: "child", sectionIdx: sIdx, childIndex: relY < 0.5 ? cIdx : cIdx + 1 };
    }

    return { type: "root", index: items.length };
  }

  // ── visual indicator ───────────────────────────────────────────────────────

  function clearHighlights() {
    activeList.querySelectorAll(".vsl-bm-section-over").forEach(el => el.classList.remove("vsl-bm-section-over"));
  }

  function applyIndicator(target) {
    clearHighlights();
    const ind = drag.indicatorEl;

    if (!target) { ind.style.display = "none"; return; }

    if (target.type === "into-section") {
      ind.style.display = "none";
      const secEl = activeList.querySelector(`[data-row="section"][data-idx="${target.sectionIdx}"]`);
      if (secEl) {
        secEl.classList.add("vsl-bm-section-over");
        // Also highlight visible children
        activeList.querySelectorAll(`[data-row="child"][data-sec-idx="${target.sectionIdx}"]`)
          .forEach(el => el.classList.add("vsl-bm-section-over"));
      }
      return;
    }

    // Position the line indicator
    const rows = liveRows();
    let refEl = null, insertBefore = true;

    if (target.type === "root") {
      const rootRows = rows.filter(r => r.dataset.row === "root-group" || r.dataset.row === "section");
      if (target.index >= rootRows.length) {
        refEl = rootRows[rootRows.length - 1]; insertBefore = false;
      } else {
        refEl = rootRows[target.index]; insertBefore = true;
      }
    } else if (target.type === "child") {
      const childRows = rows.filter(r =>
        r.dataset.row === "child" && parseInt(r.dataset.secIdx) === target.sectionIdx);
      if (target.childIndex >= childRows.length) {
        refEl = childRows[childRows.length - 1]; insertBefore = false;
      } else {
        refEl = childRows[target.childIndex]; insertBefore = true;
      }
      // Fallback: place after section header if no children yet
      if (!refEl) {
        refEl = activeList.querySelector(`[data-row="section"][data-idx="${target.sectionIdx}"]`);
        insertBefore = false;
      }
    }

    if (refEl) {
      insertBefore ? activeList.insertBefore(ind, refEl) : refEl.after(ind);
      ind.style.display = "";
    } else if (!rows.length) {
      activeList.appendChild(ind);
      ind.style.display = "";
    } else {
      ind.style.display = "none";
    }
  }

  // ── perform the actual drop ────────────────────────────────────────────────

  function performDrop(target) {
    if (!target || !drag.item) return;

    // 1. Remove from source
    if (drag.path.level === "root") {
      items.splice(drag.path.idx, 1);
    } else {
      items[drag.path.sectionIdx].children.splice(drag.path.childIdx, 1);
    }

    // 2. Adjust target indices for the removal
    const t = { ...target };
    if (drag.path.level === "root") {
      if (t.type === "root" && t.index > drag.path.idx) t.index--;
      if (t.type === "into-section" && t.sectionIdx > drag.path.idx) t.sectionIdx--;
      if (t.type === "child" && t.sectionIdx > drag.path.idx) t.sectionIdx--;
    } else {
      // Removed from a section's children — only affects child targets in the same section
      if (t.type === "child" && t.sectionIdx === drag.path.sectionIdx
          && t.childIndex > drag.path.childIdx) {
        t.childIndex--;
      }
    }

    // 3. Insert at new position
    if (t.type === "root") {
      items.splice(Math.min(t.index, items.length), 0, drag.item);
    } else if (t.type === "child") {
      const sec = items[t.sectionIdx];
      if (sec) sec.children.splice(Math.min(t.childIndex, sec.children.length), 0, drag.item);
    } else if (t.type === "into-section") {
      const sec = items[t.sectionIdx];
      if (sec) sec.children.push(drag.item);
    }
  }

  // ── drag start ─────────────────────────────────────────────────────────────

  function startDrag(e, rowEl, item, path) {
    e.preventDefault();

    drag.active    = true;
    drag.item      = item;
    drag.isSection = item.type === "section";
    drag.path      = path;
    drag.dropTarget = null;

    // Ghost — fixed clone that follows cursor
    const ghost = rowEl.cloneNode(true);
    ghost.className = "vsl-bm-drag-ghost";
    ghost.style.width = rowEl.offsetWidth + "px";
    document.body.appendChild(ghost);
    drag.ghostEl = ghost;

    // Drop indicator line
    drag.indicatorEl = document.createElement("div");
    drag.indicatorEl.className = "vsl-bm-drop-indicator";
    drag.indicatorEl.style.display = "none";
    activeList.appendChild(drag.indicatorEl);

    // Grab offset so cursor stays in the same spot on the ghost
    const rect = rowEl.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;

    ghost.style.left = (e.clientX - offX) + "px";
    ghost.style.top  = (e.clientY - offY) + "px";

    rowEl.classList.add("vsl-bm-row--dragging");

    const onMove = ev => {
      ghost.style.left = (ev.clientX - offX) + "px";
      ghost.style.top  = (ev.clientY - offY) + "px";
      drag.dropTarget = computeTarget(ev.clientY);
      applyIndicator(drag.dropTarget);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);

      ghost.remove();
      drag.indicatorEl?.remove();
      clearHighlights();
      rowEl.classList.remove("vsl-bm-row--dragging");

      if (drag.dropTarget) performDrop(drag.dropTarget);

      drag.active = false;
      drag.ghostEl = null;
      drag.indicatorEl = null;

      renderAll();
      renderActive();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  // ── right column rendering ─────────────────────────────────────────────────

  function makeHandle() {
    const h = document.createElement("span");
    h.className = "vsl-bm-drag-handle";
    h.textContent = "⠿";
    return h;
  }

  function makeRemoveBtn(cb) {
    const b = document.createElement("button");
    b.className = "vsl-bm-item-remove";
    b.textContent = "✕";
    b.addEventListener("click", e => { e.stopPropagation(); cb(); });
    return b;
  }

  function renderGroupRow(item, rootIdx) {
    const el = document.createElement("div");
    el.className = "vsl-bm-row vsl-bm-row--group";
    el.dataset.row = "root-group";
    el.dataset.idx = rootIdx;

    const handle = makeHandle();
    handle.addEventListener("mousedown", e => startDrag(e, el, item, { level: "root", idx: rootIdx }));

    const label = document.createElement("span");
    label.className = "vsl-bm-item-label";
    label.textContent = item.title || "(untitled)";

    el.append(handle, label, makeRemoveBtn(() => {
      items.splice(rootIdx, 1); renderAll(); renderActive();
    }));
    activeList.appendChild(el);
  }

  function renderChildRow(item, sectionIdx, childIdx) {
    const el = document.createElement("div");
    el.className = "vsl-bm-row vsl-bm-row--child";
    el.dataset.row      = "child";
    el.dataset.secIdx   = sectionIdx;
    el.dataset.childIdx = childIdx;

    const handle = makeHandle();
    handle.addEventListener("mousedown", e =>
      startDrag(e, el, item, { level: "child", sectionIdx, childIdx }));

    const label = document.createElement("span");
    label.className = "vsl-bm-item-label";
    label.textContent = item.title || "(untitled)";

    el.append(handle, label, makeRemoveBtn(() => {
      items[sectionIdx].children.splice(childIdx, 1); renderAll(); renderActive();
    }));
    activeList.appendChild(el);
  }

  function renderSectionRow(item, rootIdx) {
    const el = document.createElement("div");
    el.className = "vsl-bm-row vsl-bm-row--section";
    el.dataset.row = "section";
    el.dataset.idx = rootIdx;

    const handle = makeHandle();
    handle.addEventListener("mousedown", e => startDrag(e, el, item, { level: "root", idx: rootIdx }));

    const icon = document.createElement("span");
    icon.className = "vsl-bm-section-icon";
    icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="display:block"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.764c.415 0 .813.165 1.107.46L8.742 3.8a.5.5 0 0 0 .356.147H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/></svg>`;

    const labelEl = document.createElement("span");
    labelEl.className = "vsl-bm-section-label";
    labelEl.contentEditable = "true";
    labelEl.spellcheck = false;
    labelEl.textContent = item.label || "";
    labelEl.title = "Click to rename section";
    labelEl.addEventListener("input",   () => { item.label = labelEl.textContent; });
    labelEl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); labelEl.blur(); } });
    labelEl.addEventListener("mousedown", e => e.stopPropagation());

    el.append(handle, icon, labelEl, makeRemoveBtn(() => {
      items.splice(rootIdx, 1); renderAll(); renderActive();
    }));
    activeList.appendChild(el);
  }

  function renderActive() {
    activeList.innerHTML = "";
    if (!items.length) {
      const e = document.createElement("div");
      e.className = "vsl-bm-empty";
      e.textContent = "No bookmarks yet.\nClick groups on the left to add them.";
      activeList.appendChild(e); return;
    }
    items.forEach((item, rootIdx) => {
      if (item.type === "section") {
        renderSectionRow(item, rootIdx);
        item.children.forEach((child, childIdx) => renderChildRow(child, rootIdx, childIdx));
      } else {
        renderGroupRow(item, rootIdx);
      }
    });
  }

  renderAll();
  renderActive();

  // ── footer ─────────────────────────────────────────────────────────────────

  overlay.querySelector(".vsl-bm-btn-add-section").addEventListener("click", () => {
    items.push({ type: "section", label: "New Section", children: [] });
    renderActive();
    const labels = activeList.querySelectorAll(".vsl-bm-section-label");
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
}

// ── side panel ────────────────────────────────────────────────────────────────

class BookmarkPanel {
  constructor() {
    this._visible  = true;
    this._el       = null;
    this._list     = null;
    this._icon     = null;
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

  // Load panel UI state from the first bookmark node's properties.
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

  // Persist current panel UI state to all bookmark nodes so it's saved with the workflow.
  _saveCollapsed() {
    for (const node of getBookmarkNodes()) {
      node.properties = node.properties || {};
      node.properties.collapsedSections = [...this._collapsed];
      node.properties.panelVisible = this._visible;
    }
  }

  update() {
    const flatItems  = collectFlatItems();
    const hasNodes   = getBookmarkNodes().length > 0;
    const hasGroups  = flatItems.some(i => i.type === "group");

    if (!hasNodes || !hasGroups) { this._el.style.display = "none"; return; }
    this._el.style.display = "";
    this._list.innerHTML = "";

    const graphs = getGroups();
    let sectionCollapsed = false;
    let prevWasChild = false;

    flatItems.forEach((item, idx) => {
      if (item.type === "section") {
        // Section-end separator after visible children
        if (prevWasChild) {
          const sep = document.createElement("div");
          sep.className = "vsl-bm-panel-section-end";
          this._list.appendChild(sep);
        }
        prevWasChild = false;

        const key = item.label || "";
        sectionCollapsed = this._collapsed.has(key);

        const el = document.createElement("div");
        el.className = "vsl-bm-panel-headline" + (sectionCollapsed ? " vsl-bm-panel-headline--collapsed" : "");

        const chevron = document.createElement("span");
        chevron.className = "vsl-bm-panel-headline-chevron";
        chevron.textContent = sectionCollapsed ? "▶" : "▼";

        const lbl = document.createElement("span");
        lbl.textContent = key;

        el.append(chevron, lbl);
        el.title = sectionCollapsed ? "Click to expand" : "Click to collapse";
        el.addEventListener("click", () => {
          this._collapsed.has(key) ? this._collapsed.delete(key) : this._collapsed.add(key);
          this._saveCollapsed();
          this.update();
        });
        this._list.appendChild(el);

      } else {
        // group item
        if (item.inSection && !sectionCollapsed) {
          // Section-end separator when transitioning back to root
          const next = flatItems[idx + 1];
          const nextIsRootGroup = next && next.type === "group" && !next.inSection;
          // We'll handle it at the next section/root item boundary — tracked via prevWasChild

          const group = graphs.find(g => g.title === item.title);
          const el = document.createElement("div");
          el.className = "vsl-bm-panel-item vsl-bm-panel-item--child" +
            (group ? "" : " vsl-bm-panel-item--missing");
          el.textContent = item.title || "(untitled)";
          el.title = group ? `Jump to: ${item.title}` : `"${item.title}" not found`;
          if (group) el.addEventListener("click", () => fitViewToGroup(group));
          this._list.appendChild(el);
          prevWasChild = true;

        } else if (!item.inSection) {
          // Root group — add section-end separator if previous were children
          if (prevWasChild) {
            const sep = document.createElement("div");
            sep.className = "vsl-bm-panel-section-end";
            this._list.appendChild(sep);
          }
          prevWasChild = false;

          const group = graphs.find(g => g.title === item.title);
          const el = document.createElement("div");
          el.className = "vsl-bm-panel-item" + (group ? "" : " vsl-bm-panel-item--missing");
          el.textContent = item.title || "(untitled)";
          el.title = group ? `Jump to: ${item.title}` : `"${item.title}" not found`;
          if (group) el.addEventListener("click", () => fitViewToGroup(group));
          this._list.appendChild(el);
        }
        // else: item is in a collapsed section — skip
      }
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
.vsl-bm-panel-toggle:hover { background: var(--comfy-input-bg, #2a2a2a); color: #fff; }
.vsl-bm-toggle-icon { font-size: 9px; line-height: 1; }

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
  padding: 2px 0;
}
.vsl-bm-panel-item {
  padding: 7px 10px;
  color: var(--input-text, #c0c0c0);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.1s, color 0.1s;
  font-size: 12px;
}
.vsl-bm-panel-item:hover { background: var(--comfy-input-bg, #2a2a2a); color: #fff; }
.vsl-bm-panel-item--child {
  padding-left: 18px;
  border-left: 2px solid rgba(74,158,255,0.25);
  font-size: 11px;
}
.vsl-bm-panel-item--child:hover { border-left-color: rgba(74,158,255,0.55); }
.vsl-bm-panel-item--missing { opacity: 0.38; cursor: default; font-style: italic; }
.vsl-bm-panel-item--missing:hover { background: none; color: inherit; }

.vsl-bm-panel-section-end {
  height: 0;
  border-top: 1px solid rgba(74,158,255,0.15);
  margin: 1px 8px 2px 8px;
}
.vsl-bm-panel-section-end + .vsl-bm-panel-headline { border-top: none; }

.vsl-bm-panel-headline {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 8px 4px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--input-text, #777);
  border-top: 1px solid var(--border-color, #3d3d3d);
  cursor: pointer;
  user-select: none;
  transition: color 0.1s;
  white-space: nowrap;
  overflow: hidden;
}
.vsl-bm-panel-headline:first-child { border-top: none; padding-top: 7px; }
.vsl-bm-panel-headline:hover { color: var(--input-text, #aaa); }
.vsl-bm-panel-headline--collapsed { color: var(--input-text, #555); }
.vsl-bm-panel-headline-chevron { font-size: 7px; opacity: 0.7; flex-shrink: 0; }

/* ── Modal ──────────────────────────────────────────────────────── */
.vsl-bm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
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
  box-shadow: 0 12px 40px rgba(0,0,0,0.6);
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
.vsl-bm-title { font-size: 13px; font-weight: 600; color: var(--input-text, #d0d0d0); }
.vsl-bm-close {
  background: none; border: none; color: var(--input-text, #888);
  cursor: pointer; font-size: 13px; padding: 3px 7px; border-radius: 4px;
  transition: background 0.1s, color 0.1s;
}
.vsl-bm-close:hover { background: rgba(255,255,255,0.1); color: #fff; }

.vsl-bm-body { display: flex; flex: 1; overflow: hidden; min-height: 260px; }
.vsl-bm-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.vsl-bm-col-title {
  padding: 7px 12px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 700;
  color: var(--input-text, #888);
  border-bottom: 1px solid var(--border-color, #2e2e2e);
  background: rgba(255,255,255,0.015);
  flex-shrink: 0;
}
.vsl-bm-divider { width: 1px; background: var(--border-color, #3d3d3d); flex-shrink: 0; }
.vsl-bm-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color, #444) transparent;
  position: relative;
}

/* Left column: all groups */
.vsl-bm-item {
  padding: 7px 12px;
  color: var(--input-text, #c0c0c0);
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  transition: background 0.1s;
}
.vsl-bm-item:hover { background: var(--comfy-input-bg, #2a2a2a); }
.vsl-bm-item--selected { background: rgba(74,158,255,0.12); color: #7fbfff; }
.vsl-bm-item--selected:hover { background: rgba(74,158,255,0.2); }
.vsl-bm-empty {
  padding: 20px 14px;
  color: var(--input-text, #666);
  font-size: 12px;
  font-style: italic;
  white-space: pre-line;
  line-height: 1.5;
}

/* Right column: active bookmarks */
.vsl-bm-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 4px;
  color: var(--input-text, #c0c0c0);
  font-size: 12px;
  user-select: none;
}
.vsl-bm-row--group { }
.vsl-bm-row--child {
  padding-left: 16px;
  border-left: 2px solid rgba(74,158,255,0.25);
  margin-left: 4px;
  font-size: 11px;
  background: rgba(255,255,255,0.012);
}

/* Section header row */
.vsl-bm-row--section {
  background: rgba(74,158,255,0.07);
  border-left: 3px solid rgba(74,158,255,0.5);
  border-top: 1px solid rgba(255,255,255,0.05);
  margin-top: 4px;
  padding-left: 3px;
}
.vsl-bm-row--section:first-child { border-top: none; margin-top: 0; }

/* Section highlight when drag is over it */
.vsl-bm-section-over.vsl-bm-row--section {
  background: rgba(74,158,255,0.18);
  border-left-color: rgba(74,158,255,0.9);
  outline: 1px solid rgba(74,158,255,0.4);
  outline-offset: -1px;
}
.vsl-bm-section-over.vsl-bm-row--child {
  border-left-color: rgba(74,158,255,0.7);
  background: rgba(74,158,255,0.08);
}

.vsl-bm-row--dragging { opacity: 0.3; }

.vsl-bm-drag-handle {
  color: var(--input-text, #555);
  cursor: grab;
  font-size: 15px;
  padding: 0 3px;
  flex-shrink: 0;
  line-height: 1;
}
.vsl-bm-drag-handle:active { cursor: grabbing; }
.vsl-bm-item-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vsl-bm-item-remove {
  flex-shrink: 0; background: none; border: none;
  color: var(--input-text, #555); cursor: pointer;
  font-size: 11px; padding: 2px 6px; border-radius: 3px;
  transition: background 0.1s, color 0.1s; line-height: 1;
}
.vsl-bm-item-remove:hover { background: rgba(255,80,80,0.18); color: #ff7070; }

.vsl-bm-section-icon {
  flex-shrink: 0;
  width: 12px; height: 12px;
  color: rgba(74,158,255,0.6);
  pointer-events: none; user-select: none;
  display: flex; align-items: center;
}
.vsl-bm-section-label {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: #7fbfff;
  outline: none; border-radius: 3px; padding: 1px 3px;
  cursor: text; min-width: 20px;
}
.vsl-bm-section-label:focus {
  background: rgba(74,158,255,0.15); color: #b0d8ff;
  white-space: normal; overflow: visible;
}

/* Drop indicator line */
.vsl-bm-drop-indicator {
  height: 2px;
  background: #4a9eff;
  border-radius: 1px;
  margin: 1px 4px;
  position: relative;
  pointer-events: none;
}
.vsl-bm-drop-indicator::before {
  content: "";
  position: absolute;
  left: -3px; top: -3px;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #4a9eff;
}

/* Floating drag ghost */
.vsl-bm-drag-ghost {
  position: fixed;
  pointer-events: none;
  z-index: 99999;
  opacity: 0.85;
  background: var(--comfy-input-bg, #2a2a2a);
  border: 1px solid rgba(74,158,255,0.5);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  padding: 4px 0;
}

/* Footer */
.vsl-bm-footer {
  padding: 11px 16px;
  border-top: 1px solid var(--border-color, #3d3d3d);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255,255,255,0.015);
  flex-shrink: 0;
}
.vsl-bm-btn-add-section {
  background: none; border: 1px solid var(--border-color, #444);
  color: var(--input-text, #999); border-radius: 5px;
  padding: 6px 13px; font-size: 12px; cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.vsl-bm-btn-add-section:hover { background: rgba(255,255,255,0.06); color: #d0d0d0; border-color: #666; }
.vsl-bm-btn-confirm {
  background: #4a9eff; color: #fff; border: none; border-radius: 5px;
  padding: 7px 22px; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background 0.15s;
}
.vsl-bm-btn-confirm:hover { background: #3a8ef0; }
.vsl-bm-btn-confirm:active { background: #2a7ee0; }
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
      bookmarkPanel?.update();
      return r;
    };
  },
});
