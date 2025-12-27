import { app } from "../../../scripts/app.js";

const SETTING_ID = "vslinx.modelHoverPreviews";
let enabled = false;

const PREVIEW_URL = (name) =>
  `/vslinx/model_preview?name=${encodeURIComponent(name)}&t=${Date.now()}`;

const MODEL_EXTS = [".safetensors", ".pt", ".ckpt", ".gguf"];

const popup = document.createElement("div");
popup.id = "vslinx-model-hover-preview";
popup.style.cssText = `
  position: fixed;
  z-index: 100000;
  display: none;
  pointer-events: none;
  padding: 6px;
  border-radius: 8px;
  background: rgba(20,20,20,0.92);
  box-shadow: 0 8px 30px rgba(0,0,0,0.4);
  max-width: 360px;
  max-height: 360px;
`;

const mediaWrap = document.createElement("div");
mediaWrap.style.cssText = `
  display: block;
  max-width: 340px;
  max-height: 340px;
`;

const img = document.createElement("img");
img.style.cssText = `
  display: none;
  max-width: 340px;
  max-height: 340px;
  border-radius: 6px;
`;

const vid = document.createElement("video");
vid.style.cssText = `
  display: none;
  max-width: 340px;
  max-height: 340px;
  border-radius: 6px;
`;
vid.muted = true;
vid.loop = true;
vid.autoplay = true;
vid.playsInline = true;
vid.preload = "metadata";

mediaWrap.appendChild(img);
mediaWrap.appendChild(vid);
popup.appendChild(mediaWrap);
document.body.appendChild(popup);

let requestToken = 0;
let activeMenuEl = null;

const menuCloseObserver = new MutationObserver(() => {
  if (!enabled) return;
  if (activeMenuEl && !document.body.contains(activeMenuEl)) {
    activeMenuEl = null;
    hidePopup();
  }
});
menuCloseObserver.observe(document.body, { childList: true, subtree: true });

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function positionPopup(clientX, clientY) {
  const pad = 16;
  const w = popup.offsetWidth || 360;
  const h = popup.offsetHeight || 360;
  const x = clamp(clientX + pad, pad, window.innerWidth - w - pad);
  const y = clamp(clientY + pad, pad, window.innerHeight - h - pad);
  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;
}

function hidePopup() {
  popup.style.display = "none";

  img.style.display = "none";
  img.removeAttribute("src");

  vid.style.display = "none";
  try {
    vid.pause();
  } catch {}
  vid.removeAttribute("src");
  vid.load();
}

function showPopup(ev) {
  popup.style.display = "block";
  positionPopup(ev.clientX, ev.clientY);
}

function resetMedia() {
  img.style.display = "none";
  img.removeAttribute("src");

  vid.style.display = "none";
  try {
    vid.pause();
  } catch {}
  vid.removeAttribute("src");
  vid.load();
}

function normalizePath(s) {
  return String(s || "")
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFolderIcon(s) {
  return String(s || "").replace(/^\s*📁\s*/u, "").trim();
}

function isLikelyModelPath(s) {
  if (!s) return false;
  const lower = s.toLowerCase();

  if (lower === "none" || lower === "disable" || lower === "choose") return false;
  if (lower.startsWith("open ") || lower.startsWith("load ")) return false;

  return MODEL_EXTS.some((ext) => lower.endsWith(ext));
}

function getMenuItemObject(entryEl) {
  if (!entryEl) return null;

  const candidates = [
    "data",
    "value",
    "_value",
    "__value",
    "item",
    "__item",
    "_item",
    "lg_item",
    "lg_value",
    "menuitem",
    "__menuitem",
  ];

  for (const k of candidates) {
    if (entryEl[k] != null) return entryEl[k];
  }

  const dv = entryEl?.dataset?.value;
  if (dv != null) return dv;

  return null;
}

function isFolderEntry(entryEl) {
  const txt = (entryEl?.textContent || "").trim();
  if (txt.startsWith("📁")) return true;

  const item = getMenuItemObject(entryEl);
  if (item && typeof item === "object") {
    if (item.has_submenu || item.submenu) return true;
    if (item.submenu && typeof item.submenu === "object") return true;
  }
  return false;
}

function getModelName(entryEl) {
  if (!entryEl) return null;
  if (isFolderEntry(entryEl)) return null;

  const item = getMenuItemObject(entryEl);

  if (typeof item === "string") {
    const v = normalizePath(stripFolderIcon(item));
    return isLikelyModelPath(v) ? v : null;
  }

  if (item && typeof item === "object") {
    const candidates = [item.rgthree_originalValue, item.value, item.content];
    for (const c of candidates) {
      if (typeof c === "string") {
        const v = normalizePath(stripFolderIcon(c));
        if (isLikelyModelPath(v)) return v;
      }
    }
    return null;
  }

  const raw = (entryEl.textContent || "").trim();
  const firstLine = raw.split("\n")[0].trim();
  const v = normalizePath(stripFolderIcon(firstLine));
  return isLikelyModelPath(v) ? v : null;
}

async function showPreviewFor(name, ev) {
  const token = ++requestToken;
  const url = PREVIEW_URL(name);

  resetMedia();
  hidePopup();

  let resp;
  try {
    resp = await fetch(url, { method: "HEAD", cache: "no-store" });
  } catch {
    return;
  }

  if (token !== requestToken) return;
  if (!resp) return;

  if (resp.status === 204) return;

  if (!resp.ok) return;

  const ct = (resp.headers.get("content-type") || "").toLowerCase();

  if (ct.startsWith("image/")) {
    img.onload = () => {
      if (token !== requestToken) return;
      img.style.display = "block";
      vid.style.display = "none";
      showPopup(ev);
    };
    img.onerror = () => {};
    img.src = url;
    return;
  }

  if (ct.startsWith("video/")) {
    const onCanPlay = () => {
      cleanup();
      if (token !== requestToken) return;
      vid.style.display = "block";
      img.style.display = "none";
      showPopup(ev);
      vid.play().catch(() => {});
    };

    const onError = () => {
      cleanup();
      if (token !== requestToken) return;
      hidePopup();
    };

    const cleanup = () => {
      vid.removeEventListener("loadeddata", onCanPlay);
      vid.removeEventListener("canplay", onCanPlay);
      vid.removeEventListener("error", onError);
    };

    vid.addEventListener("loadeddata", onCanPlay, { once: true });
    vid.addEventListener("canplay", onCanPlay, { once: true });
    vid.addEventListener("error", onError, { once: true });

    vid.src = url;
    vid.load();
    return;
  }
}

function attachHoverHandlers(menuEl) {
  if (menuEl.dataset.vslinxHoverPreviewAttached === "1") return;
  menuEl.dataset.vslinxHoverPreviewAttached = "1";

  menuEl.addEventListener(
    "mouseover",
    (ev) => {
      if (!enabled) return;

      const entry = ev.target?.closest?.(".litemenu-entry");
      if (!entry || !menuEl.contains(entry)) return;

      activeMenuEl = menuEl;

      if (isFolderEntry(entry)) return;

      const name = getModelName(entry);
      if (!name) return;

      showPreviewFor(name, ev);
    },
    true
  );

  menuEl.addEventListener(
    "mousemove",
    (ev) => {
      if (popup.style.display !== "none") positionPopup(ev.clientX, ev.clientY);
    },
    true
  );

  menuEl.addEventListener("mouseleave", () => hidePopup(), true);
}

function scanAndAttachExistingMenus() {
  const selectors = [
    ".litegraph",
    ".context-menu",
    ".contextmenu",
    ".litegraph-contextmenu",
    ".litemenu",
    ".graphcontextmenu",
  ];
  document.querySelectorAll(selectors.join(",")).forEach((menu) => {
    if (menu instanceof HTMLElement) attachHoverHandlers(menu);
  });
}

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;

      const menus = [];
      if (
        node.classList.contains("litegraph") ||
        node.classList.contains("context-menu") ||
        node.classList.contains("contextmenu") ||
        node.classList.contains("litemenu") ||
        node.classList.contains("litegraph-contextmenu") ||
        node.classList.contains("graphcontextmenu")
      ) {
        menus.push(node);
      }

      menus.push(
        ...(node.querySelectorAll?.(
          ".litegraph, .context-menu, .contextmenu, .litemenu, .litegraph-contextmenu, .graphcontextmenu"
        ) ?? [])
      );

      for (const menu of menus) attachHoverHandlers(menu);
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });

document.addEventListener(
  "pointerdown",
  () => {
    if (!enabled) return;
    hidePopup();
  },
  true
);

document.addEventListener(
  "keydown",
  (e) => {
    if (!enabled) return;
    if (e.key === "Escape") hidePopup();
  },
  true
);

window.addEventListener("blur", () => {
  if (!enabled) return;
  hidePopup();
});

app.registerExtension({
  name: "vslinx.modelHoverPreviews",
  settings: [
    {
      id: SETTING_ID,
      name: "Show hover previews in all model dropdowns",
      type: "boolean",
      defaultValue: false,
      category: ["vslinx", "Models", "Hover previews"],
      tooltip:
        "When enabled, hovering a model name in dropdowns (LoRA's, checkpoints & diffusion_models/unet) shows its preview image or video (mp4/webm) if available.",
      onChange: (newVal) => {
        enabled = !!newVal;
        if (!enabled) {
          hidePopup();
        } else {
          scanAndAttachExistingMenus();
        }
      },
    },
  ],
  setup() {
    const v = app.extensionManager?.setting?.get?.(SETTING_ID);
    enabled = !!v;
    if (enabled) scanAndAttachExistingMenus();
  },
});
