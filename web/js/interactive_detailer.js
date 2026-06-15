import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

/*
 * vsLinx Interactive Detailer - frontend dialog
 *
 * Listens for the "vslinx-interactive-detailer" websocket event sent by the
 * backend while the execution thread is paused. Shows an overlay with:
 *   - the full image with numbered boxes (canvas)
 *   - one row per segment: crop preview + prompt textarea
 * On confirm/cancel the answers are POSTed to
 * /vslinx/interactive_detailer/submit which resumes the workflow.
 */

const EVENT = "vslinx-interactive-detailer";
const EVENT_CLOSE = "vslinx-interactive-detailer-close";
const SUBMIT_URL = "/vslinx/interactive_detailer/submit";
const PENDING_URL = "/vslinx/interactive_detailer/pending";
const LS_PREFIX = "vslinx.interactiveDetailer";

const BOX_COLORS = ["#4da3ff", "#ff7847", "#5fd87a", "#e85fd8", "#ffd84d", "#5fe0e0", "#b48cff", "#ff5f7a"];

let active = null; // { sessionId, overlay, textareas, resolved, keyHandler }

function viewURL(ref) {
    const params = new URLSearchParams({
        filename: ref.filename,
        subfolder: ref.subfolder || "",
        type: ref.type || "temp",
        rand: Math.random().toString(36).slice(2),
    });
    return api.apiURL(`/view?${params.toString()}`);
}

function lsKey(nodeId, index) {
    return `${LS_PREFIX}.${nodeId ?? "unknown"}.${index}`;
}

async function submit(sessionId, prompts, cancelled) {
    try {
        await api.fetchApi(SUBMIT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, prompts, cancelled }),
        });
    } catch (err) {
        console.error("[vsLinx] Interactive Detailer submit failed:", err);
    }
}

function closeDialog() {
    if (!active) return;
    document.removeEventListener("keydown", active.keyHandler, true);
    active.overlay.remove();
    active = null;
}

function resolveDialog(prompts, cancelled) {
    if (!active || active.resolved) return;
    active.resolved = true;
    const sessionId = active.sessionId;
    closeDialog();
    submit(sessionId, prompts, cancelled);
}

function collectPrompts(save = true) {
    if (!active) return [];
    return active.textareas.map((ta) => {
        const value = ta.value ?? "";
        if (save && ta.dataset.lsKey) {
            try {
                if (value.trim() !== "") localStorage.setItem(ta.dataset.lsKey, value);
                else localStorage.removeItem(ta.dataset.lsKey);
            } catch (e) { /* storage full / disabled - non-fatal */ }
        }
        return value;
    });
}

// ------------------------------- styles -------------------------------

function injectStyles() {
    if (document.getElementById("vslinx-id-styles")) return;
    const style = document.createElement("style");
    style.id = "vslinx-id-styles";
    style.textContent = `
        .vslinx-id-overlay {
            position: fixed; inset: 0; z-index: 10000;
            background: rgba(0,0,0,0.6);
            display: flex; align-items: center; justify-content: center;
        }
        .vslinx-id-panel {
            background: var(--comfy-menu-bg, #202020);
            color: var(--fg-color, #ddd);
            border: 1px solid var(--border-color, #4e4e4e);
            border-radius: 10px;
            width: min(860px, 94vw);
            max-height: 90vh;
            display: flex; flex-direction: column;
            box-shadow: 0 12px 40px rgba(0,0,0,0.55);
            font-family: sans-serif; font-size: 13px;
        }
        .vslinx-id-header {
            padding: 12px 16px; font-size: 15px; font-weight: 600;
            border-bottom: 1px solid var(--border-color, #4e4e4e);
            display: flex; justify-content: space-between; align-items: center;
        }
        .vslinx-id-header span.vslinx-id-sub { font-size: 12px; font-weight: 400; opacity: 0.7; }
        .vslinx-id-body { overflow-y: auto; padding: 12px 16px; }
        .vslinx-id-canvas-wrap { text-align: center; margin-bottom: 12px; }
        .vslinx-id-canvas-wrap canvas {
            max-width: 100%; max-height: 38vh; border-radius: 6px; cursor: pointer;
            border: 1px solid var(--border-color, #4e4e4e);
        }
        .vslinx-id-row {
            display: flex; gap: 12px; align-items: stretch;
            padding: 10px; margin-bottom: 8px; border-radius: 8px;
            background: rgba(255,255,255,0.04);
            border: 1px solid transparent;
        }
        .vslinx-id-row.vslinx-id-focused { border-color: var(--vslinx-row-color, #4da3ff); }
        .vslinx-id-thumb {
            width: 96px; height: 96px; object-fit: cover; flex: 0 0 auto;
            border-radius: 6px; background: #111;
            border: 2px solid var(--vslinx-row-color, #4da3ff);
        }
        .vslinx-id-fields { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .vslinx-id-label { font-weight: 600; }
        .vslinx-id-label small { font-weight: 400; opacity: 0.65; margin-left: 6px; }
        .vslinx-id-fields textarea {
            flex: 1; min-height: 56px; resize: vertical; width: 100%;
            background: var(--comfy-input-bg, #151515);
            color: var(--input-text, #ddd);
            border: 1px solid var(--border-color, #4e4e4e);
            border-radius: 6px; padding: 6px 8px; box-sizing: border-box;
            font-family: inherit; font-size: 13px;
        }
        .vslinx-id-footer {
            display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;
            padding: 12px 16px; border-top: 1px solid var(--border-color, #4e4e4e);
        }
        .vslinx-id-footer button {
            padding: 7px 14px; border-radius: 6px; cursor: pointer;
            border: 1px solid var(--border-color, #4e4e4e);
            background: var(--comfy-input-bg, #2a2a2a);
            color: var(--input-text, #ddd); font-size: 13px;
        }
        .vslinx-id-footer button:hover { filter: brightness(1.25); }
        .vslinx-id-confirm { background: #2563eb !important; border-color: #2563eb !important; color: #fff !important; }
        .vslinx-id-cancel { color: #ff7a7a !important; }
        .vslinx-id-hint { margin-right: auto; align-self: center; font-size: 11px; opacity: 0.6; }
    `;
    document.head.appendChild(style);
}

// ------------------------------- dialog -------------------------------

function drawOverview(canvas, img, data, focusedIndex) {
    const ctx = canvas.getContext("2d");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    const scale = data.overview?.scale ?? 1;
    const lw = Math.max(2, Math.round(canvas.width / 400));
    ctx.font = `bold ${Math.max(14, Math.round(canvas.width / 40))}px sans-serif`;

    for (const seg of data.segments) {
        const color = BOX_COLORS[seg.index % BOX_COLORS.length];
        const [x1, y1, x2, y2] = seg.bbox.map((v) => v * scale);
        ctx.lineWidth = seg.index === focusedIndex ? lw * 2 : lw;
        ctx.strokeStyle = color;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        const tag = `${seg.index + 1}`;
        const m = ctx.measureText(tag);
        const th = Math.max(16, Math.round(canvas.width / 38));
        ctx.fillStyle = color;
        ctx.fillRect(x1, Math.max(0, y1 - th), m.width + 10, th);
        ctx.fillStyle = "#000";
        ctx.fillText(tag, x1 + 5, Math.max(th - 4, y1 - 4));
    }
}

function showDialog(data) {
    if (!data || !Array.isArray(data.segments) || data.segments.length === 0) return;
    closeDialog(); // a newer request replaces any stale dialog
    injectStyles();

    const overlay = document.createElement("div");
    overlay.className = "vslinx-id-overlay";

    const panel = document.createElement("div");
    panel.className = "vslinx-id-panel";
    overlay.appendChild(panel);

    const header = document.createElement("div");
    header.className = "vslinx-id-header";
    header.innerHTML = `<div>Interactive Detailer - ${data.segments.length} segment${data.segments.length > 1 ? "s" : ""} found</div>
        <span class="vslinx-id-sub">empty = base prompt&nbsp;&nbsp;|&nbsp;&nbsp;[SKIP] = leave untouched</span>`;
    panel.appendChild(header);

    const body = document.createElement("div");
    body.className = "vslinx-id-body";
    panel.appendChild(body);

    // --- overview canvas ---
    const canvasWrap = document.createElement("div");
    canvasWrap.className = "vslinx-id-canvas-wrap";
    const canvas = document.createElement("canvas");
    canvasWrap.appendChild(canvas);
    body.appendChild(canvasWrap);

    const overviewImg = new Image();
    let focusedIndex = -1;
    overviewImg.onload = () => drawOverview(canvas, overviewImg, data, focusedIndex);
    overviewImg.src = viewURL(data.overview.preview);

    // --- segment rows ---
    const textareas = [];
    const rows = [];
    for (const seg of data.segments) {
        const color = BOX_COLORS[seg.index % BOX_COLORS.length];

        const row = document.createElement("div");
        row.className = "vslinx-id-row";
        row.style.setProperty("--vslinx-row-color", color);

        const thumb = document.createElement("img");
        thumb.className = "vslinx-id-thumb";
        thumb.src = viewURL(seg.preview);
        row.appendChild(thumb);

        const fields = document.createElement("div");
        fields.className = "vslinx-id-fields";

        const label = document.createElement("div");
        label.className = "vslinx-id-label";
        label.style.color = color;
        const conf = seg.confidence ? ` &middot; ${(seg.confidence * 100).toFixed(0)}%` : "";
        label.innerHTML = `#${seg.index + 1} ${seg.label}<small>${conf}</small>`;
        fields.appendChild(label);

        const ta = document.createElement("textarea");
        ta.placeholder = "positive prompt for this segment (empty = base prompt)";
        ta.dataset.lsKey = lsKey(data.node_id, seg.index);
        try {
            ta.value = localStorage.getItem(ta.dataset.lsKey) || "";
        } catch (e) { /* ignore */ }
        ta.addEventListener("focus", () => {
            focusedIndex = seg.index;
            rows.forEach((r, i) => r.classList.toggle("vslinx-id-focused", i === seg.index));
            if (overviewImg.complete) drawOverview(canvas, overviewImg, data, focusedIndex);
        });
        fields.appendChild(ta);
        textareas.push(ta);

        row.appendChild(fields);
        rows.push(row);
        body.appendChild(row);
    }

    // click a box on the canvas -> focus its textarea
    canvas.addEventListener("click", (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
        const scale = data.overview?.scale ?? 1;
        for (const seg of data.segments) {
            const [x1, y1, x2, y2] = seg.bbox.map((v) => v * scale);
            if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
                textareas[seg.index]?.focus();
                textareas[seg.index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                return;
            }
        }
    });

    // --- footer ---
    const footer = document.createElement("div");
    footer.className = "vslinx-id-footer";

    const hint = document.createElement("span");
    hint.className = "vslinx-id-hint";
    hint.textContent = "Ctrl+Enter to confirm";
    footer.appendChild(hint);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "vslinx-id-cancel";
    cancelBtn.textContent = "Cancel run";
    cancelBtn.onclick = () => resolveDialog([], true);
    footer.appendChild(cancelBtn);

    const baseBtn = document.createElement("button");
    baseBtn.textContent = "Base prompt for all";
    baseBtn.onclick = () => resolveDialog(data.segments.map(() => ""), false);
    footer.appendChild(baseBtn);

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "vslinx-id-confirm";
    confirmBtn.textContent = "Detail with these prompts";
    confirmBtn.onclick = () => resolveDialog(collectPrompts(), false);
    footer.appendChild(confirmBtn);

    panel.appendChild(footer);

    const keyHandler = (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            resolveDialog(collectPrompts(), false);
        }
    };
    document.addEventListener("keydown", keyHandler, true);

    document.body.appendChild(overlay);
    active = { sessionId: data.session_id, overlay, textareas, resolved: false, keyHandler };
    textareas[0]?.focus();
}

// ----------------------------- extension ------------------------------

app.registerExtension({
    name: "vslinx.interactiveDetailer",
    setup() {
        api.addEventListener(EVENT, (e) => showDialog(e.detail));
        // Backend timed out or replaced the session -> drop the stale dialog.
        api.addEventListener(EVENT_CLOSE, (e) => {
            if (active && (!e.detail?.session_id || e.detail.session_id === active.sessionId)) {
                active.resolved = true;
                closeDialog();
            }
        });
        // Run was cancelled/errored elsewhere -> the backend wait already
        // unwound, just remove the dialog.
        const closeOnEnd = () => {
            if (active) {
                active.resolved = true;
                closeDialog();
            }
        };
        api.addEventListener("execution_interrupted", closeOnEnd);
        api.addEventListener("execution_error", closeOnEnd);

        // Page was reloaded while the backend is still waiting -> restore.
        api.fetchApi(PENDING_URL)
            .then((r) => r.json())
            .then((d) => { if (d?.pending) showDialog(d.pending); })
            .catch(() => {});
    },
});
