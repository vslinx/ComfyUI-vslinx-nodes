import { app } from "../../scripts/app.js";

const SETTING_ID = "vslinx.loraHoverPreviews";
let enabled = false;

const PREVIEW_URL = (name) =>
  `/vslinx/model_preview/lora?name=${encodeURIComponent(name)}&t=${Date.now()}`;

const popup = document.createElement("div");
popup.id = "vslinx-lora-hover-preview";
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

/**
 * Only show popup after a valid image/video loads.
 * If neither exists (404), show nothing.
 */
async function showPreviewFor(name, ev) {
  const token = ++requestToken;
  const url = PREVIEW_URL(name);

  resetMedia();
  hidePopup();

  const testImg = new Image();

  testImg.onload = () => {
    if (token !== requestToken) return;
    img.src = url;
    img.style.display = "block";
    vid.style.display = "none";
    showPopup(ev);
  };

  testImg.onerror = () => {
    if (token !== requestToken) return;

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
  };

  testImg.src = url;
}

function isLikelyLoraMenu(menuEl) {
  const title = menuEl.querySelector(".litemenu-title")?.textContent?.toLowerCase() || "";
  if (title.includes("lora")) return true;

  const entries = Array.from(menuEl.querySelectorAll(".litemenu-entry"));
  const texts = entries.map((e) => (e.textContent || "").trim()).filter(Boolean);
  if (texts.length < 5) return false;

  const fileLike = texts.filter((t) => {
    const tl = t.toLowerCase();
    return tl.endsWith(".safetensors") || tl.endsWith(".pt") || tl.endsWith(".ckpt");
  }).length;

  return fileLike >= Math.min(8, Math.floor(texts.length * 0.6));
}

function attachHoverHandlers(menuEl) {
  if (menuEl.dataset.vslinxHoverPreviewAttached === "1") return;
  menuEl.dataset.vslinxHoverPreviewAttached = "1";

  if (!isLikelyLoraMenu(menuEl)) return;

  const entries = Array.from(menuEl.querySelectorAll(".litemenu-entry"));
  for (const entry of entries) {
    if (entry.classList.contains("disabled")) continue;

    entry.addEventListener("mouseenter", (ev) => {
      if (!enabled) return;

      activeMenuEl = menuEl;

      const raw = (entry.textContent || "").trim();
      const name = raw.split("\n")[0].trim();
      if (!name) return;

      showPreviewFor(name, ev);
    });

    entry.addEventListener("mousemove", (ev) => {
      if (popup.style.display !== "none") positionPopup(ev.clientX, ev.clientY);
    });

    entry.addEventListener("mouseleave", () => hidePopup());
  }
}

const observer = new MutationObserver((mutations) => {
  if (!enabled) return;

  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;

      const menus = [];
      if (node.classList.contains("litegraph") || node.classList.contains("context-menu")) {
        menus.push(node);
      }
      menus.push(...(node.querySelectorAll?.(".litegraph, .context-menu, .contextmenu") ?? []));

      for (const menu of menus) attachHoverHandlers(menu);
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });

/**
 * Global close triggers:
 * - click/tap anywhere (selecting item or clicking outside closes menus)
 * - Escape key
 * - window blur (alt-tab)
 */
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
  name: "vslinx.loraHoverPreviews",
  settings: [
    {
      id: SETTING_ID,
      name: "Show hover previews in all LoRA dropdowns (images + video)",
      type: "boolean",
      defaultValue: false,
      category: ["vslinx", "LoRA", "Hover previews"],
      tooltip:
        "When enabled, hovering a LoRA in dropdowns shows its preview image or video (mp4/webm) if available.",
      onChange: (newVal) => {
        enabled = !!newVal;
        if (!enabled) hidePopup();
      },
    },
  ],
});
