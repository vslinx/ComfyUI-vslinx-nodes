import { api } from "/scripts/api.js";

export async function uploadPromptFile(file, mode = "auto", rename_to = null) {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  if (rename_to) form.append("rename_to", rename_to);
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

const _vslinxCsvContentCache = new Map();

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
  } catch (_) { }

  return hits;
}