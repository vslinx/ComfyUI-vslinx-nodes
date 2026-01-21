import { app } from "/scripts/app.js";

export function toast(severity, summary, detail, life = 3000) {
  const t = app.extensionManager?.toast;
  if (t?.add) {
    t.add({ severity, summary, detail, life });
    return;
  }
  const fn =
    severity === "error" ? console.error :
      severity === "warn" ? console.warn :
        console.log;
  fn(`[${summary}] ${detail}`);
}