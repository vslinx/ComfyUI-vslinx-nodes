import { _vslinxFindHitsInFile } from "./csvApi.js";

export function showAdditionalPromptModal(currentText = "") {
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
    card.style.width = "720px";
    card.style.maxWidth = "94vw";
    card.style.maxHeight = "86vh";
    card.style.background = "#1f1f1f";
    card.style.border = "1px solid #444";
    card.style.borderRadius = "12px";
    card.style.padding = "14px";
    card.style.color = "#eee";
    card.style.fontFamily = "sans-serif";
    card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "10px";

    const title = document.createElement("div");
    title.textContent = "Additional Prompt (multiline)";
    title.style.fontSize = "15px";
    title.style.fontWeight = "600";

    const hint = document.createElement("div");
    hint.textContent = "This text will be inserted into the prompt at this row’s position.";
    hint.style.fontSize = "12px";
    hint.style.opacity = "0.8";
    hint.style.lineHeight = "1.35";

    const ta = document.createElement("textarea");
    ta.value = String(currentText ?? "");
    ta.style.width = "100%";
    ta.style.minHeight = "220px";
    ta.style.maxHeight = "52vh";
    ta.style.resize = "vertical";
    ta.style.padding = "10px";
    ta.style.borderRadius = "10px";
    ta.style.border = "1px solid #555";
    ta.style.background = "#2b2b2b";
    ta.style.color = "#eee";
    ta.style.outline = "none";
    ta.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ta.style.fontSize = "12px";
    ta.style.lineHeight = "1.35";

    const buttons = document.createElement("div");
    buttons.style.display = "flex";
    buttons.style.justifyContent = "flex-end";
    buttons.style.gap = "8px";

    const btn = (label) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.padding = "8px 10px";
      b.style.borderRadius = "10px";
      b.style.border = "1px solid #555";
      b.style.background = "#2b2b2b";
      b.style.color = "#eee";
      b.style.cursor = "pointer";
      return b;
    };

    const cancel = btn("Cancel");
    const clear = btn("Clear");
    const save = btn("Save");

    const cleanup = () => document.removeEventListener("keydown", onKeyDown, true);

    const close = (val) => {
      cleanup();
      if (overlay.parentNode) document.body.removeChild(overlay);
      resolve(val);
    };

    cancel.onclick = () => close(null);
    clear.onclick = () => (ta.value = "");
    save.onclick = () => close(ta.value);

    overlay.onclick = (e) => {
      if (e.target === overlay) cancel.onclick();
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") cancel.onclick();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save.onclick();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    card.appendChild(title);
    card.appendChild(hint);
    card.appendChild(ta);
    buttons.appendChild(cancel);
    buttons.appendChild(clear);
    buttons.appendChild(save);
    card.appendChild(buttons);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.value.length;
      ta.selectionEnd = ta.value.length;
    }, 0);
  });
}

export function showConflictModal({ filename, suggested }) {
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

    const title = document.createElement("div");
    title.textContent = "File already exists";
    title.style.fontSize = "16px";
    title.style.fontWeight = "600";
    title.style.marginBottom = "8px";

    const msg = document.createElement("div");
    msg.style.fontSize = "13px";
    msg.style.lineHeight = "1.35";
    msg.style.opacity = "0.95";
    msg.innerHTML =
      `<div>A file named <b>${filename}</b> already exists in <code>input/csv</code> with different content.</div>` +
      `<div style="margin-top:8px">Choose what to do:</div>`;

    const inputWrap = document.createElement("div");
    inputWrap.style.marginTop = "10px";
    inputWrap.style.display = "flex";
    inputWrap.style.flexDirection = "column";
    inputWrap.style.gap = "6px";

    const label = document.createElement("div");
    label.textContent = "Rename to:";
    label.style.fontSize = "12px";
    label.style.opacity = "0.85";

    const input = document.createElement("input");
    input.type = "text";
    input.value = suggested || filename;
    input.style.padding = "10px";
    input.style.borderRadius = "10px";
    input.style.border = "1px solid #555";
    input.style.background = "#2b2b2b";
    input.style.color = "#eee";
    input.style.outline = "none";

    inputWrap.appendChild(label);
    inputWrap.appendChild(input);

    const buttons = document.createElement("div");
    buttons.style.display = "flex";
    buttons.style.gap = "8px";
    buttons.style.justifyContent = "flex-end";
    buttons.style.marginTop = "14px";

    function makeBtn(labelText) {
      const b = document.createElement("button");
      b.textContent = labelText;
      b.style.padding = "8px 10px";
      b.style.borderRadius = "10px";
      b.style.border = "1px solid #555";
      b.style.background = "#2b2b2b";
      b.style.color = "#eee";
      b.style.cursor = "pointer";
      return b;
    }

    const cancel = makeBtn("Cancel");
    const rename = makeBtn("Rename");
    const overwrite = makeBtn("Overwrite");

    function close(result) {
      document.body.removeChild(overlay);
      resolve(result);
    }

    cancel.onclick = () => close({ action: "cancel" });
    overwrite.onclick = () => close({ action: "overwrite" });
    rename.onclick = () => close({ action: "rename", rename_to: input.value });

    overlay.onclick = (e) => {
      if (e.target === overlay) cancel.onclick();
    };

    card.appendChild(title);
    card.appendChild(msg);
    card.appendChild(inputWrap);
    buttons.appendChild(cancel);
    buttons.appendChild(rename);
    buttons.appendChild(overwrite);
    card.appendChild(buttons);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

export function showFilePickerModal(entriesOrFiles, current = "", opts = {}) {
  return new Promise((resolve) => {
    const mode = (opts?.mode === "multi") ? "multi" : "single";

    const normalizeEntries = (input) => {
      if (Array.isArray(input)) return { files: input.slice(), dirs: [] };
      const files = Array.isArray(input?.files) ? input.files.slice() : [];
      const dirs = Array.isArray(input?.dirs) ? input.dirs.slice() : [];
      return { files, dirs };
    };

    let entries = normalizeEntries(entriesOrFiles);

    const normPath = (p) =>
      String(p ?? "")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\/+$/, "")
        .trim();

    const normFile = (p) =>
      String(p ?? "")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .trim();

    const selectedFiles = new Set();
    const selectedFolders = new Set();

    const excludedFiles = new Set();
    const excludedFolders = new Set();

    const selectedFolderOrder = [];
    let targetFolder = "";

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.55)";
    overlay.style.zIndex = "999999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const card = document.createElement("div");
    card.style.width = "660px";
    card.style.maxWidth = "94vw";
    card.style.maxHeight = "84vh";
    card.style.background = "#1f1f1f";
    card.style.border = "1px solid #444";
    card.style.borderRadius = "12px";
    card.style.padding = "14px";
    card.style.color = "#eee";
    card.style.fontFamily = "sans-serif";
    card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "10px";

    const title = document.createElement("div");
    title.textContent = "Select CSV file (input/csv)";
    title.style.fontSize = "15px";
    title.style.fontWeight = "600";

    const searchRow = document.createElement("div");
    searchRow.style.display = "flex";
    searchRow.style.gap = "10px";
    searchRow.style.alignItems = "stretch";

    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search...";
    search.style.flex = "1 1 auto";
    search.style.height = "40px";
    search.style.padding = "10px";
    search.style.borderRadius = "10px";
    search.style.border = "1px solid #555";
    search.style.background = "#2b2b2b";
    search.style.color = "#eee";
    search.style.outline = "none";

    const inContentsBtn = document.createElement("button");
    inContentsBtn.type = "button";
    inContentsBtn.textContent = "In Contents?";
    inContentsBtn.title = "Search inside CSV contents (both columns)";
    inContentsBtn.style.flex = "0 0 auto";
    inContentsBtn.style.width = "120px";
    inContentsBtn.style.height = "40px";
    inContentsBtn.style.borderRadius = "10px";
    inContentsBtn.style.border = "1px solid #555";
    inContentsBtn.style.background = "#2b2b2b";
    inContentsBtn.style.color = "#eee";
    inContentsBtn.style.cursor = "pointer";
    inContentsBtn.style.userSelect = "none";
    inContentsBtn.style.whiteSpace = "nowrap";
    inContentsBtn.style.padding = "0 12px";
    inContentsBtn.style.fontSize = "12px";

    inContentsBtn._active = false;

    function setInContentsVisual() {
      if (inContentsBtn._active) {
        inContentsBtn.style.border = "1px solid #2d7a40";
        inContentsBtn.style.boxShadow = "0 0 0 1px rgba(45,122,64,0.35)";
        inContentsBtn.style.background = "#1f3a25";
      } else {
        inContentsBtn.style.border = "1px solid #555";
        inContentsBtn.style.boxShadow = "none";
        inContentsBtn.style.background = "#2b2b2b";
      }
    }
    setInContentsVisual();

    searchRow.appendChild(search);
    searchRow.appendChild(inContentsBtn);

    const list = document.createElement("div");
    list.style.flex = "1";
    list.style.overflow = "auto";
    list.style.border = "1px solid #333";
    list.style.borderRadius = "10px";
    list.style.background = "#181818";

    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.alignItems = "center";
    footer.style.justifyContent = "space-between";
    footer.style.gap = "8px";

    const leftFooter = document.createElement("div");
    leftFooter.style.display = "flex";
    leftFooter.style.alignItems = "center";
    leftFooter.style.gap = "8px";

    const rightFooter = document.createElement("div");
    rightFooter.style.display = "flex";
    rightFooter.style.alignItems = "center";
    rightFooter.style.gap = "8px";

    const addFilesBtn = document.createElement("button");
    addFilesBtn.textContent = "Add CSV File(s)";
    addFilesBtn.style.padding = "8px 10px";
    addFilesBtn.style.borderRadius = "10px";
    addFilesBtn.style.border = "1px solid #2b6cb0";
    addFilesBtn.style.background = "#1e3a8a";
    addFilesBtn.style.color = "#fff";
    addFilesBtn.style.cursor = "pointer";

    const createFolderBtn = document.createElement("button");
    createFolderBtn.textContent = "Create Folder";
    createFolderBtn.style.padding = "8px 10px";
    createFolderBtn.style.borderRadius = "10px";
    createFolderBtn.style.border = "1px solid #2b6cb0";
    createFolderBtn.style.background = "#1e3a8a";
    createFolderBtn.style.color = "#fff";
    createFolderBtn.style.cursor = "pointer";

    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.padding = "8px 10px";
    cancel.style.borderRadius = "10px";
    cancel.style.border = "1px solid #555";
    cancel.style.background = "#2b2b2b";
    cancel.style.color = "#eee";
    cancel.style.cursor = "pointer";

    const addBtn = document.createElement("button");
    addBtn.textContent = "Add";
    addBtn.style.padding = "8px 14px";
    addBtn.style.borderRadius = "10px";
    addBtn.style.border = "1px solid #1f7a3a";
    addBtn.style.background = "#14532d";
    addBtn.style.color = "#fff";
    addBtn.style.cursor = "pointer";

    function setAddEnabled(enabled) {
      const on = !!enabled;
      addBtn.disabled = !on;
      addBtn.style.opacity = on ? "1" : "0.45";
      addBtn.style.cursor = on ? "pointer" : "default";
      addBtn.style.filter = on ? "none" : "grayscale(0.7)";
    }
    setAddEnabled(false);

    const close = (val) => {
      if (overlay.parentNode) document.body.removeChild(overlay);
      resolve(val);
    };

    cancel.onclick = () => close(null);

    overlay.onclick = (e) => {
      if (e.target === overlay) cancel.onclick();
    };

    const expanded = new Set();
    expanded.add("");

    let busy = false;
    function setBusy(v) {
      busy = !!v;

      cancel.disabled = busy;
      cancel.style.opacity = busy ? "0.7" : "1";
      cancel.style.cursor = busy ? "default" : "pointer";

      if (mode === "multi") {
        addFilesBtn.disabled = busy;
        createFolderBtn.disabled = busy;
        addFilesBtn.style.opacity = busy ? "0.7" : "1";
        createFolderBtn.style.opacity = busy ? "0.7" : "1";
        addFilesBtn.style.cursor = busy ? "default" : "pointer";
        createFolderBtn.style.cursor = busy ? "default" : "pointer";

        addBtn.disabled = busy || addBtn.disabled;
        addBtn.style.opacity = (busy || addBtn.disabled) ? "0.7" : "1";
        addBtn.style.cursor = (busy || addBtn.disabled) ? "default" : "pointer";
      }
    }

    const isUnder = (child, parent) => {
      const c = normPath(child);
      const p = normPath(parent);
      if (!c || !p) return false;
      return c === p || c.startsWith(p + "/");
    };

    const isCoveredBySelectedFolder = (fileOrFolderPath) => {
      const p = normPath(fileOrFolderPath);
      if (!p) return false;
      for (const f of selectedFolders) {
        if (isUnder(p, f)) return true;
      }
      return false;
    };

    const isCoveredByExcludedFolder = (fileOrFolderPath) => {
      const p = normPath(fileOrFolderPath);
      if (!p) return false;
      for (const f of excludedFolders) {
        if (isUnder(p, f)) return true;
      }
      return false;
    };

    const isFolderEffectivelySelected = (folderPath) => {
      const p = normPath(folderPath);
      if (!p) return false;

      if (selectedFolders.has(p)) return true;

      if (isCoveredBySelectedFolder(p) && !isCoveredByExcludedFolder(p) && !excludedFolders.has(p)) {
        return true;
      }

      return false;
    };

    const isFileEffectivelySelected = (filePath) => {
      const f = normFile(filePath);
      if (!f) return false;

      if (selectedFiles.has(f)) return true;

      if (isCoveredBySelectedFolder(f) && !isCoveredByExcludedFolder(f) && !excludedFiles.has(f)) {
        return true;
      }

      return false;
    };

    function computeEffectiveFilesOrdered() {
      const out = [];
      const files = Array.isArray(entries?.files) ? entries.files : [];
      for (const fnRaw of files) {
        const fn = normFile(fnRaw);
        if (!fn) continue;

        if (selectedFiles.has(fn)) {
          out.push(fn);
          continue;
        }

        if (isCoveredBySelectedFolder(fn) && !isCoveredByExcludedFolder(fn) && !excludedFiles.has(fn)) {
          out.push(fn);
        }
      }
      const seen = new Set();
      return out.filter((f) => (seen.has(f) ? false : (seen.add(f), true)));
    }

    function updateAddButtonState() {
      if (mode !== "multi") return;

      const anyIntent = selectedFiles.size > 0 || selectedFolders.size > 0 || excludedFiles.size > 0 || excludedFolders.size > 0;
      setAddEnabled(anyIntent);
    }

    function toggleFileSelected(path) {
      const f = normFile(path);
      if (!f) return;

      const effective = isFileEffectivelySelected(f);

      if (selectedFiles.has(f)) {
        selectedFiles.delete(f);

        if (isCoveredBySelectedFolder(f) && !isCoveredByExcludedFolder(f)) {
          excludedFiles.add(f);
        } else {
          excludedFiles.delete(f);
        }

        updateAddButtonState();
        return;
      }

      if (effective && isCoveredBySelectedFolder(f) && !isCoveredByExcludedFolder(f)) {
        if (excludedFiles.has(f)) excludedFiles.delete(f);
        else excludedFiles.add(f);

        updateAddButtonState();
        return;
      }

      excludedFiles.delete(f);
      selectedFiles.add(f);
      updateAddButtonState();
    }

    function toggleFolderSelected(path) {
      const p = normPath(path);
      if (!p) return;

      const effective = isFolderEffectivelySelected(p);

      if (selectedFolders.has(p)) {
        selectedFolders.delete(p);

        const idx = selectedFolderOrder.indexOf(p);
        if (idx !== -1) selectedFolderOrder.splice(idx, 1);

        if (isCoveredBySelectedFolder(p) && !isCoveredByExcludedFolder(p)) {
          excludedFolders.add(p);
        } else {
          excludedFolders.delete(p);
        }

        if (targetFolder === p) {
          targetFolder = selectedFolderOrder.length ? selectedFolderOrder[selectedFolderOrder.length - 1] : "";
        }

        updateAddButtonState();
        return;
      }

      if (effective && isCoveredBySelectedFolder(p) && !isCoveredByExcludedFolder(p)) {
        if (excludedFolders.has(p)) excludedFolders.delete(p);
        else excludedFolders.add(p);

        updateAddButtonState();
        return;
      }

      excludedFolders.delete(p);
      selectedFolders.add(p);

      const idx = selectedFolderOrder.indexOf(p);
      if (idx !== -1) selectedFolderOrder.splice(idx, 1);
      selectedFolderOrder.push(p);
      targetFolder = p;

      updateAddButtonState();
    }

    function pickFilesFromDialog() {
      return new Promise((resolvePick) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = ".csv,text/csv";
        input.onchange = () => resolvePick(Array.from(input.files || []));
        input.click();
      });
    }

    async function refreshEntriesIfPossible() {
      const getEntries = opts?.getEntries;
      if (typeof getEntries !== "function") return;
      try {
        const next = await getEntries();
        entries = normalizeEntries(next);
      } catch (_) { }
    }

    addFilesBtn.onclick = async (e) => {
      e.stopPropagation?.();
      if (busy) return;

      const onAddFiles = opts?.onAddFiles;
      if (typeof onAddFiles !== "function") return;

      const picked = await pickFilesFromDialog();
      if (!picked || !picked.length) return;

      setBusy(true);
      try {
        await onAddFiles(picked, targetFolder || "");
        await refreshEntriesIfPossible();
        render(search.value, inContentsBtn._active);
      } finally {
        setBusy(false);
      }
    };

    createFolderBtn.onclick = async (e) => {
      e.stopPropagation?.();
      if (busy) return;

      const onCreateFolder = opts?.onCreateFolder;
      if (typeof onCreateFolder !== "function") return;

      const name = window.prompt("Create folder (relative to input/csv):", targetFolder ? `${targetFolder}/` : "");
      const raw = String(name ?? "").trim();
      if (!raw) return;

      const p = normPath(raw);
      if (!p) return;

      setBusy(true);
      try {
        await onCreateFolder(p);
        await refreshEntriesIfPossible();

        const parts = p.split("/").filter(Boolean);
        let acc = "";
        for (let i = 0; i < parts.length; i++) {
          acc = acc ? `${acc}/${parts[i]}` : parts[i];
          expanded.add(acc);
        }

        render(search.value, inContentsBtn._active);
      } finally {
        setBusy(false);
      }
    };

    addBtn.onclick = (e) => {
      e.stopPropagation?.();
      if (busy) return;
      if (mode !== "multi") return;

      const out = {
        mode: "multi",

        files: Array.from(selectedFiles),
        folders: Array.from(selectedFolders),

        exclude_files: Array.from(excludedFiles),
        exclude_folders: Array.from(excludedFolders),

        effective_files: computeEffectiveFilesOrdered(),
      };

      close(out);
    };

    function renderEmpty(text) {
      list.innerHTML = "";
      const empty = document.createElement("div");
      empty.textContent = text;
      empty.style.padding = "10px";
      empty.style.opacity = "0.8";
      list.appendChild(empty);
    }

    function makeCheckbox(checked) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!checked;
      cb.style.width = "16px";
      cb.style.height = "16px";
      cb.style.margin = "0";
      cb.style.cursor = "pointer";
      cb.style.flex = "0 0 auto";
      cb.onclick = (e) => e.stopPropagation();
      cb.onmousedown = (e) => e.stopPropagation();
      return cb;
    }

    function renderRowBase({
      isFolder,
      label,
      subLabel = "",
      depth = 0,
      isActive = false,
      isSelected = false,
      isTarget = false,
      canExpand = false,
      onToggle,
      onOpenOrPick,
    }) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.padding = "10px 12px";
      row.style.borderBottom = "1px solid #222";
      row.style.whiteSpace = "nowrap";
      row.style.overflow = "hidden";
      row.style.paddingLeft = `${12 + depth * 16}px`;

      if (isActive) {
        row.style.background = "#2a2a2a";
        row.style.fontWeight = "600";
      }

      if (isSelected) {
        row.style.background = "#223044";
        row.style.boxShadow = "inset 0 0 0 1px rgba(90,160,255,0.25)";
      }

      if (isTarget) {
        row.style.boxShadow = "inset 0 0 0 1px rgba(90,160,255,0.45)";
      }

      row.onmouseenter = () => {
        if (isActive) row.style.background = "#2f2f2f";
        else if (isSelected) row.style.background = "#273754";
        else row.style.background = "#232323";
      };
      row.onmouseleave = () => {
        if (isActive) row.style.background = "#2a2a2a";
        else if (isSelected) row.style.background = "#223044";
        else row.style.background = "transparent";
      };

      if (mode === "multi") {
        const cb = makeCheckbox(isSelected);
        cb.onchange = (e) => {
          e.stopPropagation();
          onToggle?.();
        };
        row.appendChild(cb);
      } else {
        const spacer = document.createElement("div");
        spacer.style.width = "16px";
        spacer.style.flex = "0 0 auto";
        spacer.style.opacity = "0";
        row.appendChild(spacer);
      }

      const clickZone = document.createElement("div");
      clickZone.style.display = "flex";
      clickZone.style.alignItems = "center";
      clickZone.style.gap = "8px";
      clickZone.style.flex = "1 1 auto";
      clickZone.style.minWidth = "0";
      clickZone.style.cursor = "pointer";
      clickZone.onclick = (e) => {
        e.stopPropagation?.();
        onOpenOrPick?.();
      };

      const icon = document.createElement("span");
      icon.textContent = isFolder ? "📁" : "📄";
      icon.style.opacity = "0.9";
      icon.style.flex = "0 0 auto";

      const nameWrap = document.createElement("div");
      nameWrap.style.display = "flex";
      nameWrap.style.flexDirection = "column";
      nameWrap.style.gap = "2px";
      nameWrap.style.minWidth = "0";
      nameWrap.style.flex = "1 1 auto";

      const nameSpan = document.createElement("div");
      nameSpan.textContent = label;
      nameSpan.style.overflow = "hidden";
      nameSpan.style.textOverflow = "ellipsis";

      nameWrap.appendChild(nameSpan);

      if (subLabel) {
        const sub = document.createElement("div");
        sub.textContent = subLabel;
        sub.style.opacity = "0.6";
        sub.style.fontSize = "12px";
        sub.style.overflow = "hidden";
        sub.style.textOverflow = "ellipsis";
        sub.style.whiteSpace = "nowrap";
        nameWrap.appendChild(sub);
      }

      clickZone.appendChild(icon);
      clickZone.appendChild(nameWrap);
      row.appendChild(clickZone);

      if (isFolder) {
        const hint = document.createElement("span");
        hint.style.flex = "0 0 auto";
        hint.style.opacity = "0.65";
        hint.style.fontSize = "12px";
        hint.textContent = canExpand ? "" : "(empty)";
        row.appendChild(hint);
      } else {
        const spacer2 = document.createElement("span");
        spacer2.style.flex = "0 0 auto";
        spacer2.style.opacity = "0.65";
        spacer2.style.fontSize = "12px";
        spacer2.textContent = "";
        row.appendChild(spacer2);
      }

      return row;
    }

    function buildTree(dirs, files) {
      const root = { name: "", path: "", dirs: new Map(), files: [] };

      for (const dRaw of (dirs || [])) {
        const d = normPath(dRaw);
        if (!d) continue;
        const parts = d.split("/").filter(Boolean);
        let node = root;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const dirPath = parts.slice(0, i + 1).join("/");
          if (!node.dirs.has(part)) {
            node.dirs.set(part, { name: part, path: dirPath, dirs: new Map(), files: [] });
          }
          node = node.dirs.get(part);
        }
      }

      for (const fRaw of (files || [])) {
        const f = normFile(fRaw);
        if (!f) continue;
        const parts = f.split("/").filter(Boolean);
        if (!parts.length) continue;

        let node = root;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isLast = (i === parts.length - 1);

          if (isLast) {
            node.files.push({
              name: part,
              path: parts.slice(0, i).join("/") ? (parts.slice(0, i).join("/") + "/" + part) : part
            });
          } else {
            const dirPath = parts.slice(0, i + 1).join("/");
            if (!node.dirs.has(part)) {
              node.dirs.set(part, { name: part, path: dirPath, dirs: new Map(), files: [] });
            }
            node = node.dirs.get(part);
          }
        }
      }

      return root;
    }

    function sortTree(node) {
      node.files.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
      const dirsArr = Array.from(node.dirs.values());
      dirsArr.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      node._dirsSorted = dirsArr;
      for (const d of dirsArr) sortTree(d);
    }

    function flattenTreeVisible(node, out, depth = 0) {
      const dirs = node._dirsSorted || Array.from(node.dirs.values());
      for (const d of dirs) {
        const canExpand = (d.dirs.size > 0) || ((d.files || []).length > 0);
        out.push({ kind: "dir", depth, name: d.name, path: d.path, node: d, canExpand });

        if (expanded.has(d.path) && canExpand) {
          flattenTreeVisible(d, out, depth + 1);
        }
      }

      for (const f of (node.files || [])) {
        out.push({ kind: "file", depth, name: f.name, path: f.path });
      }
    }

    function ensurePathExpandedForCurrent(cur) {
      const p = normFile(cur);
      if (!p || !p.includes("/")) return;
      const parts = p.split("/").filter(Boolean);
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? (acc + "/" + parts[i]) : parts[i];
        expanded.add(acc);
      }
    }

    let renderSeq = 0;

    async function render(filterText, inContentsMode) {
      const mySeq = ++renderSeq;

      const qRaw = (filterText || "").trim();
      const q = qRaw.toLowerCase();

      ensurePathExpandedForCurrent(current);

      if (!inContentsMode) {
        if (q) {
          list.innerHTML = "";
          const shown = (entries.files || []).filter((fn) => String(fn).toLowerCase().includes(q));
          if (!shown.length) {
            renderEmpty("No matching files.");
            return;
          }

          for (const fn of shown) {
            const isActive = (String(fn) === String(current));
            const isSel = mode === "multi" ? isFileEffectivelySelected(fn) : false;

            const row = renderRowBase({
              isFolder: false,
              label: fn,
              depth: 0,
              isActive,
              isSelected: isSel,
              isTarget: false,
              canExpand: false,
              onToggle: mode === "multi" ? () => toggleFileSelected(fn) : null,
              onOpenOrPick: () => {
                if (mode === "single") close(fn);
                else close({ mode: "single", file: fn });
              },
            });

            if (mode === "multi") {
              const cb = row.querySelector('input[type="checkbox"]');
              if (cb) {
                cb.onchange = (e) => {
                  e.stopPropagation();
                  toggleFileSelected(fn);
                  render(search.value, inContentsBtn._active);
                };
              }
            }

            list.appendChild(row);
          }

          return;
        }

        list.innerHTML = "";

        const tree = buildTree(entries.dirs || [], entries.files || []);
        sortTree(tree);

        const visible = [];
        flattenTreeVisible(tree, visible, 0);

        if (!visible.length) {
          renderEmpty("No .csv files found in input/csv");
          return;
        }

        for (const entry of visible) {
          if (entry.kind === "dir") {
            const isOpen = expanded.has(entry.path);
            const canExpand = !!entry.canExpand;

            if (!canExpand && mode !== "multi") continue;

            const label = entry.name;
            const prefix = canExpand ? (isOpen ? "▼ " : "▶ ") : "";

            const isSel = mode === "multi" ? isFolderEffectivelySelected(entry.path) : false;
            const isT = mode === "multi" ? (normPath(entry.path) === normPath(targetFolder)) : false;

            const row = renderRowBase({
              isFolder: true,
              label: `${prefix}${label}`,
              depth: entry.depth,
              isActive: false,
              isSelected: isSel,
              isTarget: isT,
              canExpand,
              onToggle: mode === "multi" ? () => toggleFolderSelected(entry.path) : null,
              onOpenOrPick: () => {
                if (!canExpand) return;
                if (expanded.has(entry.path)) expanded.delete(entry.path);
                else expanded.add(entry.path);
                render(search.value, inContentsBtn._active);
              },
            });

            if (mode === "multi") {
              const cb = row.querySelector('input[type="checkbox"]');
              if (cb) {
                cb.onchange = (e) => {
                  e.stopPropagation();
                  toggleFolderSelected(entry.path);
                  render(search.value, inContentsBtn._active);
                };
              }
            }

            list.appendChild(row);
            continue;
          }

          const isActive = (String(entry.path) === String(current));
          const isSel = mode === "multi" ? isFileEffectivelySelected(entry.path) : false;

          const row = renderRowBase({
            isFolder: false,
            label: entry.name,
            subLabel: entry.path.includes("/") ? entry.path : "",
            depth: entry.depth,
            isActive,
            isSelected: isSel,
            isTarget: false,
            canExpand: false,
            onToggle: mode === "multi" ? () => toggleFileSelected(entry.path) : null,
            onOpenOrPick: () => {
              if (mode === "single") close(entry.path);
              else close({ mode: "single", file: entry.path });
            },
          });

          if (mode === "multi") {
            const cb = row.querySelector('input[type="checkbox"]');
            if (cb) {
              cb.onchange = (e) => {
                e.stopPropagation();
                toggleFileSelected(entry.path);
                render(search.value, inContentsBtn._active);
              };
            }
          }

          list.appendChild(row);
        }

        return;
      }

      if (!qRaw) {
        list.innerHTML = "";
        for (const fn of (entries.files || [])) {
          const isActive = (String(fn) === String(current));
          const isSel = mode === "multi" ? isFileEffectivelySelected(fn) : false;

          const row = renderRowBase({
            isFolder: false,
            label: fn,
            depth: 0,
            isActive,
            isSelected: isSel,
            isTarget: false,
            canExpand: false,
            onToggle: mode === "multi" ? () => toggleFileSelected(fn) : null,
            onOpenOrPick: () => {
              if (mode === "single") close(fn);
              else close({ mode: "single", file: fn });
            },
          });

          if (mode === "multi") {
            const cb = row.querySelector('input[type="checkbox"]');
            if (cb) {
              cb.onchange = (e) => {
                e.stopPropagation();
                toggleFileSelected(fn);
                render(search.value, inContentsBtn._active);
              };
            }
          }

          list.appendChild(row);
        }
        return;
      }

      renderEmpty("Searching contents...");

      const results = [];
      for (const fn of (entries.files || [])) {
        if (mySeq !== renderSeq) return;

        let hits = [];
        try {
          hits = await _vslinxFindHitsInFile(fn, qRaw);
        } catch (_) {
          hits = [];
        }

        if (hits.length) results.push({ fn, hits });
      }

      if (mySeq !== renderSeq) return;

      list.innerHTML = "";
      if (!results.length) {
        renderEmpty("No matching files.");
        return;
      }

      for (const r of results) {
        const isActive = (String(r.fn) === String(current));
        const isSel = mode === "multi" ? isFileEffectivelySelected(r.fn) : false;

        const row = renderRowBase({
          isFolder: false,
          label: r.fn,
          subLabel: Array.isArray(r.hits) && r.hits.length ? `(${r.hits.join(", ")})` : "",
          depth: 0,
          isActive,
          isSelected: isSel,
          isTarget: false,
          canExpand: false,
          onToggle: mode === "multi" ? () => toggleFileSelected(r.fn) : null,
          onOpenOrPick: () => {
            if (mode === "single") close(r.fn);
            else close({ mode: "single", file: r.fn });
          },
        });

        if (mode === "multi") {
          const cb = row.querySelector('input[type="checkbox"]');
          if (cb) {
            cb.onchange = (e) => {
              e.stopPropagation();
              toggleFileSelected(r.fn);
              render(search.value, inContentsBtn._active);
            };
          }
        }

        list.appendChild(row);
      }
    }

    let debounceT = null;
    function scheduleRender() {
      if (debounceT) clearTimeout(debounceT);
      const delay = inContentsBtn._active ? 180 : 0;
      debounceT = setTimeout(() => {
        render(search.value, inContentsBtn._active);
      }, delay);
    }

    search.oninput = scheduleRender;

    inContentsBtn.onclick = (e) => {
      e.stopPropagation?.();
      inContentsBtn._active = !inContentsBtn._active;
      setInContentsVisual();
      scheduleRender();
    };

    if (mode === "multi") {
      leftFooter.appendChild(addFilesBtn);
      leftFooter.appendChild(createFolderBtn);

      rightFooter.appendChild(cancel);
      rightFooter.appendChild(addBtn);

      footer.appendChild(leftFooter);
      footer.appendChild(rightFooter);
    } else {
      rightFooter.appendChild(cancel);
      footer.appendChild(leftFooter);
      footer.appendChild(rightFooter);

      leftFooter.style.visibility = "hidden";
      leftFooter.style.pointerEvents = "none";
      leftFooter.style.width = "0";
    }

    card.appendChild(title);
    card.appendChild(searchRow);
    card.appendChild(list);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    updateAddButtonState();
    render("", false);
    setTimeout(() => search.focus(), 0);
  });
}

export function showKeyPickerMenu(items, event, titleText = "Selection", opts = {}) {
  return new Promise((resolve) => {
    const ev = event?.originalEvent || event?.detail?.event || event;
    const cx = typeof ev?.clientX === "number" ? ev.clientX : 0;
    const cy = typeof ev?.clientY === "number" ? ev.clientY : 0;

    const initialSelected = Array.isArray(opts?.selected) ? opts.selected.map(String) : [];

    let multiMode = false;
    const selected = new Set(initialSelected);

    selected.delete("(None)");

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "transparent";
    overlay.style.zIndex = "1000000";

    const card = document.createElement("div");
    card.style.position = "absolute";
    card.style.left = "0px";
    card.style.top = "0px";
    card.style.width = "340px";
    card.style.maxWidth = "86vw";
    card.style.background = "#1f1f1f";
    card.style.border = "1px solid #444";
    card.style.borderRadius = "12px";
    card.style.padding = "10px";
    card.style.color = "#eee";
    card.style.fontFamily = "sans-serif";
    card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "8px";

    const title = document.createElement("div");
    title.textContent = titleText;
    title.style.fontSize = "13px";
    title.style.fontWeight = "600";
    title.style.opacity = "0.95";

    const filterRow = document.createElement("div");
    filterRow.style.display = "flex";
    filterRow.style.gap = "8px";
    filterRow.style.alignItems = "center";

    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Filter";
    search.style.flex = "1";
    search.style.padding = "9px 10px";
    search.style.borderRadius = "10px";
    search.style.border = "1px solid #555";
    search.style.background = "#2b2b2b";
    search.style.color = "#eee";
    search.style.outline = "none";

    const modeBtn = document.createElement("button");
    modeBtn.style.width = "36px";
    modeBtn.style.height = "36px";
    modeBtn.style.borderRadius = "10px";
    modeBtn.style.border = "1px solid #555";
    modeBtn.style.background = "#2b2b2b";
    modeBtn.style.color = "#eee";
    modeBtn.style.cursor = "pointer";
    modeBtn.style.display = "grid";
    modeBtn.style.placeItems = "center";
    modeBtn.style.padding = "0";

    function setModeButtonVisual() {
      if (!multiMode) {
        modeBtn.style.background = "#2b2b2b";
        modeBtn.style.borderColor = "#555";
        modeBtn.textContent = "⧉";
        modeBtn.title = "Enable multi-select";
      } else {
        modeBtn.style.background = "#1f3a25";
        modeBtn.style.borderColor = "#2d7a40";
        modeBtn.textContent = "✓";
        modeBtn.title = "Confirm selection";
      }
    }

    setModeButtonVisual();

    modeBtn.onclick = (e) => {
      e.preventDefault?.();
      e.stopPropagation?.();

      if (!multiMode) {
        multiMode = true;
        selected.delete("(None)");
        setModeButtonVisual();
        render(search.value);
        return;
      }

      const chosen = Array.from(selected)
        .map(String)
        .filter((s) => s && s !== "(None)");

      cleanup();
      if (overlay.parentNode) document.body.removeChild(overlay);

      if (chosen.length === 0) {
        resolve({ mode: "clear" });
        return;
      }
      if (chosen.length === 1) {
        const one = chosen[0];
        const pickedItem = (items || []).find((it) => String(it?.content ?? "") === one) || { content: one };
        resolve({ mode: "single", picked: pickedItem });
        return;
      }
      resolve({ mode: "multi", selected: chosen });
    };

    filterRow.appendChild(search);
    filterRow.appendChild(modeBtn);

    const clearWrap = document.createElement("div");
    clearWrap.style.marginTop = "2px";
    clearWrap.style.marginBottom = "6px";

    const clearBtnRow = document.createElement("div");
    clearBtnRow.style.display = "flex";
    clearBtnRow.style.alignItems = "center";
    clearBtnRow.style.gap = "8px";
    clearBtnRow.style.padding = "9px 10px";
    clearBtnRow.style.border = "1px solid #333";
    clearBtnRow.style.borderRadius = "10px";
    clearBtnRow.style.background = "#151515";
    clearBtnRow.style.cursor = "pointer";
    clearBtnRow.style.userSelect = "none";

    const clearLabel = document.createElement("div");
    clearLabel.textContent = "Clear";
    clearLabel.style.flex = "1";
    clearLabel.style.opacity = "0.95";

    const clearMark = document.createElement("div");
    clearMark.style.width = "18px";
    clearMark.style.minWidth = "18px";
    clearMark.style.textAlign = "center";
    clearMark.style.opacity = "0.9";

    clearBtnRow.onmouseenter = () => (clearBtnRow.style.background = "#1f1f1f");
    clearBtnRow.onmouseleave = () => (clearBtnRow.style.background = "#151515");

    clearBtnRow.onclick = (e) => {
      e.preventDefault?.();
      e.stopPropagation?.();

      if (selected.size === 0) return;

      selected.clear();

      if (!multiMode) {
        cleanup();
        if (overlay.parentNode) document.body.removeChild(overlay);
        resolve({ mode: "clear" });
        return;
      }

      render(search.value);
    };

    clearBtnRow.appendChild(clearLabel);
    clearBtnRow.appendChild(clearMark);
    clearWrap.appendChild(clearBtnRow);

    const list = document.createElement("div");
    list.style.maxHeight = "320px";
    list.style.overflow = "auto";
    list.style.border = "1px solid #333";
    list.style.borderRadius = "10px";
    list.style.background = "#181818";

    const close = () => {
      cleanup();
      if (overlay.parentNode) document.body.removeChild(overlay);
      resolve(null);
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") close();
      if (multiMode && (e.key === "Enter" || e.key === "Return")) {
        modeBtn.onclick(e);
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    const cleanup = () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };

    function render(filterText) {
      clearMark.textContent = selected.size ? "↺" : "";
      clearBtnRow.style.opacity = selected.size ? "1" : "0.55";
      clearBtnRow.style.cursor = selected.size ? "pointer" : "default";

      list.innerHTML = "";
      const f = (filterText || "").trim().toLowerCase();

      const shown = (items || []).filter((it) => {
        const t = String(it?.content ?? "");
        if (multiMode && t === "(None)") return false;
        return !f || t.toLowerCase().includes(f);
      });

      if (!shown.length) {
        const empty = document.createElement("div");
        empty.textContent = "No matches.";
        empty.style.padding = "10px";
        empty.style.opacity = "0.8";
        list.appendChild(empty);
        return;
      }

      for (const it of shown) {
        const content = String(it?.content ?? "");
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.padding = "9px 10px";
        row.style.cursor = "pointer";
        row.style.borderBottom = "1px solid #222";
        row.style.whiteSpace = "nowrap";
        row.style.overflow = "hidden";

        const label = document.createElement("div");
        label.textContent = content;
        label.style.flex = "1";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";

        const mark = document.createElement("div");
        mark.style.width = "18px";
        mark.style.minWidth = "18px";
        mark.style.textAlign = "center";
        mark.style.opacity = "0.95";

        const isSel = selected.has(content);
        mark.textContent = isSel ? "✓" : "";
        row.style.background = isSel ? "#242e25" : "transparent";

        row.onmouseenter = () => {
          row.style.background = isSel ? "#283328" : "#232323";
        };
        row.onmouseleave = () => {
          const nowSel = selected.has(content);
          row.style.background = nowSel ? "#242e25" : "transparent";
        };

        row.onclick = (e) => {
          e.preventDefault?.();
          e.stopPropagation?.();

          if (!multiMode) {
            cleanup();
            if (overlay.parentNode) document.body.removeChild(overlay);
            resolve({ mode: "single", picked: it });
            return;
          }

          if (selected.has(content)) selected.delete(content);
          else selected.add(content);

          render(search.value);
        };

        row.appendChild(label);
        row.appendChild(mark);
        list.appendChild(row);
      }
    }

    search.oninput = () => render(search.value);

    card.appendChild(title);
    card.appendChild(filterRow);
    card.appendChild(clearWrap);
    card.appendChild(list);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    render("");

    const pad = 8;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;

    const rect = card.getBoundingClientRect();
    let left = cx;
    let top = cy;

    if (left + rect.width + pad > vw) left = Math.max(pad, vw - rect.width - pad);
    if (top + rect.height + pad > vh) top = Math.max(pad, vh - rect.height - pad);

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;

    setTimeout(() => {
      search.focus();
      search.select();
    }, 0);
  });
}