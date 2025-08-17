import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

app.registerExtension({
  name: "VSLinx.ImagePickerGridPreview",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!["vsLinx_LoadSelectedImagesList", "vsLinx_LoadSelectedImagesBatch"].includes(nodeData?.name)) return;

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

    const getPathsWidget = (node) => node.widgets?.find(w => w.name === "selected_paths");

    const ensureProps = (node) => {
      node.properties = node.properties || {};
      if (typeof node.properties.max_images === "undefined") {
        node.addProperty?.("max_images", 0);
        if (typeof node.properties.max_images === "undefined") node.properties.max_images = 0;
      }
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

    async function previewFromRels(node, rels) {
      const imgs = [];
      for (const rel of rels) {
        try { imgs.push(await loadImg(viewURLFromRel(rel))); }
        catch (e) { console.warn("Preview load failed:", rel, e); }
      }
      node.imgs = imgs.length ? imgs : null;
      if (imgs.length > 1 && (!node.size || node.size[1] < 220)) {
        node.size = [node.size?.[0] ?? 210, 240];
      }
      node.setDirtyCanvas(true, true);
    }

    async function syncToCap(node) {
      ensureProps(node);

      const w = getPathsWidget(node);
      if (w) {
        w.hidden = true;
        w.draw = () => {};
        w.computeSize = () => [0, 0];
      }

      const all = readRels(node);
      if (!all.length) {
        node.imgs = null;
        node.setDirtyCanvas(true, true);
        return;
      }

      const cap = getMax(node);
      const eff = cap === Infinity ? all : all.slice(0, cap);

      writeRels(node, eff);

      await previewFromRels(node, eff);
    }

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);

      ensureProps(this);

      const pathsWidget = getPathsWidget(this);
      if (pathsWidget) {
        pathsWidget.hidden = true;
        pathsWidget.draw = () => {};
        pathsWidget.computeSize = () => [0, 0];
      }

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
          const imgs = [];

          for (const f of take) {
            const form = new FormData();
            form.append("image", f, f.name);
            const resp = await api.fetchApi("/upload/image", { method: "POST", body: form });
            if (!resp.ok) { console.error("Upload failed", f.name, resp.status); continue; }
            const data = await resp.json();
            const rel = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
            rels.push(rel);

            const url = api.apiURL(`/view?${new URLSearchParams({
              filename: data.name,
              type: data.type ?? "input",
              subfolder: data.subfolder ?? "",
            }).toString()}`);

            try { imgs.push(await loadImg(url)); }
            catch (e) { console.warn("Preview load failed:", url, e); }
          }

          writeRels(this, rels);

          this.imgs = imgs.length ? imgs : null;
          if (imgs.length > 1 && (!this.size || this.size[1] < 220)) {
            this.size = [this.size?.[0] ?? 210, 240];
          }
          this.setDirtyCanvas(true, true);
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
      return r;
    };

    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (...args) {
      const r = origConfigure?.apply(this, args);
      ensureProps(this);
      setTimeout(() => syncToCap(this), 0);
      return r;
    };
  },
});
