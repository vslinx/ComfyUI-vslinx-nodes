import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

app.registerExtension({
  name: "VSLinx.ImagePickerGridPreview",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!["vsLinx_LoadSelectedImagesList", "vsLinx_LoadSelectedImagesBatch"].includes(nodeData?.name)) return;

    const FILENAME_OPTIONS = ["full filename", "deduped filename"];

    const origOnConnectInput = nodeType.prototype.onConnectInput;
    nodeType.prototype.onConnectInput = function (slot, type, output, originSlot) {
      const inp = this.inputs?.[slot];
      if (inp && inp.name === "selected_paths") return false;
      return origOnConnectInput ? origOnConnectInput.apply(this, arguments) : true;
    };

    const parseList = (raw) => {
      if (!raw) return [];
      try {
        const j = JSON.parse(raw);
        return Array.isArray(j) ? j.map(String) : [];
      } catch {
        return String(raw).split("\n").map(s => s.trim()).filter(Boolean);
      }
    };

    const dedupPreserve = (arr) => {
      const seen = new Set();
      const out = [];
      for (const x of arr) if (!seen.has(x)) { seen.add(x); out.push(x); }
      return out;
    };

    const getPathsWidget   = (node) => node.widgets?.find(w => w.name === "selected_paths");
    const getFailWidget    = (node) => node.widgets?.find(w => w.name === "fail_if_empty");
    const getNameModeWidget= (node) => node.widgets?.find(w => w.name === "filename_handling");

    const hideWidget = (w) => {
      if (!w) return;
      w.hidden = true;
      w.draw = () => {};
      w.computeSize = () => [0, 0];
    };

    const ensureEnumProperty = (node, name, def, values) => {
      node.properties = node.properties || {};

      if (typeof node.properties[name] === "undefined") {
        node.addProperty?.(name, def, "enum", { values });
        if (typeof node.properties[name] === "undefined") node.properties[name] = def;
      }

      if (!values.includes(node.properties[name])) {
        node.properties[name] = def;
      }

      node.properties_info = node.properties_info || {};
      node.properties_info[name] = { type: "enum", values };

      const ctor = node.constructor;
      if (ctor) {
        ctor.properties_info = ctor.properties_info || {};
        ctor.properties_info[name] = { type: "enum", values };
      }
    };

    const ensureProps = (node) => {
      node.properties = node.properties || {};

      if (typeof node.properties.max_images === "undefined") {
        node.addProperty?.("max_images", 0);
        if (typeof node.properties.max_images === "undefined") node.properties.max_images = 0;
      }
      if (typeof node.properties.fail_if_empty === "undefined") {
        node.addProperty?.("fail_if_empty", true);
        if (typeof node.properties.fail_if_empty === "undefined") node.properties.fail_if_empty = true;
      }

      ensureEnumProperty(node, "filename_handling", "full filename", FILENAME_OPTIONS);
    };

    const syncHiddenInputsFromProps = (node) => {
      const p  = getPathsWidget(node);
      const f  = getFailWidget(node);
      const nm = getNameModeWidget(node);

      hideWidget(p);
      hideWidget(f);
      hideWidget(nm);

      if (f)  f.value  = !!node.properties.fail_if_empty;
      if (nm) nm.value = String(node.properties.filename_handling || "full filename");
    };

    const getMax = (node) => {
      const v = Number(node?.properties?.max_images);
      return Number.isFinite(v) && v > 0 ? Math.floor(v) : Infinity;
    };

    const viewURLFromRel = (rel) => {
      const parts = (rel || "").split("/");
      const filename = parts.pop();
      const subfolder = parts.join("/");
      const params = new URLSearchParams({ filename, type: "input", subfolder });
      return api.apiURL(`/view?${params.toString()}`);
    };

    const loadImg = (url) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
      });

    const writeRels = (node, rels) => {
      const json = JSON.stringify(rels);
      const w = getPathsWidget(node);
      if (w) w.value = json;
      node.properties.selected_paths = json;
    };

    const readRels = (node) => {
      let raw = node?.properties?.selected_paths;
      if (!raw) {
        const w = getPathsWidget(node);
        if (w && typeof w.value === "string" && w.value.trim()) raw = w.value;
      }
      return parseList(raw || "");
    };

    async function existsOnServer(rel, retries = 2, baseTimeout = 200) {
      const url = viewURLFromRel(rel) + `&cb=${Date.now()}`;
      for (let i = 0; i <= retries; i++) {
        const timeout = baseTimeout * (i + 1);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          let resp = await fetch(url, { method: "HEAD", cache: "no-store", signal: controller.signal });
          clearTimeout(timer);
          if (resp.ok) return true;
          if (resp.status === 405) {
            const controller2 = new AbortController();
            const timer2 = setTimeout(() => controller2.abort(), timeout);
            resp = await fetch(url, { method: "GET", cache: "no-store", signal: controller2.signal });
            clearTimeout(timer2);
            if (resp.ok) return true;
          }
        } catch {
          // ignore and retry
        }
      }
      return false;
    }

    async function filterExistingRels(rels, concurrency = 4) {
      const kept = [];
      let idx = 0;
      const workers = Array(Math.min(concurrency, rels.length)).fill(0).map(async () => {
        while (true) {
          const i = idx++;
          if (i >= rels.length) break;
          const rel = rels[i];
          if (await existsOnServer(rel)) kept.push(rel);
        }
      });
      await Promise.all(workers);
      return kept;
    }

    async function previewFromRels(node, rels) {
      const imgs = [];
      await Promise.allSettled(rels.map(async (rel) => {
        const url = viewURLFromRel(rel);
        try {
          const img = await loadImg(url);
          imgs.push(img);
        } catch {
          // unsupported codec / blocked / transient – ignore
        }
      }));
      node.imgs = imgs.length ? imgs : null;
      if (imgs.length > 1 && (!node.size || node.size[1] < 220)) {
        node.size = [node.size?.[0] ?? 210, 240];
      }
      node.setDirtyCanvas(true, true);
    }

    async function syncToCap(node) {
      ensureProps(node);
      syncHiddenInputsFromProps(node);

      const all = dedupPreserve(readRels(node));
      if (!all.length) {
        node.imgs = null;
        node._missingAny = false;
        node.setDirtyCanvas(true, true);
        return;
      }

      const cap = getMax(node);
      const capped = cap === Infinity ? all : all.slice(0, cap);

      const kept = await filterExistingRels(capped, 4);

      previewFromRels(node, kept);

      writeRels(node, kept);
      node._missingAny = kept.length < capped.length;
    }

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);
      ensureProps(this);
      syncHiddenInputsFromProps(this);

      const pathsWidget = getPathsWidget(this);
      hideWidget(pathsWidget);

      const pickBtn = this.addWidget("button", "Select images", null, () => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = "image/*";
        input.style.display = "none";
        document.body.appendChild(input);

        input.addEventListener("change", async () => {
          const files = Array.from(input.files || []);
          document.body.removeChild(input);
          if (!files.length) return;

          const cap = getMax(this);
          const take = cap === Infinity ? files : files.slice(0, cap);

          const rels = [];
          for (const f of take) {
            const form = new FormData();
            form.append("image", f, f.name);
            const resp = await api.fetchApi("/upload/image", { method: "POST", body: form });
            if (!resp.ok) {
              console.error("Upload failed", f.name, resp.status, resp.statusText);
              continue;
            }
            const data = await resp.json();
            const rel = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
            rels.push(rel);
          }

          const dedup = dedupPreserve(rels);

          const kept = await filterExistingRels(dedup, 4);

          previewFromRels(this, kept);

          writeRels(this, kept);
          this._missingAny = kept.length < dedup.length;
        });

        input.click();
      });

      if (this.widgets) {
        const bi = this.widgets.indexOf(pickBtn);
        if (bi > 0) { this.widgets.splice(bi, 1); this.widgets.splice(0, 0, pickBtn); }
      }

      requestAnimationFrame(() => syncToCap(this));
      return r;
    };

    const origOnPropertyChanged = nodeType.prototype.onPropertyChanged;
    nodeType.prototype.onPropertyChanged = function (name, value) {
      const r = origOnPropertyChanged?.apply(this, arguments);
      if (name === "max_images") {
        syncToCap(this);
      }
      if (name === "fail_if_empty") {
        const fw = getFailWidget(this);
        if (fw) fw.value = !!value;
        this.properties.fail_if_empty = !!value;
      }
      if (name === "filename_handling") {
        const nm = getNameModeWidget(this);
        const pick = FILENAME_OPTIONS.includes(value) ? value : "full filename";
        this.properties.filename_handling = pick;
        if (nm) nm.value = pick;
      }
      return r;
    };

    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (...args) {
      const r = origConfigure?.apply(this, args);
      ensureProps(this);
      setTimeout(() => { syncHiddenInputsFromProps(this); syncToCap(this); }, 0);
      return r;
    };
  },
});
