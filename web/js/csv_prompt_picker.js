import { app } from "/scripts/app.js";

import { toast } from "../services/toast.js";
import {
  ellipsizeToWidth,
  drawClippedText,
  roundRectPath,
  drawSmallX,
  drawHoverOverlay,
  drawGripDots,
  setCanvasCursor,
} from "../services/csv-picker/canvasDraw.js";

import {
  uploadPromptFile,
  readPromptFile,
  listPromptFiles,
  listPromptEntries,
  createPromptFolder,
  _vslinxInvalidateCsvCache,
} from "../services/csv-picker/csvApi.js";

import {
  showAdditionalPromptModal,
  showConflictModal,
  showFilePickerModal,
  showKeyPickerMenu,
} from "../services/csv-picker/modals.js";

const NODE_NAME = "vsLinx_MultiLangPromptPicker";

let vslinxHoverNode = null;
let vslinxDragNode = null;

function markGraphChanged(node) {
  try {
    node?.setDirtyCanvas?.(true, true);
    node?.graph?.setDirtyCanvas?.(true, true);
    node?.graph?.change?.();
    app?.graph?.change?.();
  } catch (_) {}
}

function isDragging() {
  return !!(vslinxDragNode?._vslinxDrag?.row && vslinxDragNode._vslinxDrag.row._dragging);
}

function clearHoverOnNode(node) {
  if (!node) return;
  let changed = false;

  // clear row hovers
  for (const w of (node.widgets || [])) {
    const t = w?.value?.type;
    if ((t === "CsvRowWidget" || t === "ExtraPromptWidget") && w._hover) {
      w._hover = null;
      changed = true;
    }
    if ((t === "CsvRowWidget" || t === "ExtraPromptWidget") && w._dragging) {
      w._dragging = false;
      changed = true;
    }
  }

  // clear header hover
  const header = (node.widgets || []).find(isHeaderActionsWidget) || null;
  if (header && header._hover) {
    header._hover = null;
    changed = true;
  }

  if (node._vslinxDrag) {
    node._vslinxDrag = null;
    changed = true;
  }
  if (changed) node.setDirtyCanvas(true, true);
}

async function uploadWithConflictResolution(file, subdir = "") {
  let up;
  let overwriteWasChosen = false;

  try {
    up = await uploadPromptFile(file, "auto", null, subdir);
  } catch (e) {
    if (e?.status === 409 && e?.data?.error === "NAME_CONFLICT") {
      const choice = await showConflictModal({
        filename: e.data.filename,
        suggested: e.data.suggested,
      });

      if (choice.action === "cancel") return { cancelled: true };

      if (choice.action === "overwrite") {
        overwriteWasChosen = true;
        up = await uploadPromptFile(file, "overwrite", null, subdir);
      } else if (choice.action === "rename") {
        up = await uploadPromptFile(file, "rename", choice.rename_to, subdir);
      } else {
        return { cancelled: true };
      }
    } else {
      throw e;
    }
  }

  return { cancelled: false, overwriteWasChosen, up };
}

function getRowWidgets(node) {
  return (node.widgets || []).filter((w) => {
    const t = w?.value?.type;
    return t === "CsvRowWidget" || t === "ExtraPromptWidget";
  });
}

function isRowWidget(w) {
  const t = w?.value?.type;
  return t === "CsvRowWidget" || t === "ExtraPromptWidget";
}

function hasRowForFilename(node, filename, excludeWidget = null) {
  return (node.widgets || []).some((w) => {
    if (w === excludeWidget) return false;
    if (w?.value?.type !== "CsvRowWidget") return false;
    return w?.value?.file === filename;
  });
}

function recomputeNodeSize(node) {
  try {
    const computed = node.computeSize?.();
    if (computed && node.size) {
      node.size[0] = Math.max(node.size[0], computed[0]);
      node.size[1] = Math.max(80, computed[1]);
    }
  } catch (_) {}
}

const LIST_TOP_SPACER_ID = "vslinx_list_top_spacer";
const HEADER_ACTIONS_ID = "vslinx_header_actions";
const BUTTON_SPACER_ID = "vslinx_select_csv_spacer";
const BUTTON_ID = "vslinx_select_csv_button";
const BUTTON_LABEL = "Select CSV File";

const LIST_SIDE_MARGIN = (globalThis?.LiteGraph?.NODE_WIDGET_MARGIN ?? 10);
const ROW_HEIGHT = 54;
const HEADER_HEIGHT = 40;

const DRAG_SNAP_FRACTION = 0.50;
const DRAG_SNAP_ENTER = 0.15;
const DRAG_SNAP_EXIT = 0.65;

const DRAG_HANDLE_W = 22;
const DRAG_HANDLE_GAP = 8;

function isListTopSpacer(w) { return w?._vslinx_id === LIST_TOP_SPACER_ID; }
function isHeaderActionsWidget(w) { return w?._vslinx_id === HEADER_ACTIONS_ID; }
function isButtonSpacer(w) { return w?._vslinx_id === BUTTON_SPACER_ID; }
function isBottomButton(w) { return w?._vslinx_id === BUTTON_ID; }

function updateRowOrders(node) {
  const rows = getRowWidgets(node);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]?.value && typeof rows[i].value === "object") {
      rows[i].value.order = i;
    }
  }
}

function ensureListTopSpacer(node, height = 10) {
  const existing = (node.widgets || []).find(isListTopSpacer);
  if (existing) return existing;

  const spacer = {
    type: "custom",
    name: " ",
    _vslinx_id: LIST_TOP_SPACER_ID,
    value: { type: "VslinxListTopSpacer" },
    serialize: false,
    serializeValue() { return undefined; },
    computeSize() { return [0, height]; },
    draw() {},
  };

  node.addCustomWidget(spacer);
  return spacer;
}

function ensureButtonSpacer(node, height = 10) {
  const existing = (node.widgets || []).find(isButtonSpacer);
  if (existing) return existing;

  const spacer = {
    type: "custom",
    name: " ",
    _vslinx_id: BUTTON_SPACER_ID,
    value: { type: "VslinxButtonSpacer" },
    serialize: false,
    serializeValue() { return undefined; },
    computeSize() { return [0, height]; },
    draw() {},
  };

  node.addCustomWidget(spacer);
  return spacer;
}

/** Simple Yes/No modal (kept inside this file so you don't need to change modals.js) */
function showConfirmClearModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.55)";
    overlay.style.zIndex = "999999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const card = document.createElement("div");
    card.style.width = "560px";
    card.style.maxWidth = "92vw";
    card.style.background = "#1f1f1f";
    card.style.border = "1px solid #444";
    card.style.borderRadius = "12px";
    card.style.padding = "14px";
    card.style.color = "#eee";
    card.style.fontFamily = "sans-serif";
    card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "12px";

    const title = document.createElement("div");
    title.textContent = "Confirm";
    title.style.fontSize = "16px";
    title.style.fontWeight = "700";

    const msg = document.createElement("div");
    msg.textContent = "Are you sure you want to remove all entrys from this node?";
    msg.style.fontSize = "13px";
    msg.style.opacity = "0.95";
    msg.style.lineHeight = "1.35";

    const buttons = document.createElement("div");
    buttons.style.display = "flex";
    buttons.style.gap = "8px";
    buttons.style.justifyContent = "flex-end";

    const makeBtn = (label, { bg = "#2b2b2b", border = "#555", color = "#eee" } = {}) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.padding = "8px 12px";
      b.style.borderRadius = "10px";
      b.style.border = `1px solid ${border}`;
      b.style.background = bg;
      b.style.color = color;
      b.style.cursor = "pointer";
      return b;
    };

    const noBtn = makeBtn("No");
    const yesBtn = makeBtn("Yes", { bg: "#7f1d1d", border: "#a23a3a", color: "#fff" });

    const close = (val) => {
      try { document.removeEventListener("keydown", onKeyDown, true); } catch (_) {}
      if (overlay.parentNode) document.body.removeChild(overlay);
      resolve(val);
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter" || e.key === "Return") close(true);
    };

    document.addEventListener("keydown", onKeyDown, true);

    overlay.onclick = (e) => {
      if (e.target === overlay) close(false);
    };

    noBtn.onclick = () => close(false);
    yesBtn.onclick = () => close(true);

    buttons.appendChild(noBtn);
    buttons.appendChild(yesBtn);

    card.appendChild(title);
    card.appendChild(msg);
    card.appendChild(buttons);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}

function clearAllEntries(node) {
  // remove all CsvRowWidget + ExtraPromptWidget
  node.widgets = (node.widgets || []).filter((w) => !isRowWidget(w));
  node._csvRowCounter = 0;
  node._extraPromptCounter = 0;

  layoutWidgets(node);
  recomputeNodeSize(node);
  markGraphChanged(node);

  toast("info", "Cleared", "All entries removed from this node.", 2200);
}

class HeaderActionsWidget {
  constructor(name = "vslinx_header_actions") {
    this.name = name;
    this.type = "custom";
    this.value = { type: "VslinxHeaderActions", order: -999999 };
    this._vslinx_id = HEADER_ACTIONS_ID;

    this._hover = null; // "clear" | "add" | null
    this._rowY = null;

    this._bounds = {
      clear: [0, 0, 0, 0],
      add: [0, 0, 0, 0],
    };
  }

  computeSize() { return [0, HEADER_HEIGHT]; }
  serializeValue() { return undefined; } // not serialized

  _hitPart(pos) {
    const x = pos[0];
    const y = pos[1];
    const inRect = (r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
    if (inRect(this._bounds.clear)) return "clear";
    if (inRect(this._bounds.add)) return "add";
    return null;
  }

  draw(ctx, node, _width, y) {
    this._rowY = y;

    const x = LIST_SIDE_MARGIN;
    const w = Math.max(0, (node?.size?.[0] ?? _width) - LIST_SIDE_MARGIN * 2);
    const h = HEADER_HEIGHT;

    const yy = y + 2;
    const hh = Math.max(0, h - 4);

    const clearW = Math.floor(w * 0.30);
    const addW = Math.max(0, w - clearW - 8);
    const gap = 8;

    const clearX = x;
    const addX = x + clearW + gap;

    ctx.save();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#2b2b2b";
    roundRectPath(ctx, clearX, yy, clearW, hh, 10);
    ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    roundRectPath(ctx, clearX, yy, clearW, hh, 10);
    ctx.stroke();

    if (this._hover === "clear") drawHoverOverlay(ctx, clearX, yy, clearW, hh, true);

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#1e3a8a";
    roundRectPath(ctx, addX, yy, addW, hh, 10);
    ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#2b6cb0";
    ctx.lineWidth = 1;
    roundRectPath(ctx, addX, yy, addW, hh, 10);
    ctx.stroke();

    if (this._hover === "add") drawHoverOverlay(ctx, addX, yy, addW, hh, false);

    const prevFont = ctx.font;
    const prevAlign = ctx.textAlign;
    const prevBase = ctx.textBaseline;

    ctx.font = prevFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#eee";
    ctx.fillText("Clear", clearX + clearW / 2, yy + hh / 2);

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = "#fff";
    ctx.fillText("Add empty prompt", addX + addW / 2, yy + hh / 2);

    ctx.font = prevFont;
    ctx.textAlign = prevAlign;
    ctx.textBaseline = prevBase;

    ctx.restore();

    this._bounds.clear = [clearX, yy, clearW, hh];
    this._bounds.add = [addX, yy, addW, hh];
  }

  mouse(event, pos, node) {
    const t = event?.type || "";
    const isDown = (t === "pointerdown" || t === "mousedown");
    if (!isDown) return false;
    if (event.button !== 0) return false;

    const part = this._hitPart(pos);
    if (!part) return false;

    if (part === "clear") {
      showConfirmClearModal().then((yes) => {
        if (!yes) return;
        clearAllEntries(node);
      });
      return true;
    }

    if (part === "add") {
      addAdditionalPromptRow(node, "");
      return true;
    }

    return false;
  }
}

function ensureHeaderActions(node) {
  const existing = (node.widgets || []).find(isHeaderActionsWidget);
  if (existing) return existing;

  const w = new HeaderActionsWidget();
  w.serialize = false;
  node.addCustomWidget(w);

  layoutWidgets(node);
  return w;
}

function layoutWidgets(node) {
  const widgets = node.widgets || [];
  const rows = widgets.filter(isRowWidget);

  const topSpacer = widgets.find(isListTopSpacer) || null;
  const header = widgets.find(isHeaderActionsWidget) || null;
  const btnSpacer = widgets.find(isButtonSpacer) || null;
  const btn = widgets.find(isBottomButton) || null;

  const rest = widgets.filter((w) => {
    if (isRowWidget(w)) return false;
    if (w === topSpacer) return false;
    if (w === header) return false;
    if (w === btnSpacer) return false;
    if (w === btn) return false;

    if (isListTopSpacer(w)) return false;
    if (isHeaderActionsWidget(w)) return false;
    if (isButtonSpacer(w)) return false;
    if (isBottomButton(w)) return false;
    return true;
  });

  const next = [...rest];
  if (topSpacer) next.push(topSpacer);
  if (header) next.push(header);
  next.push(...rows);
  if (btnSpacer) next.push(btnSpacer);
  if (btn) next.push(btn);

  node.widgets = next;
  updateRowOrders(node);
}

function removeAllVslinxUiWidgets(node) {
  node.widgets = (node.widgets || []).filter((w) => {
    if (isRowWidget(w)) return false;
    if (isListTopSpacer(w)) return false;
    if (isHeaderActionsWidget(w)) return false;
    if (isButtonSpacer(w)) return false;
    if (isBottomButton(w)) return false;
    if (w?._vslinx_id === LIST_TOP_SPACER_ID) return false;
    if (w?._vslinx_id === HEADER_ACTIONS_ID) return false;
    if (w?._vslinx_id === BUTTON_SPACER_ID) return false;
    if (w?._vslinx_id === BUTTON_ID) return false;
    return true;
  });
}

async function uploadFilesIntoFolder(files, targetFolder = "") {
  for (const file of (files || [])) {
    try {
      const { cancelled, up } = await uploadWithConflictResolution(file, targetFolder || "");
      if (cancelled) continue;

      const filename = up?.filename;
      if (filename) _vslinxInvalidateCsvCache(filename);

      toast("info", "Uploaded", String(filename || file?.name || "file"), 2200);
    } catch (e) {
      console.error(e);
      toast("error", "File Upload", String(e?.message || e), 4500);
    }
  }
}

async function createFolder(path) {
  try {
    await createPromptFolder(path);
    toast("info", "Folder created", path, 2200);
  } catch (e) {
    console.error(e);
    toast("error", "Create Folder", String(e?.message || e), 4500);
  }
}

function expandSelectionsToFiles(allFiles, selectedFiles, selectedFolders) {
  const norm = (p) => String(p ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const filesSet = new Set((selectedFiles || []).map(norm).filter(Boolean));
  const folders = (selectedFolders || [])
    .map((p) => String(p ?? "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, ""))
    .filter(Boolean);

  for (const folder of folders) {
    const prefix = folder ? (folder + "/") : "";
    for (const f of (allFiles || [])) {
      const ff = norm(f);
      if (!ff) continue;
      if (folder && ff.startsWith(prefix)) filesSet.add(ff);
    }
  }

  return Array.from(filesSet);
}

async function addSingleFileToNode(node, filename) {
  if (!filename) return;

  if (hasRowForFilename(node, filename)) {
    toast("info", "Already added", filename, 2200);
    return;
  }

  node._csvRowCounter = (node._csvRowCounter || 0) + 1;
  const row = new CsvRowWidget("csv_" + node._csvRowCounter);
  node.addCustomWidget(row);

  row.value.order = getRowWidgets(node).length;
  await row.setFile(filename);

  layoutWidgets(node);
  recomputeNodeSize(node);
  markGraphChanged(node);
}

function addAdditionalPromptRow(node, initialText = "") {
  node._extraPromptCounter = (node._extraPromptCounter || 0) + 1;
  const name = `csv_additional_prompt_${node._extraPromptCounter}`;
  const w = new ExtraPromptWidget(name);
  w.value.text = String(initialText ?? "");
  node.addCustomWidget(w);

  w.value.order = getRowWidgets(node).length;

  layoutWidgets(node);
  recomputeNodeSize(node);
  markGraphChanged(node);

  toast("info", "Added", "Additional prompt row added.", 1600);
}

function ensureSelectButton(node) {
  const existing = (node.widgets || []).find(isBottomButton);
  if (existing) return existing;

  ensureListTopSpacer(node, 10);
  ensureHeaderActions(node);
  ensureButtonSpacer(node, 10);

  const btn = node.addWidget("button", BUTTON_LABEL, null, async () => {
    try {
      const entries = await listPromptEntries().catch(async () => {
        const files = await listPromptFiles();
        return { files, dirs: [] };
      });

      const picked = await showFilePickerModal(entries, "", {
        mode: "multi",
        onAddFiles: uploadFilesIntoFolder,
        onCreateFolder: createFolder,
        getEntries: listPromptEntries,
      });

      if (!picked) return true;

      if (typeof picked === "string") {
        await addSingleFileToNode(node, picked);
        return true;
      }

      if (picked?.mode === "single" && picked?.file) {
        await addSingleFileToNode(node, String(picked.file));
        return true;
      }

      if (picked?.mode !== "multi") return true;

      const allFiles = Array.isArray(entries?.files) ? entries.files : [];
      const toAddFiles = expandSelectionsToFiles(allFiles, picked.files || [], picked.folders || []);
      if (!toAddFiles.length) return true;

      for (const filename of toAddFiles) {
        await addSingleFileToNode(node, filename);
      }

      return true;
    } catch (e) {
      console.error(e);
      toast("error", "CSV Picker", String(e?.message || e), 4500);
      return true;
    }
  });

  btn.serialize = false;
  btn._vslinx_id = BUTTON_ID;

  layoutWidgets(node);
  return btn;
}

function getRowsInOrder(node) {
  return getRowWidgets(node);
}

function reorderDraggedRow(node, draggedRow, targetIndex) {
  const rows = getRowsInOrder(node);
  const from = rows.indexOf(draggedRow);
  if (from === -1) return false;

  const clamped = Math.max(0, Math.min(targetIndex, rows.length - 1));
  if (clamped === from) return false;

  const nextRows = rows.slice();
  nextRows.splice(from, 1);
  nextRows.splice(clamped, 0, draggedRow);

  const nonRows = (node.widgets || []).filter((w) => !isRowWidget(w));
  node.widgets = [...nonRows, ...nextRows];

  layoutWidgets(node);
  markGraphChanged(node);
  return true;
}

function computeTargetIndex(node, probeY, draggedRow, dirY = 0) {
  const rows = getRowsInOrder(node);
  const others = rows.filter((r) => r !== draggedRow);

  if (!others.length) return 0;

  let minY = Infinity;
  for (const r of others) {
    const ry = r?._rowY;
    if (typeof ry === "number" && ry < minY) minY = ry;
  }
  if (!Number.isFinite(minY)) minY = 10;

  const thresh = dirY >= 0 ? DRAG_SNAP_ENTER : DRAG_SNAP_EXIT;

  for (let i = 0; i < others.length; i++) {
    const r = others[i];
    const ry = typeof r?._rowY === "number" ? r._rowY : (minY + i * ROW_HEIGHT);
    const triggerLine = ry + ROW_HEIGHT * thresh;
    if (probeY < triggerLine) return i;
  }
  return others.length;
}

function drawDropPlaceholderAt(ctx, node, y) {
  if (typeof y !== "number") return;

  const x = LIST_SIDE_MARGIN;
  const w = Math.max(0, (node?.size?.[0] ?? 0) - LIST_SIDE_MARGIN * 2);
  const h = ROW_HEIGHT;
  const padY = 2;
  const yy = y + padY;
  const hh = h - padY * 2;

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#000000";
  roundRectPath(ctx, x + 2, yy + 2, w - 4, hh - 4, 10);
  ctx.fill();

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, x + 1, yy + 1, w - 2, hh - 2, 10);
  ctx.fill();

  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  roundRectPath(ctx, x + 1, yy + 1, w - 2, hh - 2, 10);
  ctx.stroke();
  ctx.restore();
}

function drawGhostRow(ctx, node, row, ghostY) {
  const x = LIST_SIDE_MARGIN;
  const w = Math.max(0, (node?.size?.[0] ?? 0) - LIST_SIDE_MARGIN * 2);

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#000000";
  roundRectPath(ctx, x + 6, ghostY + 6, w - 12, ROW_HEIGHT - 6, 12);
  ctx.fill();

  ctx.globalAlpha = 0.98;
  row._render(ctx, node, w, ghostY, { ghost: true });

  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  roundRectPath(ctx, x + 1, ghostY + 1, w - 2, ROW_HEIGHT - 2, 10);
  ctx.stroke();

  ctx.restore();
}

function restoreOriginalOrder(node, originalRows) {
  if (!node || !Array.isArray(originalRows) || !originalRows.length) return;
  const currentRows = getRowsInOrder(node);
  const present = new Set(currentRows);
  const restored = originalRows.filter((r) => present.has(r));
  for (const r of currentRows) {
    if (!restored.includes(r)) restored.push(r);
  }
  const nonRows = (node.widgets || []).filter((w) => !isRowWidget(w));
  node.widgets = [...nonRows, ...restored];
  layoutWidgets(node);
  markGraphChanged(node);
}

function endDrag(node, commit = true) {
  const d = node?._vslinxDrag;
  if (!d?.row) return;

  const row = d.row;

  row._dragging = false;
  row._hover = null;

  node._vslinxDrag = null;
  vslinxDragNode = null;

  if (!commit) {
    restoreOriginalOrder(node, d.originalRows);
  }

  setCanvasCursor("");
  updateRowOrders(node);
  markGraphChanged(node);
}

class ExtraPromptWidget {
  constructor(name) {
    this.name = name;
    this.type = "custom";
    this.value = { type: "ExtraPromptWidget", text: "", order: 0 };
    this._hover = null;
    this._rowY = null;
    this._dragging = false;

    this._bounds = {
      drag: [0, 0, 0, 0],
      edit: [0, 0, 0, 0],
      remove: [0, 0, 0, 0],
    };
  }

  computeSize() { return [0, ROW_HEIGHT]; }
  serializeValue() { return this.value; }

  _hitPart(pos) {
    const x = pos[0];
    const y = pos[1];
    const inRect = (r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
    if (inRect(this._bounds.drag)) return "drag";
    if (inRect(this._bounds.remove)) return "remove";
    if (inRect(this._bounds.edit)) return "edit";
    return null;
  }

  _handleRemove(node) {
    const idx = node.widgets.indexOf(this);
    if (idx !== -1) node.widgets.splice(idx, 1);

    // allow deleting the last additional prompt row (no auto re-add)
    layoutWidgets(node);
    recomputeNodeSize(node);
    markGraphChanged(node);
  }

  _render(ctx, node, _width, y, { ghost = false } = {}) {
    if (!ghost) this._rowY = y;

    const height = ROW_HEIGHT;
    const x = LIST_SIDE_MARGIN;
    const w = Math.max(0, (node?.size?.[0] ?? _width) - LIST_SIDE_MARGIN * 2);

    const innerPadY = 2;
    const yy = y + innerPadY;
    const hh = Math.max(0, height - innerPadY * 2);

    const handleW = DRAG_HANDLE_W;
    const gap = DRAG_HANDLE_GAP;

    const handleX = x;
    const handleY = yy;
    const handleH = hh;

    const tableX = x + handleW + gap;
    const tableW = Math.max(0, w - handleW - gap);

    // match CsvRowWidget geometry
    const topH = Math.floor(hh * 0.52);
    const botH = hh - topH;

    const topY = yy;
    const botY = yy + topH;

    const removeW = Math.max(28, Math.floor(tableW * 0.06));
    const mainW = Math.max(0, tableW - removeW);

    const mainX = tableX;
    const remX = tableX + mainW;

    ctx.save();

    // drag handle
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#232323";
    roundRectPath(ctx, handleX, handleY, handleW, handleH, 7);
    ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#3f3f3f";
    ctx.lineWidth = 1;
    roundRectPath(ctx, handleX, handleY, handleW, handleH, 7);
    ctx.stroke();

    if (this._hover === "drag" || this._dragging) {
      drawHoverOverlay(ctx, handleX, handleY, handleW, handleH, false);
    }
    drawGripDots(ctx, handleX, handleY, handleW, handleH, this._dragging);

    // table
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#262626";
    roundRectPath(ctx, tableX, yy, tableW, hh, 7);
    ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#3f3f3f";
    ctx.lineWidth = 1;
    roundRectPath(ctx, tableX, yy, tableW, hh, 7);
    ctx.stroke();

    // separators
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#3a3a3a";
    ctx.beginPath();
    ctx.moveTo(tableX + 6, botY);
    ctx.lineTo(tableX + tableW - 6, botY);
    ctx.moveTo(remX, topY + 3);
    ctx.lineTo(remX, topY + topH - 3);
    ctx.stroke();

    // hover overlays
    if (this._hover === "remove") {
      drawHoverOverlay(ctx, remX, topY, removeW, topH, true);
    } else if (this._hover === "edit") {
      drawHoverOverlay(ctx, mainX, yy, mainW, hh, false);
    }

    // REMOVE BUTTON (match CsvRowWidget)
    // IMPORTANT: ensure alpha is exactly the same as CsvRowWidget for the button bg
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#2a1e1e";
    roundRectPath(ctx, remX + 4, topY + 4, removeW - 8, topH - 8, 7);
    ctx.fill();
    ctx.restore();

    // IMPORTANT: force alpha back to 1.0 before drawing the X
    // (CsvRowWidget has globalAlpha=1.0 here, which is why its X is brighter)
    ctx.globalAlpha = 1.0;
    drawSmallX(ctx, remX + 4, topY + 4, removeW - 8, topH - 8, "#e05555");

    // text
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR;

    const prevFont = ctx.font;
    const prevAlign = ctx.textAlign;
    const prevBase = ctx.textBaseline;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const topMid = topY + topH / 2;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillText("Additional prompt:", mainX + 10, topMid);
    ctx.restore();

    const raw = String(this.value.text ?? "").replace(/\r/g, "");
    const firstLine = (raw.split("\n")[0] ?? "").trim();
    const preview = firstLine || "(click to edit)";

    const botMid = botY + botH / 2;
    ctx.save();
    ctx.globalAlpha = 0.95;
    const maxW = Math.max(0, tableW - 20);
    ctx.fillText(ellipsizeToWidth(ctx, preview, maxW), tableX + 10, botMid);
    ctx.restore();

    ctx.font = prevFont;
    ctx.textAlign = prevAlign;
    ctx.textBaseline = prevBase;

    ctx.restore();

    if (!ghost) {
      this._bounds.drag = [handleX, handleY, handleW, handleH];
      this._bounds.remove = [remX, topY, removeW, topH];
      this._bounds.edit = [tableX, yy, tableW, hh];
    }
  }

  draw(ctx, node, _width, y) {
    const d = node?._vslinxDrag;
    if (d?.row === this && this._dragging) {
      this._rowY = y;
      return;
    }
    this._render(ctx, node, _width, y, { ghost: false });
  }

  mouse(event, pos, node) {
    const t = event?.type || "";
    const isDown = (t === "pointerdown" || t === "mousedown");
    const isMove = (t === "pointermove" || t === "mousemove");
    const isUp = (
      t === "pointerup" || t === "mouseup" ||
      t === "pointercancel" || t === "mouseleave" || t === "pointerleave"
    );

    if (this._dragging) {
      if (isMove) {
        const buttons = typeof event?.buttons === "number" ? event.buttons : 1;
        if ((buttons & 1) === 0) {
          endDrag(node, false);
          return true;
        }

        const d = node._vslinxDrag;
        if (!d) return true;

        const pointerY = pos?.[1];
        if (typeof pointerY === "number") {
          d.ghostY = pointerY - d.offsetY;

          const probeY = d.ghostY + ROW_HEIGHT * DRAG_SNAP_FRACTION;
          const lastProbeY = (typeof d.lastProbeY === "number") ? d.lastProbeY : probeY;
          const dirY = probeY - lastProbeY;
          d.lastProbeY = probeY;

          const targetIndex = computeTargetIndex(node, probeY, this, dirY);
          const rows = getRowsInOrder(node);
          const currentIndex = rows.indexOf(this);
          const clampedTarget = Math.max(0, Math.min(targetIndex, rows.length - 1));
          if (clampedTarget !== currentIndex) {
            reorderDraggedRow(node, this, clampedTarget);
          }

          node.setDirtyCanvas(true, true);
        }

        this._hover = "drag";
        setCanvasCursor("grabbing");
        return true;
      }

      if (isUp) {
        endDrag(node, true);
        return true;
      }

      return true;
    }

    if (!isDown) return false;
    if (event.button !== 0) return false;

    const part = this._hitPart(pos);

    if (part === "drag") {
      const rows = getRowsInOrder(node);
      const startIndex = rows.indexOf(this);

      this._dragging = true;
      this._hover = "drag";

      const pointerY = pos?.[1] ?? 0;
      const rowTop = typeof this._rowY === "number" ? this._rowY : pointerY;
      const offsetY = pointerY - rowTop;

      node._vslinxDrag = {
        row: this,
        offsetY,
        ghostY: rowTop,
        originalRows: rows.slice(),
        startIndex,
        lastProbeY: rowTop + ROW_HEIGHT * DRAG_SNAP_FRACTION,
      };

      vslinxDragNode = node;

      setCanvasCursor("grabbing");
      node.setDirtyCanvas(true, true);

      return true;
    }

    if (part === "remove") {
      this._handleRemove(node);
      return true;
    }

    if (part === "edit") {
      showAdditionalPromptModal(this.value.text || "").then((txt) => {
        if (txt === null) return;
        this.value.text = String(txt ?? "");
        layoutWidgets(node);
        markGraphChanged(node);
      });
      return true;
    }

    return false;
  }
}

class CsvRowWidget {
  constructor(name) {
    this.name = name;
    this.type = "custom";
    this.value = { type: "CsvRowWidget", file: "", key: "(None)", keys: [], order: 0 };
    this._labels = [];
    this._map = {};
    this._hover = null;
    this._rowY = null;
    this._dragging = false;
    this._bounds = {
      drag: [0, 0, 0, 0],
      file: [0, 0, 0, 0],
      remove: [0, 0, 0, 0],
      sel: [0, 0, 0, 0],
      out: [0, 0, 0, 0],
    };
  }

  computeSize() { return [0, ROW_HEIGHT]; }

  async setFile(filename, opts = {}) {
    const resetSelection = opts?.resetSelection !== false;

    this.value.file = filename;

    if (resetSelection) {
      this.value.key = "(None)";
      this.value.keys = [];
    }

    const data = await readPromptFile(filename);
    this._labels = ["(None)", "Random", ...(data.labels || [])];
    this._map = data.map || {};
  }

  serializeValue() { return this.value; }

  _getKeysEffective() {
    if (Array.isArray(this.value.key)) {
      return this.value.key.map(String).filter((s) => s && s !== "(None)");
    }

    const keys = Array.isArray(this.value.keys) ? this.value.keys.map(String).filter(Boolean) : [];
    if (keys.length) return keys.filter((s) => s !== "(None)");

    const k = String(this.value.key ?? "");
    if (!k || k === "(None)") return [];
    return [k];
  }

  _getSelPreviewText() {
    const keys = this._getKeysEffective();
    if (!keys.length) return "(None)";
    if (keys.length === 1) return keys[0];
    return `${keys.length} selected`;
  }

  _getOutPreview() {
    const keys = this._getKeysEffective();
    if (!keys.length) return "";

    const outs = [];
    for (const k of keys) {
      if (!k || k === "(None)") continue;
      if (k === "Random") {
        outs.push("(random pick at runtime)");
        continue;
      }
      const v = this._map[k];
      if (v) outs.push(v);
    }
    if (!outs.length) return "";
    return outs.join(" | ");
  }

  async _handlePickFile(node) {
    try {
      const entries = await listPromptEntries().catch(async () => {
        const files = await listPromptFiles();
        return { files, dirs: [] };
      });

      const picked = await showFilePickerModal(entries, this.value.file || "", {
        mode: "single",
      });

      if (!picked) return;

      if (hasRowForFilename(node, picked, this)) {
        const idx = node.widgets.indexOf(this);
        if (idx !== -1) node.widgets.splice(idx, 1);

        layoutWidgets(node);
        recomputeNodeSize(node);
        markGraphChanged(node);

        toast("warn", "Duplicate entry", "That file is already in the list – removed this entry.", 3500);
        return;
      }

      await this.setFile(picked);
      layoutWidgets(node);
      recomputeNodeSize(node);
      markGraphChanged(node);
    } catch (e) {
      console.error(e);
      toast("error", "File Picker", String(e?.message || e), 4500);
    }
  }

  _handleRemove(node) {
    const idx = node.widgets.indexOf(this);
    if (idx !== -1) node.widgets.splice(idx, 1);
    layoutWidgets(node);
    recomputeNodeSize(node);
    markGraphChanged(node);
  }

  _hitPart(pos) {
    const x = pos[0];
    const y = pos[1];
    const inRect = (r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

    if (inRect(this._bounds.drag)) return "drag";
    if (inRect(this._bounds.remove)) return "remove";
    if (inRect(this._bounds.file)) return "file";
    if (inRect(this._bounds.sel)) return "sel";
    return null;
  }

  _render(ctx, node, _width, y, { ghost = false } = {}) {
    if (!ghost) this._rowY = y;

    const height = ROW_HEIGHT;
    const x = LIST_SIDE_MARGIN;
    const w = Math.max(0, (node?.size?.[0] ?? _width) - LIST_SIDE_MARGIN * 2);

    const innerPadY = 2;
    const yy = y + innerPadY;
    const hh = Math.max(0, height - innerPadY * 2);

    const handleW = DRAG_HANDLE_W;
    const gap = DRAG_HANDLE_GAP;

    const handleX = x;
    const handleY = yy;
    const handleH = hh;

    const tableX = x + handleW + gap;
    const tableW = Math.max(0, w - handleW - gap);

    const topH = Math.floor(hh * 0.52);
    const botH = hh - topH;

    const topY = yy;
    const botY = yy + topH;

    const removeW = Math.max(28, Math.floor(tableW * 0.06));
    const fileW = Math.max(0, tableW - removeW);

    const fileX = tableX;
    const remX = tableX + fileW;

    const selW = Math.floor(tableW / 2);
    const outW = tableW - selW;
    const selX = tableX;
    const outX = tableX + selW;

    ctx.save();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#232323";
    roundRectPath(ctx, handleX, handleY, handleW, handleH, 7);
    ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#3f3f3f";
    ctx.lineWidth = 1;
    roundRectPath(ctx, handleX, handleY, handleW, handleH, 7);
    ctx.stroke();

    if (this._hover === "drag" || this._dragging) drawHoverOverlay(ctx, handleX, handleY, handleW, handleH, false);
    drawGripDots(ctx, handleX, handleY, handleW, handleH, this._dragging);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#262626";
    roundRectPath(ctx, tableX, yy, tableW, hh, 7);
    ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#3f3f3f";
    ctx.lineWidth = 1;
    roundRectPath(ctx, tableX, yy, tableW, hh, 7);
    ctx.stroke();

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#3a3a3a";
    ctx.beginPath();
    ctx.moveTo(tableX + 6, botY);
    ctx.lineTo(tableX + tableW - 6, botY);
    ctx.moveTo(remX, topY + 3);
    ctx.lineTo(remX, topY + topH - 3);
    ctx.moveTo(outX, botY + 3);
    ctx.lineTo(outX, botY + botH - 3);
    ctx.stroke();

    if (this._hover === "file") drawHoverOverlay(ctx, fileX, topY, fileW, topH, false);
    else if (this._hover === "remove") drawHoverOverlay(ctx, remX, topY, removeW, topH, true);
    else if (this._hover === "sel") drawHoverOverlay(ctx, selX, botY, selW, botH, false);

    ctx.globalAlpha = 1.0;
    ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR;

    const prevFont = ctx.font;
    const prevAlign = ctx.textAlign;
    const prevBase = ctx.textBaseline;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = prevFont;

    const fileMid = topY + topH / 2;
    drawClippedText(ctx, this.value.file || "(click to choose file)", fileX, fileMid, fileW, topH);

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#2a1e1e";
    roundRectPath(ctx, remX + 4, topY + 4, removeW - 8, topH - 8, 7);
    ctx.fill();
    ctx.restore();
    drawSmallX(ctx, remX + 4, topY + 4, removeW - 8, topH - 8, "#e05555");

    const botMid = botY + botH / 2;

    const selText = this._getSelPreviewText();
    drawClippedText(ctx, selText, selX, botMid, selW, botH);

    const outVal = this._getOutPreview();
    drawClippedText(ctx, outVal, outX, botMid, outW, botH);

    ctx.font = prevFont;
    ctx.textAlign = prevAlign;
    ctx.textBaseline = prevBase;

    ctx.restore();

    if (!ghost) {
      this._bounds.drag = [handleX, handleY, handleW, handleH];
      this._bounds.file = [fileX, topY, fileW, topH];
      this._bounds.remove = [remX, topY, removeW, topH];
      this._bounds.sel = [selX, botY, selW, botH];
      this._bounds.out = [outX, botY, outW, botH];
    }
  }

  draw(ctx, node, _width, y) {
    const d = node?._vslinxDrag;
    if (d?.row === this && this._dragging) {
      this._rowY = y;
      return;
    }
    this._render(ctx, node, _width, y, { ghost: false });
  }

  mouse(event, pos, node) {
    const t = event?.type || "";
    const isDown = (t === "pointerdown" || t === "mousedown");
    const isMove = (t === "pointermove" || t === "mousemove");
    const isUp = (
      t === "pointerup" || t === "mouseup" ||
      t === "pointercancel" || t === "mouseleave" || t === "pointerleave"
    );

    if (this._dragging) {
      if (isMove) {
        const buttons = typeof event?.buttons === "number" ? event.buttons : 1;
        if ((buttons & 1) === 0) {
          endDrag(node, false);
          return true;
        }

        const d = node._vslinxDrag;
        if (!d) return true;

        const pointerY = pos?.[1];
        if (typeof pointerY === "number") {
          d.ghostY = pointerY - d.offsetY;

          const probeY = d.ghostY + ROW_HEIGHT * DRAG_SNAP_FRACTION;

          const lastProbeY = (typeof d.lastProbeY === "number") ? d.lastProbeY : probeY;
          const dirY = probeY - lastProbeY;
          d.lastProbeY = probeY;

          const targetIndex = computeTargetIndex(node, probeY, this, dirY);

          const rows = getRowsInOrder(node);
          const currentIndex = rows.indexOf(this);
          const clampedTarget = Math.max(0, Math.min(targetIndex, rows.length - 1));
          if (clampedTarget !== currentIndex) {
            reorderDraggedRow(node, this, clampedTarget);
          }

          node.setDirtyCanvas(true, true);
        }

        this._hover = "drag";
        setCanvasCursor("grabbing");
        return true;
      }

      if (isUp) {
        endDrag(node, true);
        return true;
      }

      return true;
    }

    if (!isDown) return false;
    if (event.button !== 0) return false;

    const part = this._hitPart(pos);

    if (part === "drag") {
      const rows = getRowsInOrder(node);
      const startIndex = rows.indexOf(this);

      this._dragging = true;
      this._hover = "drag";

      const pointerY = pos?.[1] ?? 0;
      const rowTop = typeof this._rowY === "number" ? this._rowY : pointerY;
      const offsetY = pointerY - rowTop;

      node._vslinxDrag = {
        row: this,
        offsetY,
        ghostY: rowTop,
        originalRows: rows.slice(),
        startIndex,
        lastProbeY: rowTop + ROW_HEIGHT * DRAG_SNAP_FRACTION,
      };

      vslinxDragNode = node;

      setCanvasCursor("grabbing");
      node.setDirtyCanvas(true, true);

      return true;
    }

    if (part === "remove") {
      this._handleRemove(node);
      return true;
    }

    if (part === "file") {
      this._handlePickFile(node);
      return true;
    }

    if (part === "sel") {
      if (!this.value.file) return true;

      const items = (this._labels || []).map((label) => ({
        content: label,
        callback: () => {
          this.value.key = label;
          this.value.keys = [];
          markGraphChanged(node);
        },
      }));

      const preselected =
        Array.isArray(this.value.key) ? this.value.key :
          (Array.isArray(this.value.keys) && this.value.keys.length)
            ? this.value.keys
            : (this.value.key && this.value.key !== "(None)" ? [String(this.value.key)] : []);

      showKeyPickerMenu(items, event, "Selection", { selected: preselected }).then((result) => {
        if (!result) return;

        if (result.mode === "single") {
          const picked = String(result.picked?.content ?? "");
          if (!picked || picked === "(None)") {
            this.value.key = "(None)";
            this.value.keys = [];
          } else {
            this.value.key = picked;
            this.value.keys = [];
          }
          markGraphChanged(node);
          return;
        }

        if (result.mode === "clear") {
          this.value.key = "(None)";
          this.value.keys = [];
          markGraphChanged(node);
          return;
        }

        if (result.mode === "multi") {
          const chosen = Array.isArray(result.selected) ? result.selected : [];
          const cleaned = chosen.map(String).filter((s) => s && s !== "(None)");

          if (cleaned.length <= 1) {
            const one = cleaned[0] || "(None)";
            this.value.key = one;
            this.value.keys = [];
          } else {
            this.value.key = cleaned.slice();
            this.value.keys = cleaned.slice();
          }

          markGraphChanged(node);
          return;
        }
      });

      return true;
    }

    return false;
  }
}

app.registerExtension({
  name: "vslinx.multilang_csv_prompt_picker",
  async nodeCreated(node) {
    if (node.comfyClass !== NODE_NAME) return;

    node.serialize_widgets = true;

    const origOnDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
      origOnDrawForeground?.call(this, ctx);

      const d = this._vslinxDrag;
      if (!d?.row || !d.row._dragging) return;

      const slotY = d.row?._rowY;
      drawDropPlaceholderAt(ctx, this, slotY);
      drawGhostRow(ctx, this, d.row, d.ghostY);
    };

    if (!app.canvas._vslinxProcessMouseMovePatched) {
      app.canvas._vslinxProcessMouseMovePatched = true;

      const orig = app.canvas.processMouseMove.bind(app.canvas);
      app.canvas.processMouseMove = function (e) {
        const r = orig(e);

        if (isDragging()) {
          setCanvasCursor("grabbing");
          return r;
        }

        if (vslinxHoverNode) {
          const over = this.node_over;
          if (over !== vslinxHoverNode) {
            clearHoverOnNode(vslinxHoverNode);
            vslinxHoverNode = null;
            setCanvasCursor("");
          }
        }

        return r;
      };
    }

    if (!app.canvas._vslinxMouseLeaveBound) {
      app.canvas._vslinxMouseLeaveBound = true;
      const c = app?.canvas?.canvas;

      const cancelAll = () => {
        if (vslinxDragNode?._vslinxDrag?.row?._dragging) {
          endDrag(vslinxDragNode, false);
        }

        if (vslinxHoverNode) {
          clearHoverOnNode(vslinxHoverNode);
          vslinxHoverNode = null;
        }

        setCanvasCursor("");
      };

      const commitAll = () => {
        if (vslinxDragNode?._vslinxDrag?.row?._dragging) {
          endDrag(vslinxDragNode, true);
        }
        setCanvasCursor("");
      };

      if (c) {
        c.addEventListener("mouseleave", cancelAll);
        c.addEventListener("pointerleave", cancelAll);
      }

      window.addEventListener("blur", cancelAll, true);
      window.addEventListener("pointercancel", cancelAll, true);

      window.addEventListener("mouseup", commitAll, true);
      window.addEventListener("pointerup", commitAll, true);
    }

    const origOnMouseMove = node.onMouseMove;
    node.onMouseMove = function (e, pos, canvas) {
      origOnMouseMove?.call(this, e, pos, canvas);

      vslinxHoverNode = this;

      const rows = getRowWidgets(this);
      if (rows.some((r) => r?._dragging)) {
        setCanvasCursor("grabbing");
        return;
      }

      let cursor = "";
      let didAnyChange = false;

      // header hover
      const header = (this.widgets || []).find(isHeaderActionsWidget) || null;
      if (header && typeof header._rowY === "number") {
        const hy = header._rowY;
        const inHeader = pos[1] >= hy && pos[1] <= hy + HEADER_HEIGHT;
        if (inHeader) {
          const part = header._hitPart(pos);
          if (header._hover !== part) {
            header._hover = part;
            didAnyChange = true;
          }
          if (part) cursor = "pointer";
        } else {
          if (header._hover) {
            header._hover = null;
            didAnyChange = true;
          }
        }
      }

      for (const row of rows) {
        const rowY = row._rowY;
        if (typeof rowY !== "number") continue;

        const inThisRow = pos[1] >= rowY && pos[1] <= rowY + ROW_HEIGHT;

        if (!inThisRow) {
          if (row._hover) {
            row._hover = null;
            didAnyChange = true;
          }
          continue;
        }

        const part = row._hitPart(pos);
        if (row._hover !== part) {
          row._hover = part;
          didAnyChange = true;
        }

        if (part === "drag") cursor = "grab";
        else if (part) cursor = "pointer";
      }

      if (didAnyChange) this.setDirtyCanvas(true, true);
      setCanvasCursor(cursor);
    };

    const origConfigure = node.configure;
    node.configure = function (info) {
      origConfigure?.call(node, info);

      if (vslinxDragNode === node && node._vslinxDrag?.row?._dragging) {
        endDrag(node, false);
      }

      removeAllVslinxUiWidgets(node);

      ensureListTopSpacer(node, 10);
      ensureHeaderActions(node);
      ensureButtonSpacer(node, 10);
      ensureSelectButton(node);

      const vals = info?.widgets_values || [];

      // restore extras (multiple)
      const savedExtras = vals.filter((v) => v && v.type === "ExtraPromptWidget");
      node._extraPromptCounter = 0;
      for (const v of savedExtras) {
        node._extraPromptCounter += 1;
        const name = `csv_additional_prompt_${node._extraPromptCounter}`;
        const extra = new ExtraPromptWidget(name);
        extra.value = { ...extra.value, ...v };
        node.addCustomWidget(extra);
      }

      // restore csv rows
      const savedRows = vals.filter((v) => v && v.type === "CsvRowWidget" && v.file);

      node._csvRowCounter = 0;
      for (const v of savedRows) {
        node._csvRowCounter += 1;
        const row = new CsvRowWidget("csv_" + node._csvRowCounter);
        node.addCustomWidget(row);

        const merged = { ...row.value, ...v };
        if (!Array.isArray(merged.keys)) merged.keys = [];

        if (Array.isArray(merged.key)) {
          merged.keys = merged.key.slice();
        }

        row.value = merged;

        row.setFile(v.file, { resetSelection: false }).then(() => {
          row.value.key = v.key ?? "(None)";
          if (Array.isArray(v.key)) row.value.keys = v.key.slice();
          if (Array.isArray(v.keys) && v.keys.length && !Array.isArray(row.value.key)) row.value.keys = v.keys.slice();

          layoutWidgets(node);
          node.setDirtyCanvas(true, true);
        }).catch((e) => {
          console.warn("[vsLinx] restore setFile failed for", v.file, e);
          layoutWidgets(node);
          node.setDirtyCanvas(true, true);
        });
      }

      node._vslinxDrag = null;

      // sort all rows by order, keep nonRows (spacers/buttons/header)
      const rows = getRowWidgets(node).slice();
      rows.sort((a, b) => {
        const ao = Number.isFinite(a?.value?.order) ? a.value.order : 0;
        const bo = Number.isFinite(b?.value?.order) ? b.value.order : 0;
        if (ao !== bo) return ao - bo;
        return 0;
      });
      const nonRows = (node.widgets || []).filter((w) => !isRowWidget(w));
      node.widgets = [...nonRows, ...rows];
      layoutWidgets(node);

      // if no extra prompts were saved, keep one by default
      if (!getRowWidgets(node).some((w) => w?.value?.type === "ExtraPromptWidget")) {
        addAdditionalPromptRow(node, "");
      }

      recomputeNodeSize(node);
      node.setDirtyCanvas(true, true);
    };

    removeAllVslinxUiWidgets(node);

    ensureListTopSpacer(node, 10);
    ensureHeaderActions(node);
    ensureButtonSpacer(node, 10);
    ensureSelectButton(node);

    // default one additional prompt row
    node._extraPromptCounter = 0;
    addAdditionalPromptRow(node, "");

    node._vslinxDrag = null;

    layoutWidgets(node);
    recomputeNodeSize(node);
  },
});