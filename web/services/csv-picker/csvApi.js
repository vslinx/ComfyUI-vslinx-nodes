import { api } from "/scripts/api.js";

export async function uploadPromptFile(file, mode = "auto", rename_to = null, subdir = "") {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  if (rename_to) form.append("rename_to", rename_to);
  form.append("subdir", String(subdir || ""));

  const res = await api.fetchApi("/vslinx/csv_prompt_upload", { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || `Upload failed (${res.status})`);
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json;
}

export async function readPromptFile(filename) {
  const res = await api.fetchApi(`/vslinx/csv_prompt_read?filename=${encodeURIComponent(filename)}`);
  if (!res.ok) throw new Error(`Read failed (${res.status})`);
  return await res.json();
}

export async function listPromptFiles() {
  const res = await api.fetchApi("/vslinx/csv_prompt_list");
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  const json = await res.json();
  return Array.isArray(json?.files) ? json.files : [];
}

export async function listPromptEntries() {
  const res = await api.fetchApi("/vslinx/csv_prompt_list");
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  const json = await res.json().catch(() => ({}));

  const files = Array.isArray(json?.files) ? json.files.slice() : [];
  let dirs = Array.isArray(json?.dirs) ? json.dirs.slice() : null;

  if (!dirs) {
    const set = new Set();
    for (const fRaw of files) {
      const f = String(fRaw ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (!f.includes("/")) continue;
      const parts = f.split("/").filter(Boolean);
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        set.add(acc);
      }
    }
    dirs = Array.from(set);
  }

  const normFiles = files
    .map((s) => String(s ?? "").replace(/\\/g, "/").replace(/^\/+/, ""))
    .filter(Boolean);

  const normDirs = dirs
    .map((s) => String(s ?? "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, ""))
    .filter(Boolean);

  return { files: normFiles, dirs: normDirs };
}

export async function createPromptFolder(path) {
  const p = String(path ?? "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!p) throw new Error("Folder path is empty.");

  const res = await api.fetchApi("/vslinx/csv_prompt_mkdir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: p }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Create folder failed (${res.status})`);
  return json;
}

const _vslinxCsvContentCache = new Map();

export function _vslinxInvalidateCsvCache(filename = null) {
  if (!filename) {
    _vslinxCsvContentCache.clear();
    return;
  }
  _vslinxCsvContentCache.delete(String(filename));
}

function _vslinxNorm(s) {
  return String(s ?? "").toLowerCase();
}

function _vslinxSplitCommaTokens(s) {
  return String(s ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

async function _vslinxGetFileDataCached(filename) {
  if (_vslinxCsvContentCache.has(filename)) return _vslinxCsvContentCache.get(filename);
  const data = await readPromptFile(filename);
  const norm = {
    labels: Array.isArray(data?.labels) ? data.labels.map(String) : [],
    map: (data?.map && typeof data.map === "object") ? data.map : {},
  };
  _vslinxCsvContentCache.set(filename, norm);
  return norm;
}

export async function _vslinxFindHitsInFile(filename, needleRaw) {
  const needle = _vslinxNorm(needleRaw).trim();
  if (!needle) return [];

  const data = await _vslinxGetFileDataCached(filename);

  const hits = [];
  const seen = new Set();

  for (const lab of (data.labels || [])) {
    const t = String(lab ?? "").trim();
    if (!t || t === "(None)" || t === "Random") continue;
    if (_vslinxNorm(t).includes(needle)) {
      const key = _vslinxNorm(t);
      if (!seen.has(key)) {
        seen.add(key);
        hits.push(t);
      }
    }
  }

  try {
    for (const [, v] of Object.entries(data.map || {})) {
      for (const tok of _vslinxSplitCommaTokens(v)) {
        if (_vslinxNorm(tok).includes(needle)) {
          const key = _vslinxNorm(tok);
          if (!seen.has(key)) {
            seen.add(key);
            hits.push(tok);
          }
        }
      }
    }
  } catch (_) {}

  return hits;
}