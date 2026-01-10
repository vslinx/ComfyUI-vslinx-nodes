import { app } from "/scripts/app.js";

export function ellipsizeToWidth(ctx, text, maxWidth) {
  text = String(text ?? "");
  if (maxWidth <= 0) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  const ellW = ctx.measureText(ellipsis).width;
  if (ellW >= maxWidth) return "";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  const cut = Math.max(0, lo - 1);
  return text.slice(0, cut) + ellipsis;
}

export function drawClippedText(ctx, text, x, yMid, w, h) {
  const padX = 10;
  const padY = 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    x + padX,
    yMid - h / 2 + padY,
    Math.max(0, w - padX * 2),
    Math.max(0, h - padY * 2)
  );
  ctx.clip();
  const maxTextW = Math.max(0, w - padX * 2);
  const t = ellipsizeToWidth(ctx, text, maxTextW);
  ctx.fillText(t, x + padX, yMid);
  ctx.restore();
}

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function drawSmallX(ctx, x, y, w, h, color = "#e05555") {
  const pad = Math.max(4, Math.floor(Math.min(w, h) * 0.28));
  const x0 = x + pad;
  const y0 = y + pad;
  const x1 = x + w - pad;
  const y1 = y + h - pad;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.8, Math.min(w, h) * 0.12);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x1, y0);
  ctx.lineTo(x0, y1);
  ctx.stroke();
  ctx.restore();
}

export function drawHoverOverlay(ctx, x, y, w, h, danger = false) {
  if (w <= 2 || h <= 2) return;
  ctx.save();
  ctx.globalAlpha = danger ? 0.10 : 0.08;
  ctx.fillStyle = danger ? "#e05555" : "#ffffff";
  roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, 6);
  ctx.fill();
  ctx.globalAlpha = danger ? 0.22 : 0.16;
  ctx.strokeStyle = danger ? "#e05555" : "#ffffff";
  ctx.lineWidth = 1;
  roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, 6);
  ctx.stroke();
  ctx.restore();
}

export function drawGripDots(ctx, x, y, w, h, active = false) {
  ctx.save();
  ctx.globalAlpha = active ? 0.92 : 0.72;
  ctx.fillStyle = "#d0d0d0";
  const cols = 2;
  const rows = 3;
  const r = Math.max(1.2, Math.min(w, h) * 0.07);
  const gapX = Math.max(r * 2.2, w * 0.18);
  const gapY = Math.max(r * 2.2, h * 0.14);
  const gridW = gapX * (cols - 1);
  const gridH = gapY * (rows - 1);
  const cx0 = x + w / 2 - gridW / 2;
  const cy0 = y + h / 2 - gridH / 2;
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      const px = cx0 + cx * gapX;
      const py = cy0 + ry * gapY;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function setCanvasCursor(cursor) {
  try {
    const c = app?.canvas?.canvas;
    if (c) c.style.cursor = cursor || "";
  } catch (_) { }
}

export function drawDropPlaceholderAt(ctx, node, y, LIST_SIDE_MARGIN, ROW_HEIGHT) {
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

export function drawGhostRow(ctx, node, row, ghostY, LIST_SIDE_MARGIN, ROW_HEIGHT) {
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