import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

app.registerExtension({
  name: "VSLinx.LoadLastGeneratedImage",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== "vsLinx_LoadLastGeneratedImage") return;

    const hideWidget = (w) => {
      if (!w) return;
      w.hidden = true;
      w.draw = () => {};
      w.computeSize = () => [0, 0];
    };

    const getImageWidget = (node) => node.widgets?.find((w) => w.name === "image");
    const getAutoRefreshWidget = (node) => node.widgets?.find((w) => w.name === "auto_refresh");

    const stripAnnotation = (val) => (val || "").replace(/ \[[^\]]+\]$/, "").trim();
    const annotate = (rel) => `${rel} [output]`;

    const getAnnotationType = (val) => {
      const m = (val || "").match(/ \[([^\]]+)\]$/);
      return m ? m[1] : "output";
    };

    /* Build a /view URL for any image. */
    const buildViewURL = (rel, type = "output") => {
      const parts = (rel || "").split("/");
      const filename = parts.pop();
      const subfolder = parts.join("/");
      const params = new URLSearchParams({ filename, type, subfolder });
      return api.apiURL(`/view?${params.toString()}`);
    };

    /* Load a preview image into node.imgs. */
    const loadPreview = async (node, rel, type = "output") => {
      if (!rel || rel === "(None)") {
        node.imgs = null;
        node.setDirtyCanvas(true, true);
        return;
      }
      try {
        const url = buildViewURL(rel, type);
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url + `&cb=${Date.now()}`;
        });
        node.imgs = [img];
      } catch {
        node.imgs = null;
      }
      node.setDirtyCanvas(true, true);
    };

    /* Load preview from the hidden image widget, auto-detecting type. */
    const loadPreviewFromWidget = async (node) => {
      const raw = getImageWidget(node)?.value || "";
      const stripped = stripAnnotation(raw);
      if (!stripped || stripped === "(None)") {
        node.imgs = null;
        node.setDirtyCanvas(true, true);
        return;
      }
      const type = stripped.startsWith("clipspace/") ? "input" : getAnnotationType(raw);
      await loadPreview(node, stripped, type);
    };

    /* Reconstruct node.images from the hidden image widget value. */
    const reconstructNodeImages = (node) => {
      const raw = getImageWidget(node)?.value || "";
      const stripped = stripAnnotation(raw);
      if (!stripped || stripped === "(None)") {
        node.images = null;
        return;
      }
      const type = stripped.startsWith("clipspace/") ? "input" : getAnnotationType(raw);
      const parts = stripped.split("/");
      const fname = parts.pop();
      const subfolder = parts.join("/");
      node.images = [{ filename: fname, subfolder, type }];
    };

    const fetchImageList = async (node) => {
      const includeSub = node.properties?.include_subfolders !== false;
      try {
        const resp = await api.fetchApi(
          `/vslinx/output_images_list?include_subfolders=${includeSub}`
        );
        const data = await resp.json();
        return data.files || [];
      } catch {
        return [];
      }
    };

    /* Select an output-folder image. Sets the hidden widget to
       "rel [output]" and updates node.images + preview. */
    const setSelection = (node, rel) => {
      const imgWidget = getImageWidget(node);
      if (!rel || rel === "(None)") {
        if (imgWidget) imgWidget.value = "";
        node.images = null;
        node.imgs = null;
        node.setDirtyCanvas(true, true);
        return;
      }
      if (imgWidget) imgWidget.value = annotate(rel);
      const parts = rel.split("/");
      const filename = parts.pop();
      const subfolder = parts.join("/");
      node.images = [{ filename, subfolder, type: "output" }];
      loadPreview(node, rel, "output");
    };

    /* Called when the MaskEditor saves a painted mask to input/clipspace.
       The MaskEditor already updated imgWidget.value to the clipspace path.
       We just need to update node.images and load the preview. */
    const onMaskEditorSave = (node, value) => {
      const stripped = stripAnnotation(value);
      if (!stripped.startsWith("clipspace/")) return;

      const parts = stripped.split("/");
      const fname = parts.pop();
      const subfolder = parts.join("/");
      node.images = [{ filename: fname, subfolder, type: "input" }];
      loadPreview(node, stripped, "input");
    };

    /* Refresh the dropdown file list (output folder only).
       selectLatest=true picks the newest file; false keeps current selection. */
    const refreshDropdown = async (node, selectLatest = false) => {
      const files = await fetchImageList(node);
      const combo = node._imageCombo;
      if (!combo) return;

      const prevValue = combo.value;
      combo.options.values = files.length ? files : ["(None)"];

      if (selectLatest && files.length) {
        combo.value = files[0];
        setSelection(node, files[0]);
      } else if (!files.length) {
        combo.value = "(None)";
        setSelection(node, "");
      } else if (!files.includes(prevValue)) {
        combo.value = files[0];
        setSelection(node, files[0]);
      }

      node.setDirtyCanvas(true, true);
    };

    /* ── onNodeCreated ── */
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);

      /* _isRestoring starts true. For NEW nodes it is cleared in the RAF.
         For RESTORED nodes it stays true through configure() (which applies
         widgets_values and may trigger the combo callback), and is cleared
         in onConfigure's setTimeout after we've restored from the hidden widget. */
      this._isRestoring = true;

      /* properties */
      this.properties = this.properties || {};
      if (typeof this.properties.include_subfolders === "undefined") {
        this.addProperty?.("include_subfolders", true);
        if (typeof this.properties.include_subfolders === "undefined") {
          this.properties.include_subfolders = true;
        }
      }

      /* hide raw STRING widget and tag it for the MaskEditor */
      const imgWidget = getImageWidget(this);
      if (imgWidget) {
        imgWidget.options = imgWidget.options || {};
        imgWidget.options.image_upload = true;
        imgWidget.options.image_folder = "output";

        const self = this;
        imgWidget.callback = (value) => {
          onMaskEditorSave(self, value);
        };
      }
      hideWidget(imgWidget);

      /* dropdown — ALWAYS shows output-folder images only */
      const combo = this.addWidget(
        "combo",
        "select_image",
        "(None)",
        (value) => {
          if (this._isRestoring) return;
          if (!value || value === "(None)") {
            setSelection(this, "");
          } else {
            setSelection(this, value);
          }
        },
        { values: ["(None)"] }
      );
      combo.label = "image";
      this._imageCombo = combo;

      /* move auto_refresh widget right after the combo */
      const autoRefreshW = getAutoRefreshWidget(this);
      if (autoRefreshW) {
        autoRefreshW.label = "Auto refresh after generation";
        const idx = this.widgets.indexOf(autoRefreshW);
        if (idx >= 0) {
          this.widgets.splice(idx, 1);
          this.widgets.push(autoRefreshW);
        }
      }

      /* refresh button */
      this.addWidget("button", "Refresh", null, () => {
        refreshDropdown(this, true);
      });

      /* upload button */
      this.addWidget("button", "Choose file to upload", null, () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.style.display = "none";
        document.body.appendChild(input);

        input.addEventListener("change", async () => {
          const file = input.files?.[0];
          document.body.removeChild(input);
          if (!file) return;

          const form = new FormData();
          form.append("image", file, file.name);
          form.append("type", "output");

          try {
            const resp = await api.fetchApi("/upload/image", {
              method: "POST",
              body: form,
            });
            if (!resp.ok) {
              console.error("[LoadLastGenerated] Upload failed", resp.status);
              return;
            }
            const data = await resp.json();
            const rel = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;

            await refreshDropdown(this, false);

            combo.value = rel;
            setSelection(this, rel);
          } catch (e) {
            console.error("[LoadLastGenerated] Upload error", e);
          }
        });

        input.click();
      });

      /* ── auto-refresh after execution ── */
      this._wasExecuting = false;
      this._preExecLatest = null;

      this._executionHandler = ({ detail }) => {
        if (detail) {
          if (!this._wasExecuting) {
            this._wasExecuting = true;
            this._preExecLatest = this._imageCombo?.options?.values?.[0] || null;
          }
        } else if (this._wasExecuting) {
          this._wasExecuting = false;
          const arw = getAutoRefreshWidget(this);
          if (!arw?.value) return;

          const preLatest = this._preExecLatest;

          setTimeout(async () => {
            const files = await fetchImageList(this);
            const combo = this._imageCombo;
            if (!combo) return;

            combo.options.values = files.length ? files : ["(None)"];

            const hasNewFile = files.length > 0 && files[0] !== preLatest;
            if (hasNewFile) {
              combo.value = files[0];
              setSelection(this, files[0]);
            }

            this.setDirtyCanvas(true, true);
          }, 300);
        }
      };
      api.addEventListener("executing", this._executionHandler);

      /* initial populate — only for genuinely new nodes */
      this._skipInitialRefresh = false;
      requestAnimationFrame(() => {
        if (!this._skipInitialRefresh) {
          this._isRestoring = false;
          refreshDropdown(this, true);
        }
      });

      return r;
    };

    /* ── cleanup ── */
    const origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      if (this._executionHandler) {
        api.removeEventListener("executing", this._executionHandler);
      }
      return origRemoved?.apply(this, arguments);
    };

    /* ── property changes ── */
    const origOnPropertyChanged = nodeType.prototype.onPropertyChanged;
    nodeType.prototype.onPropertyChanged = function (name) {
      const r = origOnPropertyChanged?.apply(this, arguments);
      if (name === "include_subfolders" && !this._isRestoring) {
        refreshDropdown(this, true);
      }
      return r;
    };

    /* ── configure (load saved workflow / tab switch) ── */
    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (...args) {
      const r = origConfigure?.apply(this, args);

      /* _isRestoring is already true from onNodeCreated — combo callback
         is blocked. Prevent the RAF from running too. */
      this._skipInitialRefresh = true;

      this.properties = this.properties || {};
      if (typeof this.properties.include_subfolders === "undefined") {
        this.properties.include_subfolders = true;
      }

      setTimeout(() => {
        /* NOW it's safe to allow combo callbacks again */
        this._isRestoring = false;

        const imgWidget = getImageWidget(this);
        if (imgWidget) {
          imgWidget.options = imgWidget.options || {};
          imgWidget.options.image_upload = true;
          imgWidget.options.image_folder = "output";

          const self = this;
          imgWidget.callback = (value) => {
            onMaskEditorSave(self, value);
          };
        }
        hideWidget(imgWidget);

        /* The hidden image widget is the single source of truth.
           It holds either "output_image.png [output]" or
           "clipspace/clipspace-painted-masked-xxx.png [input]". */
        const raw = imgWidget?.value || "";
        const stripped = stripAnnotation(raw);

        if (!stripped || stripped === "(None)") {
          refreshDropdown(this, true);
          return;
        }

        /* Reconstruct node.images for MaskEditor */
        reconstructNodeImages(this);

        /* Load preview from the hidden widget (works for both output and clipspace) */
        loadPreviewFromWidget(this);

        /* Populate the dropdown with output files only */
        fetchImageList(this).then((files) => {
          const combo = this._imageCombo;
          if (!combo) return;

          combo.options.values = files.length ? files : ["(None)"];

          /* If it's an output image, make sure the combo shows it.
             If it's a clipspace image, the combo keeps whatever
             output image was previously selected (restored by LiteGraph). */
          if (!stripped.startsWith("clipspace/")) {
            if (files.includes(stripped)) {
              combo.value = stripped;
            } else if (files.length) {
              combo.value = files[0];
              setSelection(this, files[0]);
            }
          }

          this.setDirtyCanvas(true, true);
        });
      }, 0);

      return r;
    };
  },
});
