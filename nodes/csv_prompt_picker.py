import os
import io
import csv
import time
import random
import hashlib
from typing import Dict, List, Tuple, Optional, Any

import folder_paths
from aiohttp import web
from server import PromptServer

class AnyType(str):
    def __eq__(self, other) -> bool:
        return True

    def __ne__(self, other) -> bool:
        return False

any_type = AnyType("*")

class FlexibleOptionalInputType(dict):
    def __init__(self, type=any_type, data=None):
        super().__init__(data or {})
        self._default_type = type

    def __contains__(self, item):
        return True

    def __getitem__(self, item):
        if dict.__contains__(self, item):
            return dict.__getitem__(self, item)
        return (self._default_type,)

PROMPTFILES_SUBDIR = "csv"
_ALLOWED_EXTS = (".csv",)
_CACHE: Dict[str, Dict[str, object]] = {}

def get_promptfiles_dir() -> str:
    d = os.path.join(folder_paths.get_input_directory(), PROMPTFILES_SUBDIR)
    os.makedirs(d, exist_ok=True)
    return d

def sanitize_prompt_filename(name: str) -> str:
    name = os.path.basename((name or "").replace("\\", "/"))
    name = name.strip()
    low = name.lower()
    if not low.endswith(_ALLOWED_EXTS):
        raise ValueError("Only .csv files are allowed")
    name = "".join(ch for ch in name if ch.isprintable())
    if not name:
        raise ValueError("Invalid filename")
    return name

def sanitize_prompt_relpath(rel: str) -> str:
    rel = (rel or "").replace("\\", "/").strip()
    rel = "".join(ch for ch in rel if ch.isprintable())
    if not rel:
        raise ValueError("Invalid filename")

    if rel.startswith("/") or rel.startswith("\\"):
        raise ValueError("Invalid filename")

    head = rel.split("/")[0]
    if ":" in head:
        raise ValueError("Invalid filename")

    norm = os.path.normpath(rel).replace("\\", "/")
    if norm in (".", ""):
        raise ValueError("Invalid filename")

    parts = [p for p in norm.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise ValueError("Invalid filename")

    cleaned = "/".join(parts).strip()
    low = cleaned.lower()
    if not low.endswith(_ALLOWED_EXTS):
        raise ValueError("Only .csv files are allowed")

    if not cleaned:
        raise ValueError("Invalid filename")

    return cleaned

def sanitize_folder_relpath(rel: str) -> str:
    rel = (rel or "").replace("\\", "/").strip()
    rel = "".join(ch for ch in rel if ch.isprintable())

    if not rel:
        raise ValueError("Invalid folder name")

    if rel.startswith("/") or rel.startswith("\\"):
        raise ValueError("Invalid folder name")

    head = rel.split("/")[0]
    if ":" in head:
        raise ValueError("Invalid folder name")

    norm = os.path.normpath(rel).replace("\\", "/")
    if norm in (".", ""):
        raise ValueError("Invalid folder name")

    parts = [p for p in norm.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise ValueError("Invalid folder name")

    cleaned = "/".join(parts).strip().rstrip("/")
    if not cleaned:
        raise ValueError("Invalid folder name")

    return cleaned

def sanitize_folder_relpath_allow_empty(rel: str) -> str:
    rel = (rel or "").replace("\\", "/").strip()
    rel = "".join(ch for ch in rel if ch.isprintable())
    if not rel:
        return ""
    return sanitize_folder_relpath(rel)

def try_decode_bytes(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "gb18030", "gbk"):
        try:
            return data.decode(enc)
        except Exception:
            pass
    return data.decode("utf-8", errors="replace")

def parse_csv_labels_map(path: str) -> Tuple[List[str], Dict[str, str]]:
    with open(path, "rb") as f:
        raw = f.read()

    text = try_decode_bytes(raw)
    sio = io.StringIO(text)

    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
    except Exception:
        dialect = csv.excel

    reader = csv.reader(sio, dialect)
    labels: List[str] = []
    mapping: Dict[str, str] = {}

    for row in reader:
        if not row or len(row) < 2:
            continue
        label = str(row[0]).strip()
        out = str(row[1]).strip()
        if not label:
            continue
        if label not in mapping:
            labels.append(label)
        mapping[label] = out

    return labels, mapping

def parse_promptfile_labels_map(path: str) -> Tuple[List[str], Dict[str, str]]:
    low = path.lower()
    if low.endswith(".csv"):
        return parse_csv_labels_map(path)
    raise ValueError("Unsupported file type")

def get_cached_promptfile(filename: str) -> Tuple[List[str], Dict[str, str]]:
    folder = get_promptfiles_dir()
    path = os.path.join(folder, filename)

    st = os.stat(path)
    mtime = st.st_mtime

    cached = _CACHE.get(filename)
    if cached and cached.get("mtime") == mtime:
        return cached["labels"], cached["map"]

    labels, mapping = parse_promptfile_labels_map(path)
    _CACHE[filename] = {"mtime": mtime, "labels": labels, "map": mapping}
    return labels, mapping

def sha256_bytes(data: bytes) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()

def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def invalidate_file_caches(filename: str):
    _CACHE.pop(filename, None)

def suggest_copy_name(original_filename: str) -> str:
    folder = get_promptfiles_dir()
    base, ext = os.path.splitext(original_filename)
    n = 1
    while True:
        candidate = f"{base} ({n}){ext}"
        if not os.path.exists(os.path.join(folder, candidate)):
            return candidate
        n += 1

def ensure_unique_name(preferred_filename: str) -> str:
    folder = get_promptfiles_dir()
    preferred_path = os.path.join(folder, preferred_filename)
    if not os.path.exists(preferred_path):
        return preferred_filename
    return suggest_copy_name(preferred_filename)

def find_existing_filename_by_hash_in_dir(content_hash: str, rel_dir: str) -> Optional[str]:
    folder = get_promptfiles_dir()
    rel_dir = (rel_dir or "").replace("\\", "/").strip().strip("/")

    if not rel_dir:
        try:
            for fn in os.listdir(folder):
                low = fn.lower()
                if not low.endswith(_ALLOWED_EXTS):
                    continue
                full = os.path.join(folder, fn)
                if not os.path.isfile(full):
                    continue
                try:
                    if sha256_file(full) == content_hash:
                        return fn
                except Exception:
                    continue
        except Exception:
            pass
        return None

    base = os.path.join(folder, rel_dir)
    if not os.path.isdir(base):
        return None

    try:
        for root, _, filenames in os.walk(base):
            for fn in filenames:
                low = fn.lower()
                if not low.endswith(_ALLOWED_EXTS):
                    continue
                full = os.path.join(root, fn)
                if not os.path.isfile(full):
                    continue
                try:
                    if sha256_file(full) == content_hash:
                        rel = os.path.relpath(full, folder).replace("\\", "/")
                        if rel.startswith("./"):
                            rel = rel[2:]
                        return rel
                except Exception:
                    continue
    except Exception:
        pass
    return None

@PromptServer.instance.routes.post("/vslinx/csv_prompt_mkdir")
async def vslinx_csv_prompt_mkdir(request: web.Request):
    try:
        data = await request.json()
    except Exception:
        data = {}

    raw = str((data or {}).get("path", "") or "").strip()
    try:
        rel = sanitize_folder_relpath(raw)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)

    folder = get_promptfiles_dir()
    abs_path = os.path.join(folder, rel)

    try:
        os.makedirs(abs_path, exist_ok=True)
        return web.json_response({"ok": True, "path": rel})
    except Exception as e:
        return web.json_response({"error": f"Create folder failed: {e}"}, status=500)

@PromptServer.instance.routes.post("/vslinx/csv_prompt_upload")
async def vslinx_csv_prompt_upload(request: web.Request):
    reader = await request.multipart()

    mode = "auto"
    rename_to = None
    original_filename = None
    data = None
    target_dir = ""

    async for part in reader:
        if part.name == "mode":
            mode = (await part.text()).strip() or "auto"
        elif part.name == "rename_to":
            rename_to = (await part.text()).strip() or None
        elif part.name in ("target_dir", "dir", "folder", "subdir"):
            target_dir = (await part.text()).strip() or ""
        elif part.name == "file":
            try:
                original_filename = sanitize_prompt_filename(part.filename or "uploaded.csv")
            except Exception as e:
                return web.json_response({"error": str(e)}, status=400)

            try:
                data = await part.read(decode=False)
            except Exception as e:
                return web.json_response({"error": f"Failed to read upload: {e}"}, status=500)

    if original_filename is None or data is None:
        return web.json_response({"error": "Missing form field 'file'."}, status=400)

    folder = get_promptfiles_dir()

    try:
        rel_dir = sanitize_folder_relpath_allow_empty(target_dir)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)

    content_hash = sha256_bytes(data)

    existing_same = find_existing_filename_by_hash_in_dir(content_hash, rel_dir)
    if existing_same:
        return web.json_response({"filename": existing_same, "deduped": True})

    target_name = f"{rel_dir}/{original_filename}" if rel_dir else original_filename
    target_path = os.path.join(folder, target_name)

    def save_to(path: str):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)

    if mode == "auto":
        if not os.path.exists(target_path):
            try:
                save_to(target_path)
                invalidate_file_caches(target_name)
            except Exception as e:
                return web.json_response({"error": f"Failed to save file: {e}"}, status=500)
            return web.json_response({"filename": target_name, "deduped": False})

        try:
            if sha256_file(target_path) == content_hash:
                return web.json_response({"filename": target_name, "deduped": True})
        except Exception:
            pass

        return web.json_response(
            {"error": "NAME_CONFLICT", "filename": target_name, "suggested": suggest_copy_name(target_name)},
            status=409,
        )

    if mode == "overwrite":
        try:
            save_to(target_path)
            invalidate_file_caches(target_name)
        except Exception as e:
            return web.json_response({"error": f"Failed to overwrite file: {e}"}, status=500)
        return web.json_response({"filename": target_name, "deduped": False, "overwritten": True})

    if mode == "rename":
        final_name = target_name
        if rename_to:
            try:
                safe_base = sanitize_prompt_filename(rename_to)
                final_name = f"{rel_dir}/{safe_base}" if rel_dir else safe_base
            except Exception:
                final_name = target_name

        final_name = ensure_unique_name(final_name)
        final_path = os.path.join(folder, final_name)

        try:
            save_to(final_path)
            invalidate_file_caches(final_name)
        except Exception as e:
            return web.json_response({"error": f"Failed to save file: {e}"}, status=500)

        return web.json_response({"filename": final_name, "deduped": False})

    return web.json_response({"error": f"Invalid mode '{mode}'"}, status=400)

@PromptServer.instance.routes.get("/vslinx/csv_prompt_read")
async def vslinx_csv_prompt_read(request: web.Request):
    filename = request.rel_url.query.get("filename", "")

    try:
        filename = sanitize_prompt_relpath(filename)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)

    try:
        labels, mapping = get_cached_promptfile(filename)
        return web.json_response({"labels": labels, "map": mapping})
    except FileNotFoundError:
        return web.json_response({"error": "File not found."}, status=404)
    except Exception as e:
        return web.json_response({"error": f"Failed to parse file: {e}"}, status=500)

@PromptServer.instance.routes.get("/vslinx/csv_prompt_list")
async def vslinx_csv_prompt_list(request: web.Request):
    folder = get_promptfiles_dir()
    try:
        files: List[str] = []
        dirs: List[str] = []

        for root, dirnames, filenames in os.walk(folder):
            rel_dir = os.path.relpath(root, folder).replace("\\", "/")
            if rel_dir.startswith("./"):
                rel_dir = rel_dir[2:]
            if rel_dir != "." and rel_dir != "":
                dirs.append(rel_dir)

            for fn in filenames:
                low = fn.lower()
                if not low.endswith(_ALLOWED_EXTS):
                    continue
                full = os.path.join(root, fn)
                if not os.path.isfile(full):
                    continue
                rel = os.path.relpath(full, folder).replace("\\", "/")
                if rel.startswith("./"):
                    rel = rel[2:]
                if rel:
                    files.append(rel)

        files = sorted(set(files), key=lambda s: s.lower())
        dirs = sorted(set(dirs), key=lambda s: s.lower())

        return web.json_response({"files": files, "dirs": dirs})
    except Exception as e:
        return web.json_response({"error": f"Failed to list files: {e}"}, status=500)

def _normalize_selected_keys(row: Dict[str, Any]) -> List[str]:
    key = row.get("key", None)
    keys = row.get("keys", None)

    selected: List[Any] = []

    if isinstance(keys, (list, tuple)) and len(keys) > 0:
        selected = list(keys)
    elif isinstance(key, (list, tuple)) and len(key) > 0:
        selected = list(key)
    elif isinstance(key, str):
        selected = [key]
    elif key is not None:
        selected = [str(key)]

    out: List[str] = []
    for k in selected:
        if k is None:
            continue
        s = str(k).strip()
        if not s or s == "(None)":
            continue
        out.append(s)
    return out

def _boolish(v: Any, default: bool = True) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = str(v).strip().lower()
    if s in ("0", "false", "no", "off", "disabled"):
        return False
    if s in ("1", "true", "yes", "on", "enabled"):
        return True
    return default


def _ensure_trailing_comma_if_enabled(text: str, join_comma: bool) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    if not join_comma:
        return t
    if t.rstrip().endswith((",", "，")):
        return t.rstrip()
    return t.rstrip() + ","

class VSLinx_MultiLangPromptPicker:
    CATEGORY = "vsLinx/utility"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("prompt", "selection_preview", "output_preview")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "display": "seed"}),
            },
            "optional": FlexibleOptionalInputType(
                type=any_type,
                data={
                    "pre_prompt": ("STRING", {"forceInput": True}),
                    "pre_selection": ("STRING", {"forceInput": True}),
                    "pre_preview": ("STRING", {"forceInput": True}),
                },
            ),
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        if kwargs.get("control_after_generate") == "randomize":
            return hash(time.time_ns())
        return None

    def run(self, **kwargs):
        seed = int(kwargs.get("seed", 0))
        control_after_generate = kwargs.get("control_after_generate", "fixed")

        def _as_clean_str(v: Any) -> str:
            if v is None:
                return ""
            if not isinstance(v, str):
                v = str(v)
            return v.strip()

        pre_prompt = _as_clean_str(kwargs.get("pre_prompt", ""))
        pre_selection = _as_clean_str(kwargs.get("pre_selection", ""))
        pre_preview = _as_clean_str(kwargs.get("pre_preview", ""))

        if control_after_generate == "randomize":
            eff_seed = time.time_ns() & 0xFFFFFFFFFFFFFFFF
        elif control_after_generate == "increment":
            eff_seed = (seed + 1) & 0xFFFFFFFFFFFFFFFF
        elif control_after_generate == "decrement":
            eff_seed = (seed - 1) & 0xFFFFFFFFFFFFFFFF
        else:
            eff_seed = seed

        rng = random.Random(eff_seed)

        items = []
        for k, v in kwargs.items():
            if not (isinstance(k, str) and k.lower().startswith("csv_")):
                continue
            if not isinstance(v, dict):
                continue

            vtype = v.get("type")
            if vtype not in ("CsvRowWidget", "ExtraPromptWidget"):
                continue

            order = v.get("order", 0)
            try:
                order = int(order)
            except Exception:
                order = 0

            items.append((order, k, v))

        items.sort(key=lambda t: (t[0], t[1]))

        final_parts: List[str] = []
        sel_preview_lines: List[str] = []
        out_preview_lines: List[str] = []

        for _, _, v in items:
            vtype = v.get("type")

            join_comma = _boolish(v.get("join_comma", True), default=True)

            if vtype == "CsvRowWidget":
                filename = v.get("file")
                if not filename or not isinstance(filename, str):
                    continue

                try:
                    filename = sanitize_prompt_relpath(filename)
                    labels, mapping = get_cached_promptfile(filename)
                except Exception:
                    continue

                if not labels:
                    continue

                selected_keys = _normalize_selected_keys(v)
                if not selected_keys:
                    continue

                for original_key in selected_keys:
                    key = original_key
                    if key == "Random":
                        key = rng.choice(labels)

                    out = mapping.get(key, "")
                    if out and isinstance(out, str) and out.strip():
                        out_clean = _ensure_trailing_comma_if_enabled(out, join_comma)
                        if out_clean:
                            final_parts.append(out_clean)
                            sel_preview_lines.append(f"🔀 {key}" if original_key == "Random" else f"🧾 {key}")
                            out_preview_lines.append(f"💬 {out_clean}")

                continue

            if vtype == "ExtraPromptWidget":
                text = v.get("text", "")
                if not isinstance(text, str):
                    text = str(text)
                text = text.strip()
                if not text:
                    continue

                text_clean = _ensure_trailing_comma_if_enabled(text, join_comma)
                if not text_clean:
                    continue

                final_parts.append(text_clean)

                sel_preview_lines.append("📝 Additional prompt")
                first_line = text_clean.splitlines()[0].strip() if text_clean.splitlines() else text_clean
                if len(first_line) > 120:
                    first_line = first_line[:117] + "..."
                out_preview_lines.append(f"💬 {first_line}")

        prompt_body = " ".join([p for p in final_parts if isinstance(p, str) and p.strip()]).strip()

        if pre_prompt and prompt_body:
            prompt = pre_prompt.rstrip() + " " + prompt_body
        elif pre_prompt:
            prompt = pre_prompt
        else:
            prompt = prompt_body

        node_selection_text = "\n".join(sel_preview_lines) if sel_preview_lines else "No selections"
        node_preview_text = "\n".join(out_preview_lines) if out_preview_lines else "No output"

        if pre_selection:
            selection_preview = pre_selection.rstrip() + ("\n" + node_selection_text if node_selection_text else "")
        else:
            selection_preview = node_selection_text

        if pre_preview:
            output_preview = pre_preview.rstrip() + ("\n" + node_preview_text if node_preview_text else "")
        else:
            output_preview = node_preview_text

        return (
            prompt,
            selection_preview,
            output_preview,
        )

NODE_CLASS_MAPPINGS = {
    "vsLinx_MultiLangPromptPicker": VSLinx_MultiLangPromptPicker,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_MultiLangPromptPicker": "Multi-Language CSV Prompt Picker",
}