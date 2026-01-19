import { app } from "../../../scripts/app.js";

const SETTING_ID = "vslinx.tabletHideUi";
let enabled = false;

const STYLE_ID = "vslinx-tablet-hide-ui-style";
let styleEl = null;

function ensureStyleEl() {
    if (styleEl && document.head.contains(styleEl)) return styleEl;
    styleEl = document.getElementById(STYLE_ID);
    if (styleEl) return styleEl;

    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
    return styleEl;
}

function removeStyleEl() {
    const el = document.getElementById(STYLE_ID);
    if (el) el.remove();
    styleEl = null;
}

function buildHideCss() {
    return `
    .pysssss-image-feed, .rgthree-comfybar-top-button-group  { 
        display:none !important; 
    }

    .comfyui-button-group:has(> button[aria-label="Show Image Feed 🐍"]) {
        display: none !important;
    }

    .comfyui-button-group > [title="Share"], .comfyui-button-group > [title="Show favorite custom node list"]  {
        display: none !important;
    }

    #crystools-monitors-root > .Crystools\\.ShowCpu,
    #crystools-monitors-root > .Crystools\\.ShowRam {
        display: none !important;
    }
`;
}

function isProbablyTablet() {
    const ua = (navigator.userAgent || "").toLowerCase();

    const uaTablet =
        ua.includes("ipad") ||
        ua.includes("android") && !ua.includes("mobile") ||
        ua.includes("tablet") ||
        ua.includes("silk");

    const iPadOsAsMac =
        navigator.platform === "MacIntel" &&
        (navigator.maxTouchPoints || 0) > 1;

    const minDim = Math.min(window.innerWidth, window.innerHeight);
    const maxDim = Math.max(window.innerWidth, window.innerHeight);

    const coarsePointer =
        window.matchMedia?.("(pointer: coarse)")?.matches ?? false;

    const sizeTabletish = minDim >= 600 && maxDim <= 1400;

    return uaTablet || iPadOsAsMac || (coarsePointer && sizeTabletish);
}

function applyTabletUiHides() {
    const shouldHide = enabled && isProbablyTablet();

    if (!shouldHide) {
        removeStyleEl();
        document.body?.classList?.remove("vslinx-tablet-hide-ui");
        return;
    }

    document.body?.classList?.add("vslinx-tablet-hide-ui");

    const el = ensureStyleEl();
    el.textContent = buildHideCss();
}

let resizeTimer = null;
function scheduleReapply() {
    if (!enabled) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        applyTabletUiHides();
    }, 150);
}

app.registerExtension({
    name: "vslinx.tabletUiHides",
    settings: [
        {
            id: SETTING_ID,
            name: "Hide selected UI elements on tablets",
            type: "boolean",
            defaultValue: false,
            category: ["vslinx", "Tablet"],
            tooltip:
                "When enabled, hides selected UI elements only on tablet-like devices (user-agent OR tablet-ish resolution/input).",
            onChange: (newVal) => {
                enabled = !!newVal;
                applyTabletUiHides();
            },
        },
    ],
    setup() {
        const v = app.extensionManager?.setting?.get?.(SETTING_ID);
        enabled = !!v;

        applyTabletUiHides();

        window.addEventListener("resize", scheduleReapply, { passive: true });
        window.addEventListener("orientationchange", scheduleReapply, {
            passive: true,
        });

        setTimeout(() => applyTabletUiHides(), 300);
    },
});
